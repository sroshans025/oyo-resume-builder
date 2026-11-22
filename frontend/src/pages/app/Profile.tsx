import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuthActions, useUser } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import { PageHeader, Card, CardHeader } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, TagInput } from "@/components/ui/Form";

const LEVELS = [["", "Not set"], ["student", "Student"], ["fresher", "Fresher / graduate"], ["early", "Early career (1–3 yrs)"], ["mid", "Mid-level (3–7 yrs)"], ["senior", "Senior (7+ yrs)"], ["career_changer", "Career changer"]];
const CHECK_LABELS: Record<string, string> = { name: "Name", headline: "Headline", target_roles: "Target roles", experience_level: "Experience level", location: "Location", links: "A profile link", strengths: "Strengths", learning_goals: "Learning goals" };

export default function ProfilePage() {
  const user = useUser();
  const { refresh } = useAuthActions();
  const [name, setName] = useState(user.full_name);
  const [p, setP] = useState<Profile>(user.profile);
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => {
    setP(user.profile);
  }, [user.profile]);
  const save = useMutation({
    meta: { silent: true },
    mutationFn: async () => {
      if (name !== user.full_name) await api.patch("/auth/me/", { full_name: name });
      return api.patch("/auth/profile/", {
        headline: p.headline, preferred_roles: p.preferred_roles, experience_level: p.experience_level, location: p.location,
        preferred_locations: p.preferred_locations, portfolio_url: p.portfolio_url, github_url: p.github_url, linkedin_url: p.linkedin_url,
        strengths: p.strengths, learning_goals: p.learning_goals, writing_style: p.writing_style,
      });
    },
    onSuccess: async () => { setErr(null); await refresh(); toast.success("Profile saved"); },
    onError: (e) => { setErr(e as ApiError); toast.error((e as ApiError).friendly); },
  });
  const set = (patch: Partial<Profile>) => setP({ ...p, ...patch });
  const c = user.profile.completion;
  return (
    <div>
      <PageHeader title="Career profile" description="Used to personalise suggestions, summaries and interview questions. It's never shared unless you choose to."
        actions={<Button loading={save.isPending} onClick={() => save.mutate()}>Save profile</Button>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="About you" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Full name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label="Email" hint="Contact support to change your sign-in email.">{(id) => <Input id={id} value={user.email} disabled />}</Field>
              <Field label="Headline" className="sm:col-span-2">{(id) => <Input id={id} value={p.headline} maxLength={160} onChange={(e) => set({ headline: e.target.value })} placeholder="e.g. Final-year CS student focused on backend development" />}</Field>
              <Field label="Experience level">{(id) => <Select id={id} value={p.experience_level} onChange={(e) => set({ experience_level: e.target.value as Profile["experience_level"] })}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
              <Field label="Location (optional)">{(id) => <Input id={id} value={p.location} onChange={(e) => set({ location: e.target.value })} />}</Field>
              <Field label="Preferred writing style">{(id) => <Select id={id} value={p.writing_style} onChange={(e) => set({ writing_style: e.target.value })}>{[["professional", "Professional"], ["concise", "Concise"], ["detailed", "Detailed"], ["formal", "Formal"], ["fresher", "Entry-level friendly"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Goals" description="Up to five target roles." />
            <div className="grid gap-4 p-5">
              <Field label="Target roles" error={err?.field("preferred_roles")}>{(id) => <TagInput id={id} value={p.preferred_roles} max={5} onChange={(v) => set({ preferred_roles: v })} placeholder="Add a role" />}</Field>
              <Field label="Preferred locations">{(id) => <TagInput id={id} value={p.preferred_locations} max={8} onChange={(v) => set({ preferred_locations: v })} placeholder="City, country or Remote" />}</Field>
              <Field label="Strengths" hint="What you're good at — used as context, never added to a resume automatically.">{(id) => <TagInput id={id} value={p.strengths} max={12} onChange={(v) => set({ strengths: v })} />}</Field>
              <Field label="Learning goals">{(id) => <TagInput id={id} value={p.learning_goals} max={12} onChange={(v) => set({ learning_goals: v })} />}</Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Links" />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label="Portfolio" error={err?.field("portfolio_url")}>{(id) => <Input id={id} type="url" value={p.portfolio_url} onChange={(e) => set({ portfolio_url: e.target.value })} placeholder="https://" />}</Field>
              <Field label="GitHub" error={err?.field("github_url")}>{(id) => <Input id={id} type="url" value={p.github_url} onChange={(e) => set({ github_url: e.target.value })} placeholder="https://github.com/…" />}</Field>
              <Field label="LinkedIn" error={err?.field("linkedin_url")}>{(id) => <Input id={id} type="url" value={p.linkedin_url} onChange={(e) => set({ linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/…" />}</Field>
            </div>
          </Card>
        </div>
        <aside>
          <Card className="sticky top-24 p-5">
            <p className="text-sm font-semibold">Profile completion</p>
            <p className="mt-1 font-display text-3xl font-bold">{c.percent}%</p>
            <ProgressBar value={c.percent} className="mt-2" label="Profile completion" />
            <ul className="mt-4 space-y-1.5 text-sm">
              {Object.entries(c.checks).map(([k, v]) => <li key={k} className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${v ? "bg-success" : "bg-line-strong"}`} /><span className={v ? "text-fg-2" : "text-muted"}>{CHECK_LABELS[k] ?? k}</span></li>)}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
