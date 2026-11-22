import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FilePlus2, MessagesSquare, Target, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthActions, useUser } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Field, Input, Switch, TagInput } from "@/components/ui/Form";
import { Callout } from "@/components/ui/Feedback";

const LEVELS: [Profile["experience_level"], string, string][] = [
  ["student", "Student", "Currently studying"],
  ["fresher", "Fresher / graduate", "Recently graduated"],
  ["early", "Early career", "1–3 years"],
  ["mid", "Mid-level", "3–7 years"],
  ["senior", "Senior", "7+ years"],
  ["career_changer", "Career changer", "Moving into a new field"],
];
const WORKFLOWS: [Profile["preferred_workflow"], string, string, typeof FilePlus2][] = [
  ["build", "Build a resume", "Start from guided sections", FilePlus2],
  ["upload", "Improve my resume", "Import a PDF or DOCX", Upload],
  ["tailor", "Tailor for a job", "Match a specific job description", Target],
  ["prepare", "Prepare for interviews", "Practise likely questions", MessagesSquare],
];
const ROLE_SUGGESTIONS = ["Software Engineer", "Data Analyst", "Product Manager", "UX Designer", "Marketing Associate", "Business Analyst"];

export default function Onboarding() {
  const user = useUser();
  const { refresh } = useAuthActions();
  const navigate = useNavigate();
  const p = user.profile;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    full_name: user.full_name,
    preferred_roles: p.preferred_roles,
    experience_level: p.experience_level,
    preferred_workflow: p.preferred_workflow,
    location: p.location,
    ai_consent: p.ai_consent,
    notify_in_app: p.notify_in_app,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (form.full_name !== user.full_name) await api.patch("/auth/me/", { full_name: form.full_name });
      const { full_name: _n, ...profile } = form;
      return api.patch("/auth/profile/", { ...profile, onboarding_completed: true });
    },
    onSuccess: async () => {
      await refresh();
      toast.success("You're all set");
      const dest = { build: "/app/resumes?new=1", upload: "/app/resumes?upload=1", tailor: "/app/job-match", prepare: "/app/interview" }[form.preferred_workflow || "build"];
      navigate(dest ?? "/app");
    },
  });
  const steps = ["Your goal", "Experience", "How to start", "Privacy"];
  const canNext = [form.preferred_roles.length > 0 && form.full_name.trim().length > 0, !!form.experience_level, !!form.preferred_workflow, true][step];

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-8 flex items-center gap-2" aria-label="Setup progress">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", i < step ? "bg-brand-500 text-white" : i === step ? "bg-brand-soft text-brand-fg ring-2 ring-brand-500" : "bg-surface-3 text-muted")} aria-current={i === step ? "step" : undefined}>
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden text-xs font-medium sm:block", i === step ? "text-fg" : "text-muted")}>{s}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-line" aria-hidden />}
          </li>
        ))}
      </ol>
      <div className="card p-6 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-2xl font-bold">What role are you aiming for?</h1>
                  <p className="mt-1 text-sm text-muted">Add up to five. You can change these any time.</p>
                </div>
                <Field label="Your name" required>{(id) => <Input id={id} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />}</Field>
                <Field label="Target roles" hint="Press Enter after each role.">
                  {(id) => <TagInput id={id} value={form.preferred_roles} onChange={(v) => setForm({ ...form, preferred_roles: v })} max={5} placeholder="e.g. Frontend Developer" suggestions={ROLE_SUGGESTIONS} />}
                </Field>
                <Field label="Location (optional)">{(id) => <Input id={id} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City or 'Remote'" />}</Field>
              </div>
            )}
            {step === 1 && (
              <div>
                <h1 className="text-2xl font-bold">Where are you in your career?</h1>
                <p className="mt-1 text-sm text-muted">This adjusts suggestions — for example, freshers get project-first guidance.</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Experience level">
                  {LEVELS.map(([v, l, d]) => (
                    <button key={v} type="button" role="radio" aria-checked={form.experience_level === v} onClick={() => setForm({ ...form, experience_level: v })}
                      className={cn("rounded-xl border p-4 text-left transition", form.experience_level === v ? "border-brand-500 bg-brand-soft ring-1 ring-brand-500" : "border-line hover:border-line-strong")}>
                      <p className="font-medium">{l}</p>
                      <p className="text-xs text-muted">{d}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <h1 className="text-2xl font-bold">What would you like to do first?</h1>
                <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Starting point">
                  {WORKFLOWS.map(([v, l, d, Icon]) => (
                    <button key={v} type="button" role="radio" aria-checked={form.preferred_workflow === v} onClick={() => setForm({ ...form, preferred_workflow: v })}
                      className={cn("flex gap-3 rounded-xl border p-4 text-left transition", form.preferred_workflow === v ? "border-brand-500 bg-brand-soft ring-1 ring-brand-500" : "border-line hover:border-line-strong")}>
                      <Icon className="mt-0.5 size-5 text-brand-500" />
                      <span><span className="block font-medium">{l}</span><span className="block text-xs text-muted">{d}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-2xl font-bold">Your privacy choices</h1>
                  <p className="mt-1 text-sm text-muted">Optional. You can change these later in Settings.</p>
                </div>
                <Switch checked={form.ai_consent} onCheckedChange={(v) => setForm({ ...form, ai_consent: v })} label="Allow live AI processing"
                  description="If this workspace has an AI provider configured, the text needed for each request you trigger is sent to it. Without consent, a rule-based offline assistant is used instead." />
                <Switch checked={form.notify_in_app} onCheckedChange={(v) => setForm({ ...form, notify_in_app: v })} label="In-app reminders" description="Show reminders you create for follow-ups, deadlines and interviews." />
                <Callout tone="info">AI suggestions are always drafts. Infyro never adds experience, skills, dates or metrics you didn't provide.</Callout>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" onClick={() => (step === 0 ? navigate("/app") : setStep(step - 1))} icon={<ArrowLeft className="size-4" />}>
            {step === 0 ? "Skip for now" : "Back"}
          </Button>
          {step < steps.length - 1 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)} iconRight={<ArrowRight className="size-4" />}>Continue</Button>
          ) : (
            <Button loading={save.isPending} onClick={() => save.mutate()}>Finish setup</Button>
          )}
        </div>
      </div>
    </div>
  );
}
