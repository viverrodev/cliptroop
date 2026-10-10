// Sample data for the mock Supabase. Shapes follow what the pages select.
const TEAM = "11111111-1111-4111-8111-111111111111";
const U = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002", "aaaaaaaa-0000-4000-8000-000000000003", "aaaaaaaa-0000-4000-8000-000000000004"];
const NOW = Date.parse("2026-10-03T09:00:00Z");
const day = (n) => new Date(NOW + n * 86400000).toISOString().slice(0, 10);
const at = (n, h = 10) => new Date(NOW + n * 86400000 + (h - 9) * 3600000).toISOString();
// MOCK_USER=2, 3 or 4: signed in as Maria, Andrei or Ioana instead of Edu (the owner): not masters.
// (Set it for the screenshot scripts too: cookie.cjs reads the user from here.)
const ME = Math.max(0, Math.min(3, Number(process.env.MOCK_USER || 1) - 1));
const people = [
  { id: U[0], username: "edu", full_name: "Edu Marin", email: "edu@example.com", avatar_url: null, color: "#e8630d" },
  { id: U[1], username: "maria", full_name: "Maria Popescu", email: "maria@example.com", avatar_url: null, color: "#583ac8" },
  { id: U[2], username: "andrei", full_name: "Andrei Ionescu", email: "andrei@example.com", avatar_url: null, color: "#0b8fcb" },
  { id: U[3], username: "ioana", full_name: "Ioana Stan", email: "ioana@example.com", avatar_url: null, color: "#0f9c88" },
];
const LAYOUT = { v: 2, fill: false, sounds: true, widgets: [
  { id: "w-output", type: "output", x: 0, y: 0, w: 6, h: 2 },
  { id: "w-views", type: "views", x: 6, y: 0, w: 3, h: 3 },
  { id: "w-followers", type: "followers", x: 9, y: 0, w: 3, h: 3 },
  { id: "w-map", type: "audienceMap", x: 0, y: 2, w: 6, h: 4, settings: { view: process.env.MOCK_GLOBE ? "globe" : "map", mode: process.env.MOCK_GLOBE ? "all" : "views" } },
  { id: "w-top", type: "topVideos", x: 6, y: 3, w: 6, h: 4 },
  { id: "w-clock", type: "clock", x: 0, y: 6, w: 2, h: 2, settings: { h24: true, secondHand: true } },
  { id: "w-views2", type: "meetings", x: 2, y: 6, w: 4, h: 2 },
] };
// MOCK_LAYOUT=all: every widget once (for checking them all on phones, tablets and laptops).
const ALL_LAYOUT = { v: 2, fill: false, sounds: true, widgets: [
  { id: "w-tasks", type: "tasks", x: 0, y: 0, w: 4, h: 6 },
  { id: "w-teams", type: "teams", x: 4, y: 0, w: 2, h: 2 },
  { id: "w-clock", type: "clock", x: 6, y: 0, w: 2, h: 2, settings: { h24: true, secondHand: true } },
  { id: "w-weather", type: "weather", x: 8, y: 0, w: 2, h: 2, settings: { units: "c" } },
  { id: "w-todo", type: "todo", x: 10, y: 0, w: 2, h: 4 },
  { id: "w-cal", type: "minicalendar", x: 4, y: 2, w: 2, h: 4 },
  { id: "w-shorts", type: "upcomingShorts", x: 6, y: 2, w: 2, h: 4 },
  { id: "w-longs", type: "upcomingLongs", x: 8, y: 2, w: 2, h: 4 },
  { id: "w-views", type: "views", x: 10, y: 4, w: 2, h: 3 },
  { id: "w-contrib", type: "contributions", x: 0, y: 6, w: 6, h: 3, settings: { color: "#22c55e", scope: "all" } },
  { id: "w-meetings", type: "meetings", x: 6, y: 6, w: 2, h: 3 },
  { id: "w-posting", type: "posting", x: 8, y: 6, w: 2, h: 3 },
  { id: "w-followers", type: "followers", x: 10, y: 7, w: 2, h: 3 },
  { id: "w-pipeline", type: "pipeline", x: 0, y: 9, w: 6, h: 4 },
  { id: "w-map", type: "audienceMap", x: 6, y: 9, w: 4, h: 4, settings: { view: process.env.MOCK_GLOBE ? "globe" : "map", mode: "all" } },
  { id: "w-output", type: "output", x: 10, y: 10, w: 2, h: 2 },
  { id: "w-top", type: "topVideos", x: 0, y: 13, w: 6, h: 4 },
  { id: "w-word", type: "word", x: 6, y: 13, w: 2, h: 4 },
  { id: "w-objectives", type: "objectives", x: 8, y: 13, w: 4, h: 4 },
] };
// MOCK_LAYOUT=objectives: the Objectives widget at MOCK_OBJ_SIZE (columns x rows, default 4x3) with a few others,
// MOCK_OBJ_SHOW=week (or day, month…) shows one cadence, MOCK_OBJ_IDS=1,2 picks objectives by number.
const [OW, OH] = String(process.env.MOCK_OBJ_SIZE || "4x3").split("x").map(Number);
const OBJ_LAYOUT = { v: 2, fill: false, sounds: true, widgets: [
  { id: "w-objectives", type: "objectives", x: 0, y: 0, w: OW, h: OH, settings: { show: process.env.MOCK_OBJ_SHOW || "all", ids: String(process.env.MOCK_OBJ_IDS || "").split(",").filter(Boolean).map((n) => `0b000000-0000-4000-8000-${n.padStart(12, "0")}`) } },
  { id: "w-tasks", type: "tasks", x: Math.min(OW, 8), y: 0, w: 4, h: 5 },
  { id: "w-clock", type: "clock", x: 0, y: OH, w: 2, h: 2, settings: { h24: true, secondHand: true } },
  { id: "w-posting", type: "posting", x: 2, y: OH, w: 3, h: 3 },
] };
const prof = (i) => ({ ...people[i], palette: process.env.MOCK_PALETTE || null, currency: process.env.MOCK_CURRENCY || null, animations_enabled: true, sounds_enabled: false, dashboard_layout: process.env.MOCK_LAYOUT === "all" ? ALL_LAYOUT : process.env.MOCK_LAYOUT === "objectives" ? OBJ_LAYOUT : process.env.MOCK_LAYOUT ? LAYOUT : null, created_at: "2026-01-10T10:00:00Z", bio: null, banner_url: null, tutorial_done_at: process.env.MOCK_TOUR === "1" ? null : "2026-01-11T10:00:00Z" });
const roles = [["master"], ["scripter", "editor"], ["editor"], ["publisher", "reviewer"]];
const members = people.map((p, i) => ({
  id: `bbbbbbbb-0000-4000-8000-00000000000${i + 1}`,
  team_id: TEAM,
  user_id: p.id,
  status: "active",
  joined_at: "2026-01-12T10:00:00Z",
  created_at: "2026-01-12T10:00:00Z",
  member_roles: roles[i].map((role) => ({ role })),
  profiles: prof(i),
  profile: prof(i),
}));
const team = {
  id: TEAM,
  name: "Viverro Main",
  slug: "viverro",
  color: "#e8630d",
  logo_url: null,
  created_at: "2026-01-10T10:00:00Z",
  owner_id: U[0],
  timezone: "Europe/Bucharest",
  short_color: null,
  long_color: null,
  shorts_per_day: 2,
  tasks_visibility: process.env.MOCK_TEAM_TASKS || "own",
  team_members: members.map((m) => ({ user_id: m.user_id, status: "active" })),
};
// ---- Shorts
const mem = (i) => ({ id: members[i].id, user_id: members[i].user_id, profiles: { username: people[i].username, full_name: people[i].full_name, email: people[i].email, avatar_url: null } });
const SHORT_TITLES = ["Why cats knock things over", "3 kitchen hacks you need", "The tallest tree on Earth", "Morning routine (honest)", "Tiny house tour: 12 m²", "Street food in Cluj", "One-minute history: Dacia", "Pasta from scratch", "Rainy day ideas", "The best desk setup", "How bees talk", "Plant care basics", "Old phones vs new", "Coffee at home, 4 ways", "Why the sky is blue", "Night market in Iași"];
const stages = ["posted", "posted", "posted", "ready", "review", "editing", "editing", "editing", "script", "script", "script", "script", "script", "script", "script", "script"];
const shorts = SHORT_TITLES.map((title, i) => {
  const id = `cccccccc-0000-4000-8000-0000000000${String(i + 10).padStart(2, "0")}`;
  const stage = stages[i];
  const planned = day(i - 3 + Math.floor(i / 2));
  return {
    id, team_id: TEAM, entry_number: 231 + i, title, stage, planned_date: planned, schedule_mode: i === 6 ? "pinned" : "auto", pin_kind: i === 6 ? "oneoff" : null, queue_position: i,
    platforms: ["youtube", "instagram", "facebook", "tiktok"], file_link: stage === "script" ? null : "https://drive.google.com/x", short_type: i === 4 ? "sponsorship" : i === 9 ? "big" : "filler",
    caption_enabled: i % 3 === 0, caption: i % 3 === 0 ? "Did you know? #shorts" : null, review_note: stage === "editing" && i === 7 ? "Cut the intro by 2 seconds and add captions." : null,
    created_at: at(-20 + i), created_by: U[0], creator: { username: "edu", full_name: "Edu Marin", email: "edu@example.com", avatar_url: null },
    editor: stage === "script" && i > 11 ? null : mem(i % 2 ? 2 : 1), reviewer: mem(0), scheduler: mem(3),
    short_video_posts: stage === "posted" ? [{ platform: "youtube", post_url: "https://youtube.com/shorts/x", posted_at: at(i - 3), posted_by: U[3], poster: { username: "ioana", full_name: "Ioana Stan", email: null, avatar_url: null } }, { platform: "instagram", post_url: null, posted_at: at(i - 3), posted_by: U[3], poster: null }, { platform: "tiktok", post_url: null, posted_at: at(i - 3), posted_by: U[3], poster: null }] : [],
    short_scripters: [{ team_member_id: members[1].id }],
    short_video_versions: [{ count: stage === "script" ? 0 : 1 }],
    short_video_events: [
      { id: 900 + i * 3, kind: "stage", from_stage: "script", to_stage: "editing", platform: null, note: null, created_at: at(-6 + i * 0.2), actor_id: U[1], actor: { username: "maria", full_name: "Maria Popescu", email: null, avatar_url: null } },
      { id: 901 + i * 3, kind: "created", from_stage: null, to_stage: "script", platform: null, note: null, created_at: at(-20 + i), actor_id: U[0], actor: { username: "edu", full_name: "Edu Marin", email: null, avatar_url: null } },
    ],
    short_videos: { entry_number: 231 + i, title, team_id: TEAM },
  };
});
// ---- Objectives (0078): MOCK_OBJECTIVES=1, around the real "now" (scripts/dev-mock/objectives.cjs).
const OBJ = process.env.MOCK_OBJECTIVES ? require("./objectives.cjs").objectivesFixtures({ TEAM, U, people, members, base: shorts }) : null;
// MOCK_PROJECTIONS=1 (with MOCK_OBJECTIVES=1): long-term targets with their history (0080).
const PROJ = process.env.MOCK_PROJECTIONS ? require("./projections.cjs").projectionsFixtures({ TEAM, U }) : null;
// ---- Long videos
const LONG = [
  ["The real cost of living in Bucharest", "publish", 6, "Documentary"],
  ["We tried every bakery in Cluj", "edit", 14, "Food"],
  ["How Romania's trains work (and don't)", "script", 24, "Explainer"],
  ["Tiny houses: the full story", "research", 33, "Documentary"],
  ["A week without a phone", "ideate", null, "Challenge"],
  ["Inside a 400-year-old salt mine", "done", -9, "Travel"],
  ["Street food tour: Iași", "film", 19, "Food"],
];
const longs = LONG.map(([title, stage, d, theme], i) => ({
  id: `dddddddd-0000-4000-8000-00000000000${i + 1}`, team_id: TEAM, entry_number: 41 + i, title, stage, expected_date: d === null ? null : day(d), theme, subtheme: null, video_type: i % 2 ? ["Hub"] : ["Hero", "Help"], created_at: at(-60 + i * 5), created_by: U[0], published_at: stage === "done" ? at(-9) : null, youtube_video_id: null, description: null, project_thumbnails: [], notes: null,
}));
const titles = longs.flatMap((l, i) => [{ id: `t${i}a`, project_id: l.id, title: l.title, is_picked: true, position: 0 }, { id: `t${i}b`, project_id: l.id, title: l.title + " (alt)", is_picked: false, position: 1 }]);
const assignees = longs.flatMap((l) => [{ id: l.id + "a1", project_id: l.id, stage: "edit", team_member_id: members[2].id }, { id: l.id + "a2", project_id: l.id, stage: "script", team_member_id: members[1].id }, { id: l.id + "a3", project_id: l.id, stage: "publish", team_member_id: members[3].id }]);

// ---- Thumbnail Studio: variations for long #42 (MOCK_WINNERS=0..3 picks how many winners) and a placeholder library.
const W = Math.max(0, Math.min(3, Number(process.env.MOCK_WINNERS ?? 2)));
const packageEntries = ["Every bakery in Cluj, ranked", "I ate at 23 bakeries in one day", "Cluj's best pastry is NOT where you think", "The bakery tour that broke me", "23 bakeries, 1 winner"].map((title, i) => ({
  id: `pppppppp-0000-4000-8000-00000000000${i + 1}`, project_id: longs[1].id, title, thumbnail_storage_path: `${TEAM}/${longs[1].id}/v${i + 1}.jpg`, width: i === 3 ? 1080 : 1280, height: i === 3 ? 720 : 720, size_bytes: i === 4 ? 2_600_000 : 640_000, is_winner: i < W, position: i,
}));
const LIB = ["Building a house in 24 hours", "I tested every phone camera", "The world's longest train ride", "Why this city has no cars", "$1 vs $1,000 burger", "I survived 7 days in the desert", "Making the perfect croissant", "The truth about electric cars", "Inside the biggest ship ever", "I bought a mountain", "Speedrunning a marathon", "The strangest museum on Earth", "Cooking with a volcano", "What $10 buys in Tokyo", "We rebuilt a 1960s car", "The quietest room in the world"];
const mockupVideos = LIB.map((title, i) => ({ id: `mmmmmmmm-0000-4000-8000-0000000000${String(i + 10)}`, team_id: TEAM, title, channel: ["Atlas", "Northwind", "Pixel Lab", "Roam", "Brick & Co", "Marlo"][i % 6], thumb_path: `${TEAM}/v/lib${i}.jpg`, channel_avatar_path: `${TEAM}/c/ch${i % 6}.jpg`, views: Math.round(2e5 + ((i * 7919) % 97) * 1.3e5), published_at: at(-(i * 3 + 1)), duration_sec: 420 + i * 61, category: "Popular" }));

// ---- Scripts (0050 + 0062): Script → Review → Staging for the first short. MOCK_SENT=1: already sent to review. MOCK_DONE=1: marked done (0066).
const doc = (id, name, position, step, text) => ({
  id, team_id: TEAM, short_video_id: shorts[0].id, long_video_id: null, kind: "script", name, position, step, version: 3, updated_at: at(-1), updated_by: U[0], word_count: text ? text.split(" ").length : 0, content_text: text,
  content: { type: "doc", content: text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [] },
  editor: { username: "edu", full_name: null, email: "edu@example.com", avatar_url: null },
});
const scriptDocs = [
  doc("dd000000-0000-4000-8000-000000000001", "Script", 1, "write", "Hook: you won't believe what this street food costs. Body: three stalls, three prices. Call to action: follow for part two."),
  doc("dd000000-0000-4000-8000-000000000002", "Review", 2, "review", process.env.MOCK_SENT ? "Hook: you won't believe what this street food costs." : ""),
  doc("dd000000-0000-4000-8000-000000000003", "Staging", 3, "staging", ""),
  doc("dd000000-0000-4000-8000-000000000004", "Version 4", 4, null, ""),
];

// ---- Analytics (0058)
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const daily = [];
const countriesRows = [];
const CC = [["RO", 0.42], ["US", 0.17], ["MD", 0.08], ["GB", 0.06], ["DE", 0.055], ["IT", 0.05], ["ES", 0.035], ["FR", 0.03], ["CA", 0.02], ["AU", 0.015], ["NL", 0.012], ["HU", 0.012], ["PL", 0.01], ["BR", 0.008], ["IN", 0.008], ["JP", 0.004], ["MX", 0.004], ["ZA", 0.003]];
const LAST_DAY = OBJ ? Math.max(0, Math.round((Date.parse(OBJ.today) - NOW) / 86400000) - 1) : 0;
for (let d = OBJ ? -90 : -60; d <= LAST_DAY; d++) {
  const dd = day(d);
  const yt = Math.round(14000 + 3000 * Math.sin(d / 3.1) + 5000 * rnd() + d * -40);
  const ig = Math.round(6200 + 1500 * Math.sin(d / 4) + 2000 * rnd());
  daily.push({ team_id: TEAM, platform: "youtube", day: dd, content: "all", views: yt, watch_minutes: Math.round(yt * 0.55), avg_view_seconds: 31, likes: Math.round(yt * 0.04), comments: Math.round(yt * 0.003), shares: Math.round(yt * 0.002), saves: null, reach: null, followers_gained: Math.round(120 + 60 * rnd()), followers_lost: Math.round(20 + 10 * rnd()), followers: d === 0 ? 182400 : null, total_views: d === 0 ? 48200000 : null, total_likes: null });
  daily.push({ team_id: TEAM, platform: "youtube", day: dd, content: "shorts", views: Math.round(yt * 0.72) });
  daily.push({ team_id: TEAM, platform: "youtube", day: dd, content: "long", views: Math.round(yt * 0.28) });
  daily.push({ team_id: TEAM, platform: "instagram", day: dd, content: "all", views: ig, likes: Math.round(ig * 0.05), comments: Math.round(ig * 0.004), shares: Math.round(ig * 0.003), saves: Math.round(ig * 0.006), reach: Math.round(ig * 0.7), followers: 64000 + (d + 60) * 12, followers_gained: null, followers_lost: null, watch_minutes: null, total_views: null, total_likes: null });
  // MOCK_TT_FIRST=1: TikTok was just connected (one copy, today).
  if (!process.env.MOCK_TT_FIRST || d === 0) daily.push({ team_id: TEAM, platform: "tiktok", day: dd, content: "all", followers: 120000 + (d + 60) * 40, total_views: 9000000 + (d + 60) * 9500 + Math.round(4000 * rnd()), total_likes: 700000 + (d + 60) * 600, views: null });
  const fb = Math.round(3100 + 900 * Math.sin(d / 5) + 1200 * rnd());
  daily.push({ team_id: TEAM, platform: "facebook", day: dd, content: "all", views: d === 0 ? null : fb, engagements: d === 0 ? null : Math.round(fb * 0.06), followers_gained: d === 0 ? null : Math.round(20 + 15 * rnd()), followers_lost: d === 0 ? null : Math.round(4 + 4 * rnd()), followers: d === 0 ? 23800 : null, likes: null, comments: null, shares: null });
  if (d >= -28 && d <= -1) for (const [c, share] of CC) countriesRows.push({ team_id: TEAM, platform: "youtube", metric: "views", day: dd, country: c, value: Math.round(yt * share * (0.85 + rnd() * 0.3)), watch_minutes: Math.round(yt * share * 0.5) });
}
const IGC = [["RO", 38100], ["MD", 7200], ["IT", 4900], ["US", 3100], ["ES", 2400], ["DE", 1900]].map(([c, v]) => ({ team_id: TEAM, platform: "instagram", metric: "followers", day: day(-1), country: c, value: v }));
const contentRows = shorts.filter((x) => x.stage === "posted").flatMap((x, i) => ["youtube", "instagram", "tiktok"].map((pl, k) => ({ team_id: TEAM, platform: pl, external_id: `${pl}-${i}`, kind: "short", title: x.title, url: "https://example.com", thumbnail_url: null, published_at: at(-3 + i), duration_seconds: 45, views: Math.round(20000 + 90000 * rnd()), likes: Math.round(4000 * rnd()), comments: Math.round(300 * rnd()), shares: Math.round(400 * rnd()), saves: null, reach: null, short_id: x.id, project_id: null, short_videos: { entry_number: x.entry_number }, long_video_projects: null,
  // Per-video analytics (0079): YouTube's watch numbers, Instagram's Reels skip rate.
  ...(pl === "youtube" ? { avg_view_seconds: Math.round(24 + 14 * rnd()), avg_view_pct: Math.round((70 + 30 * rnd()) * 10) / 10, engaged_views: null, subscribers_gained: Math.round(30 + 90 * rnd()) } : pl === "instagram" ? { skip_rate: Math.round((22 + 14 * rnd()) * 10) / 10, avg_view_seconds: Math.round(8 + 6 * rnd()) } : {}) })));
contentRows.push({ team_id: TEAM, platform: "youtube", external_id: "yt-long-1", kind: "long", title: "Inside a 400-year-old salt mine", url: "https://example.com", thumbnail_url: null, published_at: at(-9), duration_seconds: 1240, views: 214000, likes: 9800, comments: 640, shares: 410, short_id: null, project_id: longs[5].id, short_videos: null, long_video_projects: { entry_number: 46 }, avg_view_seconds: 506, avg_view_pct: 42.6, subscribers_gained: 1840 });
contentRows.sort((a, b) => b.views - a.views);
// Each video's views per day (0079): YouTube's own number per day, the others' running totals per morning copy.
const contentDays = [];
// The last day with numbers (yesterday; with MOCK_OBJECTIVES, the real yesterday).
const TODAY_N = OBJ ? LAST_DAY + 1 : 0;
for (let d = 1; d <= 28; d++)
  for (const c of contentRows.filter((r) => r.platform === "youtube" && r.published_at.slice(0, 10) <= day(TODAY_N - d))) {
    const v = Math.round((c.views / 30) * (0.35 + rnd()) * (c.kind === "long" ? 1.6 : 1));
    contentDays.push({ team_id: TEAM, platform: "youtube", external_id: c.external_id, day: day(TODAY_N - d), source: "daily", views: v, watch_minutes: Math.round(v * (c.kind === "long" ? 4.1 : 0.35)), likes: Math.round(v * 0.04), comments: Math.round(v * 0.004), shares: Math.round(v * 0.003), updated_at: at(TODAY_N, 8) });
  }
for (let d = 0; d <= 6; d++)
  for (const c of contentRows.filter((r) => r.platform !== "youtube" && r.published_at.slice(0, 10) <= day(TODAY_N - d)))
    contentDays.push({ team_id: TEAM, platform: c.platform, external_id: c.external_id, day: day(TODAY_N - d), source: "total", views: Math.round(c.views * (1 - d * (0.05 + 0.04 * rnd()))), likes: Math.round(c.likes * (1 - d * 0.05)), comments: Math.round(c.comments * (1 - d * 0.04)), shares: Math.round(c.shares * (1 - d * 0.05)), updated_at: at(TODAY_N - d, 8) });
const revenue = [];
for (let d = -400; d <= -1; d++) {
  const total = Math.round((30 + 12 * Math.sin(d / 9) + 10 * rnd()) * 100) / 100;
  const ads = Math.round(total * 0.78 * 100) / 100;
  const premium = Math.round(total * 0.12 * 100) / 100;
  revenue.push({ team_id: TEAM, platform: "youtube", day: day(d), content: "all", revenue: total, ad_revenue: ads, premium_revenue: premium, gross_revenue: total * 1.4, currency: "USD" });
  revenue.push({ team_id: TEAM, platform: "youtube", day: day(d), content: "shorts", revenue: Math.round(total * 0.35 * 100) / 100, currency: "USD" });
  revenue.push({ team_id: TEAM, platform: "youtube", day: day(d), content: "long", revenue: Math.round(total * 0.65 * 100) / 100, currency: "USD" });
}
// Facebook Content Monetization earnings for the last 120 days (migration 0074);
// MOCK_FB_NO_EARNINGS=1: a Page outside the program (no rows, and the sync says so).
if (!process.env.MOCK_FB_NO_EARNINGS)
  for (let d = -120; d <= -1; d++) revenue.push({ team_id: TEAM, platform: "facebook", day: day(d), content: "all", revenue: Math.round((6 + 4 * Math.sin(d / 6) + 5 * rnd()) * 100) / 100, currency: "USD" });
const incomes = [
  { id: "eeeeeeee-0000-4000-8000-000000000001", team_id: TEAM, day: day(-5), source: "sponsorship", amount: 750, currency: "USD", note: "Brand X: street food short", short_id: null, project_id: null, short_videos: null, long_video_projects: null },
  { id: "eeeeeeee-0000-4000-8000-000000000002", team_id: TEAM, day: day(-12), source: "brand_deal", amount: 1200, currency: "USD", note: "Bakery tour long video", short_id: null, project_id: null, short_videos: null, long_video_projects: null },
  { id: "eeeeeeee-0000-4000-8000-000000000003", team_id: TEAM, day: day(-20), source: "affiliate", amount: 86.4, currency: "USD", note: null, short_id: null, project_id: null, short_videos: null, long_video_projects: null },
];
// The developer's Usage page (developer_usage(), 0075): this team and three made-up ones.
function developerUsage() {
  const MB = 1024 ** 2;
  const day0 = Date.now();
  const iso = (dAgo) => new Date(day0 - dAgo * 86400e3).toISOString();
  const teams = [
    { id: TEAM, name: team.name, createdAt: team.created_at, members: people.length, shorts: shorts.length, longs: longs.length, videoFiles: 11, videoBytes: 612 * MB, files: 184, storageBytes: 701 * MB, rows: 4120, dbBytes: 9.4 * MB, postsPublished: 41, lastActivity: iso(0.1) },
    { id: "22222222-2222-4222-8222-222222222222", name: "Cluj Food Club", createdAt: iso(40), members: 3, shorts: 22, longs: 2, videoFiles: 4, videoBytes: 188 * MB, files: 61, storageBytes: 205 * MB, rows: 1210, dbBytes: 2.1 * MB, postsPublished: 12, lastActivity: iso(1.5) },
    { id: "33333333-3333-4333-8333-333333333333", name: "Night Market Media", createdAt: iso(12), members: 2, shorts: 5, longs: 0, videoFiles: 0, videoBytes: 0, files: 7, storageBytes: 3.2 * MB, rows: 160, dbBytes: 0.3 * MB, postsPublished: 0, lastActivity: iso(9) },
    { id: "44444444-4444-4444-8444-444444444444", name: "ClipTroop Review", createdAt: iso(1), members: 1, shorts: 1, longs: 0, videoFiles: 1, videoBytes: 42 * MB, files: 2, storageBytes: 42.1 * MB, rows: 30, dbBytes: 0.05 * MB, postsPublished: 1, lastActivity: iso(0.9) },
  ];
  const peopleRows = [
    ...people.map((p, i) => ({ id: p.id, email: p.email, name: p.full_name, username: p.username, createdAt: iso(200 - i * 20), lastSignIn: iso([0.05, 1, 3, 20][i] ?? 5), teams: [team.name], videos: [0, 6, 5, 0][i] ?? 0, videoBytes: [0, 340, 272, 0][i] * MB || 0, files: [14, 52, 31, 9][i] ?? 0, fileBytes: [3, 41, 12, 2][i] * MB || 0, tasksDone: [61, 140, 97, 44][i] ?? 0 })),
    { id: "aaaaaaaa-0000-4000-8000-000000000011", email: "ana@cluj.example", name: "Ana Pop", username: "anapop", createdAt: iso(40), lastSignIn: iso(1.5), teams: ["Cluj Food Club"], videos: 4, videoBytes: 188 * MB, files: 30, fileBytes: 9 * MB, tasksDone: 38 },
    { id: "aaaaaaaa-0000-4000-8000-000000000012", email: "review@cliptroop.com", name: "Google Review", username: "googlereview", createdAt: iso(1), lastSignIn: null, teams: ["ClipTroop Review"], videos: 1, videoBytes: 42 * MB, files: 1, fileBytes: 0.1 * MB, tasksDone: 2 },
  ];
  const uploads = [];
  for (let d = 29; d >= 0; d--) if (d % 4 !== 1) uploads.push({ day: new Date(day0 - d * 86400e3).toISOString().slice(0, 10), files: 2 + ((d * 7) % 9), bytes: (20 + ((d * 37) % 90)) * MB });
  const buckets = [
    ["review-videos", 16, 842], ["package-thumbs", 120, 61], ["mockup-library", 40, 22], ["script-sketches", 38, 9], ["avatars", 9, 2.1], ["comment-attachments", 12, 6], ["script-images", 21, 4.4], ["team-logos", 4, 0.4], ["feedback", 3, 4.8],
  ].map(([id, files, mb]) => ({ id, files, bytes: mb * MB, last: iso(files % 5) }));
  const tables = [
    ["public", "analytics_daily", 3.1, 9800], ["public", "analytics_content", 2.4, 1450], ["public", "notifications", 1.9, 3100], ["auth", "audit_log_entries", 1.7, 5200], ["public", "short_video_events", 1.2, 2900], ["public", "script_versions", 1.1, 640],
    ["storage", "objects", 0.9, 263], ["public", "tasks", 0.8, 1900], ["public", "short_videos", 0.6, 30], ["public", "analytics_countries", 0.55, 2400], ["public", "social_posts", 0.4, 120], ["public", "app_errors", 0.2, 14], ["public", "status_samples", 0.18, 2100], ["auth", "users", 0.1, 6],
  ].map(([schema, name, mb, rows]) => ({ schema, name, bytes: mb * MB, rows, exact: schema === "public" }));
  return {
    at: new Date().toISOString(),
    database: { bytes: process.env.MOCK_USAGE_FULL ? 470 * MB : 38.6 * MB },
    storage: { bytes: buckets.reduce((t, b) => t + b.bytes, 0), files: buckets.reduce((t, b) => t + b.files, 0) },
    counts: { people: peopleRows.length, people7: 4, people30: 5, newPeople30: 2, teams: teams.length, shorts: 44, longs: longs.length + 2, videoFiles: 16, videoBytes: 842 * MB, videoFilesCleaned: 23, scripts: 58, postsPublished: 54, tasksDone: 382 },
    buckets, tables, uploads, teams, people: peopleRows,
  };
}

// MOCK_POSTS=1: a busy posting week around the real "now" (Posting filters, the Posting today widget).
const morePosts = [];
if (process.env.MOCK_POSTS) {
  const rel = (h) => new Date(Date.now() + h * 3600e3).toISOString();
  let n = 0;
  const post = (i, platform, status, h, extra = {}) => {
    const x = shorts[i];
    n++;
    morePosts.push({
      id: `sq000000-0000-4000-8000-${String(n).padStart(12, "0")}`, team_id: TEAM, short_id: x.id, platform, status, progress: status === "uploading" ? 40 : status === "published" ? 100 : 0,
      scheduled_at: rel(h), next_attempt_at: rel(h), last_error: null, attempts: 0, permalink: status === "published" ? `https://example.com/${platform}/${n}` : null, external_id: null,
      published_at: status === "published" ? rel(h + 0.05) : null, updated_at: rel(h), step: "start", note: null, options: {}, locked_until: null,
      short: { id: x.id, entry_number: x.entry_number, title: x.title }, short_videos: { entry_number: x.entry_number, title: x.title }, ...extra,
    });
  };
  const ALL4 = ["youtube", "instagram", "facebook", "tiktok"];
  ALL4.forEach((pl, k) => post(0, pl, "published", -50 + k * 0.5));
  ALL4.forEach((pl, k) => post(1, pl, "published", -26 + k * 0.5));
  post(2, "youtube", "published", -3);
  post(2, "instagram", "published", -2.5);
  post(2, "tiktok", "scheduled", 2);
  post(2, "facebook", "failed", -1, { attempts: 3, last_error: "Facebook takes Reels up to 1:30 and this video is 1:38." });
  post(3, "youtube", "waiting", 5, { progress: 100, external_id: "abc", permalink: "https://youtube.com/shorts/abc" });
  post(3, "instagram", "uploading", -0.1);
  post(3, "tiktok", "scheduled", 6);
  post(3, "facebook", "scheduled", 7);
  ALL4.forEach((pl, k) => post(4, pl, "scheduled", 26 + k));
  post(5, "youtube", "scheduled", -0.4);
  // Older ones, so "Published recently" has more than one page.
  for (let i = 6; i < 16; i++) ["youtube", "tiktok", i % 2 ? "instagram" : "facebook"].forEach((pl, k) => post(i, pl, "published", -24 * (i - 3) - k));
}
const syncs = ["youtube", "instagram", "tiktok", "facebook"].map((pl) => ({
  team_id: TEAM, platform: pl, last_run_at: process.env.MOCK_STALE ? new Date(Date.now() - 50 * 3600e3).toISOString() : at(0, 8), last_ok_at: at(0, 8), last_error: null, backfilled: true,
  revenue_note: pl === "facebook" && process.env.MOCK_FB_NO_EARNINGS ? "Facebook shared no earnings: the Page isn't in Content Monetization (or hasn't earned yet)." : null,
  // Whose numbers (0079). MOCK_SWITCHED=1: the Facebook Page was replaced 5 days ago.
  account_ref: pl === "facebook" ? "123456789" : "ext-" + pl,
  account_since: pl === "facebook" && process.env.MOCK_SWITCHED ? at(-5, 14) : null,
}));
// MOCK_FB_ANALYTICS_ONLY=1: a Facebook Page connected before posting (no pages_manage_posts).
const STATS = {
  youtube: ["https://www.googleapis.com/auth/yt-analytics.readonly", "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"],
  instagram: ["instagram_business_manage_insights"],
  tiktok: ["user.info.stats", "video.list"],
  facebook: ["pages_show_list", "pages_read_engagement", "read_insights", ...(process.env.MOCK_FB_ANALYTICS_ONLY ? [] : ["pages_manage_posts"])],
};

// Status history (0067): 3 days of hourly checks with a few problems in them.
const HOUR = 3600e3;
const hourAt = (k) => new Date(Math.floor(Date.now() / HOUR) * HOUR - k * HOUR).toISOString();
const PARTS = ["app", "db", "auth", "files", "timer", "analytics", "email", "vercel", "supabase", "resend"];
const BAD = {
  // part: { hoursAgo: [level, warnChecks, downChecks, detail] }
  timer: { 20: ["down", 0, 3, "Last ran 14 min ago."], 19: ["warn", 1, 0, "Last ran 4 min ago and failed."] },
  db: { 50: ["warn", 2, 0, "Answering (3120 ms)"] },
  files: { 50: ["warn", 1, 0, "Answering (2840 ms)"] },
  app: { 33: ["down", 0, 2, "Timed out."] },
  resend: { 8: ["warn", 6, 0, "Partially Degraded Service"], 7: ["warn", 3, 0, "Partially Degraded Service"] },
  ...(process.env.MOCK_STATUS_BAD ? { timer: { 0: ["down", 0, 2, "Last ran 16 min ago."], 20: ["down", 0, 3, "Last ran 14 min ago."] } } : {}),
};
const statusHistory = (b) => {
  const hours = Math.min(720, Math.max(1, Number(b.p_hours) || 72));
  const rows = [];
  for (const c of PARTS)
    for (let k = hours - 1; k >= 0; k--) {
      if (k > 60) continue; // recording started 61 hours ago
      const bad = BAD[c]?.[k];
      const samples = k === 0 ? 3 : 6;
      rows.push({ component: c, hour: hourAt(k), level: bad ? bad[0] : "ok", samples, warn: bad ? bad[1] : 0, down: bad ? bad[2] : 0, detail: bad ? bad[3] : "Answering (120 ms)" });
    }
  return rows;
};
const statusIncidents = () => {
  const out = [];
  for (const [c, hours] of Object.entries(BAD))
    for (const [k, v] of Object.entries(hours)) {
      const start = Date.parse(hourAt(Number(k))) + 10 * 60e3;
      const n = v[1] + v[2];
      const ongoing = Number(k) === 0;
      out.push({ component: c, level: v[0], started_at: new Date(start).toISOString(), last_bad_at: new Date(start + (n - 1) * 600e3).toISOString(), ended_at: ongoing ? null : new Date(start + n * 600e3).toISOString(), samples: n, detail: v[3] });
    }
  return out.sort((a, b) => b.started_at.localeCompare(a.started_at));
};

// The bell and its History (last 2 weeks): a mix of kinds over 12 days, newest first. MOCK_NOTIFS=0: none.
function sampleNotifications() {
  const H = 3_600_000;
  const actor = (i) => ({ name: people[i].full_name.split(" ")[0], avatarUrl: null });
  const team = { name: "Viverro Main", logoUrl: null, color: "#e8630d" };
  const list = [
    // MOCK_OBJECTIVES=1: the team reached an objective (1.14.0).
    ...(process.env.MOCK_OBJECTIVES
      ? [[0.1, false, "objective_reached", { team, objectiveId: "0b000000-0000-4000-8000-000000000002", objectiveTitle: "Instagram-only reels", color: "magenta", periodLabel: "This week", valueText: "3", targetText: "3", unit: "reels", winner: { kind: "short", number: 227, title: "Why the sky is blue (part 4)", people: ["maria"] }, href: "/objectives?o=0b000000-0000-4000-8000-000000000002" }], [30, true, "objective_reached", { team, objectiveId: "0b000000-0000-4000-8000-000000000001", objectiveTitle: "Shorts every week", color: "blue", periodLabel: "Week of Sep 21", valueText: "12", targetText: "10", unit: "shorts", winner: null, href: "/objectives?o=0b000000-0000-4000-8000-000000000001" }]]
      : []),
    [0.3, false, "short_review_ready", { actor: actor(2), shortNumber: 231, shortTitle: "Why cats knock things over" }],
    [2, false, "social_post", { ok: true, platform: "tiktok", shortNumber: 229, shortTitle: "Pasta from scratch" }],
    [5, true, "short_changes_requested", { actor: actor(3), shortNumber: 230, shortTitle: "Rainy day ideas", note: "Captions a bit bigger please" }],
    [26, true, "script_mention", { actor: actor(1), shortNumber: 232, shortTitle: "One-minute history: Dacia", snippet: "@edu can you check the hook?" }],
    [30, false, "social_post", { ok: false, platform: "instagram", shortNumber: 228, shortTitle: "Street food in Cluj", message: "The video is still processing on Instagram." }],
    [50, true, "short_approved", { actor: actor(3), shortNumber: 227, shortTitle: "The best desk setup" }],
    [75, true, "meeting_reminder", { meetingTitle: "Weekly planning", when: "in 1 hour", team }],
    [98, true, "short_assigned", { actor: actor(1), shortNumber: 226, shortTitle: "Tiny houses", readyToEdit: true }],
    [125, true, "social_post", { ok: true, platform: "youtube", shortNumber: 225, shortTitle: "How bees talk" }],
    [170, true, "short_review_ready", { actor: actor(2), shortNumber: 224, shortTitle: "Bakery tour" }],
    [215, true, "short_approved", { actor: actor(3), shortNumber: 223, shortTitle: "Studio vlog" }],
    [260, true, "social_post", { ok: true, platform: "instagram", shortNumber: 222, shortTitle: "Q&A" }],
    [290, true, "short_assigned", { actor: actor(1), shortNumber: 221, shortTitle: "Night market" }],
  ];
  return list.map(([hoursAgo, read, kind, metadata], i) => ({
    id: `eeeeeeee-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    recipient_id: people[ME].id,
    body: "",
    project_id: null,
    short_id: null,
    stage: null,
    is_read: read,
    created_at: new Date(Date.now() - hoursAgo * H).toISOString(),
    kind,
    metadata,
    team_invite_id: null,
    team_invites: null,
    ownership_transfer_id: null,
    ownership_transfer_requests: null,
  }));
}

module.exports = {
  TEAM,
  U,
  user: { id: U[ME], aud: "authenticated", role: "authenticated", email: people[ME].email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-10T10:00:00Z" },
  rpc: {
    can_view_revenue: true,
    // Objectives (0078): the server's count says "counted moments ago", so the mock never records wins.
    objective_claim_sync: false,
    objective_record: [],
    // The developer's Usage page (0075). MOCK_USAGE_FULL=1: the database at 94 % of the Free plan.
    developer_usage: () => developerUsage(),
    // My tasks → Team (0076): MOCK_TEAM_TASKS=team or masters shares them.
    can_see_team_tasks: !!process.env.MOCK_TEAM_TASKS,
    // The daily word (0077): how the team did today (tries only).
    daily_word_team: () => [
      { user_id: U[1], tries: 3, solved: true, finished: true },
      { user_id: U[2], tries: 6, solved: false, finished: true },
      { user_id: U[3], tries: 2, solved: false, finished: false },
    ],
    // MOCK_NO_COMMENT=1: the sample user isn't on the script (reads comments, can't add them).
    can_comment_script: !process.env.MOCK_NO_COMMENT,
    is_master_of: ME === 0,
    record_app_error: { id: "ffffffff-0000-4000-8000-000000000009", count: 1, alert: false },
    // "Ready for review / staging" (0062): Script → Review → Staging of short #231.
    script_hand_off: (b) => {
      const next = { "dd000000-0000-4000-8000-000000000001": ["dd000000-0000-4000-8000-000000000002", "Review", "review", "Script"], "dd000000-0000-4000-8000-000000000002": ["dd000000-0000-4000-8000-000000000003", "Staging", "staging", "Review"] }[b.p_script];
      return next ? { next_id: next[0], next_name: next[1], next_step: next[2], name: next[3], copied: !!b.p_copy, team: TEAM, short: shorts[0].id, long: null, recipients: [U[1]] } : null;
    },
    // "Staging done" (0066): marks it and says who to tell.
    script_finish: (b) => ({ done: b.p_done !== false, changed: true, staging_id: "dd000000-0000-4000-8000-000000000003", team: TEAM, short: shorts[0].id, long: null, recipients: b.p_done === false ? [] : [U[1], U[2]] }),
    // Reports (0068). MOCK_FEEDBACK_FAIL=1 answers like the hourly limit was hit.
    submit_feedback: () =>
      process.env.MOCK_FEEDBACK_FAIL ? { __status: 400, __body: { code: "P0001", message: "You sent 10 in the last hour. Try again a little later.", details: null, hint: null } } : "fb000000-0000-4000-8000-000000000099",
    status_history: statusHistory,
    status_incidents: statusIncidents,
    status_current: () => [
      ...PARTS.filter((c) => !(process.env.MOCK_STATUS_BAD && c === "timer")).map((c) => ({ component: c, level: "ok", at: new Date(Date.now() - 4 * 60e3).toISOString() })),
      ...(process.env.MOCK_STATUS_BAD ? [{ component: "timer", level: "down", at: new Date(Date.now() - 4 * 60e3).toISOString() }] : []),
    ],
    status_checks: {
      timer_scheduled: true,
      timer_last: { at: new Date(Date.now() - (process.env.MOCK_STATUS_BAD ? 16 * 60_000 : 60_000)).toISOString(), status: "succeeded" },
      analytics_last: new Date(Date.now() - 5 * 3600e3).toISOString(),
      analytics_failing: 0,
      posts_failed_24h: process.env.MOCK_STATUS_BAD ? 2 : 0,
      posts_published_24h: 3,
      errors_24h: process.env.MOCK_STATUS_BAD ? 4 : 0,
      error_kinds_24h: process.env.MOCK_STATUS_BAD ? 2 : 0,
      accounts_needing_reconnect: process.env.MOCK_STATUS_BAD ? 1 : 0,
    },
  },
  tables: {
    teams: [team],
    profiles: people.map((_, i) => prof(i)),
    team_members: members,
    notifications: process.env.MOCK_NOTIFS === "0" ? [] : sampleNotifications(),
    role_colors: [],
    short_videos: OBJ ? [...shorts, ...OBJ.shorts] : shorts,
    short_video_posts: shorts.flatMap((x) => x.short_video_posts.map((p) => ({ ...p, short_id: x.id, short_videos: { team_id: TEAM, entry_number: x.entry_number, title: x.title } }))).concat(OBJ ? OBJ.shortPosts : []),
    short_scripters: (OBJ ? [...shorts, ...OBJ.shorts] : shorts).map((x) => ({ short_id: x.id, team_member_id: members[1].id })),
    short_video_events: shorts.flatMap((x) => x.short_video_events.map((e) => ({ ...e, short_id: x.id, short_videos: { team_id: TEAM } }))).concat(OBJ ? OBJ.shortEvents : []),
    // MOCK_FILES=1: one uploaded video per short past Script (Team → Defaults → Video files shows the total).
    short_video_versions: process.env.MOCK_FILES
      ? shorts
          .filter((x) => x.stage !== "script")
          .map((x, i) => ({ id: `ffffffff-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, short_id: x.id, team_id: TEAM, version_number: 1, storage_path: `${TEAM}/${x.id}/v1.mp4`, file_name: "cut.mp4", size_bytes: 84_000_000 + i * 3_100_000, mime_type: "video/mp4", duration_sec: 38 + i * 12, width: 1080, height: 1920, created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(), deleted_at: null }))
          // #235 (in review) has a second cut, to compare (v2 is 1:38: too long for Facebook).
          .concat([{ id: "ffffffff-0000-4000-8000-0000000000a2", short_id: shorts[4].id, team_id: TEAM, version_number: 2, storage_path: `${TEAM}/${shorts[4].id}/v2.mp4`, file_name: "cut-v2.mp4", size_bytes: 91_000_000, mime_type: "video/mp4", duration_sec: 98, width: 1080, height: 1920, created_at: new Date(Date.now() - 1 * 86_400_000).toISOString(), deleted_at: null }])
          .sort((a, b) => b.version_number - a.version_number)
      : [],
    short_video_comments: [],
    long_video_projects: OBJ ? [...longs, ...OBJ.longs] : longs,
    project_titles: titles,
    project_assignees: assignees,
    project_comments: [],
    project_thumbnails: [],
    comment_attachments: [],
    long_video_posts: OBJ ? OBJ.longPosts : [],
    long_video_scripters: (OBJ ? [...longs, ...OBJ.longs] : longs).map((l) => ({ project_id: l.id, team_member_id: members[1].id })),
    objectives: OBJ ? OBJ.objectives : [],
    projections: PROJ ? PROJ.projections : [],
    projection_points: PROJ ? PROJ.projection_points : [],
    objective_targets: OBJ ? OBJ.targets : [],
    objective_periods: OBJ ? OBJ.periods : [],
    package_entries: packageEntries,
    scripts: scriptDocs,
    // MOCK_COMMENTS=1: comments on short #231's Script, two of them on words rewritten since.
    script_comments: process.env.MOCK_COMMENTS
      ? [
          ["cm000000-0000-4000-8000-000000000001", "comment", "three stalls, three prices", 0, "Can we show the prices on screen as they say them?", U[1], at(-2, 11)],
          ["cm000000-0000-4000-8000-000000000002", "edit_idea", "follow for part two", 0, "Freeze frame + the part two title card here", U[2], at(-1, 15)],
          ["cm000000-0000-4000-8000-000000000003", "comment", "the cheapest one tasted the best", 0, "Love this line, keep it", U[0], at(-4, 10)],
          ["cm000000-0000-4000-8000-000000000004", "edit_idea", "slow zoom on the grill", 0, "Use the B-roll from Tuesday", U[2], at(-4, 12)],
        ].map(([id, kind, quote, occurrence, body, author, created]) => ({
          id, kind, quote, occurrence, body, created_at: created, resolved_at: null, author_id: author, sketch_path: null, sketch_w: null, sketch_h: null, script_id: "dd000000-0000-4000-8000-000000000001", team_id: TEAM,
          author: { username: people[U.indexOf(author)]?.username ?? null, full_name: people[U.indexOf(author)]?.full_name ?? null, email: null, avatar_url: null },
        }))
      : [],
    script_doc_people: [{ script_id: "dd000000-0000-4000-8000-000000000002", team_member_id: members[2].id, team_id: TEAM }],
    team_script_people: [{ team_id: TEAM, step: "review", team_member_id: members[0].id }, { team_id: TEAM, step: "staging", team_member_id: members[0].id }, { team_id: TEAM, step: "staging", team_member_id: members[3].id }],
    script_handoffs: [
      ...(process.env.MOCK_SENT || process.env.MOCK_DONE ? [{ script_id: "dd000000-0000-4000-8000-000000000001", to_step: "review", created_at: at(0, -2), by: { username: "edu", full_name: null, email: "edu@example.com" } }] : []),
      ...(process.env.MOCK_DONE ? [{ script_id: "dd000000-0000-4000-8000-000000000003", to_step: "done", created_at: at(0, -1), by: { username: "edu", full_name: null, email: "edu@example.com" } }] : []),
    ],
    team_invites: [],
    mockup_videos: mockupVideos,
    social_accounts: ["youtube", "instagram", "tiktok", "facebook"].map((pl) => {
      const bad = !!process.env.MOCK_STATUS_BAD && pl === "instagram";
      return { id: "acc-" + pl, team_id: TEAM, platform: pl, display_name: pl === "facebook" ? "Viverro (Page)" : "Viverro", username: pl === "facebook" ? null : "viverro", avatar_url: null, status: bad ? "needs_reconnect" : "active", scopes: STATS[pl], connected_at: at(-30), last_error: bad ? "Instagram signed us out (the password was changed)." : null, external_id: pl === "facebook" ? "123456789" : "ext-" + pl };
    }),
    analytics_daily: daily,
    analytics_countries: [...countriesRows, ...IGC, ...[["RO", 2400], ["MD", 310], ["IT", 260], ["ES", 190], ["DE", 150], ["GB", 120], ["FR", 90], ["US", 80]].map(([country, value]) => ({ team_id: TEAM, platform: "facebook", metric: "followers", day: day(0), country, value, watch_minutes: null }))],
    analytics_content: contentRows,
    analytics_content_days: contentDays,
    analytics_syncs: syncs,
    analytics_revenue_daily: revenue,
    revenue_entries: incomes,
    revenue_access: [],
    social_posts: process.env.MOCK_STATUS_BAD
      ? [
          { id: "sp000000-0000-4000-8000-000000000001", team_id: TEAM, short_id: shorts[0].id, platform: "instagram", status: "failed", progress: 0, scheduled_at: at(0, -3), next_attempt_at: at(0, -3), last_error: "Instagram needs reconnecting.", attempts: 3, permalink: null, external_id: null, published_at: null, updated_at: new Date(Date.now() - 2 * 3600e3).toISOString(), short: { id: shorts[0].id, entry_number: shorts[0].entry_number, title: shorts[0].title } },
          // #234 (ready): TikTok scheduled for tomorrow, YouTube uploaded and waiting for its YouTube time ("Post now").
          { id: "sp000000-0000-4000-8000-000000000003", team_id: TEAM, short_id: shorts[3].id, platform: "tiktok", status: "scheduled", progress: 0, scheduled_at: new Date(Date.now() + 28 * 3600e3).toISOString(), next_attempt_at: new Date(Date.now() + 28 * 3600e3).toISOString(), last_error: null, attempts: 0, permalink: null, external_id: null, published_at: null, updated_at: at(-1), step: "start", note: null, options: { caption: "Morning routine", privacy: "PUBLIC_TO_EVERYONE" }, locked_until: null, short: { id: shorts[3].id, entry_number: shorts[3].entry_number, title: shorts[3].title } },
          { id: "sp000000-0000-4000-8000-000000000004", team_id: TEAM, short_id: shorts[3].id, platform: "youtube", status: "waiting", progress: 100, scheduled_at: new Date(Date.now() + 26 * 3600e3).toISOString(), next_attempt_at: new Date(Date.now() + 26 * 3600e3).toISOString(), last_error: null, attempts: 0, permalink: "https://youtube.com/shorts/abc", external_id: "abc", published_at: null, updated_at: at(-1), step: "check", note: "Uploaded. YouTube will publish it then.", options: { title: "Morning routine", visibility: "public", madeForKids: false }, locked_until: null, short: { id: shorts[3].id, entry_number: shorts[3].entry_number, title: shorts[3].title } },
          // #234: Facebook uploading.
          { id: "sp000000-0000-4000-8000-000000000005", team_id: TEAM, short_id: shorts[3].id, platform: "facebook", status: "uploading", progress: 40, scheduled_at: at(0, -1), next_attempt_at: new Date(Date.now() - 60e3).toISOString(), last_error: null, attempts: 0, permalink: null, external_id: "998877", published_at: null, updated_at: at(-1), step: "uploaded", note: null, options: { caption: "Morning routine" }, locked_until: null, short: { id: shorts[3].id, entry_number: shorts[3].entry_number, title: shorts[3].title } },
          { id: "sp000000-0000-4000-8000-000000000002", team_id: TEAM, short_id: shorts[1].id, platform: "youtube", status: "scheduled", progress: 0, scheduled_at: at(0, -1), next_attempt_at: new Date(Date.now() - 20 * 60e3).toISOString(), last_error: null, attempts: 0, permalink: null, external_id: null, published_at: null, updated_at: at(-1), short: { id: shorts[1].id, entry_number: shorts[1].entry_number, title: shorts[1].title } },
        ].concat(morePosts)
      : morePosts,
    team_day_limits: [],
    // The daily word: the sample user's past days (a 3-day streak before today). Today's play is made by playing.
    daily_word_plays: [1, 2, 3, 5, 6].map((d) => ({
      user_id: U[0], day: new Date(Date.now() - d * 86400e3).toISOString().slice(0, 10), puzzle: 10 - d, guesses: ["crane", "slate", "trace", "brace"].slice(0, 2 + (d % 3)), solved: d !== 5,
      finished_at: new Date(Date.now() - d * 86400e3).toISOString(), updated_at: new Date(Date.now() - d * 86400e3).toISOString(),
    })),
    meetings: [{ id: "cccccccc-0000-4000-8000-000000000001", team_id: TEAM, title: "Weekly planning", starts_at: at(1, 11), duration_min: 30, location: null, link: null, agenda: "Plan next week", notes: "", status: "scheduled", created_by: U[0] }],
    meeting_actions: [
      { id: "ca000000-0000-4000-8000-000000000001", meeting_id: "cccccccc-0000-4000-8000-000000000001", text: "Send the sponsor the draft cut", owner_id: U[0], done_at: null, created_by: U[0], team_id: TEAM, created_at: at(-1, 10), due_date: day(2), meetings: { title: "Weekly planning", starts_at: at(1, 11) } },
      { id: "ca000000-0000-4000-8000-000000000002", meeting_id: "cccccccc-0000-4000-8000-000000000001", text: "Book the bakery for filming", owner_id: U[0], done_at: at(-1, 15), created_by: U[1], team_id: TEAM, created_at: at(-2, 10), due_date: day(-1), meetings: { title: "Weekly planning", starts_at: at(1, 11) } },
    ],
    todos: [],
    tasks: [
      { id: "ta000000-0000-4000-8000-000000000001", kind: "meeting", item_id: "ca000000-0000-4000-8000-000000000001", stage: "action", state: "active", due_date: day(2), team_id: TEAM, user_id: U[0], completed_at: null },
      { id: "ta000000-0000-4000-8000-000000000002", kind: "script", item_id: "dd000000-0000-4000-8000-000000000002", stage: "review", state: "active", due_date: null, team_id: TEAM, user_id: U[0], completed_at: null },
      { id: "ta000000-0000-4000-8000-000000000003", kind: "meeting", item_id: "ca000000-0000-4000-8000-000000000002", stage: "action", state: "done", due_date: day(-1), team_id: TEAM, user_id: U[0], completed_at: at(-1, 15) },
      // Teammates' tasks (My tasks → Team, MOCK_TEAM_TASKS=team|masters).
      ...shorts.filter((x) => x.stage !== "posted").slice(0, 9).map((x, i) => ({
        id: `tb000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, kind: "short", item_id: x.id, stage: x.stage, state: i === 8 ? "waiting" : "active",
        due_date: x.planned_date, team_id: TEAM, user_id: x.stage === "editing" ? U[1 + (i % 2)] : x.stage === "ready" ? U[3] : x.stage === "review" ? U[0] : U[1 + (i % 3)], completed_at: null,
      })),
    ],
    push_subscriptions: process.env.MOCK_PUSH ? [
      { id: "fa000000-0000-4000-8000-000000000001", user_id: U[0], endpoint: "https://web.push.apple.com/mock-iphone", label: "iPhone · Safari", created_at: at(-2, 20), last_sent_at: at(0, 8) },
      { id: "fa000000-0000-4000-8000-000000000002", user_id: U[0], endpoint: "https://fcm.googleapis.com/fcm/send/mock-mac", label: "Mac · Chrome", created_at: at(-9, 11), last_sent_at: null },
    ] : [],
    feedback_reports: [
      { id: "fb000000-0000-4000-8000-000000000001", user_id: U[1], team_id: TEAM, kind: "bug", message: "When I drag a short to another day in the calendar on my phone, it jumps back and only moves the second time.\nHappens on the iPhone app, not on the laptop.", files: [{ path: `${U[1]}/a1-calendar-drag.png`, name: "calendar drag.png", type: "image/png", size: 482113 }, { path: `${U[1]}/a2-after.png`, name: "after.png", type: "image/png", size: 391020 }], context: { version: "1.9.9", copy: "production", device: "iPhone · Safari", page: "/calendar", viewport: "390×844", tz: "Europe/Bucharest" }, status: "new", created_at: new Date(Date.now() - 50 * 60e3).toISOString(), done_at: null },
      { id: "fb000000-0000-4000-8000-000000000002", user_id: U[2], team_id: TEAM, kind: "idea", message: "Could the pipeline widget show who is on each step? A small avatar would be enough.", files: [], context: { version: "1.9.9", copy: "production", device: "Windows · Chrome", page: "/dashboard", viewport: "1536×864" }, status: "new", created_at: new Date(Date.now() - 26 * 3600e3).toISOString(), done_at: null },
      { id: "fb000000-0000-4000-8000-000000000003", user_id: U[0], team_id: TEAM, kind: "bug", message: "The Log out button wrapped onto two lines on my laptop.", files: [], context: { version: "1.9.5", copy: "production", device: "Mac · Chrome", page: "/dashboard", viewport: "1024×768" }, status: "done", created_at: new Date(Date.now() - 4 * 86400e3).toISOString(), done_at: new Date(Date.now() - 3 * 86400e3).toISOString() },
    ],
    app_errors: [
      { id: "ffffffff-0000-4000-8000-000000000001", source: "server", message: "Cannot read properties of undefined (reading 'title')", route: "GET /shorts/[id] (render)", count: 3, first_seen: at(-1, 14), last_seen: at(0, 8), resolved_at: null, digest: "2894517711", stack: "TypeError: Cannot read properties of undefined (reading 'title')\n    at ShortPage (app/(dashboard)/shorts/[id]/page.tsx:212:31)\n    at renderWithHooks (react-dom.development.js:15486:18)", last_user_id: U[1] },
      { id: "ffffffff-0000-4000-8000-000000000003", source: "browser", message: "Error in input stream", route: "/videos", count: 1, first_seen: at(0, 14), last_seen: at(0, 14), resolved_at: null, digest: null, stack: null, last_user_id: U[0] },
      { id: "ffffffff-0000-4000-8000-000000000002", source: "browser", message: "ResizeObserver loop completed with undelivered notifications", route: "/dashboard", count: 1, first_seen: at(-3, 10), last_seen: at(-3, 10), resolved_at: at(-2, 9), digest: null, stack: null, last_user_id: null },
    ],
  },
  helpers: { day, at, people, members },
};
