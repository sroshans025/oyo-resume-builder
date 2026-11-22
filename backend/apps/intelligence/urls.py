from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("job-descriptions", views.JobDescriptionViewSet, basename="job-description")
router.register("reports", views.ReportViewSet, basename="report")

urlpatterns = [
    path("ai/status/", views.ai_status, name="ai-status"),
    path("ai/summary/", views.ai_summary, name="ai-summary"),
    path("ai/bullet/", views.ai_bullet, name="ai-bullet"),
    path("ai/project/", views.ai_project, name="ai-project"),
    path("ai/achievement/", views.ai_achievement, name="ai-achievement"),
    path("ai/verbs/", views.ai_verbs, name="ai-verbs"),
    path("ai/proofread/", views.ai_proofread, name="ai-proofread"),
    path("ai/feedback/", views.ai_feedback, name="ai-feedback"),
    *router.urls,
]
