import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  FilePlus2,
  FileText,
  GraduationCap,
  MessagesSquare,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { useUser } from "@/lib/auth";
import { cn, daysUntil, formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { Card, CardHeader, PageHeader } from "@/components/ui/Layout";
import { Badge, ErrorState, ProgressBar, Skeleton } from "@/components/ui/Feedback";
import { LinkButton } from "@/components/ui/Button";
import { BarList } from "@/components/ui/BarList";

interface DashboardData {
  profile: { completion: { percent: number; checks: Record<string, boolean> }; onboarding_completed: boolean; preferred_roles: string[] };
  resumes: { id: number; title: string; target_role: string; template: string; status: string; updated_at: string; latest_version: number | null }[];
  reports: { id: number; kind: string; resume_title: string | null; job_title: string | null; quality_score: number | null; match_score: number | null; created_at: string }[];
  pipeline: Record<string, number>;
  applications_total: number;
  upcoming: { id: number; title: string; due_at: string; kind: string; application: number | null }[];
  deadlines: { id: number; company: string; role: string; deadline: string; status: string }[];
  interview: { sessions: { id: number; title: string; updated_at: string; answered: number }[] };
  skills: { plans: number; items: number; completed: number };
  next_actions: { id: string; title: string; href: string; reason: string }[];
}

const STAGES: [string, string][] = [
  ["interested", "Interested"], ["preparing", "Preparing"], ["applied", "Applied"], ["assessment", "Assessment"], ["interview", "Interview"], ["offer", "Offer"],
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const user = useUser();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardData>("/dashboard/") });
  const first = user.full_name.split(" ")[0];

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const isNew = d && d.resumes.length === 0 && d.applications_total === 0 && d.reports.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting()}${first ? `, ${first}` : ""}`}
        description={isNew ? "Let's get your first resume in shape. Everything below fills in as you work." : "Here's where your job search stands today."}
        actions={
          <>
            <LinkButton to="/app/resumes?upload=1" variant="secondary" icon={<Upload className="size-4" />}>Import resume</LinkButton>
            <LinkButton to="/app/resumes?new=1" icon={<FilePlus2 className="size-4" />}>New resume</LinkButton>
          </>
        }
      />

      {!d ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : isNew ? (
        <NewUserStart profilePercent={d.profile.completion.percent} onboarded={d.profile.onboarding_completed} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {d.next_actions.length > 0 && (
              <Card className="overflow-hidden">
                <CardHeader title="Next best actions" description="Suggested from your saved data — nothing here is automatic." />
                <ul className="divide-y divide-line">
                  {d.next_actions.map((a) => (
                    <li key={a.id}>
                      <Link to={a.href} className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2">
                        <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand-fg"><Sparkles className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{a.title}</span>
                          <span className="block text-xs text-muted">{a.reason}</span>
                        </span>
                        <ArrowRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-fg" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <CardHeader title="Your resumes" action={<Link to="/app/resumes" className="text-sm font-medium text-brand-fg">View all</Link>} />
              {d.resumes.length === 0 ? (
                <div className="p-5 text-sm text-muted">No resumes yet. <Link to="/app/resumes?new=1" className="font-medium text-brand-fg">Create one</Link>.</div>
              ) : (
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {d.resumes.map((r) => (
                    <Link key={r.id} to={`/app/resumes/${r.id}`} className="group rounded-xl border border-line bg-surface-2 p-4 transition hover:border-brand-300 hover:bg-surface">
                      <div className="flex items-start justify-between gap-2">
                        <FileText className="size-5 text-brand-500" />
                        <Badge tone={r.status === "ready" ? "success" : "neutral"}>{r.status}</Badge>
                      </div>
                      <p className="mt-3 truncate font-medium">{r.title}</p>
                      <p className="truncate text-xs text-muted">{r.target_role || "No target role"} · {r.latest_version ? `v${r.latest_version}` : "no saved version"}</p>
                      <p className="mt-2 text-[11px] text-faint">Edited {relativeTime(r.updated_at)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Recent analysis" action={<Link to="/app/analysis" className="text-sm font-medium text-brand-fg">All reports</Link>} />
              {d.reports.length === 0 ? (
                <div className="p-5 text-sm text-muted">Run a health check or job match to see results here.</div>
              ) : (
                <ul className="divide-y divide-line">
                  {d.reports.map((r) => (
                    <li key={r.id}>
                      <Link to={`/app/reports/${r.id}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-surface-2">
                        <span className={cn("grid size-9 place-items-center rounded-lg", r.kind === "match" ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10" : "bg-brand-soft text-brand-fg")}>
                          {r.kind === "match" ? <Target className="size-4" /> : <Activity className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.kind === "match" ? `Match: ${r.job_title}` : `Health check: ${r.resume_title ?? "uploaded file"}`}</span>
                          <span className="block text-xs text-muted">{formatDateTime(r.created_at)}</span>
                        </span>
                        <span className="text-right">
                          <span className="block font-display text-lg font-bold tabular-nums">{r.kind === "match" ? r.match_score : r.quality_score}</span>
                          <span className="block text-[10px] uppercase tracking-wide text-muted">{r.kind === "match" ? "match est." : "quality est."}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            {!d.profile.onboarding_completed || d.profile.completion.percent < 100 ? (
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Profile completion</p>
                  <span className="text-sm font-semibold tabular-nums">{d.profile.completion.percent}%</span>
                </div>
                <ProgressBar value={d.profile.completion.percent} className="mt-3" label="Profile completion" />
                <p className="mt-3 text-xs text-muted">A complete profile helps tailor summaries, questions and suggestions.</p>
                <LinkButton to={d.profile.onboarding_completed ? "/app/profile" : "/app/onboarding"} variant="secondary" size="sm" className="mt-4 w-full">Complete profile</LinkButton>
              </Card>
            ) : null}

            <Card>
              <CardHeader title="Application pipeline" description={`${d.applications_total} tracked`} action={<Link to="/app/applications" className="text-sm font-medium text-brand-fg">Open</Link>} />
              <div className="p-5">
                <BarList
                  rows={STAGES.map(([k, l]) => ({ label: l, value: d.pipeline[k] ?? 0, to: `/app/applications?status=${k}` }))}
                  emptyLabel="No active applications yet."
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Coming up" description="Next 14 days" />
              <ul className="divide-y divide-line">
                {d.deadlines.length === 0 && d.upcoming.length === 0 && <li className="px-5 py-6 text-sm text-muted">No deadlines or reminders in the next two weeks.</li>}
                {d.deadlines.map((x) => {
                  const days = daysUntil(x.deadline);
                  return (
                    <li key={`d${x.id}`}>
                      <Link to={`/app/applications?open=${x.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                        <CalendarClock className="size-4 text-warning" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{x.company} deadline</span>
                          <span className="block truncate text-xs text-muted">{x.role}</span>
                        </span>
                        <Badge tone={days != null && days <= 3 ? "warning" : "neutral"}>{days === 0 ? "Today" : `${days}d`}</Badge>
                      </Link>
                    </li>
                  );
                })}
                {d.upcoming.map((r) => (
                  <li key={`r${r.id}`}>
                    <Link to={r.application ? `/app/applications?open=${r.application}` : "/app/applications"} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                      <CalendarClock className="size-4 text-brand-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="block text-xs text-muted">{formatDateTime(r.due_at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Link to="/app/interview" className="card group p-4 transition hover:-translate-y-0.5">
                <MessagesSquare className="size-5 text-brand-500" />
                <p className="mt-3 text-sm font-semibold">Interview practice</p>
                <p className="mt-0.5 text-xs text-muted">{d.interview.sessions.length ? `${d.interview.sessions.length} recent session(s)` : "Start a session"}</p>
              </Link>
              <Link to="/app/skills" className="card group p-4 transition hover:-translate-y-0.5">
                <GraduationCap className="size-5 text-brand-500" />
                <p className="mt-3 text-sm font-semibold">Skill planner</p>
                <p className="mt-0.5 text-xs text-muted">{d.skills.items ? `${d.skills.completed}/${d.skills.items} skills done` : "Plan your next skill"}</p>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewUserStart({ profilePercent, onboarded }: { profilePercent: number; onboarded: boolean }) {
  const steps = [
    { icon: FilePlus2, title: "Create a resume", text: "Start from guided sections with a fresher or standard layout.", to: "/app/resumes?new=1", cta: "Create" },
    { icon: Upload, title: "Or import one", text: "Upload a PDF or DOCX and review the extracted sections.", to: "/app/resumes?upload=1", cta: "Upload" },
    { icon: Activity, title: "Run a health check", text: "Get prioritised, explained findings for your resume.", to: "/app/analysis", cta: "Open" },
    { icon: Target, title: "Match a job", text: "Paste a job description and see your evidence for each requirement.", to: "/app/job-match", cta: "Open" },
  ];
  return (
    <div className="space-y-5">
      {!onboarded && (
        <Card className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand-500/10 blur-2xl" aria-hidden />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-semibold">Tell us what you're aiming for</p>
              <p className="mt-1 text-sm text-muted">Two minutes of setup personalises summaries, interview questions and next steps. Profile {profilePercent}% complete.</p>
            </div>
            <LinkButton to="/app/onboarding" iconRight={<ArrowRight className="size-4" />}>Start setup</LinkButton>
          </div>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <Link key={s.title} to={s.to} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
            <span className="text-xs font-semibold text-faint">Step {i + 1}</span>
            <s.icon className="mt-3 size-6 text-brand-500" />
            <p className="mt-3 font-semibold">{s.title}</p>
            <p className="mt-1 flex-1 text-sm text-muted">{s.text}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-fg">{s.cta} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </div>
      <p className="text-center text-xs text-muted">Statistics appear here once you've added your own resumes and applications — we never show placeholder numbers. Last updated {formatDate(new Date().toISOString())}.</p>
    </div>
  );
}
