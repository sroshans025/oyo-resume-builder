import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, CornerDownLeft, HelpCircle, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AIResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Drawer, Tabs } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Badge, Callout } from "@/components/ui/Feedback";

export type StudioMode = "bullet" | "summary" | "project" | "achievement" | "verbs" | "proofread";

export interface StudioContext {
  resumeId?: number;
  text?: string;
  role?: string;
  organization?: string;
  tools?: string;
  targetRole?: string;
  project?: { name: string; tools: string };
  /** Called with accepted text. Only invoked on an explicit user click. */
  onApply?: (text: string) => void;
  applyLabel?: string;
}

const TONES = [
  ["professional", "Professional"],
  ["concise", "Concise"],
  ["technical", "Technical"],
  ["leadership", "Leadership-focused"],
  ["fresher", "Fresher-friendly"],
];

const MODES: { value: StudioMode; label: string }[] = [
  { value: "bullet", label: "Bullet" },
  { value: "summary", label: "Summary" },
  { value: "project", label: "Project" },
  { value: "achievement", label: "Achievement" },
  { value: "verbs", label: "Action verbs" },
  { value: "proofread", label: "Proofread" },
];

export function AIStudio({
  open,
  onOpenChange,
  mode: initialMode,
  ctx,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: StudioMode;
  ctx: StudioContext;
}) {
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [tone, setTone] = useState("professional");
  const [text, setText] = useState(ctx.text ?? "");
  const [targetRole, setTargetRole] = useState(ctx.targetRole ?? "");
  const [project, setProject] = useState({ name: ctx.project?.name ?? "", problem: "", approach: "", tools: ctx.project?.tools ?? "", outcome: "" });
  const [achievement, setAchievement] = useState({ context: "", notes: ctx.text ?? "" });
  const [result, setResult] = useState<AIResult<any> | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setText(ctx.text ?? "");
      setTargetRole(ctx.targetRole ?? "");
      setProject((p) => ({ ...p, name: ctx.project?.name ?? p.name, tools: ctx.project?.tools ?? p.tools }));
      setAchievement({ context: "", notes: ctx.text ?? "" });
      setResult(null);
    }
  }, [open, initialMode, ctx.text, ctx.targetRole, ctx.project?.name, ctx.project?.tools]);

  const run = useMutation({
    mutationFn: async () => {
      switch (mode) {
        case "bullet":
          return api.post<AIResult<any>>("/ai/bullet/", { text, role: ctx.role ?? "", organization: ctx.organization ?? "", tools: ctx.tools ?? "", tone });
        case "summary":
          return api.post<AIResult<any>>("/ai/summary/", { resume_id: ctx.resumeId, target_role: targetRole, tone });
        case "project":
          return api.post<AIResult<any>>("/ai/project/", { ...project, tone });
        case "achievement":
          return api.post<AIResult<any>>("/ai/achievement/", { ...achievement, tone });
        case "verbs":
          return api.post<AIResult<any>>("/ai/verbs/", { text });
        case "proofread":
          return api.post<AIResult<any>>("/ai/proofread/", { text });
      }
    },
    onSuccess: (r) => setResult(r ?? null),
  });

  const feedback = (outcome: "accepted" | "edited" | "rejected") => {
    if (result?.log_id) api.post("/ai/feedback/", { log_id: result.log_id, outcome }).catch(() => undefined);
  };
  const apply = (value: string) => {
    if (!ctx.onApply) {
      navigator.clipboard?.writeText(value);
      toast.success("Copied to clipboard");
      feedback("accepted");
      return;
    }
    ctx.onApply(value);
    feedback("accepted");
    toast.success("Applied — review it in the editor");
    onOpenChange(false);
  };

  const canRun =
    mode === "summary" ? !!ctx.resumeId :
    mode === "project" ? project.name.trim().length > 0 :
    mode === "achievement" ? achievement.notes.trim().length > 5 :
    text.trim().length > 2;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-brand-500" /> Writing Studio</span>}
      description="Drafts built from your own facts. Nothing changes until you choose to apply it."
      width="max-w-2xl"
    >
      <Tabs value={mode} onValueChange={(v) => { setMode(v as StudioMode); setResult(null); }} tabs={MODES} />
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canRun) run.mutate();
        }}
      >
        {(mode === "bullet" || mode === "verbs" || mode === "proofread") && (
          <Field label={mode === "proofread" ? "Text to review" : "Your bullet point"} hint={mode === "bullet" ? "Keep the facts — we'll restructure the wording." : undefined}>
            {(id) => <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={mode === "proofread" ? 8 : 3} maxLength={mode === "proofread" ? 6000 : 600} />}
          </Field>
        )}
        {mode === "summary" && (
          <>
            <Field label="Target role" hint="Summaries use only facts already on this resume.">
              {(id) => <Input id={id} value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Data Analyst" />}
            </Field>
            {!ctx.resumeId && <Callout tone="warning">Open a resume to draft a summary from its content.</Callout>}
          </>
        )}
        {mode === "project" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project name" required>{(id) => <Input id={id} value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} />}</Field>
            <Field label="Tools">{(id) => <Input id={id} value={project.tools} onChange={(e) => setProject({ ...project, tools: e.target.value })} placeholder="React, PostgreSQL" />}</Field>
            <Field label="Problem" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={project.problem} onChange={(e) => setProject({ ...project, problem: e.target.value })} placeholder="What problem did it solve?" />}</Field>
            <Field label="Approach" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={project.approach} onChange={(e) => setProject({ ...project, approach: e.target.value })} placeholder="What did you build or do?" />}</Field>
            <Field label="Outcome" className="sm:col-span-2" hint="Only real results — leave blank if unsure.">{(id) => <Textarea id={id} rows={2} value={project.outcome} onChange={(e) => setProject({ ...project, outcome: e.target.value })} />}</Field>
          </div>
        )}
        {mode === "achievement" && (
          <>
            <Field label="Context (optional)">{(id) => <Input id={id} value={achievement.context} onChange={(e) => setAchievement({ ...achievement, context: e.target.value })} placeholder="e.g. the university robotics club" />}</Field>
            <Field label="Your notes" hint="What happened, what you did, and what changed. Include real numbers only if you know them.">
              {(id) => <Textarea id={id} rows={5} value={achievement.notes} onChange={(e) => setAchievement({ ...achievement, notes: e.target.value })} />}
            </Field>
          </>
        )}
        <div className="flex flex-wrap items-end gap-3">
          {mode !== "verbs" && mode !== "proofread" && (
            <Field label="Tone" className="w-48">
              {(id) => (
                <Select id={id} value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Button type="submit" loading={run.isPending} disabled={!canRun} icon={<Wand2 className="size-4" />}>
            {mode === "proofread" ? "Review text" : "Generate drafts"}
          </Button>
        </div>
      </form>

      {result && <ResultView mode={mode} result={result} onApply={apply} applyLabel={ctx.onApply ? ctx.applyLabel ?? "Use this" : "Copy"} onReject={() => { feedback("rejected"); setResult(null); }} />}
    </Drawer>
  );
}

function ResultView({ mode, result, onApply, applyLabel, onReject }: { mode: StudioMode; result: AIResult<any>; onApply: (t: string) => void; applyLabel: string; onReject: () => void }) {
  const r = result.result;
  const [edits, setEdits] = useState<Record<number, string>>({});
  const options: string[] =
    mode === "bullet" ? r.suggestions.map((s: any) => s.text) :
    mode === "summary" ? r.drafts.map((s: any) => s.text) :
    mode === "project" ? [r.description, ...r.bullets] :
    mode === "achievement" ? [r.statement] : [];
  const rationales: string[] = mode === "bullet" ? r.suggestions.map((s: any) => s.rationale) : mode === "summary" ? r.drafts.map((s: any) => s.rationale) : [];

  return (
    <section className="mt-6 space-y-4 border-t border-line pt-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={result.mode === "ai" ? "brand" : "neutral"}>{result.mode === "ai" ? <Sparkles className="size-3" /> : null}{result.provider}</Badge>
        <span className="text-xs text-muted">{result.label}</span>
      </div>
      {result.notice && <Callout tone="info">{result.notice.message}</Callout>}
      {result.warnings.map((w) => (
        <Callout key={w.code} tone="warning" title={w.code === "unsupported_numbers" ? "Unverified numbers removed" : w.code === "unsupported_skills" ? "Check these skills" : "Note"}>
          {w.message}
        </Callout>
      ))}

      {options.length > 0 && (
        <ul className="space-y-3">
          {options.map((opt, i) => {
            const value = edits[i] ?? opt;
            const hasPlaceholder = /\[[^\]]+\]/.test(value);
            return (
              <li key={i} className="rounded-xl border border-line bg-surface-2 p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {mode === "project" ? (i === 0 ? "Description" : `Bullet ${i}`) : `Option ${i + 1}`}
                  </span>
                  {hasPlaceholder && <Badge tone="warning"><AlertTriangle className="size-3" /> Fill placeholder</Badge>}
                </div>
                <Textarea
                  aria-label={`Editable draft ${i + 1}`}
                  value={value}
                  onChange={(e) => setEdits({ ...edits, [i]: e.target.value })}
                  rows={Math.min(6, Math.max(2, Math.ceil(value.length / 80)))}
                  className="bg-surface"
                />
                {rationales[i] && <p className="mt-2 text-xs text-muted">{rationales[i]}</p>}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" icon={applyLabel === "Copy" ? <Copy className="size-3.5" /> : <CornerDownLeft className="size-3.5" />} onClick={() => onApply(value)}>
                    {applyLabel}
                  </Button>
                  {edits[i] != null && edits[i] !== opt && <span className="self-center text-xs text-muted">Edited</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mode === "verbs" && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {r.verbs.map((v: any) => (
            <li key={v.verb + v.example}>
              <button onClick={() => onApply(v.example)} className="w-full rounded-lg border border-line bg-surface-2 p-3 text-left transition hover:border-brand-300">
                <span className="font-semibold text-brand-fg">{v.verb}</span>
                <span className="mt-0.5 block text-xs text-muted">{v.example}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mode === "proofread" &&
        (r.issues.length === 0 ? (
          <Callout tone="success" title="No issues found">Automated checks didn't flag anything. Still read it once more yourself.</Callout>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {r.issues.map((i: any, idx: number) => (
              <li key={idx} className="flex gap-3 p-3 text-sm">
                <Badge tone={i.type === "spelling" ? "danger" : i.type === "style" ? "violet" : "warning"} className="h-fit capitalize">{i.type}</Badge>
                <div>
                  <p><span className="rounded bg-surface-3 px-1 font-mono text-xs">{i.excerpt}</span>{i.suggestion && <> → <strong>{i.suggestion}</strong></>}</p>
                  <p className="mt-0.5 text-xs text-muted">{i.explanation}</p>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {r.questions?.length > 0 && (
        <div className="rounded-xl border border-brand-500/20 bg-brand-soft/50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><HelpCircle className="size-4 text-brand-500" /> To make this stronger, answer:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-2">
            {r.questions.map((q: string) => <li key={q}>{q}</li>)}
          </ul>
        </div>
      )}
      {(options.length > 0 || mode === "verbs") && (
        <button onClick={onReject} className={cn("inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg")}>
          <Check className="size-3" /> None of these fit — dismiss
        </button>
      )}
    </section>
  );
}
