import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Notification, Reminder

logger = logging.getLogger(__name__)


def dispatch_for(user=None) -> int:
    """Creates in-app notifications (and optional emails) for due reminders,
    respecting each user's notification preferences."""
    qs = Reminder.objects.filter(done=False, notified=False, due_at__lte=timezone.now()).select_related(
        "owner__profile"
    )
    if user is not None:
        qs = qs.filter(owner=user)
    count = 0
    for r in qs[:500]:
        profile = getattr(r.owner, "profile", None)
        if profile is None or profile.notify_in_app:
            Notification.objects.create(
                owner=r.owner,
                kind="reminder",
                title=r.title,
                body="Reminder due " + timezone.localtime(r.due_at).strftime("%d %b %Y, %H:%M"),
                link=f"/app/applications?open={r.application_id}" if r.application_id else "/app/applications",
            )
        if profile is not None and profile.notify_email_reminders:
            send_mail(
                f"Reminder: {r.title}",
                f"Your Infyro reminder is due: {r.title}\n\nManage notification preferences: {settings.FRONTEND_URL}/app/settings",
                settings.DEFAULT_FROM_EMAIL,
                [r.owner.email],
                fail_silently=True,
            )
        r.notified = True
        r.save(update_fields=["notified"])
        count += 1
    return count


@shared_task
def dispatch_due_reminders():
    return dispatch_for()
