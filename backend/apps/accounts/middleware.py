from datetime import timedelta

from django.contrib.auth import logout
from django.utils import timezone

from .models import UserSession


class SessionTrackingMiddleware:
    """Keeps a lightweight record of each signed-in session (so users can review
    and revoke them) and signs out suspended accounts. Revocation deletes the
    underlying Django session, which signs that device out on its next request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            if user.status != "active" or not user.is_active:
                logout(request)
            else:
                key = request.session.session_key
                if key:
                    now = timezone.now()
                    tracked = UserSession.objects.filter(session_key=key).only("id", "last_seen_at").first()
                    if tracked is None:
                        UserSession.objects.create(
                            user=user, session_key=key, user_agent=request.META.get("HTTP_USER_AGENT", "")[:200]
                        )
                    elif now - tracked.last_seen_at > timedelta(minutes=5):
                        UserSession.objects.filter(pk=tracked.pk).update(last_seen_at=now)
        return self.get_response(request)
