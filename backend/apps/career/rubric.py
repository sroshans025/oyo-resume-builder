"""Transparent interview-answer rubric (deterministic).

Five criteria, each scored 1–5: relevance, structure, evidence, clarity,
completeness. Each score comes with the observable signals that produced it.
This is practice guidance only — not a prediction of any hiring decision."""

from __future__ import annotations

import re

STOP = set(
    "a an and or the of to in for with on at by from as is are was were be been i my me we our you your it this that "
    "what how why when where which who tell about time describe can could would do did".split()
)
SITUATION = re.compile(
    r"\b(when|while|during|at the time|in my|on a project|our team|there was|we had|i was working)\b", re.I
)
TASK = re.compile(
    r"\b(my (role|job|task|goal|responsibility)|i (needed|had) to|i was (asked|responsible)|the goal|deadline|objective)\b",
    re.I,
)
ACTION = re.compile(
    r"\bI\s+(?:then\s+|also\s+)?(?!(?:was|need|needed|had|have|wanted|used to)\b)"
    r"(\w+ed|built|wrote|rewrote|ran|led|made|took|set up|set|found|taught|drove|chose|spoke|began|gave|sent|won|kept|held|"
    r"met|brought|thought|did)\b"
)
RESULT = re.compile(
    r"\b(as a result|result(ed)?|outcome|which (led|meant)|so that|improv|reduc|increas|saved|achiev|feedback|learned|"
    r"delivered|launched|finished|completed)\b",
    re.I,
)
FILLER = re.compile(r"\b(um+|uh+|like,|you know|basically|actually|kind of|sort of|stuff|things)\b", re.I)


def _words(text):
    return [w.rstrip(".'-") for w in re.findall(r"[a-z][a-z+#.'-]*", text.lower())]


def score_answer(question: str, answer: str, focus_terms: list[str] | None = None) -> dict:
    words = _words(answer)
    n = len(words)
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", answer.strip()) if s.strip()]
    q_terms = {w for w in _words(question) if w not in STOP and len(w) > 3} | {t.lower() for t in (focus_terms or [])}
    hits = {t for t in q_terms if t in answer.lower()}
    criteria = []

    rel = 1 if n < 15 else min(5, 2 + round(3 * len(hits) / max(1, min(len(q_terms), 6))))
    criteria.append(
        {
            "key": "relevance",
            "label": "Relevance",
            "score": rel,
            "note": f"Refers to {len(hits)} key term(s) from the question"
            + (f": {', '.join(sorted(hits)[:5])}" if hits else "")
            + ".",
            "tip": "Answer the exact question asked and connect your example back to it.",
        }
    )

    star = {
        "situation": bool(SITUATION.search(answer)),
        "task": bool(TASK.search(answer)),
        "action": bool(ACTION.search(answer)),
        "result": bool(RESULT.search(answer)),
    }
    structure = 1 + sum(star.values())
    criteria.append(
        {
            "key": "structure",
            "label": "Structure",
            "score": min(5, structure),
            "note": "STAR elements detected: "
            + (", ".join(k.capitalize() for k, v in star.items() if v) or "none")
            + ".",
            "tip": "Use Situation → Task → Action → Result so the listener can follow.",
        }
    )

    numbers = len(re.findall(r"\d", answer))
    specifics = len(re.findall(r"\b[A-Z][a-zA-Z+#.]{2,}\b", answer)) + numbers
    i_actions = len(ACTION.findall(answer))
    ev = 1 + min(2, specifics // 3) + min(2, i_actions)
    criteria.append(
        {
            "key": "evidence",
            "label": "Evidence",
            "score": min(5, ev),
            "note": f"{i_actions} first-person action(s), {numbers} figure(s), {specifics} specific detail(s).",
            "tip": "Say what *you* did (“I…”) and include a concrete detail or real result.",
        }
    )

    avg = n / max(1, len(sentences))
    fillers = len(FILLER.findall(answer))
    clarity = 5
    if avg > 30:
        clarity -= 2
    elif avg > 24:
        clarity -= 1
    clarity -= min(2, fillers)
    if n < 15:
        clarity = min(clarity, 2)
    criteria.append(
        {
            "key": "clarity",
            "label": "Clarity",
            "score": max(1, clarity),
            "note": f"Average sentence length {round(avg)} words; {fillers} filler phrase(s).",
            "tip": "Use shorter sentences and remove filler words.",
        }
    )

    if n < 40:
        comp = 1
    elif n < 90:
        comp = 2
    elif n <= 380:
        comp = 4 + (1 if star["result"] else 0)
    else:
        comp = 3
    criteria.append(
        {
            "key": "completeness",
            "label": "Completeness",
            "score": comp,
            "note": f"{n} words" + ("; includes an outcome." if star["result"] else "; no clear outcome."),
            "tip": "Aim for roughly 1–2 minutes spoken (150–350 words) and finish with the result.",
        }
    )

    needs_example = i_actions == 0 or not (star["situation"] or star["task"])
    follow_ups = []
    if not star["result"]:
        follow_ups.append("What was the result, and how did you know it worked?")
    if needs_example:
        follow_ups.append("Can you give a specific example of a time you did this?")
    if i_actions and "we" in words and words.count("we") > words.count("i"):
        follow_ups.append("What was your personal contribution, as opposed to the team's?")
    return {
        "criteria": criteria,
        "total": sum(c["score"] for c in criteria),
        "max": 25,
        "star_detected": star,
        "needs_concrete_example": needs_example,
        "follow_ups": follow_ups,
        "disclaimer": "Practice guidance based on observable features of your text — not a hiring prediction.",
    }
