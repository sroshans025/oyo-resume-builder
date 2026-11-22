# Infyro AI Resume

A career-readiness workspace: build accurate resumes, check their quality, match them to real job descriptions with
evidence, write cover letters, track applications, practise interviews, plan skills and organise portfolio projects.
AI suggestions are always editable drafts grounded in the user's own facts, and every score explains how it was
calculated.

| | |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite 6, Tailwind CSS 4, Radix primitives, TanStack Query, dnd-kit, Framer Motion |
| **Backend** | Python + Django 6 + Django REST Framework, drf-spectacular (OpenAPI) |
| **Database** | PostgreSQL (production) · SQLite fallback for local development |
| **AI** | Provider adapter: Anthropic Claude (`claude-opus-5-5`) or a built-in **offline rule-based assistant** (default, no key) |
| **Documents** | pypdf + python-docx (import), ReportLab (PDF export) + python-docx (DOCX export) |
| **Background work** | Celery + Redis (eager in-process mode when no broker is configured) |
| **Storage** | Private storage abstraction (local folder by default; S3-compatible via `FILE_STORAGE_BACKEND`) |

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/API.md](docs/API.md) ·
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · OpenAPI spec: [docs/openapi.yaml](docs/openapi.yaml)

---

## Quick start (local development)

Prerequisites: **Python 3.12+** (developed on 3.14) and **Node.js 20+** (developed on 26). PostgreSQL and Redis are
optional locally.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate        macOS/Linux:  source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                 # Windows PowerShell: Copy-Item .env.example .env
python manage.py migrate             # also installs the 5 resume templates
python manage.py seed_demo           # optional: isolated demo account with labelled sample data
python manage.py createsuperuser     # optional: an admin (role=admin) for the Admin console
python manage.py runserver 127.0.0.1:8000
```

API docs (Swagger UI): <http://127.0.0.1:8000/api/docs/> · health: <http://127.0.0.1:8000/api/health/>

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173 (proxies /api to 127.0.0.1:8000)
```

Open <http://localhost:5173>. Create an account, or sign in with the demo account if you ran `seed_demo`:
`demo@infyro.local` / `Demo-Account-2026` (sample data only; flagged `is_demo`). Remove it with
`python manage.py seed_demo --remove`.

In development, password-reset and reminder emails are printed to the Django console.

### 3. Background worker (optional locally)

Without `CELERY_BROKER_URL`, parsing and other tasks run in-process. To use a real queue:

```bash
# set REDIS_URL / CELERY_BROKER_URL in backend/.env and CELERY_TASK_ALWAYS_EAGER=0, then:
celery -A infyro worker --loglevel=INFO
celery -A infyro beat --loglevel=INFO      # reminder dispatch + expired-file purge
```

### Using PostgreSQL locally

```bash
createdb infyro
# backend/.env
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/infyro
python manage.py migrate
```

---

## Configuring an AI provider

The app is fully usable with **no AI key**: writing help, cover letters, interview questions, STAR outlines, project
documents and learning plans fall back to a transparent rule-based assistant, labelled as such in the UI.

To enable live AI with Claude:

```ini
# backend/.env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...         # server-side only; never exposed to the browser
AI_MODEL=claude-opus-5-5
AI_EFFORT=medium
AI_DAILY_REQUEST_LIMIT=100
```

Restart the API. Each user must still opt in under **Settings → Privacy & AI** before any of their content is sent to
the provider; until then they get offline suggestions plus a notice. Every response, live or offline, is
schema-validated and fact-checked: numbers that don't appear in the user's input are replaced with
`[add a real metric]`, and skills not found in the input are flagged. Timeouts, rate limits, refusals and malformed
output fall back to the offline assistant. Only metadata is logged (feature, provider, model, prompt version, latency,
sizes) — never content. To add another provider, implement `AIProvider.generate` in
`backend/apps/intelligence/ai/provider.py`.

---

## Tests and checks

```bash
# Backend (71 tests): auth, isolation, resumes/versions/export, uploads & parsing, AI guardrails,
# health checks, job matching, applications, interview rubric, sharing, cohorts, privacy export/deletion
cd backend
pytest
ruff check . && ruff format --check .
python manage.py makemigrations --check --dry-run

# Frontend (11 unit tests) + lint + types + production build
cd frontend
npm test
npm run lint
npm run typecheck
npm run build

# End-to-end smoke test (real browser, needs both dev servers running)
pip install playwright               # uses your installed Chrome; any venv
python e2e/smoke_test.py --base http://localhost:5173 --out e2e-screens
```

The e2e script registers a fresh account and walks through onboarding, resume editing and autosave, the Writing
Studio, template switching, PDF export, health check, job match, skill plan, applications board, interview practice,
cover letter, dashboard, vault, dark mode and mobile layout — failing on any page error, console error, 5xx response
or horizontal overflow on mobile.

## Production build / deployment

```bash
cp backend/.env.example backend/.env   # set DJANGO_SECRET_KEY, DJANGO_DEBUG=0, SECURE_COOKIES=1, AI settings
docker compose up --build              # http://localhost:8080 — PostgreSQL, Redis, API, worker, beat, nginx SPA
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for HTTPS, object storage, backups, monitoring and the production checklist.

---

## What's implemented

**Public site:** landing page (hero, product preview, features, workflow, trust & privacy, plans, FAQ), features,
pricing (placeholder prices, clearly labelled), how it works / responsible AI, public template gallery, privacy and
terms drafts, sign in, register, password reset, shared-resume viewer, custom 404.

**App (`/app`):** onboarding · dashboard (next best actions from real data only) · resumes workspace · resume editor ·
upload review · template gallery · health check & reports · job match (analyse, saved jobs, compare two JDs, history) ·
cover letters · applications (board/list) · interview practice · skill planner · portfolio · document vault · career
profile · settings & privacy · shared with me (coach view) · institution dashboard (coordinators) · admin console
(admins).

Feature highlights:

- **Resume builder:** create, rename, duplicate for a role, archive, delete; guided sections plus optional awards,
  volunteering, publications, languages and custom; drag-and-drop (and keyboard) section ordering; hide/show sections;
  privacy toggles for email/phone/location; debounced autosave with conflict detection (409) and "reload/overwrite"
  recovery; live A4 preview with page-break markers; 5 ATS-conscious templates with lossless switching; immutable
  versions with labels, restore (current draft saved first) and side-by-side diff; text-selectable PDF and DOCX export
  saved to the vault.
- **Upload & parsing:** PDF/DOCX validated by magic bytes, size, zip-bomb and macro checks; extraction, section and
  date detection, confidence score, column/image-only/symbol warnings; review and correct before creating a **new**
  resume (existing resumes are never overwritten); retry; machine-readable text preview.
- **Writing Studio:** summary, bullet rewrite, project description, achievement builder, action verbs and proofreading,
  with five tones; drafts are editable, labelled, and applied only on click; follow-up questions ask for real
  evidence.
- **Health check:** 25+ deterministic rules across completeness, readability, clarity and consistency; prioritised,
  explained findings with evidence; a documented formula; categories with too little content are marked "Not
  assessed"; resolve/reopen findings; extraction checks for uploaded files.
- **Job match:** JD parsing (responsibilities, required/preferred only when the text says so, years, education);
  per-requirement **and** per-skill evidence statuses with snippets and section references; documented match
  estimate kept separate from quality; tailoring checklist with "only if true" edits; compare two JDs.
- **Applications:** nine stages, board with drag-and-drop or keyboard status menu, list view, search, filters, sorting;
  detail drawer with timeline, interview events (auto reminder 24h before), reminders, contacts and private notes;
  links to the exact resume version and cover letter; suggested (not automatic) follow-up; weekly goal and insights.
- **Interview copilot:** question sets from the JD and resume (technical/behavioural/role), custom questions, optional
  timer, STAR builder, five-criterion transparent rubric, follow-up questions, practice history and favourites.
- **Skill planner & portfolio:** plans from a match report or JD; demonstrated/learning/not-held with a clear line
  between learning and resume claims; milestones, practice tasks, project ideas, evidence links; projects with
  case-study, README, presentation and bullet drafts, evidence checklist, one-click "add to resume".
- **Privacy & governance:** AI consent, data export (ZIP), account deletion with disclosed retention exceptions,
  session list and revoke, notification preferences, upload retention; scoped, expiring, revocable share links (view
  or comment, optional single recipient, contact hidden by default); cohorts with opt-in summaries only; admin
  console (service health, AI usage metadata, templates, support queue, cohorts, audit log) without access to resume
  content.

## Known limitations

- **Not validated for production.** No security review, penetration test, legal/privacy review or load test has been
  performed. Privacy and terms pages are drafts.
- **Scoring weights are prototypes.** Health and match formulas are documented and tested for consistency, but not
  calibrated against real hiring outcomes.
- **Parsing is heuristic.** It handles common single-column layouts and standard headings; complex multi-column PDFs
  and scanned resumes are flagged rather than solved (no OCR).
- **Live AI path tested with mocks only.** The Anthropic adapter's success, refusal, timeout and malformed-output paths
  are unit-tested with a mocked client; no real API key was used during development.
- **Docker stack not run here.** The Dockerfiles and `docker-compose.yml` were written but not executed in this
  environment (Docker isn't installed on the development machine). The backend test suite ran on SQLite, not PostgreSQL;
  CI is configured to run it against PostgreSQL.
- **Email** uses the console backend by default; configure SMTP for real delivery. Calendar integration, OCR,
  multilingual content, voice practice and job-board integrations are not implemented (future scope per the report).
- **Billing/plans** are presentation only; there's no payment integration or plan enforcement.

## Project structure

```
backend/
  infyro/            settings, urls, celery
  apps/core/         error envelope, permissions, throttles, audit log, health, seed_demo command
  apps/accounts/     custom user (roles), profile, sessions, auth endpoints
  apps/resumes/      content schema, models, templates, PDF/DOCX renderers, versions & compare
  apps/documents/    uploads, validation, parsing, private storage, signed downloads, vault
  apps/intelligence/ AI adapter/prompts/guardrails/offline assistant, health check, JD parsing & matching
  apps/workspace/    cover letters, applications, timeline, reminders, notifications, dashboard
  apps/career/       interview sessions & rubric, learning plans, portfolio projects
  apps/governance/   share grants, coach comments, cohorts, support, admin console, privacy export/delete
  tests/             pytest suite
frontend/
  src/components/    ui (design system), layout (shells), resume (preview, editors, Writing Studio)
  src/pages/         public/ and app/ routes
  src/lib/           api client, auth/theme, types, utils
e2e/smoke_test.py    Playwright journey test
docs/                architecture, API, deployment, openapi.yaml
brand/               supplied logo + derived transparent variants
```
#   o y o - r e s u m e - b u i l d e r  
 