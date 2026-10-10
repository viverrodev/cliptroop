// Projections (1.15.0): a metric's value on a day from the copied numbers
// (followers, views, rates, per-video averages, the team's own posting), the
// scope (platforms, shorts or long, the window), the trend, the forecast and
// where a projection stands; the words around them.
import { addDays, assess, compareValues, trendPerDay, valueAt, type PContent, type PDaily, type PPost, type ProjData } from "../modules/projections/lib/compute";
import { addMonths, cleanScope, describeProjection, formatValue, projectionProblem, suggestProjectionTitle } from "../modules/projections/lib/metrics";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (a: number | null, b: number, m: string, tol = 1e-6) => ok(a !== null && Math.abs(a - b) <= tol, `${m}: got ${a}, want ${b}`);

const TODAY = "2026-10-10";
const day = (n: number) => addDays(TODAY, n);

// Thirty days of YouTube (views 1,000 a day, 400 of them shorts), Instagram
// (500 a day), TikTok running totals (+200 a day), followers snapshots.
const daily: PDaily[] = [];
for (let i = -40; i <= 0; i++) {
  const d = day(i);
  daily.push({ platform: "youtube", day: d, content: "all", views: 1000, watch_minutes: 3000, avg_view_seconds: 60, avg_view_pct: 40, engaged_views: 700, likes: 50, dislikes: 5, comments: 10, shares: 5, followers_gained: 12, followers_lost: 2, followers: i === 0 ? 60_000 : null, total_views: i === 0 ? 5_000_000 : null });
  daily.push({ platform: "youtube", day: d, content: "shorts", views: 400, watch_minutes: 200, likes: 30 });
  daily.push({ platform: "youtube", day: d, content: "long", views: 600, watch_minutes: 2800, likes: 20 });
  daily.push({ platform: "instagram", day: d, content: "all", views: 500, likes: 40, comments: 4, shares: 6, saves: 10, reach: 300, followers: 20_000 + (i + 40) * 10 });
  daily.push({ platform: "tiktok", day: d, content: "all", total_views: 1_000_000 + (i + 40) * 200, total_likes: 90_000 + (i + 40) * 20, followers: 8_000 });
}
const content: PContent[] = [
  { platform: "youtube", kind: "short", published_at: `${day(-3)}T10:00:00Z`, views: 50_000, likes: 2_000, avg_view_seconds: 30, avg_view_pct: 80, subscribers_gained: 40, engaged_views: 30_000 },
  { platform: "youtube", kind: "short", published_at: `${day(-10)}T10:00:00Z`, views: 150_000, likes: 6_000, avg_view_seconds: 34, avg_view_pct: 90, subscribers_gained: 100, engaged_views: 100_000 },
  { platform: "youtube", kind: "long", published_at: `${day(-20)}T10:00:00Z`, views: 20_000, likes: 1_000, avg_view_seconds: 420, avg_view_pct: 41, subscribers_gained: 60, engaged_views: 15_000 },
  { platform: "instagram", kind: "short", published_at: `${day(-5)}T10:00:00Z`, views: 10_000, likes: 800, shares: 40, skip_rate: 30, avg_view_seconds: 9 },
  { platform: "instagram", kind: "short", published_at: `${day(-6)}T10:00:00Z`, views: 30_000, likes: 1_500, shares: 90, skip_rate: 20, avg_view_seconds: 12 },
  // Too old for a 28-day window.
  { platform: "youtube", kind: "short", published_at: `${day(-60)}T10:00:00Z`, views: 9_000_000, likes: 1 },
];
const posts: PPost[] = [
  { kind: "short", id: "s1", platform: "instagram", day: day(-2) },
  { kind: "short", id: "s1", platform: "tiktok", day: day(-1) },
  { kind: "short", id: "s2", platform: "tiktok", day: day(-9) },
  // First posted long ago, posted again lately: not new.
  { kind: "short", id: "s3", platform: "instagram", day: day(-100) },
  { kind: "short", id: "s3", platform: "tiktok", day: day(-1) },
  { kind: "long", id: "l1", platform: null, day: day(-15) },
];
const data: ProjData = { daily, content, revenue: [{ platform: "youtube", day: day(-1), content: "all", revenue: 12 }, { platform: "youtube", day: day(-2), content: "all", revenue: 8 }], posts };

// ---- Levels ---------------------------------------------------------------------
eq(valueAt("followers", {}, data, TODAY), 60_000 + 20_400 + 8_000, "followers: every platform's latest count added up");
eq(valueAt("followers", { platforms: ["youtube"] }, data, TODAY), 60_000, "followers on YouTube only");
eq(valueAt("total_views", { platforms: ["tiktok"] }, data, TODAY), 1_008_000, "TikTok lifetime views (latest running total)");

// ---- Windows (end yesterday) --------------------------------------------------------
eq(valueAt("views", { window: 7, platforms: ["youtube"] }, data, TODAY), 7000, "YouTube views over 7 days");
eq(valueAt("views", { window: 7, platforms: ["youtube"], content: "shorts" }, data, TODAY), 2800, "YouTube shorts views over 7 days");
eq(valueAt("views", { window: 7, platforms: ["tiktok"] }, data, TODAY), 1400, "TikTok views from running totals (each day: the next copy minus that day's)");
eq(valueAt("views", { window: 7, content: "shorts" }, data, TODAY), 2800, "a shorts split counts YouTube only (the others don't split)");
near(valueAt("views_per_day", { window: 7, platforms: ["youtube", "instagram"] }, data, TODAY), 1500, "views a day");
near(valueAt("watch_hours", { window: 28 }, data, TODAY), (28 * 3000) / 60, "watch hours over 28 days");
near(valueAt("engaged_rate", { window: 28 }, data, TODAY), 70, "engaged view rate");
near(valueAt("avg_view_pct", { window: 28 }, data, TODAY), 40, "average % viewed (weighted)");
near(valueAt("like_rate", { window: 7, platforms: ["youtube"] }, data, TODAY), 5, "YouTube like rate");
near(valueAt("engagement_rate", { window: 7, platforms: ["instagram"] }, data, TODAY), 12, "Instagram engagement rate (likes, comments, shares and saves)");
near(valueAt("dislike_rate", { window: 7 }, data, TODAY), (5 / 55) * 100, "dislike share", 1e-9);
eq(valueAt("followers_net", { window: 7, platforms: ["youtube"] }, data, TODAY), 70, "YouTube net followers (gained minus lost per day)");
eq(valueAt("followers_net", { window: 7, platforms: ["instagram"] }, data, TODAY), 70, "Instagram net followers from the daily counts");
near(valueAt("followers_per_1k", { window: 7, platforms: ["youtube"] }, data, TODAY), 10, "new followers per 1,000 views");

// ---- Per video (published in the window) ------------------------------------------------
eq(valueAt("videos_posted", { window: 28, platforms: ["youtube"] }, data, TODAY), 3, "YouTube videos published in 28 days (the 60-day-old one left out)");
near(valueAt("avg_views_per_video", { window: 28, platforms: ["youtube"], content: "shorts" }, data, TODAY), 100_000, "average views per YouTube short");
eq(valueAt("median_views_per_video", { window: 28, platforms: ["youtube"] }, data, TODAY), 50_000, "median views per YouTube video");
near(valueAt("hit_rate", { window: 28, platforms: ["youtube"], threshold: 100_000 }, data, TODAY), 100 / 3, "a third of YouTube's new videos passed 100K", 1e-9);
near(valueAt("skip_rate", { window: 28 }, data, TODAY), 25, "Reels skip rate averaged over new Reels");
near(valueAt("avg_pct_per_video", { window: 28, content: "long" }, data, TODAY), 41, "% viewed per long video");
near(valueAt("video_like_rate", { window: 28, platforms: ["instagram"] }, data, TODAY), (2300 / 40_000) * 100, "like rate of new Instagram videos", 1e-9);

// ---- Money and the team's own work -------------------------------------------------------
eq(valueAt("revenue", { window: 7 }, data, TODAY), 20, "revenue over 7 days");
near(valueAt("rpm", { window: 7 }, data, TODAY), 10, "RPM over days with both numbers");
near(valueAt("shorts_per_week", { window: 7 }, data, TODAY), 1, "shorts a week: s1 once on its first post; s3 first posted long ago");
near(valueAt("shorts_per_week", { window: 28 }, data, TODAY), 0.5, "two new shorts in 4 weeks");
near(valueAt("longs_per_month", { window: 28 }, data, TODAY), 30 / 28, "one long video in 28 days", 1e-9);
eq(valueAt("views", { window: 7, platforms: ["facebook"] }, data, TODAY), null, "no numbers: null, not 0");

// ---- Scope and words --------------------------------------------------------------------------
eq(cleanScope("views", { platforms: ["youtube", "nope"], content: "shorts", window: 5 }), { platforms: ["youtube"], content: "shorts", window: 28 }, "scope cleaned (unknown platform out, window back to 28)");
eq(cleanScope("followers", { platforms: ["youtube", "instagram", "tiktok", "facebook"], window: 7 }), {}, "every platform = no filter; a level has no window");
eq(cleanScope("hit_rate", { threshold: "abc" }).threshold, 100_000, "a views mark by default");
eq(formatValue("avg_view_pct", 41.26), "41.3%", "percent");
eq(formatValue("avg_view_duration", 84), "1:24", "seconds");
eq(formatValue("followers", 61_234), "61.2K", "compact");
eq(formatValue("revenue", 1240, { currency: "USD" }), "$1,240", "money");
eq(describeProjection({ metric: "followers", scope: { platforms: ["youtube"] }, target: 100_000, direction: "up", deadline: "2027-01-10" }), "Reach 100K subscribers on YouTube by Jan 10, 2027.", "the followers sentence (YouTube alone: subscribers)");
eq(describeProjection({ metric: "skip_rate", scope: { window: 28 }, target: 30, direction: "down", deadline: "2027-03-01" }), "Bring the Reels skip rate down to 30% by Mar 1, 2027 (Instagram, last 28 days).", "a down sentence");
eq(describeProjection({ metric: "views", scope: { window: 28, platforms: ["youtube"], content: "shorts" }, target: 900_000, direction: "up", deadline: "2027-03-01" }), "Reach 900K views on YouTube shorts in 28 days by Mar 1, 2027.", "a count over a window");
eq(describeProjection({ metric: "shorts_per_week", scope: { window: 28 }, target: 16, direction: "up", deadline: "2027-03-01" }), "Post 16 shorts a week by Mar 1, 2027 (on average over 28 days).", "the team's own posting");
eq(suggestProjectionTitle("followers", { platforms: ["youtube"] }), "YouTube subscribers", "a name for YouTube followers");
eq(addMonths("2026-01-31", 1), "2026-02-28", "a month after Jan 31");
eq(projectionProblem({ title: "x", metric: "avg_view_pct", target: 120, deadline: "2027-01-01", today: TODAY, color: "blue" }), "A percentage is between 0 and 100.", "a percentage over 100");
eq(projectionProblem({ title: "x", metric: "views", target: 10, deadline: TODAY, today: TODAY, color: "blue" }), "Pick a date after today.", "a deadline today");

// ---- Compare --------------------------------------------------------------------------------------
const cmp = compareValues(data, TODAY, false);
ok(cmp.followers === 88_400 && !("revenue" in cmp), `compare: followers in, money out (${JSON.stringify(cmp)})`);
ok("revenue" in compareValues(data, TODAY, true), "compare: money when asked");

// ---- Trend, forecast and where it stands ---------------------------------------------------------
const pts = Array.from({ length: 11 }, (_, i) => ({ day: day(-10 + i), value: 60_000 + i * 100 }));
near(trendPerDay(pts), 100, "trend: 100 a day");
eq(trendPerDay(pts.slice(0, 2)), null, "two points: too early for a trend");
const base = { metric: "followers", start: 60_000, target: 70_000, direction: "up" as const, startDay: day(-10), deadline: day(90), today: TODAY, points: pts, achieved: false, ended: false };
const a1 = assess({ ...base, current: 61_000 });
ok(a1.status === "on_track" && Math.abs((a1.forecast ?? 0) - 70_000) < 1 && a1.eta === day(90) && a1.daysLeft === 90 && a1.daysTotal === 100, `on track: lands on 70K on the deadline (${JSON.stringify(a1)})`);
const a2 = assess({ ...base, target: 80_000, current: 61_000 });
ok(a2.status === "behind" && Math.abs((a2.needPerDay ?? 0) - 211.11) < 0.1, `behind: needs about 211 a day (${a2.status}, ${a2.needPerDay})`);
const a3 = assess({ ...base, target: 65_000, current: 61_000 });
ok(a3.status === "ahead" && a3.eta === day(40), `ahead: gets there on day 50 of 100 (${a3.status} ${a3.eta})`);
eq(assess({ ...base, current: 70_500 }).status, "reached", "reached");
eq(assess({ ...base, current: 64_000, ended: true }).status, "missed", "ended short");
eq(assess({ ...base, current: 64_000, ended: true, achieved: true }).status, "done", "ended after reaching it");
eq(assess({ ...base, current: null }).status, "waiting", "no numbers yet");
eq(assess({ ...base, startDay: day(-1), points: [{ day: day(-1), value: 60_000 }], current: 60_100 }).status, "new", "just set");
const down = assess({ metric: "skip_rate", start: 35, current: 33, target: 30, direction: "down", startDay: day(-10), deadline: day(20), today: TODAY, points: Array.from({ length: 11 }, (_, i) => ({ day: day(-10 + i), value: 35 - i * 0.2 })), achieved: false, ended: false });
ok(down.status === "on_track" || down.status === "ahead", `a falling skip rate heads for its target (${down.status}, ${down.forecast})`);
ok((down.progress ?? 0) > 0.39 && (down.progress ?? 0) < 0.41, `down: 40% of the way (${down.progress})`);
const pctCap = assess({ metric: "engaged_rate", start: 90, current: 98, target: 99, direction: "up", startDay: day(-10), deadline: day(300), today: TODAY, points: Array.from({ length: 11 }, (_, i) => ({ day: day(-10 + i), value: 90 + i * 0.8 })), achieved: false, ended: false });
ok(pctCap.forecast === 100, `a percentage never forecast past 100 (${pctCap.forecast})`);

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
