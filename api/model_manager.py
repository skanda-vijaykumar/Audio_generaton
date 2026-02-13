from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING

# Ensure HuggingFace uses the correct cache directory
os.environ.setdefault("HF_HOME", "/app/models/cache")
os.environ.setdefault("TRANSFORMERS_CACHE", "/app/models/cache")
os.environ.setdefault("HF_HUB_CACHE", "/app/models/cache/hub")

import torch

if TYPE_CHECKING:
    from api.config import Settings


# Add backend/ to sys.path so `from dia.model import Dia` works
_backend_dir = str(Path(__file__).resolve().parent.parent / "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# Enable real-time download progress monitoring
import tqdm.std
from functools import partial

# Global progress tracking
_global_progress = {"current": 0.0, "stage": "idle", "files_total": 0, "files_completed": 0}

# Create a custom tqdm class that updates our global progress
class ModelDownloadProgress(tqdm.std.tqdm):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault('file', sys.stdout)
        kwargs.setdefault('leave', True)
        kwargs.setdefault('dynamic_ncols', True)
        super().__init__(*args, **kwargs)
        
        # Track file downloads
        if hasattr(self, 'desc') and self.desc:
            _global_progress["files_total"] += 1
    
    def __enter__(self):
        result = super().__enter__()
        if hasattr(self, 'desc') and self.desc:
            self.set_description(f"[model] {self.desc}")
            _global_progress["stage"] = f"Downloading {self.desc}"
        return result
    
    def update(self, n=1):
        result = super().update(n)
        if self.total and self.total > 0:
            # Calculate progress for this file
            file_progress = (self.n / self.total) * 100
            # Update global progress (simplified - could be more sophisticated)
            _global_progress["current"] = min(90, file_progress)
            if hasattr(ModelManager, '_instance') and ModelManager._instance:
                ModelManager._instance._download_progress = _global_progress["current"]
                ModelManager._instance._download_stage = _global_progress["stage"]
        return result
    
    def close(self):
        result = super().close()
        if hasattr(self, 'desc') and self.desc:
            _global_progress["files_completed"] += 1
            # Calculate overall progress
            if _global_progress["files_total"] > 0:
                overall_progress = (_global_progress["files_completed"] / _global_progress["files_total"]) * 90
                _global_progress["current"] = overall_progress
                if hasattr(ModelManager, '_instance') and ModelManager._instance:
                    ModelManager._instance._download_progress = overall_progress
        return result

# Replace the default tqdm with our custom one
tqdm.std.tqdm = ModelDownloadProgress
tqdm.tqdm = ModelDownloadProgress

# Enable huggingface_hub info logging
logging.getLogger("huggingface_hub").setLevel(logging.INFO)
_hf_handler = logging.StreamHandler(sys.stdout)
_hf_handler.setFormatter(logging.Formatter("[model] %(levelname)s: %(message)s"))
logging.getLogger("huggingface_hub").addHandler(_hf_handler)


class ModelManager:
    """Singleton that lazily loads the Dia model once."""

    _instance: ModelManager | None = None
    _model = None
    _device: torch.device | None = None
    _status: str = "idle"
    _error: str | None = None
    _download_progress: float = 0.0
    _download_stage: str = ""

    def __new__(cls) -> ModelManager:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    # ------------------------------------------------------------------
    def load_model(self, settings: Settings) -> None:
        if self._model is not None:
            return  # already loaded

        from dia.model import Dia

        # Resolve device
        if settings.device:
            device = torch.device(settings.device)
        elif torch.cuda.is_available():
            device = torch.device("cuda")
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = torch.device("mps")
        else:
            device = torch.device("cpu")

        # Resolve dtype — force float32 on CPU/MPS
        dtype_map = {"cpu": "float32", "mps": "float32", "cuda": "float16"}
        dtype = dtype_map.get(device.type, settings.compute_dtype)

        try:
            self._status = "loading"
            self._download_progress = 0.0
            self._download_stage = "Checking cache"
            
            # Check HuggingFace cache directory 
            cache_dir = "/app/models/cache"
            hub_cache_dir = "/app/models/cache/hub"
            print(f"[model] HuggingFace cache directory: {cache_dir}", flush=True)
            print(f"[model] Hub cache directory: {hub_cache_dir}", flush=True)
            print(f"[model] Cache directory exists: {os.path.exists(cache_dir)}", flush=True)
            
            # Check if model is already cached
            model_cached = False
            if os.path.exists(hub_cache_dir):
                model_dirs = [d for d in os.listdir(hub_cache_dir) if settings.model_name.replace("/", "--") in d]
                model_cached = len(model_dirs) > 0
                print(f"[model] Model cached: {model_cached}", flush=True)
                if model_cached:
                    print(f"[model] Found cached model directories: {model_dirs}", flush=True)
            
            if model_cached:
                print(f"[model] ✓ Loading model from cache ({settings.model_name})…", flush=True)
                self._status = "loading_cached"
                self._download_stage = "Loading from cache"
                self._download_progress = 50.0
            else:
                print(f"[model] ⬇ Downloading model from HuggingFace ({settings.model_name})…", flush=True)
                self._status = "downloading"
                self._download_stage = "Downloading model files"
            
            print(f"[model] Target device: {device}, dtype: {dtype}", flush=True)
            t0 = time.time()
            self._model = Dia.from_pretrained(
                settings.model_name, compute_dtype=dtype, device=device
            )
            self._device = device
            self._download_progress = 100.0
            self._download_stage = "Loading complete"

            elapsed = time.time() - t0
            self._status = "ready"
            print(f"[model] ✓ Model successfully loaded on {device} ({dtype}) in {elapsed:.1f}s", flush=True)
            print(f"[model] Model is ready for inference!", flush=True)

        except Exception as exc:
            self._status = "failed"
            self._error = str(exc)
            print(f"[model] FAILED to load model: {exc}", flush=True)
            raise

    # ------------------------------------------------------------------
    @property
    def model(self):
        if self._model is None:
            raise RuntimeError("Model not loaded — call load_model() first")
        return self._model

    @property
    def device(self) -> torch.device:
        if self._device is None:
            raise RuntimeError("Model not loaded — call load_model() first")
        return self._device

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def status(self) -> str:
        return self._status

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def download_progress(self) -> float:
        return self._download_progress

    @property
    def download_stage(self) -> str:
        return self._download_stage


model_manager = ModelManager()
