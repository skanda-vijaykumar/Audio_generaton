from __future__ import annotations

import asyncio
import contextlib
import io
import json
import logging
import re
import threading
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse

from api.config import settings
from api.model_manager import model_manager
from api.task_store import task_store, TaskStatus


# Silence the noisy /api/health access-log lines
class _HealthFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return "/api/health" not in msg

logging.getLogger("uvicorn.access").addFilter(_HealthFilter())

# ---------- generation lock (one at a time) ----------
_generate_lock = threading.Lock()

# ---------- helpers ----------
ALLOWED_AUDIO_EXTS = {".wav", ".mp3", ".flac", ".ogg"}


def _stage_label(progress: float) -> str:
    if progress < 20:
        return "Initializing"
    if progress < 50:
        return "Encoding"
    if progress < 85:
        return "Generating Audio"
    return "Finalizing"


class ProgressCapture(io.StringIO):
    """Wraps stdout during generation to parse progress lines."""

    _step_re = re.compile(r"generate step (\d+):")

    def __init__(self, task_id: str, max_tokens: int) -> None:
        super().__init__()
        self.task_id = task_id
        self.max_tokens = max_tokens

    def write(self, s: str) -> int:
        # Parse `generate step N:` lines emitted every ~86 tokens
        m = self._step_re.search(s)
        if m:
            step = int(m.group(1))
            pct = min(step / self.max_tokens * 100, 99.0)
            task_store.update(
                self.task_id,
                progress=pct,
                current_stage=_stage_label(pct),
            )
        return super().write(s)


def _run_generation(task_id: str) -> None:
    """Run model.generate() synchronously — called in a background thread."""
    task = task_store.get(task_id)
    if task is None:
        return

    task_store.update(
        task_id,
        status=TaskStatus.PROCESSING,
        progress=0.0,
        current_stage="Initializing",
    )

    capture = ProgressCapture(task_id, task.max_tokens)

    try:
        with _generate_lock, contextlib.redirect_stdout(capture), torch.inference_mode():
            output_audio_np = model_manager.model.generate(
                task.text,
                max_tokens=task.max_tokens,
                cfg_scale=task.cfg_scale,
                temperature=task.temperature,
                top_p=task.top_p,
                cfg_filter_top_k=task.cfg_filter_top_k,
                use_torch_compile=False,
                audio_prompt=task.audio_path,
                verbose=True,
            )

        if output_audio_np is None:
            task_store.update(
                task_id,
                status=TaskStatus.FAILED,
                error="Generation produced no output.",
            )
            return

        # Save WAV
        sample_rate = 44100
        output_dir = Path(settings.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        out_path = output_dir / f"{task_id}.wav"
        sf.write(str(out_path), output_audio_np, sample_rate)

        duration = len(output_audio_np) / sample_rate
        size_bytes = out_path.stat().st_size

        task_store.update(
            task_id,
            status=TaskStatus.COMPLETE,
            progress=100.0,
            current_stage="Complete",
            output_path=str(out_path),
            output_duration=duration,
            output_size_bytes=size_bytes,
        )

    except Exception as exc:
        task_store.update(
            task_id,
            status=TaskStatus.FAILED,
            error=str(exc),
        )


# ---------- lifespan ----------
_model_loading = False


def _load_model_background() -> None:
    """Load model in a background thread so the server starts accepting requests immediately."""
    global _model_loading
    _model_loading = True
    try:
        model_manager.load_model(settings)
    finally:
        _model_loading = False


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — create dirs immediately, load model in background
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.output_dir).mkdir(parents=True, exist_ok=True)
    threading.Thread(target=_load_model_background, daemon=True).start()

    # Periodic cleanup task
    async def _cleanup_loop():
        while True:
            await asyncio.sleep(600)
            task_store.cleanup_old()

    cleanup_task = asyncio.create_task(_cleanup_loop())
    yield
    # Shutdown
    cleanup_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await cleanup_task


# ---------- app ----------
app = FastAPI(title="Dia TTS API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- endpoints ----------
@app.get("/api/health", include_in_schema=False)
async def health():
    return {
        "status": "ok",
        "model_loaded": model_manager.is_loaded,
        "model_loading": _model_loading,
        "model_status": model_manager.status,
        "model_error": model_manager.error,
        "device": str(model_manager.device) if model_manager.is_loaded else None,
    }


@app.post("/api/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    # Validate extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTS:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    # Read content + size check
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(400, f"File exceeds {settings.max_upload_size_mb} MB limit")

    # Create task & save file
    task = task_store.create()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    save_path = upload_dir / f"{task.task_id}{ext}"
    save_path.write_bytes(content)
    task_store.update(task.task_id, audio_path=str(save_path))

    # Extract real metadata via soundfile
    try:
        info = sf.info(str(save_path))
        duration = info.duration
        sample_rate = info.samplerate
        channels = info.channels
    except Exception:
        duration = 0.0
        sample_rate = 0
        channels = 1

    # Estimate frequency range via FFT
    freq_low, freq_high = 80, 4000
    try:
        data, sr = sf.read(str(save_path), dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)
        n = len(data)
        if n > 0 and sr > 0:
            fft_mag = np.abs(np.fft.rfft(data))
            freqs = np.fft.rfftfreq(n, 1.0 / sr)
            threshold = fft_mag.max() * 0.01
            above = np.where(fft_mag > threshold)[0]
            if len(above) > 0:
                freq_low = int(freqs[above[0]])
                freq_high = int(freqs[above[-1]])
    except Exception:
        pass

    # Quality score heuristic (based on sample rate & duration)
    quality = min(95.0, 60.0 + min(sample_rate / 1000, 20.0) + min(duration * 3, 15.0))

    # Format duration
    mins, secs = divmod(duration, 60)
    dur_fmt = f"{int(mins):02d}:{secs:05.2f}s" if mins else f"00:{secs:05.2f}s"

    return {
        "task_id": task.task_id,
        "filename": file.filename,
        "duration": round(duration, 2),
        "duration_formatted": dur_fmt,
        "sample_rate": sample_rate,
        "channels": channels,
        "frequency_range": f"{freq_low}Hz - {freq_high / 1000:.1f}kHz",
        "quality_score": round(quality, 1),
    }


@app.get("/api/generate")
async def generate(
    task_id: str = Query(...),
    text: str = Query(...),
    max_tokens: int = Query(default=settings.max_tokens),
    cfg_scale: float = Query(default=settings.cfg_scale),
    temperature: float = Query(default=settings.temperature),
    top_p: float = Query(default=settings.top_p),
    cfg_filter_top_k: int = Query(default=settings.cfg_filter_top_k),
):
    if not model_manager.is_loaded:
        raise HTTPException(503, "Model is still loading — please try again shortly")

    task = task_store.get(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")

    # Store generation params
    task_store.update(
        task_id,
        text=text,
        max_tokens=max_tokens,
        cfg_scale=cfg_scale,
        temperature=temperature,
        top_p=top_p,
        cfg_filter_top_k=cfg_filter_top_k,
    )

    # Kick off generation in a background thread
    thread = threading.Thread(target=_run_generation, args=(task_id,), daemon=True)
    thread.start()

    # SSE stream — poll task store for updates
    async def event_stream():
        last_progress = -1.0
        while True:
            await asyncio.sleep(0.5)
            t = task_store.get(task_id)
            if t is None:
                yield {"event": "error", "data": json.dumps({"error": "Task lost"})}
                return

            if t.status == TaskStatus.FAILED:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": t.error or "Unknown error"}),
                }
                return

            if t.status == TaskStatus.COMPLETE:
                # Send a final progress tick
                yield {
                    "event": "progress",
                    "data": json.dumps(
                        {"status": "processing", "progress": 100, "stage": "Complete"}
                    ),
                }
                mins, secs = divmod(t.output_duration or 0, 60)
                dur_fmt = (
                    f"{int(mins):02d}:{secs:05.2f}s"
                    if mins
                    else f"00:{secs:05.2f}s"
                )
                yield {
                    "event": "complete",
                    "data": json.dumps(
                        {
                            "task_id": task_id,
                            "duration_formatted": dur_fmt,
                            "sample_rate": 44100,
                            "file_size_bytes": t.output_size_bytes,
                        }
                    ),
                }
                return

            # In-progress update
            if t.progress != last_progress:
                last_progress = t.progress
                yield {
                    "event": "progress",
                    "data": json.dumps(
                        {
                            "status": "processing",
                            "progress": round(t.progress, 1),
                            "stage": t.current_stage,
                        }
                    ),
                }

    return EventSourceResponse(event_stream())


@app.get("/api/download/{task_id}")
async def download(task_id: str):
    task = task_store.get(task_id)
    if task is None or task.output_path is None:
        raise HTTPException(404, "File not found")
    path = Path(task.output_path)
    if not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(
        str(path),
        media_type="audio/wav",
        filename=f"voxsynth-{task_id}.wav",
    )
