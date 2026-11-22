import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Briefcase, ExternalLink, ScanSearch, Target, Trash2 } from "lucide-react";
import { api, type Paginated } from "@/lib/api";
import type { JobDescription, ParsedJD, Report, ResumeSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Button, IconButton, LinkButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Tabs, TabPanel, useConfirm } from "@/components/ui/Overlay";
import { ReportList } from "./Analysis";

export default function JobMatch() {
  const [tab, setTab] = useState("analyze");
  return (
    <div>
      <PageHeader title="Job match" description="Paste a job description to see which requirements your resume evidences, with snippets — and what to verify or learn." />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "analyze", label: "Analyse a job" }, { value: "saved", label: "Saved jobs" }, { value: "compare", label: "Compare two jobs" }, { value: "history", label: "Match history" }]}>
        <TabPanel value="analyze"><Analyze /></TabPanel>
        <TabPanel value="saved"><SavedJobs onUse={() => setTab("analyze")} /></TabPanel>
        <TabPanel value="compare"><CompareJobs /></TabPanel>
        <TabPanel value="history"><ReportList kind="match" /></TabPanel>
      </Tabs>
    </div>
  );
}

function useJDs() {
  return useQuery({ queryKey: ["jds"], queryFn: () => api.get<Paginated<JobDescription>>("/job-descriptions/?page_size=100") });
}

function Analyze() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const resumes = useQuery({ queryKey: ["resumes", "active", ""], queryFn: () => api.get<Paginated<ResumeSummary>>("/resumes/?page_size=100") });
  const jds = useJDs();
  const [resumeId, setResumeId] = useState(params.get("resume") ?? "");
  const [savedJd, setSavedJd] = useState(params.get("jd") ?? "");
  const [form, setForm] = useState({ title: "", company: "", source_url: "", text: "" });
  const [preview, setPreview] = useState<ParsedJD | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rid = resumeId || String(resumes.data?.results[0]?.id ?? "");

  const run = useMutation({
    mutationFn: () => api.post<Report>("/reports/match/", savedJd ? { resume_id: Number(rid), job_description_id: Number(savedJd) } : { resume_id: Number(rid), ...form }),
    onSuccess: (r) => navigate(`/app/reports/${r.id}`),
    onError: (e: any) => setErr(e.field?.("text") ?? e.friendly),
    meta: { silent: true },
  });
  const extract = useMutation({ mutationFn: () => api.post<ParsedJD>("/job-descriptions/preview/", { text: form.text, title: form.title }), onSuccess: setPreview });

  if (resumes.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!resumes.data?.results.length)
    return <EmptyState icon={<Target className="size-6" />} title="You'll need a resume first" description="Create or import a resume, then compare it with any job description." action={<LinkButton to="/app/resumes?new=1">Create resume</LinkButton>} />;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); setErr(null); run.mutate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Resume">{(id) => <Select id={id} value={rid} onChange={(e) => setResumeId(e.target.value)}>{resumes.data!.results.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>}</Field>
          <Field label="Job description">
            {(id) => (
              <Select id={id} value={savedJd} onChange={(e) => setSavedJd(e.target.value)}>
                <option value="">Paste a new one</option>
                {jds.data?.results.map((j) => <option key={j.id} value={j.id}>{j.display_title}{j.company ? ` · ${j.company}` : ""}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {!savedJd && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Role title (optional)">{(id) => <Input id={id} value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
              <Field label="Company (optional)">{(id) => <Input id={id} value={form.company} maxLength={160} onChange={(e) => setForm({ ...form, company: e.target.value })} />}</Field>
              <Field label="Source URL (optional)">{(id) => <Input id={id} type="url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://" />}</Field>
            </div>
            <Field label="Job description text" hint={`${form.text.length.toLocaleString()} / 30,000 characters. Include the requirements list. Text is treated as data only.`} error={err ?? undefined}>
              {(id, d) => <Textarea id={id} aria-describedby={d} rows={14} maxLength={30000} value={form.text} onChange={(e) => { setForm({ ...form, text: e.target.value }); setPreview(null); }} placeholder="Paste the full job description here…" />}
            </Field>
          </>
        )}
        {err && savedJd && <Callout tone="danger">{err}</Callout>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={run.isPending} icon={<Target className="size-4" />} disabled={!savedJd && form.text.trim().length < 80}>Map my evidence</Button>
          {!savedJd && <Button variant="secondary" icon={<ScanSearch className="size-4" />} loading={extract.isPending} disabled={form.text.trim().length < 40} onClick={() => extract.mutate()}>Preview extraction</Button>}
        </div>
      </form>
      <aside className="space-y-4">
        {preview ? <JDSummary p={preview} /> : (
          <div className="card p-5 text-sm text-muted">
            <p className="font-medium text-fg">What you'll get</p>
            <ul className="mt-3 space-y-2">
              <li>• Responsibilities, required and preferred skills (only when the text distinguishes them)</li>
              <li>• Evidence for each requirement, with the snippet and section</li>
              <li>• Demonstrated / partial / verify / not found — never “you lack this skill”</li>
              <li>• A tailoring checklist with truthful wording suggestions</li>
            </ul>
            <p className="mt-4 text-xs">We don't know any employer's private screening rules; this compares text you provide.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function JDSummary({ p }: { p: ParsedJD }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Extracted</p>
      <p className="mt-1 font-semibold">{p.role_title || "Role title not detected"}</p>
      {p.warnings.map((w) => <Callout key={w} tone="info" className="mt-3">{w}</Callout>)}
      {(["required", "preferred", "unspecified"] as const).map((k) => p.skills[k].length > 0 && (
        <div key={k} className="mt-4">
          <p className="text-xs font-medium capitalize text-muted">{k === "unspecified" ? "Mentioned (importance not stated)" : k}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">{p.skills[k].map((s) => <Badge key={s} tone={k === "required" ? "danger" : k === "preferred" ? "brand" : "neutral"}>{s}</Badge>)}</div>
        </div>
      ))}
      {p.responsibilities.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted">Responsibilities</p>
          <ul className="mt-1.5 space-y-1 text-xs text-fg-2">{p.responsibilities.slice(0, 6).map((r) => <li key={r}>• {r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function SavedJobs({ onUse }: { onUse: () => void }) {
  const jds = useJDs();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [open, setOpen] = useState<number | null>(null);
  const detail = useQuery({ queryKey: ["jd", open], queryFn: () => api.get<JobDescription>(`/job-descriptions/${open}/`), enabled: !!open });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/job-descriptions/${id}/`), onSuccess: () => qc.invalidateQueries({ queryKey: ["jds"] }) });
  if (jds.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (jds.error) return <ErrorState error={jds.error} />;
  if (!jds.data!.results.length) return <EmptyState icon={<Briefcase className="size-6" />} title="No saved job descriptions" description="Job descriptions you analyse are saved here so you can re-match after editing your resume." />;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <ul className="card divide-y divide-line self-start">
        {jds.data!.results.map((j) => (
          <li key={j.id} className={open === j.id ? "bg-surface-2" : ""}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(j.id)}>
                <span className="block truncate text-sm font-medium">{j.display_title}</span>
                <span className="block text-xs text-muted">{j.company || "No company"} · saved {formatDate(j.created_at)}</span>
              </button>
              {j.source_url && <a href={j.source_url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-fg" aria-label="Open source posting"><ExternalLink className="size-4" /></a>}
              <IconButton size="sm" label="Delete" onClick={async () => { if (await confirm({ title: "Delete this job description?", description: "Existing reports keep their results.", confirmLabel: "Delete" })) del.mutate(j.id); }}><Trash2 className="size-3.5" /></IconButton>
            </div>
          </li>
        ))}
      </ul>
      <div>
        {open && detail.data?.parsed ? (
          <div className="space-y-3">
            <JDSummary p={detail.data.parsed} />
            <Button className="w-full" icon={<Target className="size-4" />} onClick={() => { navigate(`/app/job-match?jd=${open}`); onUse(); }}>Match a resume to this job</Button>
          </div>
        ) : <p className="text-sm text-muted">Select a job description to see what was extracted.</p>}
      </div>
    </div>
  );
}

function CompareJobs() {
  const jds = useJDs();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const cmp = useQuery({ queryKey: ["jd-compare", a, b], queryFn: () => api.get<any>(`/job-descriptions/${a}/compare/?other=${b}`), enabled: !!a && !!b && a !== b });
  const list = jds.data?.results ?? [];
  if (!jds.isLoading && list.length < 2) return <EmptyState icon={<ArrowLeftRight className="size-6" />} title="Save at least two job descriptions" description="Analyse two jobs first, then compare how their skill emphasis differs." />;
  return (
    <div className="space-y-5">
      <div className="card grid items-end gap-3 p-5 sm:grid-cols-[1fr_auto_1fr]">
        <Field label="Job A">{(id) => <Select id={id} value={a} onChange={(e) => setA(e.target.value)}><option value="">Choose…</option>{list.map((j) => <option key={j.id} value={j.id}>{j.display_title}{j.company ? ` · ${j.company}` : ""}</option>)}</Select>}</Field>
        <ArrowLeftRight className="mb-3 hidden size-4 text-muted sm:block" />
        <Field label="Job B">{(id) => <Select id={id} value={b} onChange={(e) => setB(e.target.value)}><option value="">Choose…</option>{list.map((j) => <option key={j.id} value={j.id}>{j.display_title}{j.company ? ` · ${j.company}` : ""}</option>)}</Select>}</Field>
      </div>
      {a && b && a === b && <Callout tone="warning">Choose two different job descriptions.</Callout>}
      {cmp.data && (
        <div className="grid gap-4 md:grid-cols-3">
          <SkillColumn title={`Only in ${cmp.data.a.display_title}`} skills={cmp.data.only_a} />
          <div className="card p-5">
            <p className="text-sm font-semibold">Shared skills</p>
            {cmp.data.shared.length === 0 ? <p className="mt-2 text-sm text-muted">None in common.</p> : (
              <table className="mt-3 w-full text-xs">
                <thead><tr className="text-left text-muted"><th className="pb-2 font-medium">Skill</th><th className="pb-2 font-medium">A</th><th className="pb-2 font-medium">B</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {cmp.data.shared.map((s: any) => (
                    <tr key={s.skill}><td className="py-1.5 font-medium">{s.skill}</td><td className="py-1.5">{s.a_kind} · {s.a_mentions}×</td><td className="py-1.5">{s.b_kind} · {s.b_mentions}×</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <SkillColumn title={`Only in ${cmp.data.b.display_title}`} skills={cmp.data.only_b} />
        </div>
      )}
    </div>
  );
}

function SkillColumn({ title, skills }: { title: string; skills: string[] }) {
  return (
    <div className="card p-5">
      <p className="truncate text-sm font-semibold">{title}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{skills.length ? skills.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-sm text-muted">No unique skills.</span>}</div>
    </div>
  );
}
