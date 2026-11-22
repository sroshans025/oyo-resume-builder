import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "./api";
import type { Role, User } from "./types";
import { FullPageLoader } from "@/components/ui/Feedback";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<{ user: User | null }>("/auth/me/")).user,
    staleTime: 60_000,
    retry: (count, err: any) => err?.status !== 0 && count < 1,
  });
}

export function useUser(): User {
  const { data } = useMe();
  if (!data) throw new Error("useUser must be used inside an authenticated route");
  return data;
}

export function useAuthActions() {
  const qc = useQueryClient();
  return {
    async login(email: string, password: string) {
      const user = await api.post<User>("/auth/login/", { email, password });
      qc.clear();
      qc.setQueryData(["me"], user);
      return user;
    },
    async register(payload: { full_name: string; email: string; password: string; accept_terms: boolean }) {
      const user = await api.post<User>("/auth/register/", payload);
      qc.clear();
      qc.setQueryData(["me"], user);
      return user;
    },
    async logout() {
      await api.post("/auth/logout/");
      qc.clear();
      qc.setQueryData(["me"], null);
    },
    refresh: () => qc.invalidateQueries({ queryKey: ["me"] }),
  };
}

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <FullPageLoader />;
  if (user) return <Navigate to={user.profile?.onboarding_completed ? "/app" : "/app/onboarding"} replace />;
  return <>{children}</>;
}

/* ---- Theme -------------------------------------------------------------------- */
type Theme = "light" | "dark" | "system";
const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void; resolved: "light" | "dark" }>({
  theme: "system",
  setTheme: () => {},
  resolved: "light",
});

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("infyro-theme");
    return t === "light" || t === "dark" || t === "system" ? t : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq?.addEventListener("change", fn);
    return () => mq?.removeEventListener("change", fn);
  }, []);
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);
  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("infyro-theme", t);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  };
  return <ThemeCtx.Provider value={{ theme, setTheme, resolved }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
