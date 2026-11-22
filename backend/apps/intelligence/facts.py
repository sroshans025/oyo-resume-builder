"""Extract verified facts from a user's resume to ground AI drafts."""

from apps.resumes.content import to_plain_text


def resume_facts(content: dict) -> dict:
    skills, highlights, projects, education = [], [], [], ""
    for s in content.get("sections", []):
        if not s.get("visible", True):
            continue
        d = s["data"]
        if s["type"] == "skills":
            for g in d.get("groups", []):
                skills.extend(g["skills"])
        elif s["type"] in ("experience", "projects"):
            for it in d.get("items", []):
                if s["type"] == "projects" and it.get("name"):
                    projects.append(it["name"])
                for b in it.get("bullets", []):
                    if b.strip():
                        highlights.append(b.strip())
        elif s["type"] == "education" and not education:
            items = d.get("items", [])
            if items:
                it = items[0]
                education = ", ".join(x for x in [it.get("degree"), it.get("institution")] if x)
    return {
        "name": content.get("personal", {}).get("full_name", ""),
        "headline": content.get("personal", {}).get("headline", ""),
        "skills": list(dict.fromkeys(skills)),
        "highlights": highlights[:6],
        "projects": projects[:6],
        "education": education,
        "text": to_plain_text(content),
    }
