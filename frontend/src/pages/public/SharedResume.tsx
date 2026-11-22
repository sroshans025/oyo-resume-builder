import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Eye, Lock, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import type { ResumeContent, TemplateStyle } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import { ScaledPreview } from "@/components/resume/ResumePreview";
import { Badge, ErrorState, FullPageLoader } from "@/components/ui/Feedback";
import { Button, LinkButton } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Form";

interface Shared {
  title: string; owner_name: string; style: TemplateStyle; content: ResumeContent; scope: "view" | "comment";
  expires_at: string; can_comment: boolean;
  comments: { id: number; author_name: string; section: string; text: string; created_at: string; resolved: boolean }[];
}

export default function SharedResume() {
  const { token = "" } = useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shared", token], queryFn: () => api.get<Shared>(`/shared/${token}/`), retry: false });
  const [text, setText] = useState("");
  const [section, setSection] = useState("");
  const comment = useMutation({
    mutationFn: () => api.post(`/shared/${token}/comments/`, { text, section }),
    onSuccess: () => {
      setText("");
      toast.success("Comment shared with the owner");
      qc.invalidateQueries({ queryKey: ["shared", token] });
    },
  });

  if (q.isLoading) return <FullPageLoader />;
  if (q.error) {
    const e = q.error as any;
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        {e.code === "login_required" ? (
          <div className="card p-8 text-center">
            <Lock className="mx-auto size-8 text-brand-500" aria-hidden />
            <h1 className="mt-4 text-xl font-bold">Sign in to view this resume</h1>
            <p className="mt-2 text-sm text-muted">{e.message}</p>
            <LinkButton to={`/login?next=/shared/${token}`} className="mt-6">Sign in</LinkButton>
          </div>
        ) : (
          <ErrorState error={q.error} />
        )}
      </div>
    );
  }
  const d = q.data!;
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{d.title}</h1>
          <Badge tone="brand"><Eye className="size-3" /> Shared by {d.owner_name}</Badge>
          <Badge><Clock className="size-3" /> Expires {formatDate(d.expires_at)}</Badge>
        </div>
        <ScaledPreview content={d.content} style={d.style} />
      </div>
      <aside className="space-y-4">
        <div className="card p-5 text-sm text-muted">
          This is a read-only, time-limited copy shared for review. The owner can revoke access at any time. Contact details may be hidden.
        </div>
        {d.scope === "comment" && (
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <MessageSquarePlus className="size-4 text-brand-500" /> Review comments
            </h2>
            <ul className="mt-4 space-y-3">
              {d.comments.length === 0 && <li className="text-sm text-muted">No comments yet.</li>}
              {d.comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-surface-2 p-3 text-sm">
                  <p className="font-medium">
                    {c.author_name} {c.section && <span className="font-normal text-muted">· {c.section}</span>}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-fg-2">{c.text}</p>
                  <p className="mt-1 text-xs text-faint">{relativeTime(c.created_at)}</p>
                </li>
              ))}
            </ul>
            {d.can_comment ? (
              <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) comment.mutate(); }}>
                <Field label="Section (optional)">{(id) => <Input id={id} value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Experience" />}</Field>
                <Field label="Comment">{(id) => <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} required maxLength={3000} />}</Field>
                <Button type="submit" loading={comment.isPending} className="w-full">Add comment</Button>
              </form>
            ) : (
              !me && <LinkButton to={`/login?next=/shared/${token}`} variant="secondary" className="mt-4 w-full">Sign in to comment</LinkButton>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
