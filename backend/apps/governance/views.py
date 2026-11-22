from collections import Counter
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import logout
from django.db.models import Count
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.common import IsCoordinator, IsPlatformAdmin, OwnedPrimaryKeyRelatedField, OwnedViewSetMixin, audit
from apps.core.models import AuditEvent
from apps.resumes.models import Resume, Template

from .models import Cohort, CohortMembership, Institution, ReviewComment, ShareGrant, SupportTicket, hash_token
from .privacy import build_export, delete_account

MAX_SHARE_DAYS = 30


# --- Sharing -------------------------------------------------------------------------------
class ShareGrantSerializer(serializers.ModelSerializer):
    resume = OwnedPrimaryKeyRelatedField(queryset=Resume.objects.all())
    resume_title = serializers.CharField(source="resume.title", read_only=True)
    expires_in_days = serializers.IntegerField(write_only=True, min_value=1, max_value=MAX_SHARE_DAYS, default=7)
    is_active = serializers.ReadOnlyField()
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = ShareGrant
        fields = [
            "id",
            "resume",
            "resume_title",
            "recipient_email",
            "scope",
            "include_contact",
            "expires_in_days",
            "expires_at",
            "revoked_at",
            "is_active",
            "last_accessed_at",
            "access_count",
            "token_hint",
            "comment_count",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "expires_at",
            "revoked_at",
            "is_active",
            "last_accessed_at",
            "access_count",
            "token_hint",
            "created_at",
        ]

    def get_comment_count(self, obj):
        return obj.comments.count()


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewComment
        fields = ["id", "author_name", "section", "text", "resolved", "created_at"]
        read_only_fields = ["id", "author_name", "created_at"]


class ShareGrantViewSet(
    OwnedViewSetMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = ShareGrant.objects.select_related("resume")
    serializer_class = ShareGrantSerializer

    def create(self, request):
        s = ShareGrantSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        token = ShareGrant.new_token()
        days = s.validated_data.pop("expires_in_days")
        grant = s.save(
            owner=request.user,
            token_hash=hash_token(token),
            token_hint=token[:6],
            expires_at=timezone.now() + timedelta(days=days),
        )
        audit(request.user, "share.created", grant, scope=grant.scope, days=days)
        return Response({**ShareGrantSerializer(grant).data, "token": token, "path": f"/shared/{token}"}, status=201)

    @extend_schema(request=None, responses={200: ShareGrantSerializer}, summary="Revoke access immediately")
    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        grant = self.get_object()
        if grant.revoked_at is None:
            grant.revoked_at = timezone.now()
            grant.save(update_fields=["revoked_at"])
            audit(request.user, "share.revoked", grant)
        return Response(ShareGrantSerializer(grant).data)

    @action(detail=True, methods=["get", "patch"])
    def comments(self, request, pk=None):
        grant = self.get_object()
        if request.method == "PATCH":
            ReviewComment.objects.filter(grant=grant, pk=request.data.get("id")).update(
                resolved=bool(request.data.get("resolved"))
            )
        return Response(CommentSerializer(grant.comments.all(), many=True).data)


def _grant_for(token, request):
    grant = (
        ShareGrant.objects.select_related("resume__template", "owner")
        .filter(token_hash=hash_token(token or ""))
        .first()
    )
    if grant is None or not grant.is_active:
        return None, Response(
            {"error": {"code": "share_unavailable", "message": "This link has expired or been revoked."}}, status=404
        )
    if grant.recipient_email:
        if not request.user.is_authenticated:
            return None, Response(
                {
                    "error": {
                        "code": "login_required",
                        "message": "Sign in with the invited email address to view this resume.",
                    }
                },
                status=401,
            )
        if request.user.email.lower() != grant.recipient_email.lower():
            return None, Response(
                {"error": {"code": "share_unavailable", "message": "This link was shared with a different account."}},
                status=404,
            )
    return grant, None


@extend_schema(summary="Open a shared resume (scoped, expiring, revocable)")
@api_view(["GET"])
@permission_classes([AllowAny])
def shared_resume(request, token):
    grant, error = _grant_for(token, request)
    if error:
        return error
    return _shared_payload(grant, request)


def _grant_by_id(pk, request):
    """Recipient-only access by grant id (for the 'Shared with me' list)."""
    grant = (
        ShareGrant.objects.select_related("resume__template", "owner")
        .filter(pk=pk, recipient_email__iexact=request.user.email)
        .first()
    )
    if grant is None or not grant.is_active:
        return None, Response(
            {"error": {"code": "share_unavailable", "message": "This share has expired or been revoked."}}, status=404
        )
    return grant, None


@extend_schema(summary="Open a resume shared with your account (recipient only)")
@api_view(["GET"])
def shared_by_id(request, pk):
    grant, error = _grant_by_id(pk, request)
    if error:
        return error
    return _shared_payload(grant, request)


@extend_schema(request=CommentSerializer, summary="Comment on a resume shared with your account")
@api_view(["POST"])
def shared_by_id_comment(request, pk):
    grant, error = _grant_by_id(pk, request)
    if error:
        return error
    return _add_comment(grant, request)


def _shared_payload(grant, request):
    content = grant.resume.get_content()
    if not grant.include_contact:
        p = content["personal"]
        content["personal"] = {**p, "email": "", "phone": "", "show_email": False, "show_phone": False}
    ShareGrant.objects.filter(pk=grant.pk).update(access_count=grant.access_count + 1, last_accessed_at=timezone.now())
    audit(request.user if request.user.is_authenticated else None, "share.accessed", grant)
    can_comment = grant.scope == "comment" and request.user.is_authenticated
    return Response(
        {
            "title": grant.resume.title,
            "owner_name": grant.owner.full_name or "Infyro user",
            "template": grant.resume.template.slug,
            "style": grant.resume.template.style,
            "content": content,
            "scope": grant.scope,
            "expires_at": grant.expires_at,
            "can_comment": can_comment,
            "comments": CommentSerializer(grant.comments.all(), many=True).data if grant.scope == "comment" else [],
        }
    )


@extend_schema(request=CommentSerializer, summary="Leave review feedback on a shared resume")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def shared_comment(request, token):
    grant, error = _grant_for(token, request)
    if error:
        return error
    return _add_comment(grant, request)


def _add_comment(grant, request):
    if grant.scope != "comment":
        return Response({"error": {"code": "forbidden", "message": "This link is view-only."}}, status=403)
    s = CommentSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    c = s.save(grant=grant, author=request.user, author_name=request.user.full_name or request.user.email.split("@")[0])
    from apps.workspace.models import Notification

    Notification.objects.create(
        owner=grant.owner,
        kind="review",
        title=f"New review comment on “{grant.resume.title}”",
        body=c.text[:200],
        link="/app/settings?tab=sharing",
    )
    return Response(CommentSerializer(c).data, status=201)


@extend_schema(summary="Resumes shared with your account (coach view)")
@api_view(["GET"])
def shared_with_me(request):
    grants = ShareGrant.objects.filter(
        recipient_email__iexact=request.user.email, revoked_at__isnull=True, expires_at__gt=timezone.now()
    ).select_related("resume", "owner")
    return Response(
        [
            {
                "id": g.pk,
                "resume_title": g.resume.title,
                "owner_name": g.owner.full_name or "Infyro user",
                "scope": g.scope,
                "expires_at": g.expires_at,
                "token_hint": g.token_hint,
            }
            for g in grants
        ]
    )


# --- Cohorts --------------------------------------------------------------------------------
@extend_schema(summary="Your cohort memberships, or join one with an invite code")
@api_view(["GET", "POST"])
def my_cohorts(request):
    if request.method == "POST":
        code = str(request.data.get("invite_code", "")).strip().upper()
        cohort = Cohort.objects.filter(invite_code=code).select_related("institution").first()
        if cohort is None:
            return Response(
                {"error": {"code": "invalid_code", "message": "That invite code wasn't recognised."}}, status=400
            )
        m, _ = CohortMembership.objects.get_or_create(
            cohort=cohort,
            user=request.user,
            defaults={"share_progress": bool(request.data.get("share_progress", False))},
        )
        audit(request.user, "cohort.joined", cohort, share_progress=m.share_progress)
    ms = CohortMembership.objects.filter(user=request.user).select_related("cohort__institution")
    return Response(
        [
            {
                "id": m.pk,
                "cohort": m.cohort.name,
                "institution": m.cohort.institution.name,
                "share_progress": m.share_progress,
                "joined_at": m.joined_at,
            }
            for m in ms
        ]
    )


@extend_schema(summary="Change progress-sharing consent or leave a cohort")
@api_view(["PATCH", "DELETE"])
def my_cohort_detail(request, pk):
    m = CohortMembership.objects.filter(user=request.user, pk=pk).first()
    if m is None:
        return Response(status=404)
    if request.method == "DELETE":
        audit(request.user, "cohort.left", m.cohort)
        m.delete()
        return Response(status=204)
    m.share_progress = bool(request.data.get("share_progress"))
    m.save(update_fields=["share_progress"])
    audit(request.user, "cohort.consent_changed", m.cohort, share_progress=m.share_progress)
    return Response({"id": m.pk, "share_progress": m.share_progress})


@extend_schema(summary="Cohorts you coordinate")
@api_view(["GET"])
@permission_classes([IsCoordinator])
def coordinator_cohorts(request):
    qs = Cohort.objects.all() if request.user.role == "admin" else request.user.coordinated_cohorts.all()
    qs = qs.select_related("institution").annotate(members=Count("memberships"))
    return Response(
        [
            {
                "id": c.pk,
                "name": c.name,
                "institution": c.institution.name,
                "invite_code": c.invite_code,
                "members": c.members,
            }
            for c in qs
        ]
    )


@extend_schema(summary="Approved, scoped progress summary for one cohort (no resume content)")
@api_view(["GET"])
@permission_classes([IsCoordinator])
def coordinator_cohort_progress(request, pk):
    from apps.career.models import InterviewSession
    from apps.intelligence.models import AnalysisReport
    from apps.workspace.models import Application

    qs = Cohort.objects.all() if request.user.role == "admin" else request.user.coordinated_cohorts.all()
    cohort = qs.filter(pk=pk).first()
    if cohort is None:
        return Response(status=404)
    members = CohortMembership.objects.filter(cohort=cohort).select_related("user")
    rows = []
    for m in members.filter(share_progress=True):
        u = m.user
        latest = AnalysisReport.objects.filter(owner=u, kind="health").order_by("-created_at").first()
        rows.append(
            {
                "name": u.full_name or "Member",
                "resumes": Resume.objects.filter(owner=u).count(),
                "latest_quality_estimate": latest.quality_score if latest else None,
                "job_matches": AnalysisReport.objects.filter(owner=u, kind="match").count(),
                "applications": Application.objects.filter(owner=u).exclude(status="archived").count(),
                "interview_sessions": InterviewSession.objects.filter(owner=u).count(),
            }
        )
    audit(request.user, "cohort.progress_viewed", cohort)
    return Response(
        {
            "cohort": cohort.name,
            "total_members": members.count(),
            "sharing_members": len(rows),
            "members": rows,
            "note": "Only members who opted in are shown, and only summary counts — never resume content.",
        }
    )


# --- Support --------------------------------------------------------------------------------
class SupportTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = ["id", "subject", "message", "status", "admin_note", "created_at", "updated_at"]
        read_only_fields = ["id", "status", "admin_note", "created_at", "updated_at"]


class SupportTicketViewSet(OwnedViewSetMixin, mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = SupportTicket.objects.all()
    serializer_class = SupportTicketSerializer


# --- Admin console --------------------------------------------------------------------------
@extend_schema(summary="Service health, usage and operational counts (admin)")
@api_view(["GET"])
@permission_classes([IsPlatformAdmin])
def admin_overview(request):
    from apps.accounts.models import User
    from apps.core.views import service_health
    from apps.intelligence.models import AIRequestLog

    since = timezone.now() - timedelta(days=7)
    logs = AIRequestLog.objects.filter(created_at__gte=since)
    by_feature = Counter(logs.values_list("feature", flat=True))
    by_status = Counter(logs.values_list("status", flat=True))
    outcomes = Counter(o for o in logs.values_list("outcome", flat=True) if o)
    return Response(
        {
            "health": service_health(),
            "users": {
                "total": User.objects.count(),
                "by_role": dict(Counter(User.objects.values_list("role", flat=True))),
                "demo_accounts": User.objects.filter(is_demo=True).count(),
            },
            "ai_usage_7d": {
                "requests": logs.count(),
                "by_feature": dict(by_feature),
                "by_status": dict(by_status),
                "suggestion_outcomes": dict(outcomes),
                "avg_latency_ms": round(sum(logs.values_list("latency_ms", flat=True)) / logs.count())
                if logs.exists()
                else None,
            },
            "support": {"open": SupportTicket.objects.exclude(status="closed").count()},
            "limits": {"ai_daily_request_limit": settings.AI_DAILY_REQUEST_LIMIT},
        }
    )


class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True, default=None)

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "actor_email",
            "actor_ref",
            "action",
            "resource_type",
            "resource_id",
            "outcome",
            "metadata",
            "created_at",
        ]


class AdminAuditViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = AuditEventSerializer
    permission_classes = [IsPlatformAdmin]

    def get_queryset(self):
        qs = AuditEvent.objects.select_related("actor")
        action_ = self.request.query_params.get("action")
        return qs.filter(action__startswith=action_[:60]) if action_ else qs


class AdminTemplateSerializer(serializers.ModelSerializer):
    resume_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Template
        fields = ["slug", "name", "category", "description", "is_active", "sort_order", "resume_count"]
        read_only_fields = ["slug", "name", "category", "description", "resume_count"]


class AdminTemplateViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = AdminTemplateSerializer
    permission_classes = [IsPlatformAdmin]
    lookup_field = "slug"
    pagination_class = None
    queryset = Template.objects.annotate(resume_count=Count("resumes"))

    def perform_update(self, serializer):
        t = serializer.save()
        audit(self.request.user, "admin.template_updated", t, is_active=t.is_active)


class AdminTicketViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsPlatformAdmin]
    queryset = SupportTicket.objects.select_related("owner")

    class _S(SupportTicketSerializer):
        owner_email = serializers.CharField(source="owner.email", read_only=True, default=None)

        class Meta(SupportTicketSerializer.Meta):
            fields = SupportTicketSerializer.Meta.fields + ["owner_email"]
            read_only_fields = ["id", "subject", "message", "created_at", "updated_at", "owner_email"]

    serializer_class = _S

    def perform_update(self, serializer):
        t = serializer.save()
        audit(self.request.user, "admin.ticket_updated", t, status=t.status)


@extend_schema(summary="Create an institution cohort and assign a coordinator (admin)")
@api_view(["POST"])
@permission_classes([IsPlatformAdmin])
def admin_create_cohort(request):
    from apps.accounts.models import User

    inst_name = str(request.data.get("institution", "")).strip()[:160]
    name = str(request.data.get("name", "")).strip()[:160]
    if not inst_name or not name:
        raise serializers.ValidationError({"name": "Institution and cohort name are required."})
    inst, _ = Institution.objects.get_or_create(name=inst_name)
    cohort = Cohort.objects.create(institution=inst, name=name, invite_code=Cohort.new_code())
    email = str(request.data.get("coordinator_email", "")).strip().lower()
    if email:
        coord = User.objects.filter(email=email).first()
        if coord is None:
            raise serializers.ValidationError({"coordinator_email": "No account with that email."})
        if coord.role == "user":
            coord.role = "coordinator"
            coord.save(update_fields=["role"])
            audit(request.user, "admin.role_changed", coord, role="coordinator")
        cohort.coordinators.add(coord)
    audit(request.user, "admin.cohort_created", cohort)
    return Response(
        {"id": cohort.pk, "name": cohort.name, "institution": inst.name, "invite_code": cohort.invite_code}, status=201
    )


# --- Privacy --------------------------------------------------------------------------------
@extend_schema(request=None, summary="Export all your data as a ZIP (stored in your vault, short-lived link)")
@api_view(["POST"])
def privacy_export(request):
    from apps.documents.models import GeneratedFile
    from apps.documents.serializers import GeneratedFileSerializer
    from apps.documents.storage import save_private
    from apps.documents.views import link_payload

    data = build_export(request.user)
    key = save_private(request.user, "exports", "zip", data)
    gf = GeneratedFile.objects.create(
        owner=request.user,
        kind=GeneratedFile.Kind.DATA_EXPORT,
        title="Account data export",
        filename=f"infyro-export-{timezone.localdate().isoformat()}.zip",
        storage_key=key,
        mime_type="application/zip",
        size=len(data),
        expires_at=timezone.now() + timedelta(days=2),
    )
    audit(request.user, "privacy.export_created", gf)
    return Response(
        {"file": GeneratedFileSerializer(gf).data, **link_payload("generated", gf, request.user)}, status=201
    )


@extend_schema(
    request={
        "application/json": {
            "type": "object",
            "properties": {"password": {"type": "string"}, "confirm": {"type": "string"}},
        }
    },
    responses={204: None},
    summary="Permanently delete your account and data",
)
@api_view(["POST"])
def privacy_delete(request):
    if str(request.data.get("confirm", "")) != "DELETE":
        raise serializers.ValidationError({"confirm": "Type DELETE to confirm."})
    if not request.user.check_password(str(request.data.get("password", ""))):
        raise serializers.ValidationError({"password": "Password is incorrect."})
    user = request.user
    logout(request)
    delete_account(user)
    return Response(status=status.HTTP_204_NO_CONTENT)
