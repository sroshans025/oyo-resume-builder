import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, History, Lightbulb, ListChecks, Plus, RefreshCw, Send, Star, Timer, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AIResult, Answer, InterviewSession as Session, Question } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, ErrorState, FullPageLoader } from "@/components/ui/Feedback";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Dialog, Drawer } from "@/components/ui/Overlay";

const CAT: Record<Question["category"], { label: string; tone: "brand" | "violet" | "warning" }> = {
  technical: { label: "Technical", tone: "brand" }, behavioral: { label: "Behavioural", tone: "violet" }, role: { label: "Role-specific", tone: "warning" },
};

export default function InterviewSession() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["session", id], queryFn: () => api.get<Session>(`/interview-sessions/${id}/`) });
  const [idx, setIdx] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const more = useMutation({
    mutationFn: () => api.post<Session & { notice: any }>(`/interview-sessions/${id}/regenerate/`, { count: 4 }),
    onSuccess: (s) => { qc.setQueryData(["session", id], s); toast.success("Added more questions"); },
  });
  if (q.isLoading) return <FullPageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data!;
  const questions = s.questions ?? [];
  const current = questions[Math.min(idx, questions.length - 1)];

  return (
    <div>
      <PageHeader crumbs={[{ label: "Interview practice", to: "/app/interview" }, { label: s.title }]} title={s.title}
        description={`${s.job_title ?? s.target_role ?? "General"} · ${s.answered_count}/${questions.length} answered · ${s.generated_by === "ai" ? "AI-generated questions" : "Offline question generator"}`}
        actions={<>
          <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>Own question</Button>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} loading={more.isPending} onClick={() => more.mutate()}>More questions</Button>
        </>} />
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <aside className={cn("card h-fit p-2", s.mode === "mock" && "hidden lg:block")}>
          <ol className="space-y-0.5">
            {questions.map((qq, i) => (
              <li key={qq.id}>
                <button onClick={() => setIdx(i)} className={cn("flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition", i === idx ? "bg-brand-soft" : "hover:bg-surface-2")} aria-current={i === idx}>
                  {qq.latest_answer ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Answered" /> : <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-line-strong text-[9px] text-muted">{i + 1}</span>}
                  <span className={cn("line-clamp-2", s.mode === "mock" && !qq.latest_answer && i !== idx && "blur-[3px]")}>{qq.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
        {current && <QuestionPanel key={current.id} q={current} session={s} index={idx} total={questions.length} onPrev={() => setIdx(Math.max(0, idx - 1))} onNext={() => setIdx(Math.min(questions.length - 1, idx + 1))} />}
      </div>
      <AddQuestion open={addOpen} onOpenChange={setAddOpen} sessionId={Number(id)} />
    </div>
  );
}

function QuestionPanel({ q, session, index, total, onPrev, onNext }: { q: Question; session: Session; index: number; total: number; onPrev: () => void; onNext: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState(q.latest_answer?.text ?? "");
  const [starOpen, setStarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [result, setResult] = useState<Answer | null>(q.latest_answer);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const started = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - (started.current ?? Date.now())) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [running]);
  const remaining = session.seconds_per_question - elapsed;
  const submit = useMutation({
    mutationFn: () => api.post<Answer>(`/interview-questions/${q.id}/answers/`, { text, duration_seconds: started.current ? elapsed : null }),
    onSuccess: (a) => { setResult(a); setRunning(false); qc.invalidateQueries({ queryKey: ["session", String(session.id)] }); qc.invalidateQueries({ queryKey: ["sessions"] }); },
  });
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <section className="min-w-0 space-y-5" aria-label={`Question ${index + 1}`}>
      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">Question {index + 1} of {total}</span>
          <Badge tone={CAT[q.category].tone}>{CAT[q.category].label}</Badge>
          {q.source === "user" && <Badge>Your question</Badge>}
        </div>
        <h2 className="mt-3 text-xl font-semibold leading-snug">{q.text}</h2>
        {q.why && <p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><Lightbulb className="size-3.5" /> {q.why}</p>}
      </div>
      <div className="card p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Your answer</p>
          {session.timed && (
            <span className={cn("ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", !running ? "bg-surface-3 text-muted" : remaining < 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : remaining < 20 ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-brand-soft text-brand-fg")} role="timer" aria-live="off">
              <Timer className="size-3.5" />{running ? `${remaining < 0 ? "+" : ""}${Math.floor(Math.abs(remaining) / 60)}:${String(Math.abs(remaining) % 60).padStart(2, "0")}` : `${Math.round(session.seconds_per_question / 60)} min`}
            </span>
          )}
          {session.timed && !running && <Button size="xs" variant="subtle" onClick={() => { started.current = Date.now(); setElapsed(0); setRunning(true); }}>Start timer</Button>}
        </div>
        <Textarea aria-label="Your answer" rows={10} value={text} maxLength={6000} onChange={(e) => { setText(e.target.value); if (session.timed && !running && !started.current) { started.current = Date.now(); setRunning(true); } }}
          placeholder="Answer as you would out loud. For behavioural questions, try Situation → Task → Action → Result, and say what *you* did." />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{words} words · ~{Math.max(1, Math.round(words / 140))} min spoken</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={<ListChecks className="size-4" />} onClick={() => setStarOpen(true)}>STAR builder</Button>
            {q.attempts > 0 && <Button variant="ghost" size="sm" icon={<History className="size-4" />} onClick={() => setHistoryOpen(true)}>History ({q.attempts})</Button>}
            <Button size="sm" icon={<Send className="size-4" />} loading={submit.isPending} disabled={words < 3} onClick={() => submit.mutate()}>Get feedback</Button>
          </div>
        </div>
      </div>
      {result && <Feedback a={result} />}
      <div className="flex justify-between">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={index === 0} onClick={onPrev}>Previous</Button>
        <Button variant="secondary" iconRight={<ArrowRight className="size-4" />} disabled={index === total - 1} onClick={onNext}>Next question</Button>
      </div>
      <StarBuilder open={starOpen} onOpenChange={setStarOpen} question={q.text} onUse={(t) => setText(t)} />
      <HistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} questionId={q.id} onUse={(t) => { setText(t); setHistoryOpen(false); }} />
    </section>
  );
}

function Feedback({ a }: { a: Answer }) {
  const r = a.rubric;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-6 py-4">
        <div>
          <p className="text-xs font-medium text-muted">Rubric total</p>
          <p className="font-display text-3xl font-bold tabular-nums">{r.total}<span className="text-base font-medium text-muted">/{r.max}</span></p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(r.star_detected).map(([k, v]) => <Badge key={k} tone={v ? "success" : "neutral"}>{v ? "✓" : "–"} {k[0].toUpperCase() + k.slice(1)}</Badge>)}
        </div>
        <Badge className="ml-auto">{a.feedback.provider}</Badge>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-5">
        {r.criteria.map((c) => (
          <div key={c.key} className="bg-surface p-4">
            <p className="text-xs font-medium text-muted">{c.label}</p>
            <div className="mt-1.5 flex gap-0.5" aria-label={`${c.score} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={cn("h-1.5 flex-1 rounded-full", n <= c.score ? (c.score >= 4 ? "bg-success" : c.score >= 3 ? "bg-warning" : "bg-danger") : "bg-surface-3")} />)}</div>
            <p className="mt-2 text-xs leading-relaxed text-fg-2">{c.note}</p>
          </div>
        ))}
      </div>
      <div className="space-y-4 p-6 text-sm">
        {a.feedback.notice && <Callout tone="info">{a.feedback.notice.message}</Callout>}
        <p>{a.feedback.summary}</p>
        {r.needs_concrete_example && <Callout tone="warning" title="Needs a concrete example">Ground this answer in a specific time you did it — what *you* did and what happened.</Callout>}
        <div className="grid gap-4 sm:grid-cols-2">
          {a.feedback.strengths.length > 0 && <div><p className="font-semibold text-success">Strengths</p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-fg-2">{a.feedback.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {a.feedback.improvements.length > 0 && <div><p className="font-semibold text-warning">To improve</p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-fg-2">{a.feedback.improvements.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        </div>
        {r.follow_ups.length > 0 && <div><p className="font-semibold">Likely follow-up questions</p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-fg-2">{r.follow_ups.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        <p className="text-xs text-muted">{r.disclaimer}</p>
      </div>
    </div>
  );
}

function StarBuilder({ open, onOpenChange, question, onUse }: { open: boolean; onOpenChange: (v: boolean) => void; question: string; onUse: (t: string) => void }) {
  const [notes, setNotes] = useState("");
  const [star, setStar] = useState({ situation: "", task: "", action: "", result: "" });
  const [missing, setMissing] = useState<string[]>([]);
  const organise = useMutation({
    mutationFn: () => api.post<AIResult<any>>("/interview/star/", { question, notes }),
    onSuccess: (r) => { setStar({ situation: r.result.situation, task: r.result.task, action: r.result.action, result: r.result.result }); setMissing(r.result.missing); },
  });
  const compose = () => [star.situation, star.task, star.action, star.result].filter((x) => x.trim()).join(" ");
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="STAR answer builder" description="Organise a real example into Situation, Task, Action and Result. Nothing is added that isn't in your notes."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button><Button disabled={!compose()} onClick={() => { onUse(compose()); onOpenChange(false); }}>Use as my answer</Button></>}>
      <Field label="Rough notes about a real example">{(id) => <Textarea id={id} rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened, what you had to do, what you did, how it turned out…" />}</Field>
      <Button className="mt-3" size="sm" variant="subtle" icon={<Wand2 className="size-4" />} loading={organise.isPending} disabled={notes.trim().length < 10} onClick={() => organise.mutate()}>Organise into STAR</Button>
      {missing.length > 0 && <Callout tone="warning" className="mt-4" title="Missing pieces">{missing.map((m) => <p key={m}>{m}</p>)}</Callout>}
      <div className="mt-5 space-y-3">
        {(["situation", "task", "action", "result"] as const).map((k) => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>{(id) => <Textarea id={id} rows={k === "action" ? 4 : 2} value={star[k]} onChange={(e) => setStar({ ...star, [k]: e.target.value })} />}</Field>
        ))}
      </div>
    </Drawer>
  );
}

function HistoryDrawer({ open, onOpenChange, questionId, onUse }: { open: boolean; onOpenChange: (v: boolean) => void; questionId: number; onUse: (t: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["answers", questionId], queryFn: () => api.get<Answer[]>(`/interview-questions/${questionId}/answers/`), enabled: open });
  const fav = useMutation({ mutationFn: (a: Answer) => api.patch(`/interview-answers/${a.id}/`, { favourite: !a.favourite }), onSuccess: () => qc.invalidateQueries({ queryKey: ["answers", questionId] }) });
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Practice history" description="Every attempt is saved so you can see your progress.">
      <ul className="space-y-3">
        {q.data?.map((a) => (
          <li key={a.id} className="rounded-xl border border-line">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="font-display text-lg font-bold tabular-nums">{a.rubric.total}<span className="text-xs text-muted">/25</span></span>
              <span className="min-w-0 flex-1 text-xs text-muted">{formatDateTime(a.created_at)}{a.duration_seconds ? ` · ${Math.round(a.duration_seconds / 60)} min` : ""}</span>
              <IconButton size="sm" label={a.favourite ? "Unmark favourite" : "Mark as favourite"} onClick={() => fav.mutate(a)}><Star className={cn("size-4", a.favourite && "fill-amber-400 text-amber-400")} /></IconButton>
              <IconButton size="sm" label="Show answer" onClick={() => setOpenId(openId === a.id ? null : a.id)}><ChevronDown className={cn("size-4 transition", openId === a.id && "rotate-180")} /></IconButton>
            </div>
            {openId === a.id && (
              <div className="border-t border-line px-4 py-3">
                <p className="whitespace-pre-line text-sm text-fg-2">{a.text}</p>
                <Button size="xs" variant="secondary" className="mt-3" onClick={() => onUse(a.text)}>Load into editor</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Drawer>
  );
}

function AddQuestion({ open, onOpenChange, sessionId }: { open: boolean; onOpenChange: (v: boolean) => void; sessionId: number }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("behavioral");
  const add = useMutation({
    mutationFn: () => api.post(`/interview-sessions/${sessionId}/questions/`, { text, category }),
    onSuccess: () => { setText(""); onOpenChange(false); qc.invalidateQueries({ queryKey: ["session", String(sessionId)] }); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add your own question" size="sm"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={text.trim().length < 5} loading={add.isPending} onClick={() => add.mutate()}>Add</Button></>}>
      <div className="space-y-3">
        <Field label="Question">{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={400} />}</Field>
        <Field label="Category">{(id) => <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}><option value="behavioral">Behavioural</option><option value="technical">Technical</option><option value="role">Role-specific</option></Select>}</Field>
      </div>
    </Dialog>
  );
}
