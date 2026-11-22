from rest_framework import serializers

from .models import AnalysisReport, JobDescription

TONES = ["professional", "concise", "technical", "leadership", "fresher"]


class JobDescriptionSerializer(serializers.ModelSerializer):
    display_title = serializers.ReadOnlyField()

    class Meta:
        model = JobDescription
        fields = ["id", "title", "company", "source_url", "text", "parsed", "display_title", "created_at", "updated_at"]
        read_only_fields = ["id", "parsed", "display_title", "created_at", "updated_at"]
        extra_kwargs = {"text": {"max_length": 30000}}

    def validate_text(self, v):
        if len(v.strip()) < 80:
            raise serializers.ValidationError("Paste the full job description (at least a few sentences).")
        return v.strip()


class JobDescriptionListSerializer(JobDescriptionSerializer):
    class Meta(JobDescriptionSerializer.Meta):
        fields = ["id", "title", "company", "source_url", "display_title", "created_at", "updated_at"]


class ReportListSerializer(serializers.ModelSerializer):
    resume_title = serializers.CharField(source="resume.title", read_only=True, default=None)
    version_number = serializers.IntegerField(source="resume_version.number", read_only=True, default=None)
    job_title = serializers.CharField(source="job_description.display_title", read_only=True, default=None)
    job_company = serializers.CharField(source="job_description.company", read_only=True, default=None)
    upload_name = serializers.CharField(source="upload.original_name", read_only=True, default=None)
    finding_count = serializers.SerializerMethodField()

    class Meta:
        model = AnalysisReport
        fields = [
            "id",
            "kind",
            "resume",
            "resume_title",
            "resume_version",
            "version_number",
            "job_description",
            "job_title",
            "job_company",
            "upload",
            "upload_name",
            "quality_score",
            "match_score",
            "finding_count",
            "created_at",
        ]

    def get_finding_count(self, obj):
        return len(obj.findings) if obj.kind != "match" else len(obj.requirements)


class ReportDetailSerializer(ReportListSerializer):
    class Meta(ReportListSerializer.Meta):
        fields = ReportListSerializer.Meta.fields + [
            "categories",
            "findings",
            "strengths",
            "requirements",
            "checklist",
            "summary",
            "extracted_preview",
            "resolved_findings",
            "rules_version",
        ]


class HealthRequestSerializer(serializers.Serializer):
    resume_id = serializers.IntegerField(required=False)
    upload_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if bool(attrs.get("resume_id")) == bool(attrs.get("upload_id")):
            raise serializers.ValidationError("Provide either resume_id or upload_id.")
        return attrs


class MatchRequestSerializer(serializers.Serializer):
    resume_id = serializers.IntegerField()
    job_description_id = serializers.IntegerField(required=False)
    title = serializers.CharField(max_length=160, required=False, allow_blank=True)
    company = serializers.CharField(max_length=160, required=False, allow_blank=True)
    source_url = serializers.URLField(required=False, allow_blank=True)
    text = serializers.CharField(required=False, max_length=30000)
    save_job = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        if not attrs.get("job_description_id") and len((attrs.get("text") or "").strip()) < 80:
            raise serializers.ValidationError({"text": "Paste the full job description, or choose a saved one."})
        return attrs


class ReportUpdateSerializer(serializers.Serializer):
    resolved_findings = serializers.ListField(
        child=serializers.CharField(max_length=80), required=False, max_length=200
    )
    checklist_done = serializers.ListField(child=serializers.CharField(max_length=80), required=False, max_length=200)


class ToneField(serializers.ChoiceField):
    def __init__(self, **kw):
        super().__init__(choices=TONES, required=False, default="professional", **kw)


class SummaryRequest(serializers.Serializer):
    resume_id = serializers.IntegerField()
    target_role = serializers.CharField(max_length=120, required=False, allow_blank=True)
    tone = ToneField()


class BulletRequest(serializers.Serializer):
    text = serializers.CharField(max_length=600)
    role = serializers.CharField(max_length=160, required=False, allow_blank=True)
    organization = serializers.CharField(max_length=160, required=False, allow_blank=True)
    tools = serializers.CharField(max_length=300, required=False, allow_blank=True)
    tone = ToneField()


class ProjectRequest(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    problem = serializers.CharField(max_length=800, required=False, allow_blank=True)
    approach = serializers.CharField(max_length=800, required=False, allow_blank=True)
    tools = serializers.CharField(max_length=300, required=False, allow_blank=True)
    outcome = serializers.CharField(max_length=600, required=False, allow_blank=True)
    tone = ToneField()


class AchievementRequest(serializers.Serializer):
    notes = serializers.CharField(max_length=1500)
    context = serializers.CharField(max_length=300, required=False, allow_blank=True)
    tone = ToneField()


class TextRequest(serializers.Serializer):
    text = serializers.CharField(max_length=6000)
    current_role = serializers.BooleanField(required=False, allow_null=True, default=None)


class FeedbackRequest(serializers.Serializer):
    log_id = serializers.IntegerField()
    outcome = serializers.ChoiceField(choices=["accepted", "edited", "rejected"])
