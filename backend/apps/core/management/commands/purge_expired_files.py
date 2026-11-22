from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Delete generated files past their expiry and uploads past their retention date."

    def handle(self, *args, **options):
        from apps.documents.tasks import purge_expired_files

        count = purge_expired_files()
        self.stdout.write(self.style.SUCCESS(f"Purged {count} file(s)."))
