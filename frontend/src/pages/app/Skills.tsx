import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, BookOpen, Check, ChevronDown, GraduationCap, Lightbulb, Link2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Paginated } from "@/lib/api";
import type { AIResult, JobDescription, LearningPlan, PlanItem, PortfolioProject, Report, ResumeSummary } from "@/lib/types";
import { cn, formatDate, uid } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/Feedback";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Dialog, Tabs, useConfirm } from "@/components/ui/Overlay";

const STATUS: Record<PlanItem["status"], { label: string; tone: "success" | "brand" | "neutral" }> = {
  demonstrated: { label: "Demonstrated", tone: "success" }, learning: { label: "Learning", tone: "brand" }, not_held: { label: "Not currently held", tone: "neutral" },
};

export default function Skills() {
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api.get<Paginated<LearningPlan>>("/learning-plans/?page_size=50") });
  const [planId, setPlanId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const qc = useQueryClient();
  const confirm = useConfirm();
  useEffect(() => { if (!planId && plans.data?.results[0]) setPlanId(plans.data.results[0].id); }, [plans.data, planId]);
  const del = useMutation({ mutationFn: (id: number) => api.del(`/learning-plans/${id}/`), onSuccess: () => { setPlanId(null); qc.invalidateQueries({ queryKey: ["plans"] }); } });
  const plan = plans.data?.results.find((p) => p.id === planId);
  return (
    <div>
      <PageHeader title="Skill planner" description="Turn job requirements into a checklist. Plan how to learn what you don't have yet — separately from what you can truthfully claim today."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setNewOpen(true)}>New plan</Button>} />
      {plans.isLoading ? <Skeleton className="h-64 rounded-xl" /> : plans.error ? <ErrorState error={plans.error} /> : !plans.data!.results.length ? (
        <EmptyState icon={<GraduationCap className="size-6" />} title="No skill plans yet" description="Create a plan from a job match report — skills you already evidence are marked demonstrated, the rest become learning goals." action={<Button onClick={() => setNewOpen(true)}>Create from a job</Button>} />
      ) : (
        <>
          <Tabs value={String(planId ?? "")} onValueChange={(v) => setPlanId(Number(v))} tabs={plans.data!.results.map((p) => ({ value: String(p.id), label: p.title }))} className="mb-5" />
          {plan && <PlanView plan={plan} onDelete={async () => { if (await confirm({ title: `Delete “${plan.title}”?`, confirmLabel: "Delete plan" })) del.mutate(plan.id); }} />}
        </>
      )}
      <NewPlan open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => setPlanId(id)} />
    </div>
  );
}

function PlanView({ plan, onDelete }: { plan: LearningPlan; onDelete: () => void }) {
  const qc = useQueryClient();
  const [skill, setSkill] = useState("");
  const add = useMutation({
    mutationFn: () => api.post("/learning-items/", { plan: plan.id, skill, status: "not_held", order: plan.items.length }),
    onSuccess: () => { setSkill(""); qc.invalidateQueries({ queryKey: ["plans"] }); },
  });
  const p = plan.progress;
  const claimable = plan.items.filter((i) => i.can_claim_on_resume);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        {plan.items.map((i) => <ItemCard key={i.id} item={i} />)}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (skill.trim()) add.mutate(); }}>
          <Input aria-label="Add a skill" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Add a skill to this plan" maxLength={80} />
          <Button type="submit" variant="secondary" loading={add.isPending} icon={<Plus className="size-4" />}>Add</Button>
        </form>
      </div>
      <aside className="space-y-4">
        <div className="card p-5">
          <p className="text-sm font-semibold">Progress</p>
          <p className="mt-1 font-display text-3xl font-bold">{p.percent}%</p>
          <ProgressBar value={p.percent} className="mt-2" label="Plan progress" />
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div><dt className="text-muted">Shown</dt><dd className="text-lg font-semibold">{p.demonstrated}</dd></div>
            <div><dt className="text-muted">Learning</dt><dd className="text-lg font-semibold">{p.learning}</dd></div>
            <div><dt className="text-muted">Not yet</dt><dd className="text-lg font-semibold">{p.not_held}</dd></div>
          </dl>
        </div>
        <div className="card p-5 text-sm">
          <p className="flex items-center gap-2 font-semibold"><BadgeCheck className="size-4 text-success" /> Can go on your resume</p>
          {claimable.length ? <div className="mt-2 flex flex-wrap gap-1.5">{claimable.map((i) => <Badge key={i.id} tone="success">{i.skill}</Badge>)}</div> : <p className="mt-1 text-muted">Mark a skill demonstrated once you can point to real evidence.</p>}
          <p className="mt-4 flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-brand-500" /> Learning goals</p>
          <p className="mt-1 text-muted">Skills you're learning are not resume claims yet. Mention them as learning only if asked.</p>
        </div>
        <Button variant="ghost" className="w-full text-danger" icon={<Trash2 className="size-4" />} onClick={onDelete}>Delete plan</Button>
      </aside>
    </div>
  );
}

function ItemCard({ item }: { item: PlanItem }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [milestone, setMilestone] = useState("");
  const [link, setLink] = useState({ label: "", url: "" });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Paginated<PortfolioProject>>("/portfolio-projects/?page_size=100"), enabled: open });
  const patch = useMutation({
    mutationFn: (body: Partial<PlanItem>) => api.patch<PlanItem>(`/learning-items/${item.id}/`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
  const suggest = useMutation({
    mutationFn: () => api.post<AIResult<{ milestones: string[]; practice_tasks: string[]; project_ideas: string[] }>>(`/learning-items/${item.id}/suggest/`),
    onSuccess: (r) => {
      patch.mutate({
        milestones: [...item.milestones, ...r.result.milestones.map((t) => ({ id: uid(), title: t, done: false, due: null }))],
        practice_tasks: r.result.practice_tasks, project_ideas: r.result.project_ideas,
      });
      toast.success("Suggestions added — edit or remove any you don't need");
    },
  });
  const del = useMutation({ mutationFn: () => api.del(`/learning-items/${item.id}/`), onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }) });
  return (
    <div className={cn("card overflow-hidden", open && "ring-1 ring-brand-300")}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="min-w-0">
            <span className="block truncate font-medium">{item.skill}</span>
            <span className="block text-xs text-muted">{item.category || "Skill"}{item.importance !== "unspecified" && ` · ${item.importance}`}{item.target_date && ` · target ${formatDate(item.target_date)}`}</span>
          </span>
        </button>
        <div className="w-24"><ProgressBar value={item.progress} tone={item.status === "demonstrated" ? "success" : "brand"} label={`${item.skill} progress`} /></div>
        <Select aria-label={`Status for ${item.skill}`} value={item.status} onChange={(e) => patch.mutate({ status: e.target.value as PlanItem["status"] })} className="h-8 w-44 text-xs">
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <IconButton size="sm" label="Expand" onClick={() => setOpen(!open)}><ChevronDown className={cn("size-4 transition", open && "rotate-180")} /></IconButton>
      </div>
      {open && (
        <div className="space-y-5 border-t border-line bg-surface-2 px-4 py-4">
          {item.status === "demonstrated" ? (
            <Callout tone="success" title="Demonstrated">You marked this as something you can evidence{item.completed_at ? ` (since ${formatDate(item.completed_at)})` : ""}. Make sure your resume shows where you used it.</Callout>
          ) : (
            <Callout tone="info">This is a learning goal, not a resume claim. Move it to “Demonstrated” once you have real evidence (a project, certificate or work example).</Callout>
          )}
          <div>
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Milestones</p>
              <Button size="xs" variant="subtle" icon={<Sparkles className="size-3.5" />} loading={suggest.isPending} onClick={() => suggest.mutate()}>Suggest plan</Button></div>
            <ul className="mt-2 space-y-1.5">
              {item.milestones.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line">
                  <button onClick={() => patch.mutate({ milestones: item.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })} className={cn("grid size-5 shrink-0 place-items-center rounded-md border", m.done ? "border-success bg-success text-white" : "border-line-strong")} aria-label={m.done ? "Mark not done" : "Mark done"}>{m.done && <Check className="size-3.5" />}</button>
                  <span className={cn("flex-1", m.done && "text-muted line-through")}>{m.title}</span>
                  <IconButton size="sm" label="Remove milestone" onClick={() => patch.mutate({ milestones: item.milestones.filter((x) => x.id !== m.id) })}><Trash2 className="size-3.5" /></IconButton>
                </li>
              ))}
            </ul>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (milestone.trim()) { patch.mutate({ milestones: [...item.milestones, { id: uid(), title: milestone.trim(), done: false, due: null }] }); setMilestone(""); } }}>
              <Input aria-label="New milestone" value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder="Add a milestone" className="h-9" />
              <Button type="submit" size="sm" variant="secondary">Add</Button>
            </form>
          </div>
          {(item.practice_tasks.length > 0 || item.project_ideas.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {item.practice_tasks.length > 0 && <div><p className="text-sm font-semibold">Practice tasks</p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-fg-2">{item.practice_tasks.map((t) => <li key={t}>{t}</li>)}</ul></div>}
              {item.project_ideas.length > 0 && <div><p className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="size-3.5 text-warning" /> Portfolio project ideas</p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-fg-2">{item.project_ideas.map((t) => <li key={t}>{t}</li>)}</ul></div>}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target date">{(id) => <Input id={id} type="date" value={item.target_date ?? ""} onChange={(e) => patch.mutate({ target_date: e.target.value || null })} />}</Field>
            <Field label="Linked portfolio project">{(id) => <Select id={id} value={item.linked_project ?? ""} onChange={(e) => patch.mutate({ linked_project: e.target.value ? Number(e.target.value) : null })}><option value="">None</option>{projects.data?.results.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>}</Field>
          </div>
          <div>
            <p className="text-sm font-semibold">Evidence links (certificates, repos)</p>
            <ul className="mt-2 space-y-1">{item.evidence_links.map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm"><Link2 className="size-3.5 text-muted" /><a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate text-brand-fg hover:underline">{l.label}</a>
                <IconButton size="sm" label="Remove link" onClick={() => patch.mutate({ evidence_links: item.evidence_links.filter((_, j) => j !== i) })}><Trash2 className="size-3" /></IconButton></li>
            ))}</ul>
            <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); patch.mutate({ evidence_links: [...item.evidence_links, link] }); setLink({ label: "", url: "" }); }}>
              <Input aria-label="Link label" value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} placeholder="Label" className="h-9 sm:w-40" />
              <Input aria-label="Link URL" type="url" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://" className="h-9" required />
              <Button type="submit" size="sm" variant="secondary">Add link</Button>
            </form>
            <p className="mt-1.5 text-xs text-muted">Links are stored as you enter them; we don't verify them.</p>
          </div>
          <Button size="xs" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={async () => { if (await confirm({ title: `Remove ${item.skill} from this plan?`, confirmLabel: "Remove" })) del.mutate(); }}>Remove skill</Button>
        </div>
      )}
    </div>
  );
}

function NewPlan({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient();
  const reports = useQuery({ queryKey: ["reports", "match"], queryFn: () => api.get<Paginated<Report>>("/reports/?kind=match&page_size=50"), enabled: open });
  const jds = useQuery({ queryKey: ["jds"], queryFn: () => api.get<Paginated<JobDescription>>("/job-descriptions/?page_size=100"), enabled: open });
  const resumes = useQuery({ queryKey: ["resumes", "active", ""], queryFn: () => api.get<Paginated<ResumeSummary>>("/resumes/?page_size=100"), enabled: open });
  const [source, setSource] = useState<"report" | "jd" | "blank">("report");
  const [f, setF] = useState({ report_id: "", job_description_id: "", resume_id: "", title: "" });
  const create = useMutation({
    mutationFn: () => source === "blank"
      ? api.post<LearningPlan>("/learning-plans/", { title: f.title || "My learning plan" })
      : api.post<LearningPlan>("/learning-plans/from-job/", source === "report" ? { report_id: Number(f.report_id), title: f.title || undefined } : { job_description_id: Number(f.job_description_id), resume_id: f.resume_id ? Number(f.resume_id) : undefined, title: f.title || undefined }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["plans"] }); onCreated(p.id); onOpenChange(false); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New skill plan"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} disabled={(source === "report" && !f.report_id) || (source === "jd" && !f.job_description_id)} onClick={() => create.mutate()}>Create plan</Button></>}>
      <div className="space-y-4">
        <Field label="Start from">{(id) => <Select id={id} value={source} onChange={(e) => setSource(e.target.value as any)}><option value="report">A job match report (recommended)</option><option value="jd">A saved job description</option><option value="blank">Blank plan</option></Select>}</Field>
        {source === "report" && <Field label="Match report">{(id) => <Select id={id} value={f.report_id} onChange={(e) => setF({ ...f, report_id: e.target.value })}><option value="">Choose…</option>{reports.data?.results.map((r) => <option key={r.id} value={r.id}>{r.job_title} · {r.resume_title} ({formatDate(r.created_at)})</option>)}</Select>}</Field>}
        {source === "jd" && (
          <>
            <Field label="Job description">{(id) => <Select id={id} value={f.job_description_id} onChange={(e) => setF({ ...f, job_description_id: e.target.value })}><option value="">Choose…</option>{jds.data?.results.map((j) => <option key={j.id} value={j.id}>{j.display_title}</option>)}</Select>}</Field>
            <Field label="Compare with resume (optional)" hint="Without a resume, every skill starts as not currently held.">{(id) => <Select id={id} value={f.resume_id} onChange={(e) => setF({ ...f, resume_id: e.target.value })}><option value="">None</option>{resumes.data?.results.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>}</Field>
          </>
        )}
        <Field label="Plan name (optional)">{(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}
