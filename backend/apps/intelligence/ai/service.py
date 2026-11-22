"""Single entry point for AI-assisted features.

run_task():
  1. enforces the per-user daily quota,
  2. uses the live provider only if one is configured AND the user consented,
  3. fences untrusted text, validates the structured output,
  4. strips unsupported numbers / flags unsupported skills,
  5. falls back to the offline assistant on any provider failure,
  6. logs metadata only (feature, provider, model, prompt version, latency, sizes)."""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import date

from django.conf import settings
from django.core.cache import cache
from pydantic import BaseModel

from apps.core.exceptions import QuotaExceeded

from ..models import AIRequestLog
from .guardrails import enforce_facts, fence, injection_suspected
from .prompts import PROMPT_VERSION, system_prompt
from .provider import AIError, OfflineProvider, get_provider

DRAFT_LABEL = "Draft — review and edit before saving. Suggestions may be inaccurate."


def _quota_key(user) -> str:
    return f"ai-quota:{user.pk}:{date.today().isoformat()}"


def check_quota(user):
    used = cache.get(_quota_key(user), 0)
    if used >= settings.AI_DAILY_REQUEST_LIMIT:
        raise QuotaExceeded()
    return used


def _bump_quota(user):
    key = _quota_key(user)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, 60 * 60 * 26)


def usage_today(user) -> dict:
    return {"used": cache.get(_quota_key(user), 0), "limit": settings.AI_DAILY_REQUEST_LIMIT}


def run_task(
    user,
    task: str,
    schema: type[BaseModel],
    offline_fn: Callable[[], BaseModel],
    *,
    tone: str = "professional",
    fenced: dict[str, str] | None = None,
    instructions: str = "",
    source_text: str = "",
    apply_fact_check: bool = True,
) -> dict:
    fenced = fenced or {}
    check_quota(user)
    provider = get_provider()
    warnings: list[dict] = []
    notice = None
    mode = "offline"
    status = "ok"
    started = time.monotonic()
    result: BaseModel | None = None

    if any(injection_suspected(v) for v in fenced.values()):
        warnings.append(
            {
                "code": "instructions_ignored",
                "message": "Your text contains instruction-like phrases. They were treated as plain content, not as commands.",
            }
        )

    if provider.is_external:
        consent = getattr(getattr(user, "profile", None), "ai_consent", False)
        if not consent:
            notice = {
                "code": "consent_required",
                "message": "Live AI is available but you haven't consented to sending content to the AI provider. "
                "Showing offline suggestions instead. You can change this in Settings → Privacy.",
            }
        else:
            user_message = "\n\n".join(
                [instructions.strip(), *(fence(tag, text) for tag, text in fenced.items())]
            ).strip()
            try:
                result = provider.generate(system=system_prompt(task, tone), user=user_message, schema=schema)
                mode = "ai"
            except AIError as exc:
                status = exc.code
                notice = {"code": f"ai_{exc.code}", "message": f"{exc.message} Showing offline suggestions instead."}

    if result is None:
        result = offline_fn()
        result = schema.model_validate(result.model_dump())

    if apply_fact_check:
        result, fact_warnings = enforce_facts(result, source_text or " ".join(fenced.values()))
        warnings.extend(fact_warnings)

    _bump_quota(user)
    latency = int((time.monotonic() - started) * 1000)
    log = AIRequestLog.objects.create(
        owner=user,
        feature=task,
        provider=provider.name if mode == "ai" else "offline",
        model=settings.AI_MODEL if mode == "ai" else "",
        prompt_version=PROMPT_VERSION,
        status=status,
        latency_ms=latency,
        input_chars=sum(len(v) for v in fenced.values()) + len(instructions),
        output_chars=len(result.model_dump_json()),
        warnings_count=len(warnings),
    )
    return {
        "mode": mode,
        "provider": provider.label if mode == "ai" else OfflineProvider.label,
        "model": settings.AI_MODEL if mode == "ai" else None,
        "prompt_version": PROMPT_VERSION,
        "label": DRAFT_LABEL,
        "result": result.model_dump(),
        "warnings": warnings,
        "notice": notice,
        "log_id": log.pk,
    }
