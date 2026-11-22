import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class ShareGrant(TimeStampedModel):
    """Time-limited, scoped, revocable access to one resume. Only a hash of the
    token is stored; the raw token is shown to the owner once at creation."""

    class Scope(models.TextChoices):
        VIEW = "view", "View only"
        COMMENT = "comment", "View and comment"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="share_grants")
    resume = models.ForeignKey("resumes.Resume", on_delete=models.CASCADE, related_name="share_grants")
    token_hash = models.CharField(max_length=64, unique=True)
    token_hint = models.CharField(max_length=8)
    recipient_email = models.EmailField(blank=True, help_text="If set, only this signed-in user can open the link.")
    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.VIEW)
    include_contact = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    access_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    @staticmethod
    def new_token() -> str:
        return secrets.token_urlsafe(24)

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > timezone.now()


class ReviewComment(models.Model):
    grant = models.ForeignKey(ShareGrant, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    author_name = models.CharField(max_length=120)
    section = models.CharField(max_length=80, blank=True)
    text = models.TextField(max_length=3000)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class Institution(TimeStampedModel):
    name = models.CharField(max_length=160, unique=True)


class Cohort(TimeStampedModel):
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE, related_name="cohorts")
    name = models.CharField(max_length=160)
    invite_code = models.CharField(max_length=16, unique=True)
    coordinators = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="coordinated_cohorts", blank=True)

    @staticmethod
    def new_code() -> str:
        return secrets.token_hex(4).upper()


class CohortMembership(models.Model):
    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cohort_memberships")
    share_progress = models.BooleanField(
        default=False, help_text="Member consent to share progress summaries (never resume content)."
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["cohort", "user"], name="uniq_cohort_member")]


class SupportTicket(TimeStampedModel):
    STATUS = [("open", "Open"), ("in_progress", "In progress"), ("closed", "Closed")]
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="support_tickets"
    )
    subject = models.CharField(max_length=160)
    message = models.TextField(max_length=4000)
    status = models.CharField(max_length=20, choices=STATUS, default="open")
    admin_note = models.TextField(blank=True, max_length=2000)

    class Meta:
        ordering = ["status", "-created_at"]
