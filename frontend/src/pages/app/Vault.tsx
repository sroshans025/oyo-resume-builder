import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, Eye, FileArchive, FileText, FileUp, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, openSignedLink, type Paginated } from "@/lib/api";
import type { GeneratedFile, Upload } from "@/lib/types";
import { formatBytes, formatDate, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { Tabs, Tooltip, useConfirm } from "@/components/ui/Overlay";
import { UploadStatus } from "./Resumes";

const KIND_ICON: Record<string, typeof FileText> = { resume_pdf: FileText, resume_docx: FileText, cover_letter_pdf: Mail, cover_letter_docx: Mail, data_export: FileArchive, report_pdf: FileText };

export default function Vault() {
  const [tab, setTab] = useState("exports");
  const [kind, setKind] = useState("");
  const qc = useQueryClient();
  const confirm = useConfirm();
  const files = useQuery({ queryKey: ["files", kind], queryFn: () => api.get<Paginated<GeneratedFile>>(`/files/?page_size=100${kind ? `&kind=${kind}` : ""}`) });
  const uploads = useQuery({ queryKey: ["uploads", "all"], queryFn: () => api.get<Paginated<Upload>>("/uploads/?page_size=100") });
  const delFile = useMutation({ mutationFn: (id: number) => api.del(`/files/${id}/`), onSuccess: () => { toast.success("File deleted"); qc.invalidateQueries({ queryKey: ["files"] }); } });
  const delUpload = useMutation({ mutationFn: (id: number) => api.del(`/uploads/${id}/`), onSuccess: () => { toast.success("Upload deleted"); qc.invalidateQueries({ queryKey: ["uploads"] }); } });
  const retention = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => api.patch(`/uploads/${id}/`, { retain_until: date || null }),
    onSuccess: () => { toast.success("Retention updated"); qc.invalidateQueries({ queryKey: ["uploads"] }); },
  });
  const expiry = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => api.patch(`/files/${id}/`, { expires_at: date ? new Date(date + "T23:59:00").toISOString() : null }),
    onSuccess: () => { toast.success("Expiry updated"); qc.invalidateQueries({ queryKey: ["files"] }); },
  });
  const download = async (k: "upload" | "generated", id: number, inline = false) => {
    try { await openSignedLink(k, id, inline); } catch (e: any) { toast.error(e.friendly ?? "Download failed"); }
  };
  return (
    <div>
      <PageHeader title="Document vault" description="Your exports and uploaded files, stored privately. Downloads use short-lived links that only work while you're signed in." />
      <Callout tone="info" className="mb-5">Exports expire automatically after their expiry date; uploads are deleted after their retention date. Change either below, or set defaults in Settings → Privacy.</Callout>
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "exports", label: "Exports", count: files.data?.count }, { value: "uploads", label: "Uploaded files", count: uploads.data?.count }]} className="mb-4" />
      {tab === "exports" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[["", "All"], ["resume_pdf", "Resume PDF"], ["resume_docx", "Resume DOCX"], ["cover_letter_pdf", "Cover letters"], ["data_export", "Data exports"]].map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${kind === k ? "bg-brand-soft text-brand-fg ring-brand-500/30" : "text-muted ring-line hover:text-fg"}`}>{l}</button>
            ))}
          </div>
          {files.isLoading ? <Skeleton className="h-40 rounded-xl" /> : files.error ? <ErrorState error={files.error} /> : !files.data!.results.length ? (
            <EmptyState icon={<Archive className="size-6" />} title="No exports yet" description="Resume and cover letter exports appear here with the exact version they came from." />
          ) : (
            <ul className="card divide-y divide-line">
              {files.data!.results.map((f) => {
                const Icon = KIND_ICON[f.kind] ?? FileText;
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-surface-3 text-muted"><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.title}</p>
                      <p className="text-xs text-muted">
                        {f.kind_label} · {formatBytes(f.size)}{f.page_count ? ` · ${f.page_count} page(s)` : ""} · {formatDateTime(f.created_at)}
                        {f.resume && <> · <Link to={`/app/resumes/${f.resume}`} className="text-brand-fg hover:underline">{f.resume_title} v{f.version_number}</Link></>}
                      </p>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-muted">Expires
                      <Input type="date" className="h-8 w-36 text-xs" aria-label="Expiry date" defaultValue={f.expires_at?.slice(0, 10) ?? ""} onBlur={(e) => e.target.value !== (f.expires_at?.slice(0, 10) ?? "") && expiry.mutate({ id: f.id, date: e.target.value })} />
                    </label>
                    {f.mime_type === "application/pdf" && <Tooltip content="Open in a new tab"><IconButton label="Preview" onClick={() => download("generated", f.id, true)}><Eye className="size-4" /></IconButton></Tooltip>}
                    <IconButton label="Download" onClick={() => download("generated", f.id)}><Download className="size-4" /></IconButton>
                    <IconButton label="Delete" onClick={async () => { if (await confirm({ title: `Delete “${f.title}”?`, confirmLabel: "Delete file" })) delFile.mutate(f.id); }}><Trash2 className="size-4" /></IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : uploads.isLoading ? <Skeleton className="h-40 rounded-xl" /> : !uploads.data?.results.length ? (
        <EmptyState icon={<FileUp className="size-6" />} title="No uploaded files" description="Files you import from the Resumes page are kept here until their retention date." />
      ) : (
        <ul className="card divide-y divide-line">
          {uploads.data.results.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid size-9 place-items-center rounded-lg bg-surface-3 text-muted"><FileUp className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <Link to={`/app/uploads/${u.id}`} className="block truncate text-sm font-medium hover:text-brand-fg">{u.original_name}</Link>
                <p className="text-xs text-muted">{u.file_type.toUpperCase()} · {formatBytes(u.size)} · uploaded {formatDate(u.created_at)}{u.imported_resume_title && ` · imported as “${u.imported_resume_title}”`}</p>
              </div>
              <UploadStatus u={u} />
              <label className="flex items-center gap-1.5 text-xs text-muted">Keep until
                <Input type="date" className="h-8 w-36 text-xs" aria-label="Retain until" defaultValue={u.retain_until ?? ""} onBlur={(e) => e.target.value !== (u.retain_until ?? "") && retention.mutate({ id: u.id, date: e.target.value })} />
              </label>
              <IconButton label="Download original" onClick={() => download("upload", u.id)}><Download className="size-4" /></IconButton>
              <IconButton label="Delete" onClick={async () => { if (await confirm({ title: `Delete “${u.original_name}”?`, description: "Resumes created from it are not affected.", confirmLabel: "Delete file" })) delUpload.mutate(u.id); }}><Trash2 className="size-4" /></IconButton>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted"><Badge>Private</Badge> Files are never available at a public URL.</p>
    </div>
  );
}
