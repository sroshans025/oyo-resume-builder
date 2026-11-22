import io
import json
import zipfile
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import AuditEvent
from apps.resumes.models import Resume
from apps.workspace.models import Notification, Reminder

from .conftest import PASSWORD
from .test_ai_and_analysis import JD

pytestmark = pytest.mark.django_db


def test_application_pipeline_timeline_and_insights(client, resume):
    version = client.post(f"/api/resumes/{resume}/versions/", {"label": "Acme"}, format="json").json()
    app = client.post(
        "/api/applications/",
        {
            "company": "Acme",
            "role": "Backend Engineer",
            "saved_on": "2026-11-01",
            "deadline": "2026-12-01",
            "resume_version": version["id"],
            "work_mode": "hybrid",
        },
        format="json",
    )
    assert app.status_code == 201, app.content
    aid = app.json()["id"]
    assert app.json()["resume_label"].endswith(f"v{version['number']}")
    moved = client.post(f"/api/applications/{aid}/move/", {"status": "applied"}, format="json").json()
    assert moved["application"]["applied_on"] is not None
    assert moved["suggested_reminder"]["days"] == 7  # default follow-up suggestion, not auto-created
    assert not Reminder.objects.exists()
    client.post(f"/api/applications/{aid}/move/", {"status": "interview"}, format="json")
    events = client.get(f"/api/applications/{aid}/events/").json()
    kinds = [e["kind"] for e in events]
    assert kinds.count("status") == 2 and "created" in kinds and "deadline" in kinds
    ins = client.get("/api/applications/insights/").json()
    assert ins["funnel"]["applied"] == 1 and ins["funnel"]["interviews"] == 1
    assert ins["weekly_goal"]["goal"] == 5


def test_application_validation_and_filters(client):
    bad = client.post(
        "/api/applications/",
        {"company": "A", "role": "B", "saved_on": "2026-11-10", "deadline": "2026-11-01"},
        format="json",
    )
    assert bad.status_code == 400 and "deadline" in bad.json()["error"]["fields"]
    client.post(
        "/api/applications/",
        {"company": "Zeta", "role": "Analyst", "saved_on": "2026-11-01", "status": "archived"},
        format="json",
    )
    client.post("/api/applications/", {"company": "Beta", "role": "Designer", "saved_on": "2026-11-01"}, format="json")
    assert client.get("/api/applications/").json()["count"] == 1  # archived hidden by default
    assert client.get("/api/applications/?include_archived=1").json()["count"] == 2
    assert client.get("/api/applications/?q=desig").json()["count"] == 1


def test_reminders_create_notifications_respecting_preferences(client, user):
    Reminder.objects.create(owner=user, title="Follow up", due_at=timezone.now() - timedelta(minutes=1))
    r = client.get("/api/notifications/").json()
    assert r["unread"] == 1 and r["results"][0]["title"] == "Follow up"
    client.post("/api/notifications/read-all/")
    assert client.get("/api/notifications/").json()["unread"] == 0
    user.profile.notify_in_app = False
    user.profile.save()
    Reminder.objects.create(owner=user, title="Silent", due_at=timezone.now() - timedelta(minutes=1))
    client.get("/api/notifications/")
    assert not Notification.objects.filter(title="Silent").exists()


def test_cover_letter_generate_and_export(client, resume):
    jd = client.post(
        "/api/job-descriptions/", {"title": "Backend Engineer", "company": "Acme", "text": JD}, format="json"
    ).json()
    letter = client.post(
        "/api/cover-letters/",
        {
            "title": "Acme letter",
            "company": "Acme Payments",
            "role": "Backend Engineer",
            "resume": resume,
            "job_description": jd["id"],
        },
        format="json",
    ).json()
    gen = client.post(f"/api/cover-letters/{letter['id']}/generate/").json()
    assert gen["label"].startswith("Draft")
    assert "Acme Payments" in gen["draft_text"]
    assert "[" in gen["draft_text"]  # placeholder for motivation the user must supply
    assert gen["result"]["questions"]
    client.patch(f"/api/cover-letters/{letter['id']}/", {"body": gen["draft_text"]}, format="json")
    exp = client.post(f"/api/cover-letters/{letter['id']}/export/", {"format": "pdf"}, format="json")
    assert exp.status_code == 201 and client.get(exp.json()["url"]).status_code == 200


def test_interview_session_answers_and_rubric(client, resume):
    jd = client.post("/api/job-descriptions/", {"title": "Backend Engineer", "text": JD}, format="json").json()
    s = client.post(
        "/api/interview-sessions/",
        {
            "title": "Acme prep",
            "target_role": "Backend Engineer",
            "job_description": jd["id"],
            "resume": resume,
            "question_count": 6,
        },
        format="json",
    )
    assert s.status_code == 201, s.content
    session = s.json()
    assert len(session["questions"]) == 6
    assert {q["category"] for q in session["questions"]} >= {"technical", "behavioral"}
    q = session["questions"][0]
    weak = client.post(
        f"/api/interview-questions/{q['id']}/answers/", {"text": "I know Python well."}, format="json"
    ).json()
    strong_text = (
        "When I was an intern at Acme, our team had a slow reporting API. My task was to speed it up before the quarterly "
        "review. I profiled the Django views, I added PostgreSQL indexes and I rewrote two queries. As a result the "
        "endpoint went from 4 seconds to under 1 second and the finance team adopted it for weekly reports. "
        "I learned to measure before optimising."
    ) * 1
    strong = client.post(
        f"/api/interview-questions/{q['id']}/answers/", {"text": strong_text, "duration_seconds": 95}, format="json"
    ).json()
    assert strong["rubric"]["total"] > weak["rubric"]["total"]
    assert weak["rubric"]["needs_concrete_example"] is True
    assert all(c["note"] for c in strong["rubric"]["criteria"])
    assert "not a hiring prediction" in strong["rubric"]["disclaimer"]
    history = client.get(f"/api/interview-questions/{q['id']}/answers/").json()
    assert len(history) == 2
    edited = client.patch(
        f"/api/interview-answers/{strong['id']}/", {"text": "Edited draft", "favourite": True}, format="json"
    )
    assert edited.status_code == 200 and edited.json()["favourite"] is True


def test_star_outline(client):
    r = client.post(
        "/api/interview/star/",
        {
            "question": "Tell me about a challenge",
            "notes": "During my final year project the database kept crashing. I had to fix it before the demo. I added connection pooling. As a result the demo went smoothly.",
        },
        format="json",
    ).json()
    out = r["result"]
    assert out["situation"] and out["task"] and out["result"]


def test_skill_plan_from_match_and_progress(client, resume):
    rep = client.post("/api/reports/match/", {"resume_id": resume, "text": JD}, format="json").json()
    plan = client.post("/api/learning-plans/from-job/", {"report_id": rep["id"]}, format="json")
    assert plan.status_code == 201
    items = {i["skill"]: i for i in plan.json()["items"]}
    assert items["Django"]["status"] == "demonstrated" and items["Django"]["can_claim_on_resume"] is True
    assert items["AWS"]["status"] == "not_held" and items["AWS"]["can_claim_on_resume"] is False
    sug = client.post(f"/api/learning-items/{items['AWS']['id']}/suggest/").json()["result"]
    assert sug["milestones"] and sug["project_ideas"]
    upd = client.patch(
        f"/api/learning-items/{items['AWS']['id']}/",
        {"status": "learning", "milestones": [{"title": m, "done": i == 0} for i, m in enumerate(sug["milestones"])]},
        format="json",
    ).json()
    assert 0 < upd["progress"] < 100 and upd["can_claim_on_resume"] is False


def test_portfolio_project_generation_and_add_to_resume(client, resume):
    p = client.post(
        "/api/portfolio-projects/",
        {
            "title": "Budget Tracker",
            "problem": "Students lose track of spending",
            "approach": "built a React app with a PostgreSQL backend",
            "tools": ["React", "PostgreSQL"],
            "github_url": "https://github.com/ana-example/budget",
        },
        format="json",
    ).json()
    assert len(p["evidence"]) >= 5 and "does not visit or verify" in p["link_verification"]
    cs = client.post(f"/api/portfolio-projects/{p['id']}/generate/", {"kind": "case_study"}, format="json").json()
    headings = [s["heading"] for s in cs["result"]["sections"]]
    assert headings[:3] == ["Problem", "Users", "Approach"]
    assert any("[" in s["body"] for s in cs["result"]["sections"])  # missing info stays a placeholder
    r = client.post(
        f"/api/portfolio-projects/{p['id']}/add-to-resume/",
        {"resume_id": resume, "bullets": ["Built it"]},
        format="json",
    )
    assert r.status_code == 200
    content = Resume.objects.get(pk=resume).get_content()
    projects = next(s for s in content["sections"] if s["type"] == "projects")["data"]["items"]
    assert projects[-1]["name"] == "Budget Tracker"


def test_share_grant_scope_expiry_and_revocation(client, other_client, anon, resume, other_user):
    g = client.post(
        "/api/share-grants/", {"resume": resume, "scope": "comment", "expires_in_days": 3}, format="json"
    ).json()
    token = g["token"]
    view = anon.get(f"/api/shared/{token}/").json()
    assert (
        view["content"]["personal"]["email"] == "" and view["content"]["personal"]["phone"] == ""
    )  # contact hidden by default
    assert anon.post(f"/api/shared/{token}/comments/", {"text": "hi"}, format="json").status_code in (401, 403)
    c = other_client.post(
        f"/api/shared/{token}/comments/", {"text": "Lead with your project.", "section": "Projects"}, format="json"
    )
    assert c.status_code == 201
    assert client.get(f"/api/share-grants/{g['id']}/comments/").json()[0]["text"] == "Lead with your project."
    client.post(f"/api/share-grants/{g['id']}/revoke/")
    assert anon.get(f"/api/shared/{token}/").status_code == 404

    g2 = client.post(
        "/api/share-grants/", {"resume": resume, "recipient_email": "someone@else.com"}, format="json"
    ).json()
    assert other_client.get(f"/api/shared/{g2['token']}/").status_code == 404  # wrong account
    assert other_client.get(f"/api/coach/shared/{g2['id']}/").status_code == 404  # not the recipient
    g3 = client.post(
        "/api/share-grants/", {"resume": resume, "recipient_email": other_user.email, "scope": "comment"}, format="json"
    ).json()
    listed = other_client.get("/api/coach/shared-with-me/").json()
    assert [x["id"] for x in listed] == [g3["id"]]
    assert other_client.get(f"/api/coach/shared/{g3['id']}/").status_code == 200
    assert (
        other_client.post(f"/api/coach/shared/{g3['id']}/comments/", {"text": "Nice"}, format="json").status_code == 201
    )
    client.post(f"/api/share-grants/{g3['id']}/revoke/")
    assert other_client.get(f"/api/coach/shared/{g3['id']}/").status_code == 404
    # Cannot share another user's resume
    assert other_client.post("/api/share-grants/", {"resume": resume}, format="json").status_code == 400


def test_cohort_progress_only_for_consenting_members(client, user, other_user, other_client):
    admin = User.objects.create_user(email="admin@example.com", password=PASSWORD, role="admin")
    from rest_framework.test import APIClient

    ac = APIClient()
    ac.force_login(admin)
    cohort = ac.post(
        "/api/admin/cohorts/",
        {"institution": "Example College", "name": "CS 2026", "coordinator_email": "admin@example.com"},
        format="json",
    ).json()
    client.post("/api/cohorts/mine/", {"invite_code": cohort["invite_code"], "share_progress": True}, format="json")
    other_client.post(
        "/api/cohorts/mine/", {"invite_code": cohort["invite_code"], "share_progress": False}, format="json"
    )
    prog = ac.get(f"/api/institution/cohorts/{cohort['id']}/progress/").json()
    assert prog["total_members"] == 2 and prog["sharing_members"] == 1
    assert "content" not in json.dumps(prog["members"]).lower()
    assert AuditEvent.objects.filter(action="cohort.progress_viewed").exists()


def test_dashboard_reflects_real_data_only(client, resume):
    d = client.get("/api/dashboard/").json()
    assert d["applications_total"] == 0 and d["resumes"][0]["id"] == resume
    assert any(a["id"] == "health" for a in d["next_actions"])


def test_data_export_contains_all_records(client, resume):
    client.post("/api/applications/", {"company": "Acme", "role": "Dev", "saved_on": "2026-11-01"}, format="json")
    r = client.post("/api/privacy/export/")
    assert r.status_code == 201
    z = zipfile.ZipFile(io.BytesIO(client.get(r.json()["url"]).content))
    data = json.loads(z.read("infyro-data.json"))
    assert data["account"]["email"] == "ana@example.com"
    assert data["resumes"][0]["content"]["personal"]["full_name"] == "Ana Pereira"
    assert data["applications"][0]["company"] == "Acme"
    assert "password" not in json.dumps(data["account"])


def test_account_deletion_removes_data_and_keeps_anonymised_audit(client, user, resume):
    assert (
        client.post(
            "/api/privacy/delete-account/", {"password": "wrong", "confirm": "DELETE"}, format="json"
        ).status_code
        == 400
    )
    r = client.post("/api/privacy/delete-account/", {"password": PASSWORD, "confirm": "DELETE"}, format="json")
    assert r.status_code == 204
    assert not User.objects.filter(email="ana@example.com").exists()
    assert not Resume.objects.filter(pk=resume).exists()
    ev = AuditEvent.objects.filter(action="account.deleted").first()
    assert ev is not None and ev.actor is None and ev.actor_ref


def test_rubric_detects_first_person_actions_and_question_terms():
    from apps.career.rubric import score_answer

    r = score_answer(
        "Tell me about a time you had to deliver a task quickly.",
        "When I was an intern, my task was to fix a slow report. I profiled the views, I added indexes and I rewrote "
        "two queries. As a result the report loaded in under a second.",
    )
    assert r["star_detected"] == {"situation": True, "task": True, "action": True, "result": True}
    assert r["needs_concrete_example"] is False
    assert "3 first-person action(s)" in r["criteria"][2]["note"]
    assert "task" in r["criteria"][0]["note"]
