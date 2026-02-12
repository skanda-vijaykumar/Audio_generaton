# API Dockerfile — Dia TTS FastAPI server
# Build:  docker build -t dia-api api/
# Run:    docker run --rm -p 8000:8000 dia-api

FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 appuser && \
    mkdir -p /app/tmp/uploads /app/tmp/outputs \
             /home/appuser/.cache/huggingface && \
    chown -R appuser:appuser /app /home/appuser/.cache

WORKDIR /app

# Install CPU-only PyTorch first (smaller image), then API deps.
# --extra-index-url lets torch deps (typing-extensions, jinja2 etc.) resolve from PyPI.
COPY api/requirements.txt /app/api/requirements.txt
RUN pip install --no-cache-dir \
    torch==2.6.0+cpu torchaudio==2.6.0+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r /app/api/requirements.txt

# Copy backend (the Dia model code) and API code
COPY backend/ /app/backend/
COPY api/ /app/api/

RUN chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    DIA_HOST=0.0.0.0 \
    DIA_PORT=8000 \
    DIA_UPLOAD_DIR=/app/tmp/uploads \
    DIA_OUTPUT_DIR=/app/tmp/outputs

EXPOSE 8000

CMD ["python", "-m", "api.run"]
