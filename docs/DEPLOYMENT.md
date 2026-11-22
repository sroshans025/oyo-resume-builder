# Deployment guide

> The configuration below is HTTPS-ready, but this build has **not** had a security, privacy or legal review. Do that
> for your market and hosting region before handling real user data.

## Reference topology

```
Internet ──TLS──► load balancer / reverse proxy (HTTPS, HSTS, redirect 80→443)
                    └─► web (nginx: SPA + /api proxy)
                          └─► api (gunicorn + Django)  ──► PostgreSQL (managed, encrypted, backed up)
                                                       ──► Object storage (private bucket) or a volume
                          worker / beat (Celery)       ──► Redis (broker + cache)
```

`docker compose up --build` runs this topology on one host (without TLS) for staging.

## Production checklist

| Setting | Value |
|---|---|
| `DJANGO_DEBUG` | `0` |
| `DJANGO_SECRET_KEY` | 50+ random characters from a secret manager |
| `DJANGO_ALLOWED_HOSTS` | your domain(s) |
| `DJANGO_CSRF_TRUSTED_ORIGINS` / `CORS_ALLOWED_ORIGINS` | `https://your-domain` |
| `FRONTEND_URL` | `https://your-domain` |
| `SECURE_COOKIES` | `1` |
| `BEHIND_TLS_PROXY` | `1` if the proxy sets `X-Forwarded-Proto` |
| `SECURE_SSL_REDIRECT` | `1` unless the proxy already redirects |
| `DATABASE_URL` | PostgreSQL connection string (TLS) |
| `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_TASK_ALWAYS_EAGER=0` | enable the queue |
| `EMAIL_BACKEND` + SMTP settings | real delivery from a verified sending domain |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY` | optional; review the provider's data-handling and retention terms first |
| `FILE_STORAGE_BACKEND` | object storage with a **private** bucket (for example `storages.backends.s3.S3Storage` via django-storages) |

Then run `python manage.py check --deploy`. The only expected notices are `SECURE_SSL_REDIRECT` (if TLS is enforced at the
proxy) and HSTS preload.

## Steps

1. Build images: `docker compose build` (or build `backend/` and `frontend/` separately in CI).
2. Migrate: the API container runs `migrate` on start; for zero-downtime deploys run it as a separate release step.
3. Create an administrator: `docker compose exec api python manage.py createsuperuser`.
4. Don't run `seed_demo` in production unless you want the clearly-labelled demo account.
5. Start the `worker` and `beat` services. Beat dispatches due reminders every 5 minutes and purges expired files
   hourly.

## Backups & retention

- Use managed PostgreSQL with point-in-time recovery; keep backups encrypted, and set and publish a retention period
  (for example 30 days). Data deleted by users disappears from backups as they roll off — say so in the privacy notice.
- Back up the private-file volume or bucket (versioning plus lifecycle rules matching the retention above).
- `purge_expired_files` deletes expired exports and uploads past their retention date.

## Monitoring hooks

- `GET /api/health/` for liveness (database and storage); the admin console shows queue and AI provider status.
- Logs go to stdout and never include request bodies or resume content. Ship them to your log platform.
- `SENTRY_DSN` is reserved: install `sentry-sdk` and initialise it in `infyro/settings.py` with `send_default_pii=False`.
- Watch `AIRequestLog` (admin console → Health & usage) for AI error rates, latency and cost trends; tune
  `AI_DAILY_REQUEST_LIMIT` and `THROTTLE_AI`.

## Security notes

- Upload validation checks extension and magic bytes, a 5 MB limit, DOCX zip bombs, macros and path tricks. Add an
  antivirus scan (for example ClamAV) before parsing if your threat model needs it.
- nginx sets a strict Content Security Policy and security headers. Django sets HSTS, `nosniff`, a referrer policy
  and `X-Frame-Options: DENY`.
- Signed download links expire after `SIGNED_LINK_TTL_SECONDS` (default 300) and also require the owner's session.
