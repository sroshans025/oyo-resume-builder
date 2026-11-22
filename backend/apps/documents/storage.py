"""Private file storage and short-lived signed download links.

Files live under per-user prefixes in the default storage backend, which is
never exposed by a public URL. Downloads require both an authenticated owner
session and a signed token that expires after SIGNED_LINK_TTL_SECONDS."""

import hashlib
import uuid
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone

SALT = "infyro.download"


def user_prefix(user) -> str:
    return hashlib.sha256(f"owner:{user.pk}:{settings.SECRET_KEY[:8]}".encode()).hexdigest()[:20]


def save_private(user, folder: str, extension: str, data: bytes) -> str:
    key = f"users/{user_prefix(user)}/{folder}/{uuid.uuid4().hex}.{extension}"
    return default_storage.save(key, ContentFile(data))


def read_private(key: str) -> bytes:
    with default_storage.open(key, "rb") as fh:
        return fh.read()


def delete_private(key: str) -> None:
    if key and default_storage.exists(key):
        default_storage.delete(key)


def make_download_token(kind: str, obj_id: int, user_id: int) -> str:
    return signing.dumps({"k": kind, "i": obj_id, "u": user_id}, salt=SALT, compress=True)


def read_download_token(token: str) -> dict:
    return signing.loads(token, salt=SALT, max_age=settings.SIGNED_LINK_TTL_SECONDS)


def default_expiry():
    return timezone.now() + timedelta(days=settings.GENERATED_FILE_RETENTION_DAYS)


def safe_filename(name: str, extension: str) -> str:
    base = "".join(c if c.isalnum() or c in " -_" else "" for c in name).strip().replace(" ", "_")[:60] or "document"
    return f"{base}.{extension}"
