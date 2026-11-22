from django.contrib.auth import password_validation
from rest_framework import serializers

from .models import Profile, User, UserSession

URL_LIST_MAX = 10


def _clean_str_list(value, *, max_items=12, max_len=80):
    if not isinstance(value, list):
        raise serializers.ValidationError("Must be a list of text values.")
    cleaned = []
    for item in value:
        text = str(item).strip()
        if not text:
            continue
        if len(text) > max_len:
            raise serializers.ValidationError(f"Each entry must be at most {max_len} characters.")
        if text.lower() not in {c.lower() for c in cleaned}:
            cleaned.append(text)
    if len(cleaned) > max_items:
        raise serializers.ValidationError(f"At most {max_items} entries.")
    return cleaned


class ProfileSerializer(serializers.ModelSerializer):
    completion = serializers.ReadOnlyField()

    class Meta:
        model = Profile
        fields = [
            "headline",
            "preferred_roles",
            "experience_level",
            "location",
            "preferred_locations",
            "portfolio_url",
            "github_url",
            "linkedin_url",
            "strengths",
            "learning_goals",
            "preferred_workflow",
            "writing_style",
            "onboarding_completed",
            "ai_consent",
            "ai_consent_at",
            "show_contact_in_shares",
            "notify_in_app",
            "notify_email_reminders",
            "notify_product_updates",
            "followup_days",
            "weekly_application_goal",
            "upload_retention_days",
            "completion",
            "updated_at",
        ]
        read_only_fields = ["ai_consent_at", "updated_at"]
        extra_kwargs = {
            "followup_days": {"min_value": 1, "max_value": 60},
            "weekly_application_goal": {"min_value": 0, "max_value": 100},
            "upload_retention_days": {"min_value": 7, "max_value": 730},
        }

    def validate_preferred_roles(self, v):
        return _clean_str_list(v, max_items=5)

    def validate_preferred_locations(self, v):
        return _clean_str_list(v, max_items=8)

    def validate_strengths(self, v):
        return _clean_str_list(v)

    def validate_learning_goals(self, v):
        return _clean_str_list(v, max_len=160)

    def validate_writing_style(self, v):
        allowed = {"professional", "concise", "technical", "leadership", "fresher", "detailed", "formal"}
        if v not in allowed:
            raise serializers.ValidationError("Unsupported writing style.")
        return v

    def update(self, instance, validated):
        from django.utils import timezone

        if "ai_consent" in validated and validated["ai_consent"] != instance.ai_consent:
            instance.ai_consent_at = timezone.now() if validated["ai_consent"] else None
        return super().update(instance, validated)


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "is_demo", "date_joined", "profile"]
        read_only_fields = ["id", "email", "role", "is_demo", "date_joined", "profile"]


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=120)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=10, max_length=128)
    accept_terms = serializers.BooleanField()

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_accept_terms(self, value):
        if not value:
            raise serializers.ValidationError("Please accept the terms and privacy notice to continue.")
        return value

    def validate(self, attrs):
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        password_validation.validate_password(attrs["password"], candidate)
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, max_length=128)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=10, max_length=128)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        password_validation.validate_password(attrs["new_password"], user)
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=10, max_length=128)


class UserSessionSerializer(serializers.ModelSerializer):
    current = serializers.SerializerMethodField()

    class Meta:
        model = UserSession
        fields = ["id", "user_agent", "created_at", "last_seen_at", "current"]

    def get_current(self, obj):
        request = self.context.get("request")
        return bool(request and request.session.session_key == obj.session_key)
