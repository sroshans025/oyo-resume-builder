import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, FilePlus2, FileText, MoreVertical, Pencil, Search, Trash2, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { api, type Paginated } from "@/lib/api";
import type { ResumeSummary, Template, Upload } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, EmptyState, ErrorState, SkeletonCards } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Dialog, Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, Tabs, useConfirm } from "@/components/ui/Overlay";
import { UploadDropzone } from "@/components/resume/UploadDropzone";
import { useUser } from "@/lib/auth";

export default function Resumes() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [createOpen, setCreateOpen] = useState(params.get("new") === "1");
  const [uploadOpen, setUploadOpen] = useState(params.get("upload") === "1");
  const [rename, setRename] = useState<ResumeSummary | null>(null);
  const [dup, setDup] = useState<ResumeSummary | null>(null);
  const qc = useQueryClient();
  const confirm = useConfirm();

  useEffect(() => {
    if (params.get("new") || params.get("upload")) setParams({}, { replace: true });
  }, [params, setParams]);

  const list = useQuery({
    queryKey: ["resumes", tab, search],
    queryFn: () => api.get<Paginated<ResumeSummary>>(`/resumes/?page_size=100${tab === "archived" ? "&status=archived" : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`),
  });
  const uploads = useQuery({ queryKey: ["uploads"], queryFn: () => api.get<Paginated<Upload>>("/uploads/?page_size=6") });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/templates/") });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/resumes/${id}/`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resumes"] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/resumes/${id}/`),
    onSuccess: () => { toast.success("Resume deleted"); qc.invalidateQueries({ queryKey: ["resumes"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });

  const tName = (slug: string) => templates.data?.find((t) => t.slug === slug)?.name ?? slug;

  return (
    <div>
      <PageHeader
        title="Resumes"
        description="Keep a general resume and role-specific copies. Every export, analysis and application records the exact version used."
        actions={
          <>
            <Button variant="secondary" icon={<UploadIcon className="size-4" />} onClick={() => setUploadOpen(true)}>Import PDF/DOCX</Button>
            <Button icon={<FilePlus2 className="size-4" />} onClick={() => setCreateOpen(true)}>New resume</Button>
          </>
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} className="sm:w-auto" />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input aria-label="Search resumes" placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {list.isLoading ? (
        <SkeletonCards count={3} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data!.results.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title={search ? "No resumes match that search" : tab === "archived" ? "Nothing archived" : "Create your first resume"}
          description={!search && tab === "active" ? "Start from guided sections, or import an existing PDF or DOCX and review what we extract." : undefined}
          action={!search && tab === "active" && (
            <>
              <Button icon={<FilePlus2 className="size-4" />} onClick={() => setCreateOpen(true)}>New resume</Button>
              <Button variant="secondary" icon={<UploadIcon className="size-4" />} onClick={() => setUploadOpen(true)}>Import</Button>
            </>
          )}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.data!.results.map((r) => (
            <div key={r.id} className="card group relative flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-fg"><FileText className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <Link to={`/app/resumes/${r.id}`} className="block truncate font-semibold after:absolute after:inset-0 hover:text-brand-fg">{r.title}</Link>
                  <p className="truncate text-sm text-muted">{r.target_role || "No target role set"}</p>
                </div>
                <Dropdown>
                  <DropdownTrigger asChild>
                    <button className="relative z-10 rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Actions for ${r.title}`}><MoreVertical className="size-4" /></button>
                  </DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem icon={<Pencil />} onSelect={() => setRename(r)}>Rename & target role</DropdownItem>
                    <DropdownItem icon={<Copy />} onSelect={() => setDup(r)}>Duplicate for a role</DropdownItem>
                    {r.status === "archived" ? (
                      <DropdownItem icon={<ArchiveRestore />} onSelect={() => patch.mutate({ id: r.id, body: { status: "draft" } })}>Restore</DropdownItem>
                    ) : (
                      <DropdownItem icon={<Archive />} onSelect={() => patch.mutate({ id: r.id, body: { status: "archived" } })}>Archive</DropdownItem>
                    )}
                    <DropdownSeparator />
                    <DropdownItem danger icon={<Trash2 />} onSelect={async () => {
                      if (await confirm({ title: `Delete “${r.title}”?`, description: "The resume, its versions and its analysis reports will be permanently deleted. Exported files in your vault are kept until you delete them.", confirmLabel: "Delete resume" })) remove.mutate(r.id);
                    }}>Delete</DropdownItem>
                  </DropdownContent>
                </Dropdown>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge tone={r.status === "ready" ? "success" : "neutral"} dot>{r.status}</Badge>
                <Badge>{tName(r.template)}</Badge>
                {r.latest_version && <Badge>v{r.latest_version.number}</Badge>}
                {r.copied_from && <Badge tone="violet">role copy</Badge>}
                {r.source === "upload" && <Badge tone="brand">imported</Badge>}
              </div>
              <div className="mt-auto flex items-center justify-between pt-5 text-xs text-muted">
                <span>Edited {relativeTime(r.updated_at)}</span>
                {r.latest_score ? (
                  <Link to={`/app/reports/${r.latest_score.report_id}`} className="relative z-10 font-medium text-fg-2 hover:text-brand-fg">Quality est. {r.latest_score.quality_score}</Link>
                ) : <span>Not checked yet</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {uploads.data && uploads.data.results.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-fg-2">Recent imports</h2>
          <ul className="card divide-y divide-line">
            {uploads.data.results.map((u) => (
              <li key={u.id}>
                <Link to={`/app/uploads/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <UploadIcon className="size-4 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.original_name}</span>
                  <UploadStatus u={u} />
                  <span className="hidden text-xs text-muted sm:block">{relativeTime(u.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} templates={templates.data ?? []} />
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen} title="Import an existing resume" description="We'll extract the text and propose sections. You review and correct them before a new resume is created.">
        <UploadDropzone onDone={() => setUploadOpen(false)} />
      </Dialog>
      {rename && <RenameDialog resume={rename} onClose={() => setRename(null)} />}
      {dup && <DuplicateDialog resume={dup} onClose={() => setDup(null)} />}
    </div>
  );
}

export function UploadStatus({ u }: { u: Upload }) {
  const map: Record<Upload["status"], [string, "neutral" | "brand" | "success" | "warning" | "danger"]> = {
    pending: ["Queued", "neutral"], processing: ["Processing", "brand"], parsed: ["Ready to review", "success"],
    needs_review: ["Needs review", "warning"], failed: ["Failed", "danger"],
  };
  const [label, tone] = map[u.status];
  return <Badge tone={tone} dot>{u.imported_resume ? "Imported" : label}</Badge>;
}

function CreateDialog({ open, onOpenChange, templates }: { open: boolean; onOpenChange: (v: boolean) => void; templates: Template[] }) {
  const user = useUser();
  const navigate = useNavigate();
  const fresher = ["student", "fresher"].includes(user.profile.experience_level);
  const [form, setForm] = useState({ title: "", target_role: user.profile.preferred_roles[0] ?? "", template: fresher ? "launch" : "clarity", layout: fresher ? "fresher" : "standard" });
  const create = useMutation({
    mutationFn: () => api.post<{ id: number }>("/resumes/", { ...form, title: form.title || `${form.target_role || "General"} resume` }),
    onSuccess: (r) => { onOpenChange(false); navigate(`/app/resumes/${r.id}`); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New resume" description="We'll pre-fill your name and email. You can change anything later."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Create & open editor</Button></>}>
      <div className="space-y-4">
        <Field label="Title" hint="Only you see this — e.g. 'Data Analyst — general'.">{(id) => <Input id={id} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />}</Field>
        <Field label="Target role (optional)">{(id) => <Input id={id} value={form.target_role} maxLength={120} onChange={(e) => setForm({ ...form, target_role: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template">{(id) => <Select id={id} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>{templates.map((t) => <option key={t.slug} value={t.slug}>{t.name} — {t.category}</option>)}</Select>}</Field>
          <Field label="Section order">{(id) => <Select id={id} value={form.layout} onChange={(e) => setForm({ ...form, layout: e.target.value })}><option value="standard">Experience first</option><option value="fresher">Education & projects first</option></Select>}</Field>
        </div>
      </div>
    </Dialog>
  );
}

function RenameDialog({ resume, onClose }: { resume: ResumeSummary; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(resume.title);
  const [role, setRole] = useState(resume.target_role);
  const save = useMutation({
    mutationFn: () => api.patch(`/resumes/${resume.id}/`, { title, target_role: role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resumes"] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Rename resume" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!title.trim()} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Title">{(id) => <Input id={id} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Target role">{(id) => <Input id={id} value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

function DuplicateDialog({ resume, onClose }: { resume: ResumeSummary; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState(`${resume.title} (copy)`);
  const [role, setRole] = useState(resume.target_role);
  const dup = useMutation({
    mutationFn: () => api.post<{ id: number }>(`/resumes/${resume.id}/duplicate/`, { title, target_role: role }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["resumes"] }); toast.success("Copy created"); onClose(); navigate(`/app/resumes/${r.id}`); },
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Duplicate for a role" description="Tailor the copy for a specific job while your original stays unchanged." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!title.trim()} loading={dup.isPending} onClick={() => dup.mutate()} icon={<Copy className="size-4" />}>Duplicate</Button></>}>
      <div className={cn("space-y-4")}>
        <Field label="New title">{(id) => <Input id={id} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Target role">{(id) => <Input id={id} value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Backend Engineer at Acme" />}</Field>
      </div>
    </Dialog>
  );
}
