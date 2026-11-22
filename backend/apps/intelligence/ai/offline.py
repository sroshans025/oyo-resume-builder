"""Offline writing assistant: deterministic, rule-based drafts built only from
the user's own input. Used when no AI provider is configured, when consent is
not given, or when the provider fails. Output is always labelled as offline
and never presented as coming from a language model."""

from __future__ import annotations

import re

from .. import lexicon
from . import schemas as S

WEAK_OPENERS = [
    r"was responsible for",
    r"responsible for",
    r"duties included",
    r"tasked with",
    r"worked on",
    r"helped (?:to )?",
    r"assisted (?:with|in)",
    r"involved in",
    r"participated in",
    r"in charge of",
    r"handled",
    r"did",
]
WEAK_RE = re.compile(r"^\s*(?:i\s+)?(?:" + "|".join(WEAK_OPENERS) + r")\s*", re.I)

VERBS = {
    "build": ["Built", "Developed", "Implemented", "Designed", "Engineered", "Created"],
    "improve": ["Improved", "Optimised", "Streamlined", "Reduced", "Accelerated", "Strengthened"],
    "analyze": ["Analysed", "Evaluated", "Investigated", "Modelled", "Measured", "Identified"],
    "lead": ["Led", "Coordinated", "Directed", "Mentored", "Organised", "Championed"],
    "communicate": ["Presented", "Documented", "Authored", "Explained", "Facilitated", "Negotiated"],
    "support": ["Supported", "Resolved", "Maintained", "Delivered", "Configured", "Administered"],
    "research": ["Researched", "Prototyped", "Tested", "Validated", "Explored", "Benchmarked"],
    "operate": ["Processed", "Prepared", "Completed", "Delivered", "Handled", "Maintained"],
}
TOPIC_HINTS = {
    "build": r"build|built|develop|creat|implement|app|website|feature|api|tool|system|platform|code|design",
    "improve": r"improv|optimi|reduc|increas|faster|speed|efficien|automat|refactor|cost",
    "analyze": r"data|analys|analyz|report|dashboard|insight|metric|sql|excel|forecast",
    "lead": r"\blead|\bled\b|coordinat|\bmanag|mentor|supervis|organi[sz]ed",
    "communicate": r"present|document|writ|stakeholder|client|customer|train|workshop",
    "support": r"support|ticket|maintain|fix|bug|issue|troubleshoot|resolve|help",
    "research": r"research|experiment|study|prototype|test|evaluat|paper",
}
TONE_PREFERENCE = {
    "leadership": ["lead", "communicate", "improve"],
    "technical": ["build", "improve", "analyze"],
    "fresher": ["build", "research", "support"],
    "concise": [],
    "professional": [],
}
FILLER_RE = re.compile(r"\b(successfully|effectively|various|several|basically|really|very|in order to)\b\s*", re.I)
NUMBER_RE = re.compile(r"\d")


def _topics(text: str) -> list[str]:
    scores = [(k, len(re.findall(p, text, re.I))) for k, p in TOPIC_HINTS.items()]
    ranked = [k for k, s in sorted(scores, key=lambda x: -x[1]) if s > 0]
    return ranked or ["operate", "support"]


def _verb_choices(text: str, tone: str) -> list[str]:
    order = TONE_PREFERENCE.get(tone, []) + _topics(text)
    seen, verbs = set(), []
    for topic in order:
        if topic in seen:
            continue
        seen.add(topic)
        verbs.append(VERBS[topic][0])
    for topic in _topics(text):
        verbs.extend(VERBS[topic][1:3])
    out = []
    for v in verbs:
        if v not in out:
            out.append(v)
    return out


IRREGULAR_PAST = {
    "build": "Built",
    "write": "Wrote",
    "run": "Ran",
    "lead": "Led",
    "make": "Made",
    "set": "Set",
    "teach": "Taught",
    "take": "Took",
    "give": "Gave",
    "find": "Found",
    "keep": "Kept",
    "hold": "Held",
    "send": "Sent",
    "begin": "Began",
}
VERB_BASES = set(
    """organise organize build develop create design implement write test analyse analyze coordinate maintain support
    improve automate deploy migrate plan run lead teach train research present document prepare review set make launch
    fix resolve configure monitor track collect clean refactor integrate optimise optimize reduce increase deliver
    process handle manage mentor host facilitate draft edit publish recruit schedule update upgrade""".split()
)


def _past(verb: str) -> str:
    v = verb.lower()
    if v in IRREGULAR_PAST:
        return IRREGULAR_PAST[v]
    if v.endswith("e"):
        out = v + "d"
    elif v.endswith("y") and len(v) > 1 and v[-2] not in "aeiou":
        out = v[:-1] + "ied"
    elif v in {"plan", "ship", "stop", "scrap"}:
        out = v + v[-1] + "ed"
    else:
        out = v + "ed"
    return out.capitalize()


def _own_action(text: str) -> str | None:
    """If, after removing a weak opener, the text starts with a base-form verb
    ('helped organise the hackathon'), return the user's own action in the
    past tense ('Organised the hackathon') instead of inventing a new verb."""
    stripped = WEAK_RE.sub("", text.strip()).rstrip(". ")
    stripped = re.sub(r"^(?:to|and)\s+", "", stripped, flags=re.I)
    first, _, rest = stripped.partition(" ")
    if not rest:
        return None
    base = first.lower() if first.lower() in VERB_BASES else _gerund_base(first)
    return f"{_past(base)} {rest}" if base else None


def _gerund_base(word: str) -> str | None:
    """'writing' -> 'write', 'running' -> 'run', 'building' -> 'build'; None if not a known verb."""
    w = word.lower()
    if not w.endswith("ing") or len(w) < 5:
        return None
    stem = w[:-3]
    for cand in (stem, stem + "e", stem[:-1] if len(stem) > 2 and stem[-1] == stem[-2] else None):
        if cand and cand in VERB_BASES:
            return cand
    return None


def _core(text: str) -> str:
    core = WEAK_RE.sub("", text.strip()).rstrip(". ")
    # Drop a leading verb gerund ("developing a tool" -> "a tool") so a new action
    # verb can replace it. Only real verbs are dropped: "onboarding emails" keeps
    # every word, because removing it would change the meaning.
    m = re.match(r"^(\w+)ing\s+(.*)$", core, re.I)
    if m:
        stem = m.group(1).lower()
        if {stem, stem + "e", stem[:-1] if len(stem) > 2 and stem[-1] == stem[-2] else stem} & VERB_BASES:
            core = m.group(2)
    return core


def _lower_first(text: str) -> str:
    """Lower-case the first letter only for ordinary words. Proper nouns, skills,
    acronyms and mixed-case words (Django, AWS, iOS, Acme) keep their casing."""
    if not text:
        return text
    first = text.split(" ", 1)[0]
    if (
        lexicon.find_skills(first)
        or first.isupper()
        or any(ch.isupper() for ch in first[1:])
        or first.lower() not in COMMON_LOWER
    ):
        return text
    return text[0].lower() + text[1:]


COMMON_LOWER = set(
    """a an the our my their its this these those new multiple several various internal external weekly daily monthly
    customer customers client clients user users student students team teams staff company product products data
    reports report dashboards dashboard tests test documentation features feature code services service tools tool
    onboarding website websites app apps applications application pages workflows processes events campaigns content
    manual slow existing legacy large small key critical core attendance sales revenue engagement turnout traffic
    satisfaction participation membership signups sign-ups downloads response errors costs""".split()
)


def _clean(text: str, tone: str) -> str:
    if tone == "concise":
        text = FILLER_RE.sub("", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def _starts_with_verb(text: str) -> bool:
    first = text.strip().split(" ")[0].lower() if text.strip() else ""
    all_verbs = {v.lower() for vs in VERBS.values() for v in vs}
    return first in all_verbs or first.endswith("ed")


def bullet(text: str, tone: str = "professional", context: dict | None = None) -> S.BulletOut:
    context = context or {}
    text = text.strip()
    core = _core(text)
    has_metric = bool(NUMBER_RE.search(text))
    tools = [t for t in lexicon.find_skills(" ".join([text, context.get("tools", "")]))][:3]
    suggestions = []
    verbs = _verb_choices(text, tone)
    own = _own_action(text) if WEAK_RE.match(text) else None
    if _starts_with_verb(text) and not WEAK_RE.match(text):
        base = text.rstrip(".")
        suggestions.append(
            S.Suggestion(text=_clean(base, tone), rationale="Already starts with an action verb; tightened wording.")
        )
        first_word, _, remainder = text.strip().partition(" ")
        core = remainder.rstrip(".") or core  # alternatives swap the verb instead of stacking a second one
        verbs = [v for v in verbs if v.lower() != first_word.lower()][:2]
    elif own:
        sentence = own + ("" if has_metric else ", resulting in [describe the measurable result]")
        suggestions.append(
            S.Suggestion(
                text=_clean(sentence, tone),
                rationale="Kept your own action, without the “responsible for / helped” opener.",
            )
        )
        verbs = []  # the user's own verb is the accurate one; don't prepend another
    for verb in verbs:
        sentence = f"{verb} {_lower_first(core)}"
        if tone == "technical" and tools and not any(t.lower() in sentence.lower() for t in tools):
            sentence += f" using {', '.join(tools)}"
        if not has_metric:
            sentence += ", resulting in [describe the measurable result]"
        suggestions.append(
            S.Suggestion(
                text=_clean(sentence, tone),
                rationale=f"Starts with “{verb}” (action) and keeps your original task"
                + ("" if has_metric else "; add a real result where the placeholder is."),
            )
        )
        if len(suggestions) >= 3:
            break
    questions = []
    if not has_metric:
        questions.append(
            "What changed because of this work? (e.g. time saved, users reached, errors reduced, grade or rating) Only use numbers you can verify."
        )
    if not tools and tone == "technical":
        questions.append("Which tools, languages or methods did you use for this?")
    if len(text.split()) < 6:
        questions.append("Can you add who it was for or why it mattered?")
    return S.BulletOut(suggestions=suggestions[:4], questions=questions)


def summary(facts: dict, tone: str = "professional") -> S.SummaryOut:
    role = facts.get("target_role") or facts.get("headline") or "the role you are targeting"
    level = facts.get("experience_level", "")
    skills = facts.get("skills", [])[:5]
    highlights = [h for h in facts.get("highlights", []) if h][:2]
    education = facts.get("education", "")
    level_phrase = {
        "student": "Student",
        "fresher": "Recent graduate",
        "early": "Early-career professional",
        "mid": "Experienced professional",
        "senior": "Senior professional",
        "career_changer": "Career changer",
    }.get(level, "Professional")
    skill_text = ", ".join(skills) if skills else "[your strongest relevant skills]"
    drafts = []
    s1 = f"{level_phrase} targeting {role} roles, with hands-on experience in {skill_text}."
    if highlights:
        s1 += f" Recent work: {highlights[0].rstrip('.')}."
    else:
        s1 += " [Add one concrete example of work you are proud of.]"
    s1 += " [Add what you want to contribute in your next role.]"
    drafts.append(S.Suggestion(text=s1, rationale="Role + skills + evidence + goal, built only from your resume."))
    if tone in ("concise", "professional", "technical"):
        drafts.append(
            S.Suggestion(
                text=f"{role.capitalize() if role[0].islower() else role} candidate skilled in {skill_text}"
                + (f"; {education}" if education else "")
                + ".",
                rationale="A one-line version for compact layouts.",
            )
        )
    if level in ("student", "fresher") or tone == "fresher":
        drafts.append(
            S.Suggestion(
                text=f"Motivated {level_phrase.lower()}"
                + (f" ({education})" if education else "")
                + f" building practical skills in {skill_text} through projects"
                + (f" such as {highlights[0].split(',')[0].rstrip('.')}" if highlights else " [name a project]")
                + ".",
                rationale="Leads with education and projects, which suits early-career resumes.",
            )
        )
    questions = []
    if not highlights:
        questions.append("Which project or experience best shows you can do this role?")
    if not skills:
        questions.append("Which 3–5 skills matter most for your target role (only ones you can demonstrate)?")
    return S.SummaryOut(drafts=drafts[:3], questions=questions)


def project(fields: dict, tone: str = "professional") -> S.ProjectOut:
    name = fields.get("name") or "This project"
    problem = fields.get("problem", "").strip().rstrip(".")
    approach = fields.get("approach", "").strip().rstrip(".")
    tools = fields.get("tools", "").strip()
    outcome = fields.get("outcome", "").strip().rstrip(".")
    parts = [f"{name} addresses {_lower_first(problem)}." if problem else f"{name}: [describe the problem it solves]."]
    if approach:
        parts.append(f"Approach: {approach}" + (f", using {tools}." if tools else "."))
    elif tools:
        parts.append(f"Built with {tools}.")
    parts.append(f"Outcome: {outcome}." if outcome else "Outcome: [describe what it achieved or what you learned].")
    bullets = []
    if approach:
        verb = _verb_choices(approach, tone)[0]
        bullets.append(f"{verb} {_core(approach)}" + (f" using {tools}" if tools else ""))
    if problem:
        bullets.append(f"Addressed {_lower_first(problem)}")
    bullets.append(outcome[0].upper() + outcome[1:] if outcome else "Delivered [result] — add a verifiable outcome")
    questions = []
    if not outcome:
        questions.append("What was the result? Users, accuracy, grade, time saved or feedback — only real figures.")
    if not tools:
        questions.append("Which tools or technologies did you use?")
    return S.ProjectOut(description=" ".join(parts), bullets=bullets[:4], questions=questions)


PAST_IRREGULAR = set(
    """ran led built wrote made set took gave began grew won taught drove found chose held kept met sent spent brought
    bought thought ran rebuilt redesigned overhauled""".split()
)


def achievement(notes: str, context: str = "") -> S.AchievementOut:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n", notes) if s.strip()]
    ctx = (context or (sentences[0] if len(sentences) > 1 else "")).rstrip(".")
    result_candidates = [
        s
        for s in sentences
        if NUMBER_RE.search(s) or re.search(r"result|led to|improv|reduc|increas|award|won|rose|grew", s, re.I)
    ]
    result = result_candidates[-1].rstrip(".") if result_candidates else ""
    actions = [s for s in sentences if s.rstrip(".") not in (ctx, result)]
    action = (actions[0] if actions else (sentences[0] if sentences else "")).rstrip(".")
    action_clean = re.sub(r"^(?:i|we)\s+", "", action, flags=re.I)
    first = action_clean.split(" ", 1)[0].lower() if action_clean else ""
    if (first.endswith("ed") or first in PAST_IRREGULAR) and not WEAK_RE.match(action_clean):
        statement = action_clean[0].upper() + action_clean[1:]
    elif action_clean and _own_action(action_clean):
        statement = _own_action(action_clean)
    elif action_clean:
        statement = f"{_verb_choices(action_clean, 'professional')[0]} {_lower_first(_core(action_clean))}"
    else:
        statement = "[What you did]"
    if ctx and len(ctx) < 140:
        joiner = " when " if re.search(r"\b(had|was|were|is|are|faced|needed|lacked|wanted)\b", ctx, re.I) else " for "
        statement += joiner + _lower_first(ctx)
    statement += f"; {_lower_first(result)}" if result else ", resulting in [real, verifiable result]"
    questions = []
    if not result:
        questions.append(
            "What measurable change happened? If you don't have a number, describe the qualitative result (e.g. adopted by the team)."
        )
    if not ctx:
        questions.append("What was the situation or challenge?")
    return S.AchievementOut(statement=statement + ".", context=ctx, action=action, result=result, questions=questions)


def action_verbs(text: str) -> S.VerbsOut:
    core = _core(text) if text else "the project"
    out = []
    for topic in _topics(text or "")[:3]:
        for v in VERBS[topic][:4]:
            out.append(S.VerbSuggestion(verb=v, example=f"{v} {core}"[:300]))
    return S.VerbsOut(verbs=out[:12])


COMMON_MISSPELLINGS = {
    "recieve": "receive",
    "recieved": "received",
    "managment": "management",
    "acheive": "achieve",
    "acheived": "achieved",
    "responsibilites": "responsibilities",
    "developement": "development",
    "enviroment": "environment",
    "experiance": "experience",
    "sucessful": "successful",
    "sucessfully": "successfully",
    "occured": "occurred",
    "seperate": "separate",
    "definately": "definitely",
    "comunication": "communication",
    "maintainance": "maintenance",
    "knowlege": "knowledge",
    "buisness": "business",
    "adress": "address",
    "untill": "until",
    "wich": "which",
    "teh": "the",
    "begining": "beginning",
    "collegue": "colleague",
    "commited": "committed",
    "existance": "existence",
    "accomodate": "accommodate",
    "goverment": "government",
    "independant": "independent",
    "liase": "liaise",
    "neccessary": "necessary",
    "occassion": "occasion",
    "persue": "pursue",
    "prefered": "preferred",
    "realy": "really",
    "refered": "referred",
    "relevent": "relevant",
    "succesful": "successful",
    "tommorow": "tomorrow",
    "trainig": "training",
    "analysed data": "analysed data",
    "javascipt": "JavaScript",
    "pyhton": "Python",
    "databse": "database",
    "lenght": "length",
    "achievment": "achievement",
    "achievments": "achievements",
}
PRESENT_RE = re.compile(
    r"^(manages|develops|builds|leads|creates|designs|works|handles|maintains|supports|writes)\b", re.I
)
GERUND_RE = re.compile(r"^\w+ing\b", re.I)


def proofread(text: str, current_role: bool | None = None) -> S.ProofreadOut:
    issues = []
    lower = text.lower()
    for wrong, right in COMMON_MISSPELLINGS.items():
        if wrong == right:
            continue
        for m in re.finditer(rf"\b{re.escape(wrong)}\b", lower):
            issues.append(
                S.ProofIssue(
                    type="spelling",
                    excerpt=text[m.start() : m.end()],
                    suggestion=right,
                    explanation="Likely misspelling — please check.",
                )
            )
    for m in re.finditer(r"\b(\w+)\s+\1\b", text, re.I):
        if m.group(1).lower() not in {"that", "had"}:
            issues.append(
                S.ProofIssue(type="repetition", excerpt=m.group(0), suggestion=m.group(1), explanation="Repeated word.")
            )
    if "  " in text:
        issues.append(
            S.ProofIssue(
                type="consistency",
                excerpt="double space",
                suggestion="single space",
                explanation="Extra spaces between words.",
            )
        )
    lines = [ln.strip("•-* ").strip() for ln in text.split("\n") if ln.strip()]
    starts = [ln.split(" ")[0].lower() for ln in lines if ln]
    for word in {s for s in starts if starts.count(s) >= 3 and len(s) > 2}:
        issues.append(
            S.ProofIssue(
                type="repetition",
                excerpt=word.capitalize(),
                suggestion="Vary the opening verbs",
                explanation=f"{starts.count(word)} lines start with “{word.capitalize()}”.",
            )
        )
    if current_role is False:
        for ln in lines:
            if PRESENT_RE.match(ln) or GERUND_RE.match(ln):
                issues.append(
                    S.ProofIssue(
                        type="tense",
                        excerpt=ln[:80],
                        suggestion="Use past tense for past roles",
                        explanation="Past roles usually read best in the past tense.",
                    )
                )
    for ln in lines:
        if re.match(r"^i\b", ln, re.I):
            issues.append(
                S.ProofIssue(
                    type="style",
                    excerpt=ln[:60],
                    suggestion="Drop the “I” and start with a verb",
                    explanation="Resumes conventionally omit first-person pronouns.",
                )
            )
        if WEAK_RE.match(ln):
            issues.append(
                S.ProofIssue(
                    type="style",
                    excerpt=ln[:60],
                    suggestion="Start with an action verb",
                    explanation="“Responsible for”/“worked on” describes duties, not what you did.",
                )
            )
    ends = [ln.endswith(".") for ln in lines if len(ln.split()) > 4]
    if ends and 0 < sum(ends) < len(ends):
        issues.append(
            S.ProofIssue(
                type="consistency",
                excerpt="Bullet punctuation",
                suggestion="End all bullets the same way",
                explanation="Some bullets end with a full stop and others don't.",
            )
        )
    return S.ProofreadOut(issues=issues[:40])


def cover_letter(facts: dict, tone: str = "professional") -> S.CoverLetterOut:
    company = facts.get("company") or "[Company]"
    role = facts.get("role") or "[Role]"
    name = facts.get("name") or ""
    skills = facts.get("matched_skills") or facts.get("skills", [])[:4]
    highlights = [h.rstrip(".") for h in facts.get("highlights", []) if h][:2]
    motivation = (facts.get("motivation") or "").strip()
    paras = [
        f"I am writing to apply for the {role} position at {company}. "
        + (
            motivation
            if motivation
            else f"[Say, in your own words, why {company} and this role interest you — only what you genuinely know about them.]"
        ),
    ]
    if highlights:
        evidence = " ".join(f"{h[0].upper() + h[1:]}." for h in highlights)
        paras.append(f"My recent work is directly relevant. {evidence}")
    else:
        paras.append("[Describe one or two experiences from your resume that show you can do this job.]")
    if skills:
        paras.append(
            f"I bring practical experience with {', '.join(skills)}, which the role calls for, and I'm keen to apply it to {company}'s work."
        )
    paras.append(
        "Thank you for considering my application. I would welcome the opportunity to discuss how I can contribute to the team."
    )
    questions = []
    if not motivation:
        questions.append(
            f"What genuinely interests you about {company}? We don't research companies for you, so add facts you know are true."
        )
    return S.CoverLetterOut(
        greeting="Dear Hiring Manager,", paragraphs=paras, closing=f"Kind regards,\n{name}".strip(), questions=questions
    )


BEHAVIORAL_BANK = [
    ("Tell me about a time you had to learn something new quickly to deliver a task.", "Tests learning agility."),
    (
        "Describe a situation where you disagreed with a teammate. How did you handle it?",
        "Tests collaboration and conflict handling.",
    ),
    ("Tell me about a mistake you made and what you changed afterwards.", "Tests ownership and reflection."),
    ("Describe a time you had to prioritise competing deadlines.", "Tests planning and judgement."),
    (
        "Tell me about a project you're proud of and your specific contribution.",
        "Tests impact and clarity about your role.",
    ),
]


def interview_questions(
    role: str, requirements: list[str], responsibilities: list[str], projects: list[str], count: int = 8
) -> S.QuestionsOut:
    qs: list[S.InterviewQuestion] = []
    n_tech = max(1, round(count * 0.4)) if requirements else 0
    n_role = max(1, round(count * 0.25))
    for skill in requirements[:n_tech]:
        qs.append(
            S.InterviewQuestion(
                category="technical",
                text=f"Walk me through a time you used {skill}. What problem were you solving and what trade-offs did you make?",
                why=f"The job description lists {skill}.",
                follow_ups=[f"What would you do differently with {skill} next time?"],
            )
        )
    role_sources = [("resp", r) for r in responsibilities] + [("proj", p) for p in projects]
    for kind, item in role_sources[:n_role]:
        if kind == "resp":
            qs.append(
                S.InterviewQuestion(
                    category="role",
                    text=f"This role involves: “{item.rstrip('.')[:160]}”. How have you done something similar, or how would you approach it?",
                    why="Taken from the responsibilities in the job description.",
                    follow_ups=["How would you measure success here?"],
                )
            )
        else:
            qs.append(
                S.InterviewQuestion(
                    category="role",
                    text=f"On your resume you mention “{item[:120]}”. What was your exact contribution and the result?",
                    why="Interviewers often probe resume claims.",
                    follow_ups=["What was the hardest part?"],
                )
            )
    for text, why in BEHAVIORAL_BANK:
        if len(qs) >= count:
            break
        qs.append(
            S.InterviewQuestion(
                category="behavioral", text=text, why=why, follow_ups=["What was the outcome, and how do you know?"]
            )
        )
    if not qs:
        qs.append(
            S.InterviewQuestion(
                category="behavioral", text=f"Why are you interested in {role or 'this role'}?", why="Common opener."
            )
        )
    return S.QuestionsOut(questions=qs[: max(count, 1)])


def star_outline(question: str, notes: str) -> S.StarOut:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n", notes) if s.strip()]
    sit = [s for s in sentences if re.search(r"\b(when|while|during|at|in my|our team|the project|we had)\b", s, re.I)][
        :1
    ]
    task = [
        s for s in sentences if re.search(r"\b(needed|had to|goal|task|asked|responsible|deadline|aim)\b", s, re.I)
    ][:1]
    res = [
        s
        for s in sentences
        if re.search(r"\b(result|so that|led to|improv|reduc|increas|achiev|outcome|feedback|learned)\b|\d", s, re.I)
    ][-1:]
    used = set(sit + task + res)
    act = [s for s in sentences if s not in used]
    missing = []
    if not sit:
        missing.append("Situation: where and when did this happen?")
    if not task:
        missing.append("Task: what were you specifically responsible for?")
    if not act:
        missing.append("Action: what steps did *you* take (use “I”, not “we”)?")
    if not res:
        missing.append("Result: what happened, and how do you know? Use real outcomes.")
    return S.StarOut(
        situation=" ".join(sit), task=" ".join(task), action=" ".join(act), result=" ".join(res), missing=missing
    )


def project_document(kind: str, p: dict) -> S.DocumentOut:
    def val(key, prompt):
        v = (p.get(key) or "").strip()
        return v if v else f"[{prompt}]"

    title = p.get("title") or "Project"
    tools = ", ".join(p.get("tools") or []) or "[tools and technologies]"
    if kind == "case_study":
        sections = [
            ("Problem", val("problem", "What problem did this solve, and why did it matter?")),
            ("Users", val("users", "Who used it or benefited from it?")),
            ("Approach", val("approach", "How did you approach it? Key decisions and alternatives considered")),
            ("Architecture", val("architecture", "Main components and how they connect")),
            ("Tools", tools),
            ("Results", val("results", "Real outcomes: usage, feedback, grades, performance — only verifiable facts")),
            ("Lessons", val("lessons", "What you learned and would do differently")),
        ]
        out_title = f"{title} — Case study"
    elif kind == "readme":
        sections = [
            ("Overview", val("summary", "One paragraph describing the project")),
            ("Problem", val("problem", "The problem it addresses")),
            ("Features", val("approach", "Key features")),
            ("Tech stack", tools),
            ("Architecture", val("architecture", "Components and data flow")),
            (
                "Getting started",
                "1. Clone the repository\n2. Install dependencies\n3. [Add the exact commands to run the project]",
            ),
            ("Results", val("results", "Outcomes or screenshots")),
            (
                "Links",
                "\n".join(x for x in [p.get("github_url", ""), p.get("demo_url", "")] if x)
                or "[Repository / demo links]",
            ),
        ]
        out_title = f"{title} — README draft"
    else:
        sections = [
            ("1. Title & one-line pitch", f"{title}: {val('summary', 'one-line description')}"),
            ("2. The problem", val("problem", "Problem and who it affects")),
            ("3. Approach", val("approach", "How you solved it")),
            ("4. Architecture & tools", f"{val('architecture', 'Diagram of components')}\nTools: {tools}"),
            ("5. Demo", p.get("demo_url") or "[Live demo or screenshots]"),
            ("6. Results", val("results", "Verifiable outcomes")),
            ("7. Lessons & next steps", val("lessons", "What you learned and what's next")),
        ]
        out_title = f"{title} — Presentation outline"
    questions = [f"Add details for: {h}" for h, b in sections if b.startswith("[")][:5]
    return S.DocumentOut(
        title=out_title, sections=[S.DocSection(heading=h, body=b) for h, b in sections], questions=questions
    )


def project_bullets(p: dict) -> S.BulletsOut:
    out = project(
        {
            "name": p.get("title"),
            "problem": p.get("problem", ""),
            "approach": p.get("approach", ""),
            "tools": ", ".join(p.get("tools") or []),
            "outcome": p.get("results", ""),
        }
    )
    return S.BulletsOut(bullets=out.bullets, questions=out.questions)


LEARNING_LIBRARY = {
    "Programming language": (
        ["Complete a structured fundamentals course", "Solve 15 practice problems", "Build a small CLI or web tool"],
        ["Re-implement a feature from one of your projects in {s}", "Write unit tests for your code"],
        ["A small utility that automates a task you do weekly, written in {s}"],
    ),
    "Framework & library": (
        [
            "Follow the official {s} tutorial end to end",
            "Build a feature using {s} without a tutorial",
            "Read the {s} docs on testing and deployment",
        ],
        ["Add {s} to an existing project", "Write a short note on {s} trade-offs"],
        ["A focused app that uses {s} for its core feature, deployed with a public link"],
    ),
    "Cloud & DevOps": (
        [
            "Learn the core concepts and pricing model for {s}",
            "Deploy a sample app using {s}",
            "Automate the deployment",
        ],
        ["Containerise or deploy one of your projects", "Write a runbook documenting the setup"],
        ["Deploy one of your existing projects using {s} and document the architecture"],
    ),
    "Data & databases": (
        ["Learn {s} fundamentals", "Work through a real public dataset", "Explain one analysis end to end"],
        ["Answer 5 business questions with {s} on a public dataset", "Visualise the results"],
        ["An analysis notebook or dashboard using {s} on an open dataset, with written findings"],
    ),
    "Tools & practices": (
        ["Learn the core workflow of {s}", "Apply {s} to a current project", "Reflect on what improved"],
        ["Use {s} for two weeks on a real piece of work"],
        ["Document how you applied {s} in one of your projects"],
    ),
    "Business & domain": (
        ["Read an introductory guide to {s}", "Study 2 real case studies", "Apply {s} to a small scenario"],
        ["Write a one-page plan applying {s} to a familiar problem"],
        ["A short case study demonstrating {s} on a realistic scenario"],
    ),
    "Professional skill": (
        ["Identify 2 past examples where you used {s}", "Seek a new opportunity to practise {s}", "Ask for feedback"],
        ["Prepare a STAR story that demonstrates {s}"],
        ["Volunteer for a role that exercises {s} (club, open source, team project)"],
    ),
}


def learning(skill: str) -> S.LearningOut:
    cat = lexicon.category_of(skill)
    milestones, tasks, ideas = LEARNING_LIBRARY.get(cat, LEARNING_LIBRARY["Tools & practices"])
    return S.LearningOut(
        milestones=[m.format(s=skill) for m in milestones],
        practice_tasks=[t.format(s=skill) for t in tasks],
        project_ideas=[i.format(s=skill) for i in ideas],
    )


def answer_feedback(rubric: dict) -> S.FeedbackOut:
    weak = sorted(rubric["criteria"], key=lambda c: c["score"])
    strengths = [f"{c['label']}: {c['note']}" for c in rubric["criteria"] if c["score"] >= 4][:3]
    improvements = [f"{c['label']}: {c['tip']}" for c in weak if c["score"] <= 3][:3]
    summary = f"Rubric total {rubric['total']}/25. " + (
        f"Focus next on {weak[0]['label'].lower()}."
        if weak and weak[0]["score"] <= 3
        else "A solid answer — practise delivering it concisely."
    )
    follow = ["What would you do differently next time?", "How did you measure the result?"]
    return S.FeedbackOut(summary=summary, strengths=strengths, improvements=improvements, follow_ups=follow)
