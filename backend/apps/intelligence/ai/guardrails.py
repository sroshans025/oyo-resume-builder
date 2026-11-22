"""Fact-preservation and prompt-injection guardrails.

- Untrusted text (resumes, job descriptions, notes) is fenced and neutralised
  before it is placed in a prompt; it can never close the fence early.
- Generated text is checked for numbers and skills that do not appear in the
  user's own input. Unsupported numbers are replaced with a visible
  placeholder; unsupported skills are flagged for the user to remove.
"""

from __future__ import annotations

import re

from pydantic import BaseModel

from ..lexicon import find_skills

NUMBER_RE = re.compile(
    r"(?<![\w\[])(?:[$€£₹]\s?)?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|x|k|m|bn|million|billion|lakh|crore|\+)?(?![\w\]])",
    re.I,
)
PLACEHOLDER = "[add a real metric]"
FENCE_TAGS = ("resume_content", "job_description", "user_notes", "candidate_answer", "project_details")

INJECTION_PATTERNS = re.compile(
    r"(ignore (all|any|the)? ?(previous|prior|above) instructions|disregard (the )?(system|previous)|you are now|"
    r"system prompt|act as (an?|the) |reveal (your|the) (prompt|instructions)|</?(system|assistant|instructions)>)",
    re.I,
)


def fence(tag: str, text: str, limit: int = 12000) -> str:
    """Wrap untrusted text in a tag the model is told to treat as data only."""
    clean = (text or "")[:limit]
    for t in FENCE_TAGS:
        clean = re.sub(rf"</?\s*{t}\s*>", "", clean, flags=re.I)
    return f"<{tag}>\n{clean}\n</{tag}>"


def injection_suspected(text: str) -> bool:
    return bool(INJECTION_PATTERNS.search(text or ""))


def _numbers(text: str) -> set[str]:
    return {re.sub(r"[\s,]", "", m.group(0)).lower().rstrip("+") for m in NUMBER_RE.finditer(text or "")}


def _iter_strings(model: BaseModel):
    for name, value in model:
        if isinstance(value, str):
            yield name, value
        elif isinstance(value, list):
            for v in value:
                if isinstance(v, str):
                    yield name, v
                elif isinstance(v, BaseModel):
                    yield from _iter_strings(v)
        elif isinstance(value, BaseModel):
            yield from _iter_strings(value)


def enforce_facts(
    output: BaseModel,
    source_text: str,
    *,
    check_fields_skip=(
        "questions",
        "why",
        "rationale",
        "explanation",
        "missing",
        "follow_ups",
        "practice_tasks",
        "project_ideas",
        "milestones",
    ),
) -> tuple[BaseModel, list[dict]]:
    """Returns (sanitised output, warnings). Mutates a deep copy only."""
    source_numbers = _numbers(source_text)
    source_skills = {s.lower() for s in find_skills(source_text)}
    warnings: list[dict] = []
    flagged_skills: set[str] = set()
    replaced = 0

    def fix(text: str) -> str:
        nonlocal replaced

        def repl(m):
            nonlocal replaced
            token = re.sub(r"[\s,]", "", m.group(0)).lower().rstrip("+")
            # Years like 2023 and small ordinals in prose are allowed when present in the source.
            if token in source_numbers:
                return m.group(0)
            replaced += 1
            return PLACEHOLDER

        return NUMBER_RE.sub(repl, text)

    data = output.model_copy(deep=True)

    def walk(model: BaseModel):
        for name, value in model:
            if name in check_fields_skip:
                continue
            if isinstance(value, str):
                setattr(model, name, fix(value))
                for sk in find_skills(value):
                    if sk.lower() not in source_skills:
                        flagged_skills.add(sk)
            elif isinstance(value, list):
                new = []
                for v in value:
                    if isinstance(v, str):
                        new.append(fix(v))
                        for sk in find_skills(v):
                            if sk.lower() not in source_skills:
                                flagged_skills.add(sk)
                    elif isinstance(v, BaseModel):
                        walk(v)
                        new.append(v)
                    else:
                        new.append(v)
                setattr(model, name, new)
            elif isinstance(value, BaseModel):
                walk(value)

    walk(data)
    if replaced:
        warnings.append(
            {
                "code": "unsupported_numbers",
                "message": f"{replaced} number(s) not found in your input were replaced with “{PLACEHOLDER}”. Add only metrics you can verify.",
            }
        )
    soft = {
        "communication",
        "teamwork",
        "leadership",
        "problem solving",
        "collaboration",
        "time management",
        "ownership",
        "adaptability",
        "critical thinking",
        "attention to detail",
        "analytical skills",
        "presentation",
        "mentoring",
    }
    hard_flags = sorted(s for s in flagged_skills if s.lower() not in soft)
    if hard_flags:
        warnings.append(
            {
                "code": "unsupported_skills",
                "skills": hard_flags,
                "message": "This draft mentions " + ", ".join(hard_flags) + ", which we couldn't find in your input. "
                "Remove them unless they are accurate.",
            }
        )
    return data, warnings
