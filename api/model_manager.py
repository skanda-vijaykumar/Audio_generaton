from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING

import torch

if TYPE_CHECKING:
    from api.config import Settings


# Add backend/ to sys.path so `from dia.model import Dia` works
_backend_dir = str(Path(__file__).resolve().parent.parent / "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# tqdm progress bars use \r which Docker logs swallow — disable them
# and enable huggingface_hub info logging instead (logs each file download).
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
logging.getLogger("huggingface_hub").setLevel(logging.INFO)
_hf_handler = logging.StreamHandler(sys.stdout)
_hf_handler.setFormatter(logging.Formatter("[model] %(message)s"))
logging.getLogger("huggingface_hub").addHandler(_hf_handler)


class ModelManager:
    """Singleton that lazily loads the Dia model once."""

    _instance: ModelManager | None = None
    _model = None
    _device: torch.device | None = None
    _status: str = "idle"
    _error: str | None = None

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
            self._status = "downloading"
            print(f"[model] Downloading model weights from HuggingFace ({settings.model_name})…", flush=True)
            t0 = time.time()

            self._model = Dia.from_pretrained(
                settings.model_name, compute_dtype=dtype, device=device
            )
            self._device = device

            elapsed = time.time() - t0
            self._status = "ready"
            print(f"[model] Model loaded on {device} ({dtype}) in {elapsed:.1f}s", flush=True)

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


model_manager = ModelManager()
