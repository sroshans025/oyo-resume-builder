import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Tooltip } from "./Overlay";

/**
 * Single-series horizontal bar list (magnitude per category).
 * One hue, thin rounded bars anchored at the baseline, values in text ink,
 * per-bar tooltip, and a semantic list so it reads as a table for assistive tech.
 */
export function BarList({
  rows,
  className,
  unit = "",
  emptyLabel = "Nothing recorded yet",
}: {
  rows: { label: string; value: number; to?: string; hint?: string }[];
  className?: string;
  unit?: string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value > 0)) return <p className="py-4 text-sm text-muted">{emptyLabel}</p>;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((r) => {
        const body = (
          <div className="grid grid-cols-[minmax(84px,120px)_1fr_auto] items-center gap-3">
            <span className="truncate text-[13px] text-fg-2">{r.label}</span>
            <span className="relative h-2.5 rounded-full bg-surface-3">
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full bg-brand-500"
                initial={{ width: 0 }}
                animate={{ width: `${(r.value / max) * 100}%` }}
                transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                style={{ minWidth: r.value > 0 ? 6 : 0 }}
              />
            </span>
            <span className="w-8 text-right text-[13px] font-semibold tabular-nums text-fg">
              {r.value}
              {unit}
            </span>
          </div>
        );
        const tip = `${r.label}: ${r.value}${unit}${r.hint ? ` — ${r.hint}` : ""}`;
        return (
          <li key={r.label}>
            <Tooltip content={tip} side="top">
              {r.to ? (
                <Link to={r.to} className="block rounded-md px-1 py-0.5 transition hover:bg-surface-2" aria-label={tip}>
                  {body}
                </Link>
              ) : (
                <div className="px-1 py-0.5" tabIndex={0} aria-label={tip}>
                  {body}
                </div>
              )}
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
