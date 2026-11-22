import difflib

from django.db import transaction
from django.db.models import Count
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.common import OwnedViewSetMixin, audit
from apps.core.exceptions import Conflict

from . import content as C
from .models import Resume, ResumeVersion, Template
from .renderers import render_docx, render_pdf
from .serializers import (
    ContentUpdateSerializer,
    DuplicateSerializer,
    ExportSerializer,
    ResumeCreateSerializer,
    ResumeDetailSerializer,
    ResumeListSerializer,
    TemplateSerializer,
    VersionCreateSerializer,
    VersionDetailSerializer,
    VersionSerializer,
)


class TemplateViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Public template catalogue."""

    queryset = Template.objects.filter(is_active=True)
    serializer_class = TemplateSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"
    pagination_class = None


def _section_lines_map(content):
    return {s["key"]: (s["title"], C.section_lines(s), s.get("visible", True)) for s in content.get("sections", [])}


def compare_contents(a: dict, b: dict) -> dict:
    """Section-level diff between two contents (a = older, b = newer)."""
    pa, pb = (
        C.to_plain_text({"personal": a["personal"], "sections": []}),
        C.to_plain_text({"personal": b["personal"], "sections": []}),
    )
    result = []
    if pa != pb:
        result.append(
            {"title": "Personal details", "status": "changed", "lines": _diff(pa.split("\n"), pb.split("\n"))}
        )
    ma, mb = _section_lines_map(a), _section_lines_map(b)
    order = [s["key"] for s in b.get("sections", [])] + [k for k in ma if k not in mb]
    for key in order:
        if key in ma and key not in mb:
            result.append(
                {"title": ma[key][0], "status": "removed", "lines": [{"op": "-", "text": t} for t in ma[key][1]]}
            )
        elif key in mb and key not in ma:
            result.append(
                {"title": mb[key][0], "status": "added", "lines": [{"op": "+", "text": t} for t in mb[key][1]]}
            )
        else:
            ta, la, va = ma[key]
            tb, lb, vb = mb[key]
            if la == lb and ta == tb and va == vb:
                result.append({"title": tb, "status": "unchanged", "lines": []})
            else:
                status_ = "changed" if la != lb or ta != tb else ("hidden" if not vb else "shown")
                result.append({"title": tb if ta == tb else f"{ta} → {tb}", "status": status_, "lines": _diff(la, lb)})
    order_a = [s["key"] for s in a.get("sections", []) if s["key"] in mb]
    order_b = [s["key"] for s in b.get("sections", []) if s["key"] in ma]
    return {
        "sections": result,
        "reordered": order_a != order_b,
        "summary": {
            k: sum(1 for r in result if r["status"] == k) for k in ("added", "removed", "changed", "unchanged")
        },
    }


def _diff(a: list[str], b: list[str]) -> list[dict]:
    out = []
    for line in difflib.ndiff(a, b):
        op, text = line[:1], line[2:]
        if op in ("+", "-", " "):
            out.append({"op": op, "text": text})
    return out


class ResumeViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = Resume.objects.select_related("template").annotate(section_count=Count("sections"))

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ResumeDetailSerializer
        return ResumeListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        elif self.action == "list" and params.get("include_archived") != "1":
            qs = qs.exclude(status=Resume.Status.ARCHIVED)
        if params.get("q"):
            qs = qs.filter(title__icontains=params["q"][:80])
        return qs

    @extend_schema(request=ResumeCreateSerializer, responses={201: ResumeDetailSerializer}, summary="Create a resume")
    def create(self, request):
        s = ResumeCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        template = Template.objects.filter(slug=d["template"], is_active=True).first() or Template.objects.first()
        with transaction.atomic():
            resume = Resume.objects.create(
                owner=request.user, title=d["title"], target_role=d["target_role"], template=template
            )
            content = C.default_content(request.user.full_name, request.user.email, fresher=d["layout"] == "fresher")
            if d["target_role"]:
                content["personal"]["headline"] = ""
            resume.set_content(content, bump=False)
        audit(request.user, "resume.created", resume)
        resume = self.get_queryset().get(pk=resume.pk)
        return Response(ResumeDetailSerializer(resume).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        audit(self.request.user, "resume.deleted", instance)
        instance.delete()

    @extend_schema(
        request=ContentUpdateSerializer,
        responses={200: ResumeDetailSerializer},
        summary="Autosave draft content (409 if the revision is stale)",
    )
    @action(detail=True, methods=["put"])
    def content(self, request, pk=None):
        resume = self.get_object()
        s = ContentUpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            locked = Resume.objects.select_for_update().get(pk=resume.pk)
            if s.validated_data["revision"] != locked.revision and not s.validated_data["force"]:
                raise Conflict(
                    "This resume was changed in another tab or device. Reload to see the latest version, or overwrite it."
                )
            locked.set_content(s.validated_data["content"])
        return Response({"revision": locked.revision, "updated_at": locked.updated_at})

    @extend_schema(
        request=DuplicateSerializer,
        responses={201: ResumeDetailSerializer},
        summary="Duplicate as a role-specific copy",
    )
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        s = DuplicateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            copy = Resume.objects.create(
                owner=request.user,
                title=s.validated_data["title"],
                target_role=s.validated_data["target_role"] or source.target_role,
                template=source.template,
                source="copy",
                copied_from=source,
            )
            copy.set_content(source.get_content(), bump=False)
            copy.snapshot(reason="duplicate", label=f"Copied from {source.title}"[:120])
        audit(request.user, "resume.duplicated", copy, source_id=source.pk)
        return Response(
            ResumeDetailSerializer(self.get_queryset().get(pk=copy.pk)).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(responses={200: VersionSerializer(many=True)}, summary="List saved versions")
    @action(detail=True, methods=["get", "post"])
    def versions(self, request, pk=None):
        resume = self.get_object()
        if request.method == "POST":
            s = VersionCreateSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            v = resume.snapshot(
                reason="manual", label=s.validated_data["label"], change_summary=s.validated_data["change_summary"]
            )
            return Response(VersionSerializer(v).data, status=status.HTTP_201_CREATED)
        return Response(VersionSerializer(resume.versions.all()[:100], many=True).data)

    @extend_schema(responses={200: VersionDetailSerializer}, summary="Get one version")
    @action(detail=True, methods=["get"], url_path=r"versions/(?P<version_id>\d+)")
    def version_detail(self, request, pk=None, version_id=None):
        resume = self.get_object()
        v = resume.versions.filter(pk=version_id).first()
        if v is None:
            return Response(status=404)
        return Response(VersionDetailSerializer(v).data)

    @extend_schema(
        request=None,
        responses={200: ResumeDetailSerializer},
        summary="Restore a version into the draft (the current draft is saved as a version first)",
    )
    @action(detail=True, methods=["post"], url_path=r"versions/(?P<version_id>\d+)/restore")
    def restore(self, request, pk=None, version_id=None):
        resume = self.get_object()
        v = resume.versions.filter(pk=version_id).first()
        if v is None:
            return Response(status=404)
        with transaction.atomic():
            resume.snapshot(reason="restore", label=f"Before restoring v{v.number}")
            resume.set_content(C.normalize_content(v.content))
            if v.template_slug and v.template_slug != resume.template.slug:
                t = Template.objects.filter(slug=v.template_slug).first()
                if t:
                    resume.template = t
                    resume.save(update_fields=["template"])
        audit(request.user, "resume.version_restored", resume, version=v.number)
        return Response(ResumeDetailSerializer(self.get_queryset().get(pk=resume.pk)).data)

    @extend_schema(
        parameters=[
            OpenApiParameter("a", str, description="version id or 'draft'"),
            OpenApiParameter("b", str, description="version id or 'draft'"),
        ],
        summary="Compare two versions (or a version with the draft)",
    )
    @action(detail=True, methods=["get"], url_path="compare")
    def compare(self, request, pk=None):
        resume = self.get_object()

        def load(ref):
            if ref in (None, "", "draft"):
                return resume.get_content(), "Current draft"
            v = resume.versions.filter(pk=ref).first()
            if v is None:
                return None, None
            return v.content, f"Version {v.number}"

        a, la = load(request.query_params.get("a"))
        b, lb = load(request.query_params.get("b", "draft"))
        if a is None or b is None:
            return Response({"error": {"code": "not_found", "message": "Version not found."}}, status=404)
        return Response({"a_label": la, "b_label": lb, **compare_contents(a, b)})

    @extend_schema(request=ExportSerializer, summary="Export to PDF or DOCX (stored in your document vault)")
    @action(detail=True, methods=["post"])
    def export(self, request, pk=None):
        from apps.documents.models import GeneratedFile
        from apps.documents.storage import default_expiry, safe_filename, save_private
        from apps.documents.views import link_payload

        resume = self.get_object()
        s = ExportSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        fmt = s.validated_data["format"]
        version = resume.snapshot(reason="export", label=f"{fmt.upper()} export")
        content = resume.get_content()
        name = content["personal"].get("full_name") or resume.title
        if fmt == "pdf":
            data, pages = render_pdf(content, resume.template.style, title=f"{name} — Resume")
            mime, kind = "application/pdf", GeneratedFile.Kind.RESUME_PDF
        else:
            data, pages = render_docx(content, resume.template.style, title=f"{name} — Resume"), 0
            mime, kind = (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                GeneratedFile.Kind.RESUME_DOCX,
            )
        key = save_private(request.user, "exports", fmt, data)
        gf = GeneratedFile.objects.create(
            owner=request.user,
            kind=kind,
            title=f"{resume.title} (v{version.number})",
            filename=safe_filename(f"{name} Resume", fmt),
            storage_key=key,
            mime_type=mime,
            size=len(data),
            page_count=pages,
            resume=resume,
            resume_version=version,
            expires_at=default_expiry(),
        )
        audit(request.user, "resume.exported", resume, format=fmt)
        from apps.documents.serializers import GeneratedFileSerializer

        return Response(
            {
                "file": GeneratedFileSerializer(gf).data,
                "version": VersionSerializer(version).data,
                "page_count": pages,
                **link_payload("generated", gf, request.user),
            },
            status=status.HTTP_201_CREATED,
        )


class VersionLookupViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """All versions across the user's resumes (for linking to applications)."""

    serializer_class = VersionSerializer
    pagination_class = None

    def get_queryset(self):
        return (
            ResumeVersion.objects.filter(resume__owner=self.request.user)
            .select_related("resume")
            .order_by("-created_at")[:200]
        )

    def list(self, request):
        return Response(
            [
                {**VersionSerializer(v).data, "resume_id": v.resume_id, "resume_title": v.resume.title}
                for v in self.get_queryset()
            ]
        )
