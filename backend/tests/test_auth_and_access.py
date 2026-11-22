import pytest
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditEvent

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db


def test_register_login_logout_flow(anon):
    r = anon.post(
        "/api/auth/register/",
        {"full_name": "Chen Li", "email": "Chen@Example.com", "password": PASSWORD, "accept_terms": True},
        format="json",
    )
    assert r.status_code == 201
    assert r.json()["email"] == "chen@example.com"
    assert anon.get("/api/auth/me/").json()["user"]["email"] == "chen@example.com"
    assert anon.post("/api/auth/logout/").status_code == 204
    assert anon.get("/api/auth/me/").json()["user"] is None
    r = anon.post("/api/auth/login/", {"email": "chen@example.com", "password": PASSWORD}, format="json")
    assert r.status_code == 200
    assert AuditEvent.objects.filter(action="auth.login").exists()


def test_register_rejects_weak_password_and_duplicates(anon, user):
    r = anon.post(
        "/api/auth/register/",
        {"full_name": "X", "email": "new@example.com", "password": "password1", "accept_terms": True},
        format="json",
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "validation_error"
    r = anon.post(
        "/api/auth/register/",
        {"full_name": "X", "email": user.email, "password": PASSWORD, "accept_terms": True},
        format="json",
    )
    assert "email" in r.json()["error"]["fields"]


def test_login_wrong_password_is_generic(anon, user):
    r = anon.post("/api/auth/login/", {"email": user.email, "password": "nope-nope-nope"}, format="json")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_credentials"


def test_password_reset_flow_does_not_enumerate(anon, user):
    r1 = anon.post("/api/auth/password/reset/", {"email": user.email}, format="json")
    r2 = anon.post("/api/auth/password/reset/", {"email": "nobody@example.com"}, format="json")
    assert r1.status_code == r2.status_code == 202
    assert r1.json() == r2.json()
    assert len(mail.outbox) == 1
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    r = anon.post(
        "/api/auth/password/reset/confirm/",
        {"uid": uid, "token": token, "new_password": "An0ther-Strong-One"},
        format="json",
    )
    assert r.status_code == 204
    user.refresh_from_db()
    assert user.check_password("An0ther-Strong-One")
    r = anon.post(
        "/api/auth/password/reset/confirm/",
        {"uid": uid, "token": token, "new_password": "An0ther-Strong-Two"},
        format="json",
    )
    assert r.status_code == 400  # token single-use


def test_protected_endpoints_require_auth(anon):
    for url in [
        "/api/resumes/",
        "/api/applications/",
        "/api/dashboard/",
        "/api/uploads/",
        "/api/reports/",
        "/api/auth/profile/",
    ]:
        assert anon.get(url).status_code in (401, 403), url


def test_csrf_enforced_for_session_clients(user):
    c = APIClient(enforce_csrf_checks=True)
    c.force_login(user)
    r = c.post("/api/resumes/", {"title": "x"}, format="json")
    assert r.status_code == 403


def test_profile_update_and_consent_audit(client, user):
    r = client.patch(
        "/api/auth/profile/",
        {"preferred_roles": ["Data Analyst", "data analyst", " "], "ai_consent": True, "experience_level": "fresher"},
        format="json",
    )
    assert r.status_code == 200
    body = r.json()
    assert body["preferred_roles"] == ["Data Analyst"]
    assert body["ai_consent_at"] is not None
    assert AuditEvent.objects.filter(action="privacy.ai_consent_changed").exists()


def test_session_list_and_revoke_others(user):
    a, b = APIClient(), APIClient()
    for c in (a, b):
        assert c.post("/api/auth/login/", {"email": user.email, "password": PASSWORD}, format="json").status_code == 200
    sessions = a.get("/api/auth/sessions/").json()
    assert len(sessions) == 2
    assert a.delete("/api/auth/sessions/others/").status_code == 204
    assert b.get("/api/auth/me/").json()["user"] is None  # other device signed out
    assert a.get("/api/auth/me/").json()["user"] is not None


def test_role_restricted_admin_endpoints(client, user):
    assert client.get("/api/admin/overview/").status_code == 403
    assert client.get("/api/admin/audit-events/").status_code == 403
    assert client.get("/api/institution/cohorts/").status_code == 403
    user.role = User.Role.ADMIN
    user.save()
    assert client.get("/api/admin/overview/").status_code == 200


def test_cross_user_isolation_everywhere(client, other_client, resume):
    # Another user's resources resolve to 404 (no existence disclosure) and cannot be modified.
    assert other_client.get(f"/api/resumes/{resume}/").status_code == 404
    assert other_client.patch(f"/api/resumes/{resume}/", {"title": "hijack"}, format="json").status_code == 404
    assert (
        other_client.put(
            f"/api/resumes/{resume}/content/",
            {"revision": 1, "content": {"personal": {}, "sections": []}},
            format="json",
        ).status_code
        == 404
    )
    assert other_client.delete(f"/api/resumes/{resume}/").status_code == 404
    assert other_client.post("/api/reports/health/", {"resume_id": resume}, format="json").status_code == 404
    assert other_client.get("/api/resumes/").json()["count"] == 0

    app = client.post(
        "/api/applications/", {"company": "Acme", "role": "Dev", "saved_on": "2026-11-01"}, format="json"
    ).json()
    assert other_client.get(f"/api/applications/{app['id']}/").status_code == 404
    assert (
        other_client.post(f"/api/applications/{app['id']}/move/", {"status": "offer"}, format="json").status_code == 404
    )

    # Cannot link someone else's resume version to your own application.
    version = client.post(f"/api/resumes/{resume}/versions/", {"label": "v"}, format="json").json()
    r = other_client.post(
        "/api/applications/",
        {"company": "X", "role": "Y", "saved_on": "2026-11-01", "resume_version": version["id"]},
        format="json",
    )
    assert r.status_code == 400

    # Cannot attach another user's resume to a cover letter.
    r = other_client.post("/api/cover-letters/", {"title": "t", "resume": resume}, format="json")
    assert r.status_code == 400
