import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity, AlertCircle, ArrowLeft, Check, CloudOff, Copy, Download, EyeOff, FileDown, GitCompare, GripVertical, History,
  LayoutTemplate, Loader2, MoreHorizontal, Plus, RotateCcw, Save, Share2, Sparkles, Target, Trash2, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, downloadUrl } from "@/lib/api";
import type { Resume, ResumeContent, Section, SectionType, Template, Version } from "@/lib/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, Callout, ErrorState, FullPageLoader } from "@/components/ui/Feedback";
import { Dialog, Drawer, Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger, Tooltip, useConfirm } from "@/components/ui/Overlay";
import { Field, Input, Select, Switch } from "@/components/ui/Form";
import { ScaledPreview } from "@/components/resume/ResumePreview";
import { PersonalEditor, SECTION_LABELS, SectionEditor, emptySection, type OpenAI } from "@/components/resume/SectionEditors";
import { AIStudio, type StudioContext, type StudioMode } from "@/components/resume/AIStudio";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
const PERSONAL = "__personal";

export default function ResumeEditor() {
  const { id } = useParams();
  const rid = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["resume", rid], queryFn: () => api.get<Resume>(`/resumes/${rid}/`), refetchOnWindowFocus: false });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/templates/") });

  const [content, setContent] = useState<ResumeContent | null>(null);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [active, setActive] = useState<string>(PERSONAL);
  const [pages, setPages] = useState(1);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [navOpen, setNavOpen] = useState(false);
  const select = (key: string) => {
    setActive(key);
    setNavOpen(false);
  };
  const [studio, setStudio] = useState<{ open: boolean; mode: StudioMode; ctx: StudioContext }>({ open: false, mode: "bullet", ctx: {} });
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [fieldError, setFieldError] = useState<ApiError | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<{ content: ResumeContent | null; revision: number }>({ content: null, revision: 0 });

  useEffect(() => {
    if (q.data && content === null) {
      setContent(q.data.content);
      setRevision(q.data.revision);
      setSavedAt(q.data.updated_at);
    }
  }, [q.data, content]);
  latest.current = { content, revision };

  const save = useCallback(
    async (force = false) => {
      const { content: c, revision: r } = latest.current;
      if (!c) return;
      setSaveState("saving");
      try {
        const res = await api.put<{ revision: number; updated_at: string }>(`/resumes/${rid}/content/`, { revision: r, content: c, force });
        setRevision(res.revision);
        latest.current.revision = res.revision;
        setSavedAt(res.updated_at);
        setFieldError(null);
        setSaveState((s) => (s === "saving" ? "saved" : s));
        qc.invalidateQueries({ queryKey: ["resumes"] });
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 409) setSaveState("conflict");
        else {
          setSaveState("error");
          if (err.status === 400) setFieldError(err);
        }
      }
    },
    [rid, qc],
  );

  const update = (next: ResumeContent) => {
    setContent(next);
    setSaveState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(), 1200);
  };

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving" || saveState === "error") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const patchMeta = useMutation({
    mutationFn: (body: Partial<Pick<Resume, "title" | "template" | "target_role" | "status">>) => api.patch<Resume>(`/resumes/${rid}/`, body),
    onSuccess: (r) => {
      qc.setQueryData<Resume>(["resume", rid], (old) => (old ? { ...old, ...r, content: old.content } : old));
      qc.invalidateQueries({ queryKey: ["resumes"] });
    },
  });

  const exportFile = useMutation({
    mutationFn: async (format: "pdf" | "docx") => {
      if (saveState !== "saved") await save();
      return api.post<{ url: string; page_count: number; version: Version }>(`/resumes/${rid}/export/`, { format });
    },
    onSuccess: (r, format) => {
      downloadUrl(r.url);
      toast.success(`${format.toUpperCase()} exported as version ${r.version.number}`, { description: format === "pdf" ? `${r.page_count} page(s). Saved to your document vault.` : "Saved to your document vault." });
      qc.invalidateQueries({ queryKey: ["versions", rid] });
    },
  });

  const healthCheck = useMutation({
    mutationFn: async () => {
      if (saveState !== "saved") await save();
      return api.post<{ id: number }>("/reports/health/", { resume_id: rid });
    },
    onSuccess: (r) => navigate(`/app/reports/${r.id}`),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!content || !e.over || e.active.id === e.over.id) return;
    const from = content.sections.findIndex((s) => s.key === e.active.id);
    const to = content.sections.findIndex((s) => s.key === e.over!.id);
    update({ ...content, sections: arrayMove(content.sections, from, to) });
  };

  const openAI: OpenAI = (mode, ctx) => setStudio({ open: true, mode, ctx: { ...ctx, resumeId: rid, targetRole: q.data?.target_role } });

  const template = useMemo(() => templates.data?.find((t) => t.slug === q.data?.template), [templates.data, q.data?.template]);

  if (q.isLoading || (!content && !q.error)) return <FullPageLoader />;
  if (q.error) return <div className="p-6"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const resume = q.data!;
  const c = content!;
  const activeSection = c.sections.find((s) => s.key === active);
  const presentTypes = new Set(c.sections.map((s) => s.type));
  const addable = (Object.keys(SECTION_LABELS) as SectionType[]).filter((t) => t === "custom" || !presentTypes.has(t));

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="sticky top-16 z-10 border-b border-line bg-surface/95 backdrop-blur no-print">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
          <IconButton label="Back to resumes" onClick={() => navigate("/app/resumes")}><ArrowLeft className="size-4" /></IconButton>
          <TitleEditor value={resume.title} onSave={(title) => patchMeta.mutate({ title })} />
          <SaveIndicator state={saveState} savedAt={savedAt} onRetry={() => save()} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="secondary" size="sm" icon={<LayoutTemplate className="size-4" />}>{template?.name ?? "Template"}</Button>
              </DropdownTrigger>
              <DropdownContent className="w-64">
                <DropdownLabel>Switch template — content is kept</DropdownLabel>
                {templates.data?.map((t) => (
                  <DropdownItem key={t.slug} onSelect={() => patchMeta.mutate({ template: t.slug })} icon={<span className="block size-3 rounded-full" style={{ background: t.style.accent }} />}>
                    <span className="flex-1">{t.name} <span className="text-xs text-muted">· {t.category}</span></span>
                    {t.slug === resume.template && <Check className="size-4 text-brand-500" />}
                  </DropdownItem>
                ))}
              </DropdownContent>
            </Dropdown>
            <Button variant="secondary" size="sm" icon={<Sparkles className="size-4 text-brand-500" />} onClick={() => openAI("bullet", {})} className="hidden sm:inline-flex">Writing Studio</Button>
            <Button variant="secondary" size="sm" icon={<History className="size-4" />} onClick={() => setVersionsOpen(true)}>Versions</Button>
            <Dropdown>
              <DropdownTrigger asChild>
                <Button size="sm" icon={exportFile.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}>Export</Button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownItem icon={<FileDown />} onSelect={() => exportFile.mutate("pdf")}>PDF (text-selectable)</DropdownItem>
                <DropdownItem icon={<FileDown />} onSelect={() => exportFile.mutate("docx")}>Word (.docx)</DropdownItem>
              </DropdownContent>
            </Dropdown>
            <Dropdown>
              <DropdownTrigger asChild><IconButton label="More actions"><MoreHorizontal className="size-4" /></IconButton></DropdownTrigger>
              <DropdownContent>
                <DropdownItem icon={<Activity />} onSelect={() => healthCheck.mutate()}>Run health check</DropdownItem>
                <DropdownItem icon={<Target />} onSelect={() => navigate(`/app/job-match?resume=${rid}`)}>Match to a job</DropdownItem>
                <DropdownItem icon={<Share2 />} onSelect={() => setShareOpen(true)}>Share for review</DropdownItem>
                <DropdownSeparator />
                <DropdownItem icon={<Check />} onSelect={() => patchMeta.mutate({ status: resume.status === "ready" ? "draft" : "ready" })}>
                  Mark as {resume.status === "ready" ? "draft" : "ready"}
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          </div>
        </div>
        {saveState === "conflict" && (
          <div className="border-t border-amber-500/30 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <AlertCircle className="size-4" />
              <span className="flex-1">This resume changed in another tab or device. Your latest edits aren't saved yet.</span>
              <Button size="xs" variant="secondary" onClick={async () => { if (await confirm({ title: "Discard your unsaved edits?", description: "The latest saved version will be loaded.", confirmLabel: "Reload" })) { setContent(null); q.refetch(); setSaveState("saved"); } }}>Reload latest</Button>
              <Button size="xs" onClick={() => save(true)}>Keep mine & overwrite</Button>
            </div>
          </div>
        )}
        {fieldError && saveState === "error" && (
          <div className="border-t border-rose-500/20 bg-rose-50 px-4 py-2 text-sm text-rose-900 dark:bg-rose-500/10 dark:text-rose-100 sm:px-6">
            Couldn't save: {fieldError.friendly}
          </div>
        )}
        <div className="flex border-t border-line lg:hidden" role="tablist" aria-label="Editor view">
          {(["edit", "preview"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} className={cn("flex-1 py-2 text-sm font-medium capitalize", mobileView === v ? "border-b-2 border-brand-500 text-fg" : "text-muted")}>{v}</button>
          ))}
        </div>
      </div>

      <div className="grid flex-1 lg:grid-cols-[230px_minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Section navigator */}
        <aside id="section-nav" className={cn("border-b border-line bg-bg-subtle p-3 lg:block lg:border-b-0 lg:border-r", mobileView === "edit" && navOpen ? "block" : "hidden")} aria-label="Sections">
          <button onClick={() => select(PERSONAL)} className={cn("mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium", active === PERSONAL ? "bg-surface text-fg shadow-xs ring-1 ring-line" : "text-muted hover:text-fg")}>
            <UserRound className="size-4" /> Personal details
          </button>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={c.sections.map((s) => s.key)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1">
                {c.sections.map((s) => (
                  <SortableSection key={s.key} section={s} active={active === s.key} onSelect={() => select(s.key)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" icon={<Plus className="size-4" />}>Add section</Button>
            </DropdownTrigger>
            <DropdownContent align="start">
              {addable.map((t) => (
                <DropdownItem key={t} onSelect={() => { const s = emptySection(t); update({ ...c, sections: [...c.sections, s] }); setActive(s.key); }}>{SECTION_LABELS[t]}</DropdownItem>
              ))}
            </DropdownContent>
          </Dropdown>
          <p className="mt-4 px-2 text-[11px] leading-relaxed text-faint">Drag sections (or focus + space, then arrow keys) to reorder. Hidden sections are kept but not exported.</p>
        </aside>

        {/* Form */}
        <section className={cn("min-w-0 p-4 sm:p-6 lg:block", mobileView === "edit" ? "block" : "hidden")} aria-label="Editor">
          <button
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-controls="section-nav"
            className="mb-4 flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-medium lg:hidden"
          >
            <span>Section: {active === PERSONAL ? "Personal details" : activeSection?.title}</span>
            <span className="text-xs text-brand-fg">{navOpen ? "Close" : "Change"}</span>
          </button>
          {active === PERSONAL ? (
            <>
              <h2 className="mb-1 text-lg font-semibold">Personal details</h2>
              <p className="mb-5 text-sm text-muted">Contact information at the top of your resume.</p>
              <PersonalEditor value={c.personal} onChange={(personal) => update({ ...c, personal })} errors={(k) => fieldError?.field(`content.${k}`) ?? fieldError?.field(k)} />
            </>
          ) : activeSection ? (
            <>
              <div className="mb-5 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{activeSection.title || SECTION_LABELS[activeSection.type]}</h2>
                <Button size="xs" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={async () => {
                  if (await confirm({ title: `Remove “${activeSection.title}”?`, description: "The section and its entries will be removed from the draft. Saved versions keep a copy.", confirmLabel: "Remove section" })) {
                    update({ ...c, sections: c.sections.filter((s) => s.key !== activeSection.key) });
                    setActive(PERSONAL);
                  }
                }}>Remove section</Button>
              </div>
              <SectionEditor section={activeSection} openAI={openAI} onChange={(s) => update({ ...c, sections: c.sections.map((x) => (x.key === s.key ? s : x)) })} />
            </>
          ) : null}
        </section>

        {/* Preview */}
        <section className={cn("border-l border-line bg-surface-3/70 p-4 sm:p-6 lg:block", mobileView === "preview" ? "block" : "hidden")} aria-label="Live preview">
          <div className="sticky top-[132px]">
            <div className="mb-3 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-muted">Live preview · A4</span>
              <Badge tone={pages > 2 ? "warning" : pages === 2 ? "neutral" : "success"}>{pages} page{pages > 1 ? "s" : ""}</Badge>
            </div>
            <div className="scrollbar-thin max-h-[calc(100dvh-200px)] overflow-y-auto pb-6 pr-1">
              <ScaledPreview content={c} style={template?.style} highlightKey={active} onPages={setPages} />
            </div>
            {pages > 2 && <Callout tone="warning" className="mt-3">Longer than two pages. Unless you're writing an academic CV, consider trimming older or less relevant details.</Callout>}
          </div>
        </section>
      </div>

      <AIStudio open={studio.open} onOpenChange={(o) => setStudio((s) => ({ ...s, open: o }))} mode={studio.mode} ctx={studio.ctx} />
      <VersionsDrawer open={versionsOpen} onOpenChange={setVersionsOpen} resumeId={rid} beforeAction={() => save()} onRestored={(r) => { setContent(r.content); setRevision(r.revision); setSaveState("saved"); qc.setQueryData(["resume", rid], r); }} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} resumeId={rid} />
    </div>
  );
}

function SortableSection({ section, active, onSelect }: { section: Section; active: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.key });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "z-10 opacity-80")}>
      <div className={cn("group flex items-center rounded-lg text-sm", active ? "bg-surface text-fg shadow-xs ring-1 ring-line" : "text-muted hover:text-fg")}>
        <button {...attributes} {...listeners} className="cursor-grab px-1.5 py-2 text-faint active:cursor-grabbing" aria-label={`Reorder ${section.title}`}>
          <GripVertical className="size-4" />
        </button>
        <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2.5 text-left font-medium">
          <span className="truncate">{section.title}</span>
          {!section.visible && <EyeOff className="ml-auto size-3.5 shrink-0 text-faint" aria-label="Hidden" />}
        </button>
      </div>
    </li>
  );
}

function TitleEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => {
    setV(value);
  }, [value]);
  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className="max-w-[40vw] truncate rounded-md px-2 py-1 text-[15px] font-semibold hover:bg-surface-3" title="Rename">
        {value}
      </button>
    );
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSave(v.trim()); setEditing(false); }}>
      <Input autoFocus value={v} maxLength={120} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() && v !== value) onSave(v.trim()); setEditing(false); }} className="h-8 w-64" aria-label="Resume title" />
    </form>
  );
}

function SaveIndicator({ state, savedAt, onRetry }: { state: SaveState; savedAt: string | null; onRetry: () => void }) {
  const map = {
    saved: { icon: <Check className="size-3.5 text-success" />, text: savedAt ? `Saved ${relativeTime(savedAt)}` : "Saved" },
    dirty: { icon: <span className="size-2 rounded-full bg-warning" />, text: "Unsaved changes" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" },
    error: { icon: <CloudOff className="size-3.5 text-danger" />, text: "Not saved" },
    conflict: { icon: <AlertCircle className="size-3.5 text-warning" />, text: "Conflict" },
  }[state];
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite">
      {map.icon} {map.text}
      {state === "error" && <button onClick={onRetry} className="font-medium text-brand-fg underline">Retry</button>}
    </span>
  );
}

function VersionsDrawer({ open, onOpenChange, resumeId, beforeAction, onRestored }: { open: boolean; onOpenChange: (v: boolean) => void; resumeId: number; beforeAction: () => Promise<void>; onRestored: (r: Resume) => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [label, setLabel] = useState("");
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("draft");
  const [diffOpen, setDiffOpen] = useState(false);
  const versions = useQuery({ queryKey: ["versions", resumeId], queryFn: () => api.get<Version[]>(`/resumes/${resumeId}/versions/`), enabled: open });
  const create = useMutation({
    mutationFn: async () => { await beforeAction(); return api.post<Version>(`/resumes/${resumeId}/versions/`, { label }); },
    onSuccess: (v) => { toast.success(`Saved version ${v.number}`); setLabel(""); qc.invalidateQueries({ queryKey: ["versions", resumeId] }); },
  });
  const restore = useMutation({
    mutationFn: (vid: number) => api.post<Resume>(`/resumes/${resumeId}/versions/${vid}/restore/`),
    onSuccess: (r) => { onRestored(r); toast.success("Version restored. Your previous draft was saved as a version."); qc.invalidateQueries({ queryKey: ["versions", resumeId] }); onOpenChange(false); },
  });
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Version history" description="Versions are immutable snapshots. Exports, analyses and applications record the exact version used.">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Input aria-label="Version label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Sent to Acme" maxLength={120} />
        <Button type="submit" loading={create.isPending} icon={<Save className="size-4" />}>Save version</Button>
      </form>
      <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><GitCompare className="size-4" /> Compare</p>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Select aria-label="Older version" value={compareA} onChange={(e) => setCompareA(e.target.value)}>
            <option value="">Choose…</option>
            {versions.data?.map((v) => <option key={v.id} value={v.id}>v{v.number} {v.label && `· ${v.label}`}</option>)}
          </Select>
          <span className="text-xs text-muted">vs</span>
          <Select aria-label="Newer version" value={compareB} onChange={(e) => setCompareB(e.target.value)}>
            <option value="draft">Current draft</option>
            {versions.data?.map((v) => <option key={v.id} value={v.id}>v{v.number} {v.label && `· ${v.label}`}</option>)}
          </Select>
        </div>
        <Button className="mt-3" size="sm" variant="secondary" disabled={!compareA} onClick={async () => { await beforeAction(); setDiffOpen(true); }}>Show differences</Button>
      </div>
      <ul className="mt-5 space-y-2">
        {versions.isLoading && <li className="text-sm text-muted">Loading…</li>}
        {versions.data?.length === 0 && <li className="text-sm text-muted">No versions yet. Exports and analyses create them automatically.</li>}
        {versions.data?.map((v) => (
          <li key={v.id} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
            <span className="grid size-9 place-items-center rounded-lg bg-surface-3 font-display text-sm font-bold">v{v.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{v.label || v.reason_label}</span>
              <span className="block text-xs text-muted">{v.reason_label} · {formatDateTime(v.created_at)}</span>
            </span>
            <Tooltip content="Restore into the draft">
              <IconButton label={`Restore version ${v.number}`} onClick={async () => { if (await confirm({ title: `Restore version ${v.number}?`, description: "Your current draft will be saved as a version first, so nothing is lost.", confirmLabel: "Restore", tone: "primary" })) restore.mutate(v.id); }}>
                <RotateCcw className="size-4" />
              </IconButton>
            </Tooltip>
          </li>
        ))}
      </ul>
      {diffOpen && compareA && <DiffDialog resumeId={resumeId} a={compareA} b={compareB} onClose={() => setDiffOpen(false)} />}
    </Drawer>
  );
}

function DiffDialog({ resumeId, a, b, onClose }: { resumeId: number; a: string; b: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["compare", resumeId, a, b], queryFn: () => api.get<any>(`/resumes/${resumeId}/compare/?a=${a}&b=${b}`) });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Compare versions" description={q.data ? `${q.data.a_label} → ${q.data.b_label}` : undefined} size="lg">
      {q.isLoading ? <p className="text-sm text-muted">Comparing…</p> : q.error ? <ErrorState error={q.error} /> : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(q.data.summary as Record<string, number>).map(([k, n]) => <Badge key={k} tone={k === "added" ? "success" : k === "removed" ? "danger" : k === "changed" ? "warning" : "neutral"}>{n} {k}</Badge>)}
            {q.data.reordered && <Badge tone="violet">sections reordered</Badge>}
          </div>
          {q.data.sections.filter((s: any) => s.status !== "unchanged").map((s: any, i: number) => (
            <div key={i} className="overflow-hidden rounded-lg border border-line">
              <p className="flex items-center justify-between bg-surface-2 px-3 py-2 text-sm font-medium">{s.title}<Badge>{s.status}</Badge></p>
              <div className="font-mono text-xs">
                {s.lines.filter((l: any) => l.op !== " ").map((l: any, j: number) => (
                  <p key={j} className={cn("whitespace-pre-wrap px-3 py-1", l.op === "+" ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-rose-50 text-rose-900 line-through decoration-rose-400/60 dark:bg-rose-500/10 dark:text-rose-200")}>
                    {l.op} {l.text}
                  </p>
                ))}
              </div>
            </div>
          ))}
          {q.data.sections.every((s: any) => s.status === "unchanged") && !q.data.reordered && <p className="text-sm text-muted">No differences.</p>}
        </div>
      )}
    </Dialog>
  );
}

function ShareDialog({ open, onOpenChange, resumeId }: { open: boolean; onOpenChange: (v: boolean) => void; resumeId: number }) {
  const [form, setForm] = useState({ scope: "comment", expires_in_days: 7, recipient_email: "", include_contact: false });
  const [link, setLink] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<{ path: string }>("/share-grants/", { resume: resumeId, ...form }),
    onSuccess: (r) => setLink(window.location.origin + r.path),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setLink(null); }} title="Share for review" description="Create a time-limited link for a coach or reviewer. You can revoke it any time in Settings → Sharing.">
      {link ? (
        <div className="space-y-3">
          <Callout tone="success" title="Link created">This is the only time the full link is shown. Copy it now.</Callout>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Share link" onFocus={(e) => e.target.select()} />
            <Button icon={<Copy className="size-4" />} onClick={() => { navigator.clipboard?.writeText(link); toast.success("Link copied"); }}>Copy</Button>
          </div>
          <Link to="/app/settings?tab=sharing" className="text-sm font-medium text-brand-fg">Manage shared links</Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Access">{(id) => <Select id={id} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="comment">View and comment</option><option value="view">View only</option></Select>}</Field>
            <Field label="Expires after">{(id) => <Select id={id} value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: Number(e.target.value) })}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</Select>}</Field>
          </div>
          <Field label="Restrict to one account (optional)" hint="Only someone signed in with this email can open the link.">{(id) => <Input id={id} type="email" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} placeholder="coach@example.com" />}</Field>
          <Switch checked={form.include_contact} onCheckedChange={(v) => setForm({ ...form, include_contact: v })} label="Include email and phone" description="Off by default — reviewers rarely need them." />
          <div className="flex justify-end"><Button type="submit" loading={create.isPending} icon={<Share2 className="size-4" />}>Create link</Button></div>
        </form>
      )}
    </Dialog>
  );
}
