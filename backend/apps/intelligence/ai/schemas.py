"""Structured output schemas. Every AI response (live model or offline
assistant) must validate against one of these before it reaches the user."""

from typing import Literal

from pydantic import BaseModel, Field

Short = Field(max_length=700)


class Suggestion(BaseModel):
    text: str = Field(max_length=700)
    rationale: str = Field(default="", max_length=300)


class SummaryOut(BaseModel):
    drafts: list[Suggestion] = Field(min_length=1, max_length=3)
    questions: list[str] = Field(default_factory=list, max_length=5)


class BulletOut(BaseModel):
    suggestions: list[Suggestion] = Field(min_length=1, max_length=4)
    questions: list[str] = Field(default_factory=list, max_length=5)


class ProjectOut(BaseModel):
    description: str = Field(max_length=900)
    bullets: list[str] = Field(default_factory=list, max_length=5)
    questions: list[str] = Field(default_factory=list, max_length=5)


class AchievementOut(BaseModel):
    statement: str = Field(max_length=700)
    context: str = Field(default="", max_length=300)
    action: str = Field(default="", max_length=300)
    result: str = Field(default="", max_length=300)
    questions: list[str] = Field(default_factory=list, max_length=5)


class VerbSuggestion(BaseModel):
    verb: str = Field(max_length=30)
    example: str = Field(default="", max_length=300)


class VerbsOut(BaseModel):
    verbs: list[VerbSuggestion] = Field(max_length=12)


class ProofIssue(BaseModel):
    type: Literal["spelling", "grammar", "repetition", "tense", "consistency", "style"]
    excerpt: str = Field(max_length=200)
    suggestion: str = Field(default="", max_length=300)
    explanation: str = Field(default="", max_length=300)


class ProofreadOut(BaseModel):
    issues: list[ProofIssue] = Field(max_length=40)


class CoverLetterOut(BaseModel):
    greeting: str = Field(max_length=120)
    paragraphs: list[str] = Field(min_length=2, max_length=6)
    closing: str = Field(max_length=200)
    questions: list[str] = Field(default_factory=list, max_length=5)


class InterviewQuestion(BaseModel):
    category: Literal["technical", "behavioral", "role"]
    text: str = Field(max_length=400)
    why: str = Field(default="", max_length=300)
    follow_ups: list[str] = Field(default_factory=list, max_length=3)


class QuestionsOut(BaseModel):
    questions: list[InterviewQuestion] = Field(min_length=1, max_length=15)


class StarOut(BaseModel):
    situation: str = Field(default="", max_length=600)
    task: str = Field(default="", max_length=600)
    action: str = Field(default="", max_length=900)
    result: str = Field(default="", max_length=600)
    missing: list[str] = Field(default_factory=list, max_length=5)


class FeedbackOut(BaseModel):
    summary: str = Field(max_length=600)
    strengths: list[str] = Field(default_factory=list, max_length=5)
    improvements: list[str] = Field(default_factory=list, max_length=5)
    follow_ups: list[str] = Field(default_factory=list, max_length=3)


class DocSection(BaseModel):
    heading: str = Field(max_length=120)
    body: str = Field(max_length=1500)


class DocumentOut(BaseModel):
    title: str = Field(max_length=160)
    sections: list[DocSection] = Field(min_length=1, max_length=12)
    questions: list[str] = Field(default_factory=list, max_length=5)


class BulletsOut(BaseModel):
    bullets: list[str] = Field(min_length=1, max_length=6)
    questions: list[str] = Field(default_factory=list, max_length=5)


class LearningOut(BaseModel):
    milestones: list[str] = Field(max_length=6)
    practice_tasks: list[str] = Field(max_length=6)
    project_ideas: list[str] = Field(max_length=4)
