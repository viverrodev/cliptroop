// Objectives (1.14.0): periods in the team's time zone, what each metric
// counts (first post, "only these platforms", types, one person's work, the
// platforms' daily numbers), when a target is reached, pace and streaks.
import { addDays, daysLeft, dayInZone, elapsed, isPeriodStart, localNow, periodDays, periodEnd, periodLabel, periodPhrase, periodRange, periodStart, periodTick, recentPeriods, shiftPeriod, timeLeft, upcomingPeriods } from "../modules/objectives/lib/periods";
import { cleanFilters, describe, formatAmount, nextColor, suggestTitle, unitFor, draftProblem } from "../modules/objectives/lib/metrics";
import { hitsFor } from "../modules/objectives/lib/hits";
import { contributorsOf, firstCounted, paceFor, periodResult, statsOf, streakOf } from "../modules/objectives/lib/compute";
import type { Sources, ShortSrc, LongSrc, DailyRow } from "../modules/objectives/lib/types";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ---- Periods -----------------------------------------------------------------
eq(periodStart("week", "2026-10-09"), "2026-10-05", "Friday's week starts on Monday");
eq(periodStart("week", "2026-10-11"), "2026-10-05", "Sunday is the week's last day");
eq(periodStart("week", "2026-10-12"), "2026-10-12", "Monday starts a week");
eq(periodStart("month", "2026-10-31"), "2026-10-01", "month");
eq(periodStart("quarter", "2026-11-15"), "2026-10-01", "quarter (Q4)");
eq(periodStart("quarter", "2026-03-31"), "2026-01-01", "quarter (Q1)");
eq(periodStart("year", "2026-07-04"), "2026-01-01", "year");
eq(shiftPeriod("month", "2026-01-01", -1), "2025-12-01", "month before January");
eq(shiftPeriod("quarter", "2026-01-01", -1), "2025-10-01", "quarter before Q1");
eq(shiftPeriod("month", "2026-11-01", 3), "2027-02-01", "three months on");
eq(periodEnd("month", "2028-02-01"), "2028-02-29", "a leap February");
eq(periodEnd("week", "2026-09-28"), "2026-10-04", "a week across two months");
eq(periodDays("quarter", "2026-10-01"), 92, "Q4 has 92 days");
eq(recentPeriods("week", "2026-10-09", 3), ["2026-09-21", "2026-09-28", "2026-10-05"], "the last three weeks, oldest first");
eq(upcomingPeriods("month", "2026-12-15", 2), ["2026-12-01", "2027-01-01"], "this month and the next");
ok(isPeriodStart("week", "2026-10-05") && !isPeriodStart("week", "2026-10-06") && isPeriodStart("quarter", "2026-07-01") && !isPeriodStart("quarter", "2026-08-01"), "period starts");
eq(periodLabel("week", "2026-10-05", "2026-10-09"), "This week", "label: this week");
eq(periodLabel("week", "2026-09-28", "2026-10-09"), "Last week", "label: last week");
eq(periodLabel("week", "2026-09-21", "2026-10-09"), "Week of Sep 21", "label: an older week");
eq(periodLabel("month", "2025-12-01", "2026-10-09"), "December 2025", "label: a month last year");
eq(periodLabel("quarter", "2026-04-01", "2026-10-09"), "Q2 2026", "label: an older quarter");
eq(periodLabel("day", "2026-10-08", "2026-10-09"), "Yesterday", "label: yesterday");
eq(periodRange("week", "2026-10-05"), "Oct 5 to 11", "range inside a month");
eq(periodRange("week", "2026-09-28"), "Sep 28 to Oct 4", "range across months");
eq(periodRange("quarter", "2026-10-01"), "Oct to Dec 2026", "quarter range");
// Time zones: 22:30 UTC on Sunday is already Monday in Bucharest (UTC+3 in October).
eq(dayInZone("2026-10-04T22:30:00Z", "Europe/Bucharest"), "2026-10-05", "Bucharest is ahead");
eq(dayInZone("2026-10-04T22:30:00Z", "UTC"), "2026-10-04", "UTC");
eq(dayInZone("2026-10-05T03:00:00Z", "America/Los_Angeles"), "2026-10-04", "Los Angeles is behind");
eq(localNow("Europe/Bucharest", Date.parse("2026-10-09T09:30:00Z")), { day: "2026-10-09", minutes: 12 * 60 + 30 }, "local time of day");
eq(localNow("Not/AZone", Date.parse("2026-10-09T09:30:00Z")).day, "2026-10-09", "a bad time zone falls back to UTC");
// Thursday noon: 3.5 of 7 days gone.
ok(Math.abs(elapsed("week", "2026-10-05", { day: "2026-10-08", minutes: 720 }) - 0.5) < 1e-9, "half the week gone on Thursday noon");
ok(Math.abs(elapsed("week", "2026-10-05", { day: "2026-10-08", minutes: 720 }, 1) - 2.5 / 7) < 1e-9, "a day late: judged against Wednesday noon");
eq(daysLeft("week", "2026-10-05", "2026-10-09"), 3, "Friday: Friday, Saturday, Sunday left");
eq(daysLeft("week", "2026-09-28", "2026-10-09"), 0, "an old week has no days left");
eq(addDays("2026-12-31", 1), "2027-01-01", "new year");
eq(periodTick("day", "2026-09-27"), "Sep 27", "a day's tick has its month");
eq(periodTick("quarter", "2026-07-01"), "Q3", "a quarter's tick");
eq(timeLeft("day", 1), "until midnight", "a daily goal: until midnight");
eq(timeLeft("week", 1), "last day", "a week's last day");
eq(timeLeft("month", 22), "22 days left", "days left in a month");
// Inside sentences (the bell, the phones, the celebration card).
eq(periodPhrase("This week"), "this week", "phrase: this week");
eq(periodPhrase("Yesterday"), "yesterday", "phrase: yesterday");
eq(periodPhrase("Week of Sep 21"), "for the week of Sep 21", "phrase: an older week");
eq(periodPhrase("December 2025"), "for December 2025", "phrase: a month keeps its capital");
eq(periodPhrase("Thu, Oct 8"), "on Thu, Oct 8", "phrase: a day");
eq(periodPhrase("Q2 2026"), "for Q2 2026", "phrase: a quarter");

// ---- Metrics: filters and words ------------------------------------------------
eq(cleanFilters("shorts_posted", { platforms: ["instagram", "myspace"], only: true, shortTypes: ["big", "huge"], member: "nope" }), { platforms: ["instagram"], only: true, shortTypes: ["big"] }, "unknown values dropped");
eq(cleanFilters("shorts_posted", { platforms: ["youtube", "instagram", "facebook", "tiktok"], only: true }), {}, "every platform = no filter");
eq(cleanFilters("shorts_posted", { only: true }), {}, "only, without platforms, means nothing");
eq(cleanFilters("views", { content: "shorts" }), { platforms: ["youtube"], content: "shorts" }, "views on Shorts are YouTube's");
eq(cleanFilters("views", { content: "shorts", platforms: ["tiktok"] }), { platforms: ["tiktok"] }, "TikTok doesn't split Shorts from long");
eq(cleanFilters("shorts_created", { platforms: ["tiktok"], only: true }), {}, "new shorts have no platforms");
eq(cleanFilters("longs_posted", { longTypes: ["Hero", "Hub", "Help"] }), {}, "every type = no filter");
eq(cleanFilters("shorts_edited", { member: "AAAAAAAA-0000-4000-8000-000000000001" }), { member: "aaaaaaaa-0000-4000-8000-000000000001" }, "one person's work");
ok(JSON.stringify(cleanFilters("shorts_posted", { only: true, platforms: ["tiktok"] })) === JSON.stringify(cleanFilters("shorts_posted", { platforms: ["tiktok"], only: true })), "same filters, same JSON");
eq(describe({ metric: "shorts_posted", period: "week", target: 14, filters: {} }), "Post 14 shorts every week", "sentence: shorts a week");
eq(describe({ metric: "shorts_posted", period: "week", target: 3, filters: { platforms: ["instagram"], only: true } }), "Post 3 reels only on Instagram every week", "sentence: Instagram-only reels");
eq(describe({ metric: "shorts_posted", period: "week", target: 1, filters: { platforms: ["tiktok"], only: true } }), "Post 1 short only on TikTok every week", "sentence: one TikTok-only short");
eq(describe({ metric: "longs_posted", period: "month", target: 2, filters: { platforms: ["youtube", "facebook"] } }), "Post 2 long videos on YouTube or Facebook every month", "sentence: long videos");
eq(describe({ metric: "shorts_posted", period: "month", target: 4, filters: { shortTypes: ["sponsorship"] } }), "Post 4 sponsorship shorts every month", "sentence: sponsorship shorts");
eq(describe({ metric: "views", period: "month", target: 1_000_000, filters: {} }), "Get 1M views every month", "sentence: views");
eq(describe({ metric: "shorts_edited", period: "week", target: 10, filters: { member: "aaaaaaaa-0000-4000-8000-000000000001" } }, "Maria"), "For Maria: edit 10 shorts every week", "sentence: one person's work");
eq(describe({ metric: "watch_hours", period: "month", target: 3000, filters: {} }), "Get 3,000 hours of watch time on YouTube every month", "sentence: watch time");
eq(suggestTitle({ metric: "shorts_posted", filters: { platforms: ["instagram"], only: true } }), "Instagram-only reels", "title: Instagram-only reels");
eq(suggestTitle({ metric: "shorts_posted", filters: { platforms: ["tiktok"], only: true } }), "TikTok-only shorts", "title: TikTok-only shorts");
eq(suggestTitle({ metric: "shorts_posted", filters: {} }), "Shorts", "title: shorts");
eq(suggestTitle({ metric: "views", filters: { platforms: ["youtube"] } }), "YouTube views", "title: YouTube views");
eq(suggestTitle({ metric: "shorts_edited", filters: { member: "aaaaaaaa-0000-4000-8000-000000000001" } }, "Maria"), "Shorts edited by Maria", "title: by a person");
eq([formatAmount("views", 1_000_000), formatAmount("views", 12_345), formatAmount("shorts_posted", 1500), formatAmount("views", 250_000), formatAmount("watch_hours", 12.34)], ["1M", "12.3K", "1,500", "250K", "12.3"], "amounts");
eq([unitFor("shorts_posted", 3, { platforms: ["instagram"], only: true }), unitFor("shorts_posted", 1), unitFor("views", 2), unitFor("followers", 5), unitFor("watch_hours", 1)], ["reels", "short", "views", "followers", "hour"], "units");
eq(nextColor(["blue", "orange"]), "aqua", "the next free colour");
ok(draftProblem({ title: " ", metric: "views", period: "week", target: 5, color: "blue" }) !== null && draftProblem({ title: "Views", metric: "views", period: "week", target: 0, color: "blue" }) !== null && draftProblem({ title: "Views", metric: "views", period: "week", target: 5, color: "blue" }) === null, "drafts are checked");

// ---- Hits: what gets counted -----------------------------------------------------
const M = { ana: "bbbbbbbb-0000-4000-8000-000000000001", radu: "bbbbbbbb-0000-4000-8000-000000000002", ioana: "bbbbbbbb-0000-4000-8000-000000000003" };
const short = (id: string, platforms: ShortSrc["platforms"], extra: Partial<ShortSrc> = {}): ShortSrc => ({ id, number: Number(id.slice(-2)), title: `Short ${id}`, platforms, type: "filler", createdAt: "2026-09-01T10:00:00Z", createdBy: "user-ana", scripters: [M.ana], editor: M.radu, reviewer: null, scheduler: M.ioana, ...extra });
const long = (id: string, extra: Partial<LongSrc> = {}): LongSrc => ({ id, number: 40, title: `Long ${id}`, platforms: ["youtube"], types: ["Hub"], stage: "publish", createdAt: "2026-10-06T08:00:00Z", createdBy: "user-radu", filmedAt: null, filmedBy: null, editedAt: null, editedBy: null, postedAt: null, assignees: [{ stage: "film", member: M.ioana }], scripters: [M.ana], ...extra });
const daily: DailyRow[] = [
  // TikTok only shares totals: what happened on a day = the next copy minus that day's.
  { platform: "tiktok", day: "2026-10-05", content: "all", total_views: 1000, total_likes: 100, followers: 500 },
  { platform: "tiktok", day: "2026-10-06", content: "all", total_views: 1500, total_likes: 130, followers: 520 },
  { platform: "tiktok", day: "2026-10-07", content: "all", total_views: 1600, total_likes: 120, followers: 515 },
  { platform: "youtube", day: "2026-10-05", content: "all", views: 2000, likes: 80, watch_minutes: 600, followers_gained: 10, followers_lost: 3 },
  { platform: "youtube", day: "2026-10-05", content: "shorts", views: 1500 },
  { platform: "youtube", day: "2026-10-06", content: "all", views: 1000, likes: 40, watch_minutes: 300, followers_gained: 4, followers_lost: 6 },
];
const src: Sources = {
  tz: "Europe/Bucharest",
  shorts: new Map([
    ["s01", short("s01", ["instagram"])],
    ["s02", short("s02", ["youtube", "instagram", "facebook", "tiktok"])],
    ["s03", short("s03", ["tiktok"])],
    ["s04", short("s04", ["youtube", "tiktok"], { type: "sponsorship", editor: M.ana })],
    ["s05", short("s05", ["youtube"], { createdAt: "2026-10-06T09:00:00Z" })],
  ]),
  shortPosts: new Map([
    ["s01", [{ platform: "instagram", at: "2026-10-06T15:00:00Z" }]],
    // Sunday 22:30 UTC = Monday in Bucharest: this week.
    ["s02", [{ platform: "youtube", at: "2026-10-04T22:30:00Z" }, { platform: "instagram", at: "2026-10-05T10:05:00Z" }, { platform: "tiktok", at: "2026-10-07T18:00:00Z" }]],
    ["s03", [{ platform: "tiktok", at: "2026-10-01T18:00:00Z" }]],
    // First out last week (YouTube), TikTok this week.
    ["s04", [{ platform: "youtube", at: "2026-10-03T12:00:00Z" }, { platform: "tiktok", at: "2026-10-08T12:00:00Z" }]],
  ]),
  shortStages: new Map([
    ["s02", [{ stage: "review", at: "2026-10-02T10:00:00Z" }, { stage: "review", at: "2026-10-06T10:00:00Z" }, { stage: "ready", at: "2026-10-06T11:00:00Z" }]],
    ["s05", [{ stage: "review", at: "2026-10-07T10:00:00Z" }]],
  ]),
  longs: new Map([
    ["l01", long("l01", { filmedAt: "2026-10-07T12:00:00Z", filmedBy: "user-ioana" })],
    ["l02", long("l02", { stage: "done", postedAt: "2026-10-06T19:00:00Z", createdAt: "2026-08-01T10:00:00Z", types: ["Hero"] })],
  ]),
  longPosts: new Map([["l01", [{ platform: "youtube", at: "2026-10-08T17:00:00Z" }]]]),
  daily,
  userMember: new Map([["user-ana", M.ana], ["user-radu", M.radu], ["user-ioana", M.ioana]]),
};
const W = ["2026-10-05", "2026-10-11"] as const;
const keys = (metric: string, filters = {}) => hitsFor({ metric, filters }, src, W[0], W[1]).map((h) => h.key);
eq(keys("shorts_posted"), ["s02", "s01"], "shorts posted this week: first time out (s02 Monday in Bucharest, s04 was out last week)");
eq(keys("shorts_posted", { platforms: ["instagram"], only: true }), ["s01"], "Instagram-only: only the short that goes nowhere else");
eq(keys("shorts_posted", { platforms: ["tiktok"] }), ["s02", "s04"], "on TikTok: its first TikTok post this week");
eq(keys("shorts_posted", { platforms: ["tiktok"], only: true }), [], "TikTok-only: s03 went out last week");
eq(keys("shorts_posted", { shortTypes: ["sponsorship"], platforms: ["tiktok"] }), ["s04"], "sponsorship shorts on TikTok");
eq(keys("shorts_posted", { member: M.ana }), ["s02", "s01"], "Ana wrote both");
eq(keys("shorts_posted", { member: "bbbbbbbb-0000-4000-8000-0000000000ff" }), [], "someone who didn't work on them");
eq(keys("posts_published", { platforms: ["instagram", "tiktok"] }).sort(), ["s01:instagram", "s02:instagram", "s02:tiktok", "s04:tiktok"], "posts: each platform counts");
eq(keys("posts_published", { content: "long" }), ["l01:youtube"], "posts of long videos only");
eq(keys("shorts_created"), ["s05"], "new shorts this week");
eq(keys("shorts_edited"), ["s05"], "edited: the first time it reached review (s02 was in review last week)");
eq(keys("shorts_approved"), ["s02"], "approved: first time ready");
eq(keys("longs_filmed"), ["l01"], "filmed");
eq(keys("longs_created"), ["l01"], "a long video idea this week");
eq(keys("longs_posted"), ["l02", "l01"], "long videos posted (one marked Posted before per-platform ticks)");
eq(keys("longs_posted", { longTypes: ["Hero"] }), ["l02"], "Hero long videos");
eq(keys("longs_posted", { platforms: ["youtube"] }), ["l01"], "a platform filter needs the platform's tick");
const views = hitsFor({ metric: "views", filters: {} }, src, W[0], W[1]);
eq(views.reduce((s, h) => s + h.value, 0), 2000 + 1000 + 500 + 100, "views: YouTube days + TikTok's differences");
eq(hitsFor({ metric: "views", filters: { content: "shorts", platforms: ["youtube"] } }, src, W[0], W[1]).map((h) => h.value), [1500], "views on Shorts");
eq(hitsFor({ metric: "likes", filters: { platforms: ["tiktok"] } }, src, W[0], W[1]).map((h) => h.value), [30], "TikTok likes never go below nothing");
eq(hitsFor({ metric: "followers", filters: {} }, src, W[0], W[1]).map((h) => `${h.platform}:${h.value}`).sort(), ["tiktok:-5", "tiktok:20", "youtube:-2", "youtube:7"], "followers: gained minus lost, or the change in the total");
eq(hitsFor({ metric: "watch_hours", filters: {} }, src, W[0], W[1]).map((h) => h.value), [10, 5], "watch hours");
eq(hitsFor({ metric: "made_up", filters: {} }, src, W[0], W[1]), [], "an unknown metric counts nothing");

// ---- Compute: reaching it, pace, streaks, who helped -----------------------------
const posted = hitsFor({ metric: "shorts_posted", filters: {} }, src, W[0], W[1]);
const r2 = periodResult(posted, W[0], W[1], 2);
ok(r2.reached && r2.value === 2 && r2.winner?.key === "s01" && r2.reachedAt === "2026-10-06T15:00:00Z", "reached at the second short");
const r3 = periodResult(posted, W[0], W[1], 3);
ok(!r3.reached && r3.winner === null && r3.reachedAt === null, "2 of 3: not reached");
const off = periodResult(posted, W[0], W[1], 0);
ok(!off.reached, "off (target 0) is never reached");
const fol = periodResult(hitsFor({ metric: "followers", filters: {} }, src, W[0], W[1]), W[0], W[1], 21);
ok(!fol.reached && fol.value === 20, "followers dipping back under after crossing: not reached");
const at = (day: string, minutes = 720) => ({ day, minutes });
eq(paceFor("week", { start: W[0], end: W[1], target: 14, value: 0 }, at("2026-10-05", 60)).status, "on_track", "Monday 1am with nothing yet: on track");
eq(paceFor("week", { start: W[0], end: W[1], target: 14, value: 2 }, at("2026-10-08")).status, "behind", "2 of 14 on Thursday: behind");
eq(paceFor("week", { start: W[0], end: W[1], target: 14, value: 7 }, at("2026-10-08")).status, "on_track", "7 of 14 halfway: on track");
eq(paceFor("week", { start: W[0], end: W[1], target: 14, value: 11 }, at("2026-10-08")).status, "ahead", "11 of 14 halfway: ahead");
eq(paceFor("week", { start: W[0], end: W[1], target: 14, value: 14 }, at("2026-10-08")).status, "reached", "reached");
eq(paceFor("week", { start: "2026-09-28", end: "2026-10-04", target: 14, value: 9 }, at("2026-10-08")).status, "missed", "last week, short of it: missed");
eq(paceFor("week", { start: W[0], end: W[1], target: 0, value: 3 }, at("2026-10-08")).status, "off", "off this week");
eq(paceFor("week", { start: "2026-10-12", end: "2026-10-18", target: 5, value: 0 }, at("2026-10-08")).status, "upcoming", "next week hasn't started");
const p = paceFor("week", { start: W[0], end: W[1], target: 14, value: 8 }, at("2026-10-09", 0));
ok(p.daysLeft === 3 && Math.abs((p.perDay ?? 0) - 2) < 1e-9 && p.forecast === 14, `Friday 00:00, 8 of 14: 2 a day for 3 days, on course for 14 (${JSON.stringify(p)})`);
const R = (target: number, value: number) => ({ target, value });
eq(streakOf([R(5, 5), R(5, 6), R(5, 2), R(5, 5), R(5, 7), R(5, 1)]), 2, "two in a row; the running week doesn't break it");
eq(streakOf([R(5, 5), R(0, 0), R(5, 5), R(5, 5)]), 3, "an off week neither breaks nor counts; the current one counts once reached");
eq(streakOf([R(5, 1), R(5, 5)]), 1, "just this one");
eq(streakOf([]), 0, "nothing yet");
const who = contributorsOf(posted);
ok(who[0].memberId === M.ana && who[0].count === 2 && who.find((c) => c.memberId === M.radu)?.roles.includes("edit") === true, "who helped: Ana wrote both, Radu edited");

// ---- Periods before a goal was set (1.15.0): shown, never judged ---------------
eq(firstCounted("quarter", "2026-10-08", "2026-10-01"), "2026-10-01", "a goal set Oct 8 counts the whole quarter it was set in");
eq(firstCounted("week", "2026-10-07", "2026-10-05"), "2026-10-05", "set on a Wednesday: that week counts");
eq(firstCounted("month", "2026-11-02", "2026-10-01"), "2026-10-01", "a creation date in the future never hides the current period");
const S = (target: number, value: number) => ({ target, value, reached: target > 0 && value >= target });
eq(statsOf([S(12, 3)]), { streak: 0, best: 3, reached: 0, counted: 0, average: null }, "a brand new goal: nothing missed, no average yet");
eq(statsOf([S(12, 12)]), { streak: 1, best: 12, reached: 1, counted: 1, average: null }, "a brand new goal reached already");
eq(statsOf([S(5, 6), S(5, 2), S(5, 5), S(5, 1)]), { streak: 1, best: 6, reached: 2, counted: 3, average: 4.3 }, "since it was set: 2 of 3 finished reached, the running one not yet");
eq(statsOf([]), { streak: 0, best: 0, reached: 0, counted: 0, average: null }, "no periods");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
