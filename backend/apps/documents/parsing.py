"""Text extraction and heuristic resume structuring.

Extraction is deterministic (pypdf / python-docx). Structuring uses heading
synonyms, date and bullet patterns. The output is a *proposal* that the user
reviews and corrects before anything is saved to a resume."""

from __future__ import annotations

import io
import re
import unicodedata

from apps.resumes import content as C

HEADING_SYNONYMS = {
    "summary": [
        "summary",
        "professional summary",
        "profile",
        "professional profile",
        "objective",
        "career objective",
        "about me",
        "about",
        "career summary",
        "personal statement",
    ],
    "experience": [
        "experience",
        "work experience",
        "professional experience",
        "employment history",
        "employment",
        "work history",
        "internships",
        "internship",
        "internship experience",
        "relevant experience",
        "career history",
    ],
    "education": [
        "education",
        "academic background",
        "academics",
        "education and training",
        "educational qualifications",
        "academic qualifications",
        "qualifications",
    ],
    "skills": [
        "skills",
        "technical skills",
        "key skills",
        "core skills",
        "core competencies",
        "competencies",
        "technologies",
        "tools and technologies",
        "skills and tools",
        "areas of expertise",
        "expertise",
    ],
    "projects": [
        "projects",
        "academic projects",
        "personal projects",
        "key projects",
        "selected projects",
        "project experience",
    ],
    "certifications": [
        "certifications",
        "certificates",
        "licenses and certifications",
        "licences and certifications",
        "courses",
        "training",
        "certifications and courses",
        "courses and certifications",
    ],
    "awards": ["awards", "achievements", "honors", "honours", "accomplishments", "awards and achievements"],
    "volunteering": [
        "volunteering",
        "volunteer experience",
        "volunteer work",
        "community involvement",
        "extracurricular activities",
        "leadership and activities",
        "activities",
    ],
    "publications": ["publications", "research", "papers"],
    "languages": ["languages", "language skills"],
}
_HEADING_LOOKUP = {syn: t for t, syns in HEADING_SYNONYMS.items() for syn in syns}

MONTH = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
DATE = rf"(?:{MONTH}\.?\s+\d{{4}}|\d{{1,2}}/\d{{4}}|\d{{4}}-\d{{2}}|\d{{4}})"
RANGE_RE = re.compile(rf"({DATE})\s*(?:-|–|—|to)\s*({DATE}|present|current|now|ongoing)", re.I)
SINGLE_DATE_RE = re.compile(rf"\b({DATE})\b", re.I)
BULLET_RE = re.compile(r"^\s*(?:[•●▪◦‣∙·*\-–]|\d{1,2}[.)])\s+")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
URL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|[\w-]+\.(?:dev|io|me|com|in|org))/?[\w\-./?=#%]*",
    re.I,
)
EDU_WORDS = re.compile(r"\b(university|college|institute|school|academy|polytechnic|iit|nit)\b", re.I)


# --- Extraction --------------------------------------------------------------------
def extract_pdf(data: bytes) -> tuple[str, int, list[dict]]:
    from pypdf import PdfReader

    warnings: list[dict] = []
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:
            raise ValueError("This PDF is password-protected. Remove the password and upload again.")
    pages = []
    for page in reader.pages[:20]:
        try:
            pages.append(page.extract_text(extraction_mode="layout") or "")
        except Exception:
            pages.append(page.extract_text() or "")
    if len(reader.pages) > 20:
        warnings.append(
            _w(
                "long_document",
                "medium",
                "Only the first 20 pages were read",
                "Resumes are usually 1–2 pages. Longer documents may be CVs or portfolios.",
            )
        )
    text = "\n".join(pages)
    chars_per_page = len(re.sub(r"\s", "", text)) / max(1, len(pages))
    if chars_per_page < 150:
        warnings.append(
            _w(
                "image_only",
                "high",
                "Little or no selectable text was found",
                "The PDF may be a scanned image or use text converted to outlines. Many screening systems "
                "cannot read image-only text. Export a text-based PDF from your editor instead.",
            )
        )
    return text, len(reader.pages), warnings


def extract_docx(data: bytes) -> tuple[str, int, list[dict]]:
    from docx import Document

    warnings: list[dict] = []
    doc = Document(io.BytesIO(data))
    lines = [p.text for p in doc.paragraphs]
    if doc.tables:
        warnings.append(
            _w(
                "tables",
                "medium",
                f"{len(doc.tables)} table(s) found",
                "Content inside tables can be read out of order by some parsers. Prefer plain paragraphs.",
            )
        )
        for table in doc.tables:
            for row in table.rows:
                cells = []
                for cell in row.cells:
                    t = cell.text.strip()
                    if t and t not in cells:
                        cells.append(t)
                lines.extend(cells)
    has_text_boxes = b"txbxContent" in data or any("txbxContent" in p._p.xml for p in doc.paragraphs[:200])
    if has_text_boxes:
        warnings.append(
            _w(
                "text_boxes",
                "medium",
                "Text boxes detected",
                "Text inside text boxes may be skipped or misplaced when extracted.",
            )
        )
    text = "\n".join(lines)
    pages_estimate = max(1, round(len(text) / 3200))
    return text, pages_estimate, warnings


def _w(code, severity, title, detail):
    return {"code": code, "severity": severity, "title": title, "detail": detail}


# --- Cleaning ---------------------------------------------------------------------------
def clean_text(text: str) -> tuple[str, list[dict]]:
    warnings = []
    text = unicodedata.normalize("NFKC", text).replace("\r", "")
    unusual = [ch for ch in text if unicodedata.category(ch) in ("Co", "Cn") or ch == "�"]
    if len(unusual) > 3:
        warnings.append(
            _w(
                "unusual_symbols",
                "medium",
                "Unusual or unreadable symbols found",
                "Icon fonts or special glyphs extracted as unknown characters. Replace icons with plain text labels.",
            )
        )
    text = "".join(ch for ch in text if ch not in unusual)
    raw_lines = text.split("\n")
    gap_lines = sum(1 for ln in raw_lines if len(re.findall(r"\S\s{4,}\S", ln)) >= 1 and len(ln.strip()) > 20)
    if raw_lines and gap_lines / max(1, len([ln for ln in raw_lines if ln.strip()])) > 0.25:
        warnings.append(
            _w(
                "columns",
                "medium",
                "Possible multi-column layout",
                "Several lines contain wide gaps, which usually means side-by-side columns. Columns can be "
                "extracted in the wrong order. A single-column layout is safer.",
            )
        )
    lines = [re.sub(r"[ \t]{2,}", "  ", ln).strip() for ln in raw_lines]
    out, blank = [], 0
    for ln in lines:
        if not ln:
            blank += 1
            if blank <= 1:
                out.append("")
            continue
        blank = 0
        out.append(ln)
    return "\n".join(out).strip(), warnings


# --- Structuring -------------------------------------------------------------------------
def heading_type(line: str) -> str | None:
    norm = re.sub(r"[^a-z& ]", "", line.lower().replace("&", "and")).strip()
    norm = re.sub(r"\s+", " ", norm)
    if not norm or len(norm) > 40:
        return None
    return _HEADING_LOOKUP.get(norm)


def _split_dates(line: str) -> tuple[str, str, str, bool]:
    m = RANGE_RE.search(line)
    if m:
        start, end = m.group(1).strip(), m.group(2).strip()
        current = end.lower() in {"present", "current", "now", "ongoing"}
        rest = (line[: m.start()] + line[m.end() :]).strip(" |,–-()")
        return rest, start, "" if current else end, current
    m = SINGLE_DATE_RE.search(line)
    if m and len(line) < 120:
        rest = (line[: m.start()] + line[m.end() :]).strip(" |,–-()")
        return rest, "", m.group(1), False
    return line, "", "", False


def _split_head(text: str) -> tuple[str, str]:
    for sep in (" | ", " — ", " – ", " - ", " at ", " @ ", ", "):
        if sep in text:
            a, b = text.split(sep, 1)
            return a.strip(" |,"), b.strip(" |,")
    return text.strip(), ""


def _build_items(stype: str, lines: list[str]) -> list[dict]:
    items: list[dict] = []
    cur: dict | None = None

    def start(line):
        nonlocal cur
        rest, s, e, current = _split_dates(line)
        cur = {"_head": [rest] if rest else [], "start": s, "end": e, "current": current, "bullets": []}
        items.append(cur)

    for line in lines:
        if BULLET_RE.match(line):
            if cur is None:
                start("")
            cur["bullets"].append(BULLET_RE.sub("", line).strip())
        elif cur is None or cur["bullets"] or len(cur["_head"]) >= 2:
            start(line)
        else:
            rest, s, e, current = _split_dates(line)
            if s or e:
                cur["start"] = cur["start"] or s
                cur["end"] = cur["end"] or e
                cur["current"] = cur["current"] or current
            if rest:
                cur["_head"].append(rest)

    out = []
    for it in items:
        head = it.pop("_head")
        first, second = (head + ["", ""])[:2]
        a, b = _split_head(first)
        extra = second
        if stype == "experience" or stype == "volunteering":
            item = {
                "role": a,
                "organization": b or extra,
                "location": "",
                "start": it["start"],
                "end": it["end"],
                "current": it["current"],
                "bullets": it["bullets"],
            }
        elif stype == "projects":
            tools_match = re.search(r"(?:tools|tech(?:nologies)?|stack)\s*:\s*(.+)", extra, re.I)
            item = {
                "name": a,
                "role": "" if tools_match else (b or extra),
                "link": "",
                "start": it["start"],
                "end": it["end"],
                "current": it["current"],
                "bullets": it["bullets"],
                "tools": [t.strip() for t in re.split(r"[,|/]", tools_match.group(1)) if t.strip()]
                if tools_match
                else [],
            }
        elif stype == "education":
            parts = [p for p in [a, b, extra] if p]
            inst = next((p for p in parts if EDU_WORDS.search(p)), "")
            others = [p for p in parts if p != inst]
            item = {
                "institution": inst,
                "degree": others[0] if others else "",
                "field": "",
                "location": "",
                "start": it["start"],
                "end": it["end"],
                "grade": "",
                "details": " ".join(it["bullets"] + others[1:]),
            }
        elif stype == "certifications":
            item = {"name": a, "issuer": b or extra, "date": it["end"] or it["start"], "link": "", "credential_id": ""}
        elif stype == "languages":
            item = {"language": a, "proficiency": b or extra}
        else:
            item = {
                "title": a,
                "organization": b or extra,
                "date": it["end"] or it["start"],
                "description": " ".join(it["bullets"]),
            }
            if stype == "publications":
                item = {
                    "title": a,
                    "publisher": b or extra,
                    "date": it["end"] or it["start"],
                    "link": "",
                    "description": " ".join(it["bullets"]),
                }
        out.append(item)
    return [i for i in out if any(v for k, v in i.items() if k not in ("current",))][: C.MAX_ITEMS]


def _parse_skills(lines: list[str]) -> list[dict]:
    groups = []
    loose: list[str] = []
    for line in lines:
        line = BULLET_RE.sub("", line)
        if ":" in line and len(line.split(":", 1)[0]) <= 40:
            name, rest = line.split(":", 1)
            skills = [s.strip() for s in re.split(r"[,|•;·]", rest) if s.strip()]
            groups.append({"id": C.new_key(), "name": name.strip(), "skills": skills[:60]})
        else:
            loose.extend(s.strip() for s in re.split(r"[,|•;·]|\s{2,}", line) if s.strip())
    if loose:
        groups.insert(0, {"id": C.new_key(), "name": "", "skills": [s for s in loose if len(s) <= 60][:60]})
    return groups


def structure_resume(text: str) -> tuple[dict, float, list[dict]]:
    """Returns (content proposal, confidence 0..1, warnings)."""
    lines = [ln for ln in text.split("\n")]
    personal = C.default_personal()
    sections_lines: list[tuple[str, str, list[str]]] = []
    prelude: list[str] = []
    current: tuple[str, str, list[str]] | None = None

    for line in lines:
        if not line.strip():
            continue
        htype = heading_type(line)
        if htype:
            current = (htype, line.strip().rstrip(":").title() if line.isupper() else line.strip().rstrip(":"), [])
            sections_lines.append(current)
        elif current is None:
            prelude.append(line.strip())
        else:
            current[2].append(line.strip())

    joined_prelude = " ".join(prelude[:8])
    email = EMAIL_RE.search(joined_prelude) or EMAIL_RE.search(text)
    if email:
        personal["email"] = email.group(0).strip(".")
    phone = PHONE_RE.search(joined_prelude)
    if phone and sum(c.isdigit() for c in phone.group(0)) >= 8:
        personal["phone"] = phone.group(0).strip()
    links = []
    for m in URL_RE.finditer(joined_prelude):
        url = m.group(0).strip(".,|")
        if "@" in url or not ("/" in url or url.count(".") >= 1):
            continue
        if not url.startswith("http"):
            url = "https://" + url
        label = "LinkedIn" if "linkedin" in url else "GitHub" if "github" in url else "Portfolio"
        if url not in [x["url"] for x in links] and (email is None or email.group(0) not in url):
            links.append({"label": label, "url": url})
    personal["links"] = links[:4]
    for line in prelude[:3]:
        if (
            not EMAIL_RE.search(line)
            and not any(ch.isdigit() for ch in line)
            and 1 <= len(line.split()) <= 5
            and len(line) <= 60
        ):
            personal["full_name"] = line.title() if line.isupper() else line
            break
    for line in prelude[1:4]:
        if (
            line != personal["full_name"]
            and not EMAIL_RE.search(line)
            and not PHONE_RE.search(line)
            and 2 <= len(line.split()) <= 12
        ):
            personal["headline"] = line
            break

    sections = []
    seen_types = set()
    for stype, title, body in sections_lines:
        if not body:
            continue
        sec = C.empty_section(stype)
        sec["title"] = title[:60] or C.SECTION_TYPES[stype]
        if stype in ("summary",):
            sec["data"] = {"text": " ".join(BULLET_RE.sub("", b) for b in body)[: C.TEXT_LIMIT]}
        elif stype == "skills":
            sec["data"] = {"groups": _parse_skills(body)}
        else:
            sec["data"] = {"items": _build_items(stype, body)}
        sections.append(sec)
        seen_types.add(stype)

    warnings = []
    if not sections:
        warnings.append(
            _w(
                "no_headings",
                "high",
                "No standard section headings were recognised",
                "Use plain headings such as Summary, Experience, Education, Skills and Projects so readers and "
                "parsers can find each section.",
            )
        )
        leftover = "\n".join(prelude[3:])[: C.TEXT_LIMIT]
        if leftover:
            custom = C.empty_section("custom")
            custom["data"] = {"text": leftover}
            sections.append(custom)

    core_found = len(seen_types & {"summary", "experience", "education", "skills", "projects"})
    confidence = (
        0.25
        + 0.11 * core_found
        + (0.1 if personal["email"] else 0)
        + (0.05 if personal["full_name"] else 0)
        + (
            0.05
            if any(
                s["type"] in ("experience", "projects") and s["data"]["items"] and s["data"]["items"][0].get("bullets")
                for s in sections
            )
            else 0
        )
    )
    confidence = round(max(0.05, min(0.98, confidence)), 2)
    content = C.normalize_content({"personal": personal, "sections": sections}, lenient=True)
    return content, confidence, warnings
