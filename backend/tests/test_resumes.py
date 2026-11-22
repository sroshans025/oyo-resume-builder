import io

import pytest
from pypdf import PdfReader

from apps.resumes import content as C
from apps.resumes.models import Resume

pytestmark = pytest.mark.django_db


def test_create_has_default_sections_and_templates(client):
    assert len(client.get("/api/templates/").json()) == 5
    r = client.post("/api/resumes/", {"title": "Grad CV", "layout": "fresher", "template": "launch"}, format="json")
    assert r.status_code == 201
    body = r.json()
    assert body["template"] == "launch"
    types = [s["type"] for s in body["content"]["sections"]]
    assert types[:2] == ["summary", "education"]
    assert body["content"]["personal"]["full_name"] == "Ana Pereira"


def test_autosave_conflict_detection(client, resume):
    current = client.get(f"/api/resumes/{resume}/").json()
    content = current["content"]
    content["sections"][0]["data"]["text"] = "Updated summary"
    ok = client.put(
        f"/api/resumes/{resume}/content/", {"revision": current["revision"], "content": content}, format="json"
    )
    assert ok.status_code == 200
    stale = client.put(
        f"/api/resumes/{resume}/content/", {"revision": current["revision"], "content": content}, format="json"
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "conflict"
    forced = client.put(
        f"/api/resumes/{resume}/content/",
        {"revision": current["revision"], "content": content, "force": True},
        format="json",
    )
    assert forced.status_code == 200


def test_section_reordering_is_persisted(client, resume):
    data = client.get(f"/api/resumes/{resume}/").json()
    sections = data["content"]["sections"]
    reordered = list(reversed(sections))
    client.put(
        f"/api/resumes/{resume}/content/",
        {"revision": data["revision"], "content": {**data["content"], "sections": reordered}},
        format="json",
    )
    after = client.get(f"/api/resumes/{resume}/").json()["content"]["sections"]
    assert [s["key"] for s in after] == [s["key"] for s in reordered]


def test_validation_errors_are_reported(client, resume):
    data = client.get(f"/api/resumes/{resume}/").json()
    bad = data["content"]
    bad["personal"]["links"] = [{"label": "x", "url": "javascript:alert(1)"}]
    r = client.put(f"/api/resumes/{resume}/content/", {"revision": data["revision"], "content": bad}, format="json")
    assert r.status_code == 400
    bad["personal"]["links"] = []
    bad["sections"].append({"type": "unknown", "data": {}})
    r = client.put(f"/api/resumes/{resume}/content/", {"revision": data["revision"], "content": bad}, format="json")
    assert r.status_code == 400


def test_duplicate_version_restore_and_compare(client, resume):
    dup = client.post(
        f"/api/resumes/{resume}/duplicate/",
        {"title": "Backend CV — Acme", "target_role": "Platform Engineer"},
        format="json",
    )
    assert dup.status_code == 201
    dup_body = dup.json()
    assert dup_body["copied_from"] == resume
    assert dup_body["content"]["sections"] == client.get(f"/api/resumes/{resume}/").json()["content"]["sections"]

    v1 = client.post(f"/api/resumes/{resume}/versions/", {"label": "Before edits"}, format="json").json()
    data = client.get(f"/api/resumes/{resume}/").json()
    data["content"]["sections"][0]["data"]["text"] = "Completely new summary"
    client.put(
        f"/api/resumes/{resume}/content/", {"revision": data["revision"], "content": data["content"]}, format="json"
    )

    cmp = client.get(f"/api/resumes/{resume}/compare/?a={v1['id']}&b=draft").json()
    changed = [s for s in cmp["sections"] if s["status"] == "changed"]
    assert changed and changed[0]["title"] == "Summary"
    assert any(line["op"] == "+" and "Completely new summary" in line["text"] for line in changed[0]["lines"])

    restored = client.post(f"/api/resumes/{resume}/versions/{v1['id']}/restore/").json()
    assert restored["content"]["sections"][0]["data"]["text"] == "Backend developer focused on Python APIs."
    reasons = [v["reason"] for v in client.get(f"/api/resumes/{resume}/versions/").json()]
    assert "restore" in reasons  # pre-restore draft was preserved


def test_template_switch_keeps_content(client, resume):
    before = client.get(f"/api/resumes/{resume}/").json()["content"]
    r = client.patch(f"/api/resumes/{resume}/", {"template": "summit"}, format="json")
    assert r.status_code == 200
    after = client.get(f"/api/resumes/{resume}/").json()
    assert after["template"] == "summit"
    assert after["content"] == before


def test_pdf_export_is_text_selectable_and_unicode_safe(client, resume):
    data = client.get(f"/api/resumes/{resume}/").json()
    data["content"]["personal"]["full_name"] = "Zoë Šimić-Ñúñez"
    client.put(
        f"/api/resumes/{resume}/content/", {"revision": data["revision"], "content": data["content"]}, format="json"
    )
    r = client.post(f"/api/resumes/{resume}/export/", {"format": "pdf"}, format="json")
    assert r.status_code == 201
    body = r.json()
    assert body["page_count"] >= 1
    dl = client.get(body["url"])
    assert dl.status_code == 200
    assert dl["Content-Disposition"].startswith("attachment;")
    assert "filename*=utf-8" in dl["Content-Disposition"].lower()
    text = "".join(
        p.extract_text()
        for p in PdfReader(
            io.BytesIO(b"".join(dl.streaming_content) if hasattr(dl, "streaming_content") else dl.content)
        ).pages
    )
    assert "Zoë Šimić-Ñúñez" in text
    assert "Built a Django REST API" in text
    assert "EXPERIENCE" in text
    # Reading order: summary precedes experience which precedes education
    assert text.index("SUMMARY") < text.index("EXPERIENCE") < text.index("EDUCATION")


def test_hidden_contact_details_are_not_exported(client, resume):
    data = client.get(f"/api/resumes/{resume}/").json()
    data["content"]["personal"]["show_phone"] = False
    client.put(
        f"/api/resumes/{resume}/content/", {"revision": data["revision"], "content": data["content"]}, format="json"
    )
    body = client.post(f"/api/resumes/{resume}/export/", {"format": "pdf"}, format="json").json()
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(client.get(body["url"]).content)).pages)
    assert "7000 000000" not in text
    assert "ana@example.com" in text


def test_docx_export(client, resume):
    from docx import Document

    body = client.post(f"/api/resumes/{resume}/export/", {"format": "docx"}, format="json").json()
    doc = Document(io.BytesIO(client.get(body["url"]).content))
    assert any("Budget Tracker" in p.text for p in doc.paragraphs)


def test_download_link_is_owner_bound_and_signed(client, other_client, resume):
    body = client.post(f"/api/resumes/{resume}/export/", {"format": "pdf"}, format="json").json()
    assert other_client.get(body["url"]).status_code == 404
    assert client.get(body["url"] + "tampered").status_code == 400


def test_snapshot_dedupes_unchanged_content(user, sample_content):
    from apps.resumes.models import Template

    r = Resume.objects.create(owner=user, title="t", template=Template.objects.first())
    r.set_content(sample_content)
    v1 = r.snapshot(reason="export")
    v2 = r.snapshot(reason="analysis")
    assert v1.pk == v2.pk
    v3 = r.snapshot(reason="manual")
    assert v3.number == v1.number + 1


def test_plain_text_and_evidence_units(sample_content):
    text = C.to_plain_text(sample_content)
    assert text.startswith("Ana Pereira")
    units = list(C.iter_evidence_units(sample_content))
    assert any(u[1] == "projects" and "PostgreSQL" in u[3] for u in units)
