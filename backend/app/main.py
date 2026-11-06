"""FastAPI entrypoint for the physics & AI tutor backend."""

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings


async def _check_model_availability() -> None:
    settings = get_settings()
    if not settings.llm_configured:
        print(
            "[warn] NVIDIA_API_KEY is not set — the AI tutor will return an error. "
            "Copy backend/.env.example to backend/.env and add your key."
        )
        return
    # A model can appear in GET /models and still be unusable (retired: 410 Gone,
    # or not enabled for this account: 404). Probe a real completion instead.
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{settings.nim_base_url.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.nvidia_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.nim_model_id,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                },
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:200]
        print(
            f"[warn] NIM_MODEL_ID '{settings.nim_model_id}' rejected with HTTP "
            f"{exc.response.status_code}: {detail} — pick a live, enabled model from "
            "https://build.nvidia.com (see backend/.env.example)."
        )
        return
    except Exception as exc:
        print(f"[warn] Could not verify model availability: {exc}")
        return
    print(f"[info] LLM configured: {settings.nim_model_id} @ {settings.nim_base_url}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _check_model_availability()
    yield


app = FastAPI(title="Physics & AI Tutor Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
