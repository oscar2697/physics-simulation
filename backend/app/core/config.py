"""Application configuration loaded from environment variables (.env)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Absolute path: the backend works no matter which directory uvicorn is started from.
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM provider (NVIDIA Build / NIM, OpenAI-compatible) ---
    nvidia_api_key: str = ""
    nim_model_id: str = "nvidia/nemotron-3-ultra-550b-a55b"
    nim_base_url: str = "https://integrate.api.nvidia.com/v1"

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["*"]

    # --- Content ---
    content_dir: str = "../content"

    @property
    def llm_configured(self) -> bool:
        return bool(self.nvidia_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
