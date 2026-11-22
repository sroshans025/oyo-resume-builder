import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, CircleHelp, FileText, GraduationCap, Info, Lightbulb, MinusCircle, Pencil, Quote, Sigma } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { EvidenceStatus, Finding, Report, Requirement } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, ErrorState, FullPageLoader, ProgressBar, ScoreRing } from "@/components/ui/Feedback";
import { Button, LinkButton } from "@/components/ui/Button";
import { Tabs, TabPanel } from "@/components/ui/Overlay";

const SEV: Record<Finding["severity"], { tone: "danger" | "warning" | "neutral" | "brand"; label: string }> = {
  high: { tone: "danger", label: "High" }, medium: { tone: "warning", label: "Medium" }, low: { tone: "neutral", label: "Low" }, info: { tone: "brand", label: "Info" },
};
const SHORT: Record<EvidenceStatus, string> = { demonstrated: "shown in use", partial: "listed only", verify: "verify", not_found: "not found" };

export const STATUS: Record<EvidenceStatus, { label: string; icon: typeof CheckCircle2; cls: string; dot: string }> = {
  demonstrated: { label: "Demonstrated", icon: CheckCircle2, cls: "text-success", dot: "bg-success" },
  partial: { label: "Partially demonstrated", icon: MinusCircle, cls: "text-warning", dot: "bg-warning" },
  verify: { label: "Requires your verification", icon: CircleHelp, cls: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  not_found: { label: "Not found in resume", icon: Info, cls: "text-muted", dot: "bg-slate-400" },
};

export default function ReportPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api.get<Report>(`/reports/${id}/`) });
  if (q.isLoading) return <FullPageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return q.data!.kind === "match" ? <MatchReport r={q.data!} /> : <HealthReport r={q.data!} />;
}

function HealthReport({ r }: { r: Report }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("findings");
  const [resolved, setResolved] = useState<string[]>(r.resolved_findings ?? []);
  const save = useMutation({
    mutationFn: (ids: string[]) => api.patch<Report>(`/reports/${r.id}/`, { resolved_findings: ids }),
    meta: { silent: true },
    onSuccess: (d) => qc.setQueryData(["report", String(r.id)], d),
  });
  const toggle = (fid: string) => {
    const next = resolved.includes(fid) ? resolved.filter((x) => x !== fid) : [...resolved, fid];
    setResolved(next);
    save.mutate(next);
  };
  const findings = r.findings ?? [];
  const open = findings.filter((f) => !resolved.includes(f.id));
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Health check", to: "/app/analysis" }, { label: "Report" }]}
        title={r.kind === "upload" ? `File check: ${r.upload_name}` : `Health check: ${r.resume_title}`}
        description={`${formatDateTime(r.created_at)}${r.version_number ? ` · version ${r.version_number}` : ""} · rules ${r.rules_version}`}
        actions={r.resume && <LinkButton to={`/app/resumes/${r.resume}`} icon={<Pencil className="size-4" />}>Edit resume</LinkButton>}
      />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <div className="card p-6 text-center">
            <ScoreRing score={r.quality_score} size={140} label="out of 100" />
            <p className="mt-3 font-semibold">Resume quality estimate</p>
            <p className="mt-1 text-xs text-muted">Not a job-match score — no job description was used.</p>
            <Link to={`/app/job-match${r.resume ? `?resume=${r.resume}` : ""}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-fg">Compare with a job description <ArrowRight className="size-3" /></Link>
          </div>
          <div className="card p-5">
            <p className="text-sm font-semibold">Score by category</p>
            <ul className="mt-4 space-y-4">
              {r.categories?.map((c) => (
                <li key={c.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular-nums font-semibold">{c.assessed ? c.score : <span className="text-xs font-normal text-muted">Not assessed</span>}</span>
                  </div>
                  {c.assessed && <ProgressBar value={c.score ?? 0} className="mt-1.5" label={c.label} />}
                  <p className="mt-1 text-xs text-muted">{c.assessed ? `${c.findings} finding(s) · −${c.deduction} points` : c.note}</p>
                </li>
              ))}
            </ul>
          </div>
          <details className="card group p-5 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Sigma className="size-4 text-brand-500" /> How this is calculated <ChevronDown className="ml-auto size-4 transition group-open:rotate-180" /></summary>
            <p className="mt-3 leading-relaxed text-muted">{r.summary?.formula}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted">{r.summary?.disclaimer}</p>
          </details>
        </aside>
        <div className="min-w-0">
          {(r.strengths?.length ?? 0) > 0 && (
            <div className="card mb-5 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-success" /> What's working</p>
              <ul className="mt-2 grid gap-1.5 text-sm text-fg-2 sm:grid-cols-2">
                {r.strengths!.map((s) => <li key={s} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-success" />{s}</li>)}
              </ul>
            </div>
          )}
          <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "findings", label: "Prioritised findings", count: open.length }, { value: "resolved", label: "Resolved", count: resolved.length }, { value: "text", label: "Extracted text" }]}>
            <TabPanel value="findings">
              {open.length === 0 ? <Callout tone="success" title="Nothing left to review">You've addressed or dismissed every finding. Re-run the check after editing to confirm.</Callout> : (
                <ol className="space-y-3">{open.map((f) => <FindingCard key={f.id} f={f} onToggle={() => toggle(f.id)} resolved={false} />)}</ol>
              )}
            </TabPanel>
            <TabPanel value="resolved">
              {resolved.length === 0 ? <p className="text-sm text-muted">Mark findings as resolved to track your progress.</p> : (
                <ol className="space-y-3">{findings.filter((f) => resolved.includes(f.id)).map((f) => <FindingCard key={f.id} f={f} onToggle={() => toggle(f.id)} resolved />)}</ol>
              )}
            </TabPanel>
            <TabPanel value="text">
              <p className="mb-2 text-xs text-muted">The plain-text reading order a parser would see. Check that nothing is missing or out of order.</p>
              <pre className="card scrollbar-thin max-h-[600px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">{r.extracted_preview}</pre>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function FindingCard({ f, onToggle, resolved }: { f: Finding; onToggle: () => void; resolved: boolean }) {
  const [open, setOpen] = useState(f.severity === "high");
  return (
    <li className={cn("card overflow-hidden", resolved && "opacity-70")}>
      <button className="flex w-full items-start gap-3 px-5 py-4 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="mt-0.5 font-display text-xs font-bold text-faint tabular-nums">#{f.priority}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{f.title}</span>
            <Badge tone={SEV[f.severity].tone}>{SEV[f.severity].label}</Badge>
            {f.section && <Badge>{f.section}</Badge>}
          </span>
          <span className="mt-1 block text-sm text-muted">{f.explanation}</span>
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line bg-surface-2 px-5 py-4 text-sm">
          <p className="flex gap-2"><Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-500" /><span><strong>What to do:</strong> {f.recommendation}</span></p>
          {f.evidence.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {f.evidence.map((e, i) => <li key={i} className="flex gap-2 text-xs text-fg-2"><Quote className="mt-0.5 size-3 shrink-0 text-faint" /><span className="rounded bg-surface px-1.5 py-0.5 ring-1 ring-line">{e}</span></li>)}
            </ul>
          )}
          <Button size="xs" variant="secondary" className="mt-4" onClick={onToggle}>{resolved ? "Mark as open" : "Mark as resolved"}</Button>
        </div>
      )}
    </li>
  );
}

function MatchReport({ r }: { r: Report }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | EvidenceStatus>("all");
  const [done, setDone] = useState<string[]>((r.checklist ?? []).filter((c) => c.done).map((c) => c.id));
  const counts = r.summary?.counts as Record<EvidenceStatus, number>;
  const saveChecklist = useMutation({
    meta: { silent: true },
    mutationFn: (ids: string[]) => api.patch<Report>(`/reports/${r.id}/`, { checklist_done: ids }),
    onSuccess: (d) => qc.setQueryData(["report", String(r.id)], d),
  });
  const plan = useMutation({
    mutationFn: () => api.post<{ id: number }>("/learning-plans/from-job/", { report_id: r.id }),
    onSuccess: () => { toast.success("Skill plan created"); navigate("/app/skills"); },
  });
  const reqs = (r.requirements ?? []).filter((q) => filter === "all" || q.status === filter);
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Job match", to: "/app/job-match" }, { label: "Evidence report" }]}
        title={`${r.job_title}${r.job_company ? ` · ${r.job_company}` : ""}`}
        description={`Compared with “${r.resume_title}” (version ${r.version_number}) on ${formatDateTime(r.created_at)}`}
        actions={
          <>
            <Button variant="secondary" icon={<GraduationCap className="size-4" />} loading={plan.isPending} onClick={() => plan.mutate()}>Create skill plan</Button>
            {r.resume && <LinkButton to={`/app/resumes/${r.resume}`} icon={<FileText className="size-4" />}>Tailor resume</LinkButton>}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <div className="card p-6 text-center">
            <ScoreRing score={r.match_score} size={140} label="match estimate" />
            <p className="mt-3 text-xs text-muted">How much of this job description your resume text evidences. Separate from resume quality.</p>
          </div>
          <div className="card p-5">
            <p className="text-sm font-semibold">Requirements</p>
            <ul className="mt-3 space-y-1">
              {(Object.keys(STATUS) as EvidenceStatus[]).map((s) => {
                const S = STATUS[s];
                return (
                  <li key={s}>
                    <button onClick={() => setFilter(filter === s ? "all" : s)} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-surface-2", filter === s && "bg-surface-3")}>
                      <span className={cn("size-2 rounded-full", S.dot)} aria-hidden /> <span className="flex-1 text-left">{S.label}</span>
                      <span className="font-semibold tabular-nums">{counts?.[s] ?? 0}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <details className="card group p-5 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Sigma className="size-4 text-brand-500" /> How this is calculated <ChevronDown className="ml-auto size-4 transition group-open:rotate-180" /></summary>
            <p className="mt-3 leading-relaxed text-muted">{r.summary?.formula}</p>
            <p className="mt-3 text-xs text-muted">{r.summary?.disclaimer}</p>
          </details>
          {r.summary?.jd_warnings?.map((w: string) => <Callout key={w} tone="info">{w}</Callout>)}
        </aside>
        <div className="min-w-0 space-y-5">
          <Callout tone="info" title="A missing keyword isn't a missing skill">
            “Not found” only means we couldn't find evidence in this resume's text. Add evidence only for skills you genuinely have; treat real gaps as learning goals.
          </Callout>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Evidence map</h2>
              {filter !== "all" && <Button size="xs" variant="ghost" onClick={() => setFilter("all")}>Show all</Button>}
            </div>
            <ul className="space-y-3">{reqs.map((q) => <RequirementCard key={q.id} q={q} />)}</ul>
          </section>
          <section className="card">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-semibold">Tailoring checklist</h2>
              <p className="text-xs text-muted">Suggestions marked “only if true” must reflect your real experience.</p>
            </div>
            <ul className="divide-y divide-line">
              {r.checklist?.map((c) => {
                const checked = done.includes(c.id);
                return (
                  <li key={c.id} className="flex gap-3 px-5 py-3.5">
                    <input type="checkbox" className="mt-1 size-4 accent-brand-500" checked={checked} aria-label={c.text} onChange={() => { const next = checked ? done.filter((x) => x !== c.id) : [...done, c.id]; setDone(next); saveChecklist.mutate(next); }} />
                    <div className={cn("min-w-0 flex-1", checked && "opacity-60")}>
                      <p className={cn("text-sm font-medium", checked && "line-through")}>{c.text} <Badge tone={c.priority === "high" ? "danger" : c.priority === "medium" ? "warning" : "neutral"} className="ml-1">{c.priority}</Badge></p>
                      {c.detail && <p className="mt-0.5 text-xs text-muted">{c.detail}</p>}
                      {c.suggested_edit && (
                        <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-xs">
                          <p className="text-muted line-through">{c.suggested_edit.before}</p>
                          <p className="mt-1 text-fg">{c.suggested_edit.after}</p>
                          <p className="mt-1.5 flex items-center gap-1 font-medium text-warning"><AlertTriangle className="size-3" /> Only if true</p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function RequirementCard({ q }: { q: Requirement }) {
  const S = STATUS[q.status];
  return (
    <li className="card p-4">
      <div className="flex items-start gap-3">
        <S.icon className={cn("mt-0.5 size-5 shrink-0", S.cls)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{q.text}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("text-xs font-medium", S.cls)}>{S.label}</span>
            <Badge tone={q.kind === "required" ? "danger" : q.kind === "preferred" ? "brand" : "neutral"}>{q.kind === "unspecified" ? "not specified" : q.kind}</Badge>
            {q.skills.map((s) => {
              const st = q.skill_status?.[s];
              return <Badge key={s} tone={st === "demonstrated" ? "success" : st === "partial" ? "warning" : "neutral"}>{s}{st && st !== q.status ? ` · ${SHORT[st]}` : ""}</Badge>;
            })}
          </div>
          {q.evidence.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {q.evidence.map((e, i) => (
                <li key={i} className="rounded-lg border-l-2 border-brand-300 bg-surface-2 px-3 py-2 text-xs">
                  <span className="text-fg-2">“{e.snippet}”</span>
                  <span className="mt-0.5 block text-faint">{e.section}{e.location !== e.section ? ` · ${e.location}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {q.notes.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-muted">{q.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      </div>
    </li>
  );
}
