import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Database, HardDrive, Layers, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, type Paginated } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, Card, CardHeader, Stat } from "@/components/ui/Layout";
import { Badge, Callout, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/Form";
import { Tabs, TabPanel } from "@/components/ui/Overlay";
import { BarList } from "@/components/ui/BarList";

export default function Admin() {
  const [tab, setTab] = useState("health");
  return (
    <div>
      <PageHeader title="Admin console" description="Operate the platform responsibly. Resume content is deliberately not accessible from here; every change is audited." />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "health", label: "Health & usage" }, { value: "templates", label: "Templates" }, { value: "support", label: "Support queue" }, { value: "cohorts", label: "Cohorts" }, { value: "audit", label: "Audit log" }]}>
        <TabPanel value="health"><Overview /></TabPanel>
        <TabPanel value="templates"><TemplatesAdmin /></TabPanel>
        <TabPanel value="support"><SupportQueue /></TabPanel>
        <TabPanel value="cohorts"><CohortAdmin /></TabPanel>
        <TabPanel value="audit"><Audit /></TabPanel>
      </Tabs>
    </div>
  );
}

function HealthRow({ icon: Icon, label, ok, detail }: { icon: typeof Database; label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <Icon className="size-4 text-muted" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="text-xs text-muted">{detail}</span>
      {ok ? <CheckCircle2 className="size-4 text-success" aria-label="Healthy" /> : <XCircle className="size-4 text-danger" aria-label="Unhealthy" />}
    </li>
  );
}

function Overview() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.get<any>("/admin/overview/"), refetchInterval: 30_000 });
  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Users" value={d.users.total} hint={`${d.users.demo_accounts} demo`} />
        <Stat label="AI requests (7 days)" value={d.ai_usage_7d.requests} hint={d.ai_usage_7d.avg_latency_ms != null ? `avg ${d.ai_usage_7d.avg_latency_ms} ms` : undefined} />
        <Stat label="Open support requests" value={d.support.open} />
        <Stat label="Daily AI limit / user" value={d.limits.ai_daily_request_limit} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Service health" />
          <ul className="divide-y divide-line">
            <HealthRow icon={Database} label="Database" ok={d.health.database.ok} detail={d.health.database.engine} />
            <HealthRow icon={HardDrive} label="File storage" ok={d.health.storage.ok} detail={d.health.storage.backend} />
            <HealthRow icon={Layers} label="Background queue" ok={d.health.queue.ok} detail={d.health.queue.mode} />
            <HealthRow icon={Activity} label="AI provider" ok={d.health.ai.ok} detail={d.health.ai.label} />
          </ul>
          <p className="px-5 pb-4 text-xs text-muted">{d.health.ai.note}</p>
        </Card>
        <Card>
          <CardHeader title="AI usage by feature" description="Last 7 days · metadata only" />
          <div className="p-5"><BarList rows={Object.entries(d.ai_usage_7d.by_feature as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k.replace("_", " "), value: v }))} emptyLabel="No AI requests in the last 7 days." /></div>
          <div className="flex flex-wrap gap-1.5 px-5 pb-5">
            {Object.entries(d.ai_usage_7d.by_status as Record<string, number>).map(([k, v]) => <Badge key={k} tone={k === "ok" ? "success" : "warning"}>{k}: {v}</Badge>)}
            {Object.entries(d.ai_usage_7d.suggestion_outcomes as Record<string, number>).map(([k, v]) => <Badge key={k}>{k}: {v}</Badge>)}
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Users by role" />
        <div className="p-5"><BarList rows={Object.entries(d.users.by_role as Record<string, number>).map(([k, v]) => ({ label: k, value: v }))} /></div>
      </Card>
    </div>
  );
}

function TemplatesAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-templates"], queryFn: () => api.get<any[]>("/admin/templates/") });
  const patch = useMutation({ mutationFn: ({ slug, body }: { slug: string; body: any }) => api.patch(`/admin/templates/${slug}/`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-templates"] }); qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template updated"); } });
  return (
    <Card>
      <CardHeader title="Templates" description="Inactive templates stay available to resumes already using them." />
      <ul className="divide-y divide-line">
        {q.data?.map((t) => (
          <li key={t.slug} className="flex flex-wrap items-center gap-4 px-5 py-3">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{t.name} <span className="text-muted">· {t.category}</span></p><p className="text-xs text-muted">{t.resume_count} resume(s) · order {t.sort_order}</p></div>
            <Switch checked={t.is_active} onCheckedChange={(v) => patch.mutate({ slug: t.slug, body: { is_active: v } })} label="Active" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SupportQueue() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-tickets"], queryFn: () => api.get<Paginated<any>>("/admin/tickets/") });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: any }) => api.patch(`/admin/tickets/${id}/`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tickets"] }); toast.success("Ticket updated"); } });
  if (!q.data) return <Skeleton className="h-40 rounded-xl" />;
  if (!q.data.results.length) return <Callout tone="success">The support queue is empty.</Callout>;
  return (
    <ul className="space-y-3">
      {q.data.results.map((t: any) => (
        <li key={t.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-medium">{t.subject}</p><Badge>{t.owner_email ?? "deleted user"}</Badge><span className="text-xs text-muted">{formatDateTime(t.created_at)}</span></div>
          <p className="mt-2 whitespace-pre-line text-sm text-fg-2">{t.message}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <Field label="Status">{(id) => <Select id={id} defaultValue={t.status} onChange={(e) => patch.mutate({ id: t.id, body: { status: e.target.value } })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="closed">Closed</option></Select>}</Field>
            <Field label="Reply to user">{(id) => <Textarea id={id} rows={2} defaultValue={t.admin_note} onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })} />}</Field>
            <Button size="sm" onClick={() => patch.mutate({ id: t.id, body: { admin_note: notes[t.id] ?? t.admin_note } })}>Save reply</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CohortAdmin() {
  const qc = useQueryClient();
  const [f, setF] = useState({ institution: "", name: "", coordinator_email: "" });
  const [created, setCreated] = useState<any>(null);
  const create = useMutation({ mutationFn: () => api.post<any>("/admin/cohorts/", f), onSuccess: (c) => { setCreated(c); setF({ institution: "", name: "", coordinator_email: "" }); qc.invalidateQueries({ queryKey: ["coordinator-cohorts"] }); } });
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Create a cohort" description="Students join with the invite code. The coordinator only sees opt-in summaries." />
      <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label="Institution">{(id) => <Input id={id} value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} required />}</Field>
        <Field label="Cohort name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="e.g. CS Class of 2027" />}</Field>
        <Field label="Coordinator email (existing account)" className="sm:col-span-2" error={(create.error as any)?.field?.("coordinator_email")}>{(id) => <Input id={id} type="email" value={f.coordinator_email} onChange={(e) => setF({ ...f, coordinator_email: e.target.value })} />}</Field>
        <div className="sm:col-span-2"><Button type="submit" loading={create.isPending}>Create cohort</Button></div>
      </form>
      {created && <div className="px-5 pb-5"><Callout tone="success" title="Cohort created">Invite code: <code className="font-mono">{created.invite_code}</code></Callout></div>}
    </Card>
  );
}

function Audit() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["audit", action, page], queryFn: () => api.get<Paginated<any>>(`/admin/audit-events/?page=${page}${action ? `&action=${encodeURIComponent(action)}` : ""}`) });
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><Input aria-label="Filter by action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="Filter by action prefix, e.g. auth. or admin." className="max-w-sm" /></div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted"><tr>{["When", "Actor", "Action", "Resource", "Outcome"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {q.data?.results.map((e: any) => (
              <tr key={e.id}><td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDateTime(e.created_at)}</td><td className="px-4 py-2 text-xs">{e.actor_email ?? <span className="text-muted">ref {e.actor_ref || "—"}</span>}</td><td className="px-4 py-2 font-mono text-xs">{e.action}</td><td className="px-4 py-2 text-xs text-muted">{e.resource_type}{e.resource_id && ` #${e.resource_id}`}</td><td className="px-4 py-2"><Badge tone={e.outcome === "success" ? "success" : "warning"}>{e.outcome}</Badge></td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted"><ShieldCheck className="size-4" /> {q.data?.count ?? 0} events</span>
        <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={!q.data?.previous} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={!q.data?.next} onClick={() => setPage(page + 1)}>Next</Button></div>
      </div>
    </div>
  );
}
