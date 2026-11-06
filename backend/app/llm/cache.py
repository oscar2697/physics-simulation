"""Disk cache for document interpretation results.

Interpreting a paper costs several minutes of LLM calls. The cache keys on the
exact payload (filename + page texts) and the model id, so reopening the same
paper returns instantly without spending another pipeline run.
"""

import hashlib
import json
from pathlib import Path
from typing import Any

CACHE_DIR = Path(__file__).resolve().parents[2] / ".interpret_cache"


def cache_key(filename: str, pages: list[dict[str, Any]], model_id: str) -> str:
    digest = hashlib.sha256()
    digest.update(model_id.encode("utf-8"))
    digest.update(b"\x00")
    digest.update(filename.encode("utf-8"))
    for entry in pages:
        digest.update(b"\x00")
        digest.update(str(entry.get("page", "")).encode("utf-8"))
        digest.update(b"\x00")
        digest.update((entry.get("text") or "").encode("utf-8"))
    return digest.hexdigest()[:32]


def load(key: str) -> dict[str, Any] | None:
    path = CACHE_DIR / f"{key}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save(key: str, payload: dict[str, Any]) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (CACHE_DIR / f"{key}.json").write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8"
        )
    except OSError:
        pass
