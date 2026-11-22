"""Skill lexicon used for deterministic keyword normalization.

Each entry is "Canonical|alias|alias". Matching is case-insensitive on word
boundaries. A related-skill map lets matching flag *possible* evidence that
needs the user's verification instead of claiming a match."""

from __future__ import annotations

import re
from functools import lru_cache

RAW = {
    "Programming language": [
        "Python",
        "Java",
        "JavaScript|JS|ECMAScript",
        "TypeScript|TS",
        "C++|cpp",
        "C#|csharp|C sharp",
        "C",
        "Go|Golang",
        "Rust",
        "Kotlin",
        "Swift",
        "Ruby",
        "PHP",
        "Scala",
        "R",
        "MATLAB",
        "Dart",
        "Bash|shell scripting",
        "SQL",
        "HTML|HTML5",
        "CSS|CSS3",
        "Solidity",
        "Perl",
        "Haskell",
        "Elixir",
    ],
    "Framework & library": [
        "React|React.js|ReactJS",
        "Next.js|NextJS",
        "Vue|Vue.js|VueJS",
        "Angular|AngularJS",
        "Svelte",
        "Node.js|NodeJS",
        "Express|Express.js",
        "NestJS",
        "Django",
        "Django REST Framework|DRF",
        "Flask",
        "FastAPI",
        "Spring|Spring Boot",
        "Ruby on Rails|Rails",
        "Laravel",
        ".NET|ASP.NET|dotnet",
        "Tailwind CSS|Tailwind",
        "Bootstrap",
        "Redux",
        "GraphQL",
        "jQuery",
        "React Native",
        "Flutter",
        "Pandas",
        "NumPy",
        "scikit-learn|sklearn",
        "TensorFlow",
        "PyTorch",
        "Keras",
        "Hugging Face|HuggingFace|Transformers",
        "LangChain",
        "OpenCV",
        "Spark|Apache Spark|PySpark",
        "Hadoop",
        "Celery",
        "Jest",
        "Pytest",
        "Selenium",
        "Cypress",
        "Playwright",
        "JUnit",
        "Matplotlib",
        "Seaborn",
        "Three.js",
        "D3.js|D3",
    ],
    "Cloud & DevOps": [
        "AWS|Amazon Web Services",
        "Azure|Microsoft Azure",
        "GCP|Google Cloud|Google Cloud Platform",
        "Docker",
        "Kubernetes|K8s",
        "Terraform",
        "Ansible",
        "Jenkins",
        "GitHub Actions",
        "GitLab CI",
        "CI/CD|continuous integration|continuous delivery",
        "Linux",
        "Nginx",
        "Serverless",
        "AWS Lambda",
        "EC2",
        "S3",
        "Heroku",
        "Vercel",
        "Netlify",
        "Firebase",
        "Prometheus",
        "Grafana",
        "Datadog",
        "Microservices|microservice",
        "REST APIs|REST|RESTful|REST API",
        "gRPC",
        "Observability",
        "Infrastructure as Code|IaC",
    ],
    "Data & databases": [
        "PostgreSQL|Postgres",
        "MySQL",
        "SQLite",
        "MongoDB|Mongo",
        "Redis",
        "Elasticsearch",
        "Cassandra",
        "DynamoDB",
        "Oracle",
        "SQL Server|MSSQL",
        "Snowflake",
        "BigQuery",
        "Redshift",
        "Databricks",
        "Airflow|Apache Airflow",
        "dbt",
        "Kafka|Apache Kafka",
        "ETL|ELT",
        "Data modeling|data modelling",
        "Data warehousing|data warehouse",
        "Power BI|PowerBI",
        "Tableau",
        "Looker",
        "Excel|Microsoft Excel|MS Excel",
        "Google Sheets",
        "Statistics|statistical analysis",
        "A/B testing|AB testing|experimentation",
        "Data visualization|data visualisation",
        "Data analysis|data analytics",
        "Machine learning|ML",
        "Deep learning",
        "NLP|natural language processing",
        "Computer vision",
        "LLMs|large language models|LLM",
        "Generative AI|GenAI",
        "Prompt engineering",
        "MLOps",
        "Feature engineering",
        "Time series",
        "Regression",
        "Forecasting",
    ],
    "Tools & practices": [
        "Git|version control",
        "GitHub",
        "GitLab",
        "Jira",
        "Confluence",
        "Figma",
        "Postman",
        "Agile",
        "Scrum",
        "Kanban",
        "Unit testing|unit tests",
        "Test automation|automated testing",
        "TDD|test-driven development",
        "Code review|code reviews",
        "System design",
        "Data structures|DSA|data structures and algorithms",
        "Algorithms",
        "Object-oriented programming|OOP",
        "Design patterns",
        "Debugging",
        "Performance optimization|performance tuning",
        "Accessibility|a11y|WCAG",
        "Responsive design",
        "UI design",
        "UX design|user experience",
        "User research",
        "Wireframing",
        "Prototyping",
        "SEO",
        "Google Analytics",
        "Security|application security|AppSec",
        "OAuth",
        "Authentication",
        "Networking",
        "Technical writing|documentation",
        "API design",
        "Distributed systems",
        "Caching",
        "Message queues",
    ],
    "Business & domain": [
        "Product management",
        "Roadmapping|product roadmap",
        "Requirements gathering",
        "Stakeholder management|stakeholder reporting",
        "Project management",
        "Budgeting",
        "Financial modeling|financial modelling",
        "Market research",
        "Digital marketing",
        "Content marketing",
        "Social media marketing",
        "CRM|Salesforce|HubSpot",
        "Sales",
        "Customer success",
        "Customer support",
        "Business analysis",
        "KPIs|key performance indicators",
        "Reporting",
        "Operations",
        "Supply chain",
        "Recruiting",
        "Accounting",
        "Compliance",
        "Risk management",
        "Negotiation",
        "Procurement",
        "Six Sigma|Lean Six Sigma",
        "ERP|SAP",
    ],
    "Professional skill": [
        "Communication|communication skills|verbal communication|written communication",
        "Leadership|team leadership",
        "Teamwork|collaboration|cross-functional collaboration",
        "Problem solving|problem-solving",
        "Mentoring|mentorship|coaching",
        "Time management",
        "Presentation|presentations|public speaking",
        "Critical thinking",
        "Adaptability",
        "Attention to detail",
        "Ownership",
        "Analytical skills|analytical thinking",
    ],
}

RELATED = {
    "React": ["Next.js", "React Native", "Redux", "JavaScript", "TypeScript"],
    "Next.js": ["React"],
    "JavaScript": ["TypeScript", "Node.js", "React", "Vue", "Angular"],
    "TypeScript": ["JavaScript"],
    "Node.js": ["Express", "NestJS", "JavaScript"],
    "Django": ["Python", "Django REST Framework", "Flask", "FastAPI"],
    "Flask": ["Python", "Django", "FastAPI"],
    "FastAPI": ["Python", "Flask", "Django"],
    "PostgreSQL": ["MySQL", "SQL", "SQLite", "SQL Server"],
    "MySQL": ["PostgreSQL", "SQL", "SQLite"],
    "SQL": ["PostgreSQL", "MySQL", "SQLite", "SQL Server", "BigQuery", "Snowflake"],
    "AWS": ["EC2", "S3", "AWS Lambda", "Azure", "GCP"],
    "Azure": ["AWS", "GCP"],
    "GCP": ["AWS", "Azure", "BigQuery"],
    "Kubernetes": ["Docker"],
    "Docker": ["Kubernetes"],
    "Machine learning": ["scikit-learn", "TensorFlow", "PyTorch", "Deep learning", "Regression"],
    "Deep learning": ["TensorFlow", "PyTorch", "Keras", "Machine learning"],
    "Data analysis": ["Pandas", "Excel", "SQL", "Statistics", "Power BI", "Tableau"],
    "Data visualization": ["Tableau", "Power BI", "Matplotlib", "D3.js", "Looker"],
    "CI/CD": ["GitHub Actions", "Jenkins", "GitLab CI"],
    "Test automation": ["Selenium", "Cypress", "Playwright", "Pytest", "Jest"],
    "Unit testing": ["Pytest", "Jest", "JUnit"],
    "Generative AI": ["LLMs", "Prompt engineering", "LangChain", "Hugging Face"],
    "LLMs": ["Generative AI", "Prompt engineering", "LangChain", "Hugging Face"],
    "Microservices": ["Docker", "Kubernetes", "REST APIs", "gRPC"],
    "Stakeholder management": ["Communication", "Reporting"],
    "Leadership": ["Mentoring"],
}

SOFT_CATEGORY = "Professional skill"


@lru_cache(maxsize=1)
def entries() -> list[tuple[str, str, re.Pattern]]:
    """Returns [(canonical, category, compiled pattern)] longest aliases first."""
    out = []
    for category, items in RAW.items():
        for item in items:
            names = item.split("|")
            canonical = names[0]
            aliases = sorted(set(names), key=len, reverse=True)
            parts = []
            for a in aliases:
                esc = re.escape(a)
                # single-letter languages (C, R) need stricter context to avoid false positives
                if len(a) == 1:
                    parts.append(rf"(?<![\w+#.]){esc}(?=\s*(?:,|/|\band\b|programming|language|\)|$))")
                else:
                    parts.append(rf"(?<![\w]){esc}(?![\w])" if a[-1].isalnum() else rf"(?<![\w]){esc}")
            flags = (
                0
                if canonical in {"Go", "R", "C", "Swift", "Rust", "Spring", "Express", "Node", "Lambda", "Excel"}
                else re.I
            )
            out.append((canonical, category, re.compile("|".join(parts), flags)))
    out.sort(key=lambda e: -len(e[0]))
    return out


def find_skills(text: str) -> list[str]:
    found = []
    for canonical, _cat, pattern in entries():
        if pattern.search(text):
            found.append(canonical)
    return found


def category_of(skill: str) -> str:
    for canonical, cat, _p in entries():
        if canonical.lower() == skill.lower():
            return cat
    return "Other"


def pattern_for(skill: str) -> re.Pattern:
    for canonical, _cat, p in entries():
        if canonical.lower() == skill.lower():
            return p
    return re.compile(rf"(?<!\w){re.escape(skill)}(?!\w)", re.I)


def related(skill: str) -> list[str]:
    return RELATED.get(skill, [])
