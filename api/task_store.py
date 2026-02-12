from __future__ import annotations

import time
import threading
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class GenerationTask:
    task_id: str
    status: TaskStatus = TaskStatus.PENDING
    progress: float = 0.0
    current_stage: str = ""
    audio_path: str | None = None  # uploaded voice sample
    text: str = ""
    max_tokens: int = 3072
    cfg_scale: float = 3.0
    temperature: float = 1.2
    top_p: float = 0.95
    cfg_filter_top_k: int = 45
    output_path: str | None = None
    output_duration: float | None = None
    output_size_bytes: int | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)


class TaskStore:
    """Thread-safe in-memory task store."""

    def __init__(self) -> None:
        self._tasks: dict[str, GenerationTask] = {}
        self._lock = threading.Lock()

    def create(self, **kwargs) -> GenerationTask:
        task_id = uuid.uuid4().hex[:12]
        task = GenerationTask(task_id=task_id, **kwargs)
        with self._lock:
            self._tasks[task_id] = task
        return task

    def get(self, task_id: str) -> GenerationTask | None:
        with self._lock:
            return self._tasks.get(task_id)

    def update(self, task_id: str, **kwargs) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            for k, v in kwargs.items():
                setattr(task, k, v)

    def cleanup_old(self, max_age_seconds: int = 3600) -> None:
        """Remove expired tasks and their files."""
        now = time.time()
        to_delete: list[str] = []
        with self._lock:
            for tid, task in self._tasks.items():
                if now - task.created_at > max_age_seconds:
                    to_delete.append(tid)
            for tid in to_delete:
                task = self._tasks.pop(tid)
                for p in (task.audio_path, task.output_path):
                    if p:
                        try:
                            Path(p).unlink(missing_ok=True)
                        except OSError:
                            pass


task_store = TaskStore()
