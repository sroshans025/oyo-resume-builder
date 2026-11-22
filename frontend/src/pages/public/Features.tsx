import { ArrowRight, Check } from "lucide-react";
import { motion } from "framer-motion";
import { LinkButton } from "@/components/ui/Button";
import { FEATURES } from "./Home";

const DETAILS: Record<string, string[]> = {
  "Guided resume builder": ["Personal details with privacy controls", "Summary, skills, experience, education, projects, certifications", "Optional awards, volunteering, publications, languages", "Drag-and-drop section order, duplicate for each role", "Version history, restore and side-by-side compare"],
  "AI Writing Studio": ["Professional summaries from your resume facts", "Bullet rewrites with action + task + result", "Project descriptions: problem, approach, tools, outcome", "Achievement builder that asks for real metrics", "Grammar, repetition, tense and consistency review"],
  "Resume health check": ["Section completeness and recognisable headings", "Date formats, overlaps and likely typos", "Long paragraphs, dense bullets, repeated phrases", "Extraction warnings for uploaded PDFs/DOCX", "Machine-readable text preview"],
  "Job match intelligence": ["Required vs. preferred (only when stated)", "Evidence snippets with section references", "Four honest statuses including “needs verification”", "Tailoring checklist and compare two JDs", "Separate from the resume quality estimate"],
  "Application tracker": ["Nine pipeline stages from Interested to Archived", "Board and list views with search and filters", "Timeline of every status change and interview", "Linked resume version and cover letter", "Follow-up reminders and weekly goals"],
  "Interview copilot": ["Technical, behavioural and role-specific questions", "STAR answer builder", "Optional timed practice", "Rubric: relevance, structure, evidence, clarity, completeness", "Practice history and saved drafts"],
  "Skill gap planner": ["Checklist from a job description or match", "Demonstrated, learning or not currently held", "Milestones, practice tasks and project ideas", "Links to projects and certificates", "Clear line between learning and resume claims"],
  "Portfolio assistant": ["GitHub, demo and portfolio links", "Case-study outlines", "README and presentation drafts", "Resume bullets you can add in one click", "Evidence checklist — no false “verified” claims"],
};

export default function Features() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="max-w-3xl">
        <p className="eyebrow">Features</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Everything between “blank page” and “offer”</h1>
        <p className="mt-4 text-lg text-muted">Infyro connects resume writing with the practical work of a job search, so each step improves the next.</p>
      </div>
      <div className="mt-14 space-y-4">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.02 * i }}
            className="card grid gap-6 p-6 md:grid-cols-[1fr_1.4fr] md:p-8"
          >
            <div>
              <div className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-fg">
                <f.icon className="size-5" aria-hidden />
              </div>
              <h2 className="mt-4 text-xl font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
            <ul className="grid content-start gap-2.5 sm:grid-cols-2">
              {DETAILS[f.title]?.map((d) => (
                <li key={d} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {d}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
      <div className="mt-14 text-center">
        <LinkButton to="/register" size="lg" iconRight={<ArrowRight className="size-4" />}>
          Try it free
        </LinkButton>
      </div>
    </div>
  );
}
