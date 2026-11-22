import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Paginated } from "@/lib/api";
import type { CoverLetter, JobDescription, ResumeSummary } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, EmptyState, ErrorState, SkeletonCards } from "@/components/ui/Feedback";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog, useConfirm } from "@/components/ui/Overlay";
import { Field, Input, Select } from "@/components/ui/Form";

export default function CoverLetters() {
  const q = useQuery({ queryKey: ["cover-letters"], queryFn: () => api.get<Paginated<CoverLetter>>("/cover-letters/?page_size=100") });
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const del = useMutation({ mutationFn: (id: number) => api.del(`/cover-letters/${id}/`), onSuccess: () => { toast.success("Letter deleted"); qc.invalidateQueries({ queryKey: ["cover-letters"] }); } });
  return (
    <div>
      <PageHeader title="Cover letters" description="Role-specific drafts built from your verified resume facts and your own reasons for applying — never invented company research." actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New letter</Button>} />
      {q.isLoading ? <SkeletonCards /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.results.length === 0 ? (
        <EmptyState icon={<Mail className="size-6" />} title="No cover letters yet" description="Pick a resume and (optionally) a saved job description, then generate an editable draft." action={<Button onClick={() => setOpen(true)} icon={<Plus className="size-4" />}>New letter</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.results.map((l) => (
            <div key={l.id} className="card relative p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <div className="flex items-start gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-fg"><Mail className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <Link to={`/app/cover-letters/${l.id}`} className="block truncate font-semibold after:absolute after:inset-0 hover:text-brand-fg">{l.title}</Link>
                  <p className="truncate text-sm text-muted">{[l.role, l.company].filter(Boolean).join(" · ") || "No role set"}</p>
                </div>
                <IconButton size="sm" className="relative z-10" label="Delete letter" onClick={async () => { if (await confirm({ title: `Delete “${l.title}”?`, confirmLabel: "Delete" })) del.mutate(l.id); }}><Trash2 className="size-3.5" /></IconButton>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge>{l.word_count} words</Badge>
                <Badge className="capitalize">{l.tone}</Badge>
                {l.resume_title && <Badge tone="brand">{l.resume_title}</Badge>}
              </div>
              <p className="mt-4 text-xs text-muted">Edited {relativeTime(l.updated_at)}</p>
            </div>
          ))}
        </div>
      )}
      <NewLetterDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewLetterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const resumes = useQuery({ queryKey: ["resumes", "active", ""], queryFn: () => api.get<Paginated<ResumeSummary>>("/resumes/?page_size=100"), enabled: open });
  const jds = useQuery({ queryKey: ["jds"], queryFn: () => api.get<Paginated<JobDescription>>("/job-descriptions/?page_size=100"), enabled: open });
  const [form, setForm] = useState({ title: "", company: "", role: "", resume: "", job_description: "" });
  const create = useMutation({
    mutationFn: () => api.post<CoverLetter>("/cover-letters/", {
      title: form.title || `${form.role || "Cover letter"}${form.company ? ` — ${form.company}` : ""}`,
      company: form.company, role: form.role, resume: form.resume ? Number(form.resume) : null, job_description: form.job_description ? Number(form.job_description) : null,
    }),
    onSuccess: (l) => { onOpenChange(false); navigate(`/app/cover-letters/${l.id}`); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New cover letter"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Create</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role">{(id) => <Input id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />}</Field>
        <Field label="Company">{(id) => <Input id={id} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />}</Field>
        <Field label="Draw facts from resume" className="sm:col-span-2">
          {(id) => <Select id={id} value={form.resume} onChange={(e) => setForm({ ...form, resume: e.target.value })}><option value="">Choose a resume…</option>{resumes.data?.results.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>}
        </Field>
        <Field label="Job description (optional)" className="sm:col-span-2" hint="Used to highlight requirements you've already demonstrated.">
          {(id) => <Select id={id} value={form.job_description} onChange={(e) => {
            const jd = jds.data?.results.find((j) => String(j.id) === e.target.value);
            setForm({ ...form, job_description: e.target.value, role: form.role || jd?.display_title || "", company: form.company || jd?.company || "" });
          }}><option value="">None</option>{jds.data?.results.map((j) => <option key={j.id} value={j.id}>{j.display_title}{j.company ? ` · ${j.company}` : ""}</option>)}</Select>}
        </Field>
      </div>
    </Dialog>
  );
}
