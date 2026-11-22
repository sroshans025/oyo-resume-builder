import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Item, ResumeContent, Section, TemplateStyle } from "@/lib/types";
import { cn } from "@/lib/utils";

/* A4 at 96 dpi. Margins mirror the PDF renderer (17mm comfortable, 14mm compact). */
export const PAGE_W = 794;
export const PAGE_H = 1123;
const MM = 3.7795;

export const DEFAULT_STYLE: TemplateStyle = {
  font: "sans", accent: "#1f2937", heading: "caps-rule", density: "comfortable", align: "left", name_size: 22,
};

function dateRange(item: Item) {
  const end = item.current ? "Present" : item.end;
  if (item.start && end) return `${item.start} – ${end}`;
  return item.start || end || "";
}

function itemHeading(type: string, it: Item): [string, string, string] {
  switch (type) {
    case "experience":
    case "volunteering":
      return [it.role, [it.organization, it.location].filter(Boolean).join(" · "), dateRange(it)];
    case "education": {
      const degree = [it.degree, it.field].filter(Boolean).join(", ");
      return [degree || it.institution, [degree ? it.institution : "", it.location, it.grade].filter(Boolean).join(" · "), dateRange(it)];
    }
    case "projects":
      return [it.name, [it.role, (it.tools || []).join(", ")].filter(Boolean).join(" · "), dateRange(it)];
    case "certifications":
      return [it.name, [it.issuer, it.credential_id].filter(Boolean).join(" · "), it.date];
    case "languages":
      return [it.language, it.proficiency, ""];
    case "publications":
      return [it.title, it.publisher, it.date];
    default:
      return [it.title, it.organization || it.subtitle, it.date];
  }
}

export function sectionHasContent(s: Section) {
  if (s.type === "summary" || s.type === "custom") return !!s.data.text?.trim();
  if (s.type === "skills") return !!s.data.groups?.some((g) => g.skills.length);
  return !!s.data.items?.length;
}

export function ResumeDocument({
  content,
  style = DEFAULT_STYLE,
  highlightKey,
  className,
}: {
  content: ResumeContent;
  style?: TemplateStyle;
  highlightKey?: string | null;
  className?: string;
}) {
  const compact = style.density === "compact";
  const base = compact ? 12.6 : 13.4;
  const pad = (compact ? 14 : 17) * MM;
  const center = style.align === "center";
  const headingCaps = style.heading !== "bold";
  const p = content.personal;
  const contact = [
    p.show_email !== false && p.email,
    p.show_phone !== false && p.phone,
    p.show_location !== false && p.location,
    ...p.links.map((l) => l.url.replace(/^https?:\/\//, "")),
  ].filter(Boolean) as string[];
  const fontFamily = style.font === "serif" ? "var(--font-serif)" : "var(--font-sans)";
  const vars = { "--accent": style.accent, fontFamily, fontSize: base, lineHeight: compact ? 1.32 : 1.42, padding: pad } as CSSProperties;

  return (
    <article className={cn("bg-white text-[#1e293b]", className)} style={vars} aria-label="Resume preview">
      <header className={cn(center && "text-center")}>
        <h1 className="font-bold leading-tight text-[#0b1220]" style={{ fontSize: style.name_size * 1.33, fontFamily }}>
          {p.full_name || <span className="text-slate-300">Your name</span>}
        </h1>
        {p.headline && (
          <p className="mt-0.5" style={{ color: "var(--accent)", fontSize: base * 1.12 }}>
            {p.headline}
          </p>
        )}
        {contact.length > 0 && (
          <p className="mt-1.5 text-[#475569]" style={{ fontSize: base * 0.93 }}>
            {contact.join("  ·  ")}
          </p>
        )}
      </header>
      {content.sections.filter((s) => s.visible && sectionHasContent(s)).map((s) => (
        <section
          key={s.key}
          className={cn("relative transition-colors", highlightKey === s.key && "rounded-sm bg-[#1f7fef0d] ring-1 ring-[#1f7fef40] ring-offset-4 ring-offset-white")}
          style={{ marginTop: compact ? 11 : 15 }}
        >
          <h2
            className="font-bold"
            style={{
              color: style.heading === "bold" ? "#0b1220" : "var(--accent)",
              fontSize: base * 1.08,
              letterSpacing: headingCaps ? "0.06em" : undefined,
              textTransform: headingCaps ? "uppercase" : undefined,
              fontFamily,
            }}
          >
            {s.title}
          </h2>
          {style.heading !== "bold" && (
            <div style={{ height: style.heading === "accent-bar" ? 2 : 1, background: "var(--accent)", margin: "2px 0 6px", opacity: style.heading === "accent-bar" ? 1 : 0.7 }} />
          )}
          <SectionBody section={s} base={base} compact={compact} />
        </section>
      ))}
    </article>
  );
}

function SectionBody({ section: s, base, compact }: { section: Section; base: number; compact: boolean }) {
  if (s.type === "summary" || s.type === "custom") return <p className="whitespace-pre-line">{s.data.text}</p>;
  if (s.type === "skills")
    return (
      <div className="space-y-0.5">
        {s.data.groups?.filter((g) => g.skills.length).map((g) => (
          <p key={g.id}>
            {g.name && <strong className="text-[#0b1220]">{g.name}: </strong>}
            {g.skills.join(", ")}
          </p>
        ))}
      </div>
    );
  return (
    <div>
      {s.data.items?.map((it) => {
        const [primary, secondary, date] = itemHeading(s.type, it);
        const bullets = (it.bullets || []).filter((b: string) => b.trim());
        return (
          <div key={it.id} style={{ marginTop: compact ? 4 : 6 }}>
            <p>
              <strong className="text-[#0b1220]">{primary}</strong>
              {date && <span className="text-[#475569]">{primary ? "  ·  " : ""}{date}</span>}
            </p>
            {secondary && <p className="italic text-[#475569]">{secondary}</p>}
            {it.details && <p>{it.details}</p>}
            {it.description && <p>{it.description}</p>}
            {bullets.length > 0 && (
              <ul className="mt-0.5 space-y-0.5" style={{ paddingLeft: 14 }}>
                {bullets.map((b: string, i: number) => (
                  <li key={i} className="relative" style={{ listStyle: "none" }}>
                    <span className="absolute" style={{ left: -11, fontSize: base * 0.9 }} aria-hidden>
                      •
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            )}
            {it.link && <p className="italic text-[#475569]">{it.link}</p>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Scales the A4 document to fit its container and overlays page-break guides,
 * so users can see when content spills onto a new page.
 */
export function ScaledPreview({
  content,
  style,
  highlightKey,
  onPages,
  showBreaks = true,
  maxScale = 1,
  className,
}: {
  content: ResumeContent;
  style?: TemplateStyle;
  highlightKey?: string | null;
  onPages?: (n: number) => void;
  showBreaks?: boolean;
  maxScale?: number;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(PAGE_H);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(maxScale, el.clientWidth / PAGE_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale]);

  useEffect(() => {
    const el = doc.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(Math.max(PAGE_H, el.scrollHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pages = Math.max(1, Math.ceil((height - 2) / PAGE_H));
  useEffect(() => {
    onPages?.(pages);
  }, [pages, onPages]);

  return (
    <div ref={wrap} className={cn("w-full", className)}>
      <div style={{ height: pages * PAGE_H * scale }} className="relative">
        <div
          className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-[3px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.08),0_18px_50px_-18px_rgb(15_23_42/0.35)] ring-1 ring-black/5"
          style={{ width: PAGE_W, minHeight: pages * PAGE_H, transform: `scale(${scale})` }}
        >
          <div ref={doc}>
            <ResumeDocument content={content} style={style} highlightKey={highlightKey} />
          </div>
          {showBreaks &&
            Array.from({ length: pages - 1 }).map((_, i) => (
              <div key={i} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: (i + 1) * PAGE_H }} aria-hidden>
                <div className="h-0 flex-1 border-t-2 border-dashed border-rose-400/70" />
                <span className="mx-2 rounded bg-rose-500 px-2 py-0.5 text-[13px] font-semibold text-white">Page {i + 2}</span>
                <div className="h-0 flex-1 border-t-2 border-dashed border-rose-400/70" />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
