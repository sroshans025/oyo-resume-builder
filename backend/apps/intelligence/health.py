"""Deterministic resume health check with a documented, explainable score.

FORMULA (rules version below):
  - Four categories: Section completeness, Readability & layout, Content clarity, Consistency.
  - Each category starts at 100. Every finding deducts by severity:
      high = 25, medium = 12, low = 5, info = 0   (floored at 0).
  - Resume quality estimate = mean of the four categories (25% each).
These are prototype weights. They have NOT been calibrated against hiring
outcomes and do not reproduce any employer's screening system.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import date

from apps.documents.parsing import HEADING_SYNONYMS
from apps.resumes.content import SECTION_TYPES, to_plain_text

from .ai.offline import COMMON_MISSPELLINGS, WEAK_RE

RULES_VERSION = "health-1.2"
DEDUCTIONS = {"high": 25, "medium": 12, "low": 5, "info": 0}
CATEGORIES = [
    ("completeness", "Section completeness", "Are the sections readers and parsers look for present and filled in?"),
    (
        "readability",
        "Readability & layout",
        "Is the text easy to scan and extract: paragraph length, bullet density, symbols, length?",
    ),
    ("clarity", "Content clarity", "Do bullets show what you did and what changed, in clear, active language?"),
    ("consistency", "Consistency", "Are dates, tense, punctuation and spelling consistent and plausible?"),
]
FORMULA = (
    "Each category starts at 100 and loses points per finding (high −25, medium −12, low −5). "
    "The resume quality estimate is the average of the four categories (25% each). "
    "Categories with too little content to evaluate are marked 'Not assessed' and excluded from the average; "
    "if none can be assessed the estimate equals section completeness. "
    "These weights are a documented prototype, not calibrated against hiring outcomes."
)
DISCLAIMER = (
    "This automated report is an estimate based on information you supplied. It does not reproduce any employer's "
    "proprietary ATS, guarantee shortlisting, or replace human review. Verify all suggestions before use."
)

MONTHS = {
    m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])
}
BUZZWORDS = [
    "hardworking",
    "hard-working",
    "team player",
    "go-getter",
    "self-starter",
    "synergy",
    "detail-oriented",
    "results-driven",
    "dynamic",
    "think outside the box",
    "passionate",
    "rockstar",
    "ninja",
    "guru",
]
EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿-]")
KNOWN_HEADINGS = {syn for syns in HEADING_SYNONYMS.values() for syn in syns} | {
    v.lower() for v in SECTION_TYPES.values()
}


def date_format(value: str) -> str | None:
    v = value.strip().lower()
    if not v:
        return None
    if re.fullmatch(r"[a-z]{3}\.? \d{4}", v):
        return "Mon YYYY"
    if re.fullmatch(r"[a-z]{4,9} \d{4}", v):
        return "Month YYYY"
    if re.fullmatch(r"\d{1,2}/\d{4}", v):
        return "MM/YYYY"
    if re.fullmatch(r"\d{4}-\d{2}", v):
        return "YYYY-MM"
    if re.fullmatch(r"\d{4}", v):
        return "YYYY"
    return "other"


def parse_date(value: str) -> tuple[int, int] | None:
    v = value.strip().lower()
    m = re.fullmatch(r"([a-z]{3})[a-z]*\.? (\d{4})", v)
    if m and m.group(1) in MONTHS:
        return int(m.group(2)), MONTHS[m.group(1)]
    m = re.fullmatch(r"(\d{1,2})/(\d{4})", v)
    if m:
        return int(m.group(2)), max(1, min(12, int(m.group(1))))
    m = re.fullmatch(r"(\d{4})-(\d{2})", v)
    if m:
        return int(m.group(1)), max(1, min(12, int(m.group(2))))
    m = re.fullmatch(r"(\d{4})", v)
    if m:
        return int(m.group(1)), 6
    return None


def months_between(a: tuple[int, int], b: tuple[int, int]) -> int:
    return (b[0] - a[0]) * 12 + (b[1] - a[1])


class Checker:
    def __init__(self, content: dict, experience_level: str = ""):
        self.content = content
        self.level = experience_level
        self.findings: list[dict] = []
        self.strengths: list[str] = []
        self.sections = [s for s in content.get("sections", []) if s.get("visible", True)]

    def add(self, category, severity, code, title, explanation, recommendation, evidence=None, section=None):
        self.findings.append(
            {
                "id": f"{code}:{section or ''}:{len(self.findings)}",
                "code": code,
                "category": category,
                "severity": severity,
                "title": title,
                "explanation": explanation,
                "recommendation": recommendation,
                "evidence": [e[:220] for e in (evidence or [])][:5],
                "section": section,
            }
        )

    def by_type(self, t):
        return [s for s in self.sections if s["type"] == t]

    def items(self, *types):
        for s in self.sections:
            if s["type"] in types:
                for it in s["data"].get("items", []):
                    yield s, it

    def bullets(self):
        for s, it in self.items("experience", "projects", "volunteering"):
            for b in it.get("bullets", []):
                if b.strip():
                    yield s, it, b.strip()

    # --- completeness ------------------------------------------------------------------
    def check_completeness(self):
        p = self.content.get("personal", {})
        if not p.get("full_name"):
            self.add(
                "completeness",
                "high",
                "no_name",
                "Your name is missing",
                "The header should start with your full name.",
                "Add your name in Personal details.",
                section="Personal details",
            )
        if not (p.get("email") or p.get("phone")):
            self.add(
                "completeness",
                "high",
                "no_contact",
                "No way to contact you",
                "Neither an email address nor a phone number is present.",
                "Add at least a professional email address.",
                section="Personal details",
            )
        elif p.get("email") and not p.get("show_email", True) and not (p.get("phone") and p.get("show_phone", True)):
            self.add(
                "completeness",
                "medium",
                "contact_hidden",
                "Contact details are hidden",
                "Your email and phone are both hidden in this resume.",
                "Show at least one contact method before sending.",
                section="Personal details",
            )
        else:
            self.strengths.append("Contact details are present.")

        def filled(stype):
            for s in self.by_type(stype):
                d = s["data"]
                if d.get("text", "").strip() or any(g["skills"] for g in d.get("groups", [])) or d.get("items"):
                    return True
            return False

        if not filled("summary"):
            sev = "low" if self.level in ("student", "fresher") else "medium"
            self.add(
                "completeness",
                sev,
                "no_summary",
                "No professional summary",
                "A 2–3 sentence summary helps a reader understand your focus quickly.",
                "Add a short summary that names your target role and strongest relevant evidence.",
            )
        if not filled("experience") and not filled("projects"):
            self.add(
                "completeness",
                "high",
                "no_evidence",
                "No experience or projects",
                "Without experience or projects there is little evidence of what you can do.",
                "Add work, internships, volunteering or projects — academic projects count.",
            )
        if not filled("education"):
            self.add(
                "completeness",
                "medium",
                "no_education",
                "No education section",
                "Most applications expect an education section, even for experienced candidates.",
                "Add your highest qualification.",
            )
        if not filled("skills"):
            self.add(
                "completeness",
                "medium",
                "no_skills",
                "No skills section",
                "A skills section lets readers and keyword searches find your tools quickly.",
                "List the tools and skills you can demonstrate, grouped if helpful.",
            )
        else:
            self.strengths.append("Skills are listed in a dedicated section.")
        for s in self.sections:
            d = s["data"]
            empty = not (d.get("text", "").strip() or any(g["skills"] for g in d.get("groups", [])) or d.get("items"))
            if empty:
                self.add(
                    "completeness",
                    "low",
                    "empty_section",
                    f"“{s['title']}” is empty",
                    "Empty sections still print a heading with nothing under it.",
                    "Fill it in or hide the section.",
                    section=s["title"],
                )
            title_norm = re.sub(r"[^a-z ]", "", s["title"].lower()).strip()
            if s["type"] != "custom" and title_norm and title_norm not in KNOWN_HEADINGS:
                self.add(
                    "completeness",
                    "low",
                    "unusual_heading",
                    f"Unusual heading “{s['title']}”",
                    "Creative headings can make it harder for people and parsers to recognise the section.",
                    f"Consider a standard heading such as “{SECTION_TYPES[s['type']]}”.",
                    section=s["title"],
                )
        for s, it in self.items("experience"):
            if not it.get("role") or not it.get("organization"):
                self.add(
                    "completeness",
                    "medium",
                    "incomplete_entry",
                    "An experience entry is missing a role or organisation",
                    "Each role should say what you were and where.",
                    "Fill in both the role title and organisation.",
                    evidence=[it.get("role") or it.get("organization") or "(untitled entry)"],
                    section=s["title"],
                )
            if not [b for b in it.get("bullets", []) if b.strip()] and it.get("role"):
                self.add(
                    "readability",
                    "medium",
                    "no_bullets",
                    f"No bullet points for “{it['role']}”",
                    "Entries without bullets don't show what you actually did.",
                    "Add 2–5 bullets describing actions and results.",
                    section=s["title"],
                )

    # --- readability ---------------------------------------------------------------------
    def check_readability(self):
        for s in self.by_type("summary"):
            words = len(s["data"].get("text", "").split())
            if words > 90:
                self.add(
                    "readability",
                    "medium",
                    "long_summary",
                    "Summary is long",
                    f"Your summary is {words} words. Long paragraphs are often skimmed or skipped.",
                    "Aim for 40–80 words: role, strongest evidence, what you bring.",
                    section=s["title"],
                )
        long_bullets = [(s, b) for s, _i, b in self.bullets() if len(b.split()) > 35]
        if long_bullets:
            self.add(
                "readability",
                "low" if len(long_bullets) < 3 else "medium",
                "dense_bullets",
                f"{len(long_bullets)} bullet(s) are over 35 words",
                "Dense bullets are hard to scan.",
                "Split into two bullets or cut to the action and result.",
                evidence=[b for _s, b in long_bullets],
            )
        for s, it in self.items("experience", "projects"):
            n = len([b for b in it.get("bullets", []) if b.strip()])
            if n > 8:
                self.add(
                    "readability",
                    "low",
                    "many_bullets",
                    f"{n} bullets in one entry",
                    "Very long lists dilute your strongest points.",
                    "Keep the 3–6 most relevant bullets.",
                    section=s["title"],
                )
        text = to_plain_text(self.content)
        words = len(text.split())
        limit = 650 if self.level in ("student", "fresher") else 1000
        if words > limit:
            self.add(
                "readability",
                "low",
                "long_resume",
                f"About {words} words — likely more than {'one' if limit == 650 else 'two'} page(s)",
                "Length depends on your experience, but concise resumes are easier to review.",
                "Remove older or less relevant details; check the page guide in the editor preview.",
            )
        symbols = EMOJI_RE.findall(text)
        if symbols:
            self.add(
                "readability",
                "low",
                "symbols",
                "Decorative symbols or emoji found",
                "Icons and emoji may extract as unknown characters.",
                "Replace them with plain text.",
                evidence=symbols[:5],
            )

    # --- clarity -----------------------------------------------------------------------------
    def check_clarity(self):
        all_bullets = list(self.bullets())
        weak = [b for _s, _i, b in all_bullets if WEAK_RE.match(b)]
        if weak:
            self.add(
                "clarity",
                "medium" if len(weak) >= 2 else "low",
                "weak_openers",
                f"{len(weak)} bullet(s) describe duties, not actions",
                "Phrases like “responsible for” or “worked on” hide what you actually did.",
                "Start with an action verb (Built, Led, Analysed…) and say what changed. The Writing Studio can suggest rewrites.",
                evidence=weak,
            )
        pronoun = [b for _s, _i, b in all_bullets if re.match(r"^(i|my|we)\b", b, re.I)]
        if pronoun:
            self.add(
                "clarity",
                "low",
                "pronouns",
                "Bullets start with “I”, “my” or “we”",
                "Resumes conventionally omit pronouns, and “we” hides your own contribution.",
                "Start with the verb and describe your part.",
                evidence=pronoun,
            )
        if all_bullets:
            with_numbers = [b for _s, _i, b in all_bullets if re.search(r"\d", b)]
            if not with_numbers:
                self.add(
                    "clarity",
                    "medium",
                    "no_outcomes",
                    "No measurable outcomes",
                    "None of your bullets include a number, scale or measurable result.",
                    "Where you genuinely know them, add outcomes such as time saved, users served or accuracy. Never estimate numbers you can't support.",
                )
            elif len(with_numbers) >= max(2, len(all_bullets) // 3):
                self.strengths.append(f"{len(with_numbers)} bullet(s) include concrete numbers or scale.")
        starts = Counter(b.split()[0].lower() for _s, _i, b in all_bullets if b.split())
        repeated = [w for w, c in starts.items() if c >= 3 and len(w) > 2]
        if repeated:
            self.add(
                "clarity",
                "low",
                "repeated_verbs",
                "Repeated opening verbs",
                "Several bullets begin with the same word, which reads as repetitive.",
                "Vary verbs to reflect different kinds of work.",
                evidence=[f"“{w.capitalize()}” × {starts[w]}" for w in repeated],
            )
        lower = to_plain_text(self.content).lower()
        tokens = re.findall(r"[a-z]+", lower)
        trigrams = Counter(" ".join(tokens[i : i + 3]) for i in range(len(tokens) - 2))
        stop = {"and", "the", "of", "to", "in", "for", "a", "with", "on"}
        rep = [t for t, c in trigrams.items() if c >= 3 and not set(t.split()) <= stop]
        if rep:
            self.add(
                "clarity",
                "low",
                "repeated_phrases",
                "Repeated phrases",
                "The same phrase appears three or more times.",
                "Rephrase repeats so each line adds new information.",
                evidence=rep[:4],
            )
        found = [w for w in BUZZWORDS if w in lower]
        if found:
            self.add(
                "clarity",
                "low",
                "buzzwords",
                "Generic self-descriptions",
                "Words like these are common and unprovable on their own.",
                "Replace with an example that shows the quality.",
                evidence=found,
            )
        if all_bullets and not weak and not pronoun:
            self.strengths.append("Bullets lead with actions rather than duties.")

    # --- consistency -------------------------------------------------------------------------
    def check_consistency(self):
        formats = Counter()
        today = date.today()
        dated = []
        for s, it in self.items("experience", "education", "projects", "volunteering"):
            fs = [date_format(it.get(k, "")) for k in ("start", "end")]
            formats.update(f for f in fs if f)
            start, end = parse_date(it.get("start", "")), parse_date(it.get("end", ""))
            label = it.get("role") or it.get("name") or it.get("institution") or it.get("degree") or s["title"]
            if start and end and months_between(start, end) < 0:
                self.add(
                    "consistency",
                    "high",
                    "end_before_start",
                    "End date is before start date",
                    f"“{label}” ends before it starts.",
                    "Check both dates.",
                    evidence=[f"{it.get('start')} – {it.get('end')}"],
                    section=s["title"],
                )
            if s["type"] == "experience":
                if not it.get("start") and not it.get("end") and not it.get("current"):
                    self.add(
                        "consistency",
                        "medium",
                        "missing_dates",
                        f"No dates for “{label}”",
                        "Readers expect dates for each role.",
                        "Add start and end (month and year is typical).",
                        section=s["title"],
                    )
                if start:
                    dated.append((label, start, end or ((today.year, today.month) if it.get("current") else start)))
            for ref in (start, end):
                if ref and s["type"] != "education" and months_between((today.year, today.month), ref) > 12:
                    self.add(
                        "consistency",
                        "low",
                        "future_date",
                        f"Future date for “{label}”",
                        "A date is more than a year in the future.",
                        "Check for typos.",
                        section=s["title"],
                    )
        used = [f for f in formats if f != "other"]
        if len(used) > 1 or formats.get("other"):
            self.add(
                "consistency",
                "medium",
                "date_formats",
                "Mixed date formats",
                "Dates use different formats: " + ", ".join(f"{f} ({c})" for f, c in formats.items()) + ".",
                "Pick one format, e.g. “Jan 2024”, and use it everywhere.",
            )
        elif used:
            self.strengths.append("Dates use one consistent format.")
        dated.sort(key=lambda x: x[1])
        for i in range(1, len(dated)):
            prev, cur = dated[i - 1], dated[i]
            if months_between(cur[1], prev[2]) > 1:
                self.add(
                    "consistency",
                    "info",
                    "overlap",
                    "Overlapping roles",
                    f"“{prev[0]}” and “{cur[0]}” overlap. That's fine if they were concurrent (e.g. part-time).",
                    "No change needed if accurate; otherwise correct the dates.",
                )
        text = to_plain_text(self.content)
        typos = []
        for wrong, right in COMMON_MISSPELLINGS.items():
            if wrong != right and re.search(rf"\b{re.escape(wrong)}\b", text, re.I):
                typos.append(f"{wrong} → {right}")
        for m in re.finditer(r"\b(\w{2,})\s+\1\b", text, re.I):
            typos.append(f"repeated word “{m.group(0)}”")
        if typos:
            self.add(
                "consistency",
                "low" if len(typos) < 3 else "medium",
                "typos",
                "Possible typos",
                "These look like spelling mistakes — please check, they may be intentional.",
                "Correct any genuine typos.",
                evidence=typos,
            )
        past_present = []
        for _s, it in self.items("experience"):
            if it.get("current"):
                continue
            for b in it.get("bullets", []):
                first = b.strip().split(" ")[0] if b.strip() else ""
                if re.fullmatch(
                    r"(?i)(manages|develops|builds|leads|creates|designs|maintains|supports|writes|handles|\w+ing)",
                    first,
                ):
                    past_present.append(b)
        if past_present:
            self.add(
                "consistency",
                "low",
                "tense",
                "Present tense in past roles",
                "Past roles usually read best in the past tense.",
                "Change verbs to past tense (e.g. “Manages” → “Managed”).",
                evidence=past_present,
            )
        bullets = [b for _s, _i, b in self.bullets() if len(b.split()) > 4]
        ends = [b.endswith(".") for b in bullets]
        if ends and 0 < sum(ends) < len(ends):
            self.add(
                "consistency",
                "low",
                "punctuation",
                "Inconsistent bullet punctuation",
                f"{sum(ends)} of {len(ends)} bullets end with a full stop.",
                "End all bullets the same way.",
            )

    def not_assessable(self) -> set[str]:
        """Categories that have too little content to evaluate meaningfully."""
        words = len(to_plain_text(self.content).split())
        bullets = list(self.bullets())
        summary = any(s["data"].get("text", "").strip() for s in self.by_type("summary"))
        dated = any(
            it.get("start") or it.get("end")
            for _s, it in self.items("experience", "education", "projects", "volunteering")
        )
        out = set()
        if words < 60:
            out.add("readability")
        if not bullets and not summary:
            out.add("clarity")
        if not dated and len(bullets) < 2:
            out.add("consistency")
        return out

    def run(self) -> dict:
        self.check_completeness()
        self.check_readability()
        self.check_clarity()
        self.check_consistency()
        return build_report(self.findings, self.strengths, to_plain_text(self.content), self.not_assessable())


def build_report(
    findings: list[dict], strengths: list[str], preview: str, not_assessed: set[str] | None = None
) -> dict:
    not_assessed = not_assessed or set()
    order = {"high": 0, "medium": 1, "low": 2, "info": 3}
    findings.sort(key=lambda f: (order[f["severity"]], f["category"]))
    for i, f in enumerate(findings):
        f["priority"] = i + 1
    categories = []
    for key, label, description in CATEGORIES:
        cf = [f for f in findings if f["category"] == key]
        deduction = sum(DEDUCTIONS[f["severity"]] for f in cf)
        assessed = key == "completeness" or key not in not_assessed
        score = max(0, 100 - deduction) if assessed else None
        categories.append(
            {
                "key": key,
                "label": label,
                "description": description,
                "weight": 25,
                "score": score,
                "deduction": deduction,
                "findings": len(cf),
                "assessed": assessed,
                "note": "" if assessed else "Not assessed — add more content first.",
            }
        )
    scored = [c["score"] for c in categories if c["score"] is not None]
    quality = round(sum(scored) / len(scored))
    return {
        "quality_score": quality,
        "categories": categories,
        "findings": findings,
        "strengths": list(dict.fromkeys(strengths)),
        "extracted_preview": preview,
        "rules_version": RULES_VERSION,
        "summary": {
            "formula": FORMULA,
            "disclaimer": DISCLAIMER,
            "deductions": DEDUCTIONS,
            "counts": dict(Counter(f["severity"] for f in findings)),
        },
    }


def analyse_resume(content: dict, experience_level: str = "") -> dict:
    return Checker(content, experience_level).run()


def analyse_upload_extraction(doc, content_report: dict) -> dict:
    """Adds extraction-quality findings from an uploaded file to a content report."""
    extra = []
    for w in doc.warnings:
        sev = w.get("severity", "medium")
        extra.append(
            {
                "id": f"extract:{w['code']}",
                "code": w["code"],
                "category": "readability",
                "severity": sev,
                "title": w["title"],
                "explanation": w["detail"],
                "recommendation": "Check the extracted text preview below to see what a parser reads.",
                "evidence": [],
                "section": "Uploaded file",
            }
        )
    if doc.confidence < 0.7:
        extra.append(
            {
                "id": "extract:low_confidence",
                "code": "low_confidence",
                "category": "readability",
                "severity": "medium",
                "title": "Sections were hard to recognise",
                "explanation": f"Our parser's structure confidence was {round(doc.confidence * 100)}%. Other parsers may also struggle.",
                "recommendation": "Use standard headings and a single-column layout.",
                "evidence": [],
                "section": "Uploaded file",
            }
        )
    findings = content_report["findings"] + extra
    report = build_report(
        [{k: v for k, v in f.items() if k != "priority"} for f in findings],
        content_report["strengths"],
        doc.extracted_text,
        {c["key"] for c in content_report["categories"] if not c["assessed"]},
    )
    return report
