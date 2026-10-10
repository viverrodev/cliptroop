// Objectives sample data (MOCK_OBJECTIVES=1, migration 0078): 12 weeks of
// shorts going out (on all four platforms, Instagram-only and TikTok-only),
// a year of long videos, eight objectives (one paused), two changed weeks and
// the wins the server would have recorded. Unlike the rest of the fixtures,
// all of it sits around the REAL "now", in the sample team's time zone, so
// "This week" on the page is this week. MOCK_CHEER=1: the wins of the last
// two days haven't been seen yet (the "While you were away" card shows).
const TZ = "Europe/Bucharest";

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const monthOf = (d) => `${d.slice(0, 7)}-01`;
const addMonths = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
};
function localDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
/** Minutes the team's zone is ahead of UTC at that moment. */
function offsetMin(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / 60_000);
}
/** A wall-clock time on a local day in the team's zone, as an ISO time. */
function localIso(day, hour, minute = 0) {
  const guess = Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  return new Date(guess - offsetMin(guess) * 60_000).toISOString();
}

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function shuffle(xs) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

const STEMS = [
  "Why cats knock things over", "3 kitchen hacks you need", "Tiny house tour", "Street food in Cluj", "One-minute history: Dacia", "Pasta from scratch",
  "Rainy day ideas", "The best desk setup", "How bees talk", "Plant care basics", "Old phones vs new", "Coffee at home, 4 ways", "Why the sky is blue",
  "Night market in Iași", "The 5 euro lunch", "Bread that never fails", "A day on a fishing boat", "The oldest bridge in Sibiu", "Budget camping gear",
  "How trams got to Timișoara", "The perfect omelette", "Thrift store finds", "Learning to juggle in a week", "The loudest bird in Romania", "Cheap vs pricey headphones",
  "Making soap at home", "A walk through Brașov", "The tiniest café in town", "Packing for 10 days in one bag", "Sunrise at the Black Sea", "Fixing a bike in 60 seconds",
  "What a beekeeper eats", "The strangest fruit at the market", "Sourdough, day one", "Folding a fitted sheet", "The village with one shop",
];
const LONG_TITLES = [
  "A year in the Carpathians", "The last shepherds of Maramureș", "Inside Romania's biggest market", "We built a cabin in 30 days", "The Danube Delta by boat",
  "Living on 500 lei a month", "The truth about Romanian wine", "Every castle in Transylvania", "How a newspaper gets made", "One week, four seasons",
  "The bakery that never closes", "Bucharest after midnight", "Restoring a 1970s Dacia", "The salt mines, part two", "Following a letter across the country",
];

/**
 * The tables. `base` are the other fixtures' shorts (the three already
 * posted count too, like they would on the real page).
 */
function objectivesFixtures({ TEAM, U, people, members, base }) {
  seed = 7; // the fixtures are read again on every request: the same sample every time
  const now = Date.now();
  const today = localDay(now);
  const week0 = mondayOf(today);
  const month0 = monthOf(today);
  const mem = (i) => ({ id: members[i].id, user_id: members[i].user_id, profiles: { username: people[i].username, full_name: people[i].full_name, email: people[i].email, avatar_url: null } });
  const actor = (i) => ({ username: people[i].username, full_name: people[i].full_name, email: null, avatar_url: null });
  const ALL4 = ["youtube", "instagram", "facebook", "tiktok"];

  // ---- Shorts: [how many went out, of them Instagram-only, TikTok-only], oldest week first; the last is this week so far.
  const WEEKS = [[9, 2, 3], [11, 3, 4], [12, 3, 5], [8, 2, 3], [10, 3, 4], [13, 4, 4], [11, 3, 4], [7, 1, 2], [10, 3, 4], [12, 3, 5], [11, 4, 3], [8, 3, 1]];
  const plan = [];
  WEEKS.forEach(([total, ig, tt], i) => {
    const start = addDays(week0, -7 * (WEEKS.length - 1 - i));
    const days = [];
    for (let d = 0; d < 7; d++) if (addDays(start, d) < today) days.push(addDays(start, d));
    if (!days.length) return;
    const kinds = shuffle([...Array(ig).fill("ig"), ...Array(tt).fill("tt"), ...Array(Math.max(0, total - ig - tt)).fill("all")]);
    kinds.forEach((kind, k) => {
      const day = days[Math.floor((k * days.length) / kinds.length)];
      const slot = kinds.slice(0, k).filter((_, j) => days[Math.floor((j * days.length) / kinds.length)] === day).length;
      plan.push({ kind, day, hour: [10, 14, 18, 20][slot % 4], minute: Math.floor(rnd() * 50) });
    });
  });
  // Two more in review / ready now (edited this week, not out yet).
  const extra = [
    { kind: "all", stage: "review", movedDay: addDays(today, -2) },
    { kind: "ig", stage: "ready", movedDay: addDays(today, -1) },
  ];
  const count = plan.length + extra.length;
  const shorts = [];
  const shortPosts = [];
  const shortEvents = [];
  let ev = 50_000;
  const makeShort = (n, p, stage) => {
    const id = `c0b00000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`;
    const number = 231 - count + n;
    const title = STEMS[n % STEMS.length] + (n >= STEMS.length ? ` (part ${Math.floor(n / STEMS.length) + 1})` : "");
    const platforms = p.kind === "ig" ? ["instagram"] : p.kind === "tt" ? ["tiktok"] : n % 7 === 3 ? ["youtube", "tiktok"] : ALL4;
    const ed = n % 3 === 1 ? 2 : 1; // Maria edits two of every three
    const day = p.day ?? addDays(p.movedDay, 3);
    const posts = stage === "posted" ? platforms.map((platform, k) => ({ platform, post_url: null, posted_at: localIso(day, p.hour, Math.min(59, p.minute + k * 4)), posted_by: U[3], poster: null })) : [];
    const events = [
      { id: ev++, kind: "stage", from_stage: "editing", to_stage: "review", platform: null, note: null, created_at: localIso(stage === "posted" ? addDays(day, -2) : p.movedDay, 16), actor_id: members[ed].user_id, actor: actor(ed) },
      ...(stage !== "review" ? [{ id: ev++, kind: "stage", from_stage: "review", to_stage: "ready", platform: null, note: null, created_at: localIso(stage === "posted" ? addDays(day, -1) : p.movedDay, 18), actor_id: U[0], actor: actor(0) }] : []),
      ...(stage === "posted" ? [{ id: ev++, kind: "stage", from_stage: "ready", to_stage: "posted", platform: null, note: null, created_at: posts[0].posted_at, actor_id: U[3], actor: actor(3) }] : []),
    ];
    const row = {
      id, team_id: TEAM, entry_number: number, title, stage, planned_date: day, schedule_mode: "auto", pin_kind: null, queue_position: null,
      platforms, file_link: "https://drive.google.com/x", short_type: n % 11 === 5 ? "sponsorship" : n % 4 === 0 ? "big" : "filler",
      caption_enabled: false, caption: null, review_note: null,
      created_at: localIso(addDays(day, -8), 11), created_by: U[0], creator: { username: "edu", full_name: "Edu Marin", email: "edu@example.com", avatar_url: null },
      editor_member_id: members[ed].id, reviewer_member_id: members[0].id, scheduler_member_id: members[3].id,
      editor: mem(ed), reviewer: mem(0), scheduler: mem(3),
      short_video_posts: posts, short_scripters: [{ team_member_id: members[1].id }], short_video_versions: [{ count: 1 }], short_video_events: events,
      short_videos: { entry_number: number, title, team_id: TEAM },
    };
    shorts.push(row);
    for (const x of posts) shortPosts.push({ ...x, short_id: id, short_videos: { team_id: TEAM, entry_number: number, title } });
    for (const e of events) shortEvents.push({ ...e, short_id: id, short_videos: { team_id: TEAM } });
  };
  plan.forEach((p, n) => makeShort(n, p, "posted"));
  extra.forEach((p, k) => makeShort(plan.length + k, p, p.stage));

  // ---- Long videos: how many went out each month, oldest first; the last is this month so far.
  const MONTHS = [2, 3, 3, 2, 4, 3, 2, 4, 3, 4, 5, 1];
  const longs = [];
  const longPosts = [];
  let ln = 0;
  MONTHS.forEach((k, i) => {
    const start = addMonths(month0, -(MONTHS.length - 1 - i));
    for (let j = 0; j < k; j++) {
      const day = addDays(start, 2 + Math.floor((j * 26) / k));
      if (day >= today) continue;
      ln++;
      const id = `d0b00000-0000-4000-8000-${String(ln).padStart(12, "0")}`;
      const at = localIso(day, 17, 0);
      const title = LONG_TITLES[(ln - 1) % LONG_TITLES.length] + (ln > LONG_TITLES.length ? ` (part ${Math.floor((ln - 1) / LONG_TITLES.length) + 1})` : "");
      longs.push({
        id, team_id: TEAM, entry_number: 4 + ln, title, stage: "done", expected_date: day, theme: ["Documentary", "Travel", "Food"][ln % 3], subtheme: null, video_type: ln % 2 ? ["Hub"] : ["Hero"],
        platforms: ["youtube", "facebook"], created_at: localIso(addDays(day, -45), 10), created_by: U[0], published_at: at, posted_at: at,
        filmed_at: localIso(addDays(day, -20), 15), filmed_by: U[0], edited_at: localIso(addDays(day, -5), 19), edited_by: U[2],
        youtube_video_id: null, description: null, project_thumbnails: [], notes: null,
        project_assignees: [{ stage: "script", team_member_id: members[1].id }, { stage: "edit", team_member_id: members[2].id }, { stage: "publish", team_member_id: members[3].id }],
        long_video_scripters: [{ team_member_id: members[1].id }],
      });
      longPosts.push({ project_id: id, platform: "youtube", posted_at: at, posted_by: U[3], long_video_projects: { team_id: TEAM } }, { project_id: id, platform: "facebook", posted_at: localIso(day, 17, 20), posted_by: U[3], long_video_projects: { team_id: TEAM } });
    }
  });

  // ---- The objectives (position order) and their changed weeks.
  const O = (n) => `0b000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const made = localIso(addDays(week0, -7 * 14), 10);
  const objectives = [
    { id: O(1), title: "Shorts every week", metric: "shorts_posted", period: "week", target: 10, filters: {}, color: "blue" },
    { id: O(2), title: "Instagram-only reels", metric: "shorts_posted", period: "week", target: 3, filters: { platforms: ["instagram"], only: true }, color: "magenta" },
    { id: O(3), title: "TikTok-only shorts", metric: "shorts_posted", period: "week", target: 4, filters: { platforms: ["tiktok"], only: true }, color: "aqua" },
    // Set later than the others: the months / weeks before show as "Before this goal" (1.15.0).
    { id: O(4), title: "Long videos", metric: "longs_posted", period: "month", target: 3, filters: {}, color: "orange", created_at: localIso(addDays(today, -40), 10) },
    { id: O(5), title: "YouTube views", metric: "views", period: "week", target: 100000, filters: { platforms: ["youtube"] }, color: "violet", created_at: localIso(addDays(today, -17), 10) },
    { id: O(6), title: "Shorts edited by Maria", metric: "shorts_edited", period: "week", target: 6, filters: { member: members[1].id }, color: "green" },
    { id: O(7), title: "Two shorts a day", metric: "shorts_posted", period: "day", target: 2, filters: {}, color: "yellow" },
    { id: O(8), title: "New followers", metric: "followers", period: "week", target: 2500, filters: {}, color: "red", paused_at: localIso(addDays(today, -10), 12) },
  ].map((o, i) => ({ team_id: TEAM, position: i + 1, paused_at: null, created_by: U[0], created_at: made, updated_at: made, ...o }));
  const targets = [
    { objective_id: O(1), period_start: week0, team_id: TEAM, target: 12, updated_by: U[0], updated_at: localIso(addDays(week0, -2), 9) },
    { objective_id: O(3), period_start: addDays(week0, 7), team_id: TEAM, target: 0, updated_by: U[0], updated_at: localIso(addDays(week0, -2), 9) },
  ];
  const targetOf = (o, start) => targets.find((t) => t.objective_id === o.id && t.period_start === start)?.target ?? o.target;

  // ---- The wins the server would have recorded (what Recent wins and the cheers read).
  const firstOf = (s, only) => {
    const posts = (s.short_video_posts ?? []).filter((x) => x.posted_at && (!only || x.platform === only));
    return posts.length ? posts.reduce((a, b) => (b.posted_at < a.posted_at ? b : a)) : null;
  };
  const outShorts = [...base, ...shorts].filter((s) => (s.short_video_posts ?? []).length);
  const credit = (s) => [...new Set([s.editor?.profiles?.full_name, s.scheduler?.profiles?.full_name].filter(Boolean))];
  const items = {
    [O(1)]: outShorts.map((s) => ({ s, p: firstOf(s) })),
    [O(2)]: outShorts.filter((s) => s.platforms.every((x) => x === "instagram")).map((s) => ({ s, p: firstOf(s, "instagram") })),
    [O(3)]: outShorts.filter((s) => s.platforms.every((x) => x === "tiktok")).map((s) => ({ s, p: firstOf(s, "tiktok") })),
    [O(7)]: outShorts.map((s) => ({ s, p: firstOf(s) })),
    [O(4)]: longs.map((l) => ({ l, p: { platform: "youtube", posted_at: l.posted_at } })),
  };
  const periodOf = (kind, iso) => {
    const d = localDay(Date.parse(iso));
    return kind === "day" ? d : kind === "week" ? mondayOf(d) : monthOf(d);
  };
  const endOf = (kind, start) => (kind === "day" ? start : kind === "week" ? addDays(start, 6) : addDays(addMonths(start, 1), -1));
  const since = now - 90 * 86_400_000;
  const periods = [];
  for (const o of objectives) {
    const list = items[o.id];
    if (!list) continue;
    const groups = new Map();
    for (const it of list) {
      if (!it.p) continue;
      const k = periodOf(o.period, it.p.posted_at);
      groups.set(k, [...(groups.get(k) ?? []), it]);
    }
    for (const [start, xs] of groups) {
      xs.sort((a, b) => a.p.posted_at.localeCompare(b.p.posted_at));
      const target = targetOf(o, start);
      const reached = target > 0 && xs.length >= target ? xs[target - 1] : null;
      if (!reached || Date.parse(reached.p.posted_at) < since) continue;
      const v = reached.s ?? reached.l;
      const at = reached.p.posted_at;
      const fresh = now - Date.parse(at) < 48 * 3_600_000;
      periods.push({
        objective_id: o.id, team_id: TEAM, period_start: start, period_end: endOf(o.period, start), target, value: xs.length, reached_at: at, reached_target: target,
        winner: { kind: reached.s ? "short" : "long", number: v.entry_number, title: v.title, id: v.id, platform: reached.p.platform, people: reached.s ? credit(reached.s) : ["Andrei Ionescu"] },
        celebrated_at: fresh && !process.env.MOCK_CHEER ? null : at, updated_at: at,
      });
    }
  }
  periods.sort((a, b) => b.reached_at.localeCompare(a.reached_at));

  return { shorts, shortPosts, shortEvents, longs, longPosts, objectives, targets, periods, today };
}

module.exports = { objectivesFixtures };
