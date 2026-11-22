import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Layout";
import { Callout, EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Layout";

interface Cohort { id: number; name: string; institution: string; invite_code: string; members: number }

export default function Institution() {
  const q = useQuery({ queryKey: ["coordinator-cohorts"], queryFn: () => api.get<Cohort[]>("/institution/cohorts/") });
  const [sel, setSel] = useState<number | null>(null);
  const id = sel ?? q.data?.[0]?.id ?? null;
  const progress = useQuery({ queryKey: ["cohort-progress", id], queryFn: () => api.get<any>(`/institution/cohorts/${id}/progress/`), enabled: !!id });
  return (
    <div>
      <PageHeader title="Institution dashboard" description="Scoped progress summaries for your cohorts — only for members who opted in, and never their resume content." />
      <Callout tone="info" className="mb-5" title="Privacy by design"><span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" /> Every view of this page is recorded in the audit log. Members can withdraw consent at any time.</span></Callout>
      {q.isLoading ? <Skeleton className="h-40 rounded-xl" /> : q.error ? <ErrorState error={q.error} /> : !q.data!.length ? (
        <EmptyState icon={<Building2 className="size-6" />} title="No cohorts assigned" description="An administrator can create a cohort and assign you as its coordinator." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <ul className="card h-fit divide-y divide-line">
            {q.data!.map((c) => (
              <li key={c.id}><button onClick={() => setSel(c.id)} className={`w-full px-4 py-3 text-left ${id === c.id ? "bg-brand-soft" : "hover:bg-surface-2"}`}><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted">{c.institution} · {c.members} members</p></button></li>
            ))}
          </ul>
          <div className="space-y-5">
            {(() => {
              const c = q.data!.find((x) => x.id === id);
              return c && (
                <div className="card flex flex-wrap items-center gap-3 p-4">
                  <p className="flex-1 text-sm">Invite code for <strong>{c.name}</strong>: <code className="rounded bg-surface-3 px-2 py-0.5 font-mono">{c.invite_code}</code></p>
                  <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => { navigator.clipboard?.writeText(c.invite_code); toast.success("Copied"); }}>Copy</Button>
                </div>
              );
            })()}
            {progress.isLoading ? <Skeleton className="h-40 rounded-xl" /> : progress.data && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat label="Members" value={progress.data.total_members} />
                  <Stat label="Sharing progress" value={progress.data.sharing_members} hint="opted in" />
                  <Stat label="Not sharing" value={progress.data.total_members - progress.data.sharing_members} />
                </div>
                <div className="card overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted"><tr>{["Member", "Resumes", "Latest quality est.", "Job matches", "Applications", "Practice sessions"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-line">
                      {progress.data.members.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No members have opted in to share progress.</td></tr>}
                      {progress.data.members.map((m: any, i: number) => (
                        <tr key={i}><td className="px-4 py-2.5 font-medium">{m.name}</td><td className="px-4 py-2.5">{m.resumes}</td><td className="px-4 py-2.5">{m.latest_quality_estimate ?? "—"}</td><td className="px-4 py-2.5">{m.job_matches}</td><td className="px-4 py-2.5">{m.applications}</td><td className="px-4 py-2.5">{m.interview_sessions}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted">{progress.data.note}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
