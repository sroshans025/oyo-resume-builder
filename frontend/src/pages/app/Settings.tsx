import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, KeyRound, Laptop, LogOut, MessageSquare, Monitor, Moon, ShieldAlert, Sun, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, downloadUrl, type Paginated } from "@/lib/api";
import { useAuthActions, useTheme, useUser } from "@/lib/auth";
import { formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { PageHeader, Card, CardHeader } from "@/components/ui/Layout";
import { Badge, Callout, Skeleton } from "@/components/ui/Feedback";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/Form";
import { Dialog, Tabs, TabPanel, useConfirm } from "@/components/ui/Overlay";
import { useAIStatus } from "@/components/resume/AIStatusPill";

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "privacy";
  return (
    <div>
      <PageHeader title="Settings & privacy" description="Control how your data is used, who can see it, and how we contact you." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })} tabs={[
        { value: "privacy", label: "Privacy & AI" }, { value: "sharing", label: "Sharing" }, { value: "notifications", label: "Notifications & goals" },
        { value: "security", label: "Security" }, { value: "appearance", label: "Appearance" }, { value: "data", label: "Your data" }, { value: "support", label: "Support" },
      ]}>
        <TabPanel value="privacy"><Privacy /></TabPanel>
        <TabPanel value="sharing"><Sharing /></TabPanel>
        <TabPanel value="notifications"><Notifications /></TabPanel>
        <TabPanel value="security"><Security /></TabPanel>
        <TabPanel value="appearance"><Appearance /></TabPanel>
        <TabPanel value="data"><DataControls /></TabPanel>
        <TabPanel value="support"><Support /></TabPanel>
      </Tabs>
    </div>
  );
}

function useProfilePatch() {
  const { refresh } = useAuthActions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch("/auth/profile/", body),
    onSuccess: async () => { await refresh(); qc.invalidateQueries({ queryKey: ["ai-status"] }); toast.success("Saved"); },
  });
}

function Privacy() {
  const user = useUser();
  const p = user.profile;
  const patch = useProfilePatch();
  const ai = useAIStatus();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="AI processing" description={ai.data ? `Workspace mode: ${ai.data.label}` : undefined} />
        <div className="space-y-4 p-5">
          {ai.data && <Callout tone={ai.data.mode === "ai" ? "info" : "success"}>{ai.data.note}</Callout>}
          <Switch checked={p.ai_consent} onCheckedChange={(v) => patch.mutate({ ai_consent: v })} disabled={patch.isPending}
            label="Allow sending content to the AI provider"
            description="When on, and only when you trigger an AI action, the minimum text needed (for example one bullet, or your resume for a summary) is sent to the configured provider. It's never used to make decisions about you." />
          {p.ai_consent_at && <p className="text-xs text-muted">Consent given {formatDateTime(p.ai_consent_at)}.</p>}
          <div className="rounded-lg bg-surface-2 p-4 text-xs leading-relaxed text-muted">
            <p className="font-medium text-fg-2">What's sent, and what isn't</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Sent: the text for the action you chose, your selected tone and target role.</li>
              <li>Not sent: your password, other resumes, applications, or files you didn't use.</li>
              <li>Logged: feature name, timing and size only — not your content.</li>
              <li>Uploaded documents and job descriptions are treated as data; instructions inside them are ignored.</li>
            </ul>
            {ai.data && <p className="mt-2">AI requests today: {ai.data.usage.used} / {ai.data.usage.limit}</p>}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Data handling" />
        <div className="space-y-4 p-5">
          <Field label="Keep uploaded files for" hint="Applies to new uploads. Change individual files in the Document vault.">
            {(id) => <Select id={id} value={p.upload_retention_days} onChange={(e) => patch.mutate({ upload_retention_days: Number(e.target.value) })}>{[30, 90, 180, 365, 730].map((d) => <option key={d} value={d}>{d} days</option>)}</Select>}
          </Field>
          <Switch checked={p.show_contact_in_shares} onCheckedChange={(v) => patch.mutate({ show_contact_in_shares: v })} label="Default: include contact details in share links" description="You can still choose per link." />
          <Callout tone="info">Scores and AI suggestions are estimates and may be inaccurate. Infyro never infers sensitive characteristics or makes hiring decisions.</Callout>
        </div>
      </Card>
    </div>
  );
}

interface Grant { id: number; resume: number; resume_title: string; recipient_email: string; scope: string; include_contact: boolean; expires_at: string; revoked_at: string | null; is_active: boolean; last_accessed_at: string | null; access_count: number; token_hint: string; comment_count: number; created_at: string }

function Sharing() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["grants"], queryFn: () => api.get<Paginated<Grant>>("/share-grants/?page_size=100") });
  const [comments, setComments] = useState<Grant | null>(null);
  const revoke = useMutation({ mutationFn: (id: number) => api.post(`/share-grants/${id}/revoke/`), onSuccess: () => { toast.success("Access revoked"); qc.invalidateQueries({ queryKey: ["grants"] }); } });
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Shared links" description="Create links from the resume editor (More → Share for review). Revoke any link instantly." />
        {q.isLoading ? <div className="p-5"><Skeleton className="h-20" /></div> : !q.data?.results.length ? <p className="p-5 text-sm text-muted">You haven't shared any resumes.</p> : (
          <ul className="divide-y divide-line">
            {q.data.results.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.resume_title} <span className="font-normal text-muted">· link {g.token_hint}…</span></p>
                  <p className="text-xs text-muted">{g.scope === "comment" ? "View & comment" : "View only"} · {g.recipient_email || "anyone with the link"} · {g.include_contact ? "contact shown" : "contact hidden"} · opened {g.access_count}× {g.last_accessed_at && `(last ${relativeTime(g.last_accessed_at)})`}</p>
                </div>
                {g.is_active ? <Badge tone="success" dot>Active until {formatDate(g.expires_at)}</Badge> : <Badge>{g.revoked_at ? "Revoked" : "Expired"}</Badge>}
                {g.scope === "comment" && <Button size="xs" variant="secondary" icon={<MessageSquare className="size-3.5" />} onClick={() => setComments(g)}>Comments ({g.comment_count})</Button>}
                {g.is_active && <Button size="xs" variant="ghost" className="text-danger" icon={<Ban className="size-3.5" />} onClick={async () => { if (await confirm({ title: "Revoke this link?", description: "Anyone using it will lose access immediately.", confirmLabel: "Revoke" })) revoke.mutate(g.id); }}>Revoke</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Cohorts />
      {comments && <CommentsDialog grant={comments} onClose={() => setComments(null)} />}
    </div>
  );
}

function CommentsDialog({ grant, onClose }: { grant: Grant; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["grant-comments", grant.id], queryFn: () => api.get<any[]>(`/share-grants/${grant.id}/comments/`) });
  const resolve = useMutation({ mutationFn: (c: any) => api.patch(`/share-grants/${grant.id}/comments/`, { id: c.id, resolved: !c.resolved }), onSuccess: () => qc.invalidateQueries({ queryKey: ["grant-comments", grant.id] }) });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Review comments · ${grant.resume_title}`} size="lg">
      {q.data?.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
      <ul className="space-y-3">
        {q.data?.map((c) => (
          <li key={c.id} className={`rounded-lg border border-line p-3 ${c.resolved ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2 text-sm"><span className="font-medium">{c.author_name}</span>{c.section && <Badge>{c.section}</Badge>}<span className="ml-auto text-xs text-muted">{relativeTime(c.created_at)}</span></div>
            <p className="mt-1.5 whitespace-pre-line text-sm text-fg-2">{c.text}</p>
            <Button size="xs" variant="ghost" className="mt-2" onClick={() => resolve.mutate(c)}>{c.resolved ? "Reopen" : "Mark resolved"}</Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function Cohorts() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["my-cohorts"], queryFn: () => api.get<any[]>("/cohorts/mine/") });
  const [code, setCode] = useState("");
  const [share, setShare] = useState(false);
  const join = useMutation({ mutationFn: () => api.post("/cohorts/mine/", { invite_code: code, share_progress: share }), onSuccess: () => { setCode(""); toast.success("Joined cohort"); qc.invalidateQueries({ queryKey: ["my-cohorts"] }); } });
  const toggle = useMutation({ mutationFn: (m: any) => api.patch(`/cohorts/mine/${m.id}/`, { share_progress: !m.share_progress }), onSuccess: () => qc.invalidateQueries({ queryKey: ["my-cohorts"] }) });
  const leave = useMutation({ mutationFn: (m: any) => api.del(`/cohorts/mine/${m.id}/`), onSuccess: () => qc.invalidateQueries({ queryKey: ["my-cohorts"] }) });
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Users className="size-4" /> College or placement cohort</span>} description="If your institution gave you an invite code, join here. Coordinators only see summary counts — and only if you opt in." />
      <div className="space-y-4 p-5">
        {q.data?.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{m.cohort}</p><p className="text-xs text-muted">{m.institution} · joined {formatDate(m.joined_at)}</p></div>
            <Switch checked={m.share_progress} onCheckedChange={() => toggle.mutate(m)} label="Share progress summary" />
            <Button size="xs" variant="ghost" onClick={async () => { if (await confirm({ title: `Leave ${m.cohort}?`, confirmLabel: "Leave" })) leave.mutate(m); }}>Leave</Button>
          </div>
        ))}
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); join.mutate(); }}>
          <Field label="Invite code" className="sm:w-48">{(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={16} />}</Field>
          <div className="flex-1"><Switch checked={share} onCheckedChange={setShare} label="Share progress summary" description="Counts like resumes created and applications tracked — never content." /></div>
          <Button type="submit" variant="secondary" disabled={!code.trim()} loading={join.isPending}>Join</Button>
        </form>
      </div>
    </Card>
  );
}

function Notifications() {
  const p = useUser().profile;
  const patch = useProfilePatch();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Notifications" description="Only reminders you create and important account notices." />
        <div className="space-y-3 p-5">
          <Switch checked={p.notify_in_app} onCheckedChange={(v) => patch.mutate({ notify_in_app: v })} label="In-app reminders" description="Bell notifications when your reminders are due." />
          <Switch checked={p.notify_email_reminders} onCheckedChange={(v) => patch.mutate({ notify_email_reminders: v })} label="Email reminders" description="Also email reminders to you. Every email includes a link to change this." />
          <Switch checked={p.notify_product_updates} onCheckedChange={(v) => patch.mutate({ notify_product_updates: v })} label="Product updates" description="Occasional news about new features." />
        </div>
      </Card>
      <Card>
        <CardHeader title="Job search goals" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Weekly application goal">{(id) => <Select id={id} value={p.weekly_application_goal} onChange={(e) => patch.mutate({ weekly_application_goal: Number(e.target.value) })}>{[0, 1, 2, 3, 5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n === 0 ? "No goal" : n}</option>)}</Select>}</Field>
          <Field label="Suggest follow-ups after" hint="We suggest — you decide whether to set it.">{(id) => <Select id={id} value={p.followup_days} onChange={(e) => patch.mutate({ followup_days: Number(e.target.value) })}>{[3, 5, 7, 10, 14, 21].map((n) => <option key={n} value={n}>{n} days</option>)}</Select>}</Field>
        </div>
      </Card>
    </div>
  );
}

function Security() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const change = useMutation({ meta: { silent: true }, mutationFn: () => api.post("/auth/password/change/", pw), onSuccess: () => { setPw({ current_password: "", new_password: "" }); setErr(null); toast.success("Password changed"); }, onError: (e) => setErr(e as ApiError) });
  const sessions = useQuery({ queryKey: ["sessions-auth"], queryFn: () => api.get<{ id: number; user_agent: string; created_at: string; last_seen_at: string; current: boolean }[]>("/auth/sessions/") });
  const revoke = useMutation({ mutationFn: (id: string) => api.del(`/auth/sessions/${id}/`), onSuccess: () => { toast.success("Signed out"); qc.invalidateQueries({ queryKey: ["sessions-auth"] }); } });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><KeyRound className="size-4" /> Change password</span>} />
        <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
          <Field label="Current password" error={err?.field("current_password")}>{(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required />}</Field>
          <Field label="New password" hint="At least 10 characters." error={err?.field("new_password") ?? err?.field("non_field_errors")}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required />}</Field>
          <Button type="submit" loading={change.isPending}>Update password</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Active sessions" action={<Button size="xs" variant="secondary" icon={<LogOut className="size-3.5" />} onClick={async () => { if (await confirm({ title: "Sign out all other sessions?", confirmLabel: "Sign out others", tone: "primary" })) revoke.mutate("others"); }}>Sign out others</Button>} />
        <ul className="divide-y divide-line">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <Laptop className="size-4 text-muted" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{summariseAgent(s.user_agent)} {s.current && <Badge tone="success">This device</Badge>}</p><p className="text-xs text-muted">Signed in {formatDate(s.created_at)} · active {relativeTime(s.last_seen_at)}</p></div>
              {!s.current && <IconButton label="Sign out this session" onClick={() => revoke.mutate(String(s.id))}><LogOut className="size-4" /></IconButton>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function summariseAgent(ua: string) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <Card className="max-w-xl">
      <CardHeader title="Theme" />
      <div className="grid grid-cols-3 gap-3 p-5" role="radiogroup" aria-label="Theme">
        {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as const).map(([v, l, Icon]) => (
          <button key={v} role="radio" aria-checked={theme === v} onClick={() => setTheme(v)} className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition ${theme === v ? "border-brand-500 bg-brand-soft ring-1 ring-brand-500" : "border-line hover:border-line-strong"}`}>
            <Icon className="size-5" />{l}
          </button>
        ))}
      </div>
      <p className="px-5 pb-5 text-xs text-muted">Animations are reduced automatically if your system asks for reduced motion.</p>
    </Card>
  );
}

function DataControls() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [delOpen, setDelOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const exp = useMutation({ mutationFn: () => api.post<{ url: string }>("/privacy/export/"), onSuccess: (r) => { downloadUrl(r.url); toast.success("Export ready — downloading ZIP"); } });
  const del = useMutation({
    meta: { silent: true },
    mutationFn: () => api.post("/privacy/delete-account/", { password: pw, confirm: confirmText }),
    onSuccess: () => { qc.clear(); qc.setQueryData(["me"], null); toast.success("Your account has been deleted"); navigate("/"); },
    onError: (e) => setErr(e as ApiError),
  });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Download className="size-4" /> Export your data</span>} description="A ZIP with all your records as JSON plus your uploaded and exported files." />
        <div className="p-5">
          <Button loading={exp.isPending} onClick={() => exp.mutate()} icon={<Download className="size-4" />}>Create export</Button>
          <p className="mt-3 text-xs text-muted">The export is stored in your vault for 2 days, then deleted automatically.</p>
        </div>
      </Card>
      <Card className="border-rose-500/30">
        <CardHeader title={<span className="flex items-center gap-2 text-danger"><ShieldAlert className="size-4" /> Delete account</span>} description="Permanently deletes your account, resumes, files, applications and all other data." />
        <div className="space-y-3 p-5 text-sm">
          <div className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
            <p className="font-medium text-fg-2">Retention exceptions</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Security audit records are kept with your identity removed.</li>
              <li>AI usage metadata (no content) is kept without a link to you.</li>
              <li>Backups taken before deletion expire on the operator's backup schedule.</li>
            </ul>
          </div>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDelOpen(true)}>Delete my account</Button>
        </div>
      </Card>
      <Dialog open={delOpen} onOpenChange={setDelOpen} title="Delete your account permanently?" description="This can't be undone. Consider exporting your data first." size="sm"
        footer={<><Button variant="secondary" onClick={() => setDelOpen(false)}>Cancel</Button><Button variant="danger" disabled={confirmText !== "DELETE" || !pw} loading={del.isPending} onClick={() => del.mutate()}>Delete account</Button></>}>
        <div className="space-y-3">
          <Field label="Password" error={err?.field("password")}>{(id) => <Input id={id} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <Field label={<>Type <strong>DELETE</strong> to confirm</>} error={err?.field("confirm")}>{(id) => <Input id={id} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}</Field>
        </div>
      </Dialog>
    </div>
  );
}

function Support() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tickets"], queryFn: () => api.get<Paginated<any>>("/support-tickets/") });
  const [f, setF] = useState({ subject: "", message: "" });
  const create = useMutation({ mutationFn: () => api.post("/support-tickets/", f), onSuccess: () => { setF({ subject: "", message: "" }); toast.success("Request sent"); qc.invalidateQueries({ queryKey: ["tickets"] }); } });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Contact support" description="Please don't include passwords or sensitive personal details." />
        <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Subject">{(id) => <Input id={id} value={f.subject} maxLength={160} onChange={(e) => setF({ ...f, subject: e.target.value })} required />}</Field>
          <Field label="Message">{(id) => <Textarea id={id} rows={5} maxLength={4000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required />}</Field>
          <Button type="submit" loading={create.isPending} disabled={!f.subject.trim() || !f.message.trim()}>Send</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Your requests" />
        <ul className="divide-y divide-line">
          {q.data?.results.length === 0 && <li className="p-5 text-sm text-muted">No requests yet.</li>}
          {q.data?.results.map((t: any) => (
            <li key={t.id} className="px-5 py-3"><div className="flex items-center gap-2"><p className="flex-1 truncate text-sm font-medium">{t.subject}</p><Badge tone={t.status === "closed" ? "neutral" : "brand"}>{t.status.replace("_", " ")}</Badge></div>
              {t.admin_note && <p className="mt-1 text-xs text-muted">Reply: {t.admin_note}</p>}<p className="mt-0.5 text-xs text-faint">{formatDateTime(t.created_at)}</p></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

