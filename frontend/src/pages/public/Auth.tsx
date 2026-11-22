import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuthActions } from "@/lib/auth";
import { AuthCard } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input } from "@/components/ui/Form";
import { Callout } from "@/components/ui/Feedback";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean; describedBy?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required invalid={invalid} aria-describedby={describedBy} className="pr-10" />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(safeNext(params.get("next")) ?? (user.profile?.onboarding_completed ? "/app" : "/app/onboarding"), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? "Too many attempts. Please wait a minute and try again." : err.friendly) : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your Infyro workspace." footer={<>New to Infyro? <Link to="/register" className="font-medium text-brand-fg hover:underline">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />}</Field>
        <Field label="Password" trailing={<Link to="/forgot-password" className="text-xs font-medium text-brand-fg hover:underline">Forgot password?</Link>}>
          {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" />}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>Sign in</Button>
      </form>
    </AuthCard>
  );
}

export function Register() {
  const navigate = useNavigate();
  const { register } = useAuthActions();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", accept_terms: false });
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const s = strength(form.password);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await register(form);
      toast.success("Account created — let's set up your profile");
      navigate("/app/onboarding", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError(0, "error", "Registration failed."));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthCard title="Create your account" subtitle="Free to start. No credit card, no AI key required." footer={<>Already have an account? <Link to="/login" className="font-medium text-brand-fg hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {err && !err.fields && <Callout tone="danger">{err.friendly}</Callout>}
        <Field label="Full name" error={err?.field("full_name")} required>
          {(id, d) => <Input id={id} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoComplete="name" required aria-describedby={d} invalid={!!err?.field("full_name")} />}
        </Field>
        <Field label="Email" error={err?.field("email")} required>
          {(id, d) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required aria-describedby={d} invalid={!!err?.field("email")} />}
        </Field>
        <Field label="Password" hint="At least 10 characters. Avoid common words." error={err?.field("password") ?? err?.field("non_field_errors")} required>
          {(id, d) => (
            <>
              <PasswordInput id={id} value={form.password} onChange={(v) => setForm({ ...form, password: v })} autoComplete="new-password" describedBy={d} invalid={!!err?.field("password")} />
              <div className="mt-2 flex gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-1 flex-1 rounded-full ${i < s ? (s >= 3 ? "bg-success" : "bg-warning") : "bg-surface-3"}`} />
                ))}
              </div>
            </>
          )}
        </Field>
        <Checkbox
          checked={form.accept_terms}
          onChange={(e) => setForm({ ...form, accept_terms: e.target.checked })}
          label={<>I agree to the <Link to="/terms" className="text-brand-fg underline" target="_blank">terms</Link> and <Link to="/privacy" className="text-brand-fg underline" target="_blank">privacy notice</Link></>}
        />
        {err?.field("accept_terms") && <p className="text-xs font-medium text-danger">{err.field("accept_terms")}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading}>Create account</Button>
      </form>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/password/reset/", { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.friendly : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a secure link that expires in 2 hours." footer={<Link to="/login" className="font-medium text-brand-fg hover:underline">Back to sign in</Link>}>
      {sent ? (
        <div className="text-center">
          <MailCheck className="mx-auto size-10 text-success" aria-hidden />
          <p className="mt-3 font-medium">Check your inbox</p>
          <p className="mt-1 text-sm text-muted">If an account exists for {email}, a reset link is on its way.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />}</Field>
          <Button type="submit" className="w-full" loading={loading}>Send reset link</Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const uid = params.get("uid");
  const token = params.get("token");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      await api.post("/auth/password/reset/confirm/", { uid, token, new_password: pw });
      setDone(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setLoading(false);
    }
  };
  if (!uid || !token)
    return (
      <AuthCard title="Link incomplete" footer={<Link to="/forgot-password" className="text-brand-fg">Request a new link</Link>}>
        <Callout tone="warning">This reset link is missing information. Request a new one.</Callout>
      </AuthCard>
    );
  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
          <p className="mt-3 font-medium">Password updated</p>
          <p className="mt-1 text-sm text-muted">Other sessions were signed out. Redirecting to sign in…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {err && <Callout tone="danger">{err.friendly}</Callout>}
          <Field label="New password" hint="At least 10 characters.">{(id, d) => <PasswordInput id={id} value={pw} onChange={setPw} autoComplete="new-password" describedBy={d} />}</Field>
          <Button type="submit" className="w-full" loading={loading}>Update password</Button>
        </form>
      )}
    </AuthCard>
  );
}
