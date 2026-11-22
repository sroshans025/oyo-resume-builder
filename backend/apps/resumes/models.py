from django.conf import settings
from django.db import models, transaction

from apps.core.models import TimeStampedModel

from . import content as C


class Template(TimeStampedModel):
    """A resume layout. `style` drives both the browser preview and the PDF/DOCX
    renderers so the export matches what the user sees."""

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=60)
    description = models.CharField(max_length=240)
    category = models.CharField(max_length=40, default="General")
    best_for = models.CharField(max_length=160, blank=True)
    readability_notes = models.TextField(blank=True)
    ats_notes = models.TextField(blank=True)
    style = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Resume(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        READY = "ready", "Ready"
        ARCHIVED = "archived", "Archived"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="resumes")
    title = models.CharField(max_length=120)
    target_role = models.CharField(max_length=120, blank=True)
    template = models.ForeignKey(Template, on_delete=models.PROTECT, related_name="resumes")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    personal = models.JSONField(default=C.default_personal)
    revision = models.PositiveIntegerField(default=1, help_text="Optimistic-concurrency counter for autosave.")
    source = models.CharField(max_length=20, default="scratch")  # scratch | upload | copy | sample
    copied_from = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="copies")

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["owner", "-updated_at"])]

    def __str__(self):
        return self.title

    # --- content helpers -----------------------------------------------------------
    def get_content(self) -> dict:
        sections = [
            {"key": s.key, "type": s.type, "title": s.title, "visible": s.visible, "data": s.data}
            for s in self.sections.all().order_by("order", "id")
        ]
        return {"personal": self.personal, "sections": sections}

    @transaction.atomic
    def set_content(self, content: dict, bump=True):
        """Replace draft content. Caller must pass normalized content."""
        self.personal = content["personal"]
        existing = {s.key: s for s in self.sections.all()}
        seen = set()
        for order, sec in enumerate(content["sections"]):
            seen.add(sec["key"])
            obj = existing.get(sec["key"])
            if obj is None:
                ResumeSection.objects.create(
                    resume=self,
                    key=sec["key"],
                    type=sec["type"],
                    title=sec["title"],
                    visible=sec["visible"],
                    data=sec["data"],
                    order=order,
                )
            else:
                obj.type, obj.title, obj.visible, obj.data, obj.order = (
                    sec["type"],
                    sec["title"],
                    sec["visible"],
                    sec["data"],
                    order,
                )
                obj.save()
        self.sections.exclude(key__in=seen).delete()
        if bump:
            self.revision += 1
        self.save()

    def snapshot(self, *, reason="manual", label="", change_summary="", dedupe=True) -> "ResumeVersion":
        """Create an immutable version of the current draft. With dedupe, the
        latest version is reused when content is unchanged."""
        content = self.get_content()
        digest = C.content_hash({"template": self.template.slug, **content})
        latest = self.versions.order_by("-number").first()
        if dedupe and latest and latest.content_hash == digest and reason != "manual":
            return latest
        number = (latest.number + 1) if latest else 1
        return ResumeVersion.objects.create(
            resume=self,
            number=number,
            content=content,
            content_hash=digest,
            template_slug=self.template.slug,
            reason=reason,
            label=label[:120],
            change_summary=change_summary[:500],
        )


class ResumeSection(models.Model):
    """One section of the working draft. Order is explicit; data is validated
    by apps.resumes.content.normalize_content before it is stored."""

    resume = models.ForeignKey(Resume, on_delete=models.CASCADE, related_name="sections")
    key = models.CharField(max_length=40)
    type = models.CharField(max_length=20, choices=[(k, v) for k, v in C.SECTION_TYPES.items()])
    title = models.CharField(max_length=60)
    order = models.PositiveSmallIntegerField(default=0)
    visible = models.BooleanField(default=True)
    data = models.JSONField(default=dict)

    class Meta:
        ordering = ["order", "id"]
        constraints = [models.UniqueConstraint(fields=["resume", "key"], name="uniq_section_key_per_resume")]


class ResumeVersion(models.Model):
    class Reason(models.TextChoices):
        MANUAL = "manual", "Saved by you"
        EXPORT = "export", "Exported"
        ANALYSIS = "analysis", "Analysed"
        APPLICATION = "application", "Linked to an application"
        RESTORE = "restore", "Before restore"
        IMPORT = "import", "Imported"
        DUPLICATE = "duplicate", "Copied"

    resume = models.ForeignKey(Resume, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    label = models.CharField(max_length=120, blank=True)
    change_summary = models.CharField(max_length=500, blank=True)
    reason = models.CharField(max_length=20, choices=Reason.choices, default=Reason.MANUAL)
    template_slug = models.SlugField(blank=True)
    content = models.JSONField()
    content_hash = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-number"]
        constraints = [models.UniqueConstraint(fields=["resume", "number"], name="uniq_version_number")]

    def __str__(self):
        return f"{self.resume.title} v{self.number}"

    @property
    def owner_id(self):
        return self.resume.owner_id
