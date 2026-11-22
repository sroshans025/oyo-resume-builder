"""PDF (ReportLab) and DOCX (python-docx) renderers.

Both produce single-column, text-selectable documents whose reading order
matches the on-screen preview. Template `style` controls typography only, so
content is never lost when switching templates.
"""

from __future__ import annotations

import io
import os
from functools import lru_cache
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, KeepTogether, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer

from .content import item_date, item_heading, section_lines

REPORTLAB_FONTS = Path(__import__("reportlab").__file__).parent / "fonts"
FONT_CANDIDATES = {
    "sans": [
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
        ),
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/ariali.ttf"),
        (str(REPORTLAB_FONTS / "Vera.ttf"), str(REPORTLAB_FONTS / "VeraBd.ttf"), str(REPORTLAB_FONTS / "VeraIt.ttf")),
    ],
    "serif": [
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
        ),
        ("C:/Windows/Fonts/times.ttf", "C:/Windows/Fonts/timesbd.ttf", "C:/Windows/Fonts/timesi.ttf"),
    ],
}


@lru_cache(maxsize=4)
def resolve_font(family: str) -> tuple[str, str, str]:
    """Registers and returns (regular, bold, italic) TTF font names with broad
    Unicode coverage. Falls back to the bundled Vera family."""
    candidates = FONT_CANDIDATES.get(family, []) + FONT_CANDIDATES["sans"]
    for regular, bold, italic in candidates:
        if all(os.path.exists(p) for p in (regular, bold, italic)):
            base = f"Infyro{family.title()}{abs(hash(regular)) % 10000}"
            names = (base, base + "-Bold", base + "-Italic")
            for name, path in zip(names, (regular, bold, italic), strict=True):
                if name not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(TTFont(name, path))
            return names
    return ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique")  # pragma: no cover


def _p(text: str) -> str:
    return escape(text or "").replace("\n", "<br/>")


def contact_line(personal: dict) -> list[str]:
    parts = []
    if personal.get("show_email", True) and personal.get("email"):
        parts.append(personal["email"])
    if personal.get("show_phone", True) and personal.get("phone"):
        parts.append(personal["phone"])
    if personal.get("show_location", True) and personal.get("location"):
        parts.append(personal["location"])
    parts.extend(link["url"].replace("https://", "").replace("http://", "") for link in personal.get("links", []))
    return parts


def render_pdf(content: dict, style: dict, title: str = "Resume") -> tuple[bytes, int]:
    regular, bold, italic = resolve_font(style.get("font", "sans"))
    accent = colors.HexColor(style.get("accent", "#1f2937"))
    compact = style.get("density") == "compact"
    base_size = 9.6 if compact else 10.2
    lead = base_size * (1.28 if compact else 1.36)
    align = TA_CENTER if style.get("align") == "center" else TA_LEFT
    heading_mode = style.get("heading", "caps-rule")

    s_name = ParagraphStyle(
        "name",
        fontName=bold,
        fontSize=style.get("name_size", 21),
        leading=style.get("name_size", 21) * 1.2,
        alignment=align,
        textColor=colors.HexColor("#0b1220"),
    )
    s_headline = ParagraphStyle(
        "headline",
        fontName=regular,
        fontSize=base_size + 1.4,
        leading=lead + 2,
        alignment=align,
        textColor=accent,
        spaceBefore=1,
    )
    s_contact = ParagraphStyle(
        "contact",
        fontName=regular,
        fontSize=base_size - 0.6,
        leading=lead,
        alignment=align,
        textColor=colors.HexColor("#475569"),
        spaceBefore=3,
    )
    s_heading = ParagraphStyle(
        "heading",
        fontName=bold,
        fontSize=base_size + 1,
        leading=lead + 1,
        textColor=accent if heading_mode != "bold" else colors.HexColor("#0b1220"),
        spaceBefore=9 if compact else 12,
        spaceAfter=2,
    )
    s_body = ParagraphStyle(
        "body", fontName=regular, fontSize=base_size, leading=lead, textColor=colors.HexColor("#1e293b")
    )
    s_item = ParagraphStyle("item", parent=s_body, fontName=bold, spaceBefore=4 if compact else 6)
    s_meta = ParagraphStyle("meta", parent=s_body, fontName=italic, textColor=colors.HexColor("#475569"))

    story = []
    p = content.get("personal", {})
    story.append(Paragraph(_p(p.get("full_name") or title), s_name))
    if p.get("headline"):
        story.append(Paragraph(_p(p["headline"]), s_headline))
    contact = contact_line(p)
    if contact:
        story.append(Paragraph("  ·  ".join(_p(c) for c in contact), s_contact))
    story.append(Spacer(1, 4))

    for section in content.get("sections", []):
        if not section.get("visible", True) or not section_lines(section):
            continue
        heading_text = (
            section["title"].upper() if heading_mode in ("caps-rule", "accent-bar", "small-caps") else section["title"]
        )
        block = [Paragraph(_p(heading_text), s_heading)]
        if heading_mode in ("caps-rule", "accent-bar", "small-caps"):
            block.append(
                HRFlowable(
                    width="100%",
                    thickness=1.4 if heading_mode == "accent-bar" else 0.6,
                    color=accent,
                    spaceBefore=1,
                    spaceAfter=4,
                )
            )
        stype, data = section["type"], section["data"]
        if stype in ("summary", "custom"):
            block.append(Paragraph(_p(data.get("text", "")), s_body))
            story.append(KeepTogether(block))
            continue
        if stype == "skills":
            for g in data.get("groups", []):
                if g["skills"]:
                    label = f"<font name='{bold}'>{_p(g['name'])}:</font> " if g["name"] else ""
                    block.append(Paragraph(label + _p(", ".join(g["skills"])), s_body))
            story.append(KeepTogether(block))
            continue
        first = True
        for item in data.get("items", []):
            primary, secondary = item_heading(stype, item)
            date = item_date(stype, item)
            entry = []
            head = _p(primary)
            if date:
                head += f"<font name='{regular}' color='#475569'>  ·  {_p(date)}</font>"
            if head:
                entry.append(Paragraph(head, s_item))
            if secondary:
                entry.append(Paragraph(_p(secondary), s_meta))
            for f in ("details", "description"):
                if item.get(f):
                    entry.append(Paragraph(_p(item[f]), s_body))
            bullets = [b for b in item.get("bullets", []) if b.strip()]
            if bullets:
                entry.append(
                    ListFlowable(
                        [ListItem(Paragraph(_p(b), s_body), leftIndent=11, value="•") for b in bullets],
                        bulletType="bullet",
                        start="•",
                        leftIndent=11,
                        bulletFontName=regular,
                        bulletFontSize=base_size,
                    )
                )
            if item.get("link"):
                entry.append(Paragraph(_p(item["link"]), s_meta))
            if first:
                story.append(KeepTogether(block + entry))
                first = False
            else:
                story.append(KeepTogether(entry))

    buf = io.BytesIO()
    margin = (14 if compact else 17) * mm
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        title=title,
        author=p.get("full_name", ""),
        subject="Resume",
        creator="Infyro AI Resume",
    )
    doc.build(story)
    return buf.getvalue(), doc.page


def render_docx(content: dict, style: dict, title: str = "Resume") -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    accent_hex = style.get("accent", "#1f2937").lstrip("#")
    accent = RGBColor.from_string(accent_hex.upper())
    font_name = "Georgia" if style.get("font") == "serif" else "Calibri"
    doc = Document()
    for sec in doc.sections:
        sec.left_margin = sec.right_margin = Pt(50)
        sec.top_margin = sec.bottom_margin = Pt(46)
    normal = doc.styles["Normal"]
    normal.font.name = font_name
    normal.font.size = Pt(10.5)
    doc.core_properties.title = title

    p = content.get("personal", {})
    center = style.get("align") == "center"
    para = doc.add_paragraph()
    run = para.add_run(p.get("full_name") or title)
    run.bold = True
    run.font.size = Pt(20)
    if center:
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if p.get("headline"):
        hp = doc.add_paragraph()
        r = hp.add_run(p["headline"])
        r.font.color.rgb = accent
        r.font.size = Pt(12)
        if center:
            hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    contact = contact_line(p)
    if contact:
        cp = doc.add_paragraph("  ·  ".join(contact))
        if center:
            cp.alignment = WD_ALIGN_PARAGRAPH.CENTER

    for section in content.get("sections", []):
        if not section.get("visible", True) or not section_lines(section):
            continue
        h = doc.add_paragraph()
        hr = h.add_run(section["title"].upper())
        hr.bold = True
        hr.font.color.rgb = accent
        hr.font.size = Pt(11.5)
        stype, data = section["type"], section["data"]
        if stype in ("summary", "custom"):
            doc.add_paragraph(data.get("text", ""))
        elif stype == "skills":
            for g in data.get("groups", []):
                if g["skills"]:
                    sp = doc.add_paragraph()
                    if g["name"]:
                        sp.add_run(g["name"] + ": ").bold = True
                    sp.add_run(", ".join(g["skills"]))
        else:
            for item in data.get("items", []):
                primary, secondary = item_heading(stype, item)
                date = item_date(stype, item)
                ip = doc.add_paragraph()
                ip.add_run(primary).bold = True
                if date:
                    ip.add_run(f"  ·  {date}")
                if secondary:
                    doc.add_paragraph().add_run(secondary).italic = True
                for f in ("details", "description"):
                    if item.get(f):
                        doc.add_paragraph(item[f])
                for b in item.get("bullets", []):
                    if b.strip():
                        doc.add_paragraph(b, style="List Bullet")
                if item.get("link"):
                    doc.add_paragraph(item["link"])
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
