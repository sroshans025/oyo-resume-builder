from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class InterviewSession(TimeStampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="interview_sessions")
    title = models.CharField(max_length=160)
    target_role = models.CharField(max_length=160, blank=True)
    job_description = models.ForeignKey(
        "intelligence.JobDescription", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    resume = models.ForeignKey("resumes.Resume", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    mode = models.CharField(
        max_length=10, choices=[("practice", "Practice"), ("mock", "Mock interview")], default="practice"
    )
    timed = models.BooleanField(default=False)
    seconds_per_question = models.PositiveSmallIntegerField(default=120)
    generated_by = models.CharField(max_length=20, default="offline")

    class Meta:
        ordering = ["-updated_at"]

    @property
    def answered_count(self) -> int:
        return self.questions.filter(answers__isnull=False).distinct().count()


class InterviewQuestion(models.Model):
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveSmallIntegerField(default=0)
    category = models.CharField(
        max_length=12, choices=[("technical", "Technical"), ("behavioral", "Behavioural"), ("role", "Role-specific")]
    )
    text = models.CharField(max_length=400)
    why = models.CharField(max_length=300, blank=True)
    follow_ups = models.JSONField(default=list, blank=True)
    source = models.CharField(max_length=10, default="offline")  # ai | offline | user

    class Meta:
        ordering = ["order", "id"]


class AnswerDraft(TimeStampedModel):
    question = models.ForeignKey(InterviewQuestion, on_delete=models.CASCADE, related_name="answers")
    text = models.TextField(max_length=6000)
    star = models.JSONField(default=dict, blank=True)
    rubric = models.JSONField(default=dict, blank=True)
    feedback = models.JSONField(default=dict, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    favourite = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]


class PortfolioProject(TimeStampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="portfolio_projects")
    title = models.CharField(max_length=160)
    kind = models.CharField(max_length=20, default="personal")  # personal | academic | internship | work | open_source
    summary = models.CharField(max_length=400, blank=True)
    role = models.CharField(max_length=160, blank=True)
    problem = models.TextField(blank=True, max_length=2000)
    users = models.TextField(blank=True, max_length=1000)
    approach = models.TextField(blank=True, max_length=3000)
    architecture = models.TextField(blank=True, max_length=3000)
    tools = models.JSONField(default=list, blank=True)
    results = models.TextField(blank=True, max_length=2000)
    lessons = models.TextField(blank=True, max_length=2000)
    github_url = models.URLField(blank=True, max_length=400)
    demo_url = models.URLField(blank=True, max_length=400)
    portfolio_url = models.URLField(blank=True, max_length=400)
    evidence = models.JSONField(default=list, blank=True)
    drafts = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-updated_at"]


class LearningPlan(TimeStampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="learning_plans")
    title = models.CharField(max_length=160)
    target_role = models.CharField(max_length=160, blank=True)
    job_description = models.ForeignKey(
        "intelligence.JobDescription", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    notes = models.TextField(blank=True, max_length=3000)

    class Meta:
        ordering = ["-updated_at"]


class LearningPlanItem(TimeStampedModel):
    class Status(models.TextChoices):
        DEMONSTRATED = "demonstrated", "Demonstrated"
        LEARNING = "learning", "Learning"
        NOT_HELD = "not_held", "Not currently held"

    plan = models.ForeignKey(LearningPlan, on_delete=models.CASCADE, related_name="items")
    skill = models.CharField(max_length=80)
    category = models.CharField(max_length=40, blank=True)
    importance = models.CharField(max_length=12, default="unspecified")  # required | preferred | unspecified
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NOT_HELD)
    milestones = models.JSONField(default=list, blank=True)
    practice_tasks = models.JSONField(default=list, blank=True)
    project_ideas = models.JSONField(default=list, blank=True)
    evidence_links = models.JSONField(default=list, blank=True)
    linked_project = models.ForeignKey(
        PortfolioProject, null=True, blank=True, on_delete=models.SET_NULL, related_name="skill_items"
    )
    target_date = models.DateField(null=True, blank=True)
    completed_at = models.DateField(null=True, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        constraints = [models.UniqueConstraint(fields=["plan", "skill"], name="uniq_skill_per_plan")]

    @property
    def owner_id(self):
        return self.plan.owner_id

    @property
    def progress(self) -> int:
        if self.status == "demonstrated":
            return 100
        if not self.milestones:
            return 0
        return round(100 * sum(1 for m in self.milestones if m.get("done")) / len(self.milestones))
