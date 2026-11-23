"""API routes: tutor (SSE streaming), document interpretation, documents listing and PDF serving."""

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.agents.graph import build_graph
from app.agents.state import TutorRequest
from app.core.config import get_settings
from app.llm import cache as interpret_cache
from app.llm.interpret import (
    MAX_PAGE_CHARS,
    MAX_PAGES,
    PIPELINE_VERSION,
    InterpretError,
    InterpretResult,
    interpret_document,
)

router = APIRouter(prefix="/api")

# The compiled LangGraph root node name (used to grab the final state).
_ROOT_GRAPH_NAME = "LangGraph"


def _lectures_dir() -> Path:
    content_dir = Path(get_settings().content_dir)
    if not content_dir.is_absolute():
        content_dir = Path(__file__).resolve().parents[2] / content_dir
    return content_dir / "lectures"


@router.get("/health")
async def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "llm_configured": settings.llm_configured,
        "model_id": settings.nim_model_id,
    }


@router.get("/documents")
async def list_documents() -> list[dict]:
    lectures = _lectures_dir()
    if not lectures.exists():
        return []
    return sorted(
        (
            {"filename": f.name, "size_bytes": f.stat().st_size}
            for f in lectures.iterdir()
            if f.is_file() and f.suffix.lower() == ".pdf"
        ),
        key=lambda d: d["filename"],
    )


@router.get("/documents/{filename}/file")
async def get_document_file(filename: str) -> FileResponse:
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = _lectures_dir() / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={"Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes"},
    )


def _sse(data: dict, event: str | None = None) -> str:
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream_tutor(payload: TutorRequest):
    """Stream the tutor graph output as SSE events.

    A single graph invocation streams LLM tokens while they are generated and
    captures the final compiled state to emit the structured payload.
    """
    settings = get_settings()
    if not settings.llm_configured:
        yield _sse(
            {
                "error": "NVIDIA_API_KEY is not set on the backend. "
                "Copy backend/.env.example to backend/.env and add your key."
            },
            event="error",
        )
        return

    graph = build_graph()
    initial_state = {
        "request": payload,
        "scene_state": payload.scene_state,
        "document_context": payload.document_context or "",
    }

    yield _sse({"status": "started", "model_id": settings.nim_model_id}, event="status")

    final_state: dict | None = None
    try:
        async for event in graph.astream_events(initial_state, version="v2"):
            kind = event.get("event")
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                text = getattr(chunk, "content", None)
                if isinstance(text, str) and text:
                    yield _sse({"delta": text}, event="token")
            elif kind == "on_chain_end" and event.get("name") == "physics_evaluator":
                output = event.get("data", {}).get("output", {})
                physics = output.get("physics_result")
                if physics is not None:
                    yield _sse(
                        {"physics": physics.model_dump(exclude_none=True)}, event="physics"
                    )
            elif kind == "on_chain_end" and event.get("name") == _ROOT_GRAPH_NAME:
                final_state = event.get("data", {}).get("output")
    except Exception as e:
        message = f"{type(e).__name__}: {e}"
        if "404" in message:
            message = (
                f"NIM_MODEL_ID '{settings.nim_model_id}' was rejected by NVIDIA NIM (404). "
                "Check NIM_MODEL_ID in backend/.env against https://build.nvidia.com models "
                f"(raw error: {message})"
            )
        yield _sse({"error": message}, event="error")
        return

    tutor_response = (final_state or {}).get("tutor_response")
    if tutor_response is not None:
        yield _sse(
            {
                "answer": tutor_response.answer,
                "physics": tutor_response.physics.model_dump(exclude_none=True)
                if tutor_response.physics
                else None,
                "adjustments": [a.model_dump() for a in tutor_response.adjustments],
                "model_id": tutor_response.model_id,
            },
            event="final",
        )
    else:
        yield _sse({"error": "Tutor produced no response"}, event="error")


@router.post("/tutor")
async def tutor(payload: TutorRequest) -> StreamingResponse:
    return StreamingResponse(
        _stream_tutor(payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class InterpretPage(BaseModel):
    page: int = Field(ge=1)
    text: str = Field(default="", max_length=MAX_PAGE_CHARS)


class InterpretRequest(BaseModel):
    filename: str = "document.pdf"
    pages: list[InterpretPage] = Field(default_factory=list, max_length=MAX_PAGES)


@router.post("/interpret")
async def interpret(payload: InterpretRequest) -> InterpretResult:
    """LLM-driven cue generation for arbitrary physics PDFs."""
    settings = get_settings()
    if not settings.llm_configured:
        raise HTTPException(status_code=503, detail="NVIDIA_API_KEY is not set on the backend.")
    entries = [{"page": entry.page, "text": entry.text} for entry in payload.pages]
    key = interpret_cache.cache_key(payload.filename, entries, settings.nim_model_id + "|" + PIPELINE_VERSION)
    hit = interpret_cache.load(key)
    if hit is not None and hit.get("cues"):
        try:
            return InterpretResult.model_validate({**hit, "cached": True})
        except Exception:
            pass
    try:
        result = await asyncio.to_thread(interpret_document, payload.filename, entries)
    except InterpretError as exc:
        # Surface the real cause (retired model, missing account access, overload…)
        # instead of letting it look like the paper could not be interpreted.
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if result.cues:
        interpret_cache.save(key, result.model_dump())
    return result


async def _stream_interpret(payload: InterpretRequest):
    """Same pipeline as /api/interpret, but with SSE progress events."""
    settings = get_settings()
    if not settings.llm_configured:
        yield _sse({"error": "NVIDIA_API_KEY is not set on the backend."}, event="error")
        return
    entries = [{"page": entry.page, "text": entry.text} for entry in payload.pages]
    key = interpret_cache.cache_key(payload.filename, entries, settings.nim_model_id + "|" + PIPELINE_VERSION)
    hit = interpret_cache.load(key)
    if hit is not None and hit.get("cues"):
        try:
            result = InterpretResult.model_validate({**hit, "cached": True})
            yield _sse({"cues": [c.model_dump() for c in result.cues], "cached": True}, event="final")
            return
        except Exception:
            pass
    yield _sse({"phase": "reading", "done": len(entries), "total": len(entries)}, event="progress")
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def on_progress(phase: str, done: int, total: int) -> None:
        loop.call_soon_threadsafe(
            queue.put_nowait, {"phase": phase, "done": done, "total": total}
        )

    task = asyncio.create_task(
        asyncio.to_thread(interpret_document, payload.filename, entries, on_progress)
    )
    try:
        while not task.done():
            try:
                progress = await asyncio.wait_for(queue.get(), timeout=0.2)
            except asyncio.TimeoutError:
                continue
            yield _sse(progress, event="progress")
        result = await task
    except InterpretError as exc:
        yield _sse({"error": str(exc)}, event="error")
        return
    while not queue.empty():
        yield _sse(queue.get_nowait(), event="progress")
    if result.cues:
        interpret_cache.save(key, result.model_dump())
    yield _sse({"cues": [c.model_dump() for c in result.cues], "cached": False}, event="final")


@router.post("/interpret/stream")
async def interpret_stream(payload: InterpretRequest) -> StreamingResponse:
    return StreamingResponse(
        _stream_interpret(payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
