import io

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.resumes import content as C

PASSWORD = "Str0ng-Passphrase!"


@pytest.fixture(autouse=True)
def _isolation(settings, tmp_path):
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(tmp_path / "media")},
        },
    }
    settings.AI_PROVIDER = "offline"
    settings.CELERY_TASK_ALWAYS_EAGER = True
    cache.clear()  # resets throttle counters and AI quotas between tests
    yield
    cache.clear()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="ana@example.com", password=PASSWORD, full_name="Ana Pereira")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(email="ben@example.com", password=PASSWORD, full_name="Ben Okafor")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_login(user)
    return c


@pytest.fixture
def other_client(other_user):
    c = APIClient()
    c.force_login(other_user)
    return c


@pytest.fixture
def anon():
    return APIClient()


SAMPLE_CONTENT = {
    "personal": {
        "full_name": "Ana Pereira",
        "headline": "Backend developer",
        "email": "ana@example.com",
        "phone": "+44 7000 000000",
        "location": "Leeds, UK",
        "links": [{"label": "GitHub", "url": "https://github.com/ana-example"}],
    },
    "sections": [
        {
            "key": "sum",
            "type": "summary",
            "title": "Summary",
            "data": {"text": "Backend developer focused on Python APIs."},
        },
        {
            "key": "sk",
            "type": "skills",
            "title": "Skills",
            "data": {"groups": [{"name": "Languages", "skills": ["Python", "SQL", "Docker"]}]},
        },
        {
            "key": "exp",
            "type": "experience",
            "title": "Experience",
            "data": {
                "items": [
                    {
                        "role": "Software Engineer Intern",
                        "organization": "Acme Ltd",
                        "start": "Jun 2024",
                        "end": "Aug 2024",
                        "bullets": [
                            "Built a Django REST API used by 3 internal teams",
                            "Responsible for writing tests",
                        ],
                    }
                ]
            },
        },
        {
            "key": "edu",
            "type": "education",
            "title": "Education",
            "data": {
                "items": [
                    {
                        "institution": "University of Leeds",
                        "degree": "BSc Computer Science",
                        "start": "2021",
                        "end": "2024",
                    }
                ]
            },
        },
        {
            "key": "proj",
            "type": "projects",
            "title": "Projects",
            "data": {
                "items": [
                    {
                        "name": "Budget Tracker",
                        "tools": ["React", "PostgreSQL"],
                        "bullets": ["Designed a PostgreSQL schema for expenses"],
                    }
                ]
            },
        },
    ],
}


@pytest.fixture
def sample_content():
    return C.normalize_content(SAMPLE_CONTENT)


@pytest.fixture
def resume(client, sample_content):
    r = client.post("/api/resumes/", {"title": "Backend CV", "target_role": "Backend Developer"}, format="json")
    assert r.status_code == 201, r.content
    rid = r.json()["id"]
    r2 = client.put(
        f"/api/resumes/{rid}/content/", {"revision": r.json()["revision"], "content": sample_content}, format="json"
    )
    assert r2.status_code == 200, r2.content
    return rid


def make_pdf(lines_per_page: list[list[str]]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfgen import canvas

    from apps.resumes.renderers import resolve_font

    regular, _bold, _ = resolve_font("sans")
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    for lines in lines_per_page:
        y = 800
        c.setFont(regular, 11)
        for ln in lines:
            c.drawString(60, y, ln)
            y -= 16
        c.showPage()
    c.save()
    assert pdfmetrics  # keep import used
    return buf.getvalue()


def make_docx(paragraphs: list[str]) -> bytes:
    from docx import Document

    d = Document()
    for p in paragraphs:
        d.add_paragraph(p)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()
