import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, FileSearch, Target, Trash2 } from "lucide-react";
import { api, type Paginated } from "@/lib/api";
import type { Report, ResumeSummary } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Button, IconButton, LinkButton } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Form";
import { Tabs, useConfirm } from "@/components/ui/Overlay";
import { useQueryClient } from "@tanstack/react-query";

export function ReportList({ kind }: { kind?: "health" | "match" }) {
  const [filter, setFilter] = useState(kind ?? "all");
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({
    queryKey: ["reports", filter],
    queryFn: () => api.get<Paginated<Report>>(`/reports/?page_size=50${filter !== "all" ? `&kind=${filter}` : ""}`),
  });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/reports/${id}/`), onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }) });
  return (
    <div>
      {!kind && <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} tabs={[{ value: "all", label: "All" }, { value: "health", label: "Health checks" }, { value: "upload", label: "Uploaded files" }, { value: "match", label: "Job matches" }]} className="mb-4" />}
      {q.isLoading ? <Skeleton className="h-40 rounded-xl" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.results.length === 0 ? (
        <EmptyState icon={<FileSearch className="size-6" />} title="No reports yet" description="Reports are saved so you can track improvements across versions." />
      ) : (
        <ul className="card divide-y divide-line">
          {q.data!.results.map((r) => {
            const score = r.kind === "match" ? r.match_score : r.quality_score;
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", r.kind === "match" ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" : "bg-brand-soft text-brand-fg")}>
                  {r.kind === "match" ? <Target className="size-4" /> : <Activity className="size-4" />}
                </span>
                <Link to={`/app/reports/${r.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium hover:text-brand-fg">
                    {r.kind === "match" ? `${r.resume_title} → ${r.job_title}${r.job_company ? ` · ${r.job_company}` : ""}` : r.kind === "upload" ? `Uploaded: ${r.upload_name}` : r.resume_title}
                  </span>
                  <span className="block text-xs text-muted">{formatDateTime(r.created_at)}{r.version_number ? ` · version ${r.version_number}` : ""} · {r.finding_count} {r.kind === "match" ? "requirements" : "findings"}</span>
                </Link>
                <span className="text-right">
                  <span className="block font-display text-lg font-bold tabular-nums">{score ?? "—"}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-muted">{r.kind === "match" ? "match est." : "quality est."}</span>
                </span>
                <IconButton size="sm" label="Delete report" onClick={async () => { if (await confirm({ title: "Delete this report?", confirmLabel: "Delete" })) del.mutate(r.id); }}><Trash2 className="size-3.5" /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Analysis() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const resumes = useQuery({ queryKey: ["resumes", "active", ""], queryFn: () => api.get<Paginated<ResumeSummary>>("/resumes/?page_size=100") });
  const [rid, setRid] = useState(params.get("resume") ?? "");
  const run = useMutation({
    mutationFn: () => api.post<Report>("/reports/health/", { resume_id: Number(rid || resumes.data?.results[0]?.id) }),
    onSuccess: (r) => navigate(`/app/reports/${r.id}`),
  });
  const list = resumes.data?.results ?? [];
  return (
    <div>
      <PageHeader title="Resume health check" description="Deterministic checks for completeness, readability, clarity and consistency — each finding explained, with a transparent scoring formula." />
      <div className="card relative mb-8 overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-brand-500/10 blur-3xl" aria-hidden />
        {resumes.isLoading ? <Skeleton className="h-16" /> : list.length === 0 ? (
          <div className="relative flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-muted">Create or import a resume first. You can also check an uploaded file from its review page.</p>
            <LinkButton to="/app/resumes?new=1">New resume</LinkButton>
          </div>
        ) : (
          <form className="relative flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
            <Field label="Resume to check" className="flex-1">
              {(id) => <Select id={id} value={rid || String(list[0].id)} onChange={(e) => setRid(e.target.value)}>{list.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>}
            </Field>
            <Button type="submit" size="md" loading={run.isPending} icon={<Activity className="size-4" />}>Run health check</Button>
          </form>
        )}
        <p className="relative mt-3 text-xs text-muted">Each check snapshots the resume, so you can compare reports across versions. <Badge>No job description needed</Badge></p>
      </div>
      <h2 className="mb-3 text-sm font-semibold text-fg-2">Report history</h2>
      <ReportList />
    </div>
  );
}
