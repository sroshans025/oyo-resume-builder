from django.apps import AppConfig
from django.db.models.signals import post_migrate


class ResumesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.resumes"
    label = "resumes"

    def ready(self):
        from .templates_catalog import sync_templates

        post_migrate.connect(lambda sender, **kw: sync_templates() if sender.name == self.name else None, weak=False)
