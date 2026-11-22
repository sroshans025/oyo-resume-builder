"""Starter templates. All are single-column with standard section headings and
real text (no images, tables or text boxes) so they extract in reading order."""

TEMPLATES = [
    {
        "slug": "clarity",
        "name": "Clarity",
        "category": "Classic",
        "description": "A calm, single-column layout with ruled section headings.",
        "best_for": "Most roles and experience levels",
        "readability_notes": "Generous spacing and a clear hierarchy make it easy to skim in under a minute.",
        "ats_notes": "Single column, standard headings and selectable text. Extracts in the same order you read it.",
        "style": {
            "font": "sans",
            "accent": "#1f2937",
            "heading": "caps-rule",
            "density": "comfortable",
            "align": "left",
            "name_size": 22,
        },
        "sort_order": 1,
    },
    {
        "slug": "meridian",
        "name": "Meridian",
        "category": "Modern",
        "description": "Modern sans-serif with a confident blue accent bar under each heading.",
        "best_for": "Tech, product and design roles",
        "readability_notes": "Accent colour is limited to headings so body text stays high-contrast.",
        "ats_notes": "Colour is decorative only; headings are plain text and extract cleanly.",
        "style": {
            "font": "sans",
            "accent": "#1f6fe0",
            "heading": "accent-bar",
            "density": "comfortable",
            "align": "left",
            "name_size": 23,
        },
        "sort_order": 2,
    },
    {
        "slug": "atlas",
        "name": "Atlas",
        "category": "Compact",
        "description": "Tighter spacing to fit substantial experience on fewer pages.",
        "best_for": "Experienced professionals with long histories",
        "readability_notes": "Slightly smaller type; keep bullets short so the page doesn't feel dense.",
        "ats_notes": "Single column with bold headings. Compact spacing does not affect extraction.",
        "style": {
            "font": "sans",
            "accent": "#0f766e",
            "heading": "bold",
            "density": "compact",
            "align": "left",
            "name_size": 20,
        },
        "sort_order": 3,
    },
    {
        "slug": "summit",
        "name": "Summit",
        "category": "Executive",
        "description": "Serif typography and a centred header for a formal, traditional look.",
        "best_for": "Leadership, finance, law and academia",
        "readability_notes": "Serif body text reads well in print; keep paragraphs short on screen.",
        "ats_notes": "Centred header text still extracts as normal lines. Avoid adding symbols to headings.",
        "style": {
            "font": "serif",
            "accent": "#1e293b",
            "heading": "small-caps",
            "density": "comfortable",
            "align": "center",
            "name_size": 22,
        },
        "sort_order": 4,
    },
    {
        "slug": "launch",
        "name": "Launch",
        "category": "Graduate",
        "description": "Built for students and freshers: education and projects lead the page.",
        "best_for": "Students, freshers and internship applications",
        "readability_notes": "Pairs well with an Education → Skills → Projects order for early-career resumes.",
        "ats_notes": "Single column with standard headings. Section order is yours to choose.",
        "style": {
            "font": "sans",
            "accent": "#5b3fd6",
            "heading": "caps-rule",
            "density": "comfortable",
            "align": "left",
            "name_size": 22,
        },
        "sort_order": 5,
    },
]


def sync_templates(**kwargs):
    from .models import Template

    for spec in TEMPLATES:
        Template.objects.update_or_create(slug=spec["slug"], defaults={k: v for k, v in spec.items() if k != "slug"})
