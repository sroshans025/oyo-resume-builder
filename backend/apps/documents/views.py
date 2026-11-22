import hashlib
from datetime import timedelta

from django.core import signing
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from django.utils.http import content_disposition_header
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.core.common import OwnedViewSetMixin, UploadThrottle, audit
from apps.resumes import content as C
from apps.resumes.models import Resume, Template

from .models import GeneratedFile, UploadedDocument
from .serializers import (
    GeneratedFileSerializer,
    ImportUploadSerializer,
    UploadedDocumentDetailSerializer,
    UploadedDocumentSerializer,
)
from .storage import delete_private, make_download_token, read_download_token, read_private, save_private
from .tasks import parse_upload
from .validation import detect_and_validate


class UploadViewSet(
    OwnedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = UploadedDocument.objects.select_related("imported_resume")
    parser_classes = [MultiPartParser, FormParser, *viewsets.GenericViewSet.parser_classes]

    def get_serializer_class(self):
        return UploadedDocumentDetailSerializer if self.action == "retrieve" else UploadedDocumentSerializer

    def get_throttles(self):
        if self.action == "create":
            return [UploadThrottle()]
        return super().get_throttles()

    @extend_schema(
        request={
            "multipart/form-data": {"type": "object", "properties": {"file": {"type": "string", "format": "binary"}}}
        },
        responses={201: UploadedDocumentDetailSerializer},
        summary="Upload a PDF or DOCX resume for extraction",
    )
    def create(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            raise serializers.ValidationError({"file": "Choose a PDF or DOCX file to upload."})
        name = upload.name[:200]
        data = upload.read()
        try:
            file_type = detect_and_validate(name, data)
        except serializers.ValidationError as exc:
            audit(request.user, "upload.rejected", resource_type="UploadedDocument", outcome="rejected")
            raise serializers.ValidationError({"file": exc.detail})
        key = save_private(request.user, "uploads", file_type, data)
        retention = request.user.profile.upload_retention_days if hasattr(request.user, "profile") else 180
        doc = UploadedDocument.objects.create(
            owner=request.user,
            original_name=name,
            storage_key=key,
            file_type=file_type,
            size=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
            retain_until=(timezone.now() + timedelta(days=retention)).date(),
        )
        transaction.on_commit(lambda: parse_upload.delay(doc.pk))
        audit(request.user, "upload.created", doc, file_type=file_type)
        doc.refresh_from_db()
        return Response(UploadedDocumentDetailSerializer(doc).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        delete_private(instance.storage_key)
        audit(self.request.user, "upload.deleted", instance)
        instance.delete()

    @extend_schema(request=None, responses={202: UploadedDocumentSerializer}, summary="Retry extraction")
    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        doc = self.get_object()
        if doc.status not in (
            UploadedDocument.Status.FAILED,
            UploadedDocument.Status.NEEDS_REVIEW,
            UploadedDocument.Status.PARSED,
        ):
            return Response({"error": {"code": "busy", "message": "This file is still being processed."}}, status=409)
        doc.status = UploadedDocument.Status.PENDING
        doc.save(update_fields=["status"])
        parse_upload.delay(doc.pk)
        doc.refresh_from_db()
        return Response(UploadedDocumentSerializer(doc).data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        request=ImportUploadSerializer,
        responses={201: None},
        summary="Create a NEW resume from reviewed extraction (never overwrites existing resumes)",
    )
    @action(detail=True, methods=["post"], url_path="import")
    def import_resume(self, request, pk=None):
        doc = self.get_object()
        s = ImportUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        content = C.normalize_content(s.validated_data["content"])
        template = (
            Template.objects.filter(slug=s.validated_data["template"], is_active=True).first()
            or Template.objects.first()
        )
        with transaction.atomic():
            resume = Resume.objects.create(
                owner=request.user,
                title=s.validated_data["title"],
                target_role=s.validated_data.get("target_role", ""),
                template=template,
                source="upload",
            )
            resume.set_content(content, bump=False)
            resume.snapshot(reason="import", label=f"Imported from {doc.original_name}"[:120])
            doc.imported_resume = resume
            doc.save(update_fields=["imported_resume", "updated_at"])
        audit(request.user, "upload.imported", doc, resume_id=resume.pk)
        return Response({"resume_id": resume.pk}, status=status.HTTP_201_CREATED)


class GeneratedFileViewSet(
    OwnedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = GeneratedFile.objects.select_related("resume", "resume_version", "cover_letter")
    serializer_class = GeneratedFileSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        kind = self.request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        resume = self.request.query_params.get("resume")
        if resume:
            qs = qs.filter(resume_id=resume)
        return qs

    def perform_destroy(self, instance):
        delete_private(instance.storage_key)
        audit(self.request.user, "file.deleted", instance)
        instance.delete()


def link_payload(kind: str, obj, user) -> dict:
    from django.conf import settings

    token = make_download_token(kind, obj.pk, user.pk)
    return {"url": f"/api/files/download/?token={token}", "expires_in": settings.SIGNED_LINK_TTL_SECONDS}


@extend_schema(
    request=None,
    parameters=[OpenApiParameter("kind", str, OpenApiParameter.PATH, enum=["upload", "generated"])],
    responses={200: {"type": "object", "properties": {"url": {"type": "string"}, "expires_in": {"type": "integer"}}}},
    summary="Create a short-lived signed download link for one of your files",
)
@api_view(["POST"])
def create_link(request, kind, pk):
    model = UploadedDocument if kind == "upload" else GeneratedFile if kind == "generated" else None
    if model is None:
        return Response(status=404)
    obj = model.objects.filter(owner=request.user, pk=pk).first()
    if obj is None:
        return Response(status=404)
    return Response(link_payload(kind, obj, request.user))


@extend_schema(
    parameters=[OpenApiParameter("token", str, required=True)],
    responses={(200, "application/octet-stream"): bytes},
    summary="Download a file using a signed link (owner session also required)",
)
@api_view(["GET"])
def download(request):
    try:
        payload = read_download_token(request.query_params.get("token", ""))
    except signing.SignatureExpired:
        return Response(
            {"error": {"code": "link_expired", "message": "This download link has expired. Request a new one."}},
            status=410,
        )
    except signing.BadSignature:
        return Response({"error": {"code": "invalid_link", "message": "This download link is not valid."}}, status=400)
    if payload.get("u") != request.user.pk:
        return Response(status=404)
    if payload.get("k") == "upload":
        obj = UploadedDocument.objects.filter(owner=request.user, pk=payload.get("i")).first()
        mime = (
            "application/pdf"
            if obj and obj.file_type == "pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        filename = obj.original_name if obj else ""
    else:
        obj = GeneratedFile.objects.filter(owner=request.user, pk=payload.get("i")).first()
        mime = obj.mime_type if obj else ""
        filename = obj.filename if obj else ""
    if obj is None:
        return Response(status=404)
    try:
        data = read_private(obj.storage_key)
    except FileNotFoundError:
        return Response(
            {"error": {"code": "file_missing", "message": "The stored file is no longer available."}}, status=410
        )
    inline = request.query_params.get("inline") == "1" and mime == "application/pdf"
    resp = HttpResponse(data, content_type=mime)
    resp["Content-Disposition"] = content_disposition_header(not inline, " ".join(filename.splitlines()))
    resp["Cache-Control"] = "private, no-store"
    resp["X-Content-Type-Options"] = "nosniff"
    return resp
