# API Dockerfile — Dia TTS FastAPI server
# Build:  docker build -t dia-api api/
# Run:    docker run --rm -p 8000:8000 dia-api

FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    gosu \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 appuser && \
    mkdir -p /app/tmp/uploads /app/tmp/outputs \
             /app/models/cache && \
    chown -R appuser:appuser /app && \
    chmod -R 755 /app/models

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
COPY api/entrypoint.sh /entrypoint.sh

RUN chown -R appuser:appuser /app && \
    chmod +x /entrypoint.sh

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    HF_HOME=/app/models/cache \
    TRANSFORMERS_CACHE=/app/models/cache \
    HF_HUB_CACHE=/app/models/cache/hub \
    DIA_HOST=0.0.0.0 \
    DIA_PORT=8000 \
    DIA_UPLOAD_DIR=/app/tmp/uploads \
    DIA_OUTPUT_DIR=/app/tmp/outputs

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "-m", "api.run"]
