/**
 * What an objective can count, and how it's described. One entry per metric:
 * adding a metric = an entry here + its hits in lib/hits.ts (the database
 * only checks the id's shape, so no migration is needed).
 *
 * Filters are the modular part: which platforms (on any of them, or ONLY
 * them: "Instagram-only reels"), short types, long video types, one
 * person's work, and for views Shorts vs long videos. Pure: shared by the
 * server and the browser.
 */
import { PLATFORMS, PLATFORM_META, SHORT_TYPES, SHORT_TYPE_META, type Platform, type ShortType } from "@/modules/short-videos/lib/constants";
import { EVERY, isPeriodKind, type PeriodKind } from "./periods";

export const LONG_TYPES = ["Hub", "Help", "Hero"] as const;
export type LongType = (typeof LONG_TYPES)[number];

export type MetricId =
  | "shorts_posted"
  | "longs_posted"
  | "posts_published"
  | "shorts_created"
  | "longs_created"
  | "shorts_edited"
  | "shorts_approved"
  | "longs_filmed"
  | "longs_edited"
  | "views"
  | "followers"
  | "likes"
  | "watch_hours";

export type MetricGroup = "posting" | "making" | "audience";
export const GROUP_LABEL: Record<MetricGroup, string> = { posting: "Posting", making: "Making", audience: "Audience" };

/** Which source data a metric needs (lib/sources.ts loads only these). */
export type Need = "shortPosts" | "shortsCreated" | "shortStages" | "longPosts" | "longsCreated" | "longsFilmed" | "longsEdited" | "daily";

export type IconKind = "short" | "long" | "post" | "idea" | "edit" | "approve" | "film" | "views" | "followers" | "likes" | "watch";

export type MetricDef = {
  id: MetricId;
  group: MetricGroup;
  /** In the picker: "Shorts posted". */
  label: string;
  /** Under it: what counts and when. */
  hint: string;
  /** What one hit is: a short, a long video, a single post, or a number from the platforms. */
  kind: "short" | "long" | "post" | "audience";
  verb: string;
  noun: [one: string, many: string];
  unit: "count" | "views" | "followers" | "likes" | "hours";
  /** Platforms it can be narrowed to (empty: no platform filter). */
  platforms: readonly Platform[];
  /** "Only these platforms": the video goes nowhere else. */
  only?: boolean;
  shortTypes?: boolean;
  longTypes?: boolean;
  /** Views: Shorts or long videos (YouTube shares the split). */
  content?: boolean;
  /** "Whose work": what the person did ("worked on it", "edited it"…), or none. */
  member?: string;
  /** Platform numbers arrive a day late (copied every morning for the day before). */
  lagDays: 0 | 1;
  needs: Need[];
  icon: IconKind;
  /** A sensible first target per period. */
  suggest: Record<PeriodKind, number>;
};

const ALL = PLATFORMS;

export const METRICS: Record<MetricId, MetricDef> = {
  shorts_posted: {
    id: "shorts_posted",
    group: "posting",
    label: "Shorts posted",
    hint: "Each short counts once, on the day it first goes out.",
    kind: "short",
    verb: "Post",
    noun: ["short", "shorts"],
    unit: "count",
    platforms: ALL,
    only: true,
    shortTypes: true,
    member: "worked on it",
    lagDays: 0,
    needs: ["shortPosts"],
    icon: "short",
    suggest: { day: 2, week: 14, month: 60, quarter: 180, year: 700 },
  },
  longs_posted: {
    id: "longs_posted",
    group: "posting",
    label: "Long videos posted",
    hint: "Each long video counts once, on the day it first goes out.",
    kind: "long",
    verb: "Post",
    noun: ["long video", "long videos"],
    unit: "count",
    platforms: ALL,
    only: true,
    longTypes: true,
    member: "worked on it",
    lagDays: 0,
    needs: ["longPosts"],
    icon: "long",
    suggest: { day: 1, week: 1, month: 4, quarter: 12, year: 48 },
  },
  posts_published: {
    id: "posts_published",
    group: "posting",
    label: "Posts on platforms",
    hint: "Every platform counts: one short on four platforms is four posts.",
    kind: "post",
    verb: "Publish",
    noun: ["post", "posts"],
    unit: "count",
    platforms: ALL,
    shortTypes: true,
    longTypes: true,
    content: true,
    member: "worked on it",
    lagDays: 0,
    needs: ["shortPosts", "longPosts"],
    icon: "post",
    suggest: { day: 8, week: 50, month: 200, quarter: 600, year: 2400 },
  },
  shorts_created: {
    id: "shorts_created",
    group: "making",
    label: "New shorts",
    hint: "Shorts added to the list (new ideas), counted the day they're added.",
    kind: "short",
    verb: "Add",
    noun: ["new short", "new shorts"],
    unit: "count",
    platforms: [],
    shortTypes: true,
    member: "added it",
    lagDays: 0,
    needs: ["shortsCreated"],
    icon: "idea",
    suggest: { day: 3, week: 15, month: 60, quarter: 180, year: 700 },
  },
  longs_created: {
    id: "longs_created",
    group: "making",
    label: "Long video ideas",
    hint: "New long videos (ideas), counted the day they're added.",
    kind: "long",
    verb: "Come up with",
    noun: ["long video idea", "long video ideas"],
    unit: "count",
    platforms: [],
    longTypes: true,
    member: "added it",
    lagDays: 0,
    needs: ["longsCreated"],
    icon: "idea",
    suggest: { day: 1, week: 3, month: 10, quarter: 30, year: 120 },
  },
  shorts_edited: {
    id: "shorts_edited",
    group: "making",
    label: "Shorts edited",
    hint: "Counted the first time a short is sent to review after editing.",
    kind: "short",
    verb: "Edit",
    noun: ["short", "shorts"],
    unit: "count",
    platforms: [],
    shortTypes: true,
    member: "edited it",
    lagDays: 0,
    needs: ["shortStages"],
    icon: "edit",
    suggest: { day: 2, week: 14, month: 60, quarter: 180, year: 700 },
  },
  shorts_approved: {
    id: "shorts_approved",
    group: "making",
    label: "Shorts approved",
    hint: "Counted the first time a short is approved and ready to post.",
    kind: "short",
    verb: "Approve",
    noun: ["short", "shorts"],
    unit: "count",
    platforms: [],
    shortTypes: true,
    member: "approved it",
    lagDays: 0,
    needs: ["shortStages"],
    icon: "approve",
    suggest: { day: 2, week: 14, month: 60, quarter: 180, year: 700 },
  },
  longs_filmed: {
    id: "longs_filmed",
    group: "making",
    label: "Long videos filmed",
    hint: "Counted when a long video is marked filmed.",
    kind: "long",
    verb: "Film",
    noun: ["long video", "long videos"],
    unit: "count",
    platforms: [],
    longTypes: true,
    member: "filmed it",
    lagDays: 0,
    needs: ["longsFilmed"],
    icon: "film",
    suggest: { day: 1, week: 1, month: 4, quarter: 12, year: 48 },
  },
  longs_edited: {
    id: "longs_edited",
    group: "making",
    label: "Long videos edited",
    hint: "Counted when a long video's editing is marked complete.",
    kind: "long",
    verb: "Edit",
    noun: ["long video", "long videos"],
    unit: "count",
    platforms: [],
    longTypes: true,
    member: "edited it",
    lagDays: 0,
    needs: ["longsEdited"],
    icon: "edit",
    suggest: { day: 1, week: 1, month: 4, quarter: 12, year: 48 },
  },
  views: {
    id: "views",
    group: "audience",
    label: "Views",
    hint: "From the connected accounts, copied every morning (a day late).",
    kind: "audience",
    verb: "Get",
    noun: ["view", "views"],
    unit: "views",
    platforms: ["youtube", "instagram", "tiktok", "facebook"],
    content: true,
    lagDays: 1,
    needs: ["daily"],
    icon: "views",
    suggest: { day: 30_000, week: 200_000, month: 1_000_000, quarter: 3_000_000, year: 12_000_000 },
  },
  followers: {
    id: "followers",
    group: "audience",
    label: "New followers",
    hint: "Followers and subscribers gained (minus the ones lost), a day late.",
    kind: "audience",
    verb: "Gain",
    noun: ["new follower", "new followers"],
    unit: "followers",
    platforms: ["youtube", "instagram", "tiktok", "facebook"],
    lagDays: 1,
    needs: ["daily"],
    icon: "followers",
    suggest: { day: 100, week: 500, month: 2_000, quarter: 6_000, year: 25_000 },
  },
  likes: {
    id: "likes",
    group: "audience",
    label: "Likes",
    hint: "Likes on YouTube, Instagram and TikTok, a day late.",
    kind: "audience",
    verb: "Get",
    noun: ["like", "likes"],
    unit: "likes",
    platforms: ["youtube", "instagram", "tiktok"],
    lagDays: 1,
    needs: ["daily"],
    icon: "likes",
    suggest: { day: 1_000, week: 7_000, month: 30_000, quarter: 90_000, year: 350_000 },
  },
  watch_hours: {
    id: "watch_hours",
    group: "audience",
    label: "Watch time",
    hint: "Hours watched on YouTube, a day late.",
    kind: "audience",
    verb: "Get",
    noun: ["hour of watch time", "hours of watch time"],
    unit: "hours",
    platforms: [],
    lagDays: 1,
    needs: ["daily"],
    icon: "watch",
    suggest: { day: 100, week: 700, month: 3_000, quarter: 9_000, year: 36_000 },
  },
};

export const METRIC_ORDER: MetricId[] = [
  "shorts_posted",
  "longs_posted",
  "posts_published",
  "shorts_created",
  "longs_created",
  "shorts_edited",
  "shorts_approved",
  "longs_filmed",
  "longs_edited",
  "views",
  "followers",
  "likes",
  "watch_hours",
];

export const isMetricId = (v: unknown): v is MetricId => typeof v === "string" && Object.prototype.hasOwnProperty.call(METRICS, v);

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type ObjectiveFilters = {
  platforms?: Platform[];
  /** Only these platforms: the video goes nowhere else ("Instagram-only reels"). */
  only?: boolean;
  shortTypes?: ShortType[];
  longTypes?: LongType[];
  /** One person's work (a team_members id). */
  member?: string;
  /** Shorts or long videos (views, posts). */
  content?: "shorts" | "long";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only what this metric understands, in a stable order (so two equal filters compare equal). */
export function cleanFilters(metric: MetricId, raw: unknown): ObjectiveFilters {
  const m = METRICS[metric];
  const f = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = <T extends string>(v: unknown, allowed: readonly T[]) => (Array.isArray(v) ? allowed.filter((x) => v.includes(x)) : []);
  // Every platform ticked is the same as none ticked (and "only all of them" is no limit at all).
  let platforms: Platform[] | undefined = list(f.platforms, m.platforms);
  if (!platforms.length || platforms.length >= m.platforms.length) platforms = undefined;
  const only = !!(m.only && f.only === true && platforms);
  const shortTypes = m.shortTypes ? list(f.shortTypes, SHORT_TYPES) : [];
  const longTypes = m.longTypes ? list(f.longTypes, LONG_TYPES) : [];
  const member = m.member && typeof f.member === "string" && UUID.test(f.member) ? f.member.toLowerCase() : undefined;
  let content: "shorts" | "long" | undefined = m.content && (f.content === "shorts" || f.content === "long") ? f.content : undefined;
  // Views: only YouTube splits Shorts from long videos.
  if (content && metric === "views") {
    if (!platforms || (platforms.length === 1 && platforms[0] === "youtube")) platforms = ["youtube"];
    else content = undefined;
  }
  // Built in one fixed order, so equal filters are equal JSON.
  const out: ObjectiveFilters = {};
  if (platforms) out.platforms = platforms;
  if (only) out.only = true;
  if (shortTypes.length && shortTypes.length < SHORT_TYPES.length) out.shortTypes = shortTypes;
  if (longTypes.length && longTypes.length < LONG_TYPES.length) out.longTypes = longTypes;
  if (member) out.member = member;
  if (content) out.content = content;
  return out;
}

export const sameFilters = (a: ObjectiveFilters, b: ObjectiveFilters) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// Colours (validated as a set for colour-blind separation, light and dark:
// the --obj-* tokens in globals.css). New objectives take the next free one.
// ---------------------------------------------------------------------------

/**
 * Objective colours. The first eight were checked as a set (colour-blind
 * separation), so new objectives get those first; sixteen more (1.15.0) can be
 * picked. The ids are stored (objectives.color), so never rename one.
 */
export const OBJECTIVE_COLORS = [
  "blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red",
  "teal", "sky", "indigo", "purple", "fuchsia", "rose", "peach", "lime", "mint", "cyan", "navy", "brown", "slate", "gold", "plum", "olive",
] as const;
export type ObjectiveColor = (typeof OBJECTIVE_COLORS)[number];
export const isObjectiveColor = (v: unknown): v is ObjectiveColor => typeof v === "string" && (OBJECTIVE_COLORS as readonly string[]).includes(v);
export const COLOR_LABEL: Record<ObjectiveColor, string> = {
  blue: "Blue", orange: "Orange", aqua: "Aqua", yellow: "Yellow", magenta: "Pink", green: "Green", violet: "Violet", red: "Red",
  teal: "Teal", sky: "Sky", indigo: "Indigo", purple: "Purple", fuchsia: "Fuchsia", rose: "Rose", peach: "Peach", lime: "Lime", mint: "Mint", cyan: "Cyan", navy: "Navy", brown: "Brown", slate: "Slate", gold: "Gold", plum: "Plum", olive: "Olive",
};
/** The picker's order: round the colour wheel, then the quiet ones. */
export const COLOR_WHEEL: readonly ObjectiveColor[] = [
  "red", "rose", "fuchsia", "magenta", "plum", "purple", "violet", "indigo", "navy", "blue", "sky", "cyan", "teal", "aqua", "mint", "green", "lime", "olive", "yellow", "gold", "orange", "peach", "brown", "slate",
];
export const colorVar = (c: string, alpha?: number) => `rgb(var(--obj-${isObjectiveColor(c) ? c : "blue"})${alpha === undefined ? "" : ` / ${alpha}`})`;
export function nextColor(used: string[]): ObjectiveColor {
  return OBJECTIVE_COLORS.find((c) => !used.includes(c)) ?? OBJECTIVE_COLORS[used.length % OBJECTIVE_COLORS.length];
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export type ObjectiveShape = { metric: string; period: string; target: number; filters?: ObjectiveFilters | null };

const NAME = (p: Platform) => PLATFORM_META[p].name;
/** "YouTube", "YouTube or TikTok", "YouTube, Instagram or TikTok". */
export function orList(xs: string[], word = "or") {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`;
}

/** Instagram and Facebook call short videos reels. */
const shortNoun = (f: ObjectiveFilters, many: boolean) => {
  const p = f.platforms ?? [];
  const reels = f.only && p.length > 0 && p.every((x) => x === "instagram" || x === "facebook");
  return reels ? (many ? "reels" : "reel") : many ? "shorts" : "short";
};

function typeWords(f: ObjectiveFilters) {
  const s = (f.shortTypes ?? []).map((t) => SHORT_TYPE_META[t].label.toLowerCase());
  const l = f.longTypes ?? [];
  return { short: s.length ? `${orList(s)} ` : "", long: l.length ? `${orList(l)} ` : "" };
}

/** "short" / "reels" / "Hub long videos" / "views on Shorts" … (with the type and content words). */
function nounFor(metric: MetricId, f: ObjectiveFilters, many: boolean): string {
  const m = METRICS[metric];
  const t = typeWords(f);
  switch (metric) {
    case "shorts_posted":
      return `${t.short}${shortNoun(f, many)}`;
    case "shorts_created":
      return `new ${t.short}${many ? "shorts" : "short"}`;
    case "shorts_edited":
    case "shorts_approved":
      return `${t.short}${many ? "shorts" : "short"}`;
    case "longs_posted":
    case "longs_filmed":
    case "longs_edited":
      return `${t.long}${many ? "long videos" : "long video"}`;
    case "longs_created":
      return `${t.long}${many ? "long video ideas" : "long video idea"}`;
    case "posts_published":
      return f.content === "shorts" ? (many ? "posts of shorts" : "post of a short") : f.content === "long" ? (many ? "posts of long videos" : "post of a long video") : many ? "posts" : "post";
    case "views":
      return f.content === "shorts" ? (many ? "views on Shorts" : "view on Shorts") : f.content === "long" ? (many ? "views on long videos" : "view on long videos") : many ? "views" : "view";
    default:
      return many ? m.noun[1] : m.noun[0];
  }
}

/** " only on Instagram", " on YouTube or TikTok", "" (anywhere). */
function whereWords(metric: MetricId, f: ObjectiveFilters): string {
  if (metric === "watch_hours") return " on YouTube";
  const p = f.platforms ?? [];
  if (!p.length) return "";
  if (metric === "views" && f.content) return ""; // "views on Shorts" already says YouTube's split
  return f.only ? ` only on ${orList(p.map(NAME))}` : ` on ${orList(p.map(NAME))}`;
}

/** The number the way people say it: 14, 1,200, 250K, 1.5M. */
export function formatAmount(metric: string, n: number, compact = true): string {
  if (!Number.isFinite(n)) return "0";
  const m = isMetricId(metric) ? METRICS[metric] : null;
  if (m?.unit === "hours" && Math.abs(n) < 100 && !Number.isInteger(n)) return (Math.round(n * 10) / 10).toLocaleString("en-US");
  const a = Math.abs(n);
  if (compact && a >= 10_000) {
    if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, "")}B`;
    if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
    return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K`;
  }
  return Math.round(n).toLocaleString("en-US");
}

/** The unit after a number: "shorts", "views", "hours". */
export function unitFor(metric: string, n: number, filters: ObjectiveFilters = {}): string {
  if (!isMetricId(metric)) return "";
  const m = METRICS[metric];
  const many = Math.abs(n) !== 1;
  if (m.unit === "hours") return many ? "hours" : "hour";
  if (m.kind === "audience") return many ? m.noun[1].replace(/^new /, "") : m.noun[0].replace(/^new /, "");
  return nounFor(metric, filters, many).replace(/^new /, "");
}

/**
 * The objective as a sentence: "Post 3 reels only on Instagram every week",
 * "Maria: edit 10 shorts every week", "Get 1M views on YouTube every month".
 */
export function describe(o: ObjectiveShape, memberName?: string | null): string {
  if (!isMetricId(o.metric) || !isPeriodKind(o.period)) return "Counts something this version of the app doesn't know yet.";
  const m = METRICS[o.metric];
  const f = o.filters ?? {};
  const n = formatAmount(o.metric, o.target);
  const s = `${m.verb} ${n} ${nounFor(o.metric, f, o.target !== 1)}${whereWords(o.metric, f)} ${EVERY[o.period]}`;
  return memberName && m.member && f.member ? `For ${memberName}: ${s.charAt(0).toLowerCase()}${s.slice(1)}` : s;
}

/** A short name for a new objective: "Instagram-only reels", "TikTok-only shorts", "YouTube views". */
export function suggestTitle(o: { metric: string; filters?: ObjectiveFilters | null }, memberName?: string | null): string {
  if (!isMetricId(o.metric)) return "Objective";
  const f = o.filters ?? {};
  const p = f.platforms ?? [];
  const names = p.map(NAME);
  const t = typeWords(f);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  let title: string;
  switch (o.metric) {
    case "shorts_posted":
      title = f.only && p.length === 1 ? `${names[0]}-only ${t.short}${shortNoun(f, true)}` : f.only ? `${cap(`${t.short}${shortNoun(f, true)}`)} only on ${orList(names, "and")}` : p.length ? `${cap(`${t.short}shorts`)} on ${orList(names)}` : cap(`${t.short}shorts`);
      break;
    case "longs_posted":
      title = f.only && p.length === 1 ? `${names[0]}-only ${t.long}long videos` : f.only ? `${cap(`${t.long}long videos`)} only on ${orList(names, "and")}` : p.length ? `${cap(`${t.long}long videos`)} on ${orList(names)}` : cap(`${t.long}long videos`);
      break;
    case "posts_published":
      title = `${p.length === 1 ? `${names[0]} posts` : p.length ? `Posts on ${orList(names)}` : "Posts"}${f.content === "shorts" ? " of shorts" : f.content === "long" ? " of long videos" : ""}`;
      break;
    case "shorts_created":
      title = cap(`new ${t.short}shorts`);
      break;
    case "longs_created":
      title = cap(`${t.long}long video ideas`);
      break;
    case "shorts_edited":
      title = cap(`${t.short}shorts edited`);
      break;
    case "shorts_approved":
      title = cap(`${t.short}shorts approved`);
      break;
    case "longs_filmed":
      title = cap(`${t.long}long videos filmed`);
      break;
    case "longs_edited":
      title = cap(`${t.long}long videos edited`);
      break;
    case "views":
      title = f.content === "shorts" ? "Views on Shorts" : f.content === "long" ? "Views on long videos" : p.length === 1 ? `${names[0]} views` : p.length ? `Views on ${orList(names)}` : "Views";
      break;
    case "followers":
      title = p.length === 1 ? `New ${names[0]} followers` : p.length ? `New followers on ${orList(names)}` : "New followers";
      break;
    case "likes":
      title = p.length === 1 ? `${names[0]} likes` : p.length ? `Likes on ${orList(names)}` : "Likes";
      break;
    case "watch_hours":
      title = "Watch time";
      break;
  }
  if (memberName && f.member && METRICS[o.metric].member) title = `${title} by ${memberName}`;
  return title.length > 80 ? `${title.slice(0, 79)}…` : title;
}

/** Quick starts in Team → Objectives (the owner's examples first). */
export const TEMPLATES: { key: string; metric: MetricId; period: PeriodKind; target: number; filters: ObjectiveFilters }[] = [
  { key: "shorts-week", metric: "shorts_posted", period: "week", target: 14, filters: {} },
  { key: "longs-month", metric: "longs_posted", period: "month", target: 2, filters: {} },
  { key: "ig-only", metric: "shorts_posted", period: "week", target: 3, filters: { platforms: ["instagram"], only: true } },
  { key: "tt-only", metric: "shorts_posted", period: "week", target: 3, filters: { platforms: ["tiktok"], only: true } },
  { key: "sponsor-month", metric: "shorts_posted", period: "month", target: 4, filters: { shortTypes: ["sponsorship"] } },
  { key: "ideas-week", metric: "longs_created", period: "week", target: 3, filters: {} },
  { key: "views-month", metric: "views", period: "month", target: 1_000_000, filters: {} },
  { key: "followers-month", metric: "followers", period: "month", target: 2_000, filters: {} },
];

/** Everything a draft objective needs before it can be saved; null = fine. */
export function draftProblem(d: { title: string; metric: string; period: string; target: number; color: string }): string | null {
  if (!isMetricId(d.metric)) return "Pick what to count.";
  if (!isPeriodKind(d.period)) return "Pick how often.";
  if (!Number.isInteger(d.target) || d.target < 1) return "The target has to be at least 1.";
  if (d.target > 1_000_000_000) return "That target is too big.";
  const t = d.title.trim();
  if (!t) return "Give it a name.";
  if (t.length > 80) return "Keep the name under 80 characters.";
  if (!isObjectiveColor(d.color)) return "Pick a colour.";
  return null;
}
