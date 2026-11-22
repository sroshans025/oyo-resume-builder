import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import {
  Activity,
  Archive,
  Bell,
  BookUser,
  Building2,
  CheckCheck,
  FileText,
  FolderGit2,
  GraduationCap,
  KanbanSquare,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Mail,
  Menu,
  MessagesSquare,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
  Target,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { api, type Paginated } from "@/lib/api";
import { useAuthActions, useTheme, useUser } from "@/lib/auth";
import type { Notification } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { Logo } from "@/components/ui/Layout";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/Overlay";
import { IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Feedback";
import { AIStatusPill } from "@/components/resume/AIStatusPill";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };

const groups: { label: string; items: NavItem[] }[] = [
  { label: "", items: [{ to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  {
    label: "Resume",
    items: [
      { to: "/app/resumes", label: "Resumes", icon: FileText },
      { to: "/app/templates", label: "Templates", icon: LayoutTemplate },
      { to: "/app/analysis", label: "Health check", icon: Activity },
    ],
  },
  {
    label: "Job search",
    items: [
      { to: "/app/job-match", label: "Job match", icon: Target },
      { to: "/app/cover-letters", label: "Cover letters", icon: Mail },
      { to: "/app/applications", label: "Applications", icon: KanbanSquare },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/app/interview", label: "Interview practice", icon: MessagesSquare },
      { to: "/app/skills", label: "Skill planner", icon: GraduationCap },
      { to: "/app/portfolio", label: "Portfolio", icon: FolderGit2 },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/app/vault", label: "Document vault", icon: Archive },
      { to: "/app/shared", label: "Shared with me", icon: BookUser },
    ],
  },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const extra: NavItem[] = [];
  if (user.role === "coordinator" || user.role === "admin") extra.push({ to: "/app/institution", label: "Institution", icon: Building2 });
  if (user.role === "admin") extra.push({ to: "/app/admin", label: "Admin console", icon: Shield });
  const all = extra.length ? [...groups, { label: "Manage", items: extra }] : groups;
  return (
    <nav aria-label="Workspace" className="space-y-5">
      {all.map((g) => (
        <div key={g.label || "main"}>
          {g.label && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition",
                      isActive ? "bg-surface text-fg shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface/70 hover:text-fg",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-500" aria-hidden />}
                      <item.icon className={cn("size-[17px]", isActive ? "text-brand-500" : "text-faint group-hover:text-fg-2")} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Paginated<Notification> & { unread: number }>("/notifications/?page_size=15"),
    refetchInterval: 60_000,
  });
  const readAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all/"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markRead = useMutation({
    mutationFn: (id: number) => api.patch(`/notifications/${id}/`, { read: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = data?.unread ?? 0;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-fg"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(380px,calc(100vw-2rem))] rounded-xl border border-line bg-surface shadow-[var(--shadow-lift)] data-[state=open]:animate-[fade-up_.15s_ease]"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-fg disabled:opacity-40"
              disabled={!unread}
              onClick={() => readAll.mutate()}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          <ul className="scrollbar-thin max-h-[360px] overflow-y-auto">
            {!data?.results.length && (
              <li className="px-4 py-10 text-center text-sm text-muted">
                You're all caught up. Reminders you set will appear here.
              </li>
            )}
            {data?.results.map((n) => (
              <li key={n.id}>
                <button
                  className={cn("flex w-full gap-3 border-b border-line px-4 py-3 text-left transition last:border-0 hover:bg-surface-2", !n.read && "bg-brand-soft/40")}
                  onClick={() => {
                    if (!n.read) markRead.mutate(n.id);
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand-500")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-xs text-muted">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-faint">{relativeTime(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-2.5 text-right">
            <Link to="/app/settings?tab=notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-muted hover:text-fg">
              Notification preferences
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function UserMenu() {
  const user = useUser();
  const { logout } = useAuthActions();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const initials = (user.full_name || user.email).split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition hover:bg-surface-3" aria-label="Account menu">
          <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-accent text-xs font-semibold text-white">
            {initials}
          </span>
          <span className="hidden max-w-[120px] truncate text-sm font-medium lg:block">{user.full_name.split(" ")[0] || "Account"}</span>
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-60">
        <DropdownLabel>
          <span className="block truncate text-sm font-medium text-fg">{user.full_name || "Your account"}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem icon={<UserRound />} onSelect={() => navigate("/app/profile")}>
          Career profile
        </DropdownItem>
        <DropdownItem icon={<Settings />} onSelect={() => navigate("/app/settings")}>
          Settings & privacy
        </DropdownItem>
        <DropdownSeparator />
        <DropdownLabel>Theme</DropdownLabel>
        {(["light", "dark", "system"] as const).map((t) => (
          <DropdownItem
            key={t}
            icon={t === "light" ? <Sun /> : t === "dark" ? <Moon /> : <Monitor />}
            onSelect={() => setTheme(t)}
          >
            <span className="flex-1 capitalize">{t}</span>
            {theme === t && <span className="size-1.5 rounded-full bg-brand-500" aria-label="selected" />}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem
          icon={<LogOut />}
          onSelect={async () => {
            await logout();
            toast.success("Signed out");
            navigate("/login");
          }}
        >
          Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

export function AppShell() {
  const user = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  const fullBleed = /^\/app\/resumes\/\d+/.test(location.pathname);

  return (
    <div className="min-h-dvh bg-bg">
      <a href="#app-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-bg-subtle lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo to="/app" />
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
          <SidebarNav />
        </div>
        <div className="border-t border-line p-3">
          <NavLink
            to="/app/settings"
            className={({ isActive }) =>
              cn("flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium", isActive ? "bg-surface text-fg ring-1 ring-line" : "text-muted hover:text-fg")
            }
          >
            <Settings className="size-[17px]" /> Settings & privacy
          </NavLink>
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-[var(--overlay)] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-bg-subtle shadow-xl lg:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              aria-label="Navigation"
            >
              <div className="flex h-16 items-center justify-between px-5">
                <Logo to="/app" />
                <IconButton label="Close navigation" onClick={() => setMobileOpen(false)}>
                  <X className="size-5" />
                </IconButton>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-6">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
                <NavLink to="/app/settings" className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium text-muted">
                  <Settings className="size-[17px]" /> Settings & privacy
                </NavLink>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-xl no-print">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" />
            </IconButton>
            <div className="lg:hidden">
              <img src="/brand/infyro-mark.png" alt="Infyro" className="size-7" />
            </div>
            {user.is_demo && (
              <Badge tone="violet" className="hidden sm:inline-flex">
                <Users className="size-3" /> Demo account — sample data only
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <AIStatusPill />
              <Notifications />
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="app-main" className={cn(fullBleed ? "" : "mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:py-8")}>
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
