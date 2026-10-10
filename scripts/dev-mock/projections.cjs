// Projections sample data (MOCK_PROJECTIONS=1, migration 0080): eight
// long-term targets around the REAL "now" (like the objectives sample): five
// running (ahead, on track, behind, a falling skip rate, money), one reached,
// one that ended short and one archived, each with a value per day since it
// was set and the key numbers kept the day it was set (for Compare).
// Use with MOCK_OBJECTIVES=1, so the copied numbers reach today.
const TZ = "Europe/Bucharest";
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

let seed = 5;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function projectionsFixtures({ TEAM, U }) {
  const id = (n) => `5a000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const baseline = (at, k = 0.8) => ({
    at: `${at}T09:00:00Z`,
    values: {
      followers: Math.round(392_000 * k + 40_000),
      followers_net: Math.round(5200 * k),
      total_views: Math.round(48_000_000 * (0.9 + k * 0.1)),
      views: Math.round(560_000 * k),
      views_per_day: Math.round(20_000 * k),
      watch_hours: Math.round(5600 * k),
      avg_view_duration: 29,
      avg_view_pct: 38.4,
      engaged_rate: 61.2,
      engagement_rate: 4.1,
      like_rate: 3.7,
      followers_per_1k: 8.1,
      videos_posted: 31,
      avg_views_per_video: Math.round(41_000 * k),
      median_views_per_video: Math.round(18_000 * k),
      skip_rate: 34.5,
      shorts_per_week: 9.5,
      longs_per_month: 1.7,
      revenue: 1420,
      rpm: 2.3,
    },
    followers: { youtube: Math.round(168_000 * (0.9 + k * 0.1)), instagram: 61_800, tiktok: 119_000, facebook: 23_100 },
  });
  const rows = [];
  const points = [];
  const add = (n, p, series) => {
    rows.push({
      id: id(n),
      team_id: TEAM,
      title: p.title,
      metric: p.metric,
      scope: p.scope ?? {},
      target: p.target,
      direction: p.direction ?? "up",
      start_day: p.start,
      deadline: p.deadline,
      start_value: p.startValue,
      baseline: baseline(p.start, p.k ?? 0.85),
      color: p.color,
      note: p.note ?? null,
      position: n,
      created_by: U[0],
      created_at: `${p.start}T09:00:00Z`,
      achieved_at: p.achievedAt ?? null,
      achieved_value: p.achievedValue ?? null,
      ended_at: p.endedAt ?? null,
      ended_value: p.endedValue ?? null,
      archived_at: p.archivedAt ?? null,
      money: /^(revenue|rpm)/.test(p.metric),
    });
    const last = p.endedAt ? p.deadline : addDays(today, -1);
    for (let d = p.start, i = 0; d <= last; d = addDays(d, 1), i++) points.push({ projection_id: id(n), team_id: TEAM, day: d, value: Math.round(series(i) * 100) / 100 });
  };
  // Running: ahead.
  add(1, { title: "YouTube subscribers", metric: "followers", scope: { platforms: ["youtube"] }, target: 200_000, start: addDays(today, -46), deadline: addDays(today, 60), startValue: 168_200, color: "red", note: "Two long videos a month and a daily short: the plan from the September meeting." }, (i) => 168_200 + i * 310 + 600 * Math.sin(i / 4) * rnd());
  // Running: on track (views a day; numbers copied every morning).
  add(2, { title: "Views a day", metric: "views_per_day", scope: { window: 28 }, target: 34_000, start: addDays(today, -30), deadline: addDays(today, 95), startValue: 20_400, color: "blue" }, (i) => 20_400 + i * 70 + 900 * (rnd() - 0.5));
  // Running: falling skip rate (down is good).
  add(3, { title: "Reels skip rate", metric: "skip_rate", scope: { window: 28 }, target: 22, direction: "down", start: addDays(today, -24), deadline: addDays(today, 66), startValue: 34.5, color: "teal" }, (i) => 34.5 - i * 0.12 + 1.2 * (rnd() - 0.5));
  // Running: behind.
  add(4, { title: "% viewed on long videos", metric: "avg_pct_per_video", scope: { content: "long", window: 90 }, target: 52, start: addDays(today, -38), deadline: addDays(today, 52), startValue: 40.5, color: "purple" }, (i) => 40.5 + i * 0.05 + 0.6 * (rnd() - 0.5));
  add(5, { title: "Shorts a week", metric: "shorts_per_week", scope: { window: 28 }, target: 16, start: addDays(today, -12), deadline: addDays(today, 78), startValue: 9.5, color: "orange" }, (i) => 9.5 + i * 0.12);
  // Money (only for people who see revenue).
  add(6, { title: "Revenue, 28 days", metric: "revenue", scope: { window: 28 }, target: 2600, start: addDays(today, -20), deadline: addDays(today, 100), startValue: 1420, color: "green" }, (i) => 1420 + i * 9 + 60 * (rnd() - 0.5));
  // Reached 9 days ago.
  add(7, { title: "Instagram followers", metric: "followers", scope: { platforms: ["instagram"] }, target: 63_500, start: addDays(today, -70), deadline: addDays(today, 20), startValue: 61_800, color: "magenta", achievedAt: `${addDays(today, -9)}T06:10:00Z`, achievedValue: 63_540 }, (i) => 61_800 + i * 32);
  // Ended short.
  add(8, { title: "Summer views push", metric: "views", scope: { window: 28 }, target: 900_000, start: addDays(today, -130), deadline: addDays(today, -40), startValue: 610_000, color: "yellow", endedAt: `${addDays(today, -39)}T06:00:00Z`, endedValue: 812_400 }, (i) => 610_000 + i * 2240 + 9000 * (rnd() - 0.5));
  return { today, projections: rows, projection_points: points };
}

module.exports = { projectionsFixtures };
