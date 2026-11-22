import { Building2, Compass, Scale, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";

const principles = [
  { icon: UserCheck, title: "You stay in control", text: "AI suggestions are drafts. Nothing changes your resume until you review and accept it." },
  { icon: ShieldCheck, title: "Facts are never invented", text: "We don't add employers, degrees, tools, dates or metrics you didn't give us. Missing details become clear placeholders and questions." },
  { icon: Scale, title: "Scores are explained", text: "Every estimate shows the categories, evidence and formula behind it, and what it can't tell you." },
  { icon: Compass, title: "Gaps are not judgements", text: "A missing keyword isn't proof you lack a skill. We ask you to verify, and help you plan learning separately from resume claims." },
];

export default function About() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-20">
      <p className="eyebrow">About Infyro</p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">A career-readiness workspace you can trust</h1>
      <p className="mt-5 text-lg leading-relaxed text-muted">
        Infyro AI Resume helps students, graduates and experienced professionals create accurate resumes, tailor them to real roles,
        understand gaps, prepare for interviews and stay organised — without handing decisions to an algorithm.
      </p>

      <h2 className="mt-16 text-2xl font-bold">How it works</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          ["Build or import", "Start from guided sections, or upload a PDF/DOCX and review the extracted content before creating a resume."],
          ["Check quality", "Deterministic checks look at structure, dates, readability and extraction risks. Each finding explains why it matters."],
          ["Match a job", "Paste a job description. Each requirement is mapped to evidence in your resume with snippets and section references."],
          ["Write with help", "The Writing Studio rewrites bullets and drafts summaries and cover letters from your facts — always as editable drafts."],
          ["Track & prepare", "Track applications with the exact resume version sent, practise interviews with a transparent rubric and plan skills."],
          ["Share safely", "Give a coach time-limited, revocable access when you want feedback. Export or delete your data any time."],
        ].map(([t, d], i) => (
          <li key={t} className="card p-5">
            <span className="font-display text-sm font-bold text-brand-fg">0{i + 1}</span>
            <h3 className="mt-1 font-semibold">{t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
          </li>
        ))}
      </ol>

      <section id="responsible-ai" className="mt-16 scroll-mt-24">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand-500" aria-hidden />
          <h2 className="text-2xl font-bold">Responsible AI</h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {principles.map((p) => (
            <div key={p.title} className="card p-5">
              <p.icon className="size-5 text-brand-500" aria-hidden />
              <h3 className="mt-3 font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.text}</p>
            </div>
          ))}
        </div>
        <div className="card mt-4 p-5 text-sm leading-relaxed text-muted">
          <p>
            <strong className="text-fg">What we don't do:</strong> infer protected or sensitive characteristics, make or automate hiring
            decisions, claim to know any employer's private screening rules, scrape job boards or submit applications on your behalf,
            or claim to have verified a repository or website we haven't checked.
          </p>
          <p className="mt-3">
            Uploaded documents and job descriptions are treated as untrusted content: instructions hidden inside them are ignored. Live
            AI is only used after you consent, and only the minimum text needed for each request is sent.
          </p>
        </div>
      </section>

      <section id="institutions" className="mt-16 scroll-mt-24">
        <div className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-fg">
            <Building2 className="size-6" aria-hidden />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">For colleges and placement teams</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Coordinators can invite students to a cohort and see progress summaries — only for students who opt in, and never their
              resume content. Coaches can review resumes only when a student shares a link.
            </p>
          </div>
          <LinkButton to="/register" variant="secondary">Create an account</LinkButton>
        </div>
      </section>
    </div>
  );
}
