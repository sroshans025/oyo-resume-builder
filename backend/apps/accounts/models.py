from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        Profile.objects.get_or_create(user=user)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True, role=User.Role.ADMIN)
        return self._create(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        USER = "user", "Individual user"
        COACH = "coach", "Career coach"
        COORDINATOR = "coordinator", "Institution coordinator"
        ADMIN = "admin", "Administrator"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=120, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.USER, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_demo = models.BooleanField(default=False, help_text="Seeded sample account, isolated from real users.")
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    def __str__(self):
        return self.email

    @property
    def first_name(self):
        return (self.full_name or self.email.split("@")[0]).split(" ")[0]


class Profile(TimeStampedModel):
    class Level(models.TextChoices):
        STUDENT = "student", "Student"
        FRESHER = "fresher", "Fresher / graduate"
        EARLY = "early", "Early career (1–3 yrs)"
        MID = "mid", "Mid-level (3–7 yrs)"
        SENIOR = "senior", "Senior (7+ yrs)"
        CHANGER = "career_changer", "Career changer"

    class Workflow(models.TextChoices):
        BUILD = "build", "Build a resume from scratch"
        UPLOAD = "upload", "Improve an existing resume"
        TAILOR = "tailor", "Tailor for a specific job"
        PREPARE = "prepare", "Prepare for interviews"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    headline = models.CharField(max_length=160, blank=True)
    preferred_roles = models.JSONField(default=list, blank=True)
    experience_level = models.CharField(max_length=20, choices=Level.choices, blank=True)
    location = models.CharField(max_length=120, blank=True)
    preferred_locations = models.JSONField(default=list, blank=True)
    portfolio_url = models.URLField(blank=True)
    github_url = models.URLField(blank=True)
    linkedin_url = models.URLField(blank=True)
    strengths = models.JSONField(default=list, blank=True)
    learning_goals = models.JSONField(default=list, blank=True)
    preferred_workflow = models.CharField(max_length=20, choices=Workflow.choices, blank=True)
    writing_style = models.CharField(max_length=20, default="professional")
    onboarding_completed = models.BooleanField(default=False)

    # Privacy & consent
    ai_consent = models.BooleanField(default=False)
    ai_consent_at = models.DateTimeField(null=True, blank=True)
    show_contact_in_shares = models.BooleanField(default=False)

    # Notifications & goals
    notify_in_app = models.BooleanField(default=True)
    notify_email_reminders = models.BooleanField(default=False)
    notify_product_updates = models.BooleanField(default=False)
    followup_days = models.PositiveSmallIntegerField(default=7)
    weekly_application_goal = models.PositiveSmallIntegerField(default=5)
    upload_retention_days = models.PositiveSmallIntegerField(default=180)

    def __str__(self):
        return f"Profile<{self.user_id}>"

    @property
    def completion(self) -> dict:
        checks = {
            "name": bool(self.user.full_name),
            "headline": bool(self.headline),
            "target_roles": bool(self.preferred_roles),
            "experience_level": bool(self.experience_level),
            "location": bool(self.location),
            "links": bool(self.portfolio_url or self.github_url or self.linkedin_url),
            "strengths": bool(self.strengths),
            "learning_goals": bool(self.learning_goals),
        }
        done = sum(checks.values())
        return {"percent": round(done * 100 / len(checks)), "checks": checks}


class UserSession(models.Model):
    """Tracks the user's own sign-ins so they can review and revoke them."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tracked_sessions")
    session_key = models.CharField(max_length=64, unique=True)
    user_agent = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-last_seen_at"]
