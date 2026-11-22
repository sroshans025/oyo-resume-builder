"""Structured resume content: schema normalization, validation and plain-text
rendering. This is the single source of truth for what a resume contains;
editor, analysis, job matching and exports all consume this shape.

content = {
  "personal": {full_name, headline, email, phone, location, links:[{label,url}],
               show_email, show_phone, show_location},
  "sections": [{key, type, title, visible, data}]
}
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from contextvars import ContextVar

from rest_framework import serializers

SECTION_TYPES = {
    "summary": "Professional Summary",
    "skills": "Skills",
    "experience": "Experience",
    "education": "Education",
    "projects": "Projects",
    "certifications": "Certifications",
    "awards": "Awards",
    "volunteering": "Volunteering",
    "publications": "Publications",
    "languages": "Languages",
    "custom": "Additional Information",
}
CORE_SECTIONS = ["summary", "skills", "experience", "education", "projects", "certifications"]
OPTIONAL_SECTIONS = ["awards", "volunteering", "publications", "languages", "custom"]

MAX_SECTIONS = 20
MAX_ITEMS = 30
MAX_BULLETS = 12
TEXT_LIMIT = 3000
LINE_LIMIT = 600
SHORT_LIMIT = 160

ITEM_FIELDS = {
    "experience": {"role": SHORT_LIMIT, "organization": SHORT_LIMIT, "location": SHORT_LIMIT, "start": 20, "end": 20},
    "education": {
        "institution": SHORT_LIMIT,
        "degree": SHORT_LIMIT,
        "field": SHORT_LIMIT,
        "location": SHORT_LIMIT,
        "start": 20,
        "end": 20,
        "grade": 60,
        "details": LINE_LIMIT,
    },
    "projects": {"name": SHORT_LIMIT, "role": SHORT_LIMIT, "link": 300, "start": 20, "end": 20},
    "certifications": {"name": SHORT_LIMIT, "issuer": SHORT_LIMIT, "date": 20, "link": 300, "credential_id": 80},
    "awards": {"title": SHORT_LIMIT, "organization": SHORT_LIMIT, "date": 20, "description": LINE_LIMIT},
    "volunteering": {"role": SHORT_LIMIT, "organization": SHORT_LIMIT, "start": 20, "end": 20},
    "publications": {"title": 300, "publisher": SHORT_LIMIT, "date": 20, "link": 300, "description": LINE_LIMIT},
    "languages": {"language": 60, "proficiency": 60},
}
BULLET_TYPES = {"experience", "projects", "volunteering"}
URL_RE = re.compile(r"^(https?://)[^\s]+$", re.I)
_LENIENT: ContextVar[bool] = ContextVar("lenient", default=False)


def _s(value, limit) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\x00", "").strip()
    if len(text) > limit:
        if _LENIENT.get():
            return text[:limit].rstrip()
        raise serializers.ValidationError(f"Text is too long (max {limit} characters).")
    return text


def new_key() -> str:
    return uuid.uuid4().hex[:12]


def default_personal(full_name: str = "", email: str = "") -> dict:
    return {
        "full_name": full_name,
        "headline": "",
        "email": email,
        "phone": "",
        "location": "",
        "links": [],
        "show_email": True,
        "show_phone": True,
        "show_location": True,
    }


def empty_section(section_type: str) -> dict:
    data: dict
    if section_type in ("summary", "custom"):
        data = {"text": ""}
    elif section_type == "skills":
        data = {"groups": [{"id": new_key(), "name": "", "skills": []}]}
    else:
        data = {"items": []}
    return {"key": new_key(), "type": section_type, "title": SECTION_TYPES[section_type], "visible": True, "data": data}


def default_content(full_name: str = "", email: str = "", fresher: bool = False) -> dict:
    order = ["summary", "education", "skills", "projects", "experience", "certifications"] if fresher else CORE_SECTIONS
    return {"personal": default_personal(full_name, email), "sections": [empty_section(t) for t in order]}


def _normalize_personal(p: dict) -> dict:
    if not isinstance(p, dict):
        raise serializers.ValidationError({"personal": "Must be an object."})
    out = default_personal()
    for f in ("full_name", "headline", "phone", "location"):
        out[f] = _s(p.get(f), SHORT_LIMIT)
    email = _s(p.get("email"), 254)
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise serializers.ValidationError({"personal": {"email": "Enter a valid email address."}})
    out["email"] = email
    links = []
    for link in (p.get("links") or [])[:6]:
        if not isinstance(link, dict):
            continue
        url = _s(link.get("url"), 300)
        if not url:
            continue
        if not URL_RE.match(url):
            raise serializers.ValidationError(
                {"personal": {"links": f"'{url[:60]}' must start with http:// or https://"}}
            )
        links.append({"label": _s(link.get("label"), 40) or "Link", "url": url})
    out["links"] = links
    for f in ("show_email", "show_phone", "show_location"):
        out[f] = bool(p.get(f, True))
    return out


def _normalize_items(section_type: str, items) -> list:
    if not isinstance(items, list):
        raise serializers.ValidationError("items must be a list.")
    if len(items) > MAX_ITEMS:
        raise serializers.ValidationError(f"At most {MAX_ITEMS} entries per section.")
    fields = ITEM_FIELDS.get(
        section_type, {"title": SHORT_LIMIT, "subtitle": SHORT_LIMIT, "date": 20, "description": LINE_LIMIT}
    )
    out = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        item = {"id": _s(raw.get("id"), 40) or new_key()}
        for f, limit in fields.items():
            item[f] = _s(raw.get(f), limit)
        if section_type in ("experience", "volunteering", "projects"):
            item["current"] = bool(raw.get("current", False))
        if section_type in BULLET_TYPES:
            bullets = raw.get("bullets") or []
            if not isinstance(bullets, list) or len(bullets) > MAX_BULLETS:
                raise serializers.ValidationError(f"At most {MAX_BULLETS} bullet points per entry.")
            item["bullets"] = [b for b in (_s(b, LINE_LIMIT) for b in bullets)]
        if section_type == "projects":
            tools = raw.get("tools") or []
            item["tools"] = [t for t in (_s(t, 60) for t in tools[:20]) if t]
        for link_field in ("link",):
            if item.get(link_field) and not URL_RE.match(item[link_field]):
                raise serializers.ValidationError(
                    f"Links must start with http:// or https:// ('{item[link_field][:60]}')."
                )
        out.append(item)
    return out


def _normalize_section(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise serializers.ValidationError("Each section must be an object.")
    stype = raw.get("type")
    if stype not in SECTION_TYPES:
        raise serializers.ValidationError(f"Unknown section type '{stype}'.")
    data = raw.get("data") or {}
    if stype in ("summary", "custom"):
        norm = {"text": _s(data.get("text"), TEXT_LIMIT)}
    elif stype == "skills":
        groups = []
        for g in (data.get("groups") or [])[:12]:
            if not isinstance(g, dict):
                continue
            skills = []
            for sk in (g.get("skills") or [])[:60]:
                t = _s(sk, 60)
                if t and t.lower() not in {x.lower() for x in skills}:
                    skills.append(t)
            groups.append({"id": _s(g.get("id"), 40) or new_key(), "name": _s(g.get("name"), 60), "skills": skills})
        norm = {"groups": groups}
    else:
        norm = {"items": _normalize_items(stype, data.get("items") or [])}
    return {
        "key": _s(raw.get("key"), 40) or new_key(),
        "type": stype,
        "title": _s(raw.get("title"), 60) or SECTION_TYPES[stype],
        "visible": bool(raw.get("visible", True)),
        "data": norm,
    }


def normalize_content(content: dict, lenient: bool = False) -> dict:
    """Validate and normalize content. lenient=True truncates overlong text
    instead of rejecting it (used for machine-extracted proposals)."""
    token = _LENIENT.set(lenient)
    try:
        return _normalize_content(content)
    finally:
        _LENIENT.reset(token)


def _normalize_content(content: dict) -> dict:
    if not isinstance(content, dict):
        raise serializers.ValidationError("Content must be an object.")
    sections = content.get("sections") or []
    if not isinstance(sections, list) or len(sections) > MAX_SECTIONS:
        raise serializers.ValidationError(f"Sections must be a list of at most {MAX_SECTIONS}.")
    normalized = [_normalize_section(s) for s in sections]
    keys = [s["key"] for s in normalized]
    if len(keys) != len(set(keys)):
        raise serializers.ValidationError("Section keys must be unique.")
    return {"personal": _normalize_personal(content.get("personal") or {}), "sections": normalized}


def content_hash(content: dict) -> str:
    return hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


# --- Plain text --------------------------------------------------------------------
def date_range(item: dict) -> str:
    start, end = item.get("start", ""), item.get("end", "")
    if item.get("current"):
        end = "Present"
    if start and end:
        return f"{start} – {end}"
    return start or end


def item_heading(stype: str, item: dict) -> tuple[str, str]:
    """Returns (primary line, secondary line) for an entry."""
    if stype in ("experience", "volunteering"):
        return item.get("role", ""), " · ".join(x for x in [item.get("organization"), item.get("location")] if x)
    if stype == "education":
        degree = ", ".join(x for x in [item.get("degree"), item.get("field")] if x)
        return degree or item.get("institution", ""), " · ".join(
            x for x in [item.get("institution") if degree else "", item.get("location"), item.get("grade")] if x
        )
    if stype == "projects":
        return item.get("name", ""), " · ".join(x for x in [item.get("role"), ", ".join(item.get("tools") or [])] if x)
    if stype == "certifications":
        return item.get("name", ""), " · ".join(x for x in [item.get("issuer"), item.get("credential_id")] if x)
    if stype == "languages":
        return item.get("language", ""), item.get("proficiency", "")
    if stype == "publications":
        return item.get("title", ""), item.get("publisher", "")
    return item.get("title", ""), item.get("organization", "") or item.get("subtitle", "")


def item_date(stype: str, item: dict) -> str:
    if stype in ("certifications", "awards", "publications", "custom"):
        return item.get("date", "")
    return date_range(item)


def section_lines(section: dict) -> list[str]:
    stype, data = section["type"], section["data"]
    lines: list[str] = []
    if stype in ("summary", "custom"):
        lines.extend(p for p in data.get("text", "").split("\n") if p.strip())
    elif stype == "skills":
        for g in data.get("groups", []):
            if g["skills"]:
                lines.append((f"{g['name']}: " if g["name"] else "") + ", ".join(g["skills"]))
    else:
        for item in data.get("items", []):
            primary, secondary = item_heading(stype, item)
            head = " | ".join(x for x in [primary, secondary, item_date(stype, item)] if x)
            if head:
                lines.append(head)
            for f in ("details", "description"):
                if item.get(f):
                    lines.append(item[f])
            for b in item.get("bullets", []):
                if b.strip():
                    lines.append(f"• {b}")
            if item.get("link"):
                lines.append(item["link"])
    return lines


def to_plain_text(content: dict, include_hidden: bool = False) -> str:
    p = content.get("personal", {})
    out = [p.get("full_name", "")]
    if p.get("headline"):
        out.append(p["headline"])
    contact = [
        p.get("email") if p.get("show_email", True) else "",
        p.get("phone") if p.get("show_phone", True) else "",
        p.get("location") if p.get("show_location", True) else "",
    ]
    contact += [link["url"] for link in p.get("links", [])]
    out.append(" | ".join(c for c in contact if c))
    for s in content.get("sections", []):
        if not s.get("visible", True) and not include_hidden:
            continue
        lines = section_lines(s)
        if lines:
            out.append("")
            out.append(s["title"].upper())
            out.extend(lines)
    return "\n".join(x for x in out if x is not None).strip()


def iter_evidence_units(content: dict):
    """Yields (section_title, section_type, location_label, text) units used for
    evidence mapping. Location labels let the UI point at the source."""
    for s in content.get("sections", []):
        if not s.get("visible", True):
            continue
        stype, data = s["type"], s["data"]
        if stype in ("summary", "custom") and data.get("text"):
            yield s["title"], stype, s["title"], data["text"]
        elif stype == "skills":
            for g in data.get("groups", []):
                if g["skills"]:
                    yield s["title"], stype, g["name"] or s["title"], ", ".join(g["skills"])
        else:
            for item in data.get("items", []):
                primary, secondary = item_heading(stype, item)
                label = primary or s["title"]
                head = " ".join(x for x in [primary, secondary] if x)
                if head:
                    yield s["title"], stype, label, head
                for f in ("details", "description"):
                    if item.get(f):
                        yield s["title"], stype, label, item[f]
                for b in item.get("bullets", []):
                    if b.strip():
                        yield s["title"], stype, label, b
                if stype == "projects" and item.get("tools"):
                    yield s["title"], stype, label, "Tools: " + ", ".join(item["tools"])
