/**
 * Projections (1.15.0): the catalogue of everything a long-term target can
 * measure, and the words and numbers around it. Shared by the server and the
 * browser. The database only checks a metric id's shape (migration 0080), so
 * adding one here needs no migration. Money ids start with "revenue" or
 * "rpm" (the database hides those from people who don't see revenue).
 */
import { PLATFORMS, type Platform } from "@/modules/short-videos/lib/constants";

export type ProjGroup = "audience" | "views" | "watch" | "engagement" | "videos" | "money" | "making";
export const GROUP_LABEL: Record<ProjGroup, string> = {
  audience: "Audience",
  views: "Views",
  watch: "Watch time",
  engagement: "Engagement",
  videos: "Per video",
  money: "Money",
  making: "Making",
};
export const GROUP_ORDER: ProjGroup[] = ["audience", "views", "watch", "engagement", "videos", "money", "making"];

export type ProjUnit = "count" | "percent" | "seconds" | "hours" | "money" | "per1k" | "per_week" | "per_month";

export type ProjMetric = {
  label: string;
  group: ProjGroup;
  unit: ProjUnit;
  /** "level": a total at a moment (followers); "window": over the last N days (views, rates, per-video averages). */
  kind: "level" | "window";
  platforms: readonly Platform[];
  /** YouTube splits it into shorts and long videos. */
  content?: boolean;
  /** Which way is better ("down": a skip rate). */
  dir: "up" | "down";
  /** Asks for a views mark (hit rate). */
  threshold?: boolean;
  /** One line on what it is (the editor shows it). */
  help: string;
  /** Where the number comes from. */
  source: string;
};

const ALL: readonly Platform[] = ["youtube", "instagram", "tiktok", "facebook"];
const YT: readonly Platform[] = ["youtube"];

export const PROJ_METRICS = {
  // Audience
  followers: { label: "Followers", group: "audience", unit: "count", kind: "level", platforms: ALL, dir: "up", help: "Subscribers on YouTube and followers elsewhere, added up.", source: "Each platform's follower count, copied every morning" },
  followers_net: { label: "New followers (net)", group: "audience", unit: "count", kind: "window", platforms: ALL, dir: "up", help: "Followers gained minus followers lost.", source: "YouTube and Facebook per day; the others from the daily counts" },
  followers_per_1k: { label: "New followers per 1,000 views", group: "audience", unit: "per1k", kind: "window", platforms: ALL, dir: "up", help: "How well views turn into followers.", source: "New followers (net) ÷ views × 1,000" },
  total_views: { label: "Lifetime views", group: "audience", unit: "count", kind: "level", platforms: ["youtube", "tiktok"], dir: "up", help: "Every view the channel or account ever had.", source: "YouTube's channel views, TikTok's video views added up" },
  total_likes: { label: "Lifetime likes", group: "audience", unit: "count", kind: "level", platforms: ["tiktok"], dir: "up", help: "Every like the account ever had.", source: "TikTok's likes count" },
  // Views
  views: { label: "Views", group: "views", unit: "count", kind: "window", platforms: ALL, content: true, dir: "up", help: "Views over the last days.", source: "Each platform's views per day" },
  views_per_day: { label: "Views a day", group: "views", unit: "count", kind: "window", platforms: ALL, content: true, dir: "up", help: "The average views a day over the last days.", source: "Views ÷ days with numbers" },
  engaged_views: { label: "Engaged views", group: "views", unit: "count", kind: "window", platforms: YT, dir: "up", help: "Views where people kept watching (on Shorts: didn't swipe away right away).", source: "YouTube Analytics: engagedViews" },
  engaged_rate: { label: "Engaged view rate", group: "views", unit: "percent", kind: "window", platforms: YT, dir: "up", help: "The share of views that were engaged: YouTube's closest number to \"didn't swipe away\".", source: "engagedViews ÷ views" },
  reach: { label: "Accounts reached", group: "views", unit: "count", kind: "window", platforms: ["instagram"], dir: "up", help: "Different accounts that saw something.", source: "Instagram insights: reach" },
  // Watch time
  watch_hours: { label: "Watch hours", group: "watch", unit: "hours", kind: "window", platforms: YT, content: true, dir: "up", help: "Hours watched over the last days.", source: "YouTube Analytics: estimatedMinutesWatched" },
  avg_view_duration: { label: "Average view duration", group: "watch", unit: "seconds", kind: "window", platforms: YT, dir: "up", help: "How long a view lasts, on average.", source: "YouTube Analytics: averageViewDuration (weighted by views)" },
  avg_view_pct: { label: "Average percentage viewed", group: "watch", unit: "percent", kind: "window", platforms: YT, dir: "up", help: "How much of a video a view watches, on average.", source: "YouTube Analytics: averageViewPercentage (weighted by views)" },
  // Engagement
  likes: { label: "Likes", group: "engagement", unit: "count", kind: "window", platforms: ["youtube", "instagram", "tiktok"], content: true, dir: "up", help: "Likes over the last days.", source: "Each platform's likes per day" },
  comments: { label: "Comments", group: "engagement", unit: "count", kind: "window", platforms: ["youtube", "instagram"], content: true, dir: "up", help: "Comments over the last days.", source: "YouTube and Instagram per day" },
  shares: { label: "Shares", group: "engagement", unit: "count", kind: "window", platforms: ["youtube", "instagram"], content: true, dir: "up", help: "Shares over the last days.", source: "YouTube and Instagram per day" },
  saves: { label: "Saves", group: "engagement", unit: "count", kind: "window", platforms: ["instagram"], dir: "up", help: "Saves over the last days.", source: "Instagram insights: saves" },
  engagement_rate: { label: "Engagement rate", group: "engagement", unit: "percent", kind: "window", platforms: ["youtube", "instagram", "facebook"], dir: "up", help: "Likes, comments, shares (and saves) per view.", source: "Engagements ÷ views" },
  like_rate: { label: "Like rate", group: "engagement", unit: "percent", kind: "window", platforms: ["youtube", "instagram", "tiktok"], dir: "up", help: "Likes per view.", source: "Likes ÷ views" },
  comment_rate: { label: "Comments per 1,000 views", group: "engagement", unit: "per1k", kind: "window", platforms: ["youtube", "instagram"], dir: "up", help: "How much people talk back.", source: "Comments ÷ views × 1,000" },
  dislike_rate: { label: "Dislike share", group: "engagement", unit: "percent", kind: "window", platforms: YT, dir: "down", help: "Dislikes out of likes and dislikes together.", source: "YouTube Analytics: dislikes ÷ (likes + dislikes)" },
  // Per video (published in the window, their numbers so far)
  videos_posted: { label: "Videos published", group: "videos", unit: "count", kind: "window", platforms: ALL, content: true, dir: "up", help: "Videos and posts published on the platforms.", source: "The platforms' video lists" },
  avg_views_per_video: { label: "Average views per video", group: "videos", unit: "count", kind: "window", platforms: ALL, content: true, dir: "up", help: "Each video published in the window, its views so far, averaged.", source: "Each video's views" },
  median_views_per_video: { label: "Median views per video", group: "videos", unit: "count", kind: "window", platforms: ALL, content: true, dir: "up", help: "The middle video's views: one big hit doesn't skew it.", source: "Each video's views" },
  top_video_views: { label: "Best video's views", group: "videos", unit: "count", kind: "window", platforms: ALL, content: true, dir: "up", help: "The most viewed video published in the window.", source: "Each video's views" },
  hit_rate: { label: "Videos over a views mark", group: "videos", unit: "percent", kind: "window", platforms: ALL, content: true, dir: "up", threshold: true, help: "The share of videos that got past a number of views.", source: "Each video's views" },
  avg_likes_per_video: { label: "Average likes per video", group: "videos", unit: "count", kind: "window", platforms: ALL, content: true, dir: "up", help: "Likes per video published in the window.", source: "Each video's likes" },
  video_like_rate: { label: "Like rate of new videos", group: "videos", unit: "percent", kind: "window", platforms: ALL, content: true, dir: "up", help: "Likes per view, on the videos published in the window.", source: "Each video's likes ÷ views" },
  avg_shares_per_video: { label: "Average shares per video", group: "videos", unit: "count", kind: "window", platforms: ["instagram", "tiktok", "facebook"], content: true, dir: "up", help: "Shares per video published in the window.", source: "Each video's shares" },
  avg_watch_per_video: { label: "Average watch time per video", group: "videos", unit: "seconds", kind: "window", platforms: ["youtube", "instagram"], content: true, dir: "up", help: "How long a view of each new video lasts, averaged over the videos.", source: "YouTube: averageViewDuration per video · Instagram: Reels average watch time" },
  avg_pct_per_video: { label: "Average % viewed per video", group: "videos", unit: "percent", kind: "window", platforms: YT, content: true, dir: "up", help: "How much of each new video a view watches, averaged over the videos.", source: "YouTube Analytics: averageViewPercentage per video" },
  skip_rate: { label: "Reels skip rate", group: "videos", unit: "percent", kind: "window", platforms: ["instagram"], dir: "down", help: "The share of a Reel's plays swiped away in the first seconds, averaged over the new Reels.", source: "Instagram insights: reels_skip_rate" },
  subs_per_video: { label: "Subscribers per video", group: "videos", unit: "count", kind: "window", platforms: YT, content: true, dir: "up", help: "Subscribers each new video brought in, averaged.", source: "YouTube Analytics: subscribersGained per video" },
  engaged_per_video: { label: "Engaged views per video", group: "videos", unit: "count", kind: "window", platforms: YT, content: true, dir: "up", help: "Engaged views per new video, averaged.", source: "YouTube Analytics: engagedViews per video" },
  // Money (only the people who see revenue)
  revenue: { label: "Revenue", group: "money", unit: "money", kind: "window", platforms: ["youtube", "facebook"], content: true, dir: "up", help: "Platform earnings over the last days.", source: "YouTube's estimated revenue, Facebook's Content Monetization" },
  revenue_per_day: { label: "Revenue a day", group: "money", unit: "money", kind: "window", platforms: ["youtube", "facebook"], dir: "up", help: "The average earnings a day.", source: "Revenue ÷ days with numbers" },
  rpm: { label: "RPM", group: "money", unit: "money", kind: "window", platforms: YT, dir: "up", help: "Revenue per 1,000 views.", source: "YouTube's estimated revenue ÷ views × 1,000" },
  // Making (the team's own work)
  shorts_per_week: { label: "Shorts posted a week", group: "making", unit: "per_week", kind: "window", platforms: ALL, dir: "up", help: "Shorts first posted, averaged per week.", source: "The shorts the team posted" },
  longs_per_month: { label: "Long videos a month", group: "making", unit: "per_month", kind: "window", platforms: YT, dir: "up", help: "Long videos published, averaged per month.", source: "The long videos the team published" },
} as const satisfies Record<string, ProjMetric>;

export type ProjMetricId = keyof typeof PROJ_METRICS;
export const isProjMetric = (v: unknown): v is ProjMetricId => typeof v === "string" && Object.prototype.hasOwnProperty.call(PROJ_METRICS, v);
export const metricOf = (id: string): ProjMetric | null => (isProjMetric(id) ? (PROJ_METRICS[id] as ProjMetric) : null);
export const isMoney = (id: string) => /^(revenue|rpm)/.test(id);
export const METRICS_BY_GROUP: Record<ProjGroup, ProjMetricId[]> = GROUP_ORDER.reduce(
  (acc, g) => ({ ...acc, [g]: (Object.keys(PROJ_METRICS) as ProjMetricId[]).filter((k) => PROJ_METRICS[k].group === g) }),
  {} as Record<ProjGroup, ProjMetricId[]>
);

// ---------------------------------------------------------------------------
// Scope: where it's measured
// ---------------------------------------------------------------------------

export const WINDOWS = [7, 28, 90] as const;
export type WindowDays = (typeof WINDOWS)[number];
export type ProjScope = {
  /** Only these platforms (none: every one the metric supports). */
  platforms?: Platform[];
  /** YouTube's shorts or long videos only. */
  content?: "shorts" | "long";
  /** The last N days a window metric is taken over (28 by default). */
  window?: WindowDays;
  /** Hit rate: the views mark. */
  threshold?: number;
};

/** A clean scope for a metric (anything unexpected dropped). */
export function cleanScope(metric: string, raw: unknown): ProjScope {
  const m = metricOf(metric);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!m) return {};
  const out: ProjScope = {};
  if (Array.isArray(r.platforms)) {
    const ps = [...new Set(r.platforms.filter((p): p is Platform => typeof p === "string" && (PLATFORMS as readonly string[]).includes(p) && m.platforms.includes(p as Platform)))];
    if (ps.length && ps.length < m.platforms.length) out.platforms = ps.sort((a, b) => PLATFORMS.indexOf(a) - PLATFORMS.indexOf(b));
  }
  if (m.content && (r.content === "shorts" || r.content === "long")) out.content = r.content;
  if (m.kind === "window") out.window = (WINDOWS as readonly number[]).includes(Number(r.window)) ? (Number(r.window) as WindowDays) : 28;
  if (m.threshold) {
    const t = Math.round(Number(r.threshold));
    out.threshold = Number.isFinite(t) && t >= 1 && t <= 1e10 ? t : 100_000;
  }
  return out;
}

/** The platforms a projection looks at. */
export const platformsOf = (metric: string, scope: ProjScope): Platform[] => {
  const m = metricOf(metric);
  if (!m) return [];
  return scope.platforms?.length ? scope.platforms : [...m.platforms];
};

// ---------------------------------------------------------------------------
// Numbers and words
// ---------------------------------------------------------------------------

export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, "")}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 10_000) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K`;
  if (a >= 100 || Number.isInteger(n)) return Math.round(n).toLocaleString("en-US");
  return (Math.round(n * 10) / 10).toLocaleString("en-US");
}

/** "1:24", "34s", "1h 05m". */
export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

/** A metric's value, the way it reads: "12.4K", "38.2%", "1:24", "$1,240", "3.1 a week". */
export function formatValue(metric: string, n: number | null | undefined, opts: { currency?: string; full?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const unit = metricOf(metric)?.unit ?? "count";
  switch (unit) {
    case "percent":
      return `${(Math.round(n * 10) / 10).toLocaleString("en-US")}%`;
    case "seconds":
      return duration(n);
    case "hours":
      return `${opts.full ? Math.round(n).toLocaleString("en-US") : compact(n)} h`;
    case "money": {
      const c = opts.currency ?? "USD";
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }).format(n);
      } catch {
        return `${compact(n)} ${c}`;
      }
    }
    case "per1k":
      return `${(Math.round(n * 100) / 100).toLocaleString("en-US")}`;
    case "per_week":
    case "per_month":
      return (Math.round(n * 10) / 10).toLocaleString("en-US");
    default:
      return opts.full ? Math.round(n).toLocaleString("en-US") : compact(n);
  }
}

/** The words after a value: "followers" (on YouTube alone: "subscribers"), "a week", "per 1K views". Empty when the value says it all. */
export function unitWords(metric: string, n?: number | null, scope?: ProjScope): string {
  const id = isProjMetric(metric) ? metric : null;
  if (!id) return "";
  const one = n !== null && n !== undefined && Math.abs(n) === 1;
  switch (id) {
    case "followers":
    case "followers_net":
      if (scope?.platforms?.length === 1 && scope.platforms[0] === "youtube") return one ? "subscriber" : "subscribers";
      return one ? "follower" : "followers";
    case "followers_per_1k":
      return "per 1K views";
    case "comment_rate":
      return "per 1K views";
    case "total_views":
    case "views":
    case "views_per_day":
    case "engaged_views":
    case "avg_views_per_video":
    case "median_views_per_video":
    case "top_video_views":
    case "engaged_per_video":
      return one ? "view" : "views";
    case "total_likes":
    case "likes":
    case "avg_likes_per_video":
      return one ? "like" : "likes";
    case "comments":
      return one ? "comment" : "comments";
    case "shares":
    case "avg_shares_per_video":
      return one ? "share" : "shares";
    case "saves":
      return one ? "save" : "saves";
    case "reach":
      return one ? "account" : "accounts";
    case "videos_posted":
      return one ? "video" : "videos";
    case "subs_per_video":
      return one ? "subscriber" : "subscribers";
    case "shorts_per_week":
      return "a week";
    case "longs_per_month":
      return "a month";
    default:
      return "";
  }
}

const PLATFORM_NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
export const platformName = (p: Platform) => PLATFORM_NAME[p];

function orList(xs: string[]) {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** "on YouTube", "on Instagram and TikTok", "" (every platform it supports). */
export function whereWords(metric: string, scope: ProjScope): string {
  const m = metricOf(metric);
  if (!m) return "";
  const ps = platformsOf(metric, scope);
  const content = scope.content === "shorts" ? "shorts" : scope.content === "long" ? "long videos" : null;
  const on = ps.length && (ps.length < m.platforms.length || m.platforms.length === 1) ? `on ${orList(ps.map(platformName))}` : "";
  return [content ? `(${content})` : "", on].filter(Boolean).join(" ");
}

/** "last 28 days" for window metrics. */
export const windowWords = (metric: string, scope: ProjScope) => (metricOf(metric)?.kind === "window" ? `last ${scope.window ?? 28} days` : "");

const dayWord = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The projection in one sentence:
 *   "Reach 200K subscribers on YouTube by Dec 9, 2026."
 *   "Reach 900K views in 28 days by Aug 31, 2026."
 *   "Post 16 shorts a week by Dec 27, 2026 (on average over 28 days)."
 *   "Bring the Reels skip rate down to 22% by Dec 15, 2026 (Instagram, last 28 days)."
 *   "Get the average % viewed per video to 52% by Dec 1, 2026 (long videos on YouTube, last 90 days)."
 */
export function describeProjection(p: { metric: string; scope: ProjScope; target: number; direction: "up" | "down"; deadline: string }, currency?: string): string {
  const m = metricOf(p.metric);
  const by = `by ${dayWord(p.deadline)}`;
  if (!m) return `Reach ${compact(p.target)} ${by}.`;
  const id = p.metric as ProjMetricId;
  const w = p.scope.window ?? 28;
  const value = formatValue(p.metric, p.target, { currency });
  const unit = unitWords(p.metric, p.target, p.scope);
  const ps = platformsOf(p.metric, p.scope);
  const named = ps.length && (ps.length < m.platforms.length || m.platforms.length === 1) ? orList(ps.map(platformName)) : "";
  const content = p.scope.content === "shorts" ? "shorts" : p.scope.content === "long" ? "long videos" : "";
  // "on YouTube shorts", "on shorts", "on Instagram", "".
  const on = content ? `on ${named ? `${named} ` : ""}${content}` : named ? `on ${named}` : "";
  const clean = (x: string) => x.replace(/\s+/g, " ").replace(/ \./g, ".").replace(/\( /g, "(").trim();
  if (m.kind === "level") return clean(`Reach ${value} ${unit} ${on} ${by}.`);
  if (id === "shorts_per_week") return clean(`Post ${value} shorts a week ${on} ${by} (on average over ${w} days).`);
  if (id === "longs_per_month") return clean(`Publish ${value} long videos a month ${by} (on average over ${w} days).`);
  if (id === "views_per_day") return clean(`Reach ${value} views a day ${on} ${by} (on average over ${w} days).`);
  if (id === "revenue_per_day") return clean(`Make ${value} a day ${on.replace(/^on /, "from ")} ${by} (on average over ${w} days).`);
  if (id === "revenue") return clean(`Make ${value} in ${w} days ${on.replace(/^on /, "from ")} ${by}.`);
  if (id === "watch_hours") return clean(`Reach ${compact(p.target)} watch hours ${on} in ${w} days ${by}.`);
  if (["views", "likes", "comments", "shares", "saves", "reach", "engaged_views", "followers_net", "videos_posted"].includes(id))
    return clean(`Reach ${value} ${id === "followers_net" ? `new ${unit}` : unit} ${on} in ${w} days ${by}.`);
  // Where and over what, in brackets.
  const where = [content ? `${content}${named ? ` on ${named}` : ""}` : named, `last ${w} days`].filter(Boolean).join(", ");
  if (id === "hit_rate") return clean(`Get ${value} of videos past ${compact(p.scope.threshold ?? 100_000)} views ${by} (${where}).`);
  // Rates and averages: the number itself.
  const label = /^(RPM|Reels)/.test(m.label) ? m.label : m.label.charAt(0).toLowerCase() + m.label.slice(1);
  const the = /^(comments|new followers|videos)/i.test(label) ? "" : "the ";
  const tail = m.unit === "per1k" || m.unit === "percent" || m.unit === "seconds" || m.unit === "money" ? "" : unit ? ` ${unit}` : "";
  const verb = p.direction === "down" ? "Bring" : "Get";
  return clean(`${verb} ${the}${label} ${p.direction === "down" ? "down to" : "to"} ${value}${tail} ${by} (${where}).`);
}

/** A name to start from: "YouTube subscribers", "Reels skip rate", "Average % viewed (long videos)". */
export function suggestProjectionTitle(metric: string, scope: ProjScope): string {
  const m = metricOf(metric);
  if (!m) return "Projection";
  const ps = platformsOf(metric, scope);
  const one = ps.length === 1 && m.platforms.length > 1 ? `${platformName(ps[0])} ` : "";
  if (metric === "followers") return ps.length === 1 && ps[0] === "youtube" ? "YouTube subscribers" : `${one}followers`.replace(/^f/, "F");
  const label = one ? `${one}${m.label.charAt(0).toLowerCase()}${m.label.slice(1)}` : m.label;
  const content = scope.content === "shorts" ? " (shorts)" : scope.content === "long" ? " (long videos)" : "";
  return `${label}${content}`.slice(0, 80);
}

/** What's wrong with a draft (null: nothing). */
export function projectionProblem(d: { title: string; metric: string; target: number; deadline: string; today: string; color: string }): string | null {
  if (!d.title.trim()) return "Give it a name.";
  if (d.title.trim().length > 80) return "Keep the name under 80 characters.";
  const m = metricOf(d.metric);
  if (!m) return "Pick what to measure.";
  if (!Number.isFinite(d.target)) return "Set a target.";
  if (m.unit === "percent" && (d.target < 0 || d.target > 100)) return "A percentage is between 0 and 100.";
  if (d.target < 0) return "The target can't be below 0.";
  if (Math.abs(d.target) >= 1e15) return "That target is too big.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.deadline) || d.deadline <= d.today) return "Pick a date after today.";
  const days = Math.round((Date.parse(`${d.deadline}T00:00:00Z`) - Date.parse(`${d.today}T00:00:00Z`)) / 86_400_000);
  if (days > 3650) return "Pick a date within 10 years.";
  if (!/^[a-z]{2,16}$/.test(d.color)) return "Pick a colour.";
  return null;
}

/** Quick deadlines: 1, 3, 6 months, a year. */
export const DEADLINE_PRESETS = [
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
] as const;
export function addMonths(day: string, months: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}

/** The key numbers kept when a projection is set, for Compare (money ones only for money projections). */
export const COMPARE_SET: { key: string; metric: ProjMetricId; scope: ProjScope; label: string }[] = [
  { key: "followers", metric: "followers", scope: {}, label: "Followers (all platforms)" },
  { key: "followers_net", metric: "followers_net", scope: { window: 28 }, label: "New followers, last 28 days" },
  { key: "total_views", metric: "total_views", scope: {}, label: "Lifetime views" },
  { key: "views", metric: "views", scope: { window: 28 }, label: "Views, last 28 days" },
  { key: "views_per_day", metric: "views_per_day", scope: { window: 28 }, label: "Views a day" },
  { key: "watch_hours", metric: "watch_hours", scope: { window: 28 }, label: "Watch hours, last 28 days" },
  { key: "avg_view_duration", metric: "avg_view_duration", scope: { window: 28 }, label: "Average view duration" },
  { key: "avg_view_pct", metric: "avg_view_pct", scope: { window: 28 }, label: "Average percentage viewed" },
  { key: "engaged_rate", metric: "engaged_rate", scope: { window: 28 }, label: "Engaged view rate" },
  { key: "engagement_rate", metric: "engagement_rate", scope: { window: 28 }, label: "Engagement rate" },
  { key: "like_rate", metric: "like_rate", scope: { window: 28 }, label: "Like rate" },
  { key: "followers_per_1k", metric: "followers_per_1k", scope: { window: 28 }, label: "New followers per 1,000 views" },
  { key: "videos_posted", metric: "videos_posted", scope: { window: 28 }, label: "Videos published, last 28 days" },
  { key: "avg_views_per_video", metric: "avg_views_per_video", scope: { window: 28 }, label: "Average views per new video" },
  { key: "median_views_per_video", metric: "median_views_per_video", scope: { window: 28 }, label: "Median views per new video" },
  { key: "skip_rate", metric: "skip_rate", scope: { window: 28 }, label: "Reels skip rate" },
  { key: "shorts_per_week", metric: "shorts_per_week", scope: { window: 28 }, label: "Shorts posted a week" },
  { key: "longs_per_month", metric: "longs_per_month", scope: { window: 90 }, label: "Long videos a month" },
];
export const COMPARE_MONEY: { key: string; metric: ProjMetricId; scope: ProjScope; label: string }[] = [
  { key: "revenue", metric: "revenue", scope: { window: 28 }, label: "Revenue, last 28 days" },
  { key: "rpm", metric: "rpm", scope: { window: 28 }, label: "RPM" },
];
