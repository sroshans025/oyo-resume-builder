from rest_framework import serializers

from apps.core.common import OwnedPrimaryKeyRelatedField
from apps.intelligence.models import JobDescription
from apps.resumes.models import Resume, ResumeVersion

from .models import Application, ApplicationEvent, CoverLetter, CoverLetterBlock, Notification, Reminder


class CoverLetterSerializer(serializers.ModelSerializer):
    resume = OwnedPrimaryKeyRelatedField(queryset=Resume.objects.all(), allow_null=True, required=False)
    job_description = OwnedPrimaryKeyRelatedField(
        queryset=JobDescription.objects.all(), allow_null=True, required=False
    )
    resume_title = serializers.CharField(source="resume.title", read_only=True, default=None)
    job_title = serializers.CharField(source="job_description.display_title", read_only=True, default=None)
    word_count = serializers.SerializerMethodField()

    class Meta:
        model = CoverLetter
        fields = [
            "id",
            "title",
            "company",
            "role",
            "tone",
            "resume",
            "resume_title",
            "job_description",
            "job_title",
            "hiring_manager",
            "motivation",
            "body",
            "word_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_word_count(self, obj):
        return len(obj.body.split())


class CoverLetterBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoverLetterBlock
        fields = ["id", "title", "text", "category", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ApplicationEventSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = ApplicationEvent
        fields = ["id", "kind", "kind_label", "title", "from_status", "to_status", "occurs_at", "note", "created_at"]
        read_only_fields = ["id", "from_status", "to_status", "created_at", "kind_label"]

    def validate_kind(self, v):
        if v in ("status", "created"):
            raise serializers.ValidationError("Status events are recorded automatically.")
        return v


class ReminderSerializer(serializers.ModelSerializer):
    application = OwnedPrimaryKeyRelatedField(queryset=Application.objects.all(), allow_null=True, required=False)
    application_label = serializers.SerializerMethodField()

    class Meta:
        model = Reminder
        fields = ["id", "application", "application_label", "title", "due_at", "done", "kind", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_application_label(self, obj):
        return str(obj.application) if obj.application_id else None


class ApplicationSerializer(serializers.ModelSerializer):
    resume_version = serializers.PrimaryKeyRelatedField(
        queryset=ResumeVersion.objects.all(), allow_null=True, required=False
    )
    cover_letter = OwnedPrimaryKeyRelatedField(queryset=CoverLetter.objects.all(), allow_null=True, required=False)
    job_description = OwnedPrimaryKeyRelatedField(
        queryset=JobDescription.objects.all(), allow_null=True, required=False
    )
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    resume_label = serializers.SerializerMethodField()
    cover_letter_title = serializers.CharField(source="cover_letter.title", read_only=True, default=None)
    open_reminders = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "company",
            "role",
            "job_url",
            "location",
            "work_mode",
            "status",
            "status_label",
            "saved_on",
            "applied_on",
            "deadline",
            "salary_note",
            "recruiter_name",
            "recruiter_email",
            "recruiter_phone",
            "notes",
            "next_action",
            "next_action_date",
            "resume_version",
            "resume_label",
            "cover_letter",
            "cover_letter_title",
            "job_description",
            "position",
            "open_reminders",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status_label", "created_at", "updated_at"]

    def validate_resume_version(self, v):
        request = self.context.get("request")
        if v is not None and (request is None or v.resume.owner_id != request.user.pk):
            raise serializers.ValidationError("Invalid resume version.")
        return v

    def validate(self, attrs):
        saved = attrs.get("saved_on", getattr(self.instance, "saved_on", None))
        deadline = attrs.get("deadline", getattr(self.instance, "deadline", None))
        if saved and deadline and deadline < saved:
            raise serializers.ValidationError({"deadline": "Deadline can't be before the date you saved the job."})
        return attrs

    def get_resume_label(self, obj):
        v = obj.resume_version
        return f"{v.resume.title} · v{v.number}" if v else None

    def get_open_reminders(self, obj):
        return obj.reminders.filter(done=False).count()


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Application.Status.choices)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)
    position = serializers.IntegerField(required=False, min_value=0)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "read", "created_at"]
        read_only_fields = ["id", "kind", "title", "body", "link", "created_at"]
