from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, throttle_classes
from rest_framework.response import Response

from apps.core.common import AIThrottle, OwnedViewSetMixin, audit
from apps.documents.models import UploadedDocument
from apps.resumes.models import Resume

from . import health, jobmatch
from .ai import offline
from .ai import schemas as S
from .ai.provider import provider_status
from .ai.service import run_task, usage_today
from .facts import resume_facts
from .models import AIRequestLog, AnalysisReport, JobDescription
from .serializers import (
    AchievementRequest,
    BulletRequest,
    FeedbackRequest,
    HealthRequestSerializer,
    JobDescriptionListSerializer,
    JobDescriptionSerializer,
    MatchRequestSerializer,
    ProjectRequest,
    ReportDetailSerializer,
    ReportListSerializer,
    ReportUpdateSerializer,
    SummaryRequest,
    TextRequest,
)


class JobDescriptionViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = JobDescription.objects.all()

    def get_serializer_class(self):
        return JobDescriptionListSerializer if self.action == "list" else JobDescriptionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("q")
        return qs.filter(title__icontains=q[:80]) if q else qs

    def perform_create(self, serializer):
        d = serializer.validated_data
        serializer.save(owner=self.request.user, parsed=jobmatch.parse_job_description(d["text"], d.get("title", "")))

    def perform_update(self, serializer):
        inst = serializer.instance
        text = serializer.validated_data.get("text", inst.text)
        title = serializer.validated_data.get("title", inst.title)
        serializer.save(parsed=jobmatch.parse_job_description(text, title))

    @extend_schema(
        parameters=[OpenApiParameter("other", int, required=True)],
        summary="Compare skill emphasis with another saved JD",
    )
    @action(detail=True, methods=["get"])
    def compare(self, request, pk=None):
        a = self.get_object()
        b = self.get_queryset().filter(pk=request.query_params.get("other")).first()
        if b is None:
            return Response(
                {"error": {"code": "not_found", "message": "Choose a second saved job description."}}, status=404
            )
        return Response(
            {
                "a": JobDescriptionListSerializer(a).data,
                "b": JobDescriptionListSerializer(b).data,
                **jobmatch.compare_job_descriptions(a.parsed, b.parsed),
            }
        )

    @extend_schema(
        request={"application/json": {"type": "object", "properties": {"text": {"type": "string"}}}},
        summary="Preview extraction for pasted text without saving",
    )
    @action(detail=False, methods=["post"])
    def preview(self, request):
        text = str(request.data.get("text", ""))[:30000]
        return Response(jobmatch.parse_job_description(text, str(request.data.get("title", ""))[:160]))


class ReportViewSet(
    OwnedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = AnalysisReport.objects.select_related("resume", "resume_version", "job_description", "upload")

    def get_serializer_class(self):
        return ReportDetailSerializer if self.action in ("retrieve", "partial_update") else ReportListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("kind"):
            qs = qs.filter(kind=p["kind"])
        if p.get("resume"):
            qs = qs.filter(resume_id=p["resume"])
        if p.get("job_description"):
            qs = qs.filter(job_description_id=p["job_description"])
        return qs

    @extend_schema(
        request=ReportUpdateSerializer,
        responses={200: ReportDetailSerializer},
        summary="Mark findings resolved / checklist done",
    )
    def partial_update(self, request, pk=None):
        report = self.get_object()
        s = ReportUpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if "resolved_findings" in s.validated_data:
            report.resolved_findings = s.validated_data["resolved_findings"]
        if "checklist_done" in s.validated_data:
            done = set(s.validated_data["checklist_done"])
            report.checklist = [{**c, "done": c["id"] in done} for c in report.checklist]
        report.save(update_fields=["resolved_findings", "checklist", "updated_at"])
        return Response(ReportDetailSerializer(report).data)

    @extend_schema(
        request=HealthRequestSerializer, responses={201: ReportDetailSerializer}, summary="Run a resume health check"
    )
    @action(detail=False, methods=["post"])
    def health(self, request):
        s = HealthRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        level = getattr(getattr(request.user, "profile", None), "experience_level", "")
        if s.validated_data.get("resume_id"):
            resume = Resume.objects.filter(owner=request.user, pk=s.validated_data["resume_id"]).first()
            if resume is None:
                return Response(status=404)
            version = resume.snapshot(reason="analysis", label="Health check")
            result = health.analyse_resume(version.content, level)
            report = AnalysisReport.objects.create(
                owner=request.user,
                kind=AnalysisReport.Kind.HEALTH,
                resume=resume,
                resume_version=version,
                quality_score=result["quality_score"],
                categories=result["categories"],
                findings=result["findings"],
                strengths=result["strengths"],
                summary=result["summary"],
                extracted_preview=result["extracted_preview"],
                rules_version=result["rules_version"],
            )
        else:
            doc = UploadedDocument.objects.filter(owner=request.user, pk=s.validated_data["upload_id"]).first()
            if doc is None:
                return Response(status=404)
            if doc.status not in (UploadedDocument.Status.PARSED, UploadedDocument.Status.NEEDS_REVIEW):
                return Response(
                    {"error": {"code": "not_ready", "message": "This file hasn't been processed successfully yet."}},
                    status=409,
                )
            content_report = health.analyse_resume(doc.parsed, level)
            result = health.analyse_upload_extraction(doc, content_report)
            report = AnalysisReport.objects.create(
                owner=request.user,
                kind=AnalysisReport.Kind.UPLOAD,
                upload=doc,
                quality_score=result["quality_score"],
                categories=result["categories"],
                findings=result["findings"],
                strengths=result["strengths"],
                summary=result["summary"],
                extracted_preview=result["extracted_preview"],
                rules_version=result["rules_version"],
            )
        audit(request.user, "analysis.health_run", report)
        return Response(ReportDetailSerializer(report).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=MatchRequestSerializer,
        responses={201: ReportDetailSerializer},
        summary="Compare a resume with a job description and map evidence",
    )
    @action(detail=False, methods=["post"])
    def match(self, request):
        s = MatchRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        resume = Resume.objects.filter(owner=request.user, pk=d["resume_id"]).first()
        if resume is None:
            return Response(status=404)
        with transaction.atomic():
            if d.get("job_description_id"):
                jd = JobDescription.objects.filter(owner=request.user, pk=d["job_description_id"]).first()
                if jd is None:
                    return Response(status=404)
            else:
                parsed = jobmatch.parse_job_description(d["text"], d.get("title", ""))
                jd = JobDescription.objects.create(
                    owner=request.user,
                    title=d.get("title", "") or parsed["role_title"],
                    company=d.get("company", ""),
                    source_url=d.get("source_url", ""),
                    text=d["text"].strip(),
                    parsed=parsed,
                )
            version = resume.snapshot(reason="analysis", label=f"Matched to {jd.display_title}"[:120])
            result = jobmatch.match_resume(version.content, jd.parsed)
            report = AnalysisReport.objects.create(
                owner=request.user,
                kind=AnalysisReport.Kind.MATCH,
                resume=resume,
                resume_version=version,
                job_description=jd,
                match_score=result["match_score"],
                requirements=result["requirements"],
                checklist=result["checklist"],
                summary={
                    "formula": result["formula"],
                    "counts": result["counts"],
                    "experience_months": result["experience_months"],
                    "disclaimer": health.DISCLAIMER,
                    "jd_warnings": jd.parsed.get("warnings", []),
                    "distinction_supported": jd.parsed.get("distinction_supported", False),
                },
                rules_version=result["rules_version"],
            )
        audit(request.user, "analysis.match_run", report)
        return Response(ReportDetailSerializer(report).data, status=status.HTTP_201_CREATED)


# --- Writing Studio ----------------------------------------------------------------------
def _ai_response(result):
    return Response(result, status=200)


@extend_schema(summary="AI mode, consent status and today's usage")
@api_view(["GET"])
def ai_status(request):
    profile = getattr(request.user, "profile", None)
    return Response(
        {**provider_status(), "consent": bool(profile and profile.ai_consent), "usage": usage_today(request.user)}
    )


@extend_schema(request=SummaryRequest, summary="Draft professional summaries from your resume facts")
@api_view(["POST"])
@throttle_classes([AIThrottle])
def ai_summary(request):
    s = SummaryRequest(data=request.data)
    s.is_valid(raise_exception=True)
    resume = Resume.objects.filter(owner=request.user, pk=s.validated_data["resume_id"]).first()
    if resume is None:
        return Response(status=404)
    facts = resume_facts(resume.get_content())
    profile = request.user.profile
    facts.update(
        target_role=s.validated_data.get("target_role") or resume.target_role, experience_level=profile.experience_level
    )
    tone = s.validated_data["tone"]
    return _ai_response(
        run_task(
            request.user,
            "summary",
            S.SummaryOut,
            lambda: offline.summary(facts, tone),
            tone=tone,
            instructions=f"Target role: {facts['target_role'] or 'not specified'}. Experience level: {profile.get_experience_level_display() or 'not specified'}.",
            fenced={"resume_content": facts["text"]},
            source_text=facts["text"] + " " + (facts["target_role"] or ""),
        )
    )


@extend_schema(request=BulletRequest, summary="Rewrite a bullet as action + task + result")
@api_view(["POST"])
@throttle_classes([AIThrottle])
def ai_bullet(request):
    s = BulletRequest(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    context = f"Role: {d.get('role', '')}. Organisation: {d.get('organization', '')}. Tools: {d.get('tools', '')}."
    return _ai_response(
        run_task(
            request.user,
            "bullet",
            S.BulletOut,
            lambda: offline.bullet(d["text"], d["tone"], {"tools": d.get("tools", "")}),
            tone=d["tone"],
            fenced={"user_notes": f"{d['text']}\n\nContext — {context}"},
        )
    )


@extend_schema(request=ProjectRequest, summary="Describe a project (problem, approach, tools, outcome)")
@api_view(["POST"])
@throttle_classes([AIThrottle])
def ai_project(request):
    s = ProjectRequest(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    details = "\n".join(
        f"{k.capitalize()}: {d.get(k, '')}" for k in ("name", "problem", "approach", "tools", "outcome")
    )
    return _ai_response(
        run_task(
            request.user,
            "project",
            S.ProjectOut,
            lambda: offline.project(d, d["tone"]),
            tone=d["tone"],
            fenced={"project_details": details},
        )
    )


@extend_schema(request=AchievementRequest, summary="Turn notes into a context-action-result achievement")
@api_view(["POST"])
@throttle_classes([AIThrottle])
def ai_achievement(request):
    s = AchievementRequest(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    return _ai_response(
        run_task(
            request.user,
            "achievement",
            S.AchievementOut,
            lambda: offline.achievement(d["notes"], d.get("context", "")),
            tone=d["tone"],
            fenced={"user_notes": f"{d.get('context', '')}\n{d['notes']}"},
        )
    )


@extend_schema(request=TextRequest, summary="Suggest action verbs")
@api_view(["POST"])
@throttle_classes([AIThrottle])
def ai_verbs(request):
    s = TextRequest(data=request.data)
    s.is_valid(raise_exception=True)
    text = s.validated_data["text"]
    return _ai_response(
        run_task(request.user, "verbs", S.VerbsOut, lambda: offline.action_verbs(text), fenced={"user_notes": text})
    )


@extend_schema(request=TextRequest, summary="Grammar, spelling, repetition, tense and consistency review")
@api_view(["POST"])
@throttle_classes([AIThrottle])
def ai_proofread(request):
    s = TextRequest(data=request.data)
    s.is_valid(raise_exception=True)
    text = s.validated_data["text"]
    # Proofreading is deterministic and local: it never needs to leave the server.
    result = offline.proofread(text, s.validated_data.get("current_role"))
    return Response(
        {
            "mode": "offline",
            "provider": "Rule-based proofreader",
            "model": None,
            "label": "Automated checks — use your judgement.",
            "result": result.model_dump(),
            "warnings": [],
            "notice": None,
            "log_id": None,
        }
    )


@extend_schema(
    request=FeedbackRequest,
    responses={204: None},
    summary="Record whether a suggestion was accepted, edited or rejected",
)
@api_view(["POST"])
def ai_feedback(request):
    s = FeedbackRequest(data=request.data)
    s.is_valid(raise_exception=True)
    AIRequestLog.objects.filter(owner=request.user, pk=s.validated_data["log_id"]).update(
        outcome=s.validated_data["outcome"]
    )
    return Response(status=204)
