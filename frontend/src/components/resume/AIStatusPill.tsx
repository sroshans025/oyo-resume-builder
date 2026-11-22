import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Cpu, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { AIStatus } from "@/lib/types";
import { Tooltip } from "@/components/ui/Overlay";
import { cn } from "@/lib/utils";

export function useAIStatus() {
  return useQuery({ queryKey: ["ai-status"], queryFn: () => api.get<AIStatus>("/ai/status/"), staleTime: 60_000 });
}

export function AIStatusPill() {
  const { data } = useAIStatus();
  if (!data) return null;
  const live = data.mode === "ai" && data.consent;
  const text = data.mode === "offline" ? "Offline assistant" : data.consent ? "Live AI" : "AI · consent off";
  const tip =
    data.mode === "offline"
      ? "No AI provider is configured. Writing help uses transparent rule-based suggestions built only from your input."
      : data.consent
        ? `Live AI is on (${data.label}). Only the text needed for each request is sent. ${data.usage.used}/${data.usage.limit} requests today.`
        : "A live AI provider is available, but you haven't consented to sending content. You'll get offline suggestions until you enable it in Settings.";
  return (
    <Tooltip content={tip} side="bottom">
      <Link
        to="/app/settings?tab=privacy"
        className={cn(
          "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition sm:inline-flex",
          live ? "border-brand-500/25 bg-brand-soft text-brand-fg" : "border-line bg-surface text-muted hover:text-fg",
        )}
      >
        {live ? <Sparkles className="size-3.5" /> : <Cpu className="size-3.5" />}
        {text}
      </Link>
    </Tooltip>
  );
}
