"""Job description analysis and resume evidence mapping.

Statuses:
  demonstrated            – the skill appears in an experience/project/summary context
  partial                 – listed (e.g. under Skills) but no example of use found
  verify                  – related evidence or a requirement we can't check from text
  not_found               – no evidence in the resume (NOT proof the user lacks it)

Match estimate (prototype, documented):
  weights: required 2, unspecified 1.5, preferred 1
  points:  demonstrated 1.0, partial 0.6, verify 0.3, not_found 0
  estimate = 100 × Σ(weight × points) / Σ(weight)
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import date

from apps.resumes.content import iter_evidence_units

from . import lexicon
from .health import months_between, parse_date

MATCH_RULES_VERSION = "match-1.1"
WEIGHTS = {"required": 2.0, "unspecified": 1.5, "preferred": 1.0}
POINTS = {"demonstrated": 1.0, "partial": 0.6, "verify": 0.3, "not_found": 0.0}
STATUS_LABELS = {
    "demonstrated": "Demonstrated",
    "partial": "Partially demonstrated",
    "verify": "Requires your verification",
    "not_found": "Not found in resume",
}
MATCH_FORMULA = (
    "Required requirements count double, preferred count once (1.5 when the job description doesn't say). "
    "Demonstrated = full credit, partially demonstrated = 60%, needs verification = 30%, not found = 0. "
    "This is a prototype estimate of how much of the job description your resume text evidences — not a prediction "
    "of any employer's decision."
)

RESP_HEADINGS = [
    "responsibilities",
    "what you'll do",
    "what you will do",
    "the role",
    "role overview",
    "your role",
    "duties",
    "key responsibilities",
    "your impact",
    "day to day",
    "in this role",
    "job description",
    "about the role",
]
REQ_HEADINGS = [
    "requirements",
    "qualifications",
    "must have",
    "must-have",
    "must haves",
    "what you'll need",
    "what you will need",
    "required",
    "minimum qualifications",
    "basic qualifications",
    "who you are",
    "what we're looking for",
    "what we are looking for",
    "skills",
    "required skills",
    "you have",
    "essential",
    "essential skills",
    "eligibility",
]
PREF_HEADINGS = [
    "preferred",
    "nice to have",
    "nice-to-have",
    "bonus",
    "preferred qualifications",
    "good to have",
    "pluses",
    "bonus points",
    "desirable",
    "desired skills",
    "extra credit",
]
PREF_INLINE = re.compile(
    r"\b(preferred|preferably|nice to have|a plus|is a plus|bonus|desirable|ideally|good to have)\b", re.I
)
REQ_INLINE = re.compile(r"\b(must|required|requires|minimum|mandatory|essential)\b", re.I)
YEARS_RE = re.compile(r"(\d+)\s*\+?\s*(?:-|to)?\s*(?:\d+)?\s*\+?\s*(?:years?|yrs?)", re.I)
DEGREE_RE = re.compile(
    r"\b(bachelor'?s?|master'?s?|degree|b\.?tech|b\.?e\b|b\.?sc|m\.?sc|m\.?tech|mba|ph\.?d|diploma|graduate)\b", re.I
)
BULLET_RE = re.compile(r"^\s*(?:[•●▪◦‣∙·*\-–]|\d{1,2}[.)])\s+")
STOP = set(
    """a an and or the of to in for with on at by from as is are be will you your our we us this that these those it its
have has can able strong good excellent experience working work knowledge understanding skills ability etc using use across
within including such new team role job candidate plus well other more least year years""".split()
)


def _heading_kind(line: str) -> str | None:
    """A heading is a non-bullet line that is exactly a known heading, or a short
    line ending in ':' that starts/ends with one ("Preferred qualifications:")."""
    raw = line.strip()
    if BULLET_RE.match(raw):
        return None
    colon = raw.endswith(":")
    norm = re.sub(r"[^a-z' -]", "", raw.lower()).strip(" -")
    if len(norm) > 45 or not norm:
        return None
    for kind, heads in (("preferred", PREF_HEADINGS), ("required", REQ_HEADINGS), ("responsibilities", RESP_HEADINGS)):
        if any(norm == h or (colon and (norm.startswith(h + " ") or norm.endswith(" " + h))) for h in heads):
            return kind
    return None


def _category(text: str, skills: list[str]) -> str:
    if YEARS_RE.search(text):
        return "experience"
    if DEGREE_RE.search(text):
        return "education"
    if skills and all(lexicon.category_of(s) == lexicon.SOFT_CATEGORY for s in skills):
        return "soft"
    return "skill" if skills else "other"


def parse_job_description(text: str, title: str = "") -> dict:
    lines = [ln.strip() for ln in text.replace("\r", "").split("\n")]
    section = None
    responsibilities, requirements = [], []
    explicit_sections = set()

    def add_req(line, kind_hint):
        clean = BULLET_RE.sub("", line).strip().rstrip(";")
        if len(clean) < 3:
            return
        skills = lexicon.find_skills(clean)
        if PREF_INLINE.search(clean):
            kind = "preferred"
        elif kind_hint in ("required", "preferred"):
            kind = kind_hint
        elif REQ_INLINE.search(clean):
            kind = "required"
        else:
            kind = "unspecified"
        years = YEARS_RE.search(clean)
        requirements.append(
            {
                "id": f"r{len(requirements) + 1}",
                "text": clean[:400],
                "kind": kind,
                "skills": skills,
                "category": _category(clean, skills),
                "years": int(years.group(1)) if years else None,
            }
        )

    for line in lines:
        if not line:
            continue
        kind = _heading_kind(line)
        if kind:
            section = kind
            explicit_sections.add(kind)
            continue
        if section == "responsibilities":
            clean = BULLET_RE.sub("", line).strip()
            if len(clean) > 3:
                responsibilities.append(clean[:400])
                # responsibilities may still name tools; capture as unspecified requirements
                if lexicon.find_skills(clean) and not BULLET_RE.match(line) and len(clean) > 200:
                    add_req(clean, None)
        elif section in ("required", "preferred"):
            for part in re.split(r"(?<=[.;])\s+(?=[A-Z])", line) if len(line) > 220 else [line]:
                add_req(part, section)
        else:
            sentences = re.split(r"(?<=[.!?])\s+", line)
            for snt in sentences:
                if lexicon.find_skills(snt) or YEARS_RE.search(snt) or DEGREE_RE.search(snt):
                    if BULLET_RE.match(line) or REQ_INLINE.search(snt) or PREF_INLINE.search(snt) or len(snt) < 200:
                        add_req(snt, None)

    covered = {s for r in requirements for s in r["skills"]}
    for sk in lexicon.find_skills(text):
        if sk not in covered:
            requirements.append(
                {
                    "id": f"r{len(requirements) + 1}",
                    "text": f"Mentions {sk}",
                    "kind": "unspecified",
                    "skills": [sk],
                    "category": _category(sk, [sk]),
                    "years": None,
                }
            )

    role_title = title.strip()
    if not role_title:
        for line in lines[:6]:
            if line and len(line.split()) <= 8 and not line.endswith(".") and not _heading_kind(line):
                role_title = line.strip(" :-")
                break

    skill_kind: dict[str, str] = {}
    rank = {"required": 0, "unspecified": 1, "preferred": 2}
    for r in requirements:
        for s in r["skills"]:
            if s not in skill_kind or rank[r["kind"]] < rank[skill_kind[s]]:
                skill_kind[s] = r["kind"]
    mentions = Counter()
    for s in skill_kind:
        mentions[s] = len(lexicon.pattern_for(s).findall(text))

    warnings = []
    distinction = (
        "required" in explicit_sections
        or "preferred" in explicit_sections
        or any(r["kind"] != "unspecified" for r in requirements)
    )
    if not distinction:
        warnings.append(
            "The description doesn't distinguish required from preferred qualifications, so all are treated equally."
        )
    if not requirements:
        warnings.append(
            "No specific requirements were recognised. Paste the full description including the requirements list."
        )
    return {
        "role_title": role_title[:160],
        "responsibilities": responsibilities[:25],
        "requirements": requirements[:60],
        "skills": {
            "required": sorted(s for s, k in skill_kind.items() if k == "required"),
            "preferred": sorted(s for s, k in skill_kind.items() if k == "preferred"),
            "unspecified": sorted(s for s, k in skill_kind.items() if k == "unspecified"),
        },
        "skill_mentions": dict(mentions.most_common()),
        "distinction_supported": distinction,
        "warnings": warnings,
    }


# --- Matching ---------------------------------------------------------------------------
CONTEXT_TYPES = {
    "experience",
    "projects",
    "volunteering",
    "summary",
    "custom",
    "awards",
    "publications",
    "certifications",
}


def _snippet(text: str, pattern: re.Pattern) -> str:
    m = pattern.search(text)
    if not m or len(text) <= 200:
        return text[:220]
    start = max(0, m.start() - 80)
    return ("…" if start else "") + text[start : start + 200] + ("…" if start + 200 < len(text) else "")


def experience_months(content: dict) -> int:
    today = (date.today().year, date.today().month)
    spans = []
    for s in content.get("sections", []):
        if s["type"] != "experience" or not s.get("visible", True):
            continue
        for it in s["data"].get("items", []):
            start = parse_date(it.get("start", ""))
            end = today if it.get("current") else parse_date(it.get("end", ""))
            if start and end and months_between(start, end) >= 0:
                spans.append((start, end))
    spans.sort()
    total, cur = 0, None
    for a, b in spans:  # merge overlaps
        if cur and months_between(a, cur[1]) >= 0:
            cur = (cur[0], max(cur[1], b))
        else:
            if cur:
                total += months_between(cur[0], cur[1])
            cur = (a, b)
    if cur:
        total += months_between(cur[0], cur[1])
    return total


def match_resume(content: dict, jd: dict) -> dict:
    units = list(iter_evidence_units(content))
    months = experience_months(content)
    results = []

    def find(skill):
        pat = lexicon.pattern_for(skill)
        ctx, listed = [], []
        for section_title, stype, location, text in units:
            if pat.search(text):
                ev = {"section": section_title, "location": location, "snippet": _snippet(text, pat), "term": skill}
                (ctx if stype in CONTEXT_TYPES else listed).append(ev)
        return ctx, listed

    for req in jd.get("requirements", []):
        evidence, notes, statuses = [], [], []
        skill_status: dict[str, str] = {}
        for skill in req["skills"]:
            ctx, listed = find(skill)
            if ctx:
                skill_status[skill] = "demonstrated"
                statuses.append("demonstrated")
                evidence.extend(ctx[:2])
            elif listed:
                skill_status[skill] = "partial"
                statuses.append("partial")
                evidence.extend(listed[:1])
                notes.append(f"{skill} is listed, but no example of using it was found.")
            else:
                rel_found = []
                for rel in lexicon.related(skill):
                    rc, rl = find(rel)
                    if rc or rl:
                        rel_found.append(rel)
                        evidence.extend((rc or rl)[:1])
                if rel_found:
                    skill_status[skill] = "verify"
                    statuses.append("verify")
                    notes.append(
                        f"No direct mention of {skill}; related evidence: {', '.join(rel_found[:3])}. Confirm whether this covers it."
                    )
                else:
                    skill_status[skill] = "not_found"
                    statuses.append("not_found")
                    notes.append(
                        f"{skill} wasn't found. That doesn't mean you lack it — add it only if you can show it."
                    )

        if req["category"] == "experience" and req.get("years"):
            years = round(months / 12, 1)
            if months >= req["years"] * 12 and (not statuses or "not_found" not in statuses):
                statuses.append("demonstrated" if statuses else "verify")
                notes.append(f"Your dated experience totals about {years} years.")
            else:
                statuses.append("verify")
                notes.append(
                    f"Asks for {req['years']}+ years; your dated roles total about {years} years. Internships, freelance or "
                    "project work may count — check how the employer defines it."
                )
        elif req["category"] == "education":
            edu = [u for u in units if u[1] == "education"]
            hits = [u for u in edu if DEGREE_RE.search(u[3])]
            if hits:
                statuses.append("demonstrated")
                evidence.append(
                    {"section": hits[0][0], "location": hits[0][2], "snippet": hits[0][3][:220], "term": "degree"}
                )
                notes.append("Check the field of study matches what's asked.")
            else:
                statuses.append("verify" if edu else "not_found")
                notes.append(
                    "Confirm your qualification meets this requirement." if edu else "No education entry was found."
                )
        elif not req["skills"]:
            words = [w for w in re.findall(r"[a-z][a-z+#.]{2,}", req["text"].lower()) if w not in STOP]
            best, best_overlap = None, 0.0
            for u in units:
                ut = u[3].lower()
                overlap = sum(1 for w in set(words) if w in ut) / max(1, len(set(words)))
                if overlap > best_overlap:
                    best, best_overlap = u, overlap
            statuses.append("verify")
            if best and best_overlap >= 0.4:
                evidence.append({"section": best[0], "location": best[2], "snippet": best[3][:220], "term": ""})
                notes.append("Possible related evidence found — confirm it really addresses this requirement.")
            else:
                notes.append(
                    "This can't be confirmed from resume text alone. Consider an example in a bullet, cover letter or interview."
                )

        if not statuses:
            status = "verify"
        elif all(s == "demonstrated" for s in statuses):
            status = "demonstrated"
        elif "demonstrated" in statuses or "partial" in statuses:
            status = "partial"
        elif "verify" in statuses:
            status = "verify"
        else:
            status = "not_found"
        if req["category"] == "soft" and status == "not_found":
            status = "verify"
        seen, uniq = set(), []
        for e in evidence:
            k = (e["location"], e["snippet"])
            if k not in seen:
                seen.add(k)
                uniq.append(e)
        results.append(
            {
                **req,
                "status": status,
                "status_label": STATUS_LABELS[status],
                "skill_status": skill_status,
                "evidence": uniq[:3],
                "notes": notes[:3],
            }
        )

    total_w = sum(WEIGHTS[r["kind"]] for r in results)
    score = round(100 * sum(WEIGHTS[r["kind"]] * POINTS[r["status"]] for r in results) / total_w) if total_w else None
    counts = Counter(r["status"] for r in results)
    return {
        "match_score": score,
        "requirements": results,
        "counts": {k: counts.get(k, 0) for k in STATUS_LABELS},
        "experience_months": months,
        "checklist": tailoring_checklist(content, jd, results),
        "formula": MATCH_FORMULA,
        "rules_version": MATCH_RULES_VERSION,
    }


def tailoring_checklist(content: dict, jd: dict, results: list[dict]) -> list[dict]:
    items = []
    role = jd.get("role_title", "")
    headline = (content.get("personal", {}).get("headline") or "").lower()
    if role and not any(w in headline for w in role.lower().split() if len(w) > 3):
        items.append(
            {
                "id": "headline",
                "priority": "medium",
                "text": f"Align your headline with “{role}” — only if it truthfully describes you.",
                "detail": "Readers scan the headline first.",
                "suggested_edit": None,
            }
        )
    units = list(iter_evidence_units(content))
    for r in results:
        for skill in r["skills"]:
            st = r.get("skill_status", {}).get(skill, r["status"])
            if st == "partial":
                related_bullets = [
                    u[3]
                    for u in units
                    if u[1] in ("experience", "projects")
                    and any(lexicon.pattern_for(rel).search(u[3]) for rel in [*lexicon.related(skill), skill])
                ]
                example = related_bullets[0] if related_bullets else ""
                items.append(
                    {
                        "id": f"partial:{skill}",
                        "priority": "high" if r["kind"] == "required" else "medium",
                        "text": f"Show where you used {skill}.",
                        "detail": f"{skill} is listed in your skills but no bullet shows it in use. If you used it in a role or project, say how.",
                        "suggested_edit": {
                            "before": example[:200],
                            "after": f"{example.rstrip('.')[:180]} using {skill}",
                            "only_if_true": True,
                        }
                        if example
                        else None,
                    }
                )
            elif st == "not_found" and lexicon.category_of(skill) == lexicon.SOFT_CATEGORY:
                items.append(
                    {
                        "id": f"example:{skill}",
                        "priority": "medium" if r["kind"] == "required" else "low",
                        "text": f"Show {skill.lower()} through a concrete example.",
                        "detail": "Soft skills are best evidenced by what you did — in a bullet, your cover letter or an interview answer — not by listing the word.",
                        "suggested_edit": None,
                    }
                )
            elif st == "not_found" and r["kind"] in ("required", "unspecified"):
                items.append(
                    {
                        "id": f"missing:{skill}",
                        "priority": "high" if r["kind"] == "required" else "medium",
                        "text": f"{skill}: add evidence if you have it — otherwise treat it as a learning goal.",
                        "detail": "Don't add a skill just to match keywords. If it's a genuine gap, add it to your Skill Planner.",
                        "suggested_edit": None,
                    }
                )
            elif st == "verify":
                items.append(
                    {
                        "id": f"verify:{skill}",
                        "priority": "low",
                        "text": f"Confirm whether your related experience covers {skill}.",
                        "detail": next((n for n in r["notes"] if skill in n), ""),
                        "suggested_edit": None,
                    }
                )
    resp_words = Counter(
        w for resp in jd.get("responsibilities", []) for w in re.findall(r"[a-z]{5,}", resp.lower()) if w not in STOP
    )
    resume_text = " ".join(u[3].lower() for u in iter_evidence_units(content))
    missing_terms = [w for w, _c in resp_words.most_common(12) if w not in resume_text][:5]
    if missing_terms:
        items.append(
            {
                "id": "responsibilities",
                "priority": "low",
                "text": "Mirror the language of the responsibilities where it accurately describes your work.",
                "detail": "Terms in the role description not found in your resume: " + ", ".join(missing_terms) + ".",
                "suggested_edit": None,
            }
        )
    items.append(
        {
            "id": "review",
            "priority": "low",
            "text": "Review the final resume, preview it and export a role-specific version.",
            "detail": "Duplicate your resume for this role so your general version stays intact.",
            "suggested_edit": None,
        }
    )
    seen, out = set(), []
    for it in items:
        if it["id"] not in seen:
            seen.add(it["id"])
            out.append({**it, "done": False})
    order = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda x: order[x["priority"]])
    return out[:20]


def compare_job_descriptions(a: dict, b: dict) -> dict:
    def skill_set(jd):
        return {s: k for k, ss in jd["skills"].items() for s in ss}

    sa, sb = skill_set(a), skill_set(b)
    both = sorted(set(sa) & set(sb))
    return {
        "only_a": sorted(set(sa) - set(sb)),
        "only_b": sorted(set(sb) - set(sa)),
        "shared": [
            {
                "skill": s,
                "a_kind": sa[s],
                "b_kind": sb[s],
                "a_mentions": a["skill_mentions"].get(s, 0),
                "b_mentions": b["skill_mentions"].get(s, 0),
            }
            for s in both
        ],
        "emphasis": {
            "a_top": list(a["skill_mentions"].items())[:8],
            "b_top": list(b["skill_mentions"].items())[:8],
        },
        "category_mix": {
            "a": dict(Counter(lexicon.category_of(s) for s in sa)),
            "b": dict(Counter(lexicon.category_of(s) for s in sb)),
        },
        "requirement_counts": {
            "a": dict(Counter(r["kind"] for r in a["requirements"])),
            "b": dict(Counter(r["kind"] for r in b["requirements"])),
        },
    }
