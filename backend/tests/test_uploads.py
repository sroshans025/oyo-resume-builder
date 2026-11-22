import io
import zipfile

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.documents.models import UploadedDocument
from apps.documents.parsing import clean_text, structure_resume

from .conftest import make_docx, make_pdf

pytestmark = pytest.mark.django_db

RESUME_LINES = [
    "PRIYA SHARMA",
    "Data Analyst",
    "priya.sharma@example.com | +91 98765 43210 | linkedin.com/in/priya-example",
    "",
    "SUMMARY",
    "Data analyst with experience in SQL and Power BI dashboards.",
    "",
    "EXPERIENCE",
    "Data Analyst Intern | Northwind Retail",
    "Jan 2024 - Jun 2024",
    "• Built Power BI dashboards for weekly sales reporting",
    "• Wrote SQL queries to clean 2 years of order data",
    "",
    "EDUCATION",
    "B.Tech Computer Science, Anna University",
    "2020 - 2024",
    "",
    "SKILLS",
    "Languages: Python, SQL",
    "Tools: Power BI, Excel",
]


def upload(client, name, data, ctype="application/pdf", capture=None):
    f = SimpleUploadedFile(name, data, content_type=ctype)
    return client.post("/api/uploads/", {"file": f}, format="multipart")


def test_pdf_upload_parses_sections(client, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        r = upload(client, "priya.pdf", make_pdf([RESUME_LINES]))
    assert r.status_code == 201, r.content
    doc = client.get(f"/api/uploads/{r.json()['id']}/").json()
    assert doc["status"] in ("parsed", "needs_review")
    parsed = doc["parsed"]
    assert parsed["personal"]["email"] == "priya.sharma@example.com"
    types = [s["type"] for s in parsed["sections"]]
    assert {"summary", "experience", "education", "skills"} <= set(types)
    exp = next(s for s in parsed["sections"] if s["type"] == "experience")["data"]["items"][0]
    assert exp["role"] == "Data Analyst Intern" and exp["organization"] == "Northwind Retail"
    assert exp["start"] == "Jan 2024" and len(exp["bullets"]) == 2
    assert "Power BI" in doc["extracted_text"]


def test_multipage_and_unicode_pdf(client, django_capture_on_commit_callbacks):
    page2 = ["PROJECTS", "Café Finder — Résumé parser", "• Implemented search with naïve Bayes ranking"]
    with django_capture_on_commit_callbacks(execute=True):
        r = upload(client, "multi.pdf", make_pdf([RESUME_LINES, page2]))
    doc = client.get(f"/api/uploads/{r.json()['id']}/").json()
    assert doc["page_count"] == 2
    assert "Café Finder" in doc["extracted_text"]
    assert any(s["type"] == "projects" for s in doc["parsed"]["sections"])


def test_docx_upload_and_import_creates_new_resume(client, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        r = upload(
            client,
            "cv.docx",
            make_docx(RESUME_LINES),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    assert r.status_code == 201
    doc = client.get(f"/api/uploads/{r.json()['id']}/").json()
    edited = doc["parsed"]
    edited["personal"]["full_name"] = "Priya Sharma"  # user correction during review
    before = client.get("/api/resumes/").json()["count"]
    imp = client.post(f"/api/uploads/{doc['id']}/import/", {"title": "Imported CV", "content": edited}, format="json")
    assert imp.status_code == 201
    assert client.get("/api/resumes/").json()["count"] == before + 1
    new = client.get(f"/api/resumes/{imp.json()['resume_id']}/").json()
    assert new["content"]["personal"]["full_name"] == "Priya Sharma"
    assert new["source"] == "upload"


@pytest.mark.parametrize(
    "name,data,expected",
    [
        ("evil.exe", b"MZ\x90\x00", "Only PDF and DOCX"),
        ("fake.pdf", b"<html>not a pdf</html>", "valid PDF"),
        ("fake.docx", b"%PDF-1.4 hello", "valid DOCX"),
        ("empty.pdf", b"", "empty"),
    ],
)
def test_unsafe_or_invalid_uploads_rejected(client, name, data, expected):
    r = upload(client, name, data)
    assert r.status_code == 400
    assert expected.lower() in str(r.json()["error"]["fields"]).lower()


def test_macro_docx_and_zip_bomb_rejected(client):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", "<w:document/>")
        zf.writestr("word/vbaProject.bin", "macro")
    r = upload(client, "macro.docx", buf.getvalue())
    assert r.status_code == 400 and "macro" in str(r.json()).lower()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("word/document.xml", "<w:document/>")
        zf.writestr("word/big.xml", "0" * (45 * 1024 * 1024))
    r = upload(client, "bomb.docx", buf.getvalue())
    assert r.status_code == 400 and "unsafe size" in str(r.json()).lower()


def test_oversized_upload_rejected(client, settings):
    settings.UPLOAD_MAX_BYTES = 1000
    r = upload(client, "big.pdf", b"%PDF-1.4" + b"0" * 2000)
    assert r.status_code == 400


def test_upload_isolation_and_delete(client, other_client, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        doc_id = upload(client, "a.pdf", make_pdf([RESUME_LINES])).json()["id"]
    assert other_client.get(f"/api/uploads/{doc_id}/").status_code == 404
    assert other_client.post(f"/api/vault/upload/{doc_id}/link/").status_code == 404
    link = client.post(f"/api/vault/upload/{doc_id}/link/").json()
    assert client.get(link["url"]).status_code == 200
    assert client.delete(f"/api/uploads/{doc_id}/").status_code == 204
    assert not UploadedDocument.objects.filter(pk=doc_id).exists()


def test_image_only_pdf_is_flagged(client, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        r = upload(client, "scan.pdf", make_pdf([[]]))
    doc = client.get(f"/api/uploads/{r.json()['id']}/").json()
    assert any(w["code"] == "image_only" for w in doc["warnings"])
    assert doc["status"] == "needs_review"


def test_column_and_symbol_warnings():
    text, warnings = clean_text(
        "Name\nSkills      Experience here and more\nPython      Built things at a place\nSQL       More long text here today\n"
    )
    codes = {w["code"] for w in warnings}
    assert "columns" in codes and "unusual_symbols" in codes


def test_unusual_headings_still_structured():
    content, confidence, warnings = structure_resume(
        "Sam Lee\nsam@example.com\nWork History\nBarista | Bean Co\n2022 - Present\n- Served customers\nKey Skills\nCustomer service, Excel"
    )
    types = [s["type"] for s in content["sections"]]
    assert "experience" in types and "skills" in types
    assert content["sections"][0]["data"]["items"][0]["current"] is True
