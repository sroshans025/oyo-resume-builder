from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("uploads", views.UploadViewSet, basename="upload")
router.register("files", views.GeneratedFileViewSet, basename="generated-file")

urlpatterns = [
    path("files/download/", views.download, name="file-download"),
    path("vault/<str:kind>/<int:pk>/link/", views.create_link, name="file-link"),
    *router.urls,
]
