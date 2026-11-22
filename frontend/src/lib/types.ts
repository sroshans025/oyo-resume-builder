export type Role = "user" | "coach" | "coordinator" | "admin";

export interface Profile {
  headline: string;
  preferred_roles: string[];
  experience_level: "" | "student" | "fresher" | "early" | "mid" | "senior" | "career_changer";
  location: string;
  preferred_locations: string[];
  portfolio_url: string;
  github_url: string;
  linkedin_url: string;
  strengths: string[];
  learning_goals: string[];
  preferred_workflow: "" | "build" | "upload" | "tailor" | "prepare";
  writing_style: string;
  onboarding_completed: boolean;
  ai_consent: boolean;
  ai_consent_at: string | null;
  show_contact_in_shares: boolean;
  notify_in_app: boolean;
  notify_email_reminders: boolean;
  notify_product_updates: boolean;
  followup_days: number;
  weekly_application_goal: number;
  upload_retention_days: number;
  completion: { percent: number; checks: Record<string, boolean> };
  updated_at: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_demo: boolean;
  date_joined: string;
  profile: Profile;
}

/* ---- Resume content ---------------------------------------------------- */
export type SectionType =
  | "summary" | "skills" | "experience" | "education" | "projects" | "certifications"
  | "awards" | "volunteering" | "publications" | "languages" | "custom";

export interface Link { label: string; url: string }
export interface Personal {
  full_name: string; headline: string; email: string; phone: string; location: string; links: Link[];
  show_email: boolean; show_phone: boolean; show_location: boolean;
}
export interface SkillGroup { id: string; name: string; skills: string[] }
export type Item = Record<string, any> & { id: string };
export interface Section {
  key: string; type: SectionType; title: string; visible: boolean;
  data: { text?: string; groups?: SkillGroup[]; items?: Item[] };
}
export interface ResumeContent { personal: Personal; sections: Section[] }

export interface TemplateStyle {
  font: "sans" | "serif"; accent: string; heading: "caps-rule" | "accent-bar" | "bold" | "small-caps";
  density: "comfortable" | "compact"; align: "left" | "center"; name_size: number;
}
export interface Template {
  slug: string; name: string; category: string; description: string; best_for: string;
  readability_notes: string; ats_notes: string; style: TemplateStyle;
}

export interface ResumeSummary {
  id: number; title: string; target_role: string; template: string; status: "draft" | "ready" | "archived";
  source: string; revision: number; copied_from: number | null;
  latest_version: { id: number; number: number; created_at: string; reason: string } | null;
  section_count: number; latest_score: { report_id: number; quality_score: number } | null;
  created_at: string; updated_at: string;
}
export interface Resume extends ResumeSummary { content: ResumeContent }

export interface Version {
  id: number; number: number; label: string; change_summary: string; reason: string; reason_label: string;
  template_slug: string; created_at: string; content?: ResumeContent;
}

/* ---- AI ---------------------------------------------------------------- */
export interface AIResult<T> {
  mode: "ai" | "offline"; provider: string; model: string | null; prompt_version?: string; label: string;
  result: T; warnings: { code: string; message: string; skills?: string[] }[];
  notice: { code: string; message: string } | null; log_id: number | null;
}
export interface AIStatus {
  ok: boolean; mode: "ai" | "offline"; label: string; model: string | null; note: string; external: boolean;
  consent: boolean; usage: { used: number; limit: number };
}

/* ---- Analysis ---------------------------------------------------------- */
export interface Finding {
  id: string; code: string; category: string; severity: "high" | "medium" | "low" | "info";
  title: string; explanation: string; recommendation: string; evidence: string[]; section: string | null; priority: number;
}
export interface Category {
  key: string; label: string; description: string; weight: number; score: number | null; deduction: number;
  findings: number; assessed: boolean; note: string;
}
export type EvidenceStatus = "demonstrated" | "partial" | "verify" | "not_found";
export interface Requirement {
  id: string; text: string; kind: "required" | "preferred" | "unspecified"; skills: string[];
  category: string; years: number | null; status: EvidenceStatus; status_label: string;
  skill_status: Record<string, EvidenceStatus>;
  evidence: { section: string; location: string; snippet: string; term: string }[]; notes: string[];
}
export interface ChecklistItem {
  id: string; priority: "high" | "medium" | "low"; text: string; detail: string; done: boolean;
  suggested_edit: { before: string; after: string; only_if_true: boolean } | null;
}
export interface Report {
  id: number; kind: "health" | "match" | "upload"; resume: number | null; resume_title: string | null;
  resume_version: number | null; version_number: number | null; job_description: number | null;
  job_title: string | null; job_company: string | null; upload: number | null; upload_name: string | null;
  quality_score: number | null; match_score: number | null; finding_count: number; created_at: string;
  categories?: Category[]; findings?: Finding[]; strengths?: string[]; requirements?: Requirement[];
  checklist?: ChecklistItem[]; summary?: Record<string, any>; extracted_preview?: string;
  resolved_findings?: string[]; rules_version?: string;
}
export interface JobDescription {
  id: number; title: string; company: string; source_url: string; text?: string; display_title: string;
  parsed?: ParsedJD; created_at: string; updated_at: string;
}
export interface ParsedJD {
  role_title: string; responsibilities: string[];
  requirements: Omit<Requirement, "status" | "status_label" | "evidence" | "notes" | "skill_status">[];
  skills: { required: string[]; preferred: string[]; unspecified: string[] };
  skill_mentions: Record<string, number>; distinction_supported: boolean; warnings: string[];
}

/* ---- Workspace ----------------------------------------------------------- */
export type AppStatus =
  | "interested" | "preparing" | "applied" | "assessment" | "interview" | "offer" | "rejected" | "withdrawn" | "archived";
export interface Application {
  id: number; company: string; role: string; job_url: string; location: string; work_mode: "" | "onsite" | "hybrid" | "remote";
  status: AppStatus; status_label: string; saved_on: string; applied_on: string | null; deadline: string | null;
  salary_note: string; recruiter_name: string; recruiter_email: string; recruiter_phone: string; notes: string;
  next_action: string; next_action_date: string | null; resume_version: number | null; resume_label: string | null;
  cover_letter: number | null; cover_letter_title: string | null; job_description: number | null; position: number;
  open_reminders: number; created_at: string; updated_at: string;
}
export interface AppEvent {
  id: number; kind: string; kind_label: string; title: string; from_status: string; to_status: string;
  occurs_at: string | null; note: string; created_at: string;
}
export interface Reminder {
  id: number; application: number | null; application_label: string | null; title: string; due_at: string;
  done: boolean; kind: string; created_at: string;
}
export interface Notification { id: number; kind: string; title: string; body: string; link: string; read: boolean; created_at: string }
export interface CoverLetter {
  id: number; title: string; company: string; role: string; tone: string; resume: number | null; resume_title: string | null;
  job_description: number | null; job_title: string | null; hiring_manager: string; motivation: string; body: string;
  word_count: number; created_at: string; updated_at: string;
}

/* ---- Documents ---------------------------------------------------------- */
export interface Upload {
  id: number; original_name: string; file_type: "pdf" | "docx"; size: number;
  status: "pending" | "processing" | "parsed" | "needs_review" | "failed"; page_count: number; confidence: number;
  warnings: { code: string; severity: string; title: string; detail: string }[]; error: string; attempts: number;
  retain_until: string | null; imported_resume: number | null; imported_resume_title: string | null;
  created_at: string; updated_at: string; extracted_text?: string; parsed?: ResumeContent;
}
export interface GeneratedFile {
  id: number; kind: string; kind_label: string; title: string; filename: string; mime_type: string; size: number;
  page_count: number; resume: number | null; resume_title: string | null; resume_version: number | null;
  version_number: number | null; cover_letter: number | null; cover_letter_title: string | null;
  expires_at: string | null; created_at: string;
}

/* ---- Career -------------------------------------------------------------- */
export interface RubricCriterion { key: string; label: string; score: number; note: string; tip: string }
export interface Answer {
  id: number; question: number; text: string; star: Record<string, string>;
  rubric: { criteria: RubricCriterion[]; total: number; max: number; star_detected: Record<string, boolean>;
    needs_concrete_example: boolean; follow_ups: string[]; disclaimer: string };
  feedback: { summary: string; strengths: string[]; improvements: string[]; follow_ups: string[]; mode: string; provider: string;
    notice: { code: string; message: string } | null };
  duration_seconds: number | null; favourite: boolean; created_at: string; updated_at: string;
}
export interface Question {
  id: number; order: number; category: "technical" | "behavioral" | "role"; text: string; why: string;
  follow_ups: string[]; source: string; latest_answer: Answer | null; attempts: number;
}
export interface InterviewSession {
  id: number; title: string; target_role: string; job_description: number | null; job_title: string | null;
  resume: number | null; mode: "practice" | "mock"; timed: boolean; seconds_per_question: number; generated_by: string;
  answered_count: number; question_count: number; created_at: string; updated_at: string; questions?: Question[];
}
export interface Milestone { id: string; title: string; done: boolean; due: string | null }
export interface PlanItem {
  id: number; plan: number; skill: string; category: string; importance: string;
  status: "demonstrated" | "learning" | "not_held"; milestones: Milestone[]; practice_tasks: string[];
  project_ideas: string[]; evidence_links: Link[]; linked_project: number | null; linked_project_title: string | null;
  target_date: string | null; completed_at: string | null; order: number; progress: number; can_claim_on_resume: boolean;
}
export interface LearningPlan {
  id: number; title: string; target_role: string; job_description: number | null; notes: string; items: PlanItem[];
  progress: { percent: number; demonstrated: number; learning: number; not_held: number; total: number };
  created_at: string; updated_at: string;
}
export interface PortfolioProject {
  id: number; title: string; kind: string; summary: string; role: string; problem: string; users: string; approach: string;
  architecture: string; tools: string[]; results: string; lessons: string; github_url: string; demo_url: string;
  portfolio_url: string; evidence: { label: string; done: boolean }[]; drafts: Record<string, any>;
  link_verification: string; created_at: string; updated_at: string;
}
