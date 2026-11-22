from django.conf import settings
from django.core.files.storage import default_storage
from django.db import connection
from django.middleware.csrf import get_token
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@extend_schema(summary="Issue a CSRF cookie for the SPA")
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    return Response({"csrfToken": get_token(request)})


def service_health() -> dict:
    from apps.intelligence.ai.provider import provider_status

    checks = {}
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        checks["database"] = {"ok": True, "engine": connection.vendor}
    except Exception:  # pragma: no cover - reported, not raised
        checks["database"] = {"ok": False, "engine": connection.vendor}
    try:
        default_storage.exists("healthcheck")
        checks["storage"] = {"ok": True, "backend": settings.STORAGES["default"]["BACKEND"].rsplit(".", 1)[-1]}
    except Exception:  # pragma: no cover
        checks["storage"] = {"ok": False, "backend": "unavailable"}
    checks["queue"] = {
        "ok": True,
        "mode": "eager (in-process)" if settings.CELERY_TASK_ALWAYS_EAGER else "celery broker",
    }
    checks["ai"] = provider_status()
    return checks


@extend_schema(summary="Public liveness and AI-mode summary")
@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    checks = service_health()
    ok = checks["database"]["ok"] and checks["storage"]["ok"]
    return Response(
        {"status": "ok" if ok else "degraded", "ai": {"mode": checks["ai"]["mode"], "label": checks["ai"]["label"]}},
        status=200 if ok else 503,
    )
