import { Link } from "react-router-dom";
import * as Accordion from "@radix-ui/react-accordion";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Check,
  ChevronDown,
  CircleDashed,
  FileSearch,
  FileText,
  GraduationCap,
  KanbanSquare,
  Lock,
  MessagesSquare,
  PenLine,
  ScanText,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { ScaledPreview } from "@/components/resume/ResumePreview";
import { SAMPLE_RESUME } from "@/lib/sample";
import { PLANS } from "./Pricing";

const fade = { initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.5 } };

export default function Home() {
  return (
    <>
      <Hero />
      <LogosStrip />
      <FeatureGrid />
      <Workflow />
      <EvidenceShowcase />
      <Trust />
      <PricingTeaser />
      <FAQ />
      <FinalCTA />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(31_127_239/0.22),transparent)]" aria-hidden />
      <div className="pointer-events-none absolute right-[-10%] top-40 h-[380px] w-[380px] rounded-full bg-[radial-gradient(closest-side,rgb(122_92_255/0.16),transparent)]" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Link
            to="/about#responsible-ai"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pl-1 pr-3 text-xs font-medium text-fg-2 shadow-xs backdrop-blur transition hover:border-brand-300"
          >
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
            AI that never invents your experience
            <ArrowRight className="size-3.5" />
          </Link>
          <h1 className="mt-6 text-[40px] font-extrabold leading-[1.05] sm:text-[54px] lg:text-[60px]">
            Build a stronger resume.
            <br />
            <span className="text-gradient">Prove your skills.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
            Infyro connects your resume to the jobs you actually want — mapping every requirement to evidence you already have, then
            helping you tailor, apply and prepare for interviews. Every suggestion stays editable and grounded in your own facts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton to="/register" size="lg" iconRight={<ArrowRight className="size-4" />}>
              Start free
            </LinkButton>
            <LinkButton to="/features" size="lg" variant="secondary">
              Explore features
            </LinkButton>
          </div>
          <ul className="mt-8 grid max-w-lg gap-x-6 gap-y-2 text-sm text-fg-2 sm:grid-cols-2">
            {["Explainable quality estimates", "Evidence-based job matching", "Text-selectable PDF export", "Works without an AI key"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="size-4 text-success" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </motion.div>
        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, delay: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
      className="relative mx-auto w-full max-w-[560px]"
      aria-label="Product preview with sample data"
    >
      <div className="absolute -inset-4 -z-10 rounded-[28px] bg-gradient-to-br from-brand-500/20 via-transparent to-violet-accent/20 blur-2xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lift)]">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-rose-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-2 text-xs font-medium text-muted">Resume editor</span>
          <span className="ml-auto rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Sample</span>
        </div>
        <div className="grid grid-cols-[1fr_1.15fr]">
          <div className="space-y-3 border-r border-line p-4">
            {["Summary", "Experience", "Projects", "Skills", "Education"].map((s, i) => (
              <div key={s} className={`rounded-lg border px-3 py-2 text-xs ${i === 1 ? "border-brand-400 bg-brand-soft" : "border-line bg-surface-2"}`}>
                <p className="font-semibold">{s}</p>
                {i === 1 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="h-1.5 w-11/12 rounded bg-brand-300/60" />
                    <div className="h-1.5 w-9/12 rounded bg-brand-300/60" />
                    <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-brand-fg ring-1 ring-brand-500/20">
                      <Sparkles className="size-3" /> Improve bullet
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="bg-surface-3 p-3">
            <ScaledPreview content={SAMPLE_RESUME} style={{ font: "sans", accent: "#1f6fe0", heading: "accent-bar", density: "comfortable", align: "left", name_size: 23 }} showBreaks={false} />
          </div>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6 }}
        className="absolute -left-4 bottom-10 hidden w-56 rounded-xl border border-line bg-surface p-3.5 shadow-[var(--shadow-lift)] sm:block lg:-left-10"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Job match · example</p>
        <div className="mt-2 space-y-1.5 text-xs">
          {[
            ["Python", "Demonstrated", "text-success"],
            ["PostgreSQL", "Demonstrated", "text-success"],
            ["Kubernetes", "Verify", "text-warning"],
            ["AWS", "Not found", "text-muted"],
          ].map(([skill, st, c]) => (
            <div key={skill} className="flex justify-between">
              <span className="font-medium">{skill}</span>
              <span className={c}>{st}</span>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.75 }}
        className="absolute -right-3 top-16 hidden rounded-xl border border-line bg-surface px-3.5 py-3 shadow-[var(--shadow-lift)] sm:block lg:-right-8"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Quality estimate</p>
        <p className="mt-0.5 font-display text-2xl font-bold">
          82<span className="text-sm font-medium text-muted">/100</span>
        </p>
        <p className="text-[11px] text-muted">Example · explained by 4 categories</p>
      </motion.div>
    </motion.div>
  );
}

function LogosStrip() {
  return (
    <section className="border-y border-line bg-surface/60">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 text-sm text-muted sm:px-6">
        <span className="font-medium text-fg-2">Built for</span>
        {["Students", "Freshers", "Experienced professionals", "Career coaches", "Placement teams"].map((t) => (
          <span key={t} className="flex items-center gap-2">
            <CircleDashed className="size-3.5 text-brand-400" aria-hidden /> {t}
          </span>
        ))}
      </div>
    </section>
  );
}

export const FEATURES = [
  { icon: FileText, title: "Guided resume builder", text: "Structured sections, drag-and-drop ordering, live preview with page breaks, autosave and full version history." },
  { icon: PenLine, title: "AI Writing Studio", text: "Rewrite bullets as action → task → result, draft summaries and project descriptions — always as editable drafts." },
  { icon: ScanText, title: "Resume health check", text: "Section, date, readability and extraction checks with prioritised fixes and a transparent score formula." },
  { icon: Target, title: "Job match intelligence", text: "Map each job requirement to evidence in your resume: demonstrated, partial, needs verification or not found." },
  { icon: KanbanSquare, title: "Application tracker", text: "Board and list views, status history, deadlines, contacts and the exact resume version you sent." },
  { icon: MessagesSquare, title: "Interview copilot", text: "Questions from the real job description, STAR answer builder and a transparent five-part rubric." },
  { icon: GraduationCap, title: "Skill gap planner", text: "Turn gaps into milestones and portfolio projects — separate from what you can claim today." },
  { icon: BookOpenCheck, title: "Portfolio assistant", text: "Case-study outlines, README drafts and an evidence checklist for the projects that prove your skills." },
];

function FeatureGrid() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <motion.div {...fade} className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">One connected workspace</p>
        <h2 className="mt-3 text-3xl font-bold sm:text-4xl">From blank page to interview-ready</h2>
        <p className="mt-4 text-muted">Stop juggling separate tools. Your resume, job descriptions, applications and practice live together and inform each other.</p>
      </motion.div>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            {...fade}
            transition={{ duration: 0.45, delay: i * 0.04 }}
            className="group card relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent opacity-0 transition group-hover:opacity-100" aria-hidden />
            <div className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-fg">
              <f.icon className="size-5" aria-hidden />
            </div>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Workflow() {
  const steps = [
    { icon: Upload, title: "Start or import", text: "Build from guided sections or upload a PDF/DOCX. Review what we extracted before anything is saved." },
    { icon: FileSearch, title: "Check & improve", text: "Run a health check, fix prioritised findings, and rewrite weak bullets with the Writing Studio." },
    { icon: Target, title: "Tailor to a job", text: "Paste a job description. See evidence for each requirement and a truthful tailoring checklist." },
    { icon: BadgeCheck, title: "Apply & prepare", text: "Export a role-specific version, track the application and practise the questions you'll likely get." },
  ];
  return (
    <section className="relative border-y border-line bg-surface/50 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div {...fade} className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">A workflow, not just a template</h2>
        </motion.div>
        <ol className="mt-12 grid gap-6 md:grid-cols-4">
          {steps.map((s, i) => (
            <motion.li key={s.title} {...fade} transition={{ delay: i * 0.08, duration: 0.45 }} className="relative">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full border border-brand-500/30 bg-surface font-display text-sm font-bold text-brand-fg shadow-xs">
                  {i + 1}
                </span>
                {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-gradient-to-r from-brand-400/50 to-transparent md:block" aria-hidden />}
              </div>
              <s.icon className="mt-5 size-5 text-brand-500" aria-hidden />
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function EvidenceShowcase() {
  const rows = [
    { req: "2+ years with Python and Django", st: "Partially demonstrated", tone: "bg-amber-500", ev: "“Built an event ingestion API in Python…” · Experience" },
    { req: "Strong SQL with PostgreSQL", st: "Demonstrated", tone: "bg-emerald-500", ev: "“Rewrote a slow shipment report query…” · Experience" },
    { req: "Kubernetes (nice to have)", st: "Requires your verification", tone: "bg-sky-500", ev: "Related evidence: Docker — confirm whether this covers it" },
    { req: "AWS experience (nice to have)", st: "Not found in resume", tone: "bg-slate-400", ev: "Not proof you lack it — add only if you can show it" },
  ];
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
      <motion.div {...fade}>
        <p className="eyebrow">Job Match Intelligence</p>
        <h2 className="mt-3 text-3xl font-bold sm:text-4xl">See the evidence behind every match</h2>
        <p className="mt-4 leading-relaxed text-muted">
          Most tools count keywords and hand you a number. Infyro shows you which requirements your resume actually evidences — with the
          exact snippet — and which ones you should verify. A missing keyword is never treated as proof you lack a skill.
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          {["Required vs. preferred, only when the job description says so", "Tailoring checklist with “only if true” wording suggestions", "Compare two job descriptions side by side"].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </motion.div>
      <motion.div {...fade} className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <p className="text-sm font-semibold">Backend Engineer · Example Co.</p>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Illustrative example</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.req} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{r.req}</p>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                  <span className={`size-2 rounded-full ${r.tone}`} aria-hidden /> {r.st}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{r.ev}</p>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}

function Trust() {
  const items = [
    { icon: ShieldCheck, title: "Your facts, never invented", text: "AI drafts are labelled, editable and checked: unsupported numbers are replaced with placeholders and unfamiliar skills are flagged." },
    { icon: Lock, title: "Private by default", text: "Files are stored privately and downloaded through short-lived signed links. Share a resume only when you choose, and revoke it any time." },
    { icon: Sparkles, title: "AI with consent", text: "Nothing is sent to an external AI provider until you opt in. Without it, a transparent offline assistant still helps." },
    { icon: BadgeCheck, title: "Scores you can understand", text: "Quality and match estimates show their formula and evidence. They never promise shortlisting, interviews or offers." },
  ];
  return (
    <section className="relative overflow-hidden bg-ink py-24 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_0%,rgb(31_127_239/0.35),transparent_45%),radial-gradient(circle_at_90%_100%,rgb(122_92_255/0.3),transparent_45%)]" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div {...fade} className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">Trust & privacy</p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Responsible by design</h2>
          <p className="mt-4 text-slate-300">Your career data is personal. We built Infyro around user control, transparency and honest limits on what AI can do.</p>
        </motion.div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <motion.div key={it.title} {...fade} transition={{ delay: i * 0.06, duration: 0.45 }} className="rounded-xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
              <it.icon className="size-5 text-brand-300" aria-hidden />
              <h3 className="mt-4 font-semibold text-white">{it.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{it.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <motion.div {...fade} className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Plans</p>
        <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Start free. Grow when you need to.</h2>
        <p className="mt-3 text-sm text-muted">Plan details and prices are placeholders until validated with user research.</p>
      </motion.div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {PLANS.slice(0, 3).map((p) => (
          <div key={p.name} className={`card p-6 ${p.highlight ? "ring-2 ring-brand-500" : ""}`}>
            <p className="font-semibold">{p.name}</p>
            <p className="mt-1 text-sm text-muted">{p.audience}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {p.features.slice(0, 4).map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden /> {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <LinkButton to="/pricing" variant="secondary" iconRight={<ArrowRight className="size-4" />}>
          Compare all plans
        </LinkButton>
      </div>
    </section>
  );
}

export const FAQS = [
  ["Will Infyro make up achievements or skills?", "No. AI suggestions are drafts grounded in what you provide. Numbers that don't appear in your input are replaced with a visible placeholder, unfamiliar skills are flagged, and nothing is saved until you accept it."],
  ["Does a high score mean I'll get an interview?", "No. Scores are estimates of resume quality and job-description coverage based on documented rules. They don't reproduce any employer's screening system and can't predict hiring decisions."],
  ["Do I need an AI subscription or API key?", "No. Without an AI provider, Infyro uses a transparent rule-based assistant. If your workspace has AI enabled, you choose whether to send content to it."],
  ["Can I import my existing resume?", "Yes — upload a PDF or DOCX. You'll see the extracted text and proposed sections, correct anything, and only then create a new resume. Existing resumes are never overwritten."],
  ["Who can see my resume?", "Only you. You can create time-limited, revocable share links for a coach or reviewer, and choose whether contact details are included."],
  ["Can I delete my data?", "Yes. Export everything as a ZIP or permanently delete your account from Settings. Retention exceptions (anonymised audit records, backups) are disclosed there."],
] as const;

function FAQ() {
  return (
    <section className="border-t border-line bg-surface/50 py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold">Questions, answered</h2>
        <Accordion.Root type="single" collapsible className="mt-10 space-y-3">
          {FAQS.map(([q, a]) => (
            <Accordion.Item key={q} value={q} className="card overflow-hidden">
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-muted transition group-data-[state=open]:rotate-180" aria-hidden />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="px-5 pb-4 text-sm leading-relaxed text-muted">{a}</Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500 to-[#4b5cf0] px-6 py-14 text-center text-white shadow-[var(--shadow-glow)] sm:px-12">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden />
        <h2 className="relative text-3xl font-bold text-white sm:text-4xl">Prepare for your next opportunity</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-white/85">Create your free account and build a resume you can stand behind — every word yours.</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton to="/register" size="lg" variant="dark" iconRight={<ArrowRight className="size-4" />}>
            Create free account
          </LinkButton>
          <LinkButton to="/templates" size="lg" className="bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20">
            Browse templates
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
