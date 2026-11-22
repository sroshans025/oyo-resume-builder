import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Plus, Timer, Trash2 } from "lucide-react";
import { api, type Paginated } from "@/lib/api";
import type { InterviewSession, JobDescription, ResumeSummary } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, EmptyState, ErrorState, ProgressBar, SkeletonCards } from "@/components/ui/Feedback";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Switch } from "@/components/ui/Form";
import { Dialog, useConfirm } from "@/components/ui/Overlay";

export default function Interview() {
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => api.get<Paginated<InterviewSession>>("/interview-sessions/?page_size=50") });
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const del = useMutation({ mutationFn: (id: number) => api.del(`/interview-sessions/${id}/`), onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }) });
  return (
    <div>
      <PageHeader title="Interview practice" description="Questions grounded in the job description and your own resume, a STAR answer builder, and feedback on a transparent five-part rubric."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New practice session</Button>} />
      <Callout tone="info" className="mb-6">Feedback is practice guidance based on what you write — it isn't a prediction of how an interviewer will assess you.</Callout>
      {q.isLoading ? <SkeletonCards /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.results.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="size-6" />} title="Start practising" description="Pick a saved job description and resume to generate likely questions, then answer in your own words." action={<Button onClick={() => setOpen(true)} icon={<Plus className="size-4" />}>New session</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.results.map((s) => (
            <div key={s.id} className="card relative p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <div className="flex items-start gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-fg"><MessagesSquare className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <Link to={`/app/interview/${s.id}`} className="block truncate font-semibold after:absolute after:inset-0 hover:text-brand-fg">{s.title}</Link>
                  <p className="truncate text-sm text-muted">{s.job_title ?? s.target_role ?? "General practice"}</p>
                </div>
                <IconButton size="sm" className="relative z-10" label="Delete session" onClick={async () => { if (await confirm({ title: "Delete this session and its answers?", confirmLabel: "Delete" })) del.mutate(s.id); }}><Trash2 className="size-3.5" /></IconButton>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted"><span>{s.answered_count}/{s.question_count} answered</span><span>{relativeTime(s.updated_at)}</span></div>
                <ProgressBar value={s.question_count ? (s.answered_count / s.question_count) * 100 : 0} className="mt-1.5" label="Answered" />
              </div>
              <div className="mt-3 flex gap-1.5">
                <Badge>{s.mode === "mock" ? "Mock interview" : "Practice"}</Badge>
                {s.timed && <Badge tone="warning"><Timer className="size-3" />{Math.round(s.seconds_per_question / 60)} min</Badge>}
                <Badge tone={s.generated_by === "ai" ? "brand" : "neutral"}>{s.generated_by === "ai" ? "AI questions" : "Offline questions"}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
      <NewSession open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewSession({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const jds = useQuery({ queryKey: ["jds"], queryFn: () => api.get<Paginated<JobDescription>>("/job-descriptions/?page_size=100"), enabled: open });
  const resumes = useQuery({ queryKey: ["resumes", "active", ""], queryFn: () => api.get<Paginated<ResumeSummary>>("/resumes/?page_size=100"), enabled: open });
  const [f, setF] = useState({ title: "", target_role: "", job_description: "", resume: "", mode: "practice", timed: false, seconds_per_question: 120, question_count: 8 });
  const create = useMutation({
    mutationFn: () => api.post<InterviewSession>("/interview-sessions/", {
      ...f, title: f.title || `${f.target_role || "Interview"} practice`, job_description: f.job_description ? Number(f.job_description) : null, resume: f.resume ? Number(f.resume) : null,
    }),
    onSuccess: (s) => { onOpenChange(false); navigate(`/app/interview/${s.id}`); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New practice session" size="lg"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Generate questions</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target role">{(id) => <Input id={id} value={f.target_role} onChange={(e) => setF({ ...f, target_role: e.target.value })} />}</Field>
        <Field label="Session name (optional)">{(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <Field label="Job description" hint="Technical questions come from its requirements.">{(id) => <Select id={id} value={f.job_description} onChange={(e) => { const jd = jds.data?.results.find((j) => String(j.id) === e.target.value); setF({ ...f, job_description: e.target.value, target_role: f.target_role || jd?.display_title || "" }); }}><option value="">None — general questions</option>{jds.data?.results.map((j) => <option key={j.id} value={j.id}>{j.display_title}</option>)}</Select>}</Field>
        <Field label="Resume" hint="Role questions probe your own projects.">{(id) => <Select id={id} value={f.resume} onChange={(e) => setF({ ...f, resume: e.target.value })}><option value="">None</option>{resumes.data?.results.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>}</Field>
        <Field label="Number of questions">{(id) => <Select id={id} value={f.question_count} onChange={(e) => setF({ ...f, question_count: Number(e.target.value) })}>{[5, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}</Select>}</Field>
        <Field label="Mode">{(id) => <Select id={id} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="practice">Practice — see questions, answer any order</option><option value="mock">Mock interview — one at a time</option></Select>}</Field>
        <div className="sm:col-span-2 rounded-xl border border-line bg-surface-2 p-4">
          <Switch checked={f.timed} onCheckedChange={(v) => setF({ ...f, timed: v })} label="Timed practice" description="Shows a countdown per question. Your answer is never auto-submitted." />
          {f.timed && <Field label="Time per question" className="mt-3 w-56">{(id) => <Select id={id} value={f.seconds_per_question} onChange={(e) => setF({ ...f, seconds_per_question: Number(e.target.value) })}>{[60, 90, 120, 180, 300].map((s) => <option key={s} value={s}>{s >= 120 ? `${s / 60} minutes` : `${s} seconds`}</option>)}</Select>}</Field>}
        </div>
      </div>
    </Dialog>
  );
}
