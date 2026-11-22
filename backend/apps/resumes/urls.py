from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("templates", views.TemplateViewSet, basename="template")
router.register("resumes", views.ResumeViewSet, basename="resume")
router.register("resume-versions", views.VersionLookupViewSet, basename="resume-version")

urlpatterns = router.urls
