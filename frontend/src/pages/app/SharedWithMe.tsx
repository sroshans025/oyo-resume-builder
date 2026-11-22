import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookUser, Clock, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ResumeContent, TemplateStyle } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { Drawer } from "@/components/ui/Overlay";
import { ScaledPreview } from "@/components/resume/ResumePreview";

interface SharedItem { id: number; resume_title: string; owner_name: string; scope: string; expires_at: string }
interface SharedDetail { title: string; owner_name: string; style: TemplateStyle; content: ResumeContent; scope: string; expires_at: string; comments: { id: number; author_name: string; section: string; text: string; created_at: string }[] }

export default function SharedWithMe() {
  const q = useQuery({ queryKey: ["shared-with-me"], queryFn: () => api.get<SharedItem[]>("/coach/shared-with-me/") });
  const [open, setOpen] = useState<SharedItem | null>(null);
  return (
    <div>
      <PageHeader title="Shared with me" description="Resumes other people have shared with your account for review. Access is time-limited and can be revoked by the owner at any time." />
      {q.isLoading ? <Skeleton className="h-32 rounded-xl" /> : q.error ? <ErrorState error={q.error} /> : !q.data!.length ? (
        <EmptyState icon={<BookUser className="size-6" />} title="Nothing shared with you" description="When someone shares a resume restricted to your email address, it appears here. Links shared with anyone can be opened directly." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.map((g) => (
            <li key={g.id} className="card p-5">
              <p className="font-semibold">{g.resume_title}</p>
              <p className="text-sm text-muted">from {g.owner_name}</p>
              <div className="mt-3 flex gap-1.5"><Badge>{g.scope === "comment" ? "Can comment" : "View only"}</Badge><Badge><Clock className="size-3" /> until {formatDate(g.expires_at)}</Badge></div>
              <Button size="sm" className="mt-4 w-full" onClick={() => setOpen(g)}>Open for review</Button>
            </li>
          ))}
        </ul>
      )}
      {open && <ReviewDrawer item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ReviewDrawer({ item, onClose }: { item: SharedItem; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shared-detail", item.id], queryFn: () => api.get<SharedDetail>(`/coach/shared/${item.id}/`) });
  const [text, setText] = useState("");
  const [section, setSection] = useState("");
  const add = useMutation({
    mutationFn: () => api.post(`/coach/shared/${item.id}/comments/`, { text, section }),
    onSuccess: () => { setText(""); toast.success("Comment sent to the owner"); qc.invalidateQueries({ queryKey: ["shared-detail", item.id] }); },
  });
  return (
    <Drawer open onOpenChange={(v) => !v && onClose()} title={item.resume_title} description={`Shared by ${item.owner_name}`} width="max-w-4xl">
      {q.isLoading ? <Skeleton className="h-96" /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="rounded-xl bg-surface-3 p-4"><ScaledPreview content={q.data!.content} style={q.data!.style} /></div>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><MessageSquarePlus className="size-4 text-brand-500" /> Comments</p>
            <ul className="mt-3 space-y-2">
              {q.data!.comments.length === 0 && <li className="text-sm text-muted">No comments yet.</li>}
              {q.data!.comments.map((c) => <li key={c.id} className="rounded-lg bg-surface-2 p-3 text-sm"><p className="font-medium">{c.author_name}{c.section && <span className="font-normal text-muted"> · {c.section}</span>}</p><p className="mt-1 whitespace-pre-line text-fg-2">{c.text}</p><p className="mt-1 text-xs text-faint">{relativeTime(c.created_at)}</p></li>)}
            </ul>
            {q.data!.scope === "comment" && (
              <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
                <Field label="Section">{(id) => <Input id={id} value={section} onChange={(e) => setSection(e.target.value)} placeholder="optional" />}</Field>
                <Field label="Feedback">{(id) => <Textarea id={id} rows={4} value={text} onChange={(e) => setText(e.target.value)} required />}</Field>
                <Button type="submit" className="w-full" loading={add.isPending} disabled={!text.trim()}>Send feedback</Button>
              </form>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
