FROM python:3.11-slim

# Install system dependencies, curl, and procps (for pkill)
RUN apt-get update && apt-get install -y curl procps && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Configure Ollama models to reside inside a writable project subfolder
ENV OLLAMA_MODELS=/app/ollama/models

WORKDIR /app

# Copy and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend files
COPY . .

# Run Ollama briefly during build time, pull model, and clean up processes so it's baked into the image
RUN ollama serve & \
    sleep 5 && \
    ollama pull llama3.2:3b && \
    pkill ollama

# Expose port 7860 (Hugging Face default)
EXPOSE 7860

# Add executable permissions to start script
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
