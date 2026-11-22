import { Component, lazy, Suspense, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AlertOctagon } from "lucide-react";
import { RedirectIfAuthed, RequireAuth } from "@/lib/auth";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { AppShell } from "@/components/layout/AppShell";
import { FullPageLoader } from "@/components/ui/Feedback";
import { Button, LinkButton } from "@/components/ui/Button";
import { useEffect } from "react";

const Home = lazy(() => import("@/pages/public/Home"));
const Features = lazy(() => import("@/pages/public/Features"));
const Pricing = lazy(() => import("@/pages/public/Pricing"));
const About = lazy(() => import("@/pages/public/About"));
const PublicTemplates = lazy(() => import("@/pages/public/PublicTemplates"));
const Legal = lazy(() => import("@/pages/public/Legal"));
const Login = lazy(() => import("@/pages/public/Auth").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("@/pages/public/Auth").then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import("@/pages/public/Auth").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("@/pages/public/Auth").then((m) => ({ default: m.ResetPassword })));
const SharedResume = lazy(() => import("@/pages/public/SharedResume"));
const NotFound = lazy(() => import("@/pages/public/NotFound"));

const Dashboard = lazy(() => import("@/pages/app/Dashboard"));
const Onboarding = lazy(() => import("@/pages/app/Onboarding"));
const Resumes = lazy(() => import("@/pages/app/Resumes"));
const ResumeEditor = lazy(() => import("@/pages/app/ResumeEditor"));
const UploadReview = lazy(() => import("@/pages/app/UploadReview"));
const Templates = lazy(() => import("@/pages/app/Templates"));
const Analysis = lazy(() => import("@/pages/app/Analysis"));
const ReportPage = lazy(() => import("@/pages/app/ReportPage"));
const JobMatch = lazy(() => import("@/pages/app/JobMatch"));
const CoverLetters = lazy(() => import("@/pages/app/CoverLetters"));
const CoverLetterEditor = lazy(() => import("@/pages/app/CoverLetterEditor"));
const Applications = lazy(() => import("@/pages/app/Applications"));
const Interview = lazy(() => import("@/pages/app/Interview"));
const InterviewSession = lazy(() => import("@/pages/app/InterviewSession"));
const Skills = lazy(() => import("@/pages/app/Skills"));
const Portfolio = lazy(() => import("@/pages/app/Portfolio"));
const Vault = lazy(() => import("@/pages/app/Vault"));
const ProfilePage = lazy(() => import("@/pages/app/Profile"));
const SettingsPage = lazy(() => import("@/pages/app/Settings"));
const SharedWithMe = lazy(() => import("@/pages/app/SharedWithMe"));
const Institution = lazy(() => import("@/pages/app/Institution"));
const Admin = lazy(() => import("@/pages/app/Admin"));

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /Loading chunk|dynamically imported module/i.test(this.state.error.message);
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-md text-center">
          <AlertOctagon className="mx-auto mb-4 size-10 text-danger" aria-hidden />
          <h1 className="text-xl font-bold">{chunk ? "A new version is available" : "This page hit an unexpected error"}</h1>
          <p className="mt-2 text-sm text-muted">
            {chunk
              ? "Reload to get the latest version of Infyro."
              : "Your saved work is safe on the server. Try reloading, or head back to your dashboard."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <LinkButton to="/app" variant="secondary" onClick={() => this.setState({ error: null })}>
              Go to dashboard
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <ScrollToTop />
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="features" element={<Features />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="about" element={<About />} />
            <Route path="templates" element={<PublicTemplates />} />
            <Route path="privacy" element={<Legal kind="privacy" />} />
            <Route path="terms" element={<Legal kind="terms" />} />
            <Route path="login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
            <Route path="register" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="shared/:token" element={<SharedResume />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="app" element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="resumes" element={<Resumes />} />
            <Route path="resumes/:id" element={<ResumeEditor />} />
            <Route path="uploads/:id" element={<UploadReview />} />
            <Route path="templates" element={<Templates />} />
            <Route path="analysis" element={<Analysis />} />
            <Route path="reports/:id" element={<ReportPage />} />
            <Route path="job-match" element={<JobMatch />} />
            <Route path="cover-letters" element={<CoverLetters />} />
            <Route path="cover-letters/:id" element={<CoverLetterEditor />} />
            <Route path="applications" element={<Applications />} />
            <Route path="interview" element={<Interview />} />
            <Route path="interview/:id" element={<InterviewSession />} />
            <Route path="skills" element={<Skills />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="vault" element={<Vault />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="shared" element={<SharedWithMe />} />
            <Route path="institution" element={<RequireAuth roles={["coordinator", "admin"]}><Institution /></RequireAuth>} />
            <Route path="admin" element={<RequireAuth roles={["admin"]}><Admin /></RequireAuth>} />
            <Route path="*" element={<NotFound inApp />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
