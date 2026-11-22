import type { ResumeContent } from "./types";

/** Illustrative sample used only in clearly-labelled previews (marketing, template gallery). */
export const SAMPLE_RESUME: ResumeContent = {
  personal: {
    full_name: "Alex Morgan",
    headline: "Product-minded Software Engineer",
    email: "alex.morgan@example.com",
    phone: "+00 0000 000000",
    location: "Sample City",
    links: [{ label: "GitHub", url: "https://github.com/example" }],
    show_email: true,
    show_phone: true,
    show_location: true,
  },
  sections: [
    { key: "s1", type: "summary", title: "Summary", visible: true, data: { text: "Software engineer who builds reliable web services and data tooling. Enjoys turning ambiguous problems into well-tested, measurable features." } },
    {
      key: "s2", type: "experience", title: "Experience", visible: true,
      data: { items: [
        { id: "e1", role: "Software Engineer", organization: "Example Analytics", location: "Remote", start: "Mar 2024", end: "", current: true,
          bullets: ["Built an event ingestion API in Python and PostgreSQL serving internal dashboards", "Introduced contract tests that caught schema regressions before release", "Mentored two interns through their first production features"] },
        { id: "e2", role: "Software Engineering Intern", organization: "Sample Logistics", location: "Hybrid", start: "Jun 2023", end: "Dec 2023", current: false,
          bullets: ["Rewrote a slow shipment report query, cutting load time from 9s to 2s", "Documented the deployment runbook adopted by the platform team"] },
      ] },
    },
    {
      key: "s3", type: "projects", title: "Projects", visible: true,
      data: { items: [{ id: "p1", name: "Open Transit Planner", role: "Creator", tools: ["React", "TypeScript", "Django"], start: "", end: "", current: false,
        bullets: ["Designed a route planner using open transit data with offline-first caching"] }] },
    },
    { key: "s4", type: "skills", title: "Skills", visible: true, data: { groups: [
      { id: "g1", name: "Languages", skills: ["Python", "TypeScript", "SQL"] },
      { id: "g2", name: "Tools", skills: ["Django", "React", "PostgreSQL", "Docker", "GitHub Actions"] },
    ] } },
    { key: "s5", type: "education", title: "Education", visible: true, data: { items: [{ id: "ed1", institution: "Example University", degree: "BSc Computer Science", field: "", start: "2019", end: "2023", grade: "", location: "", details: "" }] } },
  ],
};
