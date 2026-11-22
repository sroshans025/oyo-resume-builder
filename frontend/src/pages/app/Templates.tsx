import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type Paginated } from "@/lib/api";
import type { ResumeSummary, Template } from "@/lib/types";
import { PageHeader } from "@/components/ui/Layout";
import { ErrorState, SkeletonCards } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Overlay";
import { Select, Field } from "@/components/ui/Form";
import { TemplateCard } from "@/pages/public/PublicTemplates";

export default function Templates() {
  const q = useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/templates/") });
  const resumes = useQuery({ queryKey: ["resumes", "active", ""], queryFn: () => api.get<Paginated<ResumeSummary>>("/resumes/?page_size=100") });
  const [chosen, setChosen] = useState<Template | null>(null);
  const [target, setTarget] = useState<string>("new");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const apply = useMutation({
    mutationFn: async () => {
      if (target === "new") return api.post<{ id: number }>("/resumes/", { title: `${chosen!.name} resume`, template: chosen!.slug });
      await api.patch(`/resumes/${target}/`, { template: chosen!.slug });
      return { id: Number(target) };
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["resumes"] }); toast.success("Template applied — your content is unchanged"); navigate(`/app/resumes/${r.id}`); },
  });
  return (
    <div>
      <PageHeader title="Template gallery" description="All templates are single-column, use standard headings and export real selectable text. Switching never changes your content." />
      {q.isLoading ? <SkeletonCards count={3} /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.map((t) => (
            <TemplateCard key={t.slug} t={t} action={<Button size="sm" className="w-full" onClick={() => { setChosen(t); setTarget(resumes.data?.results[0] ? String(resumes.data.results[0].id) : "new"); }}>Use {t.name}</Button>} />
          ))}
        </div>
      )}
      <Dialog open={!!chosen} onOpenChange={(v) => !v && setChosen(null)} title={`Use ${chosen?.name ?? ""}`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setChosen(null)}>Cancel</Button><Button loading={apply.isPending} onClick={() => apply.mutate()}>Apply</Button></>}>
        <Field label="Apply to">
          {(id) => (
            <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">A new blank resume</option>
              {resumes.data?.results.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
          )}
        </Field>
      </Dialog>
    </div>
  );
}
