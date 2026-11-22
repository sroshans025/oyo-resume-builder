import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Template } from "@/lib/types";
import { SAMPLE_RESUME } from "@/lib/sample";
import { ScaledPreview } from "@/components/resume/ResumePreview";
import { ErrorState, SkeletonCards } from "@/components/ui/Feedback";
import { LinkButton } from "@/components/ui/Button";
import { CheckCircle2 } from "lucide-react";

export function TemplateCard({ t, action }: { t: Template; action?: React.ReactNode }) {
  return (
    <div className="card group flex flex-col overflow-hidden">
      <div className="relative bg-surface-3 p-5">
        <span className="absolute right-3 top-3 z-10 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Sample content
        </span>
        <div className="mx-auto max-w-[280px] transition duration-300 group-hover:-translate-y-1">
          <ScaledPreview content={SAMPLE_RESUME} style={t.style} showBreaks={false} />
        </div>
      </div>
      <div className="flex flex-1 flex-col border-t border-line p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{t.name}</h3>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted">{t.category}</span>
        </div>
        <p className="mt-1.5 text-sm text-muted">{t.description}</p>
        <p className="mt-3 text-xs font-medium text-fg-2">Best for: {t.best_for}</p>
        <div className="mt-3 space-y-1.5 text-xs text-muted">
          <p className="flex gap-1.5">
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" aria-hidden /> {t.ats_notes}
          </p>
          <p className="flex gap-1.5">
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" aria-hidden /> {t.readability_notes}
          </p>
        </div>
        {action && <div className="mt-5 flex gap-2 pt-1">{action}</div>}
      </div>
    </div>
  );
}

export default function PublicTemplates() {
  const q = useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/templates/") });
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="max-w-2xl">
        <p className="eyebrow">Templates</p>
        <h1 className="mt-3 text-4xl font-bold">Readable, ATS-conscious templates</h1>
        <p className="mt-4 text-muted">
          Every template is single-column with standard headings and real, selectable text — so it reads in the same order for people and
          parsers. Switch any time without losing content.
        </p>
      </div>
      <div className="mt-12">
        {q.isLoading ? (
          <SkeletonCards count={3} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {q.data!.map((t) => (
              <TemplateCard key={t.slug} t={t} action={<LinkButton to="/register" size="sm" className="w-full">Use {t.name}</LinkButton>} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
