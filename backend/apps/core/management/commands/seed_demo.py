"""Creates an isolated, clearly-labelled demo account with sample data.

    python manage.py seed_demo            # create or refresh the demo account
    python manage.py seed_demo --remove   # delete the demo account and all its data

The demo user is flagged `is_demo=True`; every record title is prefixed with
"Sample". No real user's data is read or modified."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User

DEMO_EMAIL = "demo@infyro.local"
DEMO_PASSWORD = "Demo-Account-2026"

CONTENT = {
    "personal": {
        "full_name": "Sample Candidate",
        "headline": "Junior Backend Developer (sample profile)",
        "email": "sample.candidate@example.com",
        "phone": "+00 0000 000000",
        "location": "Remote",
        "links": [{"label": "GitHub", "url": "https://github.com/example"}],
    },
    "sections": [
        {
            "type": "summary",
            "title": "Summary",
            "data": {
                "text": "Sample summary: computer science graduate building Python web services, with internship experience in API development and a portfolio of data-driven side projects."
            },
        },
        {
            "type": "skills",
            "title": "Skills",
            "data": {
                "groups": [
                    {"name": "Languages", "skills": ["Python", "JavaScript", "SQL"]},
                    {"name": "Frameworks & tools", "skills": ["Django", "React", "PostgreSQL", "Git", "Docker"]},
                ]
            },
        },
        {
            "type": "experience",
            "title": "Experience",
            "data": {
                "items": [
                    {
                        "role": "Software Engineering Intern",
                        "organization": "Example Logistics (sample)",
                        "location": "Remote",
                        "start": "Jun 2025",
                        "end": "Dec 2025",
                        "bullets": [
                            "Built Django REST endpoints for shipment tracking used by the operations team",
                            "Responsible for writing unit tests for the billing module",
                            "Reduced a slow report query from 8s to 1.5s by adding PostgreSQL indexes",
                        ],
                    }
                ]
            },
        },
        {
            "type": "projects",
            "title": "Projects",
            "data": {
                "items": [
                    {
                        "name": "Study Planner (sample)",
                        "role": "Solo project",
                        "tools": ["React", "Django", "PostgreSQL"],
                        "bullets": ["Designed and built a study planner web app with spaced-repetition reminders"],
                    }
                ]
            },
        },
        {
            "type": "education",
            "title": "Education",
            "data": {
                "items": [
                    {
                        "institution": "Example University",
                        "degree": "BSc Computer Science",
                        "start": "2021",
                        "end": "2025",
                        "grade": "First class",
                    }
                ]
            },
        },
        {
            "type": "certifications",
            "title": "Certifications",
            "data": {"items": [{"name": "Sample Cloud Fundamentals", "issuer": "Example Academy", "date": "Mar 2025"}]},
        },
    ],
}

JD = """Junior Backend Engineer (sample job description)
Example Fintech

What you'll do:
- Build and maintain REST APIs for our payments dashboard
- Write tests and take part in code reviews
- Work with product and design to ship features

Requirements:
- Experience with Python and Django
- Solid SQL and PostgreSQL knowledge
- Familiarity with Git and CI/CD
- Clear written and verbal communication

Nice to have:
- Docker or Kubernetes
- AWS experience
"""


class Command(BaseCommand):
    help = "Create (or remove) the isolated demo account with clearly labelled sample data."

    def add_arguments(self, parser):
        parser.add_argument("--remove", action="store_true")

    @transaction.atomic
    def handle(self, *args, remove=False, **opts):
        from apps.governance.privacy import delete_account

        existing = User.objects.filter(email=DEMO_EMAIL).first()
        if existing:
            delete_account(existing)
        if remove:
            self.stdout.write(self.style.SUCCESS("Demo account removed."))
            return

        from apps.career.models import (
            InterviewQuestion,
            InterviewSession,
            LearningPlan,
            LearningPlanItem,
            PortfolioProject,
        )
        from apps.intelligence import jobmatch
        from apps.intelligence.health import analyse_resume
        from apps.intelligence.models import AnalysisReport, JobDescription
        from apps.resumes.content import normalize_content
        from apps.resumes.models import Resume, Template
        from apps.workspace.models import Application, ApplicationEvent, Reminder

        user = User.objects.create_user(
            email=DEMO_EMAIL, password=DEMO_PASSWORD, full_name="Sample Candidate", is_demo=True
        )
        p = user.profile
        p.headline, p.preferred_roles, p.experience_level = "Junior backend developer", ["Backend Developer"], "fresher"
        p.onboarding_completed, p.strengths, p.learning_goals = True, ["APIs", "Testing"], ["Learn AWS fundamentals"]
        p.save()

        resume = Resume.objects.create(
            owner=user,
            title="Sample — Backend resume",
            target_role="Backend Developer",
            template=Template.objects.get(slug="meridian"),
            source="sample",
        )
        content = normalize_content(CONTENT)
        resume.set_content(content, bump=False)
        v = resume.snapshot(reason="manual", label="Sample baseline")
        rep = analyse_resume(v.content, "fresher")
        AnalysisReport.objects.create(
            owner=user,
            kind="health",
            resume=resume,
            resume_version=v,
            quality_score=rep["quality_score"],
            categories=rep["categories"],
            findings=rep["findings"],
            strengths=rep["strengths"],
            summary=rep["summary"],
            extracted_preview=rep["extracted_preview"],
            rules_version=rep["rules_version"],
        )
        jd = JobDescription.objects.create(
            owner=user,
            title="Sample — Junior Backend Engineer",
            company="Example Fintech",
            text=JD,
            parsed=jobmatch.parse_job_description(JD),
        )
        m = jobmatch.match_resume(v.content, jd.parsed)
        AnalysisReport.objects.create(
            owner=user,
            kind="match",
            resume=resume,
            resume_version=v,
            job_description=jd,
            match_score=m["match_score"],
            requirements=m["requirements"],
            checklist=m["checklist"],
            summary={"formula": m["formula"], "counts": m["counts"]},
            rules_version=m["rules_version"],
        )
        today = timezone.localdate()
        for company, role, status, delta in [
            ("Example Fintech", "Junior Backend Engineer", "applied", 6),
            ("Sample Health Co", "Python Developer", "interview", 14),
            ("Demo Retail", "Software Engineer I", "interested", 1),
        ]:
            a = Application.objects.create(
                owner=user,
                company=f"{company} (sample)",
                role=role,
                status=status,
                saved_on=today - timedelta(days=delta),
                applied_on=today - timedelta(days=delta - 1) if status != "interested" else None,
                deadline=today + timedelta(days=10) if status == "interested" else None,
                resume_version=v,
                job_description=jd if company == "Example Fintech" else None,
            )
            ApplicationEvent.objects.create(application=a, kind="created", title="Added to tracker", to_status=status)
        Reminder.objects.create(
            owner=user,
            title="Sample — follow up with Example Fintech",
            due_at=timezone.now() + timedelta(days=1),
            kind="follow_up",
        )
        session = InterviewSession.objects.create(
            owner=user,
            title="Sample — Backend interview practice",
            target_role="Backend Engineer",
            job_description=jd,
            resume=resume,
        )
        for i, (cat, text) in enumerate(
            [
                ("technical", "Walk me through a time you used Django. What trade-offs did you make?"),
                ("behavioral", "Tell me about a mistake you made and what you changed afterwards."),
            ]
        ):
            InterviewQuestion.objects.create(session=session, order=i, category=cat, text=text)
        plan = LearningPlan.objects.create(
            owner=user, title="Sample — Skills for Junior Backend Engineer", job_description=jd
        )
        LearningPlanItem.objects.create(
            plan=plan,
            skill="AWS",
            category="Cloud & DevOps",
            importance="preferred",
            status="learning",
            milestones=[
                {"id": "1", "title": "Learn core AWS services", "done": True},
                {"id": "2", "title": "Deploy the study planner", "done": False},
            ],
        )
        LearningPlanItem.objects.create(
            plan=plan, skill="Django", category="Framework & library", importance="required", status="demonstrated"
        )
        PortfolioProject.objects.create(
            owner=user,
            title="Study Planner (sample)",
            problem="Students forget to revise at the right time.",
            approach="Built a React + Django app with spaced-repetition scheduling.",
            tools=["React", "Django", "PostgreSQL"],
            evidence=[
                {"label": "README explaining how to run it", "done": True},
                {"label": "Demo video", "done": False},
            ],
        )
        self.stdout.write(self.style.SUCCESS(f"Demo account ready: {DEMO_EMAIL} / {DEMO_PASSWORD} (sample data only)"))
