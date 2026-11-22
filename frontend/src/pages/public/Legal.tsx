export default function Legal({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="eyebrow">{kind === "privacy" ? "Privacy notice" : "Terms of use"}</p>
      <h1 className="mt-3 text-4xl font-bold">{kind === "privacy" ? "How we handle your data" : "Terms of use"}</h1>
      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
        Draft for product development. This page describes how the software behaves; it has not been reviewed by a lawyer and is not a
        statement of legal compliance for any jurisdiction.
      </div>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-fg-2">
        {kind === "privacy" ? (
          <>
            <Section title="What we store">
              Your account details, career profile, resumes and their versions, uploaded files, job descriptions you paste, analysis reports,
              cover letters, applications, interview practice and learning plans. Files are kept in private storage and downloaded only through
              short-lived links tied to your session.
            </Section>
            <Section title="AI processing">
              Live AI features send only the text needed for the specific request to the configured AI provider, and only after you turn on
              AI consent in Settings → Privacy. Without consent, a rule-based offline assistant runs on our servers. We log operational
              metadata (feature, provider, timing, sizes) but not your content.
            </Section>
            <Section title="Sharing">
              Nobody else can see your data unless you create a share link. Links are scoped to one resume, expire, can be restricted to one
              account, hide contact details by default and can be revoked at any time. Institution coordinators see only summary counts for
              members who opt in.
            </Section>
            <Section title="Your controls">
              You can export all your data as a ZIP and permanently delete your account from Settings. Uploaded files are deleted after the
              retention period you choose; generated exports expire automatically.
            </Section>
            <Section title="Retention exceptions">
              Security audit records are kept after account deletion with your identity removed (only an irreversible reference remains).
              AI usage logs (metadata only) are kept without a link to you. Backups taken before deletion expire on the operator's backup
              schedule.
            </Section>
            <Section title="What we never do">
              Sell your data, infer sensitive characteristics, or use your resume content for analytics without a lawful basis and clear notice.
            </Section>
          </>
        ) : (
          <>
            <Section title="Your content">You own what you create. You're responsible for making sure your resume and applications are accurate.</Section>
            <Section title="AI suggestions">
              Suggestions may be inaccurate or incomplete. Review every suggestion before use. Infyro does not guarantee interviews, ATS
              passage, shortlisting or job offers.
            </Section>
            <Section title="Acceptable use">
              Don't upload content you don't have the right to use, attempt to access other users' data, or use the service to automate
              applications or scrape third-party sites.
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-muted">{children}</p>
    </section>
  );
}
