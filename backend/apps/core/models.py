from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditEvent(models.Model):
    """Append-only record of security-relevant and administrative actions.

    Holds no resume content. When an account is deleted the actor link is
    nulled and only a hashed reference remains (a disclosed retention exception)."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_events"
    )
    actor_ref = models.CharField(max_length=64, blank=True)
    action = models.CharField(max_length=80, db_index=True)
    resource_type = models.CharField(max_length=60, blank=True)
    resource_id = models.CharField(max_length=64, blank=True)
    outcome = models.CharField(max_length=20, default="success")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["resource_type", "resource_id"])]

    def __str__(self):
        return f"{self.action} {self.resource_type}:{self.resource_id} ({self.outcome})"
