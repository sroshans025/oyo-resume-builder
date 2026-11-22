"""End-to-end smoke test for the main Infyro user journeys.

Runs against a live dev stack (Django on :8000, Vite on :5173) in a real browser.

    pip install playwright            # in any venv; uses your installed Chrome
    python e2e/smoke_test.py --base http://localhost:5173 --out ./e2e-screens

Creates a fresh, uniquely-named test account each run. It fails (non-zero exit)
on any uncaught page error, console error, failed assertion, or 5xx response.
"""

import argparse
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

JD = """Junior Backend Engineer
Example Fintech

What you'll do:
- Build REST APIs for our payments dashboard
- Write tests and take part in code reviews

Requirements:
- Experience with Python and Django
- Solid SQL and PostgreSQL knowledge
- Clear written communication

Nice to have:
- Docker or Kubernetes
- AWS experience
"""


STATE: dict = {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="e2e-screens")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--channel", default="chrome")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    problems: list[str] = []
    email = f"e2e-{int(time.time())}@example.com"

    with sync_playwright() as p:
        browser = p.chromium.launch(channel=args.channel, headless=not args.headed)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = ctx.new_page()
        STATE["page"], STATE["out"] = page, out
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and "favicon" not in m.text and problems.append(f"console: {m.text}"))
        page.on("response", lambda r: r.status >= 500 and problems.append(f"HTTP {r.status} {r.url}"))

        def shot(name, full=False):
            page.wait_for_timeout(450)
            page.screenshot(path=str(out / f"{name}.png"), full_page=full)

        def step(name):
            print(f"• {name}", flush=True)

        step("Landing page")
        page.goto(args.base + "/")
        expect(page.get_by_role("heading", name=re.compile("Build a stronger resume"))).to_be_visible()
        shot("01-home", full=True)
        for path in ["/features", "/pricing", "/about", "/templates", "/privacy", "/does-not-exist"]:
            page.goto(args.base + path)
            page.wait_for_load_state("networkidle")
        expect(page.get_by_text("404", exact=True)).to_be_visible()

        step("Register")
        page.goto(args.base + "/register")
        page.get_by_role("textbox", name="Full name", exact=True).fill("Robin Example")
        page.get_by_role("textbox", name="Email", exact=True).fill(email)
        page.get_by_label(re.compile(r"^Password")).fill("Correct-Horse-Battery-9")
        page.get_by_label(re.compile("I agree")).check()
        page.get_by_role("button", name="Create account").click()
        page.wait_for_url(re.compile("/app/onboarding"))

        step("Onboarding")
        page.get_by_role("textbox", name="Target roles", exact=True).fill("Backend Developer")
        page.keyboard.press("Enter")
        page.get_by_role("button", name="Continue").click()
        page.get_by_role("radio", name=re.compile("Fresher")).click()
        page.get_by_role("button", name="Continue").click()
        page.get_by_role("radio", name=re.compile("Build a resume")).click()
        page.get_by_role("button", name="Continue").click()
        shot("02-onboarding-privacy")
        page.get_by_role("button", name="Finish setup").click()

        step("Create resume")
        expect(page.get_by_role("dialog", name="New resume")).to_be_visible()
        page.get_by_role("dialog").get_by_role("textbox", name="Title").fill("Backend CV")
        page.get_by_role("button", name="Create & open editor").click()
        page.wait_for_url(re.compile(r"/app/resumes/\d+"))
        resume_url = page.url

        step("Edit resume (autosave)")
        page.get_by_role("textbox", name="Headline").fill("Junior Backend Developer")
        page.get_by_role("textbox", name="Phone").fill("+44 7000 000000")
        page.get_by_role("button", name="Professional Summary", exact=True).click()
        page.get_by_role("textbox", name="Summary", exact=True).fill("Computer science graduate building Python web services and REST APIs.")
        page.get_by_role("button", name="Skills", exact=True).click()
        page.get_by_role("textbox", name="Group name", exact=True).fill("Languages")
        page.get_by_placeholder("Type a skill and press Enter").fill("Python, SQL, Docker")
        page.keyboard.press("Enter")
        page.get_by_role("button", name="Experience", exact=True).click()
        page.get_by_role("button", name=re.compile("Add experience")).click()
        page.get_by_role("textbox", name="Job title", exact=True).fill("Software Engineer Intern")
        page.get_by_role("textbox", name="Organisation", exact=True).fill("Acme Ltd")
        page.get_by_role("textbox", name="Start").fill("Jun 2025")
        page.get_by_role("textbox", name="End").fill("Dec 2025")
        page.get_by_role("textbox", name="Bullet 1", exact=True).fill("Responsible for building Django REST endpoints for the billing team")
        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible(timeout=10000)
        shot("03-editor")

        step("Writing Studio (offline assistant)")
        page.get_by_role("button", name="Improve bullet").first.click()
        page.get_by_role("button", name="Generate drafts").click()
        expect(page.get_by_text("Option 1", exact=True)).to_be_visible(timeout=10000)
        shot("04-writing-studio")
        page.get_by_role("button", name="Replace bullet").first.click()
        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible(timeout=10000)

        step("Template switch + export PDF")
        page.get_by_role("button", name=re.compile("Clarity|Launch|Template")).click()
        page.get_by_role("menuitem", name=re.compile("Meridian")).click()
        page.get_by_role("button", name="Export").click()
        with page.expect_download() as dl:
            page.get_by_role("menuitem", name=re.compile("PDF")).click()
        pdf = out / "export.pdf"
        dl.value.save_as(pdf)
        assert pdf.stat().st_size > 1500, "PDF export too small"

        step("Health check")
        page.get_by_role("button", name="More actions").click()
        page.get_by_role("menuitem", name="Run health check").click()
        page.wait_for_url(re.compile(r"/app/reports/\d+"))
        expect(page.get_by_text("Resume quality estimate", exact=True)).to_be_visible()
        shot("05-health-report", full=True)

        step("Job match")
        page.goto(args.base + "/app/job-match")
        page.get_by_role("textbox", name="Company (optional)", exact=True).fill("Example Fintech")
        page.get_by_role("textbox", name="Job description text", exact=True).fill(JD)
        page.get_by_role("button", name="Map my evidence").click()
        page.wait_for_url(re.compile(r"/app/reports/\d+"))
        expect(page.get_by_text("Evidence map", exact=True)).to_be_visible()
        shot("06-match-report", full=True)
        page.get_by_role("button", name="Create skill plan").click()
        page.wait_for_url(re.compile("/app/skills"))
        shot("07-skills")

        step("Applications board")
        page.goto(args.base + "/app/applications")
        page.get_by_role("button", name="Add application").first.click()
        dlg = page.get_by_role("dialog")
        dlg.get_by_role("textbox", name=re.compile("^Company")).fill("Example Fintech")
        dlg.get_by_role("textbox", name=re.compile("^Role")).fill("Junior Backend Engineer")
        page.get_by_role("dialog").get_by_role("button", name="Add", exact=True).click()
        expect(page.get_by_text("Application added")).to_be_visible()
        page.get_by_role("button", name=re.compile("Change stage for Example Fintech")).click()
        page.get_by_role("menuitem", name="Applied").click()
        expect(page.get_by_role("dialog", name=re.compile("follow-up"))).to_be_visible()
        page.get_by_role("button", name="Set reminder").click()
        shot("08-applications")

        step("Interview practice")
        page.goto(args.base + "/app/interview")
        page.get_by_role("button", name="New practice session").click()
        page.get_by_role("dialog").get_by_role("textbox", name="Target role").fill("Backend Engineer")
        page.get_by_role("button", name="Generate questions").click()
        page.wait_for_url(re.compile(r"/app/interview/\d+"))
        page.get_by_role("textbox", name="Your answer", exact=True).fill(
            "When I was an intern at Acme, our team had a slow billing report. My task was to fix it before month end. "
            "I profiled the Django views, I added PostgreSQL indexes and I rewrote two queries. As a result the report "
            "loaded in under a second and finance adopted it."
        )
        page.get_by_role("button", name="Get feedback").click()
        expect(page.get_by_text("Rubric total", exact=True)).to_be_visible(timeout=10000)
        shot("09-interview-feedback", full=True)

        step("Cover letter")
        page.goto(args.base + "/app/cover-letters")
        page.get_by_role("button", name="New letter").first.click()
        page.get_by_role("dialog").get_by_role("textbox", name="Company").fill("Example Fintech")
        page.get_by_label("Draw facts from resume").select_option(label="Backend CV")
        page.get_by_role("dialog").get_by_role("button", name="Create").click()
        page.wait_for_url(re.compile(r"/app/cover-letters/\d+"))
        page.get_by_role("button", name="Generate draft").click()
        expect(page.get_by_text("Draft ready", exact=True)).to_be_visible(timeout=10000)
        shot("10-cover-letter")

        step("Dashboard, vault, settings, dark mode")
        page.goto(args.base + "/app")
        expect(page.get_by_role("heading", name="Your resumes")).to_be_visible(timeout=10000)
        shot("11-dashboard", full=True)
        page.goto(args.base + "/app/vault")
        expect(page.get_by_text(re.compile("Resume PDF")).first).to_be_visible()
        page.goto(args.base + "/app/settings?tab=appearance")
        page.get_by_role("radio", name="Dark").click()
        page.goto(resume_url)
        page.wait_for_load_state("networkidle")
        shot("12-editor-dark")
        page.goto(args.base + "/app")
        shot("13-dashboard-dark", full=True)

        step("Mobile layout")
        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mobile.add_cookies(ctx.cookies())
        m = mobile.new_page()
        m.on("pageerror", lambda e: problems.append(f"mobile pageerror: {e}"))
        m.goto(args.base + "/")
        m.wait_for_timeout(600)
        m.screenshot(path=str(out / "14-mobile-home.png"), full_page=False)
        m.goto(args.base + "/app/applications")
        m.wait_for_load_state("networkidle")
        m.screenshot(path=str(out / "15-mobile-applications.png"))
        overflow = m.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        if overflow > 1:
            problems.append(f"mobile horizontal overflow on /app/applications: {overflow}px")
        m.goto(resume_url)
        m.wait_for_load_state("networkidle")
        m.screenshot(path=str(out / "16-mobile-editor.png"))

        step("Sign out")
        page.goto(args.base + "/app")
        page.get_by_role("button", name="Account menu").click()
        page.get_by_role("menuitem", name="Sign out").click()
        page.wait_for_url(re.compile("/login"))
        browser.close()

    if problems:
        print("\nPROBLEMS:")
        for prob in problems:
            print("  -", prob)
        sys.exit(1)
    print(f"\nAll journeys passed. Screenshots in {out}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        if STATE.get("page"):
            try:
                STATE["page"].screenshot(path=str(STATE["out"] / "FAILURE.png"))
                print(f"Saved failure screenshot to {STATE['out'] / 'FAILURE.png'}")
            except Exception:
                pass
        raise
