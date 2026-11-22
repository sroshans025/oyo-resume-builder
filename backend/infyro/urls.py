from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"),
    path("api/", include("apps.core.urls")),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.resumes.urls")),
    path("api/", include("apps.documents.urls")),
    path("api/", include("apps.intelligence.urls")),
    path("api/", include("apps.workspace.urls")),
    path("api/", include("apps.career.urls")),
    path("api/", include("apps.governance.urls")),
]
