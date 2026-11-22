import { Check, Info } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Feedback";

export const PLANS = [
  {
    name: "Free",
    audience: "Students and first-time job seekers",
    cta: "Start free",
    to: "/register",
    features: ["Basic templates", "One or two resume drafts", "Limited health-check and match credits", "PDF export", "Offline writing assistant"],
  },
  {
    name: "Pro",
    audience: "Active job seekers and professionals",
    highlight: true,
    cta: "Start with Free",
    to: "/register",
    features: ["More resume versions", "All templates", "Role-specific tailoring", "Cover letter studio", "Interview practice", "DOCX export"],
  },
  {
    name: "Career Plus",
    audience: "Candidates in an intensive search",
    cta: "Start with Free",
    to: "/register",
    features: ["Everything in Pro", "Application tracking & reminders", "Expanded AI usage", "Skill plans", "Full interview history"],
  },
  {
    name: "Campus",
    audience: "Colleges and training institutes",
    cta: "Contact us",
    to: "/about#institutions",
    features: ["Cohort access with invite codes", "Opt-in, scoped progress summaries", "Template recommendations", "Admin controls"],
  },
  {
    name: "Career Services",
    audience: "Placement teams and career centres",
    cta: "Contact us",
    to: "/about#institutions",
    features: ["Managed access", "Coach review workflows", "Support", "Configurable templates"],
  },
];

export default function Pricing() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Pricing</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Plans that grow with your search</h1>
        <p className="mt-4 text-muted">Every plan keeps the same principles: your data is private, AI never invents facts, and scores are explained.</p>
      </div>
      <Callout tone="info" className="mx-auto mt-8 max-w-2xl" title="Prices are not yet set">
        Plan contents and pricing are placeholders and will be configured after user research and cost validation. During this
        stage every account has access to all individual features.
      </Callout>
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {PLANS.map((p) => (
          <div key={p.name} className={`card relative flex flex-col p-6 ${p.highlight ? "ring-2 ring-brand-500" : ""}`}>
            {p.highlight && (
              <span className="absolute -top-3 left-6 rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">Most popular</span>
            )}
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 min-h-10 text-sm text-muted">{p.audience}</p>
            <p className="mt-4 font-display text-2xl font-bold">
              {p.name === "Free" ? "£0" : "TBC"}
              <span className="ml-1 text-xs font-medium text-muted">{p.name === "Free" ? "forever" : "placeholder"}</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2.5 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden /> {f}
                </li>
              ))}
            </ul>
            <LinkButton to={p.to} variant={p.highlight ? "primary" : "secondary"} className="mt-6 w-full">
              {p.cta}
            </LinkButton>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-10 flex max-w-2xl items-start gap-2 text-center text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        No plan guarantees interviews, ATS passage or placement. Institutional plans only show progress summaries for members who opt in — never resume content.
      </p>
    </div>
  );
}
