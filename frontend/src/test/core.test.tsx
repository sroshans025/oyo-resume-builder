import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError, request } from "@/lib/api";
import { daysUntil, formatBytes, pluralize, scoreTone } from "@/lib/utils";
import { Field, Input, TagInput } from "@/components/ui/Form";
import { ResumeDocument, sectionHasContent } from "@/components/resume/ResumePreview";
import { ConfirmProvider, useConfirm } from "@/components/ui/Overlay";
import { SAMPLE_RESUME } from "@/lib/sample";
import { useState } from "react";

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("normalises the error envelope into ApiError with field access", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "validation_error", message: "Fix fields", fields: { personal: { email: ["Enter a valid email address."] } } } }), { status: 400 }),
    );
    const err = (await request("GET", "/resumes/").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("validation_error");
    expect(err.field("personal.email")).toBe("Enter a valid email address.");
  });

  it("sends the CSRF token on unsafe requests", async () => {
    document.cookie = "csrftoken=abc123";
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await request("POST", "/resumes/", { title: "x" });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-CSRFToken"]).toBe("abc123");
    expect(init.credentials).toBe("include");
  });

  it("reports network failures with a friendly message", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await request("GET", "/x/").catch((e) => e)) as ApiError;
    expect(err.code).toBe("network_error");
    expect(err.message).toMatch(/can't reach the server/i);
  });
});

describe("utils", () => {
  it("formats sizes, plurals and score tones", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(pluralize(1, "page")).toBe("1 page");
    expect(pluralize(3, "page")).toBe("3 pages");
    expect(scoreTone(85)).toBe("good");
    expect(scoreTone(65)).toBe("ok");
    expect(scoreTone(30)).toBe("low");
    expect(scoreTone(null)).toBe("neutral");
  });

  it("computes days until a date", () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(daysUntil(iso)).toBe(3);
    expect(daysUntil(null)).toBeNull();
  });
});

describe("form accessibility", () => {
  it("associates label, hint and error with the control", () => {
    render(<Field label="Email" hint="We never share it" error="Required">{(id, d) => <Input id={id} aria-describedby={d} />}</Field>);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("adds tags with Enter and dedupes case-insensitively", async () => {
    function Harness() {
      const [v, setV] = useState<string[]>(["Python"]);
      return <TagInput id="t" value={v} onChange={setV} />;
    }
    render(<Harness />);
    const box = screen.getByRole("textbox");
    await userEvent.type(box, "python{Enter}SQL{Enter}");
    expect(screen.getAllByText(/Python|SQL/).map((n) => n.textContent)).toEqual(["Python", "SQL"]);
    await userEvent.click(screen.getByLabelText("Remove SQL"));
    expect(screen.queryByText("SQL")).toBeNull();
  });
});

describe("resume preview", () => {
  it("hides contact details the user switched off and skips empty sections", () => {
    const content = {
      ...SAMPLE_RESUME,
      personal: { ...SAMPLE_RESUME.personal, show_phone: false },
      sections: [...SAMPLE_RESUME.sections, { key: "e", type: "awards" as const, title: "Awards", visible: true, data: { items: [] } }],
    };
    render(<ResumeDocument content={content} />);
    expect(screen.getByText(/alex.morgan@example.com/)).toBeInTheDocument();
    expect(screen.queryByText(/\+00 0000 000000/)).toBeNull();
    expect(screen.queryByText("Awards")).toBeNull();
    expect(screen.getByText("Experience")).toBeInTheDocument();
  });

  it("does not render hidden sections", () => {
    const content = { ...SAMPLE_RESUME, sections: SAMPLE_RESUME.sections.map((s) => (s.type === "projects" ? { ...s, visible: false } : s)) };
    render(<ResumeDocument content={content} />);
    expect(screen.queryByText("Open Transit Planner")).toBeNull();
  });

  it("knows when a section has content", () => {
    expect(sectionHasContent({ key: "a", type: "summary", title: "S", visible: true, data: { text: "  " } })).toBe(false);
    expect(sectionHasContent({ key: "b", type: "skills", title: "S", visible: true, data: { groups: [{ id: "g", name: "", skills: ["Go"] }] } })).toBe(true);
  });
});

describe("confirm dialog", () => {
  it("requires typing the confirmation word for destructive actions", async () => {
    const onResult = vi.fn();
    function Trigger() {
      const confirm = useConfirm();
      return <button onClick={async () => onResult(await confirm({ title: "Delete account?", typeToConfirm: "DELETE" }))}>open</button>;
    }
    render(<ConfirmProvider><Trigger /></ConfirmProvider>);
    await userEvent.click(screen.getByText("open"));
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "DELETE");
    expect(del).toBeEnabled();
    await userEvent.click(del);
    expect(onResult).toHaveBeenCalledWith(true);
  });
});
