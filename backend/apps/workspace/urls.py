from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("cover-letters", views.CoverLetterViewSet, basename="cover-letter")
router.register("cover-letter-blocks", views.CoverLetterBlockViewSet, basename="cover-letter-block")
router.register("applications", views.ApplicationViewSet, basename="application")
router.register("reminders", views.ReminderViewSet, basename="reminder")
router.register("notifications", views.NotificationViewSet, basename="notification")

urlpatterns = [path("dashboard/", views.dashboard, name="dashboard"), *router.urls]
