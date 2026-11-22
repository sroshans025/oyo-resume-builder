from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class CoverLetter(TimeStampedModel):
    TONES = [
        ("professional", "Professional"),
        ("concise", "Concise"),
        ("enthusiastic", "Warm & enthusiastic"),
        ("formal", "Formal"),
        ("fresher", "Fresher-friendly"),
    ]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cover_letters")
    title = models.CharField(max_length=160)
    company = models.CharField(max_length=160, blank=True)
    role = models.CharField(max_length=160, blank=True)
    tone = models.CharField(max_length=20, choices=TONES, default="professional")
    resume = models.ForeignKey(
        "resumes.Resume", null=True, blank=True, on_delete=models.SET_NULL, related_name="cover_letters"
    )
    job_description = models.ForeignKey(
        "intelligence.JobDescription", null=True, blank=True, on_delete=models.SET_NULL, related_name="cover_letters"
    )
    hiring_manager = models.CharField(max_length=120, blank=True)
    motivation = models.TextField(blank=True, max_length=2000, help_text="User's own reasons for applying.")
    body = models.TextField(blank=True, max_length=12000)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title


class CoverLetterBlock(TimeStampedModel):
    """Reusable paragraphs the user can insert into any letter."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cover_letter_blocks")
    title = models.CharField(max_length=120)
    text = models.TextField(max_length=3000)
    category = models.CharField(max_length=30, default="general")

    class Meta:
        ordering = ["category", "title"]


class Application(TimeStampedModel):
    class Status(models.TextChoices):
        INTERESTED = "interested", "Interested"
        PREPARING = "preparing", "Preparing"
        APPLIED = "applied", "Applied"
        ASSESSMENT = "assessment", "Assessment"
        INTERVIEW = "interview", "Interview"
        OFFER = "offer", "Offer"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"
        ARCHIVED = "archived", "Archived"

    class WorkMode(models.TextChoices):
        ONSITE = "onsite", "On-site"
        HYBRID = "hybrid", "Hybrid"
        REMOTE = "remote", "Remote"
        UNKNOWN = "", "Not specified"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="applications")
    company = models.CharField(max_length=160)
    role = models.CharField(max_length=160)
    job_url = models.URLField(blank=True, max_length=500)
    location = models.CharField(max_length=120, blank=True)
    work_mode = models.CharField(max_length=10, choices=WorkMode.choices, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INTERESTED, db_index=True)
    saved_on = models.DateField()
    applied_on = models.DateField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)
    salary_note = models.CharField(max_length=120, blank=True)
    recruiter_name = models.CharField(max_length=120, blank=True)
    recruiter_email = models.EmailField(blank=True)
    recruiter_phone = models.CharField(max_length=40, blank=True)
    notes = models.TextField(blank=True, max_length=8000)
    next_action = models.CharField(max_length=200, blank=True)
    next_action_date = models.DateField(null=True, blank=True)
    resume_version = models.ForeignKey(
        "resumes.ResumeVersion", null=True, blank=True, on_delete=models.SET_NULL, related_name="applications"
    )
    cover_letter = models.ForeignKey(
        CoverLetter, null=True, blank=True, on_delete=models.SET_NULL, related_name="applications"
    )
    job_description = models.ForeignKey(
        "intelligence.JobDescription", null=True, blank=True, on_delete=models.SET_NULL, related_name="applications"
    )
    position = models.PositiveIntegerField(default=0, help_text="Order within a board column.")

    class Meta:
        ordering = ["position", "-updated_at"]
        indexes = [models.Index(fields=["owner", "status"])]

    def __str__(self):
        return f"{self.role} at {self.company}"


class ApplicationEvent(models.Model):
    class Kind(models.TextChoices):
        CREATED = "created", "Created"
        STATUS = "status", "Status changed"
        INTERVIEW = "interview", "Interview"
        ASSESSMENT = "assessment", "Assessment"
        DEADLINE = "deadline", "Deadline"
        NOTE = "note", "Note"
        FOLLOW_UP = "follow_up", "Follow-up"
        DOCUMENT = "document", "Document linked"

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=200)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    occurs_at = models.DateTimeField(null=True, blank=True, help_text="For scheduled events such as interviews.")
    note = models.TextField(blank=True, max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def owner_id(self):
        return self.application.owner_id


class Reminder(TimeStampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders")
    application = models.ForeignKey(
        Application, null=True, blank=True, on_delete=models.CASCADE, related_name="reminders"
    )
    title = models.CharField(max_length=200)
    due_at = models.DateTimeField(db_index=True)
    done = models.BooleanField(default=False)
    notified = models.BooleanField(default=False)
    kind = models.CharField(max_length=20, default="custom")  # follow_up | deadline | interview | custom

    class Meta:
        ordering = ["done", "due_at"]


class Notification(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=30)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500, blank=True)
    link = models.CharField(max_length=200, blank=True)
    read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
