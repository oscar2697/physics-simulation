"""LLM provider abstraction.

The provider is pointed at NVIDIA Build (NIM) via an OpenAI-compatible
endpoint. The model and base URL are configurable through environment
variables (NVIDIA_API_KEY, NIM_MODEL_ID, NIM_BASE_URL) so the provider can
be swapped later (e.g. Kimi K2 <-> DeepSeek <-> other vendors) without code
changes.
"""

from typing import Protocol

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from app.core.config import get_settings


class LLMProvider(Protocol):
    """Interface any LLM provider must satisfy."""

    def get_chat_model(self, *, temperature: float = 0.3) -> BaseChatModel: ...


class NIMProvider:
    """NVIDIA Build (NIM) provider via the OpenAI-compatible client."""

    def __init__(self) -> None:
        settings = get_settings()
        self._model_id = settings.nim_model_id
        self._base_url = settings.nim_base_url
        self._api_key = settings.nvidia_api_key

    def get_chat_model(self, *, temperature: float = 0.3) -> BaseChatModel:
        if not self._api_key:
            raise RuntimeError(
                "NVIDIA_API_KEY is not set. Configure it in backend/.env "
                "(see backend/.env.example)."
            )
        return ChatOpenAI(
            model=self._model_id,
            base_url=self._base_url,
            api_key=self._api_key,
            temperature=temperature,
            streaming=True,
            timeout=90,
            max_retries=1,
            # Reasoning models burn tokens in reasoning_content before emitting
            # the answer; a small budget yields empty content + finish_reason=length.
            # Analyst chunks carry ~10k input chars, so the completion budget must
            # leave room for reasoning AND the JSON payload.
            max_tokens=8192,
        )


_provider: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    """Return the active provider. Swap the instance here to change vendors."""
    global _provider
    if _provider is None:
        _provider = NIMProvider()
    return _provider


def get_llm(*, temperature: float = 0.3) -> BaseChatModel:
    return get_llm_provider().get_chat_model(temperature=temperature)
