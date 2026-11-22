import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Check, Download, HelpCircle, Library, Loader2, Printer, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, downloadUrl, type Paginated } from "@/lib/api";
import type { AIResult, CoverLetter, JobDescription, ResumeSummary } from "@/lib/types";
import { useUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, ErrorState, FullPageLoader } from "@/components/ui/Feedback";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Dialog, Drawer, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, useConfirm } from "@/components/ui/Overlay";

interface Block { id: number; title: string; text: string; category: string }

export default function CoverLetterEditor() {
  const { id } = useParams();
  const qc = useQueryClient();
  const user = useUser();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["cover-letter", id], queryFn: () => api.get<CoverLetter>(`/cover-letters/${id}/`) });
  const resumes = useQuery({ queryKey: ["resumes", "active", ""], queryFn: () => api.get<Paginated<ResumeSummary>>("/resumes/?page_size=100") });
  const jds = useQuery({ queryKey: ["jds"], queryFn: () => api.get<Paginated<JobDescription>>("/job-descriptions/?page_size=100") });
  const [form, setForm] = useState<CoverLetter | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<(AIResult<any> & { draft_text: string }) | null>(null);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [saveBlock, setSaveBlock] = useState<string | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data, form]);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: (f: CoverLetter) => api.patch<CoverLetter>(`/cover-letters/${id}/`, {
      title: f.title, company: f.company, role: f.role, tone: f.tone, resume: f.resume, job_description: f.job_description,
      hiring_manager: f.hiring_manager, motivation: f.motivation, body: f.body,
    }),
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ["cover-letters"] }); },
    onError: (e: any) => toast.error(e.friendly ?? "Couldn't save"),
  });
  const set = (patch: Partial<CoverLetter>) => {
    const next = { ...form!, ...patch };
    setForm(next);
    setDirty(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save.mutate(next), 1000);
  };
  const generate = useMutation({
    mutationFn: async () => { if (dirty) await save.mutateAsync(form!); return api.post<AIResult<any> & { draft_text: string }>(`/cover-letters/${id}/generate/`); },
    onSuccess: setDraft,
  });
  const exportLetter = useMutation({
    mutationFn: async (format: "pdf" | "docx") => { if (dirty) await save.mutateAsync(form!); return api.post<{ url: string }>(`/cover-letters/${id}/export/`, { format }); },
    onSuccess: (r) => { downloadUrl(r.url); toast.success("Exported to your document vault"); },
  });

  if (q.isLoading || !form) return q.error ? <ErrorState error={q.error} /> : <FullPageLoader />;
  const words = form.body.trim() ? form.body.trim().split(/\s+/).length : 0;

  const insertAtCursor = (text: string) => {
    const el = body.current;
    const pos = el?.selectionStart ?? form.body.length;
    const next = form.body.slice(0, pos) + (form.body && pos > 0 ? "\n\n" : "") + text + form.body.slice(pos);
    set({ body: next });
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Cover letters", to: "/app/cover-letters" }, { label: form.title }]}
        title={<input aria-label="Letter title" value={form.title} onChange={(e) => set({ title: e.target.value })} className="w-full bg-transparent outline-none" maxLength={160} />}
        description={<span className="inline-flex items-center gap-1.5">{save.isPending ? <><Loader2 className="size-3 animate-spin" /> Saving…</> : dirty ? "Unsaved changes" : <><Check className="size-3 text-success" /> Saved</>}</span>}
        actions={
          <>
            <Button variant="secondary" icon={<Library className="size-4" />} onClick={() => setBlocksOpen(true)}>Reusable blocks</Button>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
            <Dropdown>
              <DropdownTrigger asChild><Button icon={<Download className="size-4" />} loading={exportLetter.isPending}>Export</Button></DropdownTrigger>
              <DropdownContent>
                <DropdownItem onSelect={() => exportLetter.mutate("pdf")}>PDF</DropdownItem>
                <DropdownItem onSelect={() => exportLetter.mutate("docx")}>Word (.docx)</DropdownItem>
              </DropdownContent>
            </Dropdown>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className="card h-fit space-y-4 p-5 no-print">
          <Field label="Role">{(fid) => <Input id={fid} value={form.role} onChange={(e) => set({ role: e.target.value })} />}</Field>
          <Field label="Company">{(fid) => <Input id={fid} value={form.company} onChange={(e) => set({ company: e.target.value })} />}</Field>
          <Field label="Hiring manager (optional)">{(fid) => <Input id={fid} value={form.hiring_manager} onChange={(e) => set({ hiring_manager: e.target.value })} placeholder="Leave blank if unknown" />}</Field>
          <Field label="Resume facts from">{(fid) => <Select id={fid} value={form.resume ?? ""} onChange={(e) => set({ resume: e.target.value ? Number(e.target.value) : null })}><option value="">Choose…</option>{resumes.data?.results.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>}</Field>
          <Field label="Job description">{(fid) => <Select id={fid} value={form.job_description ?? ""} onChange={(e) => set({ job_description: e.target.value ? Number(e.target.value) : null })}><option value="">None</option>{jds.data?.results.map((j) => <option key={j.id} value={j.id}>{j.display_title}</option>)}</Select>}</Field>
          <Field label="Tone">{(fid) => <Select id={fid} value={form.tone} onChange={(e) => set({ tone: e.target.value })}>{[["professional", "Professional"], ["concise", "Concise"], ["enthusiastic", "Warm & enthusiastic"], ["formal", "Formal"], ["fresher", "Fresher-friendly"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          <Field label="Why this role & company?" hint="In your own words. We don't research companies for you.">{(fid, d) => <Textarea id={fid} aria-describedby={d} rows={4} maxLength={2000} value={form.motivation} onChange={(e) => set({ motivation: e.target.value })} />}</Field>
          <Button className="w-full" icon={<Wand2 className="size-4" />} loading={generate.isPending} disabled={!form.resume} onClick={() => generate.mutate()}>Generate draft</Button>
          {!form.resume && <p className="text-xs text-muted">Choose a resume to generate a draft.</p>}
        </aside>
        <div className="space-y-4">
          {draft && (
            <div className="card border-brand-500/30 p-5 no-print">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="size-4 text-brand-500" />
                <p className="text-sm font-semibold">Draft ready</p>
                <Badge>{draft.provider}</Badge>
                <span className="text-xs text-muted">{draft.label}</span>
              </div>
              {draft.notice && <Callout tone="info" className="mt-3">{draft.notice.message}</Callout>}
              {draft.warnings.map((w) => <Callout key={w.code} tone="warning" className="mt-3">{w.message}</Callout>)}
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-4 font-sans text-sm leading-relaxed">{draft.draft_text}</pre>
              {draft.result.questions?.length > 0 && (
                <div className="mt-3 text-sm"><p className="flex items-center gap-1.5 font-medium"><HelpCircle className="size-4 text-brand-500" /> Before sending, answer:</p><ul className="mt-1 list-disc pl-6 text-muted">{draft.result.questions.map((qq: string) => <li key={qq}>{qq}</li>)}</ul></div>
              )}
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={async () => {
                  if (!form.body.trim() || (await confirm({ title: "Replace the current letter?", description: "Your current text will be replaced with this draft.", confirmLabel: "Replace", tone: "primary" }))) {
                    set({ body: draft.draft_text });
                    if (draft.log_id) api.post("/ai/feedback/", { log_id: draft.log_id, outcome: "accepted" }).catch(() => undefined);
                    setDraft(null);
                  }
                }}>Use this draft</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (draft.log_id) api.post("/ai/feedback/", { log_id: draft.log_id, outcome: "rejected" }).catch(() => undefined); setDraft(null); }}>Discard</Button>
              </div>
            </div>
          )}
          <div className="card p-6 sm:p-10">
            <div className="mb-6 text-sm text-muted">
              <p className="font-semibold text-fg">{user.full_name}</p>
              <p>{user.email}</p>
              <p className="mt-3">{new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
              {form.company && <p>{form.company}</p>}
            </div>
            <Textarea ref={body} aria-label="Letter body" value={form.body} onChange={(e) => set({ body: e.target.value })} rows={20} maxLength={12000}
              className="min-h-[420px] border-0 bg-transparent px-0 text-[15px] leading-7 shadow-none focus:ring-0" placeholder="Write your letter here, or generate a draft from your resume." />
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted no-print">
              <span>{words} words · aim for 250–400</span>
              <Button size="xs" variant="ghost" icon={<BookmarkPlus className="size-3.5" />} onClick={() => {
                const sel = body.current ? form.body.slice(body.current.selectionStart, body.current.selectionEnd) : "";
                setSaveBlock(sel || "");
              }}>Save selection as block</Button>
            </div>
          </div>
        </div>
      </div>
      <BlocksDrawer open={blocksOpen} onOpenChange={setBlocksOpen} onInsert={(t) => { insertAtCursor(t); setBlocksOpen(false); }} />
      {saveBlock !== null && <SaveBlockDialog initial={saveBlock} onClose={() => setSaveBlock(null)} />}
    </div>
  );
}

function BlocksDrawer({ open, onOpenChange, onInsert }: { open: boolean; onOpenChange: (v: boolean) => void; onInsert: (t: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["blocks"], queryFn: () => api.get<Block[]>("/cover-letter-blocks/"), enabled: open });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/cover-letter-blocks/${id}/`), onSuccess: () => qc.invalidateQueries({ queryKey: ["blocks"] }) });
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Reusable blocks" description="Paragraphs you've saved — e.g. a closing, a relocation note or a project highlight.">
      {q.data?.length === 0 && <p className="text-sm text-muted">No blocks yet. Select text in a letter and choose “Save selection as block”.</p>}
      <ul className="space-y-3">
        {q.data?.map((b) => (
          <li key={b.id} className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{b.title}</p>
              <div className="flex gap-1">
                <Button size="xs" onClick={() => onInsert(b.text)}>Insert</Button>
                <IconButton size="sm" label="Delete block" onClick={() => del.mutate(b.id)}><Trash2 className="size-3.5" /></IconButton>
              </div>
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-muted">{b.text}</p>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}

function SaveBlockDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [text, setText] = useState(initial);
  const create = useMutation({
    mutationFn: () => api.post("/cover-letter-blocks/", { title, text }),
    onSuccess: () => { toast.success("Block saved"); qc.invalidateQueries({ queryKey: ["blocks"] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Save reusable block" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!title.trim() || !text.trim()} loading={create.isPending} onClick={() => create.mutate()}>Save block</Button></>}>
      <div className="space-y-3">
        <Field label="Name">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Closing paragraph" autoFocus />}</Field>
        <Field label="Text">{(id) => <Textarea id={id} rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} />}</Field>
      </div>
    </Dialog>
  );
}
