// node sweep.cjs : open every page signed in, report status + browser errors.
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const cookie = require("./cookie.cjs");
const F = require("./fixtures.cjs");
const short = F.tables.short_videos[0].id, long = F.tables.long_video_projects[0].id;
const pages = ["/dashboard", "/shorts", `/shorts/${short}`, `/shorts/${short}/script`, "/shorts/new", "/videos", `/videos/${long}`, `/videos/${long}/script`, `/videos/${long}/studio`, "/calendar", "/posting", "/meetings", "/meetings/cccccccc-0000-4000-8000-000000000001", "/analytics", "/analytics?tab=audience", "/analytics?tab=content", "/analytics?tab=revenue", "/team", "/team?tab=defaults", "/team?tab=accounts", "/team?tab=appearance", "/team?tab=team", "/team?tab=objectives", "/objectives", "/objectives?view=projections", "/word", "/settings", "/settings?tab=notifications", "/u/edu", "/status", "/developer", "/privacy", "/terms", "/data-deletion", "/offline.html", "/videos/new", "/settings?tab=account", "/setup", "/welcome?token_hash=abcdefgh12345678&type=invite", "/welcome?error=expired&type=recovery", "/set-password", "/does-not-exist"];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "Europe/Bucharest" });
  await ctx.addCookies([{ name: cookie.name, value: cookie.value, domain: "localhost", path: "/" }, { name: "vp_team", value: F.TEAM, domain: "localhost", path: "/" }]);
  let bad = 0;
  for (const p of pages) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.on("console", (m) => m.type() === "error" && !/WebSocket|realtime|Failed to load resource/.test(m.text()) && errs.push("console: " + m.text().slice(0, 200)));
    const t = Date.now();
    let status = 0;
    try {
      const r = await page.goto("http://localhost:3456" + p, { waitUntil: "networkidle", timeout: 120000 });
      status = r.status();
      await page.waitForTimeout(400);
    } catch (e) { errs.push("goto: " + e.message.slice(0, 120)); }
    const crashed = await page.locator("text=Something went wrong").count().catch(() => 0);
    // Sent to the sign-in page: the stand-in database isn't answering (or the session is gone).
    const signedOut = !p.startsWith("/welcome") && !p.startsWith("/set-password") && new URL(page.url()).pathname === "/login";
    if (signedOut) errs.push("ended on /login: is the mock (port 54321) running?");
    // The 404 screen renders inside the streamed dashboard shell, so it can answer 200.
    const fine = (p === "/does-not-exist" ? [200, 404] : [200]).includes(status) && !errs.length && !crashed;
    if (!fine) bad++;
    console.log(`${fine ? "ok " : "BAD"} ${status} ${String(Date.now() - t).padStart(5)}ms ${p}${crashed ? "  [error screen]" : ""}${errs.length ? "\n    " + errs.join("\n    ") : ""}`);
    await page.close();
  }
  console.log(bad ? `${bad} page(s) with problems` : "all pages fine");
  await b.close();
})();
