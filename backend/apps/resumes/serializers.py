from rest_framework import serializers

from . import content as C
from .models import Resume, ResumeVersion, Template


class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Template
        fields = ["slug", "name", "category", "description", "best_for", "readability_notes", "ats_notes", "style"]


class ResumeListSerializer(serializers.ModelSerializer):
    template = serializers.SlugRelatedField(slug_field="slug", queryset=Template.objects.filter(is_active=True))
    latest_version = serializers.SerializerMethodField()
    section_count = serializers.IntegerField(read_only=True)
    latest_score = serializers.SerializerMethodField()

    class Meta:
        model = Resume
        fields = [
            "id",
            "title",
            "target_role",
            "template",
            "status",
            "source",
            "revision",
            "copied_from",
            "latest_version",
            "section_count",
            "latest_score",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "source", "revision", "copied_from", "created_at", "updated_at"]

    def get_latest_version(self, obj):
        v = obj.versions.order_by("-number").first()
        return {"id": v.pk, "number": v.number, "created_at": v.created_at, "reason": v.reason} if v else None

    def get_latest_score(self, obj):
        from apps.intelligence.models import AnalysisReport

        r = (
            AnalysisReport.objects.filter(resume=obj, kind="health")
            .order_by("-created_at")
            .only("quality_score", "id")
            .first()
        )
        return {"report_id": r.pk, "quality_score": r.quality_score} if r else None


class ResumeDetailSerializer(ResumeListSerializer):
    content = serializers.SerializerMethodField()

    class Meta(ResumeListSerializer.Meta):
        fields = ResumeListSerializer.Meta.fields + ["content"]

    def get_content(self, obj):
        return obj.get_content()


class ResumeCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120)
    target_role = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    template = serializers.SlugField(required=False, default="clarity")
    layout = serializers.ChoiceField(choices=["standard", "fresher"], required=False, default="standard")


class ContentUpdateSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    content = serializers.JSONField()
    force = serializers.BooleanField(required=False, default=False)

    def validate_content(self, value):
        return C.normalize_content(value)


class DuplicateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120)
    target_role = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


class VersionSerializer(serializers.ModelSerializer):
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)

    class Meta:
        model = ResumeVersion
        fields = ["id", "number", "label", "change_summary", "reason", "reason_label", "template_slug", "created_at"]


class VersionDetailSerializer(VersionSerializer):
    class Meta(VersionSerializer.Meta):
        fields = VersionSerializer.Meta.fields + ["content"]


class VersionCreateSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    change_summary = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class ExportSerializer(serializers.Serializer):
    format = serializers.ChoiceField(choices=["pdf", "docx"], default="pdf")
