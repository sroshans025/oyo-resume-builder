"""Upload validation: type by magic bytes (not just extension), size limits,
and DOCX archive safety checks (zip bombs, macros, path tricks)."""

import io
import zipfile

from django.conf import settings
from rest_framework import serializers

MAX_DOCX_UNCOMPRESSED = 40 * 1024 * 1024
MAX_DOCX_ENTRIES = 1500


def detect_and_validate(name: str, data: bytes) -> str:
    """Returns 'pdf' or 'docx' or raises ValidationError with a helpful message."""
    if not data:
        raise serializers.ValidationError("The file is empty.")
    if len(data) > settings.UPLOAD_MAX_BYTES:
        mb = settings.UPLOAD_MAX_BYTES // (1024 * 1024)
        raise serializers.ValidationError(f"Files must be {mb} MB or smaller.")
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in {"pdf", "docx"}:
        raise serializers.ValidationError("Only PDF and DOCX files are supported. Save .doc files as .docx first.")

    if ext == "pdf":
        if not data[:1024].lstrip().startswith(b"%PDF-"):
            raise serializers.ValidationError("This file does not look like a valid PDF.")
        return "pdf"

    if not data.startswith(b"PK\x03\x04"):
        raise serializers.ValidationError("This file does not look like a valid DOCX document.")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            infos = zf.infolist()
            if len(infos) > MAX_DOCX_ENTRIES:
                raise serializers.ValidationError("This DOCX contains too many internal parts to process safely.")
            total = sum(i.file_size for i in infos)
            if total > MAX_DOCX_UNCOMPRESSED:
                raise serializers.ValidationError("This DOCX expands to an unsafe size and was rejected.")
            names = {i.filename for i in infos}
            if any(n.startswith("/") or ".." in n.split("/") for n in names):
                raise serializers.ValidationError("This DOCX has an invalid internal structure.")
            if "word/document.xml" not in names:
                raise serializers.ValidationError("This file is not a Word document.")
            if any(n.lower().endswith("vbaproject.bin") for n in names):
                raise serializers.ValidationError("Documents containing macros are not accepted.")
    except zipfile.BadZipFile:
        raise serializers.ValidationError("This DOCX file is damaged or incomplete.")
    return "docx"
