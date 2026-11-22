import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "subtle" | "dark";
type Size = "xs" | "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none transition-[background,color,border,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_6px_16px_-6px_rgb(31_127_239/0.6)] hover:bg-brand-600",
  secondary: "bg-surface text-fg border border-line shadow-xs hover:bg-surface-3 hover:border-line-strong",
  outline: "border border-brand-300 text-brand-fg hover:bg-brand-soft dark:border-brand-700",
  ghost: "text-fg-2 hover:bg-surface-3 hover:text-fg",
  danger: "bg-danger text-white hover:brightness-95 shadow-xs",
  subtle: "bg-brand-soft text-brand-fg hover:brightness-[0.97] dark:hover:brightness-110",
  dark: "bg-ink text-white hover:bg-black dark:bg-white dark:text-ink dark:hover:bg-slate-200",
};
const sizes: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs rounded-md",
  sm: "h-8 px-3 text-[13px] rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-12 px-6 text-[15px] rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, iconRight, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  icon,
  iconRight,
  children,
  ...props
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode; iconRight?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" }
>(function IconButton({ label, className, children, size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-fg disabled:opacity-40",
        size === "sm" ? "size-7" : "size-9",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
