from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create notifications (and optional emails) for reminders that are due. Use from cron if not running Celery beat."

    def handle(self, *args, **options):
        from apps.workspace.tasks import dispatch_for

        self.stdout.write(self.style.SUCCESS(f"Dispatched {dispatch_for()} reminder(s)."))
