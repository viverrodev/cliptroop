/**
 * Projections, worked out (pure, tested in tests/projections.test.ts): a
 * metric's value on a day from the copied numbers, the trend, where it's
 * heading by the deadline, and the Compare set.
 */
import { COMPARE_MONEY, COMPARE_SET, metricOf, platformsOf, type ProjMetricId, type ProjScope } from "./metrics";

export type PDaily = {
  platform: string;
  day: string;
  content: string;
  views?: number | null;
  watch_minutes?: number | null;
  avg_view_seconds?: number | null;
  avg_view_pct?: number | null;
  engaged_views?: number | null;
  likes?: number | null;
  dislikes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  engagements?: number | null;
  followers_gained?: number | null;
  followers_lost?: number | null;
  followers?: number | null;
  total_views?: number | null;
  total_likes?: number | null;
};
export type PContent = {
  platform: string;
  kind: string;
  published_at: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  engaged_views?: number | null;
  avg_view_seconds?: number | null;
  avg_view_pct?: number | null;
  subscribers_gained?: number | null;
  skip_rate?: number | null;
};
export type PRevenue = { platform: string; day: string; content: string; revenue: number | null };
/** A short's first post (per platform) or a long video's publishing, by day. */
export type PPost = { kind: "short" | "long"; id: string; platform: string | null; day: string };
export type ProjData = { daily: PDaily[]; content: PContent[]; revenue: PRevenue[]; posts: PPost[] };

const DAY = 86_400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const sum = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.map(num).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ratio = (a: number | null, b: number | null, times = 1) => (a === null || b === null || b === 0 ? null : (a / b) * times);

/** Looks up a platform's row for a day (content: all / shorts / long). */
function indexDaily(daily: PDaily[]) {
  const map = new Map<string, PDaily>();
  for (const r of daily) map.set(`${r.platform}|${r.content}|${r.day}`, r);
  return (p: string, d: string, content = "all") => map.get(`${p}|${content}|${d}`);
}

function dayList(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 4000; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * A metric's value as of `today`, from the copied numbers. Window metrics
 * from the platforms end yesterday (their numbers arrive a day late);
 * per-video ones look at videos published in the last N days (their numbers
 * so far); "making" ones end today; levels (followers) are the latest count.
 * Null: nothing to go on.
 */
export function valueAt(metric: string, rawScope: ProjScope, data: ProjData, today: string): number | null {
  const m = metricOf(metric);
  if (!m) return null;
  const scope = rawScope ?? {};
  const ps = platformsOf(metric, scope);
  const w = scope.window ?? 28;
  const at = indexDaily(data.daily);
  const end = addDays(today, -1);
  const days = dayList(addDays(end, -(w - 1)), end);
  const content = scope.content ?? "all";
  const id = metric as ProjMetricId;

  // TikTok only has running totals: a day's change is the next day's copy minus that day's.
  const delta = (p: string, d: string, field: "total_views" | "total_likes") => {
    const a = num(at(p, d)?.[field]);
    const b = num(at(p, addDays(d, 1))?.[field]);
    return a !== null && b !== null ? Math.max(0, b - a) : null;
  };
  // Only YouTube splits shorts and long videos: with a split asked for, the others have nothing to add.
  const viewsOn = (p: string, d: string) =>
    content !== "all" && p !== "youtube" ? null : p === "tiktok" ? delta(p, d, "total_views") : num(at(p, d, p === "youtube" ? content : "all")?.views);
  const field = (p: string, d: string, f: keyof PDaily, c = content) => (c !== "all" && p !== "youtube" ? null : num(at(p, d, p === "youtube" ? c : "all")?.[f]));
  const total = (f: (p: string, d: string) => number | null, plats = ps) => sum(plats.flatMap((p) => days.map((d) => f(p, d))));
  // Only days where both numbers exist (a rate never mixes a day's likes with another day's views).
  const pairSum = (a: (p: string, d: string) => number | null, b: (p: string, d: string) => number | null, plats = ps) => {
    let x = 0;
    let y = 0;
    let any = false;
    for (const p of plats)
      for (const d of days) {
        const u = a(p, d);
        const v = b(p, d);
        if (u !== null && v !== null) {
          x += u;
          y += v;
          any = true;
        }
      }
    return any ? { a: x, b: y } : null;
  };
  const likesOn = (p: string, d: string) => (p === "tiktok" ? (content === "all" ? delta(p, d, "total_likes") : null) : field(p, d, "likes"));
  const netOn = (p: string, list: string[]) => {
    const per = list.map((d) => {
      const r = at(p, d);
      const g = num(r?.followers_gained);
      const l = num(r?.followers_lost);
      return g !== null || l !== null ? (g ?? 0) - (l ?? 0) : null;
    });
    const s = sum(per);
    if (s !== null) return s;
    const snaps = [...list, addDays(list[list.length - 1], 1)].map((d) => num(at(p, d)?.followers)).filter((x): x is number => x !== null);
    return snaps.length >= 2 ? snaps[snaps.length - 1] - snaps[0] : null;
  };
  const latest = (p: string, f: "followers" | "total_views" | "total_likes") => {
    let best: { day: string; v: number } | null = null;
    for (const r of data.daily)
      if (r.platform === p && r.content === "all" && r.day <= today) {
        const v = num(r[f]);
        if (v !== null && (!best || r.day > best.day)) best = { day: r.day, v };
      }
    return best?.v ?? null;
  };
  const engagementOn = (p: string, d: string) => {
    if (p === "facebook") return field(p, d, "engagements", "all");
    const parts = [field(p, d, "likes"), field(p, d, "comments"), field(p, d, "shares"), p === "instagram" ? field(p, d, "saves") : null].filter((x): x is number => x !== null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  };
  // Videos published in the window (their numbers so far).
  const since = addDays(today, -(w - 1));
  const videos = () =>
    data.content.filter((c) => {
      if (!ps.includes(c.platform as never)) return false;
      const day = c.published_at?.slice(0, 10);
      if (!day || day < since || day > today) return false;
      if (scope.content === "shorts") return c.kind === "short";
      if (scope.content === "long") return c.kind === "long";
      return true;
    });
  const viewsOf = (vs: PContent[]) => vs.map((v) => num(v.views)).filter((x): x is number => x !== null);
  const money = () =>
    data.revenue.filter((r) => ps.includes(r.platform as never) && r.day >= days[0] && r.day <= end && (r.platform === "youtube" ? r.content === content : content === "all" && r.content === "all"));

  switch (id) {
    case "followers":
      return sum(ps.map((p) => latest(p, "followers")));
    case "total_views":
      return sum(ps.map((p) => latest(p, "total_views")));
    case "total_likes":
      return sum(ps.map((p) => latest(p, "total_likes")));
    case "followers_net":
      return sum(ps.map((p) => netOn(p, days)));
    case "followers_per_1k": {
      const net = sum(ps.map((p) => netOn(p, days)));
      return ratio(net, total(viewsOn), 1000);
    }
    case "views":
      return total(viewsOn);
    case "views_per_day": {
      const per = days.map((d) => sum(ps.map((p) => viewsOn(p, d)))).filter((x): x is number => x !== null);
      return per.length ? per.reduce((a, b) => a + b, 0) / per.length : null;
    }
    case "engaged_views":
      return total((p, d) => field(p, d, "engaged_views", "all"));
    case "engaged_rate": {
      const s = pairSum((p, d) => field(p, d, "engaged_views", "all"), (p, d) => field(p, d, "views", "all"));
      return s ? ratio(s.a, s.b, 100) : null;
    }
    case "reach":
      return total((p, d) => field(p, d, "reach", "all"));
    case "watch_hours": {
      const mins = total((p, d) => field(p, d, "watch_minutes"));
      return mins === null ? null : mins / 60;
    }
    case "avg_view_duration": {
      const s = pairSum((p, d) => {
        const a = field(p, d, "avg_view_seconds", "all");
        const v = field(p, d, "views", "all");
        return a !== null && v !== null ? a * v : null;
      }, (p, d) => (field(p, d, "avg_view_seconds", "all") !== null ? field(p, d, "views", "all") : null));
      return s ? ratio(s.a, s.b) : null;
    }
    case "avg_view_pct": {
      const s = pairSum((p, d) => {
        const a = field(p, d, "avg_view_pct", "all");
        const v = field(p, d, "views", "all");
        return a !== null && v !== null ? a * v : null;
      }, (p, d) => (field(p, d, "avg_view_pct", "all") !== null ? field(p, d, "views", "all") : null));
      return s ? ratio(s.a, s.b) : null;
    }
    case "likes":
      return total(likesOn);
    case "comments":
      return total((p, d) => field(p, d, "comments"));
    case "shares":
      return total((p, d) => field(p, d, "shares"));
    case "saves":
      return total((p, d) => field(p, d, "saves", "all"));
    case "engagement_rate": {
      const s = pairSum(engagementOn, (p, d) => field(p, d, "views", "all"));
      return s ? ratio(s.a, s.b, 100) : null;
    }
    case "like_rate": {
      const s = pairSum(likesOn, viewsOn);
      return s ? ratio(s.a, s.b, 100) : null;
    }
    case "comment_rate": {
      const s = pairSum((p, d) => field(p, d, "comments"), viewsOn);
      return s ? ratio(s.a, s.b, 1000) : null;
    }
    case "dislike_rate": {
      const s = pairSum((p, d) => field(p, d, "dislikes", "all"), (p, d) => {
        const l = field(p, d, "likes", "all");
        const x = field(p, d, "dislikes", "all");
        return l !== null && x !== null ? l + x : null;
      });
      return s ? ratio(s.a, s.b, 100) : null;
    }
    case "videos_posted":
      return videos().length;
    case "avg_views_per_video":
      return mean(viewsOf(videos()));
    case "median_views_per_video":
      return median(viewsOf(videos()));
    case "top_video_views": {
      const v = viewsOf(videos());
      return v.length ? Math.max(...v) : null;
    }
    case "hit_rate": {
      const v = viewsOf(videos());
      const mark = scope.threshold ?? 100_000;
      return v.length ? (v.filter((x) => x >= mark).length / v.length) * 100 : null;
    }
    case "avg_likes_per_video":
      return mean(videos().map((v) => v.likes));
    case "video_like_rate": {
      const vs = videos().filter((v) => num(v.views) !== null && num(v.likes) !== null);
      return ratio(sum(vs.map((v) => num(v.likes))), sum(vs.map((v) => num(v.views))), 100);
    }
    case "avg_shares_per_video":
      return mean(videos().map((v) => v.shares));
    case "avg_watch_per_video":
      return mean(videos().map((v) => v.avg_view_seconds));
    case "avg_pct_per_video":
      return mean(videos().map((v) => v.avg_view_pct));
    case "skip_rate":
      return mean(videos().map((v) => v.skip_rate));
    case "subs_per_video":
      return mean(videos().map((v) => v.subscribers_gained));
    case "engaged_per_video":
      return mean(videos().map((v) => v.engaged_views));
    case "revenue":
      return sum(money().map((r) => num(r.revenue)));
    case "revenue_per_day": {
      const rows = money();
      const byDay = new Map<string, number>();
      for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + (num(r.revenue) ?? 0));
      return byDay.size ? [...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size : null;
    }
    case "rpm": {
      const rev = new Map(data.revenue.filter((r) => r.platform === "youtube" && r.content === "all" && r.day >= days[0] && r.day <= end).map((r) => [r.day, num(r.revenue)]));
      const s = pairSum((p, d) => (p === "youtube" ? rev.get(d) ?? null : null), (p, d) => (p === "youtube" && rev.has(d) ? field(p, d, "views", "all") : null), ["youtube"]);
      return s ? ratio(s.a, s.b, 1000) : null;
    }
    case "shorts_per_week":
    case "longs_per_month": {
      // Each one counts once, on its first post (on the platforms asked for).
      const kind = id === "shorts_per_week" ? "short" : "long";
      const from = addDays(today, -(w - 1));
      const first = new Map<string, string>();
      for (const x of data.posts)
        if (x.kind === kind && (kind === "long" || !x.platform || ps.includes(x.platform as never))) {
          const f = first.get(x.id);
          if (!f || x.day < f) first.set(x.id, x.day);
        }
      const n = [...first.values()].filter((d) => d >= from && d <= today).length;
      return id === "shorts_per_week" ? n / (w / 7) : n / (w / 30);
    }
    default:
      return null;
  }
}

/** The key numbers for Compare (the money ones only when asked). */
export function compareValues(data: ProjData, today: string, withMoney: boolean): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const c of [...COMPARE_SET, ...(withMoney ? COMPARE_MONEY : [])]) out[c.key] = round(valueAt(c.metric, c.scope, data, today));
  return out;
}

/** Each platform's followers (for Compare). */
export function followersByPlatform(data: ProjData, today: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const p of ["youtube", "instagram", "tiktok", "facebook"]) out[p] = valueAt("followers", { platforms: [p as never] }, data, today);
  return out;
}

export const round = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10_000) / 10_000);

// ---------------------------------------------------------------------------
// Pace, forecast and where it stands
// ---------------------------------------------------------------------------

export type Point = { day: string; value: number };

/** The trend per day: a straight line through the points (least squares), the latest 60. */
export function trendPerDay(points: Point[]): number | null {
  const pts = points.slice(-60);
  if (pts.length < 3) return null;
  const x0 = Date.parse(`${pts[0].day}T00:00:00Z`) / DAY;
  const xs = pts.map((p) => Date.parse(`${p.day}T00:00:00Z`) / DAY - x0);
  if (xs[xs.length - 1] - xs[0] < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = pts.reduce((a, p) => a + p.value, 0) / pts.length;
  let num_ = 0;
  let den = 0;
  pts.forEach((p, i) => {
    num_ += (xs[i] - mx) * (p.value - my);
    den += (xs[i] - mx) ** 2;
  });
  return den ? num_ / den : null;
}

export type ProjStatus = "reached" | "ahead" | "on_track" | "behind" | "new" | "waiting" | "done" | "missed";

export type Assessment = {
  status: ProjStatus;
  /** 0 to 1: how far from where it started to the target (more than 1 = past it). */
  progress: number | null;
  /** 0 to 1: how much of the time has gone by. */
  timeFraction: number;
  daysTotal: number;
  daysElapsed: number;
  daysLeft: number;
  /** The trend: change per day (null when it's too early to tell). */
  perDay: number | null;
  /** What it takes from now: change per day to land on the target on the deadline. */
  needPerDay: number | null;
  /** Where it lands on the deadline at this pace. */
  forecast: number | null;
  /** The day it reaches the target at this pace (null: not heading there, or too far). */
  eta: string | null;
};

export const meets = (value: number, target: number, dir: "up" | "down") => (dir === "down" ? value <= target + 1e-9 : value >= target - 1e-9);

export function assess(p: {
  metric: string;
  start: number | null;
  current: number | null;
  target: number;
  direction: "up" | "down";
  startDay: string;
  deadline: string;
  today: string;
  points: Point[];
  achieved: boolean;
  ended: boolean;
}): Assessment {
  const daysTotal = Math.max(1, daysBetween(p.startDay, p.deadline));
  const daysElapsed = Math.max(0, Math.min(daysTotal, daysBetween(p.startDay, p.today)));
  const daysLeft = Math.max(0, daysBetween(p.today, p.deadline));
  const timeFraction = Math.max(0, Math.min(1, daysElapsed / daysTotal));
  const percent = metricOf(p.metric)?.unit === "percent";
  const cur = p.current;
  const start = p.start ?? (p.points[0]?.value ?? null);
  const gap = start !== null ? p.target - start : null;
  const progress =
    cur === null || start === null
      ? null
      : gap === 0 || (gap !== null && (p.direction === "up" ? gap < 0 : gap > 0))
        ? meets(cur, p.target, p.direction)
          ? 1
          : 0
        : (cur - start) / (gap as number);
  // The trend from the daily values (and today's), else from the start to now.
  const pts = cur !== null && !p.points.some((x) => x.day === p.today) ? [...p.points, { day: p.today, value: cur }] : p.points;
  let perDay = trendPerDay(pts);
  if (perDay === null && cur !== null && start !== null && daysElapsed >= 3) perDay = (cur - start) / daysElapsed;
  let forecast = perDay !== null && cur !== null ? cur + perDay * daysLeft : null;
  if (forecast !== null && percent) forecast = Math.max(0, Math.min(100, forecast));
  if (forecast !== null && (p.metric === "followers" || p.metric.startsWith("total_")) && p.direction === "up" && cur !== null) forecast = Math.max(forecast, cur);
  const needPerDay = cur === null ? null : daysLeft > 0 ? (p.target - cur) / daysLeft : null;
  let eta: string | null = null;
  if (cur !== null && perDay !== null && perDay !== 0 && !meets(cur, p.target, p.direction)) {
    const toward = p.direction === "up" ? perDay > 0 : perDay < 0;
    if (toward) {
      const d = Math.ceil((p.target - cur) / perDay);
      if (d > 0 && d <= 3650) eta = addDays(p.today, d);
    }
  }
  const base = { progress, timeFraction, daysTotal, daysElapsed, daysLeft, perDay, needPerDay, forecast, eta };

  if (p.ended) return { ...base, status: p.achieved || (cur !== null && meets(cur, p.target, p.direction)) ? "done" : "missed" };
  if (p.achieved || (cur !== null && meets(cur, p.target, p.direction))) return { ...base, status: "reached" };
  if (cur === null) return { ...base, status: "waiting" };
  if (daysElapsed < 3 && pts.length < 3) return { ...base, status: "new" };
  if (forecast !== null) {
    if (!meets(forecast, p.target, p.direction)) return { ...base, status: "behind" };
    // Reaching it well before the deadline (in the first 85% of the time): ahead.
    const early = eta !== null && daysBetween(p.startDay, eta) <= daysTotal * 0.85;
    return { ...base, status: early ? "ahead" : "on_track" };
  }
  // Too early for a trend: how far it's come against how much time has gone.
  if (progress === null) return { ...base, status: "on_track" };
  return { ...base, status: progress >= timeFraction + 0.1 ? "ahead" : progress >= timeFraction - 0.15 ? "on_track" : "behind" };
}
