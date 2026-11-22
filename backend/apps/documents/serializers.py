from rest_framework import serializers

from .models import GeneratedFile, UploadedDocument


class UploadedDocumentSerializer(serializers.ModelSerializer):
    imported_resume_title = serializers.CharField(source="imported_resume.title", read_only=True, default=None)

    class Meta:
        model = UploadedDocument
        fields = [
            "id",
            "original_name",
            "file_type",
            "size",
            "status",
            "page_count",
            "confidence",
            "warnings",
            "error",
            "attempts",
            "retain_until",
            "imported_resume",
            "imported_resume_title",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [f for f in fields if f != "retain_until"]


class UploadedDocumentDetailSerializer(UploadedDocumentSerializer):
    class Meta(UploadedDocumentSerializer.Meta):
        fields = UploadedDocumentSerializer.Meta.fields + ["extracted_text", "parsed"]
        read_only_fields = UploadedDocumentSerializer.Meta.fields + ["extracted_text", "parsed"]


class GeneratedFileSerializer(serializers.ModelSerializer):
    resume_title = serializers.CharField(source="resume.title", read_only=True, default=None)
    version_number = serializers.IntegerField(source="resume_version.number", read_only=True, default=None)
    cover_letter_title = serializers.CharField(source="cover_letter.title", read_only=True, default=None)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = GeneratedFile
        fields = [
            "id",
            "kind",
            "kind_label",
            "title",
            "filename",
            "mime_type",
            "size",
            "page_count",
            "resume",
            "resume_title",
            "resume_version",
            "version_number",
            "cover_letter",
            "cover_letter_title",
            "expires_at",
            "created_at",
        ]
        read_only_fields = [f for f in fields if f != "expires_at"]


class ImportUploadSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120)
    target_role = serializers.CharField(max_length=120, required=False, allow_blank=True)
    template = serializers.SlugField(required=False, default="clarity")
    content = serializers.JSONField(help_text="The user-reviewed content proposal.")
