import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { cn, scoreTone } from "@/lib/utils";
import { Button } from "./Button";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "violet";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg-2 ring-line",
  brand: "bg-brand-soft text-brand-fg ring-brand-500/15",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-brand-500", className)} aria-label={label} role="status" />;
}

export function FullPageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <img src="/brand/infyro-mark.png" alt="" className="size-9 animate-pulse" />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center", className)}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 -z-10 rounded-2xl bg-brand-500/20 blur-xl" aria-hidden />
        <div className="grid size-12 place-items-center rounded-2xl border border-brand-500/20 bg-gradient-to-b from-brand-soft to-surface text-brand-fg">
          {icon}
        </div>
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = (error as any)?.friendly ?? (error as any)?.message ?? "Something went wrong.";
  return (
    <div role="alert" className={cn("flex flex-col items-center rounded-xl border border-rose-200 bg-rose-50/60 px-6 py-10 text-center dark:border-rose-500/20 dark:bg-rose-500/5", className)}>
      <XCircle className="mb-3 size-7 text-danger" aria-hidden />
      <p className="font-medium">We couldn't load this</p>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

const calloutTones = {
  info: { cls: "border-brand-500/20 bg-brand-soft/60 text-fg", icon: Info, ic: "text-brand-fg" },
  warning: { cls: "border-amber-500/25 bg-amber-50 text-amber-950 dark:bg-amber-500/8 dark:text-amber-100", icon: AlertTriangle, ic: "text-warning" },
  success: { cls: "border-emerald-500/25 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/8 dark:text-emerald-100", icon: CheckCircle2, ic: "text-success" },
  danger: { cls: "border-rose-500/25 bg-rose-50 text-rose-950 dark:bg-rose-500/8 dark:text-rose-100", icon: XCircle, ic: "text-danger" },
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof calloutTones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const t = calloutTones[tone];
  const Icon = t.icon;
  return (
    <div className={cn("flex gap-3 rounded-lg border px-3.5 py-3 text-sm", t.cls, className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.ic)} aria-hidden />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-[13px] opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, className, tone = "brand", label }: { value: number; className?: string; tone?: "brand" | "success"; label?: string }) {
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div
        className={cn("h-full rounded-full", tone === "brand" ? "bg-gradient-to-r from-brand-500 to-violet-accent" : "bg-success")}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
      />
    </div>
  );
}

const ringColor = { good: "#0e9f6e", ok: "#d48806", low: "#dc3545", neutral: "#8a94a6" };

export function ScoreRing({ score, size = 112, label, sublabel }: { score: number | null; size?: number; label?: string; sublabel?: string }) {
  const stroke = Math.max(6, size / 14);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {score != null && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - score / 100) }}
            transition={{ duration: 1, ease: [0.2, 0.7, 0.2, 1] }}
          />
        )}
      </svg>
      <div className="absolute text-center">
        <div className="font-display font-bold tabular-nums" style={{ fontSize: size / 3.6 }}>
          {score ?? "—"}
        </div>
        {label && <div className="text-[11px] font-medium text-muted">{label}</div>}
        {sublabel && <span className="sr-only">{sublabel}</span>}
      </div>
    </div>
  );
}
