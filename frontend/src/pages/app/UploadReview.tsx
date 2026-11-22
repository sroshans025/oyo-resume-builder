import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRight, FileSearch, Loader2, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, openSignedLink } from "@/lib/api";
import type { ResumeContent, Template, Upload } from "@/lib/types";
import { formatBytes } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, ErrorState, FullPageLoader, ProgressBar } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Tabs, TabPanel, useConfirm } from "@/components/ui/Overlay";
import { PersonalEditor, SectionEditor } from "@/components/resume/SectionEditors";
import { ScaledPreview } from "@/components/resume/ResumePreview";
import { UploadStatus } from "./Resumes";

export default function UploadReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({
    queryKey: ["upload", id],
    queryFn: () => api.get<Upload>(`/uploads/${id}/`),
    refetchInterval: (query) => (["pending", "processing"].includes(query.state.data?.status ?? "") ? 1500 : false),
  });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/templates/") });
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [active, setActive] = useState<string>("personal");
  const [tab, setTab] = useState("structured");
  const [meta, setMeta] = useState({ title: "", target_role: "", template: "clarity" });

  useEffect(() => {
    if (q.data?.parsed?.sections && !content) {
      setContent(q.data.parsed);
      setMeta((m) => ({ ...m, title: m.title || q.data!.original_name.replace(/\.(pdf|docx)$/i, "") }));
    }
  }, [q.data, content]);

  const retry = useMutation({ mutationFn: () => api.post(`/uploads/${id}/retry/`), onSuccess: () => { setContent(null); q.refetch(); } });
  const importIt = useMutation({
    mutationFn: () => api.post<{ resume_id: number }>(`/uploads/${id}/import/`, { ...meta, content }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["resumes"] }); toast.success("New resume created from your reviewed import"); navigate(`/app/resumes/${r.resume_id}`); },
  });
  const check = useMutation({ mutationFn: () => api.post<{ id: number }>("/reports/health/", { upload_id: Number(id) }), onSuccess: (r) => navigate(`/app/reports/${r.id}`) });
  const del = useMutation({ mutationFn: () => api.del(`/uploads/${id}/`), onSuccess: () => { toast.success("File deleted"); qc.invalidateQueries({ queryKey: ["uploads"] }); navigate("/app/resumes"); } });

  if (q.isLoading) return <FullPageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const u = q.data!;
  const busy = u.status === "pending" || u.status === "processing";
  const confidence = Math.round(u.confidence * 100);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Resumes", to: "/app/resumes" }, { label: "Review import" }]}
        title={u.original_name}
        description={`${u.file_type.toUpperCase()} · ${formatBytes(u.size)}${u.page_count ? ` · ${u.page_count} page(s)` : ""}`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => openSignedLink("upload", u.id, u.file_type === "pdf")}>View original</Button>
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm({ title: "Delete this uploaded file?", confirmLabel: "Delete file" })) del.mutate(); }}>Delete</Button>
          </>
        }
      />
      {busy ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <Loader2 className="size-8 animate-spin text-brand-500" />
          <p className="mt-4 font-medium">Reading your document…</p>
          <p className="mt-1 text-sm text-muted">Extracting text and identifying sections. This usually takes a few seconds.</p>
        </div>
      ) : u.status === "failed" ? (
        <Callout tone="danger" title="We couldn't process this file" action={<Button size="sm" variant="secondary" icon={<RotateCw className="size-3.5" />} loading={retry.isPending} onClick={() => retry.mutate()}>Retry</Button>}>
          {u.error}
        </Callout>
      ) : content ? (
        <>
          <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="card flex flex-wrap items-center gap-5 p-4">
              <UploadStatus u={u} />
              <div className="min-w-[180px] flex-1">
                <div className="flex justify-between text-xs"><span className="text-muted">Structure confidence</span><span className="font-semibold">{confidence}%</span></div>
                <ProgressBar value={confidence} className="mt-1.5" label="Structure confidence" />
              </div>
              <Button size="sm" variant="secondary" icon={<Activity className="size-4" />} loading={check.isPending} onClick={() => check.mutate()}>Check this file</Button>
            </div>
          </div>
          {u.status === "needs_review" && (
            <Callout tone="warning" className="mb-4" title="Please review carefully">
              We weren't confident about some sections. Compare with the extracted text and correct anything that looks wrong before importing.
            </Callout>
          )}
          {u.warnings.length > 0 && (
            <div className="mb-5 grid gap-2 md:grid-cols-2">
              {u.warnings.map((w) => <Callout key={w.code} tone={w.severity === "high" ? "danger" : "warning"} title={w.title}>{w.detail}</Callout>)}
            </div>
          )}
          {u.imported_resume && (
            <Callout tone="success" className="mb-4" title="Already imported">
              A resume was created from this file: <Link className="font-medium underline" to={`/app/resumes/${u.imported_resume}`}>{u.imported_resume_title}</Link>. Importing again creates another new resume.
            </Callout>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="card p-5">
              <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "structured", label: "Review sections" }, { value: "text", label: "Extracted text" }]}>
                <TabPanel value="structured">
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    <Button size="xs" variant={active === "personal" ? "subtle" : "ghost"} onClick={() => setActive("personal")}>Personal</Button>
                    {content.sections.map((s) => (
                      <Button key={s.key} size="xs" variant={active === s.key ? "subtle" : "ghost"} onClick={() => setActive(s.key)}>{s.title}</Button>
                    ))}
                  </div>
                  {active === "personal" ? (
                    <PersonalEditor value={content.personal} onChange={(personal) => setContent({ ...content, personal })} />
                  ) : (
                    content.sections.filter((s) => s.key === active).map((s) => (
                      <SectionEditor key={s.key} section={s} openAI={() => toast.info("Import first, then use the Writing Studio in the editor.")} onChange={(ns) => setContent({ ...content, sections: content.sections.map((x) => (x.key === ns.key ? ns : x)) })} />
                    ))
                  )}
                </TabPanel>
                <TabPanel value="text">
                  <p className="mb-2 flex items-center gap-2 text-xs text-muted"><FileSearch className="size-3.5" /> This is the machine-readable text a parser sees, in order.</p>
                  <pre className="scrollbar-thin max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-4 font-mono text-xs leading-relaxed">{u.extracted_text || "(no text extracted)"}</pre>
                </TabPanel>
              </Tabs>
            </div>
            <div className="space-y-4">
              <div className="card p-5">
                <h2 className="font-semibold">Create a new resume</h2>
                <p className="mt-1 text-sm text-muted">Your existing resumes are never overwritten.</p>
                <div className="mt-4 space-y-3">
                  <Field label="Title">{(fid) => <Input id={fid} value={meta.title} maxLength={120} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />}</Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Target role">{(fid) => <Input id={fid} value={meta.target_role} onChange={(e) => setMeta({ ...meta, target_role: e.target.value })} />}</Field>
                    <Field label="Template">{(fid) => <Select id={fid} value={meta.template} onChange={(e) => setMeta({ ...meta, template: e.target.value })}>{templates.data?.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</Select>}</Field>
                  </div>
                  <Button className="w-full" disabled={!meta.title.trim()} loading={importIt.isPending} onClick={() => importIt.mutate()} iconRight={<ArrowRight className="size-4" />}>Create resume from review</Button>
                </div>
              </div>
              <div className="card bg-surface-3 p-4">
                <div className="mb-2 flex justify-between text-xs text-muted"><span>Preview of reviewed content</span><Badge>{templates.data?.find((t) => t.slug === meta.template)?.name}</Badge></div>
                <ScaledPreview content={content} style={templates.data?.find((t) => t.slug === meta.template)?.style} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
