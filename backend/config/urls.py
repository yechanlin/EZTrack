from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    """Hosting platforms ping this to decide whether the service is up."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("expenses.urls")),
]
