from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.backends.db import SessionStore
from django.core.mail import send_mail
from django.db import transaction
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.common import AuthThrottle, audit

from .models import Profile, User, UserSession
from .serializers import (
    LoginSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    RegisterSerializer,
    UserSerializer,
    UserSessionSerializer,
)


def _start_session(request, user):
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    if not request.session.session_key:
        request.session.save()
    UserSession.objects.update_or_create(
        session_key=request.session.session_key,
        defaults={"user": user, "user_agent": request.META.get("HTTP_USER_AGENT", "")[:200]},
    )


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    @extend_schema(request=RegisterSerializer, responses={201: UserSerializer}, summary="Create an account")
    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            user = User.objects.create_user(
                email=s.validated_data["email"],
                password=s.validated_data["password"],
                full_name=s.validated_data["full_name"].strip(),
            )
        _start_session(request, user)
        audit(user, "account.registered", user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    @extend_schema(request=LoginSerializer, responses={200: UserSerializer}, summary="Sign in with email and password")
    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = authenticate(request, email=s.validated_data["email"].lower(), password=s.validated_data["password"])
        if user is None or user.status != User.Status.ACTIVE:
            audit(None, "auth.login_failed", resource_type="User", outcome="failure")
            return Response(
                {"error": {"code": "invalid_credentials", "message": "Email or password is incorrect."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _start_session(request, user)
        audit(user, "auth.login", user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None}, summary="Sign out of this session")
    def post(self, request):
        UserSession.objects.filter(session_key=request.session.session_key).delete()
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: UserSerializer}, summary="Current user (null when signed out)")
    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"user": None})
        Profile.objects.get_or_create(user=request.user)
        return Response({"user": UserSerializer(request.user).data})

    @extend_schema(request=UserSerializer, responses={200: UserSerializer}, summary="Update name")
    def patch(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        s = UserSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response({"user": s.data})


class ProfileView(APIView):
    @extend_schema(responses={200: ProfileSerializer}, summary="Career profile")
    def get(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        return Response(ProfileSerializer(profile).data)

    @extend_schema(request=ProfileSerializer, responses={200: ProfileSerializer}, summary="Update career profile")
    def patch(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        consent_before = profile.ai_consent
        s = ProfileSerializer(profile, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        if consent_before != profile.ai_consent:
            audit(request.user, "privacy.ai_consent_changed", profile, granted=profile.ai_consent)
        return Response(ProfileSerializer(profile).data)


class PasswordChangeView(APIView):
    @extend_schema(request=PasswordChangeSerializer, responses={204: None}, summary="Change password")
    def post(self, request):
        s = PasswordChangeSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        request.user.set_password(s.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)
        audit(request.user, "auth.password_changed", request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    @extend_schema(request=PasswordResetRequestSerializer, responses={202: None}, summary="Email a reset link")
    def post(self, request):
        s = PasswordResetRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = User.objects.filter(email=s.validated_data["email"].lower(), is_active=True).first()
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
            send_mail(
                "Reset your Infyro password",
                f"Use this link within 2 hours to choose a new password:\n\n{link}\n\n"
                "If you did not request this, you can ignore this email.",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=True,
            )
            audit(user, "auth.password_reset_requested", user)
        # Same response whether or not the account exists (no account enumeration).
        return Response(
            {"detail": "If an account exists for that email, a reset link has been sent."},
            status=status.HTTP_202_ACCEPTED,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    @extend_schema(
        request=PasswordResetConfirmSerializer, responses={204: None}, summary="Set a new password from a reset link"
    )
    def post(self, request):
        from django.contrib.auth import password_validation

        s = PasswordResetConfirmSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(s.validated_data["uid"])))
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if user is None or not default_token_generator.check_token(user, s.validated_data["token"]):
            return Response(
                {"error": {"code": "invalid_token", "message": "This reset link is invalid or has expired."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        password_validation.validate_password(s.validated_data["new_password"], user)
        user.set_password(s.validated_data["new_password"])
        user.save(update_fields=["password"])
        _revoke_sessions(user)
        audit(user, "auth.password_reset_completed", user)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _revoke_sessions(user, keep_key=None):
    for tracked in UserSession.objects.filter(user=user):
        if tracked.session_key != keep_key:
            SessionStore(session_key=tracked.session_key).delete()
            tracked.delete()


class SessionListView(APIView):
    @extend_schema(responses={200: UserSessionSerializer(many=True)}, summary="Active sessions")
    def get(self, request):
        sessions = UserSession.objects.filter(user=request.user)
        return Response(UserSessionSerializer(sessions, many=True, context={"request": request}).data)


class SessionRevokeView(APIView):
    @extend_schema(request=None, responses={204: None}, summary="Sign out one session, or all others with id='others'")
    def delete(self, request, session_id):
        current = request.session.session_key
        if session_id == "others":
            _revoke_sessions(request.user, keep_key=current)
        else:
            tracked = UserSession.objects.filter(user=request.user, pk=session_id).first()
            if tracked is None:
                return Response(status=status.HTTP_404_NOT_FOUND)
            SessionStore(session_key=tracked.session_key).delete()
            tracked.delete()
        audit(request.user, "auth.sessions_revoked", request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
