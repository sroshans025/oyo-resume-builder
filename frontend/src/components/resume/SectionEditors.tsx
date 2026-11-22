import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, GripVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Item, Personal, Section, SectionType, SkillGroup } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { Checkbox, Field, Input, Switch, TagInput, Textarea } from "@/components/ui/Form";
import { Tooltip } from "@/components/ui/Overlay";
import type { StudioMode } from "./AIStudio";

export const SECTION_LABELS: Record<SectionType, string> = {
  summary: "Professional Summary", skills: "Skills", experience: "Experience", education: "Education", projects: "Projects",
  certifications: "Certifications", awards: "Awards", volunteering: "Volunteering", publications: "Publications",
  languages: "Languages", custom: "Additional Information",
};

type FieldDef = { key: string; label: string; placeholder?: string; wide?: boolean; long?: boolean; hint?: string };

const ITEM_FIELDS: Record<string, FieldDef[]> = {
  experience: [
    { key: "role", label: "Job title", placeholder: "Software Engineer Intern" },
    { key: "organization", label: "Organisation", placeholder: "Company name" },
    { key: "location", label: "Location", placeholder: "City or Remote" },
  ],
  volunteering: [
    { key: "role", label: "Role" },
    { key: "organization", label: "Organisation" },
  ],
  education: [
    { key: "degree", label: "Degree / qualification", placeholder: "BSc" },
    { key: "field", label: "Field of study", placeholder: "Computer Science" },
    { key: "institution", label: "Institution", wide: true },
    { key: "grade", label: "Grade (optional)", placeholder: "First class / 8.4 CGPA" },
    { key: "location", label: "Location" },
    { key: "details", label: "Details (optional)", wide: true, long: true, placeholder: "Relevant coursework, thesis, honours" },
  ],
  projects: [
    { key: "name", label: "Project name" },
    { key: "role", label: "Your role", placeholder: "Solo / Team lead / Backend" },
    { key: "link", label: "Link (optional)", placeholder: "https://", wide: true },
  ],
  certifications: [
    { key: "name", label: "Certification" },
    { key: "issuer", label: "Issuer" },
    { key: "date", label: "Date", placeholder: "Mar 2025" },
    { key: "credential_id", label: "Credential ID (optional)" },
    { key: "link", label: "Link (optional)", placeholder: "https://", wide: true },
  ],
  awards: [
    { key: "title", label: "Award" },
    { key: "organization", label: "Awarded by" },
    { key: "date", label: "Date" },
    { key: "description", label: "Description", wide: true, long: true },
  ],
  publications: [
    { key: "title", label: "Title", wide: true },
    { key: "publisher", label: "Publisher / venue" },
    { key: "date", label: "Date" },
    { key: "link", label: "Link", placeholder: "https://", wide: true },
    { key: "description", label: "Description", wide: true, long: true },
  ],
  languages: [
    { key: "language", label: "Language" },
    { key: "proficiency", label: "Proficiency", placeholder: "Native / Fluent / Conversational" },
  ],
};
const DATED = new Set(["experience", "education", "projects", "volunteering"]);
const BULLETS = new Set(["experience", "projects", "volunteering"]);

export function emptyItem(type: SectionType): Item {
  const item: Item = { id: uid() };
  for (const f of ITEM_FIELDS[type] ?? []) item[f.key] = "";
  if (DATED.has(type)) Object.assign(item, { start: "", end: "", current: false });
  if (BULLETS.has(type)) item.bullets = [""];
  if (type === "projects") item.tools = [];
  return item;
}

export function emptySection(type: SectionType): Section {
  const data = type === "summary" || type === "custom" ? { text: "" } : type === "skills" ? { groups: [{ id: uid(), name: "", skills: [] }] } : { items: [] };
  return { key: uid(), type, title: SECTION_LABELS[type], visible: true, data };
}

export type OpenAI = (mode: StudioMode, ctx: { text?: string; role?: string; organization?: string; tools?: string; project?: { name: string; tools: string }; onApply?: (t: string) => void; applyLabel?: string }) => void;

/* ---- Personal details ----------------------------------------------------------- */
export function PersonalEditor({ value, onChange, errors }: { value: Personal; onChange: (p: Personal) => void; errors?: (k: string) => string | undefined }) {
  const set = (k: keyof Personal, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors?.("personal.full_name")}>{(id) => <Input id={id} value={value.full_name} onChange={(e) => set("full_name", e.target.value)} autoComplete="name" />}</Field>
        <Field label="Headline" hint="Your target role or professional identity.">{(id) => <Input id={id} value={value.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Junior Data Analyst" />}</Field>
        <Field label="Email" error={errors?.("personal.email")}>{(id) => <Input id={id} type="email" value={value.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />}</Field>
        <Field label="Phone">{(id) => <Input id={id} value={value.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />}</Field>
        <Field label="Location" hint="City and country is usually enough.">{(id) => <Input id={id} value={value.location} onChange={(e) => set("location", e.target.value)} />}</Field>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium text-fg-2">Links</p>
        <div className="space-y-2">
          {value.links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label="Link label" className="w-32" value={l.label} onChange={(e) => set("links", value.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input aria-label="Link URL" value={l.url} placeholder="https://" onChange={(e) => set("links", value.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <IconButton label="Remove link" onClick={() => set("links", value.links.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
            </div>
          ))}
          {errors?.("personal.links") && <p className="text-xs font-medium text-danger">{errors("personal.links")}</p>}
          {value.links.length < 6 && (
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => set("links", [...value.links, { label: value.links.length ? "Portfolio" : "LinkedIn", url: "" }])}>Add link</Button>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-sm font-semibold">Privacy on this resume</p>
        <p className="mt-0.5 text-xs text-muted">Hidden details stay saved but are left out of the preview, exports and share links.</p>
        <div className="mt-3 space-y-1">
          <Switch checked={value.show_email} onCheckedChange={(v) => set("show_email", v)} label="Show email" />
          <Switch checked={value.show_phone} onCheckedChange={(v) => set("show_phone", v)} label="Show phone number" />
          <Switch checked={value.show_location} onCheckedChange={(v) => set("show_location", v)} label="Show location" />
        </div>
      </div>
    </div>
  );
}

/* ---- Section dispatcher ------------------------------------------------------------- */
export function SectionEditor({ section, onChange, openAI }: { section: Section; onChange: (s: Section) => void; openAI: OpenAI }) {
  const setData = (data: Section["data"]) => onChange({ ...section, data });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Section heading" className="min-w-[200px] flex-1" hint="Standard headings are easiest for readers and parsers to recognise.">
          {(id) => <Input id={id} value={section.title} maxLength={60} onChange={(e) => onChange({ ...section, title: e.target.value })} />}
        </Field>
        <Button variant="secondary" size="md" icon={section.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />} onClick={() => onChange({ ...section, visible: !section.visible })}>
          {section.visible ? "Visible" : "Hidden"}
        </Button>
      </div>
      {(section.type === "summary" || section.type === "custom") && (
        <TextEditor section={section} onChange={setData} openAI={openAI} />
      )}
      {section.type === "skills" && <SkillsEditor groups={section.data.groups ?? []} onChange={(groups) => setData({ groups })} />}
      {section.data.items && <ItemsEditor type={section.type} items={section.data.items} onChange={(items) => setData({ items })} openAI={openAI} />}
    </div>
  );
}

function TextEditor({ section, onChange, openAI }: { section: Section; onChange: (d: Section["data"]) => void; openAI: OpenAI }) {
  const text = section.data.text ?? "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <Field
      label={section.type === "summary" ? "Summary" : "Content"}
      hint={section.type === "summary" ? `${words} words · aim for 40–80` : undefined}
      trailing={
        section.type === "summary" && (
          <Button size="xs" variant="subtle" icon={<Sparkles className="size-3.5" />} onClick={() => openAI("summary", { onApply: (t) => onChange({ text: t }), applyLabel: "Replace summary" })}>
            Draft with AI
          </Button>
        )
      }
    >
      {(id, d) => <Textarea id={id} aria-describedby={d} rows={6} value={text} maxLength={3000} onChange={(e) => onChange({ text: e.target.value })} placeholder={section.type === "summary" ? "Two or three sentences: your focus, strongest evidence, and what you bring." : ""} />}
    </Field>
  );
}

function SkillsEditor({ groups, onChange }: { groups: SkillGroup[]; onChange: (g: SkillGroup[]) => void }) {
  return (
    <div className="space-y-4">
      {groups.map((g, i) => (
        <div key={g.id} className="rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex gap-2">
            <Input aria-label="Group name" value={g.name} placeholder="Group name (optional), e.g. Languages" onChange={(e) => onChange(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} />
            <IconButton label="Remove group" onClick={() => onChange(groups.filter((x) => x.id !== g.id))} disabled={groups.length === 1 && !g.skills.length}><Trash2 className="size-4" /></IconButton>
          </div>
          <div className="mt-3">
            <TagInput value={g.skills} max={60} onChange={(skills) => onChange(groups.map((x) => (x.id === g.id ? { ...x, skills } : x)))} placeholder="Type a skill and press Enter" id={`skills-${i}`} />
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={() => onChange([...groups, { id: uid(), name: "", skills: [] }])}>Add skill group</Button>
      <p className="text-xs text-muted">List skills you can demonstrate. Job matching treats skills that only appear here as “partially demonstrated” until a bullet shows them in use.</p>
    </div>
  );
}

function ItemsEditor({ type, items, onChange, openAI }: { type: SectionType; items: Item[]; onChange: (i: Item[]) => void; openAI: OpenAI }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  const update = (id: string, patch: Partial<Item>) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(idx, 1);
    next.splice(idx + dir, 0, x);
    onChange(next);
  };
  const add = () => {
    const it = emptyItem(type);
    onChange([...items, it]);
    setOpen(it.id);
  };
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No entries yet.</p>}
      {items.map((it, idx) => {
        const title = it.role || it.name || it.degree || it.institution || it.title || it.language || "Untitled entry";
        const sub = it.organization || it.institution || it.issuer || it.publisher || "";
        const isOpen = open === it.id;
        return (
          <div key={it.id} className={cn("rounded-xl border bg-surface transition", isOpen ? "border-brand-300 shadow-xs" : "border-line")}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <GripVertical className="size-4 text-faint" aria-hidden />
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : it.id)} aria-expanded={isOpen}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{title}</span>
                  {sub && sub !== title && <span className="block truncate text-xs text-muted">{sub}</span>}
                </span>
                <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted transition", isOpen && "rotate-180")} />
              </button>
              <IconButton size="sm" label="Move up" disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUp className="size-3.5" /></IconButton>
              <IconButton size="sm" label="Move down" disabled={idx === items.length - 1} onClick={() => move(idx, 1)}><ArrowDown className="size-3.5" /></IconButton>
              <IconButton size="sm" label="Remove entry" onClick={() => onChange(items.filter((x) => x.id !== it.id))}><Trash2 className="size-3.5" /></IconButton>
            </div>
            {isOpen && (
              <div className="space-y-4 border-t border-line px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(ITEM_FIELDS[type] ?? [{ key: "title", label: "Title" }, { key: "organization", label: "Organisation" }, { key: "date", label: "Date" }, { key: "description", label: "Description", wide: true, long: true }]).map((f) => (
                    <Field key={f.key} label={f.label} className={f.wide ? "sm:col-span-2" : ""}>
                      {(id) => f.long
                        ? <Textarea id={id} rows={2} value={it[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => update(it.id, { [f.key]: e.target.value })} />
                        : <Input id={id} value={it[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => update(it.id, { [f.key]: e.target.value })} />}
                    </Field>
                  ))}
                  {DATED.has(type) && (
                    <>
                      <Field label="Start" hint="e.g. Jan 2024">{(id) => <Input id={id} value={it.start ?? ""} maxLength={20} onChange={(e) => update(it.id, { start: e.target.value })} />}</Field>
                      <Field label="End">{(id) => <Input id={id} value={it.current ? "" : it.end ?? ""} maxLength={20} disabled={it.current} placeholder={it.current ? "Present" : "e.g. Jun 2025"} onChange={(e) => update(it.id, { end: e.target.value })} />}</Field>
                      {type !== "education" && (
                        <Checkbox className="sm:col-span-2" checked={!!it.current} onChange={(e) => update(it.id, { current: e.target.checked })} label={type === "projects" ? "Ongoing project" : "I currently do this"} />
                      )}
                    </>
                  )}
                  {type === "projects" && (
                    <Field label="Tools & technologies" className="sm:col-span-2">{(id) => <TagInput id={id} value={it.tools ?? []} onChange={(tools) => update(it.id, { tools })} placeholder="React, PostgreSQL…" />}</Field>
                  )}
                </div>
                {BULLETS.has(type) && (
                  <BulletsEditor
                    bullets={it.bullets ?? []}
                    onChange={(bullets) => update(it.id, { bullets })}
                    onAI={(i, text) =>
                      openAI("bullet", {
                        text, role: it.role ?? it.name, organization: it.organization, tools: (it.tools ?? []).join(", "),
                        onApply: (t) => update(it.id, { bullets: (it.bullets ?? []).map((b: string, j: number) => (j === i ? t : b)) }), applyLabel: "Replace bullet",
                      })
                    }
                    onProject={type === "projects" ? () => openAI("project", { project: { name: it.name ?? "", tools: (it.tools ?? []).join(", ") }, onApply: (t) => update(it.id, { bullets: [...(it.bullets ?? []).filter((b: string) => b.trim()), t] }), applyLabel: "Add as bullet" }) : undefined}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      <Button variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={add}>Add {SECTION_LABELS[type].replace(/s$/, "").toLowerCase()}</Button>
    </div>
  );
}

function BulletsEditor({ bullets, onChange, onAI, onProject }: { bullets: string[]; onChange: (b: string[]) => void; onAI: (i: number, text: string) => void; onProject?: () => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium text-fg-2">Bullet points</p>
        {onProject && <Button size="xs" variant="subtle" icon={<Sparkles className="size-3.5" />} onClick={onProject}>Describe project</Button>}
      </div>
      <ul className="space-y-2">
        {bullets.map((b, i) => {
          const words = b.trim() ? b.trim().split(/\s+/).length : 0;
          return (
            <li key={i} className="flex gap-2">
              <span className="mt-3 text-faint" aria-hidden>•</span>
              <div className="flex-1">
                <Textarea aria-label={`Bullet ${i + 1}`} rows={2} value={b} maxLength={600} className="min-h-[60px]" placeholder="Action + task + result, e.g. Built … for …, reducing …"
                  onChange={(e) => onChange(bullets.map((x, j) => (j === i ? e.target.value : x)))} />
                {words > 35 && <p className="mt-1 text-xs text-warning">{words} words — consider splitting or tightening.</p>}
              </div>
              <div className="flex flex-col gap-1 pt-1">
                <Tooltip content="Improve with Writing Studio">
                  <IconButton size="sm" label="Improve bullet" disabled={!b.trim()} onClick={() => onAI(i, b)}><Sparkles className="size-3.5 text-brand-500" /></IconButton>
                </Tooltip>
                <IconButton size="sm" label="Remove bullet" onClick={() => onChange(bullets.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      {bullets.length < 12 && <Button className="mt-2" variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={() => onChange([...bullets, ""])}>Add bullet</Button>}
    </div>
  );
}
