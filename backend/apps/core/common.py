"""Shared auth, pagination, throttling, permission and audit helpers."""

import hashlib

from rest_framework import permissions, serializers
from rest_framework.authentication import SessionAuthentication
from rest_framework.pagination import PageNumberPagination
from rest_framework.throttling import SimpleRateThrottle

from .models import AuditEvent


class CsrfEnforcedSessionAuthentication(SessionAuthentication):
    """Session-cookie auth for the SPA; CSRF is enforced on unsafe methods."""


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# --- Throttles ----------------------------------------------------------------
class _ScopedUserThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class AuthThrottle(SimpleRateThrottle):
    """Per-IP limit for login, registration and password-reset endpoints."""

    scope = "auth"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class AIThrottle(_ScopedUserThrottle):
    scope = "ai"


class UploadThrottle(_ScopedUserThrottle):
    scope = "upload"


# --- Permissions ----------------------------------------------------------------
class IsOwner(permissions.BasePermission):
    """Object-level guard. Querysets are also owner-filtered so another user's
    objects resolve to 404, never revealing that they exist."""

    def has_object_permission(self, request, view, obj):
        return getattr(obj, "owner_id", None) == request.user.pk


class HasRole(permissions.BasePermission):
    roles: tuple[str, ...] = ()

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.roles)


class IsPlatformAdmin(HasRole):
    roles = ("admin",)


class IsCoordinator(HasRole):
    roles = ("coordinator", "admin")


class OwnedViewSetMixin:
    """Scopes every query to request.user and stamps owner on create."""

    def get_permissions(self):
        return [*super().get_permissions(), IsOwner()]

    def get_queryset(self):
        return super().get_queryset().filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class OwnedPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """Related-object field that only resolves objects owned by the caller."""

    def __init__(self, owner_lookup="owner", **kwargs):
        self.owner_lookup = owner_lookup
        super().__init__(**kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return qs.none()
        return qs.filter(**{self.owner_lookup: request.user})


# --- Audit -----------------------------------------------------------------------
def actor_reference(user) -> str:
    if not user or not getattr(user, "pk", None):
        return ""
    return hashlib.sha256(f"user:{user.pk}".encode()).hexdigest()[:16]


def audit(actor, action: str, resource=None, *, resource_type="", resource_id="", outcome="success", **metadata):
    """Record an audit event. Never pass resume text or personal data as metadata."""
    if resource is not None:
        resource_type = resource_type or resource.__class__.__name__
        resource_id = resource_id or str(resource.pk)
    return AuditEvent.objects.create(
        actor=actor if getattr(actor, "pk", None) else None,
        actor_ref=actor_reference(actor),
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        outcome=outcome,
        metadata=metadata,
    )


# --- OpenAPI ---------------------------------------------------------------------------
try:
    from drf_spectacular.extensions import OpenApiAuthenticationExtension

    class SessionAuthScheme(OpenApiAuthenticationExtension):
        target_class = "apps.core.common.CsrfEnforcedSessionAuthentication"
        name = "sessionAuth"

        def get_security_definition(self, auto_schema):
            return {
                "type": "apiKey",
                "in": "cookie",
                "name": "sessionid",
                "description": "Session cookie from /api/auth/login/. Unsafe methods also require the X-CSRFToken header.",
            }
except ImportError:  # pragma: no cover
    pass
