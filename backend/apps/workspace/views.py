import io
from collections import Counter
from datetime import datetime, time, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.core.common import AIThrottle, OwnedViewSetMixin, audit
from apps.intelligence import jobmatch
from apps.intelligence.ai import offline
from apps.intelligence.ai import schemas as S
from apps.intelligence.ai.service import run_task
from apps.intelligence.facts import resume_facts

from .models import Application, ApplicationEvent, CoverLetter, CoverLetterBlock, Notification, Reminder
from .serializers import (
    ApplicationEventSerializer,
    ApplicationSerializer,
    CoverLetterBlockSerializer,
    CoverLetterSerializer,
    NotificationSerializer,
    ReminderSerializer,
    StatusChangeSerializer,
)
from .tasks import dispatch_for

ACTIVE = ["interested", "preparing", "applied", "assessment", "interview", "offer"]


class CoverLetterViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = CoverLetter.objects.select_related("resume", "job_description")
    serializer_class = CoverLetterSerializer

    def get_throttles(self):
        return [AIThrottle()] if self.action == "generate" else super().get_throttles()

    @extend_schema(request=None, summary="Generate an editable draft from your resume facts and job context")
    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        letter = self.get_object()
        if not letter.resume_id:
            return Response(
                {"error": {"code": "resume_required", "message": "Choose the resume to draw facts from first."}},
                status=400,
            )
        content = letter.resume.get_content()
        facts = resume_facts(content)
        matched = []
        jd_text = ""
        if letter.job_description_id:
            jd = letter.job_description
            jd_text = jd.text
            match = jobmatch.match_resume(content, jd.parsed)
            matched = [s for r in match["requirements"] if r["status"] == "demonstrated" for s in r["skills"]][:5]
        tone = letter.tone if letter.tone in ("professional", "concise", "fresher", "formal") else "professional"
        offline_facts = {
            **facts,
            "company": letter.company,
            "role": letter.role,
            "matched_skills": list(dict.fromkeys(matched)),
            "motivation": letter.motivation,
        }
        fenced = {
            "resume_content": facts["text"],
            "user_notes": f"Why I'm applying (my own words): {letter.motivation or '(not provided)'}",
        }
        if jd_text:
            fenced["job_description"] = jd_text
        result = run_task(
            request.user,
            "cover_letter",
            S.CoverLetterOut,
            lambda: offline.cover_letter(offline_facts, tone),
            tone=tone,
            instructions=f"Company: {letter.company or '[Company]'}. Role: {letter.role or '[Role]'}. "
            f"Hiring manager: {letter.hiring_manager or 'unknown'}. Candidate name: {facts['name']}.",
            fenced=fenced,
            source_text=" ".join([facts["text"], letter.motivation, letter.company, letter.role, jd_text]),
        )
        r = result["result"]
        greeting = f"Dear {letter.hiring_manager}," if letter.hiring_manager else r["greeting"]
        result["draft_text"] = "\n\n".join([greeting, *r["paragraphs"], r["closing"]])
        return Response(result)

    @extend_schema(
        request={
            "application/json": {
                "type": "object",
                "properties": {"format": {"type": "string", "enum": ["pdf", "docx"]}},
            }
        },
        summary="Export the letter to your document vault",
    )
    @action(detail=True, methods=["post"])
    def export(self, request, pk=None):
        from apps.documents.models import GeneratedFile
        from apps.documents.serializers import GeneratedFileSerializer
        from apps.documents.storage import default_expiry, safe_filename, save_private
        from apps.documents.views import link_payload

        letter = self.get_object()
        if not letter.body.strip():
            return Response(
                {"error": {"code": "empty", "message": "Write or generate the letter before exporting."}}, status=400
            )
        fmt = request.data.get("format", "pdf")
        if fmt not in ("pdf", "docx"):
            fmt = "pdf"
        data = render_letter_pdf(letter, request.user) if fmt == "pdf" else render_letter_docx(letter, request.user)
        key = save_private(request.user, "exports", fmt, data)
        gf = GeneratedFile.objects.create(
            owner=request.user,
            kind=GeneratedFile.Kind.COVER_LETTER_PDF if fmt == "pdf" else GeneratedFile.Kind.COVER_LETTER_DOCX,
            title=letter.title,
            filename=safe_filename(f"Cover letter {letter.company}", fmt),
            storage_key=key,
            mime_type="application/pdf"
            if fmt == "pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size=len(data),
            cover_letter=letter,
            expires_at=default_expiry(),
        )
        audit(request.user, "cover_letter.exported", letter, format=fmt)
        return Response(
            {"file": GeneratedFileSerializer(gf).data, **link_payload("generated", gf, request.user)}, status=201
        )


def _letter_header(letter, user):
    name = user.full_name or user.email
    date = timezone.localdate().strftime("%d %B %Y")
    return name, user.email, date


def render_letter_pdf(letter, user) -> bytes:
    from xml.sax.saxutils import escape

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    from apps.resumes.renderers import resolve_font

    regular, bold, _ = resolve_font("sans")
    name, email, date = _letter_header(letter, user)
    body = ParagraphStyle("b", fontName=regular, fontSize=10.8, leading=15.5, spaceAfter=9)
    story = [
        Paragraph(escape(name), ParagraphStyle("n", fontName=bold, fontSize=15, leading=19)),
        Paragraph(escape(email), ParagraphStyle("e", fontName=regular, fontSize=9.5, leading=13)),
        Spacer(1, 12),
        Paragraph(escape(date), body),
    ]
    if letter.company:
        story.append(Paragraph(escape(letter.company), body))
    for para in [p for p in letter.body.split("\n\n") if p.strip()]:
        story.append(Paragraph(escape(para.strip()).replace("\n", "<br/>"), body))
    buf = io.BytesIO()
    SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=letter.title,
        author=name,
        creator="Infyro AI Resume",
    ).build(story)
    return buf.getvalue()


def render_letter_docx(letter, user) -> bytes:
    from docx import Document

    name, email, date = _letter_header(letter, user)
    doc = Document()
    doc.add_paragraph().add_run(name).bold = True
    doc.add_paragraph(email)
    doc.add_paragraph(date)
    if letter.company:
        doc.add_paragraph(letter.company)
    for para in [p for p in letter.body.split("\n\n") if p.strip()]:
        doc.add_paragraph(para.strip())
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


class CoverLetterBlockViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = CoverLetterBlock.objects.all()
    serializer_class = CoverLetterBlockSerializer
    pagination_class = None


class ApplicationViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = Application.objects.select_related("resume_version__resume", "cover_letter").prefetch_related(
        "reminders"
    )
    serializer_class = ApplicationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        elif p.get("include_archived") != "1" and self.action == "list":
            qs = qs.exclude(status="archived")
        if p.get("q"):
            q = p["q"][:80]
            qs = qs.filter(Q(company__icontains=q) | Q(role__icontains=q) | Q(location__icontains=q))
        if p.get("work_mode"):
            qs = qs.filter(work_mode=p["work_mode"])
        ordering = p.get("ordering")
        allowed = {"deadline", "-deadline", "saved_on", "-saved_on", "company", "-company", "updated_at", "-updated_at"}
        if ordering in allowed:
            qs = qs.order_by(ordering)
        return qs

    def paginate_queryset(self, queryset):
        if self.request.query_params.get("all") == "1":
            return None
        return super().paginate_queryset(queryset)

    @transaction.atomic
    def perform_create(self, serializer):
        app = serializer.save(owner=self.request.user)
        ApplicationEvent.objects.create(application=app, kind="created", title="Added to tracker", to_status=app.status)
        if app.status == "applied" and not app.applied_on:
            app.applied_on = timezone.localdate()
            app.save(update_fields=["applied_on"])
        if app.deadline:
            ApplicationEvent.objects.create(
                application=app,
                kind="deadline",
                title="Application deadline",
                occurs_at=timezone.make_aware(datetime.combine(app.deadline, time(9, 0))),
            )

    @transaction.atomic
    def perform_update(self, serializer):
        before = serializer.instance.status
        app = serializer.save()
        if app.status != before:
            self._record_status(app, before, "")

    def _record_status(self, app, before, note):
        ApplicationEvent.objects.create(
            application=app,
            kind="status",
            title=f"{dict(Application.Status.choices)[before]} → {app.get_status_display()}",
            from_status=before,
            to_status=app.status,
            note=note,
        )
        if app.status == "applied" and not app.applied_on:
            app.applied_on = timezone.localdate()
            app.save(update_fields=["applied_on"])

    @extend_schema(
        request=StatusChangeSerializer, responses={200: ApplicationSerializer}, summary="Move to another pipeline stage"
    )
    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        app = self.get_object()
        s = StatusChangeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        before = app.status
        with transaction.atomic():
            app.status = s.validated_data["status"]
            if "position" in s.validated_data:
                app.position = s.validated_data["position"]
            app.save()
            if before != app.status:
                self._record_status(app, before, s.validated_data.get("note", ""))
        suggestion = None
        if app.status == "applied" and before != "applied":
            days = request.user.profile.followup_days
            suggestion = {
                "title": f"Follow up with {app.company} about {app.role}",
                "due_at": (timezone.now() + timedelta(days=days)).replace(hour=9, minute=0, second=0, microsecond=0),
                "days": days,
                "kind": "follow_up",
            }
        return Response(
            {
                "application": ApplicationSerializer(app, context={"request": request}).data,
                "suggested_reminder": suggestion,
            }
        )

    @extend_schema(
        request=ApplicationEventSerializer, responses={200: ApplicationEventSerializer(many=True)}, summary="Timeline"
    )
    @action(detail=True, methods=["get", "post"])
    def events(self, request, pk=None):
        app = self.get_object()
        if request.method == "POST":
            s = ApplicationEventSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            ev = s.save(application=app)
            if ev.kind == "interview" and ev.occurs_at:
                Reminder.objects.create(
                    owner=request.user,
                    application=app,
                    kind="interview",
                    title=f"Interview: {app.company} — {ev.title}",
                    due_at=ev.occurs_at - timedelta(hours=24),
                )
            return Response(ApplicationEventSerializer(ev).data, status=201)
        return Response(ApplicationEventSerializer(app.events.all(), many=True).data)

    @extend_schema(summary="Personal pipeline insights and weekly goal")
    @action(detail=False, methods=["get"])
    def insights(self, request):
        apps = list(Application.objects.filter(owner=request.user))
        by_status = Counter(a.status for a in apps)
        history = ApplicationEvent.objects.filter(application__owner=request.user, kind="status")
        reached = Counter()
        for ev in history:
            reached[(ev.application_id, ev.to_status)] = 1

        def reached_stage(stages):
            return sum(1 for a in apps if a.status in stages or any(reached.get((a.pk, s)) for s in stages))

        applied = reached_stage(["applied", "assessment", "interview", "offer", "rejected"])
        responded = reached_stage(["assessment", "interview", "offer"]) + sum(
            1 for a in apps if a.status == "rejected" and a.applied_on
        )
        interviews = reached_stage(["interview", "offer"])
        offers = reached_stage(["offer"])
        week_start = timezone.localdate() - timedelta(days=timezone.localdate().weekday())
        this_week = sum(1 for a in apps if a.applied_on and a.applied_on >= week_start)
        goal = request.user.profile.weekly_application_goal
        by_role = Counter(a.role.strip().title() for a in apps if a.status != "archived").most_common(6)
        return Response(
            {
                "total": len(apps),
                "by_status": {k: by_status.get(k, 0) for k, _ in Application.Status.choices},
                "by_role": [{"role": r, "count": c} for r, c in by_role],
                "funnel": {"applied": applied, "responded": responded, "interviews": interviews, "offers": offers},
                "rates": {
                    "response": round(100 * responded / applied) if applied else None,
                    "interview": round(100 * interviews / applied) if applied else None,
                },
                "weekly_goal": {"goal": goal, "applied_this_week": this_week, "week_start": week_start},
                "note": "Calculated only from applications you've recorded here.",
            }
        )


class ReminderViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = Reminder.objects.select_related("application")
    serializer_class = ReminderSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("done") in ("0", "1"):
            qs = qs.filter(done=p["done"] == "1")
        if p.get("application"):
            qs = qs.filter(application_id=p["application"])
        return qs

    def perform_update(self, serializer):
        inst = serializer.save()
        if "due_at" in serializer.validated_data and inst.due_at > timezone.now():
            inst.notified = False
            inst.save(update_fields=["notified"])


class NotificationViewSet(
    OwnedViewSetMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer

    def list(self, request, *args, **kwargs):
        dispatch_for(request.user)  # cheap, keeps in-app reminders timely without a beat worker
        resp = super().list(request, *args, **kwargs)
        resp.data["unread"] = Notification.objects.filter(owner=request.user, read=False).count()
        return resp

    @extend_schema(request=None, responses={204: None}, summary="Mark all notifications read")
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        Notification.objects.filter(owner=request.user, read=False).update(read=True)
        return Response(status=204)


@extend_schema(summary="Dashboard overview built only from your stored data")
@api_view(["GET"])
def dashboard(request):
    from apps.career.models import InterviewSession, LearningPlan, LearningPlanItem
    from apps.intelligence.models import AnalysisReport
    from apps.resumes.models import Resume

    user = request.user
    profile = user.profile
    resumes = list(
        Resume.objects.filter(owner=user)
        .exclude(status="archived")
        .select_related("template")
        .order_by("-updated_at")[:4]
    )
    reports = (
        AnalysisReport.objects.filter(owner=user)
        .select_related("resume", "job_description")
        .order_by("-created_at")[:4]
    )
    apps = Application.objects.filter(owner=user)
    pipeline = Counter(apps.exclude(status="archived").values_list("status", flat=True))
    upcoming = Reminder.objects.filter(
        owner=user, done=False, due_at__lte=timezone.now() + timedelta(days=14)
    ).select_related("application")[:6]
    deadlines = apps.filter(
        status__in=ACTIVE, deadline__gte=timezone.localdate(), deadline__lte=timezone.localdate() + timedelta(days=14)
    ).order_by("deadline")[:5]
    sessions = InterviewSession.objects.filter(owner=user).order_by("-updated_at")[:3]
    plan_items = LearningPlanItem.objects.filter(plan__owner=user)
    total_items = plan_items.count()
    done_items = (
        plan_items.filter(status="demonstrated").count()
        + plan_items.filter(status="learning", completed_at__isnull=False).count()
    )

    actions = []
    if not profile.onboarding_completed:
        actions.append(
            {
                "id": "onboarding",
                "title": "Finish setting up your profile",
                "href": "/app/onboarding",
                "reason": "Personalises suggestions.",
            }
        )
    if not resumes:
        actions.append(
            {
                "id": "first_resume",
                "title": "Create or import your first resume",
                "href": "/app/resumes",
                "reason": "Everything else builds on it.",
            }
        )
    else:
        latest = resumes[0]
        last_health = (
            AnalysisReport.objects.filter(owner=user, resume=latest, kind="health").order_by("-created_at").first()
        )
        if last_health is None or last_health.created_at < latest.updated_at:
            actions.append(
                {
                    "id": "health",
                    "title": f"Run a health check on “{latest.title}”",
                    "href": f"/app/analysis?resume={latest.pk}",
                    "reason": "It changed since its last check." if last_health else "It hasn't been checked yet.",
                }
            )
        if not AnalysisReport.objects.filter(owner=user, kind="match").exists():
            actions.append(
                {
                    "id": "match",
                    "title": "Compare your resume with a job description",
                    "href": "/app/job-match",
                    "reason": "See which requirements your resume evidences.",
                }
            )
    if deadlines:
        d = deadlines[0]
        actions.append(
            {
                "id": f"deadline-{d.pk}",
                "title": f"{d.company} deadline on {d.deadline.strftime('%d %b')}",
                "href": f"/app/applications?open={d.pk}",
                "reason": f"Status: {d.get_status_display()}.",
            }
        )
    stale = (
        apps.filter(status="applied", applied_on__lte=timezone.localdate() - timedelta(days=profile.followup_days))
        .exclude(reminders__done=False)
        .first()
    )
    if stale:
        actions.append(
            {
                "id": f"follow-{stale.pk}",
                "title": f"Consider following up with {stale.company}",
                "href": f"/app/applications?open={stale.pk}",
                "reason": f"Applied {(timezone.localdate() - stale.applied_on).days} days ago, no open reminder.",
            }
        )
    if not sessions and apps.filter(status__in=["interview", "assessment"]).exists():
        actions.append(
            {
                "id": "practice",
                "title": "Practise for your upcoming interview",
                "href": "/app/interview",
                "reason": "You have an application at interview stage.",
            }
        )

    return Response(
        {
            "profile": {
                "completion": profile.completion,
                "onboarding_completed": profile.onboarding_completed,
                "preferred_roles": profile.preferred_roles,
                "experience_level": profile.experience_level,
            },
            "resumes": [
                {
                    "id": r.pk,
                    "title": r.title,
                    "target_role": r.target_role,
                    "template": r.template.slug,
                    "status": r.status,
                    "updated_at": r.updated_at,
                    "latest_version": (v.number if (v := r.versions.order_by("-number").first()) else None),
                }
                for r in resumes
            ],
            "reports": [
                {
                    "id": r.pk,
                    "kind": r.kind,
                    "resume_title": r.resume.title if r.resume else None,
                    "job_title": r.job_description.display_title if r.job_description else None,
                    "quality_score": r.quality_score,
                    "match_score": r.match_score,
                    "created_at": r.created_at,
                }
                for r in reports
            ],
            "pipeline": {k: pipeline.get(k, 0) for k in ACTIVE + ["rejected", "withdrawn"]},
            "applications_total": apps.count(),
            "upcoming": [
                {"id": r.pk, "title": r.title, "due_at": r.due_at, "kind": r.kind, "application": r.application_id}
                for r in upcoming
            ],
            "deadlines": [
                {"id": a.pk, "company": a.company, "role": a.role, "deadline": a.deadline, "status": a.status}
                for a in deadlines
            ],
            "interview": {
                "sessions": [
                    {"id": s.pk, "title": s.title, "updated_at": s.updated_at, "answered": s.answered_count}
                    for s in sessions
                ]
            },
            "skills": {
                "plans": LearningPlan.objects.filter(owner=user).count(),
                "items": total_items,
                "completed": done_items,
            },
            "next_actions": actions[:6],
        }
    )
