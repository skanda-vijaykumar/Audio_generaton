from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """API configuration — override any field with DIA_ prefixed env vars."""

    model_name: str = "nari-labs/Dia-1.6B-0626"
    compute_dtype: str = "float16"
    device: str | None = None  # auto-detect: CUDA > MPS > CPU

    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    upload_dir: str = "./tmp/uploads"
    output_dir: str = "./tmp/outputs"
    max_upload_size_mb: int = 50

    # Generation defaults (optimized for CPU)
    max_tokens: int = 128  # Further reduced for much faster CPU generation
    cfg_scale: float = 2.0  # Reduced for faster inference
    temperature: float = 1.0
    top_p: float = 0.9
    cfg_filter_top_k: int = 20  # Reduced for faster inference

    model_config = {"env_prefix": "DIA_"}


settings = Settings()
