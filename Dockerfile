# Multi-stage build for PDF Analyzer Application
FROM node:18-alpine AS frontend-builder

# Set working directory for frontend
WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source code
COPY frontend/ ./

# Build frontend
RUN npm run build

# Python backend stage
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir huggingface-hub==0.16.4
RUN pip install --no-cache-dir -r requirements.txt

# Download NLTK data
RUN python -c "import nltk; nltk.download('stopwords'); nltk.download('punkt')"

# Pre-download sentence transformers model to avoid runtime downloads
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Copy backend source code
COPY backend/ .

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/dist ./static

# Create necessary directories
RUN mkdir -p pdfs json models

# Copy model files if they exist
COPY backend/models/ ./models/

# Expose port 8080
EXPOSE 8080

# Set environment variables
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PORT=8080

# Create a startup script
RUN echo '#!/bin/bash\n\
# Set up environment variables from Docker run command\n\
if [ -n "$LLM_PROVIDER" ]; then\n\
    export LLM_PROVIDER=$LLM_PROVIDER\n\
fi\n\
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then\n\
    export GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS\n\
fi\n\
if [ -n "$GEMINI_MODEL" ]; then\n\
    export GEMINI_MODEL=$GEMINI_MODEL\n\
fi\n\
if [ -n "$ADOBE_EMBED_API_KEY" ]; then\n\
    export ADOBE_EMBED_API_KEY=$ADOBE_EMBED_API_KEY\n\
fi\n\
if [ -n "$TTS_PROVIDER" ]; then\n\
    export TTS_PROVIDER=$TTS_PROVIDER\n\
fi\n\
if [ -n "$AZURE_TTS_KEY" ]; then\n\
    export AZURE_TTS_KEY=$AZURE_TTS_KEY\n\
fi\n\
if [ -n "$AZURE_TTS_ENDPOINT" ]; then\n\
    export AZURE_TTS_ENDPOINT=$AZURE_TTS_ENDPOINT\n\
fi\n\
\n\
# Clean PDF and JSON folders on startup\n\
echo "🧹 Cleaning previous session data..."\n\
rm -rf /app/pdfs/*\n\
rm -rf /app/json/*\n\
echo "✅ Cleaned previous session data"\n\
\n\
# Start the Flask application on port 8080\n\
python app.py --host 0.0.0.0 --port 8080\n\
' > /app/start.sh && chmod +x /app/start.sh

# Start the application
CMD ["/app/start.sh"]
