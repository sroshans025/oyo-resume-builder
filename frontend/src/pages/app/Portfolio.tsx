import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, FileCode2, FilePlus2, FolderGit2, Github, Globe, Presentation, ScrollText, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Paginated } from "@/lib/api";
import type { AIResult, PortfolioProject, ResumeSummary } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, Callout, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/Feedback";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, TagInput, Textarea } from "@/components/ui/Form";
import { Dialog, Tabs, TabPanel, useConfirm } from "@/components/ui/Overlay";

type Kind = "case_study" | "readme" | "presentation" | "bullets";

export default function Portfolio() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Paginated<PortfolioProject>>("/portfolio-projects/?page_size=100") });
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { if (!sel && list.data?.results[0]) setSel(list.data.results[0].id); }, [list.data, sel]);
  const create = useMutation({
    mutationFn: () => api.post<PortfolioProject>("/portfolio-projects/", { title: "Untitled project" }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["projects"] }); setSel(p.id); },
  });
  const project = list.data?.results.find((p) => p.id === sel);
  return (
    <div>
      <PageHeader title="Portfolio & projects" description="Capture the projects that prove your skills, then generate case-study outlines, README drafts, presentation outlines and resume bullets from your own notes."
        actions={<Button icon={<FilePlus2 className="size-4" />} loading={create.isPending} onClick={() => create.mutate()}>New project</Button>} />
      {list.isLoading ? <Skeleton className="h-72 rounded-xl" /> : list.error ? <ErrorState error={list.error} /> : !list.data!.results.length ? (
        <EmptyState icon={<FolderGit2 className="size-6" />} title="Add your first project" description="Academic projects, internships, hackathons and side projects all count." action={<Button onClick={() => create.mutate()}>New project</Button>} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <ul className="card h-fit divide-y divide-line">
            {list.data!.results.map((p) => {
              const done = p.evidence.filter((e) => e.done).length;
              return (
                <li key={p.id}>
                  <button onClick={() => setSel(p.id)} className={cn("w-full px-4 py-3 text-left transition", sel === p.id ? "bg-brand-soft" : "hover:bg-surface-2")}>
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted">Evidence {done}/{p.evidence.length} · {relativeTime(p.updated_at)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          {project && <ProjectEditor key={project.id} project={project} onDeleted={() => setSel(null)} />}
        </div>
      )}
    </div>
  );
}

function ProjectEditor({ project, onDeleted }: { project: PortfolioProject; onDeleted: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [p, setP] = useState(project);
  const [tab, setTab] = useState("details");
  const [gen, setGen] = useState<{ kind: Kind; r: AIResult<any> } | null>(null);
  const [addOpen, setAddOpen] = useState<string[] | null>(null);
  const save = useMutation({
    mutationFn: (body: Partial<PortfolioProject>) => api.patch<PortfolioProject>(`/portfolio-projects/${p.id}/`, body),
    onSuccess: (np) => { setP(np); qc.invalidateQueries({ queryKey: ["projects"] }); },
  });
  const generate = useMutation({
    mutationFn: async (kind: Kind) => { await save.mutateAsync(p); return { kind, r: await api.post<AIResult<any>>(`/portfolio-projects/${p.id}/generate/`, { kind }) }; },
    onSuccess: (x) => { setGen(x); setTab("drafts"); },
  });
  const del = useMutation({ mutationFn: () => api.del(`/portfolio-projects/${p.id}/`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); onDeleted(); } });
  const set = (patch: Partial<PortfolioProject>) => setP({ ...p, ...patch });
  const done = p.evidence.filter((e) => e.done).length;
  const docText = (r: any) => r.sections ? `# ${r.title}\n\n` + r.sections.map((s: any) => `## ${s.heading}\n${s.body}`).join("\n\n") : r.bullets.map((b: string) => `• ${b}`).join("\n");

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input aria-label="Project title" value={p.title} onChange={(e) => set({ title: e.target.value })} className="h-11 max-w-md text-lg font-semibold" />
        <Button loading={save.isPending} onClick={() => save.mutate(p)} icon={<Check className="size-4" />}>Save</Button>
        <IconButton label="Delete project" onClick={async () => { if (await confirm({ title: `Delete “${p.title}”?`, confirmLabel: "Delete" })) del.mutate(); }}><Trash2 className="size-4" /></IconButton>
      </div>
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "details", label: "Details" }, { value: "evidence", label: `Evidence ${done}/${p.evidence.length}` }, { value: "drafts", label: "Generate" }]}>
        <TabPanel value="details">
          <div className="card grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Type">{(id) => <Select id={id} value={p.kind} onChange={(e) => set({ kind: e.target.value })}><option value="personal">Personal</option><option value="academic">Academic</option><option value="internship">Internship</option><option value="work">Work</option><option value="open_source">Open source</option></Select>}</Field>
            <Field label="Your role">{(id) => <Input id={id} value={p.role} onChange={(e) => set({ role: e.target.value })} placeholder="Solo / Backend lead" />}</Field>
            <Field label="One-line summary" className="sm:col-span-2">{(id) => <Input id={id} value={p.summary} maxLength={400} onChange={(e) => set({ summary: e.target.value })} />}</Field>
            {([["problem", "Problem"], ["users", "Users"], ["approach", "Approach"], ["architecture", "Architecture"], ["results", "Results (only real outcomes)"], ["lessons", "Lessons learned"]] as const).map(([k, l]) => (
              <Field key={k} label={l} className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={p[k]} onChange={(e) => set({ [k]: e.target.value } as any)} />}</Field>
            ))}
            <Field label="Tools & technologies" className="sm:col-span-2">{(id) => <TagInput id={id} value={p.tools} onChange={(tools) => set({ tools })} max={30} />}</Field>
            <Field label="GitHub / repository">{(id) => <Input id={id} type="url" value={p.github_url} onChange={(e) => set({ github_url: e.target.value })} placeholder="https://github.com/…" />}</Field>
            <Field label="Live demo">{(id) => <Input id={id} type="url" value={p.demo_url} onChange={(e) => set({ demo_url: e.target.value })} placeholder="https://" />}</Field>
            <Field label="Portfolio page" className="sm:col-span-2">{(id) => <Input id={id} type="url" value={p.portfolio_url} onChange={(e) => set({ portfolio_url: e.target.value })} placeholder="https://" />}</Field>
            <div className="flex flex-wrap gap-3 text-sm sm:col-span-2">
              {p.github_url && <a className="inline-flex items-center gap-1.5 text-brand-fg" href={p.github_url} target="_blank" rel="noopener noreferrer"><Github className="size-4" /> Repository <ExternalLink className="size-3" /></a>}
              {p.demo_url && <a className="inline-flex items-center gap-1.5 text-brand-fg" href={p.demo_url} target="_blank" rel="noopener noreferrer"><Globe className="size-4" /> Demo <ExternalLink className="size-3" /></a>}
            </div>
            <p className="text-xs text-muted sm:col-span-2">{p.link_verification}</p>
          </div>
        </TabPanel>
        <TabPanel value="evidence">
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-3"><ProgressBar value={p.evidence.length ? (done / p.evidence.length) * 100 : 0} label="Evidence checklist" /><span className="text-sm font-semibold tabular-nums">{done}/{p.evidence.length}</span></div>
            <ul className="space-y-2">
              {p.evidence.map((e, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                    <input type="checkbox" className="size-4 accent-brand-500" checked={e.done} onChange={() => { const evidence = p.evidence.map((x, j) => (j === i ? { ...x, done: !x.done } : x)); set({ evidence }); save.mutate({ evidence }); }} />
                    <span className={cn("text-sm", e.done && "text-muted line-through")}>{e.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">Tick items yourself as you add them — we can't see your repository or website.</p>
          </div>
        </TabPanel>
        <TabPanel value="drafts">
          <div className="grid gap-3 sm:grid-cols-4">
            {([["case_study", "Case study", ScrollText], ["readme", "README", FileCode2], ["presentation", "Presentation", Presentation], ["bullets", "Resume bullets", Sparkles]] as const).map(([k, l, Icon]) => (
              <button key={k} onClick={() => generate.mutate(k)} disabled={generate.isPending} className={cn("card flex flex-col items-start gap-2 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 disabled:opacity-60", gen?.kind === k && "ring-1 ring-brand-500")}>
                <Icon className="size-5 text-brand-500" /><span className="text-sm font-semibold">{l}</span>
              </button>
            ))}
          </div>
          {generate.isPending && <p className="mt-4 text-sm text-muted">Generating from your project details…</p>}
          {gen && !generate.isPending && (
            <div className="card mt-5 p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2"><Badge>{gen.r.provider}</Badge><span className="text-xs text-muted">{gen.r.label}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="xs" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => { navigator.clipboard?.writeText(docText(gen.r.result)); toast.success("Copied"); }}>Copy</Button>
                  {gen.kind === "bullets" ? <Button size="xs" onClick={() => setAddOpen(gen.r.result.bullets)}>Add to a resume</Button> : (
                    <Button size="xs" onClick={() => { const drafts = { ...p.drafts, [gen.kind]: docText(gen.r.result) }; save.mutate({ drafts }); toast.success("Saved to this project"); }}>Save draft to project</Button>
                  )}
                </div>
              </div>
              {gen.r.notice && <Callout tone="info" className="mb-3">{gen.r.notice.message}</Callout>}
              {gen.r.warnings.map((w) => <Callout key={w.code} tone="warning" className="mb-3">{w.message}</Callout>)}
              {gen.r.result.sections ? (
                <div className="space-y-4">
                  <h3 className="font-semibold">{gen.r.result.title}</h3>
                  {gen.r.result.sections.map((s: any) => (
                    <div key={s.heading}><p className="text-sm font-semibold">{s.heading}</p><p className={cn("mt-1 whitespace-pre-line text-sm", s.body.startsWith("[") ? "italic text-muted" : "text-fg-2")}>{s.body}</p></div>
                  ))}
                </div>
              ) : (
                <ul className="list-disc space-y-1.5 pl-5 text-sm">{gen.r.result.bullets.map((b: string) => <li key={b}>{b}</li>)}</ul>
              )}
              {gen.r.result.questions?.length > 0 && <Callout tone="info" className="mt-4" title="Fill these gaps">{gen.r.result.questions.map((q: string) => <p key={q}>{q}</p>)}</Callout>}
            </div>
          )}
          {Object.keys(p.drafts).length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Saved drafts</p>
              {Object.entries(p.drafts).map(([k, v]) => (
                <details key={k} className="card mb-2 p-4"><summary className="cursor-pointer text-sm font-medium capitalize">{k.replace("_", " ")}</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-fg-2">{String(v)}</pre></details>
              ))}
            </div>
          )}
        </TabPanel>
      </Tabs>
      {addOpen && <AddToResume projectId={p.id} bullets={addOpen} onClose={() => setAddOpen(null)} />}
    </div>
  );
}

function AddToResume({ projectId, bullets, onClose }: { projectId: number; bullets: string[]; onClose: () => void }) {
  const resumes = useQuery({ queryKey: ["resumes", "active", ""], queryFn: () => api.get<Paginated<ResumeSummary>>("/resumes/?page_size=100") });
  const [rid, setRid] = useState("");
  const [items, setItems] = useState(bullets);
  const add = useMutation({
    mutationFn: () => api.post(`/portfolio-projects/${projectId}/add-to-resume/`, { resume_id: Number(rid), bullets: items.filter((b) => b.trim()) }),
    onSuccess: () => { toast.success("Added to the resume's Projects section"); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Add project to a resume" description="Review the bullets first — replace any [placeholders] with real details." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!rid} loading={add.isPending} onClick={() => add.mutate()}>Add to resume</Button></>}>
      <Field label="Resume">{(id) => <Select id={id} value={rid} onChange={(e) => setRid(e.target.value)}><option value="">Choose…</option>{resumes.data?.results.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>}</Field>
      <div className="mt-4 space-y-2">
        {items.map((b, i) => <Textarea key={i} aria-label={`Bullet ${i + 1}`} rows={2} value={b} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} />)}
      </div>
    </Dialog>
  );
}
