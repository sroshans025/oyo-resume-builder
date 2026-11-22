"""LLM provider adapter. Business logic depends only on `AIProvider`, so a
different vendor can be added by implementing `generate`."""

from __future__ import annotations

import logging
from typing import TypeVar

from django.conf import settings
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


class AIError(Exception):
    """Provider failed; caller should fall back to the offline assistant."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class AIProvider:
    name = "base"
    label = "AI provider"
    is_external = True

    def available(self) -> bool:
        return False

    def generate(self, *, system: str, user: str, schema: type[T], max_tokens: int | None = None) -> T:
        raise NotImplementedError


class OfflineProvider(AIProvider):
    name = "offline"
    label = "Offline assistant (rule-based, no AI model)"
    is_external = False

    def available(self) -> bool:
        return True


class AnthropicProvider(AIProvider):
    name = "anthropic"
    label = "Claude (Anthropic)"

    def __init__(self):
        self._client = None

    def available(self) -> bool:
        return bool(settings.ANTHROPIC_API_KEY)

    @property
    def client(self):
        if self._client is None:
            import anthropic

            self._client = anthropic.Anthropic(
                api_key=settings.ANTHROPIC_API_KEY,
                timeout=settings.AI_TIMEOUT_SECONDS,
                max_retries=settings.AI_MAX_RETRIES,
            )
        return self._client

    def generate(self, *, system: str, user: str, schema: type[T], max_tokens: int | None = None) -> T:
        import anthropic

        try:
            response = self.client.messages.parse(
                model=settings.AI_MODEL,
                max_tokens=max_tokens or settings.AI_MAX_OUTPUT_TOKENS,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=schema,
                output_config={"effort": settings.AI_EFFORT},
            )
        except anthropic.RateLimitError:
            raise AIError("rate_limited", "The AI provider is busy right now.")
        except anthropic.APITimeoutError:
            raise AIError("timeout", "The AI provider took too long to respond.")
        except anthropic.APIConnectionError:
            raise AIError("unreachable", "The AI provider could not be reached.")
        except anthropic.AuthenticationError:
            logger.error("AI provider authentication failed; check ANTHROPIC_API_KEY")
            raise AIError("misconfigured", "The AI provider is not configured correctly.")
        except anthropic.BadRequestError as exc:
            logger.warning("AI provider rejected request: %s", getattr(exc, "message", "bad request")[:200])
            raise AIError("bad_request", "The AI provider rejected the request.")
        except anthropic.APIStatusError as exc:
            raise AIError("provider_error", f"The AI provider returned an error ({exc.status_code}).")
        except ValidationError:
            raise AIError("malformed", "The AI response did not match the expected format.")

        if response.stop_reason == "refusal":
            raise AIError("refused", "The AI provider declined this request.")
        if response.stop_reason == "max_tokens":
            raise AIError("truncated", "The AI response was cut off.")
        parsed = response.parsed_output
        if parsed is None:
            raise AIError("malformed", "The AI response did not match the expected format.")
        # Re-validate defensively (length limits etc. are enforced client-side by the SDK).
        try:
            return schema.model_validate(parsed.model_dump())
        except ValidationError:
            raise AIError("malformed", "The AI response did not match the expected format.")


_PROVIDERS: dict[str, AIProvider] = {}


def get_provider() -> AIProvider:
    name = settings.AI_PROVIDER
    if name not in _PROVIDERS:
        _PROVIDERS[name] = AnthropicProvider() if name == "anthropic" else OfflineProvider()
    provider = _PROVIDERS[name]
    return provider if provider.available() else _PROVIDERS.setdefault("offline", OfflineProvider())


def provider_status() -> dict:
    configured = settings.AI_PROVIDER
    p = get_provider()
    if p.name == "offline":
        note = (
            "No AI provider is configured. Writing help uses the offline rule-based assistant."
            if configured in ("", "offline")
            else f"AI provider '{configured}' is selected but not configured (missing API key)."
        )
        return {
            "ok": True,
            "mode": "offline",
            "label": OfflineProvider.label,
            "model": None,
            "note": note,
            "external": False,
        }
    return {
        "ok": True,
        "mode": "ai",
        "label": p.label,
        "model": settings.AI_MODEL,
        "external": True,
        "note": "Live AI is enabled. Content is sent to the provider only after you give consent in Settings.",
    }
