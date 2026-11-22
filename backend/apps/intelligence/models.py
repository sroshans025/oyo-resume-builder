from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class JobDescription(TimeStampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="job_descriptions")
    title = models.CharField(max_length=160, blank=True)
    company = models.CharField(max_length=160, blank=True)
    source_url = models.URLField(blank=True, max_length=500)
    text = models.TextField()
    parsed = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title or "Job description"

    @property
    def display_title(self) -> str:
        return self.title or self.parsed.get("role_title") or "Untitled role"


class AnalysisReport(TimeStampedModel):
    class Kind(models.TextChoices):
        HEALTH = "health", "Resume health check"
        MATCH = "match", "Job match"
        UPLOAD = "upload", "Uploaded file check"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="analysis_reports")
    kind = models.CharField(max_length=10, choices=Kind.choices, db_index=True)
    resume = models.ForeignKey(
        "resumes.Resume", null=True, blank=True, on_delete=models.CASCADE, related_name="reports"
    )
    resume_version = models.ForeignKey(
        "resumes.ResumeVersion", null=True, blank=True, on_delete=models.SET_NULL, related_name="reports"
    )
    upload = models.ForeignKey(
        "documents.UploadedDocument", null=True, blank=True, on_delete=models.CASCADE, related_name="reports"
    )
    job_description = models.ForeignKey(
        JobDescription, null=True, blank=True, on_delete=models.SET_NULL, related_name="reports"
    )
    quality_score = models.PositiveSmallIntegerField(null=True, blank=True)
    match_score = models.PositiveSmallIntegerField(null=True, blank=True)
    categories = models.JSONField(default=list, blank=True)
    findings = models.JSONField(default=list, blank=True)
    strengths = models.JSONField(default=list, blank=True)
    requirements = models.JSONField(default=list, blank=True)
    checklist = models.JSONField(default=list, blank=True)
    summary = models.JSONField(default=dict, blank=True)
    extracted_preview = models.TextField(blank=True)
    resolved_findings = models.JSONField(default=list, blank=True)
    rules_version = models.CharField(max_length=20)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "kind", "-created_at"])]


class AIRequestLog(models.Model):
    """Operational metadata only — never prompt or response content."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    feature = models.CharField(max_length=40, db_index=True)
    provider = models.CharField(max_length=30)
    model = models.CharField(max_length=60, blank=True)
    prompt_version = models.CharField(max_length=20)
    status = models.CharField(max_length=30, default="ok")
    latency_ms = models.PositiveIntegerField(default=0)
    input_chars = models.PositiveIntegerField(default=0)
    output_chars = models.PositiveIntegerField(default=0)
    warnings_count = models.PositiveSmallIntegerField(default=0)
    outcome = models.CharField(max_length=20, blank=True)  # accepted | edited | rejected
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
