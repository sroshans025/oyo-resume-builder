# API guide

Interactive docs: `GET /api/docs/` (Swagger UI) · schema: `GET /api/schema/` · exported spec: `docs/openapi.yaml`.

## Conventions

- **Auth:** session cookie from `POST /api/auth/login/` or `/register/`. Unsafe methods require the `X-CSRFToken` header
  (value of the `csrftoken` cookie; `GET /api/csrf/` issues one).
- **Errors:** always `{"error": {"code": "...", "message": "...", "fields": {...}?, "retry_after": n?}}`.
  Common codes: `validation_error` (400), `not_authenticated` (401/403), `permission_denied`, `not_found`, `conflict`
  (409, stale autosave), `throttled`, `quota_exceeded` (429), `ai_consent_required`, `server_error`.
- **Pagination:** `?page=&page_size=` (max 100) → `{count, next, previous, results}`.
- **Ownership:** every resource is scoped to the caller; other users' IDs return 404.
- **Rate limits:** auth endpoints 20/min per IP, AI endpoints 30/min per user plus a daily quota, uploads 20/hour.

## Endpoint map

| Area | Endpoints |
|---|---|
| Auth & profile | `POST auth/register/` `auth/login/` `auth/logout/` · `GET/PATCH auth/me/` · `GET/PATCH auth/profile/` · `POST auth/password/change/` `auth/password/reset/` `auth/password/reset/confirm/` · `GET auth/sessions/` · `DELETE auth/sessions/{id or "others"}/` |
| Templates | `GET templates/` (public) |
| Resumes | `GET/POST resumes/` · `GET/PATCH/DELETE resumes/{id}/` · `PUT resumes/{id}/content/` · `POST resumes/{id}/duplicate/` · `GET/POST resumes/{id}/versions/` · `GET resumes/{id}/versions/{vid}/` · `POST resumes/{id}/versions/{vid}/restore/` · `GET resumes/{id}/compare/?a=&b=` · `POST resumes/{id}/export/` · `GET resume-versions/` |
| Uploads & vault | `GET/POST uploads/` (multipart `file`) · `GET/PATCH/DELETE uploads/{id}/` · `POST uploads/{id}/retry/` · `POST uploads/{id}/import/` · `GET/PATCH/DELETE files/{id}/` · `POST vault/{upload or generated}/{id}/link/` · `GET files/download/?token=` |
| Analysis | `POST reports/health/` · `POST reports/match/` · `GET reports/` · `GET/PATCH/DELETE reports/{id}/` |
| Job descriptions | `GET/POST job-descriptions/` · `GET/PATCH/DELETE job-descriptions/{id}/` · `POST job-descriptions/preview/` · `GET job-descriptions/{id}/compare/?other=` |
| Writing Studio | `GET ai/status/` · `POST ai/summary/` `ai/bullet/` `ai/project/` `ai/achievement/` `ai/verbs/` `ai/proofread/` · `POST ai/feedback/` |
| Cover letters | `GET/POST cover-letters/` · `GET/PATCH/DELETE cover-letters/{id}/` · `POST cover-letters/{id}/generate/` · `POST cover-letters/{id}/export/` · `cover-letter-blocks/` CRUD |
| Applications | `GET/POST applications/` (`?all=1&q=&status=&work_mode=&ordering=&include_archived=1`) · `GET/PATCH/DELETE applications/{id}/` · `POST applications/{id}/move/` · `GET/POST applications/{id}/events/` · `GET applications/insights/` · `reminders/` CRUD · `GET notifications/` · `PATCH notifications/{id}/` · `POST notifications/read-all/` · `GET dashboard/` |
| Interview | `GET/POST interview-sessions/` · `GET/PATCH/DELETE interview-sessions/{id}/` · `POST interview-sessions/{id}/regenerate/` · `POST interview-sessions/{id}/questions/` · `GET/POST interview-questions/{id}/answers/` · `GET/PATCH/DELETE interview-answers/{id}/` · `POST interview/star/` |
| Skills & portfolio | `learning-plans/` CRUD · `POST learning-plans/from-job/` · `learning-items/` CRUD · `POST learning-items/{id}/suggest/` · `portfolio-projects/` CRUD · `POST portfolio-projects/{id}/generate/` · `POST portfolio-projects/{id}/add-to-resume/` |
| Sharing | `GET/POST share-grants/` · `POST share-grants/{id}/revoke/` · `GET/PATCH share-grants/{id}/comments/` · `GET shared/{token}/` (public, scoped) · `POST shared/{token}/comments/` · `GET coach/shared-with-me/` · `GET coach/shared/{id}/` · `POST coach/shared/{id}/comments/` |
| Cohorts | `GET/POST cohorts/mine/` · `PATCH/DELETE cohorts/mine/{id}/` · `GET institution/cohorts/` · `GET institution/cohorts/{id}/progress/` (coordinator/admin) |
| Admin (role admin) | `GET admin/overview/` · `GET admin/audit-events/` · `GET/PATCH admin/templates/{slug}/` · `GET/PATCH admin/tickets/{id}/` · `POST admin/cohorts/` |
| Privacy & support | `POST privacy/export/` · `POST privacy/delete-account/` · `GET/POST support-tickets/` |
| System | `GET csrf/` · `GET health/` |

## Sample requests

```bash
# Sign in (stores cookies in jar.txt) and read the CSRF token
curl -c jar.txt -b jar.txt http://127.0.0.1:8000/api/csrf/
CSRF=$(grep csrftoken jar.txt | awk '{print $7}')
curl -c jar.txt -b jar.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
     -d '{"email":"demo@infyro.local","password":"Demo-Account-2026"}' http://127.0.0.1:8000/api/auth/login/

# Create a resume
curl -b jar.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
     -d '{"title":"Data Analyst CV","target_role":"Data Analyst","template":"clarity"}' \
     http://127.0.0.1:8000/api/resumes/

# Autosave content (409 if `revision` is stale)
curl -X PUT -b jar.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
     -d '{"revision": 1, "content": {"personal": {"full_name": "Sam Lee", "email": "sam@example.com", "links": []},
          "sections": [{"key": "s1", "type": "summary", "title": "Summary", "data": {"text": "Analyst ..."}}]}}' \
     http://127.0.0.1:8000/api/resumes/12/content/

# Upload a resume for extraction
curl -b jar.txt -H "X-CSRFToken: $CSRF" -F "file=@resume.pdf" http://127.0.0.1:8000/api/uploads/

# Health check, then job match
curl -b jar.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" -d '{"resume_id": 12}' \
     http://127.0.0.1:8000/api/reports/health/
curl -b jar.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
     -d '{"resume_id": 12, "title": "Data Analyst", "company": "Example Co", "text": "Requirements:\n- SQL ..."}' \
     http://127.0.0.1:8000/api/reports/match/

# Rewrite a bullet
curl -b jar.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
     -d '{"text": "Responsible for writing weekly sales reports", "tone": "concise"}' \
     http://127.0.0.1:8000/api/ai/bullet/

# Export PDF → returns {"url": "/api/files/download/?token=...", "expires_in": 300, ...}
curl -b jar.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" -d '{"format":"pdf"}' \
     http://127.0.0.1:8000/api/resumes/12/export/
```

### Match report shape (abridged)

```json
{
  "kind": "match", "match_score": 54, "quality_score": null,
  "requirements": [{
    "text": "Solid SQL and PostgreSQL knowledge", "kind": "required", "skills": ["PostgreSQL", "SQL"],
    "status": "partial", "skill_status": {"PostgreSQL": "verify", "SQL": "partial"},
    "evidence": [{"section": "Skills", "location": "Languages", "snippet": "Python, SQL, Docker", "term": "SQL"}],
    "notes": ["SQL is listed, but no example of using it was found."]
  }],
  "checklist": [{"id": "partial:SQL", "priority": "high", "text": "Show where you used SQL.", "suggested_edit": null, "done": false}],
  "summary": {"formula": "...", "counts": {"demonstrated": 2, "partial": 2, "verify": 1, "not_found": 2}}
}
```

### AI response envelope

```json
{
  "mode": "offline", "provider": "Offline assistant (rule-based, no AI model)", "model": null,
  "prompt_version": "2026-11-a", "label": "Draft — review and edit before saving. Suggestions may be inaccurate.",
  "result": {"suggestions": [{"text": "Wrote weekly sales reports, resulting in [describe the measurable result]", "rationale": "..."}], "questions": ["..."]},
  "warnings": [{"code": "unsupported_numbers", "message": "..."}],
  "notice": {"code": "consent_required", "message": "..."},
  "log_id": 42
}
```
