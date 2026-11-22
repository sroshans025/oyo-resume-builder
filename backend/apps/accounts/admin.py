from django.contrib import admin

from .models import Profile, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["email", "role", "status", "is_demo", "date_joined"]
    list_filter = ["role", "status", "is_demo"]
    search_fields = ["email"]
    exclude = ["password", "user_permissions", "groups"]


admin.site.register(Profile)
