import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/auth";

export function Logo({ className, to = "/", variant }: { className?: string; to?: string; variant?: "light" | "dark" }) {
  const { resolved } = useTheme();
  const v = variant ?? (resolved === "dark" ? "dark" : "light");
  return (
    <Link to={to} className={cn("inline-flex shrink-0 items-center", className)} aria-label="Infyro home">
      <img
        src={v === "dark" ? "/brand/infyro-logo-dark.png" : "/brand/infyro-logo.png"}
        alt="Infyro"
        className="h-7 w-auto"
        width={86}
        height={28}
      />
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  crumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  crumbs?: { label: string; to?: string }[];
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {c.to ? (
                    <Link to={c.to} className="hover:text-fg">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-fg-2">
                      {c.label}
                    </span>
                  )}
                  {i < crumbs.length - 1 && <ChevronRight className="size-3" aria-hidden />}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-2xl font-bold sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, as: As = "div", ...rest }: { className?: string; children: ReactNode; as?: any } & Record<string, any>) {
  return (
    <As className={cn("card", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, to }: { label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
