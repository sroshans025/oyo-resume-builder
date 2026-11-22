import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, Moon, Sun, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "@/components/ui/Layout";
import { Button, IconButton, LinkButton } from "@/components/ui/Button";
import { useMe, useTheme } from "@/lib/auth";
import { cn } from "@/lib/utils";

const links = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "How it works" },
  { to: "/templates", label: "Templates" },
];

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  return (
    <IconButton label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}>
      {resolved === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </IconButton>
  );
}

export function PublicLayout() {
  const { data: user } = useMe();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header
        className={cn(
          "sticky top-0 z-40 transition-all",
          scrolled ? "border-b border-line bg-bg/80 backdrop-blur-xl" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  cn("rounded-lg px-3 py-2 text-sm font-medium transition", isActive ? "text-fg" : "text-muted hover:text-fg")
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <ThemeToggle />
            {user ? (
              <LinkButton to="/app" size="sm">
                Open workspace
              </LinkButton>
            ) : (
              <>
                <LinkButton to="/login" variant="ghost" size="sm">
                  Sign in
                </LinkButton>
                <LinkButton to="/register" size="sm">
                  Get started free
                </LinkButton>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <IconButton label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </IconButton>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav
              aria-label="Mobile"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-line bg-surface md:hidden"
            >
              <div className="space-y-1 px-4 py-3">
                {links.map((l) => (
                  <Link key={l.to} to={l.to} className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-surface-3">
                    {l.label}
                  </Link>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {user ? (
                    <LinkButton to="/app" className="col-span-2">
                      Open workspace
                    </LinkButton>
                  ) : (
                    <>
                      <LinkButton to="/login" variant="secondary">
                        Sign in
                      </LinkButton>
                      <LinkButton to="/register">Get started</LinkButton>
                    </>
                  )}
                </div>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Build a stronger resume. Prove your skills. Prepare for your next opportunity — with AI that never invents your experience.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            ["Features", "/features"],
            ["Templates", "/templates"],
            ["Pricing", "/pricing"],
            ["How it works", "/about"],
          ]}
        />
        <FooterCol
          title="Account"
          links={[
            ["Sign in", "/login"],
            ["Create account", "/register"],
            ["Reset password", "/forgot-password"],
          ]}
        />
        <FooterCol
          title="Trust"
          links={[
            ["Privacy & data", "/privacy"],
            ["Responsible AI", "/about#responsible-ai"],
            ["Terms of use", "/terms"],
          ]}
        />
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Infyro. All rights reserved.</p>
          <p>Scores are estimates, not guarantees of shortlisting, interviews or offers.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map(([label, to]) => (
          <li key={to}>
            <Link to={to} className="text-sm text-muted transition hover:text-fg">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative grid min-h-[calc(100dvh-4rem)] place-items-center overflow-hidden px-4 py-12">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-0 -z-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" aria-hidden />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-[420px]">
        <div className="card p-7 sm:p-8">
          <img src="/brand/infyro-mark.png" alt="" className="mb-5 size-10" />
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </motion.div>
    </div>
  );
}

export { Button };
