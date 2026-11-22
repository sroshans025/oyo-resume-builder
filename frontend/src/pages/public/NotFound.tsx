import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";

export default function NotFound({ inApp }: { inApp?: boolean }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-16">
      <div className="text-center">
        <div className="relative mx-auto mb-6 w-fit">
          <p className="font-display text-[96px] font-extrabold leading-none text-gradient">404</p>
          <Compass className="absolute -right-6 -top-2 size-8 text-brand-400" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold">This page took a different career path</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">The link may be outdated, or the page may have moved. Your work is safe.</p>
        <div className="mt-8 flex justify-center gap-2">
          <LinkButton to={inApp ? "/app" : "/"}>{inApp ? "Back to dashboard" : "Back home"}</LinkButton>
          {!inApp && (
            <LinkButton to="/features" variant="secondary">
              Explore features
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}
