"""Account data export and deletion.

Retention exceptions (disclosed to the user in Settings → Privacy):
  - Audit events are kept with the user link removed (hashed reference only)
    for security investigation.
  - AI request logs (metadata only, no content) are kept with the user link removed.
  - Database backups made before deletion roll off on the backup schedule
    configured by the operator (see docs/DEPLOYMENT.md).
"""

import io
import json
import zipfile

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.forms.models import model_to_dict

from apps.core.common import audit
from apps.documents.storage import delete_private, read_private

EXCLUDE = {"password", "storage_key", "token_hash", "sha256"}


def _rows(qs):
    out = []
    for obj in qs:
        d = model_to_dict(obj)
        for f in ("created_at", "updated_at", "date_joined", "joined_at"):
            if hasattr(obj, f):
                d[f] = getattr(obj, f)
        out.append({k: v for k, v in d.items() if k not in EXCLUDE})
    return out


def build_export(user) -> bytes:
    from apps.accounts.models import Profile
    from apps.career.models import (
        AnswerDraft,
        InterviewQuestion,
        InterviewSession,
        LearningPlan,
        LearningPlanItem,
        PortfolioProject,
    )
    from apps.documents.models import GeneratedFile, UploadedDocument
    from apps.intelligence.models import AnalysisReport, JobDescription
    from apps.resumes.models import Resume, ResumeVersion
    from apps.workspace.models import (
        Application,
        ApplicationEvent,
        CoverLetter,
        CoverLetterBlock,
        Notification,
        Reminder,
    )

    from .models import CohortMembership, ShareGrant

    resumes = Resume.objects.filter(owner=user)
    data = {
        "account": {
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "date_joined": user.date_joined,
        },
        "profile": _rows(Profile.objects.filter(user=user)),
        "resumes": [{**_rows([r])[0], "content": r.get_content()} for r in resumes],
        "resume_versions": _rows(ResumeVersion.objects.filter(resume__owner=user)),
        "uploads": _rows(UploadedDocument.objects.filter(owner=user)),
        "generated_files": _rows(GeneratedFile.objects.filter(owner=user)),
        "job_descriptions": _rows(JobDescription.objects.filter(owner=user)),
        "analysis_reports": _rows(AnalysisReport.objects.filter(owner=user)),
        "cover_letters": _rows(CoverLetter.objects.filter(owner=user)),
        "cover_letter_blocks": _rows(CoverLetterBlock.objects.filter(owner=user)),
        "applications": _rows(Application.objects.filter(owner=user)),
        "application_events": _rows(ApplicationEvent.objects.filter(application__owner=user)),
        "reminders": _rows(Reminder.objects.filter(owner=user)),
        "notifications": _rows(Notification.objects.filter(owner=user)),
        "interview_sessions": _rows(InterviewSession.objects.filter(owner=user)),
        "interview_questions": _rows(InterviewQuestion.objects.filter(session__owner=user)),
        "interview_answers": _rows(AnswerDraft.objects.filter(question__session__owner=user)),
        "learning_plans": _rows(LearningPlan.objects.filter(owner=user)),
        "learning_items": _rows(LearningPlanItem.objects.filter(plan__owner=user)),
        "portfolio_projects": _rows(PortfolioProject.objects.filter(owner=user)),
        "share_grants": _rows(ShareGrant.objects.filter(owner=user)),
        "cohort_memberships": _rows(CohortMembership.objects.filter(user=user)),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("infyro-data.json", json.dumps(data, cls=DjangoJSONEncoder, indent=2, ensure_ascii=False))
        zf.writestr(
            "README.txt",
            "Your Infyro AI Resume data export.\n\ninfyro-data.json contains all records linked to your "
            "account. uploads/ and exports/ contain your stored files.\n",
        )
        for doc in UploadedDocument.objects.filter(owner=user):
            try:
                zf.writestr(f"uploads/{doc.pk}-{doc.original_name}", read_private(doc.storage_key))
            except FileNotFoundError:
                pass
        for f in GeneratedFile.objects.filter(owner=user).exclude(kind="data_export"):
            try:
                zf.writestr(f"exports/{f.pk}-{f.filename}", read_private(f.storage_key))
            except FileNotFoundError:
                pass
    return buf.getvalue()


def delete_account(user):
    from apps.documents.models import GeneratedFile, UploadedDocument
    from apps.intelligence.models import AIRequestLog

    keys = list(UploadedDocument.objects.filter(owner=user).values_list("storage_key", flat=True))
    keys += list(GeneratedFile.objects.filter(owner=user).values_list("storage_key", flat=True))
    audit(user, "account.deleted", user)
    with transaction.atomic():
        AIRequestLog.objects.filter(owner=user).update(owner=None)
        user.delete()  # cascades to all owned records; audit events keep only actor_ref
    for key in keys:
        delete_private(key)
    return len(keys)
