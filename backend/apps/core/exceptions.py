"""Consistent API error envelope: {"error": {"code", "message", "fields"}}."""

import logging

from django.core.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ServiceUnavailable(exceptions.APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "A dependent service is temporarily unavailable."
    default_code = "service_unavailable"


class Conflict(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The resource changed since you loaded it."
    default_code = "conflict"


class AIConsentRequired(exceptions.APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "Enable AI processing consent in Settings before sending content to an external AI provider."
    default_code = "ai_consent_required"


class QuotaExceeded(exceptions.APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = "Daily AI usage limit reached. It resets at midnight UTC."
    default_code = "quota_exceeded"


def _flatten(detail):
    if isinstance(detail, dict):
        return {k: _flatten(v) for k, v in detail.items()}
    if isinstance(detail, list):
        flat = [_flatten(v) for v in detail]
        return flat if any(isinstance(v, (dict, list)) for v in flat) else [str(v) for v in flat]
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        view = context.get("view")
        logger.exception("Unhandled API error in %s", view.__class__.__name__ if view else "?")
        return Response(
            {"error": {"code": "server_error", "message": "Something went wrong on our side. Please try again."}},
            status=500,
        )

    code = getattr(exc, "default_code", "error")
    if isinstance(exc, exceptions.APIException):
        codes = exc.get_codes()
        if isinstance(codes, str):
            code = codes
    payload = {"code": code}
    if isinstance(exc, exceptions.ValidationError):
        payload["code"] = "validation_error"
        payload["message"] = "Please correct the highlighted fields."
        payload["fields"] = (
            _flatten(exc.detail) if isinstance(exc.detail, dict) else {"non_field_errors": _flatten(exc.detail)}
        )
    else:
        payload["message"] = str(exc.detail) if isinstance(exc, exceptions.APIException) else str(exc)
    if isinstance(exc, exceptions.Throttled) and exc.wait:
        payload["retry_after"] = int(exc.wait)
    response.data = {"error": payload}
    return response
