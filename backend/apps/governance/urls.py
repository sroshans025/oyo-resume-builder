from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("share-grants", views.ShareGrantViewSet, basename="share-grant")
router.register("support-tickets", views.SupportTicketViewSet, basename="support-ticket")
router.register("admin/audit-events", views.AdminAuditViewSet, basename="admin-audit")
router.register("admin/templates", views.AdminTemplateViewSet, basename="admin-template")
router.register("admin/tickets", views.AdminTicketViewSet, basename="admin-ticket")

urlpatterns = [
    path("shared/<str:token>/", views.shared_resume, name="shared-resume"),
    path("shared/<str:token>/comments/", views.shared_comment, name="shared-comment"),
    path("coach/shared-with-me/", views.shared_with_me, name="shared-with-me"),
    path("coach/shared/<int:pk>/", views.shared_by_id, name="shared-by-id"),
    path("coach/shared/<int:pk>/comments/", views.shared_by_id_comment, name="shared-by-id-comment"),
    path("cohorts/mine/", views.my_cohorts, name="my-cohorts"),
    path("cohorts/mine/<int:pk>/", views.my_cohort_detail, name="my-cohort-detail"),
    path("institution/cohorts/", views.coordinator_cohorts, name="coordinator-cohorts"),
    path("institution/cohorts/<int:pk>/progress/", views.coordinator_cohort_progress, name="coordinator-progress"),
    path("admin/overview/", views.admin_overview, name="admin-overview"),
    path("admin/cohorts/", views.admin_create_cohort, name="admin-create-cohort"),
    path("privacy/export/", views.privacy_export, name="privacy-export"),
    path("privacy/delete-account/", views.privacy_delete, name="privacy-delete"),
    *router.urls,
]
