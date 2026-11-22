import logging

from celery import shared_task
from django.utils import timezone

from .models import GeneratedFile, UploadedDocument
from .parsing import clean_text, extract_docx, extract_pdf, structure_resume
from .storage import delete_private, read_private

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def parse_upload(self, document_id: int):
    doc = UploadedDocument.objects.filter(pk=document_id).first()
    if doc is None:
        return
    doc.status = UploadedDocument.Status.PROCESSING
    doc.attempts += 1
    doc.error = ""
    doc.save(update_fields=["status", "attempts", "error", "updated_at"])
    try:
        data = read_private(doc.storage_key)
        extractor = extract_pdf if doc.file_type == "pdf" else extract_docx
        raw, pages, warnings = extractor(data)
        text, clean_warnings = clean_text(raw)
        content, confidence, structure_warnings = structure_resume(text)
        doc.extracted_text = text[:60000]
        doc.page_count = pages
        doc.parsed = content
        doc.confidence = confidence
        doc.warnings = warnings + clean_warnings + structure_warnings
        doc.status = UploadedDocument.Status.PARSED if confidence >= 0.7 else UploadedDocument.Status.NEEDS_REVIEW
    except ValueError as exc:  # user-actionable (e.g. password-protected)
        doc.status = UploadedDocument.Status.FAILED
        doc.error = str(exc)[:300]
    except Exception:
        logger.exception("Parsing failed for upload %s", doc.pk)  # no document content in logs
        doc.status = UploadedDocument.Status.FAILED
        doc.error = (
            "We couldn't read this file. It may be damaged or use an unsupported format. Try exporting it again."
        )
    doc.save()
    return doc.status


@shared_task
def purge_expired_files():
    """Deletes generated files past expiry and uploads past their retention date."""
    now = timezone.now()
    count = 0
    for f in GeneratedFile.objects.filter(expires_at__lt=now):
        delete_private(f.storage_key)
        f.delete()
        count += 1
    for d in UploadedDocument.objects.filter(retain_until__lt=now.date()):
        delete_private(d.storage_key)
        d.delete()
        count += 1
    return count
