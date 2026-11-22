from rest_framework import serializers

from apps.core.common import OwnedPrimaryKeyRelatedField
from apps.intelligence.models import JobDescription
from apps.resumes.models import Resume

from .models import AnswerDraft, InterviewQuestion, InterviewSession, LearningPlan, LearningPlanItem, PortfolioProject

DEFAULT_EVIDENCE = [
    "Public repository or source link",
    "README explaining what it does and how to run it",
    "Demo link, video or screenshots",
    "Your specific role and contribution stated",
    "Results backed by evidence (usage, feedback, tests, grade)",
    "Architecture or design notes",
    "Tests or quality checks",
]


def _links(value):
    if not isinstance(value, list) or len(value) > 10:
        raise serializers.ValidationError("Provide up to 10 links.")
    out = []
    for item in value:
        url = str((item or {}).get("url", "")).strip()
        if not url:
            continue
        if not url.startswith(("http://", "https://")):
            raise serializers.ValidationError("Links must start with http:// or https://")
        out.append({"label": str(item.get("label", "") or "Link")[:60], "url": url[:400]})
    return out


class AnswerDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnswerDraft
        fields = [
            "id",
            "question",
            "text",
            "star",
            "rubric",
            "feedback",
            "duration_seconds",
            "favourite",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "question", "rubric", "feedback", "created_at", "updated_at"]


class InterviewQuestionSerializer(serializers.ModelSerializer):
    latest_answer = serializers.SerializerMethodField()
    attempts = serializers.SerializerMethodField()

    class Meta:
        model = InterviewQuestion
        fields = ["id", "order", "category", "text", "why", "follow_ups", "source", "latest_answer", "attempts"]
        read_only_fields = ["id", "source", "latest_answer", "attempts"]

    def get_latest_answer(self, obj):
        a = obj.answers.first()
        return AnswerDraftSerializer(a).data if a else None

    def get_attempts(self, obj):
        return obj.answers.count()


class InterviewSessionSerializer(serializers.ModelSerializer):
    job_description = OwnedPrimaryKeyRelatedField(
        queryset=JobDescription.objects.all(), allow_null=True, required=False
    )
    resume = OwnedPrimaryKeyRelatedField(queryset=Resume.objects.all(), allow_null=True, required=False)
    answered_count = serializers.ReadOnlyField()
    question_count = serializers.SerializerMethodField()
    job_title = serializers.CharField(source="job_description.display_title", read_only=True, default=None)

    class Meta:
        model = InterviewSession
        fields = [
            "id",
            "title",
            "target_role",
            "job_description",
            "job_title",
            "resume",
            "mode",
            "timed",
            "seconds_per_question",
            "generated_by",
            "answered_count",
            "question_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "generated_by", "created_at", "updated_at"]
        extra_kwargs = {"seconds_per_question": {"min_value": 30, "max_value": 600}}

    def get_question_count(self, obj):
        return obj.questions.count()


class InterviewSessionDetailSerializer(InterviewSessionSerializer):
    questions = InterviewQuestionSerializer(many=True, read_only=True)

    class Meta(InterviewSessionSerializer.Meta):
        fields = InterviewSessionSerializer.Meta.fields + ["questions"]


class SessionCreateSerializer(InterviewSessionSerializer):
    question_count = serializers.IntegerField(min_value=3, max_value=15, default=8, write_only=True)

    class Meta(InterviewSessionSerializer.Meta):
        fields = InterviewSessionSerializer.Meta.fields


class AnswerSubmitSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=6000)
    star = serializers.DictField(child=serializers.CharField(allow_blank=True, max_length=1500), required=False)
    duration_seconds = serializers.IntegerField(min_value=0, max_value=3600, required=False, allow_null=True)


class StarRequestSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=400)
    notes = serializers.CharField(max_length=4000)


class PortfolioProjectSerializer(serializers.ModelSerializer):
    link_verification = serializers.SerializerMethodField()

    class Meta:
        model = PortfolioProject
        fields = [
            "id",
            "title",
            "kind",
            "summary",
            "role",
            "problem",
            "users",
            "approach",
            "architecture",
            "tools",
            "results",
            "lessons",
            "github_url",
            "demo_url",
            "portfolio_url",
            "evidence",
            "drafts",
            "link_verification",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "link_verification", "created_at", "updated_at"]

    def get_link_verification(self, obj):
        return "Links are stored as you entered them. Infyro does not visit or verify repositories or websites."

    def validate_tools(self, v):
        if not isinstance(v, list) or len(v) > 30:
            raise serializers.ValidationError("Up to 30 tools.")
        return [str(t).strip()[:60] for t in v if str(t).strip()]

    def validate_evidence(self, v):
        if not isinstance(v, list) or len(v) > 20:
            raise serializers.ValidationError("Up to 20 checklist items.")
        return [
            {"label": str(i.get("label", ""))[:120], "done": bool(i.get("done"))}
            for i in v
            if isinstance(i, dict) and i.get("label")
        ]

    def validate_drafts(self, v):
        if not isinstance(v, dict) or len(str(v)) > 30000:
            raise serializers.ValidationError("Drafts are too large.")
        return v

    def create(self, validated):
        validated.setdefault("evidence", [{"label": label, "done": False} for label in DEFAULT_EVIDENCE])
        return super().create(validated)


class LearningPlanItemSerializer(serializers.ModelSerializer):
    plan = OwnedPrimaryKeyRelatedField(queryset=LearningPlan.objects.all())
    linked_project = OwnedPrimaryKeyRelatedField(
        queryset=PortfolioProject.objects.all(), allow_null=True, required=False
    )
    progress = serializers.ReadOnlyField()
    can_claim_on_resume = serializers.SerializerMethodField()
    linked_project_title = serializers.CharField(source="linked_project.title", read_only=True, default=None)

    class Meta:
        model = LearningPlanItem
        fields = [
            "id",
            "plan",
            "skill",
            "category",
            "importance",
            "status",
            "milestones",
            "practice_tasks",
            "project_ideas",
            "evidence_links",
            "linked_project",
            "linked_project_title",
            "target_date",
            "completed_at",
            "order",
            "progress",
            "can_claim_on_resume",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "progress", "can_claim_on_resume", "created_at", "updated_at"]

    def get_can_claim_on_resume(self, obj):
        return obj.status == "demonstrated"

    def validate_milestones(self, v):
        if not isinstance(v, list) or len(v) > 15:
            raise serializers.ValidationError("Up to 15 milestones.")
        out = []
        for i, m in enumerate(v):
            if isinstance(m, dict) and str(m.get("title", "")).strip():
                out.append(
                    {
                        "id": str(m.get("id") or i),
                        "title": str(m["title"])[:200],
                        "done": bool(m.get("done")),
                        "due": m.get("due") or None,
                    }
                )
        return out

    def validate_practice_tasks(self, v):
        return [str(x)[:200] for x in v][:10] if isinstance(v, list) else []

    def validate_project_ideas(self, v):
        return [str(x)[:300] for x in v][:6] if isinstance(v, list) else []

    def validate_evidence_links(self, v):
        return _links(v)

    def validate(self, attrs):
        from django.utils import timezone

        status = attrs.get("status", getattr(self.instance, "status", None))
        if (
            status == "demonstrated"
            and not attrs.get("completed_at")
            and not getattr(self.instance, "completed_at", None)
        ):
            attrs["completed_at"] = timezone.localdate()
        return attrs


class LearningPlanSerializer(serializers.ModelSerializer):
    job_description = OwnedPrimaryKeyRelatedField(
        queryset=JobDescription.objects.all(), allow_null=True, required=False
    )
    items = LearningPlanItemSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = LearningPlan
        fields = [
            "id",
            "title",
            "target_role",
            "job_description",
            "notes",
            "items",
            "progress",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "items", "progress", "created_at", "updated_at"]

    def get_progress(self, obj):
        items = list(obj.items.all())
        if not items:
            return {"percent": 0, "demonstrated": 0, "learning": 0, "not_held": 0, "total": 0}
        return {
            "percent": round(sum(i.progress for i in items) / len(items)),
            "demonstrated": sum(1 for i in items if i.status == "demonstrated"),
            "learning": sum(1 for i in items if i.status == "learning"),
            "not_held": sum(1 for i in items if i.status == "not_held"),
            "total": len(items),
        }
