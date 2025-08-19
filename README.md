# PDF Analyzer with AI Insights

A powerful web application that analyzes PDF documents using AI to generate insights, find similar sections across multiple documents, and convert text to speech.

## Features

- **PDF Upload & Processing**: Upload multiple PDF files for analysis
- **AI-Powered Insights**: Generate key insights, facts, counterpoints, and podcast scripts using Google Gemini
- **Similarity Analysis**: Find similar sections across multiple documents
- **Text-to-Speech**: Convert generated content to audio using Azure TTS
- **Modern UI**: Beautiful React frontend with real-time progress tracking
- **Multi-Document Comparison**: Compare and analyze multiple PDFs simultaneously

## Technology Stack

- **Frontend**: React, Redux Toolkit, Tailwind CSS, Vite
- **Backend**: Flask, Python 3.11
- **AI/ML**: Google Gemini API, Sentence Transformers, scikit-learn, CatBoost
- **Text Processing**: NLTK, PyMuPDF
- **Text-to-Speech**: Azure TTS, gTTS
- **Containerization**: Docker

## Quick Start

### Build the Docker Image

```bash
docker build --platform linux/amd64 -t yourimageidentifier .
```

### Run with Google Application Credentials

```bash
docker run -v /path/to/credentials:/credentials \
  -e ADOBE_EMBED_API_KEY=<ADOBE_EMBED_API_KEY> \
  -e LLM_PROVIDER=gemini \
  -e GOOGLE_APPLICATION_CREDENTIALS=/credentials/adbe-gcp.json \
  -e GEMINI_MODEL=gemini-2.5-flash \
  -e TTS_PROVIDER=azure \
  -e AZURE_TTS_KEY=TTS_KEY \
  -e AZURE_TTS_ENDPOINT=TTS_ENDPOINT \
  -p 8080:8080 \
  yourimageidentifier
```

### Run with Gemini API Key

```bash
docker run -e ADOBE_EMBED_API_KEY=<ADOBE_EMBED_API_KEY> \
  -e LLM_PROVIDER=gemini \
  -e GEMINI_API_KEY=your_gemini_api_key_here \
  -e GEMINI_MODEL=gemini-2.5-flash \
  -e TTS_PROVIDER=azure \
  -e AZURE_TTS_KEY=TTS_KEY \
  -e AZURE_TTS_ENDPOINT=TTS_ENDPOINT \
  -p 8080:8080 \
  yourimageidentifier
```

### Access the Application

Once running, the web application will be accessible at:
- **http://localhost:8080/**

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ADOBE_EMBED_API_KEY` | Adobe Embed API key for PDF viewing | No* |
| `LLM_PROVIDER` | AI provider (set to "gemini") | Yes |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Google Cloud credentials file | Conditional* |
| `GEMINI_API_KEY` | Direct Gemini API key | Conditional* |
| `GEMINI_MODEL` | Gemini model to use (e.g., "gemini-2.5-flash") | Yes |
| `TTS_PROVIDER` | Text-to-speech provider (e.g., "azure") | Yes |
| `AZURE_TTS_KEY` | Azure TTS API key | Yes |
| `AZURE_TTS_ENDPOINT` | Azure TTS endpoint URL | Yes |

*Either `GOOGLE_APPLICATION_CREDENTIALS` or `GEMINI_API_KEY` is required. If neither is provided, a hardcoded fallback key will be used.
*`ADOBE_EMBED_API_KEY` is optional. If not provided, a hardcoded fallback key will be used.

## How It Works

### 1. PDF Upload & Processing
- Users upload multiple PDF files through the web interface
- The backend processes each PDF using PyMuPDF to extract text and structure
- A machine learning model identifies headings and sections
- Processed data is stored as JSON for further analysis

### 2. AI-Powered Analysis
- Users select text from any processed PDF
- The system finds similar sections across all uploaded documents using sentence embeddings
- Google Gemini generates four types of insights:
  - **Key Insights**: Main points and summaries
  - **Did You Know**: Interesting facts and lesser-known information
  - **Counterpoints**: Alternative perspectives and challenges
  - **Podcast Script**: Engaging 2-5 minute podcast content

### 3. Text-to-Speech
- Generated podcast scripts can be converted to audio
- Supports both Azure TTS (production) and gTTS (fallback)
- Audio is returned as base64-encoded data for immediate playback

### 4. Similarity Analysis
- Uses sentence transformers to find semantically similar content
- Compares selected text against all processed documents
- Returns ranked results with similarity scores

## API Endpoints

- `POST /api/upload` - Upload PDF files
- `POST /api/process` - Process uploaded PDFs
- `GET /api/status` - Get processing status
- `POST /api/similarity` - Find similar sections
- `POST /api/insights` - Generate AI insights
- `POST /api/tts` - Convert text to speech
- `GET /api/health` - Health check

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend│    │   Flask Backend │    │   AI Services   │
│                 │    │                 │    │                 │
│ - File Upload   │◄──►│ - PDF Processing│◄──►│ - Google Gemini │
│ - Progress UI   │    │ - ML Models     │    │ - Azure TTS     │
│ - Results Display│   │ - API Endpoints │    │ - Sentence      │
│ - Audio Player  │    │ - Static Files  │    │   Transformers  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Development

### Prerequisites
- Docker
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Local Development

1. **Backend Setup**:
   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```

2. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Docker Development

The application is fully containerized and ready for production deployment. The Dockerfile includes:

- Multi-stage build for optimized image size
- Pre-downloaded AI models to avoid runtime downloads
- Automatic cleanup of session data
- Environment variable handling
- Health checks and error handling

## Performance Optimizations

- **Pre-downloaded Models**: Sentence transformers and NLTK data downloaded at build time
- **Caching**: Similarity analysis results cached for better performance
- **Batch Processing**: Multiple PDFs processed efficiently
- **Memory Management**: Automatic cleanup of temporary files
- **Optimized Dependencies**: Compatible versions to avoid conflicts

## Security Features

- **File Validation**: Only PDF files accepted
- **Size Limits**: 16MB maximum file size
- **Secure Filenames**: Sanitized file names
- **Environment Variables**: Sensitive data passed via environment
- **CORS Configuration**: Proper cross-origin settings

## Troubleshooting

### Common Issues

1. **Model Download Errors**: Models are pre-downloaded during build
2. **Credential Issues**: Check environment variable configuration
3. **Port Conflicts**: Ensure port 8080 is available
4. **File Upload Errors**: Verify file format and size limits

### Logs

The application provides detailed logging for debugging:
- Environment variable status
- Model loading progress
- Processing status updates
- Error messages with context

## License

This project is developed for hackathon submission and demonstration purposes.
