from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action, api_view, throttle_classes
from rest_framework.response import Response

from apps.core.common import AIThrottle, OwnedViewSetMixin, audit
from apps.intelligence import jobmatch, lexicon
from apps.intelligence.ai import offline
from apps.intelligence.ai import schemas as S
from apps.intelligence.ai.service import run_task
from apps.intelligence.facts import resume_facts
from apps.intelligence.models import AnalysisReport, JobDescription
from apps.resumes import content as C
from apps.resumes.models import Resume

from .models import AnswerDraft, InterviewQuestion, InterviewSession, LearningPlan, LearningPlanItem, PortfolioProject
from .rubric import score_answer
from .serializers import (
    AnswerDraftSerializer,
    AnswerSubmitSerializer,
    InterviewQuestionSerializer,
    InterviewSessionDetailSerializer,
    InterviewSessionSerializer,
    LearningPlanItemSerializer,
    LearningPlanSerializer,
    PortfolioProjectSerializer,
    SessionCreateSerializer,
    StarRequestSerializer,
)


class InterviewSessionViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = InterviewSession.objects.select_related("job_description").prefetch_related("questions__answers")

    def get_serializer_class(self):
        if self.action == "create":
            return SessionCreateSerializer
        return InterviewSessionDetailSerializer if self.action == "retrieve" else InterviewSessionSerializer

    def get_throttles(self):
        return [AIThrottle()] if self.action in ("create", "regenerate") else super().get_throttles()

    def create(self, request):
        s = SessionCreateSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        count = s.validated_data.pop("question_count", 8)
        with transaction.atomic():
            session = s.save(owner=request.user)
            self._generate(session, count)
        return Response(InterviewSessionDetailSerializer(session).data, status=status.HTTP_201_CREATED)

    def _generate(self, session, count):
        jd = session.job_description
        parsed = jd.parsed if jd else {"requirements": [], "responsibilities": []}
        req_skills = list(
            dict.fromkeys(s for r in parsed["requirements"] if r["kind"] != "preferred" for s in r["skills"])
        )
        req_skills = [s for s in req_skills if lexicon.category_of(s) != lexicon.SOFT_CATEGORY]
        facts = (
            resume_facts(session.resume.get_content())
            if session.resume
            else {"text": "", "projects": [], "highlights": []}
        )
        projects = facts["projects"] or facts["highlights"][:2]
        fenced = {}
        if jd:
            fenced["job_description"] = jd.text
        if facts["text"]:
            fenced["resume_content"] = facts["text"]
        result = run_task(
            session.owner,
            "interview_questions",
            S.QuestionsOut,
            lambda: offline.interview_questions(
                session.target_role, req_skills, parsed["responsibilities"], projects, count
            ),
            instructions=f"Target role: {session.target_role or 'not specified'}. Generate exactly {count} questions: a mix of technical, behavioral and role-specific.",
            fenced=fenced,
            apply_fact_check=False,
        )
        session.generated_by = result["mode"]
        session.save(update_fields=["generated_by"])
        start = session.questions.count()
        for i, q in enumerate(result["result"]["questions"][:count]):
            InterviewQuestion.objects.create(
                session=session,
                order=start + i,
                category=q["category"],
                text=q["text"][:400],
                why=q.get("why", "")[:300],
                follow_ups=q.get("follow_ups", [])[:3],
                source=result["mode"],
            )
        return result

    @extend_schema(request=None, summary="Add more generated questions to this session")
    @action(detail=True, methods=["post"])
    def regenerate(self, request, pk=None):
        session = self.get_object()
        result = self._generate(session, int(request.data.get("count", 5) or 5))
        return Response({**InterviewSessionDetailSerializer(session).data, "notice": result["notice"]})

    @extend_schema(
        request=InterviewQuestionSerializer,
        responses={201: InterviewQuestionSerializer},
        summary="Add your own question",
    )
    @action(detail=True, methods=["post"], url_path="questions")
    def add_question(self, request, pk=None):
        session = self.get_object()
        s = InterviewQuestionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        q = s.save(session=session, source="user", order=session.questions.count())
        return Response(InterviewQuestionSerializer(q).data, status=201)


def _owned_question(request, pk):
    return (
        InterviewQuestion.objects.filter(session__owner=request.user, pk=pk)
        .select_related("session__job_description")
        .first()
    )


@extend_schema(
    request=AnswerSubmitSerializer,
    responses={201: AnswerDraftSerializer},
    summary="Submit an answer for rubric feedback",
)
@api_view(["GET", "POST"])
@throttle_classes([AIThrottle])
def question_answers(request, pk):
    question = _owned_question(request, pk)
    if question is None:
        return Response(status=404)
    if request.method == "GET":
        return Response(AnswerDraftSerializer(question.answers.all()[:50], many=True).data)
    s = AnswerSubmitSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    text = s.validated_data["text"]
    jd = question.session.job_description
    focus = [sk for r in (jd.parsed.get("requirements", []) if jd else []) for sk in r["skills"]][:10]
    rubric = score_answer(question.text, text, focus)
    feedback = run_task(
        request.user,
        "feedback",
        S.FeedbackOut,
        lambda: offline.answer_feedback(rubric),
        instructions=f"Question: {question.text}\nRubric scores (authoritative, do not contradict): "
        + "; ".join(f"{c['label']} {c['score']}/5 ({c['note']})" for c in rubric["criteria"]),
        fenced={"candidate_answer": text},
        apply_fact_check=False,
    )
    rubric["follow_ups"] = list(dict.fromkeys(rubric["follow_ups"] + feedback["result"].get("follow_ups", [])))[:4]
    answer = AnswerDraft.objects.create(
        question=question,
        text=text,
        star=s.validated_data.get("star") or {},
        rubric=rubric,
        feedback={
            **feedback["result"],
            "mode": feedback["mode"],
            "provider": feedback["provider"],
            "notice": feedback["notice"],
        },
        duration_seconds=s.validated_data.get("duration_seconds"),
    )
    question.session.save(update_fields=["updated_at"])
    return Response(AnswerDraftSerializer(answer).data, status=201)


class AnswerDraftViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    serializer_class = AnswerDraftSerializer

    def get_queryset(self):
        return AnswerDraft.objects.filter(question__session__owner=self.request.user)


@extend_schema(request=StarRequestSerializer, summary="Organise notes into a STAR outline")
@api_view(["POST"])
@throttle_classes([AIThrottle])
def star_outline(request):
    s = StarRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    return Response(
        run_task(
            request.user,
            "star",
            S.StarOut,
            lambda: offline.star_outline(d["question"], d["notes"]),
            instructions=f"Interview question: {d['question']}",
            fenced={"user_notes": d["notes"]},
        )
    )


class PortfolioProjectViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = PortfolioProject.objects.all()
    serializer_class = PortfolioProjectSerializer

    def get_throttles(self):
        return [AIThrottle()] if self.action == "generate" else super().get_throttles()

    @extend_schema(
        request={
            "application/json": {
                "type": "object",
                "properties": {"kind": {"type": "string", "enum": ["case_study", "readme", "presentation", "bullets"]}},
            }
        },
        summary="Generate a draft from your project details",
    )
    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        p = self.get_object()
        kind = request.data.get("kind")
        if kind not in ("case_study", "readme", "presentation", "bullets"):
            raise serializers.ValidationError({"kind": "Choose case_study, readme, presentation or bullets."})
        data = PortfolioProjectSerializer(p).data
        details = "\n".join(
            f"{k.replace('_', ' ').capitalize()}: {data.get(k) or ''}"
            for k in ("title", "role", "summary", "problem", "users", "approach", "architecture", "results", "lessons")
        )
        details += f"\nTools: {', '.join(p.tools)}\nLinks: {p.github_url} {p.demo_url}"
        if kind == "bullets":
            return Response(
                run_task(
                    request.user,
                    "project_bullets",
                    S.BulletsOut,
                    lambda: offline.project_bullets(data),
                    fenced={"project_details": details},
                )
            )
        return Response(
            run_task(
                request.user,
                kind,
                S.DocumentOut,
                lambda: offline.project_document(kind, data),
                fenced={"project_details": details},
            )
        )

    @extend_schema(
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "resume_id": {"type": "integer"},
                    "bullets": {"type": "array", "items": {"type": "string"}},
                },
            }
        },
        summary="Add this project to a resume's Projects section",
    )
    @action(detail=True, methods=["post"], url_path="add-to-resume")
    def add_to_resume(self, request, pk=None):
        p = self.get_object()
        resume = Resume.objects.filter(owner=request.user, pk=request.data.get("resume_id")).first()
        if resume is None:
            return Response(status=404)
        bullets = [str(b)[:600] for b in (request.data.get("bullets") or []) if str(b).strip()][:8]
        with transaction.atomic():
            content = resume.get_content()
            section = next((s for s in content["sections"] if s["type"] == "projects"), None)
            if section is None:
                section = C.empty_section("projects")
                content["sections"].append(section)
            section["data"]["items"].append(
                {
                    "id": C.new_key(),
                    "name": p.title,
                    "role": p.role,
                    "link": p.github_url or p.demo_url,
                    "start": "",
                    "end": "",
                    "current": False,
                    "bullets": bullets,
                    "tools": p.tools[:20],
                }
            )
            resume.set_content(C.normalize_content(content))
        audit(request.user, "portfolio.added_to_resume", p, resume_id=resume.pk)
        return Response({"resume_id": resume.pk, "revision": resume.revision})


class LearningPlanViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = LearningPlan.objects.prefetch_related("items__linked_project")
    serializer_class = LearningPlanSerializer

    @extend_schema(
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "report_id": {"type": "integer"},
                    "job_description_id": {"type": "integer"},
                    "resume_id": {"type": "integer"},
                    "title": {"type": "string"},
                },
            }
        },
        summary="Create a skill checklist from a job match (or a JD + resume)",
    )
    @action(detail=False, methods=["post"], url_path="from-job")
    def from_job(self, request):
        report = AnalysisReport.objects.filter(
            owner=request.user, pk=request.data.get("report_id"), kind="match"
        ).first()
        if report:
            requirements, jd = report.requirements, report.job_description
        else:
            jd = JobDescription.objects.filter(owner=request.user, pk=request.data.get("job_description_id")).first()
            if jd is None:
                raise serializers.ValidationError(
                    {"job_description_id": "Choose a job match report or a saved job description."}
                )
            resume = Resume.objects.filter(owner=request.user, pk=request.data.get("resume_id")).first()
            requirements = (
                jobmatch.match_resume(resume.get_content(), jd.parsed)["requirements"]
                if resume
                else [{**r, "status": "not_found"} for r in jd.parsed.get("requirements", [])]
            )
        skills: dict[str, dict] = {}
        rank = {"required": 0, "unspecified": 1, "preferred": 2}
        for r in requirements:
            for sk in r["skills"]:
                prev = skills.get(sk)
                if prev is None or rank[r["kind"]] < rank[prev["importance"]]:
                    skills[sk] = {
                        "importance": r["kind"],
                        "status": "demonstrated"
                        if r.get("skill_status", {}).get(sk, r["status"]) == "demonstrated"
                        else "not_held",
                    }
        if not skills:
            raise serializers.ValidationError(
                {"job_description_id": "No specific skills were found in that job description."}
            )
        title = str(request.data.get("title") or f"Skills for {jd.display_title if jd else 'target role'}")[:160]
        with transaction.atomic():
            plan = LearningPlan.objects.create(
                owner=request.user, title=title, target_role=jd.display_title if jd else "", job_description=jd
            )
            for i, (sk, meta) in enumerate(sorted(skills.items(), key=lambda kv: (rank[kv[1]["importance"]], kv[0]))):
                LearningPlanItem.objects.create(
                    plan=plan,
                    skill=sk,
                    category=lexicon.category_of(sk),
                    importance=meta["importance"],
                    status=meta["status"],
                    order=i,
                )
        return Response(LearningPlanSerializer(plan).data, status=201)


class LearningPlanItemViewSet(viewsets.ModelViewSet):
    serializer_class = LearningPlanItemSerializer
    pagination_class = None

    def get_queryset(self):
        qs = LearningPlanItem.objects.filter(plan__owner=self.request.user).select_related("linked_project")
        plan = self.request.query_params.get("plan")
        return qs.filter(plan_id=plan) if plan else qs

    def get_throttles(self):
        return [AIThrottle()] if self.action == "suggest" else super().get_throttles()

    @extend_schema(
        request=None, summary="Suggest milestones, practice tasks and project ideas (learning, not resume claims)"
    )
    @action(detail=True, methods=["post"])
    def suggest(self, request, pk=None):
        item = self.get_object()
        return Response(
            run_task(
                request.user,
                "learning",
                S.LearningOut,
                lambda: offline.learning(item.skill),
                instructions=f"Skill to learn: {item.skill}. Category: {item.category}.",
                apply_fact_check=False,
            )
        )
