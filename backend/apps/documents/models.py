from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class UploadedDocument(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Queued"
        PROCESSING = "processing", "Processing"
        PARSED = "parsed", "Ready to review"
        NEEDS_REVIEW = "needs_review", "Low confidence — please review"
        FAILED = "failed", "Failed"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="uploads")
    original_name = models.CharField(max_length=200)
    storage_key = models.CharField(max_length=300)
    file_type = models.CharField(max_length=10)  # pdf | docx
    size = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    page_count = models.PositiveSmallIntegerField(default=0)
    extracted_text = models.TextField(blank=True)
    parsed = models.JSONField(default=dict, blank=True)
    confidence = models.FloatField(default=0)
    warnings = models.JSONField(default=list, blank=True)
    error = models.CharField(max_length=300, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    retain_until = models.DateField(null=True, blank=True)
    imported_resume = models.ForeignKey(
        "resumes.Resume", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.original_name


class GeneratedFile(TimeStampedModel):
    class Kind(models.TextChoices):
        RESUME_PDF = "resume_pdf", "Resume PDF"
        RESUME_DOCX = "resume_docx", "Resume DOCX"
        COVER_LETTER_PDF = "cover_letter_pdf", "Cover letter PDF"
        COVER_LETTER_DOCX = "cover_letter_docx", "Cover letter DOCX"
        REPORT_PDF = "report_pdf", "Analysis report PDF"
        DATA_EXPORT = "data_export", "Account data export"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="generated_files")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    title = models.CharField(max_length=200)
    filename = models.CharField(max_length=200)
    storage_key = models.CharField(max_length=300)
    mime_type = models.CharField(max_length=120)
    size = models.PositiveIntegerField(default=0)
    page_count = models.PositiveSmallIntegerField(default=0)
    resume = models.ForeignKey(
        "resumes.Resume", null=True, blank=True, on_delete=models.SET_NULL, related_name="exports"
    )
    resume_version = models.ForeignKey(
        "resumes.ResumeVersion", null=True, blank=True, on_delete=models.SET_NULL, related_name="exports"
    )
    cover_letter = models.ForeignKey(
        "workspace.CoverLetter", null=True, blank=True, on_delete=models.SET_NULL, related_name="exports"
    )
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
