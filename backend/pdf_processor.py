import fitz
import string
import json
import os
from nltk.corpus import stopwords
import joblib
import pandas as pd
from sklearn.impute import SimpleImputer
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm
from datetime import datetime
import numpy as np

class PDFProcessor:
    def __init__(self, model_path=None):
        self.stop_words = set(stopwords.words('english'))
        # Initialize sentence transformer for embeddings
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        
        # Load pretrained heading detection model if available
        self.heading_model = None
        self.label_encoder = None
        self.feature_names = None
        
        if model_path and os.path.exists(model_path):
            try:
                model_data = joblib.load(model_path)
                if isinstance(model_data, dict):
                    # New format with model, label_encoder, and feature_names
                    self.heading_model = model_data['model']
                    self.label_encoder = model_data.get('label_encoder')
                    self.feature_names = model_data.get('feature_names')
                    print(f"Loaded pretrained heading model from {model_path}")
                else:
                    # Old format - just the model
                    self.heading_model = model_data
                    print(f"Loaded pretrained heading model (old format) from {model_path}")
            except Exception as e:
                print(f"Warning: Could not load heading model from {model_path}: {e}")
        else:
            print(f"Model path not found: {model_path}")
            print("Will use heuristic-based heading detection")
        
    def smart_join_lines(self, lines):
        """Join lines intelligently"""
        joined = []
        for i, line in enumerate(lines):
            if i == 0:
                joined.append(line)
            else:
                if joined[-1].endswith(' ') or line.startswith(' '):
                    joined.append(line)
                else:
                    joined.append(' ' + line)
        return ''.join(joined).strip()

    def extract_features_from_pdf(self, pdf_path):
        """Extract features from PDF using PyMuPDF"""
        doc = fitz.open(pdf_path)
        all_font_sizes_doc = []
        all_text_blocks_raw = []

        for page_num, page in enumerate(doc):
            page_height = page.rect.height
            page_width = page.rect.width
            blocks = page.get_text("dict")['blocks']

            # Font sizes for the page
            page_font_sizes = []
            for b in blocks:
                if b['type'] == 0:
                    for line in b['lines']:
                        for span in line['spans']:
                            page_font_sizes.append(round(span['size'], 2))
            max_font_size_page = max(page_font_sizes) if page_font_sizes else 1.0

            page_blocks = []
            for b_idx, b in enumerate(blocks):
                if b['type'] != 0:
                    continue

                # Skip tables
                is_table_block = False
                if len(b['lines']) > 1:
                    x_coords = [line['spans'][0]['origin'][0] for line in b['lines'] if line['spans']]
                    if len(set(round(x, 1) for x in x_coords)) > 1:
                        is_table_block = True
                if is_table_block:
                    continue

                # Extract text lines
                line_texts = []
                underline_present = False
                for line in b['lines']:
                    text_line = ""
                    for span in line['spans']:
                        text_line += span['text']
                        if span['flags'] & 4:
                            underline_present = True
                    if text_line.strip():
                        line_texts.append(text_line)

                if not line_texts:
                    continue

                combined_text = self.smart_join_lines(line_texts)

                first_span = b['lines'][0]['spans'][0]
                font_size = round(first_span['size'], 2)
                is_bold = bool(first_span['flags'] & 16)

                all_font_sizes_doc.append(font_size)

                block_data = {
                    "text": combined_text,
                    "font_size": font_size,
                    "bbox": b['bbox'],
                    "page_num": page_num,
                    "page_height": page_height,
                    "page_width": page_width,
                    "max_font_size_page": max_font_size_page,
                    "is_bold": is_bold,
                    "is_underlined": underline_present,
                    "block_index": b_idx,
                }
                all_text_blocks_raw.append(block_data)
                page_blocks.append(block_data)

            # Add spacing info
            for i, block in enumerate(page_blocks):
                block['space_above'] = (block['bbox'][1] - (page_blocks[i-1]['bbox'][3] if i > 0 else 0))
                block['space_below'] = ((page_blocks[i+1]['bbox'][1] if i < len(page_blocks)-1 else page_height) - block['bbox'][3])

        max_font_size_pdf = max(all_font_sizes_doc) if all_font_sizes_doc else 1.0

        processed_data = []
        for block in all_text_blocks_raw:
            text = block['text']
            words = text.strip().split()
            font_size_relative_to_max_pdf = block['font_size'] / max_font_size_pdf
            font_size_relative_to_max_page = block['font_size'] / block['max_font_size_page']
            punctuation_char = text.strip()[-1] if text.strip() and text.strip()[-1] in string.punctuation else "NULL"

            processed_data.append({
                "text": text,
                "font_size_relative_to_max_pdf": font_size_relative_to_max_pdf,
                "font_size_relative_to_max_page": font_size_relative_to_max_page,
                "is_bold": block['is_bold'],
                "num_words": len(words),
                "punctuation": punctuation_char,
                "x_pos_relative": block['bbox'][0] / block['page_width'],
                "y_pos_relative": block['bbox'][1] / block['page_height'],
                "page_no": block['page_num'],
                "title_case_ratio": sum(1 for w in words if w and w[0].isupper()) / len(words) if words else 0,
                "stopword_ratio": sum(1 for w in words if w.lower() in self.stop_words) / len(words) if words else 0,
                "space_above": block['space_above'] / block['page_height'],
                "space_below": block['space_below'] / block['page_height'],
                "is_underlined": block['is_underlined']
            })
        
        doc.close()
        return processed_data

    def predict_headings_with_model(self, input_data):
        """Predict headings using pretrained model"""
        if not self.heading_model:
            return self.predict_headings_simple(input_data)
        
        try:
            df = pd.DataFrame(input_data)

            # One-hot encode punctuation
            df['punctuation'] = df['punctuation'].astype(str)
            df = pd.get_dummies(df, columns=['punctuation'], drop_first=False)

            # Get expected columns from model
            expected_cols = None
            if self.feature_names:
                expected_cols = self.feature_names
            else:
                expected_cols = getattr(self.heading_model, "feature_names_", None) or getattr(self.heading_model, "feature_names_in_", None)
            
            if expected_cols is None:
                raise AttributeError("Model has no feature_names_ or feature_names_in_ attributes.")

            # Add missing columns
            for col in expected_cols:
                if col not in df.columns:
                    df[col] = 0
            
            # Ensure we have all expected columns in the right order
            missing_cols = set(expected_cols) - set(df.columns)
            for col in missing_cols:
                df[col] = 0
            df = df[expected_cols]

            # Handle missing values
            if df.isnull().values.any():
                df = pd.DataFrame(SimpleImputer(strategy='constant', fill_value=0).fit_transform(df), columns=df.columns)

            # Make predictions
            predictions = self.heading_model.predict(df)
            
            # Decode predictions
            if self.label_encoder:
                pred_levels = self.label_encoder.inverse_transform(predictions)
            else:
                # Fallback for old format models
                CLASS_NAMES = ['H1', 'H2', 'H3', 'None', 'Title']
                pred_levels = [CLASS_NAMES[int(np.ravel([p])[0])] for p in predictions]

            # Build outline and title
            outline = []
            title_text = ""
            
            for item, level in zip(input_data, pred_levels):
                if level == "Title":
                    title_text += item["text"] + " "
                elif level not in ["None"]:
                    outline.append({
                        "level": level,
                        "text": item["text"],
                        "page": item["page_no"] + 1
                    })

            return {"title": title_text.strip(), "outline": outline}
            
        except Exception as e:
            print(f"Error in model prediction: {e}, falling back to simple heuristics")
            return self.predict_headings_simple(input_data)

    def predict_headings_simple(self, input_data):
        """Simple heading prediction based on font size and formatting (fallback)"""
        outline = []
        title_text = ""
        
        # Sort by page number and position
        sorted_data = sorted(input_data, key=lambda x: (x['page_no'], x['y_pos_relative']))
        
        for item in sorted_data:
            text = item['text']
            font_size_ratio = item['font_size_relative_to_max_pdf']
            is_bold = item['is_bold']
            num_words = item['num_words']
            
            # Simple heuristics for heading detection
            if font_size_ratio > 0.8 and is_bold and num_words <= 10:
                level = "H1"
            elif font_size_ratio > 0.6 and (is_bold or num_words <= 15):
                level = "H2"
            elif font_size_ratio > 0.5 and num_words <= 20:
                level = "H3"
            else:
                level = "None"
            
            # Title detection (usually first few lines with large font)
            if item['page_no'] == 0 and item['y_pos_relative'] < 0.1 and font_size_ratio > 0.9:
                title_text = text
                continue
            
            if level != "None":
                outline.append({
                    "level": level,
                    "text": text,
                    "page": item['page_no'] + 1
                })
        
        return {"title": title_text.strip(), "outline": outline}

    def extract_text_for_heading(self, doc, heading, next_heading=None):
        """Extract text content for a specific heading"""
        start_page = heading['page'] - 1
        end_page = (next_heading['page'] - 1) if next_heading else (len(doc) - 1)
        full_text = ""
        heading_found = False
        
        for page_num in range(start_page, end_page + 1):
            page = doc.load_page(page_num)
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                for line in block.get("lines", []):
                    line_text = "".join(span["text"] for span in line["spans"])
                    if not heading_found and heading['text'].lower() in line_text.lower():
                        heading_found = True
                        continue
                    if heading_found:
                        if next_heading and next_heading['text'].lower() in line_text.lower():
                            return full_text.strip()
                        full_text += line_text + " "
        return full_text.strip()

    def extract_sections_with_content(self, pdf_path, outline):
        """Extract all sections with their content and precompute embeddings"""
        doc = fitz.open(pdf_path)
        sections = []
        
        for i in range(len(outline)):
            curr = outline[i]
            nxt = outline[i+1] if i < len(outline)-1 else None
            content = self.extract_text_for_heading(doc, curr, nxt)
            
            if content:
                # Create section text for embedding
                section_text = f"{curr['text']}. {content}"
                
                # Precompute embedding
                embedding = self.model.encode([section_text])[0]
                
                sections.append({
                    "section_title": curr['text'],
                    "page_number": curr['page'],
                    "level": curr['level'],
                    "content": content,
                    "embedding": embedding.tolist(),  # Convert numpy array to list for JSON serialization
                    "section_text": section_text
                })
        
        doc.close()
        return sections

    def process_pdf(self, pdf_path):
        """Main method to process PDF and return comprehensive JSON structure with precomputed embeddings"""
        try:
            # Extract features
            features = self.extract_features_from_pdf(pdf_path)
            
            # Predict headings using model or fallback to heuristics
            json_data = self.predict_headings_with_model(features)
            
            # Extract sections with content and precompute embeddings
            sections = self.extract_sections_with_content(pdf_path, json_data['outline'])
            
            # Add comprehensive metadata
            json_data['metadata'] = {
                'filename': os.path.basename(pdf_path),
                'processed_at': datetime.now().isoformat(),
                'total_blocks': len(features),
                'total_sections': len(sections),
                'model_used': 'pretrained' if self.heading_model else 'heuristic'
            }
            
            # Add precomputed sections with embeddings
            json_data['sections'] = sections
            
            # Add full text for global search
            full_text = " ".join([section['content'] for section in sections])
            json_data['full_text'] = full_text
            json_data['full_text_embedding'] = self.model.encode([full_text])[0].tolist()
            
            return json_data
            
        except Exception as e:
            raise Exception(f"Error processing PDF {pdf_path}: {str(e)}")
