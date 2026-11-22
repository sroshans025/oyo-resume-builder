import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  Bell, BriefcaseBusiness, CalendarClock, CalendarPlus, Check, ExternalLink, KanbanSquare, LayoutList, MapPin, MoreHorizontal, Plus, Search, Target, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Paginated } from "@/lib/api";
import type { AppEvent, AppStatus, Application, CoverLetter, Reminder, Version } from "@/lib/types";
import { cn, daysUntil, formatDate, formatDateTime, todayISO } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/Feedback";
import { Button, IconButton } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Dialog, Drawer, Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger, Tabs, TabPanel, useConfirm } from "@/components/ui/Overlay";
import { BarList } from "@/components/ui/BarList";

export const STATUSES: { value: AppStatus; label: string; color: string }[] = [
  { value: "interested", label: "Interested", color: "bg-slate-400" },
  { value: "preparing", label: "Preparing", color: "bg-sky-500" },
  { value: "applied", label: "Applied", color: "bg-brand-500" },
  { value: "assessment", label: "Assessment", color: "bg-violet-500" },
  { value: "interview", label: "Interview", color: "bg-amber-500" },
  { value: "offer", label: "Offer", color: "bg-emerald-500" },
  { value: "rejected", label: "Rejected", color: "bg-rose-400" },
  { value: "withdrawn", label: "Withdrawn", color: "bg-slate-300" },
  { value: "archived", label: "Archived", color: "bg-slate-300" },
];
const BOARD = STATUSES.filter((s) => s.value !== "archived");
const statusLabel = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s;

export default function Applications() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"board" | "list">(() => (localStorageGet("infyro-app-view") as any) || "board");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("");
  const [archived, setArchived] = useState(false);
  const [ordering, setOrdering] = useState("-updated_at");
  const [openId, setOpenId] = useState<number | null>(params.get("open") ? Number(params.get("open")) : null);
  const [createOpen, setCreateOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<{ app: Application; s: { title: string; due_at: string; days: number } } | null>(null);
  const statusFilter = params.get("status");
  const qc = useQueryClient();

  useEffect(() => { try { localStorage.setItem("infyro-app-view", view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { if (params.get("open")) setOpenId(Number(params.get("open"))); }, [params]);

  const list = useQuery({
    queryKey: ["applications", q, mode, archived, ordering, statusFilter],
    queryFn: () => api.get<Application[]>(`/applications/?all=1&ordering=${ordering}${q ? `&q=${encodeURIComponent(q)}` : ""}${mode ? `&work_mode=${mode}` : ""}${archived ? "&include_archived=1" : ""}${statusFilter ? `&status=${statusFilter}` : ""}`),
  });
  const insights = useQuery({ queryKey: ["app-insights"], queryFn: () => api.get<any>("/applications/insights/") });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: number; status: AppStatus }) => api.post<{ application: Application; suggested_reminder: any }>(`/applications/${id}/move/`, { status }),
    onMutate: async ({ id, status }) => {
      const key = ["applications", q, mode, archived, ordering, statusFilter];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Application[]>(key);
      qc.setQueryData<Application[]>(key, (old) => old?.map((a) => (a.id === id ? { ...a, status } : a)));
      return { prev, key };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(ctx.key, ctx.prev),
    onSuccess: (r) => {
      if (r.suggested_reminder) setSuggestion({ app: r.application, s: r.suggested_reminder });
      toast.success(`Moved to ${statusLabel(r.application.status)}`);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["applications"] }); qc.invalidateQueries({ queryKey: ["app-insights"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });

  const apps = list.data ?? [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const id = Number(e.active.id);
    const status = e.over?.id as AppStatus | undefined;
    const app = apps.find((a) => a.id === id);
    if (app && status && app.status !== status) move.mutate({ id, status });
  };

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Track each role from interest to offer — with the exact resume version and cover letter you sent. Nothing is submitted for you."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>Add application</Button>}
      />
      {insights.data && insights.data.total > 0 && <Insights data={insights.data} />}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input aria-label="Search applications" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, role, location" className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Work mode" value={mode} onChange={(e) => setMode(e.target.value)} className="w-36"><option value="">Any work mode</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></Select>
          <Select aria-label="Sort" value={ordering} onChange={(e) => setOrdering(e.target.value)} className="w-44"><option value="-updated_at">Recently updated</option><option value="deadline">Deadline (soonest)</option><option value="-saved_on">Recently saved</option><option value="company">Company A–Z</option></Select>
          <Checkbox label="Show archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {statusFilter && <Button size="xs" variant="subtle" onClick={() => setParams({})}>Status: {statusLabel(statusFilter)} ✕</Button>}
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-0.5 lg:ml-auto" role="group" aria-label="View">
          <IconButton size="sm" label="Board view" onClick={() => setView("board")} className={cn(view === "board" && "bg-surface-3 text-fg")}><KanbanSquare className="size-4" /></IconButton>
          <IconButton size="sm" label="List view" onClick={() => setView("list")} className={cn(view === "list" && "bg-surface-3 text-fg")}><LayoutList className="size-4" /></IconButton>
        </div>
      </div>

      {list.isLoading ? <Skeleton className="h-80 rounded-xl" /> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : apps.length === 0 && !q && !mode && !statusFilter ? (
        <EmptyState icon={<BriefcaseBusiness className="size-6" />} title="Track your first application" description="Save roles you're interested in, set deadlines, and record exactly which resume you sent." action={<Button onClick={() => setCreateOpen(true)} icon={<Plus className="size-4" />}>Add application</Button>} />
      ) : view === "board" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
            {(archived ? STATUSES : BOARD).map((col) => (
              <Column key={col.value} col={col} apps={apps.filter((a) => a.status === col.value)} onOpen={setOpenId} onMove={(id, status) => move.mutate({ id, status })} />
            ))}
          </div>
        </DndContext>
      ) : (
        <ListView apps={apps} onOpen={setOpenId} onMove={(id, status) => move.mutate({ id, status })} />
      )}

      <ApplicationForm open={createOpen} onOpenChange={setCreateOpen} />
      {openId && <DetailDrawer id={openId} onClose={() => { setOpenId(null); if (params.get("open")) setParams({}); }} onSuggestion={(app, s) => setSuggestion({ app, s })} />}
      {suggestion && <SuggestReminder app={suggestion.app} s={suggestion.s} onClose={() => setSuggestion(null)} />}
    </div>
  );
}

function localStorageGet(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}

function Insights({ data }: { data: any }) {
  const wg = data.weekly_goal;
  const pct = wg.goal ? Math.min(100, Math.round((wg.applied_this_week / wg.goal) * 100)) : 0;
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <div className="card p-5">
        <p className="text-xs font-medium text-muted">Weekly goal</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{wg.applied_this_week}<span className="text-sm font-medium text-muted"> / {wg.goal} applied</span></p>
        <ProgressBar value={pct} className="mt-3" tone={pct >= 100 ? "success" : "brand"} label="Weekly goal progress" />
        <p className="mt-2 text-xs text-muted">Change your goal in Settings → Notifications.</p>
      </div>
      <div className="card p-5">
        <p className="text-xs font-medium text-muted">Progress from applied</p>
        <BarList className="mt-3" rows={[
          { label: "Applied", value: data.funnel.applied },
          { label: "Responded", value: data.funnel.responded, hint: "moved past Applied, incl. rejections" },
          { label: "Interviews", value: data.funnel.interviews },
          { label: "Offers", value: data.funnel.offers },
        ]} />
      </div>
      <div className="card p-5">
        <p className="text-xs font-medium text-muted">Rates</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div><p className="font-display text-2xl font-bold">{data.rates.response ?? "—"}{data.rates.response != null && "%"}</p><p className="text-xs text-muted">response rate</p></div>
          <div><p className="font-display text-2xl font-bold">{data.rates.interview ?? "—"}{data.rates.interview != null && "%"}</p><p className="text-xs text-muted">interview rate</p></div>
        </div>
        <p className="mt-3 text-xs text-muted">{data.note}</p>
      </div>
    </div>
  );
}

function Column({ col, apps, onOpen, onMove }: { col: (typeof STATUSES)[number]; apps: Application[]; onOpen: (id: number) => void; onMove: (id: number, s: AppStatus) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.value });
  return (
    <section ref={setNodeRef} aria-label={`${col.label} column`} className={cn("flex w-[272px] shrink-0 flex-col rounded-xl border bg-bg-subtle p-2 transition", isOver ? "border-brand-400 bg-brand-soft/40" : "border-line")}>
      <header className="flex items-center gap-2 px-2 py-1.5">
        <span className={cn("size-2 rounded-full", col.color)} aria-hidden />
        <h2 className="text-sm font-semibold">{col.label}</h2>
        <span className="ml-auto rounded-full bg-surface px-2 text-xs tabular-nums text-muted ring-1 ring-line">{apps.length}</span>
      </header>
      <div className="mt-1 flex min-h-[120px] flex-col gap-2">
        {apps.map((a) => <Card key={a.id} a={a} onOpen={onOpen} onMove={onMove} />)}
        {apps.length === 0 && <p className="px-2 py-6 text-center text-xs text-faint">Drop here</p>}
      </div>
    </section>
  );
}

function Card({ a, onOpen, onMove }: { a: Application; onOpen: (id: number) => void; onMove: (id: number, s: AppStatus) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(a.id) });
  const d = daysUntil(a.deadline);
  return (
    <div ref={setNodeRef} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn("group rounded-lg border border-line bg-surface p-3 shadow-xs transition hover:border-line-strong", isDragging && "z-20 rotate-1 shadow-[var(--shadow-lift)]")}>
      <div className="flex items-start gap-2">
        <button {...listeners} {...attributes} className="min-w-0 flex-1 cursor-grab text-left active:cursor-grabbing" onClick={() => onOpen(a.id)} aria-label={`${a.role} at ${a.company}. Press to open; drag to change stage.`}>
          <p className="truncate text-sm font-semibold">{a.company}</p>
          <p className="truncate text-xs text-muted">{a.role}</p>
        </button>
        <StatusMenu a={a} onMove={onMove} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {a.deadline && <Badge tone={d != null && d < 0 ? "neutral" : d != null && d <= 3 ? "warning" : "neutral"}><CalendarClock className="size-3" />{d != null && d < 0 ? "passed" : d === 0 ? "today" : `${d}d`}</Badge>}
        {a.work_mode && <Badge className="capitalize">{a.work_mode}</Badge>}
        {a.open_reminders > 0 && <Badge tone="brand"><Bell className="size-3" />{a.open_reminders}</Badge>}
        {a.resume_label && <Badge tone="violet" className="max-w-full truncate">{a.resume_label.split(" · ").pop()}</Badge>}
      </div>
    </div>
  );
}

function StatusMenu({ a, onMove }: { a: Application; onMove: (id: number, s: AppStatus) => void }) {
  return (
    <Dropdown>
      <DropdownTrigger asChild><button className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg" aria-label={`Change stage for ${a.company}`}><MoreHorizontal className="size-4" /></button></DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Move to</DropdownLabel>
        {STATUSES.filter((s) => s.value !== a.status).map((s) => (
          <DropdownItem key={s.value} onSelect={() => onMove(a.id, s.value)} icon={<span className={cn("block size-2 rounded-full", s.color)} />}>{s.label}</DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

function ListView({ apps, onOpen, onMove }: { apps: Application[]; onOpen: (id: number) => void; onMove: (id: number, s: AppStatus) => void }) {
  if (!apps.length) return <p className="py-10 text-center text-sm text-muted">No applications match these filters.</p>;
  return (
    <div className="card overflow-hidden">
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted">
          <tr><th className="px-4 py-2.5 font-medium">Company & role</th><th className="px-4 py-2.5 font-medium">Stage</th><th className="px-4 py-2.5 font-medium">Deadline</th><th className="px-4 py-2.5 font-medium">Next action</th><th className="px-4 py-2.5 font-medium">Resume</th><th className="w-10" /></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {apps.map((a) => (
            <tr key={a.id} className="cursor-pointer hover:bg-surface-2" onClick={() => onOpen(a.id)}>
              <td className="px-4 py-3"><p className="font-medium">{a.company}</p><p className="text-xs text-muted">{a.role}{a.location && ` · ${a.location}`}</p></td>
              <td className="px-4 py-3"><Badge dot>{a.status_label}</Badge></td>
              <td className="px-4 py-3 text-muted">{formatDate(a.deadline)}</td>
              <td className="px-4 py-3 text-muted">{a.next_action || "—"}{a.next_action_date && <span className="block text-xs">{formatDate(a.next_action_date)}</span>}</td>
              <td className="max-w-[160px] truncate px-4 py-3 text-xs text-muted">{a.resume_label ?? "—"}</td>
              <td className="px-2" onClick={(e) => e.stopPropagation()}><StatusMenu a={a} onMove={onMove} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-line md:hidden">
        {apps.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(a.id)}>
              <p className="truncate font-medium">{a.company}</p>
              <p className="truncate text-xs text-muted">{a.role} · {a.status_label}{a.deadline ? ` · due ${formatDate(a.deadline)}` : ""}</p>
            </button>
            <StatusMenu a={a} onMove={onMove} />
          </li>
        ))}
      </ul>
    </div>
  );
}

type FormState = Partial<Application>;
const emptyForm = (): FormState => ({ company: "", role: "", job_url: "", location: "", work_mode: "", status: "interested", saved_on: todayISO(), deadline: null });

function ApplicationFields({ f, set, errors }: { f: FormState; set: (p: FormState) => void; errors?: any }) {
  const versions = useQuery({ queryKey: ["all-versions"], queryFn: () => api.get<(Version & { resume_id: number; resume_title: string })[]>("/resume-versions/") });
  const letters = useQuery({ queryKey: ["cover-letters"], queryFn: () => api.get<Paginated<CoverLetter>>("/cover-letters/?page_size=100") });
  const err = (k: string) => errors?.field?.(k);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company" required error={err("company")}>{(id) => <Input id={id} value={f.company ?? ""} onChange={(e) => set({ company: e.target.value })} />}</Field>
      <Field label="Role" required error={err("role")}>{(id) => <Input id={id} value={f.role ?? ""} onChange={(e) => set({ role: e.target.value })} />}</Field>
      <Field label="Job posting URL" error={err("job_url")} className="sm:col-span-2">{(id) => <Input id={id} type="url" value={f.job_url ?? ""} onChange={(e) => set({ job_url: e.target.value })} placeholder="https://" />}</Field>
      <Field label="Location">{(id) => <Input id={id} value={f.location ?? ""} onChange={(e) => set({ location: e.target.value })} />}</Field>
      <Field label="Work mode">{(id) => <Select id={id} value={f.work_mode ?? ""} onChange={(e) => set({ work_mode: e.target.value as any })}><option value="">Not specified</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></Select>}</Field>
      <Field label="Stage">{(id) => <Select id={id} value={f.status} onChange={(e) => set({ status: e.target.value as AppStatus })}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>}</Field>
      <Field label="Date saved" error={err("saved_on")}>{(id) => <Input id={id} type="date" value={f.saved_on ?? ""} onChange={(e) => set({ saved_on: e.target.value })} />}</Field>
      <Field label="Deadline" error={err("deadline")}>{(id) => <Input id={id} type="date" value={f.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value || null })} />}</Field>
      <Field label="Applied on">{(id) => <Input id={id} type="date" value={f.applied_on ?? ""} onChange={(e) => set({ applied_on: e.target.value || null })} />}</Field>
      <Field label="Resume version sent" className="sm:col-span-2" hint="Links the exact snapshot, so later edits don't change what you sent.">
        {(id) => <Select id={id} value={f.resume_version ?? ""} onChange={(e) => set({ resume_version: e.target.value ? Number(e.target.value) : null })}><option value="">Not linked</option>{versions.data?.map((v) => <option key={v.id} value={v.id}>{v.resume_title} · v{v.number}{v.label ? ` · ${v.label}` : ""}</option>)}</Select>}
      </Field>
      <Field label="Cover letter" className="sm:col-span-2">
        {(id) => <Select id={id} value={f.cover_letter ?? ""} onChange={(e) => set({ cover_letter: e.target.value ? Number(e.target.value) : null })}><option value="">Not linked</option>{letters.data?.results.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</Select>}
      </Field>
    </div>
  );
}

function ApplicationForm({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(emptyForm);
  const create = useMutation({
    meta: { silent: true },
    mutationFn: () => api.post<Application>("/applications/", f),
    onSuccess: () => { toast.success("Application added"); qc.invalidateQueries({ queryKey: ["applications"] }); qc.invalidateQueries({ queryKey: ["app-insights"] }); onOpenChange(false); setF(emptyForm()); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add application" size="lg"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!f.company?.trim() || !f.role?.trim()} loading={create.isPending} onClick={() => create.mutate()}>Add</Button></>}>
      <ApplicationFields f={f} set={(p) => setF({ ...f, ...p })} errors={create.error} />
    </Dialog>
  );
}

function DetailDrawer({ id, onClose, onSuggestion }: { id: number; onClose: () => void; onSuggestion: (a: Application, s: any) => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["application", id], queryFn: () => api.get<Application>(`/applications/${id}/`) });
  const [f, setF] = useState<FormState | null>(null);
  const [tab, setTab] = useState("details");
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["applications"] }); qc.invalidateQueries({ queryKey: ["application", id] }); qc.invalidateQueries({ queryKey: ["app-events", id] }); qc.invalidateQueries({ queryKey: ["app-insights"] }); };
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => api.patch<Application>(`/applications/${id}/`, f),
    onSuccess: (a) => { toast.success("Saved"); invalidate(); if (q.data?.status !== "applied" && a.status === "applied") onSuggestion(a, { title: `Follow up with ${a.company} about ${a.role}`, due_at: new Date(Date.now() + 7 * 864e5).toISOString(), days: 7 }); },
  });
  const del = useMutation({ mutationFn: () => api.del(`/applications/${id}/`), onSuccess: () => { toast.success("Application deleted"); invalidate(); onClose(); } });
  return (
    <Drawer open onOpenChange={(v) => !v && onClose()} title={q.data ? `${q.data.role} · ${q.data.company}` : "Application"} description={q.data ? `Saved ${formatDate(q.data.saved_on)} · ${q.data.status_label}` : undefined} width="max-w-2xl"
      footer={tab === "details" && <>
        <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm({ title: "Delete this application?", description: "Its timeline and reminders will be deleted too.", confirmLabel: "Delete" })) del.mutate(); }}>Delete</Button>
        {q.data?.status !== "archived" && <Button variant="secondary" onClick={() => { setF({ ...f, status: "archived" }); }}>Archive</Button>}
        <Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>
      </>}>
      {!f ? <Skeleton className="h-64" /> : (
        <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "details", label: "Details" }, { value: "timeline", label: "Timeline" }, { value: "reminders", label: "Reminders", count: q.data?.open_reminders }, { value: "notes", label: "Contacts & notes" }]}>
          <TabPanel value="details">
            {q.data?.job_url && <a href={q.data.job_url} target="_blank" rel="noopener noreferrer" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-fg"><ExternalLink className="size-3.5" /> Open job posting</a>}
            <ApplicationFields f={f} set={(p) => setF({ ...f, ...p })} errors={save.error} />
            {q.data?.job_description && (
              <Link to={`/app/job-match?jd=${q.data.job_description}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-fg"><Target className="size-3.5" /> Match a resume to this job</Link>
            )}
          </TabPanel>
          <TabPanel value="timeline"><Timeline id={id} /></TabPanel>
          <TabPanel value="reminders"><Reminders appId={id} /></TabPanel>
          <TabPanel value="notes">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recruiter / contact">{(fid) => <Input id={fid} value={f.recruiter_name ?? ""} onChange={(e) => setF({ ...f, recruiter_name: e.target.value })} />}</Field>
              <Field label="Contact email" error={(save.error as any)?.field?.("recruiter_email")}>{(fid) => <Input id={fid} type="email" value={f.recruiter_email ?? ""} onChange={(e) => setF({ ...f, recruiter_email: e.target.value })} />}</Field>
              <Field label="Contact phone">{(fid) => <Input id={fid} value={f.recruiter_phone ?? ""} onChange={(e) => setF({ ...f, recruiter_phone: e.target.value })} />}</Field>
              <Field label="Salary / compensation note">{(fid) => <Input id={fid} value={f.salary_note ?? ""} onChange={(e) => setF({ ...f, salary_note: e.target.value })} />}</Field>
              <Field label="Next action" className="sm:col-span-2">{(fid) => <Input id={fid} value={f.next_action ?? ""} onChange={(e) => setF({ ...f, next_action: e.target.value })} placeholder="e.g. Send portfolio link" />}</Field>
              <Field label="Next action date">{(fid) => <Input id={fid} type="date" value={f.next_action_date ?? ""} onChange={(e) => setF({ ...f, next_action_date: e.target.value || null })} />}</Field>
              <Field label="Notes" className="sm:col-span-2" hint="Private to you.">{(fid, d) => <Textarea id={fid} aria-describedby={d} rows={6} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
            </div>
            <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </TabPanel>
        </Tabs>
      )}
    </Drawer>
  );
}

function Timeline({ id }: { id: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["app-events", id], queryFn: () => api.get<AppEvent[]>(`/applications/${id}/events/`) });
  const [ev, setEv] = useState({ kind: "interview", title: "", occurs_at: "", note: "" });
  const add = useMutation({
    mutationFn: () => api.post(`/applications/${id}/events/`, { ...ev, occurs_at: ev.occurs_at ? new Date(ev.occurs_at).toISOString() : null }),
    onSuccess: () => { toast.success(ev.kind === "interview" && ev.occurs_at ? "Added — a reminder is set for 24 hours before" : "Added to timeline"); setEv({ kind: "interview", title: "", occurs_at: "", note: "" }); qc.invalidateQueries({ queryKey: ["app-events", id] }); qc.invalidateQueries({ queryKey: ["reminders", id] }); },
  });
  return (
    <div>
      <form className="mb-6 grid gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Field label="Event">{(fid) => <Select id={fid} value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value })}><option value="interview">Interview</option><option value="assessment">Assessment</option><option value="follow_up">Follow-up</option><option value="note">Note</option><option value="deadline">Deadline</option></Select>}</Field>
        <Field label="When (optional)">{(fid) => <Input id={fid} type="datetime-local" value={ev.occurs_at} onChange={(e) => setEv({ ...ev, occurs_at: e.target.value })} />}</Field>
        <Field label="Title" className="sm:col-span-2">{(fid) => <Input id={fid} value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="e.g. Technical round with engineering manager" required />}</Field>
        <div className="sm:col-span-2"><Button type="submit" size="sm" icon={<CalendarPlus className="size-4" />} loading={add.isPending} disabled={!ev.title.trim()}>Add to timeline</Button></div>
      </form>
      {q.isLoading ? <Skeleton className="h-32" /> : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {q.data?.map((e) => (
            <li key={e.id} className="relative">
              <span className={cn("absolute -left-[26px] top-1 size-3 rounded-full ring-4 ring-surface", e.kind === "status" ? "bg-brand-500" : e.kind === "interview" ? "bg-amber-500" : "bg-line-strong")} />
              <p className="text-sm font-medium">{e.title}</p>
              <p className="text-xs text-muted">{e.kind_label}{e.occurs_at ? ` · ${formatDateTime(e.occurs_at)}` : ""} · recorded {formatDateTime(e.created_at)}</p>
              {e.note && <p className="mt-1 text-sm text-fg-2">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Reminders({ appId }: { appId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["reminders", appId], queryFn: () => api.get<Paginated<Reminder>>(`/reminders/?application=${appId}&page_size=50`) });
  const [r, setR] = useState({ title: "", due_at: "" });
  const inv = () => { qc.invalidateQueries({ queryKey: ["reminders", appId] }); qc.invalidateQueries({ queryKey: ["applications"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const add = useMutation({ mutationFn: () => api.post("/reminders/", { application: appId, title: r.title, due_at: new Date(r.due_at).toISOString(), kind: "custom" }), onSuccess: () => { setR({ title: "", due_at: "" }); inv(); } });
  const toggle = useMutation({ mutationFn: (x: Reminder) => api.patch(`/reminders/${x.id}/`, { done: !x.done }), onSuccess: inv });
  const del = useMutation({ mutationFn: (x: Reminder) => api.del(`/reminders/${x.id}/`), onSuccess: inv });
  return (
    <div>
      <form className="mb-5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Input aria-label="Reminder" value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} placeholder="e.g. Follow up with recruiter" required />
        <Input aria-label="Due" type="datetime-local" value={r.due_at} onChange={(e) => setR({ ...r, due_at: e.target.value })} required className="sm:w-56" />
        <Button type="submit" loading={add.isPending} disabled={!r.title || !r.due_at}>Add</Button>
      </form>
      {q.data?.results.length === 0 && <p className="text-sm text-muted">No reminders for this application.</p>}
      <ul className="space-y-2">
        {q.data?.results.map((x) => (
          <li key={x.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
            <button onClick={() => toggle.mutate(x)} className={cn("grid size-5 place-items-center rounded-md border", x.done ? "border-success bg-success text-white" : "border-line-strong")} aria-label={x.done ? "Mark not done" : "Mark done"}>{x.done && <Check className="size-3.5" />}</button>
            <span className={cn("min-w-0 flex-1", x.done && "text-muted line-through")}>
              <span className="block truncate text-sm">{x.title}</span>
              <span className="block text-xs text-muted">{formatDateTime(x.due_at)}</span>
            </span>
            <IconButton size="sm" label="Delete reminder" onClick={() => del.mutate(x)}><Trash2 className="size-3.5" /></IconButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestReminder({ app, s, onClose }: { app: Application; s: { title: string; due_at: string; days: number }; onClose: () => void }) {
  const qc = useQueryClient();
  const [due, setDue] = useState(() => toLocalInput(s.due_at));
  const create = useMutation({
    mutationFn: () => api.post("/reminders/", { application: app.id, title: s.title, due_at: new Date(due).toISOString(), kind: "follow_up" }),
    onSuccess: () => { toast.success("Follow-up reminder set"); qc.invalidateQueries({ queryKey: ["applications"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); onClose(); },
  });
  const local = useMemo(() => due, [due]);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Set a follow-up reminder?" description={`Suggested ${s.days} days after applying — you can change the default in Settings.`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>No thanks</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Set reminder</Button></>}>
      <Field label="Remind me on">{(id) => <Input id={id} type="datetime-local" value={local} onChange={(e) => setDue(e.target.value)} />}</Field>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><MapPin className="size-3" /> {app.company} · {app.role}</p>
    </Dialog>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

