import os
import json
import fitz
import string
import warnings
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from datetime import datetime
import uuid
import google.generativeai as genai
from dotenv import load_dotenv
from pdf_processor import PDFProcessor
from similarity_analyzer import SimilarityAnalyzer
from gtts import gTTS
import io
import base64

# Suppress specific warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="transformers.utils.generic")

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Configuration
app.config['PDFS_FOLDER'] = 'pdfs'
app.config['JSON_FOLDER'] = 'json'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Initialize Gemini API
# Priority: 1. GOOGLE_APPLICATION_CREDENTIALS, 2. GEMINI_API_KEY, 3. Hardcoded fallback
GOOGLE_APPLICATION_CREDENTIALS = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
ADOBE_EMBED_API_KEY = os.getenv('ADOBE_EMBED_API_KEY')

if GOOGLE_APPLICATION_CREDENTIALS:
    print(f"🔍 Using Google Application Credentials: {GOOGLE_APPLICATION_CREDENTIALS}")
    # Set the credentials file path for Google Cloud
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = GOOGLE_APPLICATION_CREDENTIALS
    # Use default credentials (will use the service account from the credentials file)
    genai.configure()
    gemini_model = genai.GenerativeModel('gemini-1.5-flash')
    print("✅ Gemini API configured with Google Application Credentials")
elif GEMINI_API_KEY:
    print(f"🔍 Using GEMINI_API_KEY environment variable")
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel('gemini-1.5-flash')
    print("✅ Gemini API configured with GEMINI_API_KEY")
else:
    print("⚠️  No credentials found, using hardcoded API key")
    # Hardcoded fallback API key
    GEMINI_API_KEY = "AIzaSyCafDqj5_GjujNQb-i1tmXdZ_Xlktx8scQ"
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel('gemini-1.5-flash')
    print("✅ Gemini API configured with hardcoded API key")

# Handle Adobe Embed API Key
if ADOBE_EMBED_API_KEY:
    print(f"🔍 Adobe Embed API Key: {'Found' if ADOBE_EMBED_API_KEY else 'Not found'}")
else:
    print("⚠️  ADOBE_EMBED_API_KEY not found, using hardcoded fallback")
    ADOBE_EMBED_API_KEY = "4262f000329a47a1ad50ae29a2022b35"  # Hardcoded fallback key

# Ensure directories exist
try:
    os.makedirs(app.config['PDFS_FOLDER'], exist_ok=True)
    os.makedirs(app.config['JSON_FOLDER'], exist_ok=True)
    print(f"Directories created/verified: {app.config['PDFS_FOLDER']}, {app.config['JSON_FOLDER']}")
except Exception as e:
    print(f"Error creating directories: {e}")

# Initialize processors
# Try to load pretrained model if available
model_path = os.path.join(os.path.dirname(__file__), 'models', 'catboost_smote_model.joblib')
if os.path.exists(model_path):
    print(f"🎯 Loading pretrained model from: {model_path}")
    pdf_processor = PDFProcessor(model_path=model_path)
else:
    print(f"⚠️  No pretrained model found at: {model_path}")
    print("📝 Will use heuristic-based heading detection")
    pdf_processor = PDFProcessor(model_path=None)

similarity_analyzer = SimilarityAnalyzer()

# Global progress tracking
processing_progress = {
    'is_processing': False,
    'total_files': 0,
    'processed_files': 0,
    'current_file': '',
    'status': 'idle'  # 'idle', 'processing', 'completed', 'error'
}

ALLOWED_EXTENSIONS = {'pdf'}

def get_uploaded_pdfs():
    """Get list of uploaded PDF files"""
    pdf_files = []
    try:
        if os.path.exists(app.config['PDFS_FOLDER']):
            for filename in os.listdir(app.config['PDFS_FOLDER']):
                if filename.lower().endswith('.pdf'):
                    pdf_files.append(filename)
    except Exception as e:
        print(f"Error reading PDFs folder: {e}")
    return sorted(pdf_files)

def get_processed_jsons():
    """Get list of processed JSON files"""
    json_files = []
    try:
        if os.path.exists(app.config['JSON_FOLDER']):
            for filename in os.listdir(app.config['JSON_FOLDER']):
                if filename.lower().endswith('.json'):
                    json_files.append(filename)
    except Exception as e:
        print(f"Error reading JSONs folder: {e}")
    return sorted(json_files)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/upload', methods=['POST'])
def upload_files():
    """Upload multiple PDF files"""
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    files = request.files.getlist('files')
    if not files or all(file.filename == '' for file in files):
        return jsonify({'error': 'No files selected'}), 400
    
    uploaded_files = []
    
    for file in files:
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['PDFS_FOLDER'], filename)
            
            # Ensure directory exists before saving
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            file.save(file_path)
            uploaded_files.append(filename)
    
    if uploaded_files:
        return jsonify({
            'files': uploaded_files,
            'message': f'Successfully uploaded {len(uploaded_files)} files'
        })
    
    return jsonify({'error': 'No valid files uploaded'}), 400

@app.route('/api/process', methods=['POST'])
def process_files():
    """Process all uploaded PDF files and generate JSON"""
    global processing_progress
    
    try:
        pdf_files = get_uploaded_pdfs()
        if not pdf_files:
            return jsonify({'error': 'No PDF files found to process'}), 400
        
        # Initialize progress tracking
        processing_progress.update({
            'is_processing': True,
            'total_files': len(pdf_files),
            'processed_files': 0,
            'current_file': '',
            'status': 'processing'
        })
        
        processed_files = []
        for i, filename in enumerate(pdf_files):
            try:
                # Update current file being processed
                processing_progress['current_file'] = filename
                
                pdf_path = os.path.join(app.config['PDFS_FOLDER'], filename)
                
                # Process PDF and generate JSON
                json_data = pdf_processor.process_pdf(pdf_path)
                
                # Save processed JSON
                json_filename = filename.replace('.pdf', '.json')
                json_path = os.path.join(app.config['JSON_FOLDER'], json_filename)
                
                # Ensure directory exists before saving
                os.makedirs(os.path.dirname(json_path), exist_ok=True)
                
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(json_data, f, indent=2, ensure_ascii=False)
                
                processed_files.append({
                    'original_file': filename,
                    'json_file': json_filename
                })
                
                # Update progress
                processing_progress['processed_files'] = i + 1
                
            except Exception as e:
                print(f"Error processing {filename}: {str(e)}")
                # Continue with next file even if one fails
        
        # Mark processing as completed
        processing_progress.update({
            'is_processing': False,
            'status': 'completed',
            'current_file': ''  # Clear current file when completed
        })
        
        # print(f"✅ Processing completed: {len(processed_files)} files processed")
        # print(f"📊 Final progress state: {processing_progress}")
        
        return jsonify({
            'status': 'completed',
            'processed_files': processed_files,
            'message': f'Successfully processed {len(processed_files)} files'
        })
        
    except Exception as e:
        # Mark processing as failed
        processing_progress.update({
            'is_processing': False,
            'status': 'error'
        })
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get current status of uploaded PDFs and processed JSONs"""
    pdf_files = get_uploaded_pdfs()
    json_files = get_processed_jsons()
    
    return jsonify({
        'pdf_files': pdf_files,
        'json_files': json_files,
        'total_pdfs': len(pdf_files),
        'total_jsons': len(json_files),
        'is_processed': len(pdf_files) == len(json_files) and len(pdf_files) > 0
    })

@app.route('/api/similarity', methods=['POST'])
def find_similar_sections():
    """Find similar sections based on selected text"""
    data = request.get_json()
    selected_text = data.get('selected_text')
    
    if not selected_text:
        return jsonify({'error': 'Selected text required'}), 400
    
    # Check if files are processed
    pdf_files = get_uploaded_pdfs()
    json_files = get_processed_jsons()
    
    if len(pdf_files) != len(json_files) or len(pdf_files) == 0:
        return jsonify({'error': 'Files not yet processed'}), 400
    
    try:
        # Prepare processed files info for similarity analyzer
        processed_files = []
        for json_file in json_files:
            pdf_file = json_file.replace('.json', '.pdf')
            if pdf_file in pdf_files:
                processed_files.append({
                    'original_file': pdf_file,
                    'json_file': json_file,
                    'json_path': os.path.join(app.config['JSON_FOLDER'], json_file)
                })
        
        # Find similar sections
        similar_sections = similarity_analyzer.find_similar_sections(
            selected_text, 
            processed_files,
            app.config['JSON_FOLDER']
        )
        
        return jsonify({
            'selected_text': selected_text,
            'similar_sections': similar_sections
        })
        
    except Exception as e:
        return jsonify({'error': f'Similarity analysis failed: {str(e)}'}), 500

@app.route('/api/files', methods=['GET'])
def get_files():
    """Get list of uploaded PDF files"""
    pdf_files = get_uploaded_pdfs()
    return jsonify({
        'files': pdf_files
    })

@app.route('/api/pdf/<filename>', methods=['GET'])
def serve_pdf(filename):
    """Serve PDF files"""
    return send_from_directory(app.config['PDFS_FOLDER'], filename)

@app.route('/api/progress', methods=['GET'])
def get_progress():
    """Get current processing progress"""
    global processing_progress
    
    # Calculate percentage
    percentage = 0
    if processing_progress['total_files'] > 0:
        percentage = int((processing_progress['processed_files'] / processing_progress['total_files']) * 100)
    
    response_data = {
        'is_processing': processing_progress['is_processing'],
        'total_files': processing_progress['total_files'],
        'processed_files': processing_progress['processed_files'],
        'current_file': processing_progress['current_file'],
        'status': processing_progress['status'],
        'percentage': percentage
    }
    
    # Debug logging
    if processing_progress['is_processing'] or processing_progress['status'] == 'completed':
        print(f"📈 Progress request: {response_data}")
    
    return jsonify(response_data)

@app.route('/api/insights', methods=['POST'])
def generate_insights():
    """Generate insights using Gemini 2.5 Flash based on selected text and similar sections"""
    
    data = request.get_json()
    selected_text = data.get('selected_text')
    
    if not selected_text:
        return jsonify({'error': 'Selected text required'}), 400
    
    try:
        # Get the top 15 most similar sections
        similar_sections = similarity_analyzer.find_similar_sections(
            selected_text, 
            get_processed_files_info(),
            app.config['JSON_FOLDER'],
            top_n=15
        )
        
        if not similar_sections:
            return jsonify({'error': 'No similar sections found'}), 400
        
        # Combine all similar section content
        combined_content = "\n\n".join([
            f"Section: {section['section_title']}\nContent: {section['content']}"
            for section in similar_sections
        ])
        
        # Create prompt for Gemini
        prompt = f"""
        You are a JSON only response generator.
        Based on the following selected text and similar content from multiple documents, generate four types of insights:

        SELECTED TEXT:
        {selected_text}

        SIMILAR CONTENT FROM DOCUMENTS:
        {combined_content}

        generate exactly four types of insights:

        1. KEY INSIGHTS: Provide 3-4 main insights that summarize the most important points related to the selected text.

        2. DID YOU KNOW FACTS: Provide 2-3 interesting facts or lesser-known information related to the selected text.

        3. COUNTERPOINTS: Provide 2-3 alternative perspectives, challenges, or opposing viewpoints related to the selected text.

        4. PODCAST SCRIPT: Create a 2-5 minute podcast script that covers the key points from the selected text and similar content. The script should be engaging, conversational, and well-structured with an introduction, main content, and conclusion.

        Format your response strictly as a JSON object with these exact keys:
        {{
            "key_insights": ["insight 1", "insight 2", "insight 3"],
            "did_you_know": ["fact 1", "fact 2"],
            "counterpoints": ["counterpoint 1", "counterpoint 2"],
            "podcast_script": "Your engaging 2-5 minute podcast script here..."
        }}

        Make sure each insight is concise, relevant, and directly related to the selected text and similar content. The podcast script should be comprehensive and engaging for listeners. Podcast will be directly given for TTS, so generate accordingly. Focus more on the selected text.
        Do not include stage directions like (Sound of ...), [Background music], or similar instructions in podcast script.
        """
        
        # Generate insights using Gemini
        # print(f"🔍 Prompt: {prompt}")
        response = gemini_model.generate_content(prompt)
        
        # Parse the response
        try:
            # Try to extract JSON from the response
            response_text = response.text
            # Find JSON in the response (in case there's extra text)
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}') + 1
            if start_idx != -1 and end_idx != 0:
                json_str = response_text[start_idx:end_idx]
                insights = json.loads(json_str)
            else:
                # Fallback: create a structured response
                insights = {
                    "key_insights": ["Analysis completed", "Content processed", "Insights generated"],
                    "did_you_know": ["AI-powered analysis", "Multi-document comparison"],
                    "counterpoints": ["Consider alternative sources", "Verify information independently"],
                    "podcast_script": "Welcome to today's insights podcast. We've analyzed the selected content and found several key points worth discussing. The analysis reveals important patterns and connections across multiple documents. Let's dive deeper into what we discovered and explore the implications. This comprehensive review provides valuable perspectives on the topic at hand."
                }
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            insights = {
                "key_insights": ["Analysis completed", "Content processed", "Insights generated"],
                "did_you_know": ["AI-powered analysis", "Multi-document comparison"],
                "counterpoints": ["Consider alternative sources", "Verify information independently"],
                "podcast_script": "Welcome to today's insights podcast. We've analyzed the selected content and found several key points worth discussing. The analysis reveals important patterns and connections across multiple documents. Let's dive deeper into what we discovered and explore the implications. This comprehensive review provides valuable perspectives on the topic at hand."
            }

        return jsonify({
            'selected_text': selected_text,
            'insights': insights,
            'similar_sections_count': len(similar_sections)
        })

    except Exception as e:
        return jsonify({'error': f'Insights generation failed: {str(e)}'}), 500

@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    """Convert text to speech using gTTS"""
    data = request.get_json()
    text = data.get('text')
    
    if not text:
        return jsonify({'error': 'Text required'}), 400
    
    try:
        # Create gTTS object
        tts = gTTS(text=text, lang='en', slow=False)
        
        # Save to bytes buffer
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        
        # Convert to base64 for sending to frontend
        audio_base64 = base64.b64encode(audio_buffer.read()).decode('utf-8')
        
        return jsonify({
            'audio': audio_base64,
            'text': text
        })
        
    except Exception as e:
        return jsonify({'error': f'TTS generation failed: {str(e)}'}), 500

def get_processed_files_info():
    """Helper function to get processed files info"""
    pdf_files = get_uploaded_pdfs()
    json_files = get_processed_jsons()
    
    processed_files = []
    for json_file in json_files:
        pdf_file = json_file.replace('.json', '.pdf')
        if pdf_file in pdf_files:
            processed_files.append({
                'original_file': pdf_file,
                'json_file': json_file,
                'json_path': os.path.join(app.config['JSON_FOLDER'], json_file)
            })
    
    return processed_files

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    pdf_files = get_uploaded_pdfs()
    json_files = get_processed_jsons()
    
    return jsonify({
        'status': 'healthy', 
        'timestamp': datetime.now().isoformat(),
        'pdfs_folder': app.config['PDFS_FOLDER'],
        'json_folder': app.config['JSON_FOLDER'],
        'pdf_files_count': len(pdf_files),
        'json_files_count': len(json_files),
        'pdf_files': pdf_files,
        'json_files': json_files
    })

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get configuration for frontend"""
    return jsonify({
        'adobe_client_id': ADOBE_EMBED_API_KEY
    })

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    """Serve the React frontend"""
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8080, help='Port to bind to')
    args = parser.parse_args()
    
    app.run(host=args.host, port=args.port, debug=False)
