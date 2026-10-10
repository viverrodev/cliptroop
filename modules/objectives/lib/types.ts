/**
 * Shapes shared by the objectives engine (server) and its screens (browser).
 */
import type { Platform, ShortType } from "@/modules/short-videos/lib/constants";
import type { LocalNow, PeriodKind } from "./periods";
import type { IconKind, MetricId, ObjectiveFilters } from "./metrics";

// ---------------------------------------------------------------------------
// Source data (what lib/sources.ts loads; lib/hits.ts turns it into hits)
// ---------------------------------------------------------------------------

export type ShortSrc = {
  id: string;
  number: number;
  title: string;
  platforms: Platform[];
  type: ShortType;
  createdAt: string;
  /** A user id. */
  createdBy: string | null;
  /** team_members ids. */
  scripters: string[];
  editor: string | null;
  reviewer: string | null;
  scheduler: string | null;
};

export type LongSrc = {
  id: string;
  number: number;
  title: string;
  platforms: Platform[];
  types: string[];
  stage: string;
  createdAt: string;
  /** User ids. */
  createdBy: string | null;
  filmedAt: string | null;
  filmedBy: string | null;
  editedAt: string | null;
  editedBy: string | null;
  /** When every platform was ticked (or, for old videos, published). */
  postedAt: string | null;
  /** team_members ids per step. */
  assignees: { stage: string; member: string }[];
  scripters: string[];
};

export type PostSrc = { platform: Platform; at: string };
export type StageSrc = { stage: string; at: string };
export type DailyRow = {
  platform: string;
  day: string;
  content: string;
  views?: number | string | null;
  likes?: number | string | null;
  watch_minutes?: number | string | null;
  followers_gained?: number | string | null;
  followers_lost?: number | string | null;
  followers?: number | string | null;
  total_views?: number | string | null;
  total_likes?: number | string | null;
};

export type Sources = {
  tz: string;
  shorts: Map<string, ShortSrc>;
  /** Every post of each short that had one in the loaded range (earlier ones too: "first post"). */
  shortPosts: Map<string, PostSrc[]>;
  /** Moves into review / ready / posted, for each short that had one in the range (earlier ones too). */
  shortStages: Map<string, StageSrc[]>;
  longs: Map<string, LongSrc>;
  longPosts: Map<string, PostSrc[]>;
  daily: DailyRow[];
  /** user id → team_members id */
  userMember: Map<string, string>;
};

// ---------------------------------------------------------------------------
// Hits: one counted thing (a short, a long video, a post, a day's numbers)
// ---------------------------------------------------------------------------

export type HitRef = { kind: "short" | "long"; id: string; number: number; title: string };
/** Who did what on a counted thing (team_members id + their part). */
export type Credit = { member: string; role: "idea" | "script" | "research" | "film" | "edit" | "review" | "package" | "post" };
export type Hit = {
  key: string;
  /** The team's local day it counts on. */
  day: string;
  /** The exact moment (null for a day's platform numbers). */
  at: string | null;
  value: number;
  platform?: Platform;
  ref?: HitRef;
  people: Credit[];
};

// ---------------------------------------------------------------------------
// What the screens get
// ---------------------------------------------------------------------------

/**
 * "before": a period from before the objective was set (shown, never judged).
 * "nodata": a finished period with no platform numbers at all (no account
 * connected then): not counted either way.
 */
export type Status = "reached" | "ahead" | "on_track" | "behind" | "off" | "missed" | "upcoming" | "before" | "nodata";

export type PersonLite = { memberId: string; userId: string | null; name: string; avatarUrl: string | null; color: string };

export type WinnerView = { kind: "short" | "long" | "day"; number?: number; title?: string; id?: string; platform?: Platform | null; people: string[] };

export type PeriodView = {
  start: string;
  end: string;
  /** "This week", "Last week", "Week of Sep 28" */
  label: string;
  /** "Oct 5 to 11" */
  range: string;
  /** The target that applies (0 = off that period). */
  target: number;
  value: number;
  reached: boolean;
  /** When it crossed the target (ISO), or the day for platform numbers. */
  reachedAt: string | null;
  reachedDay: string | null;
  status: Status;
};

export type ItemView = {
  key: string;
  kind: "short" | "long" | "day";
  id?: string;
  number?: number;
  title: string;
  href?: string;
  platform?: Platform | null;
  day: string;
  at: string | null;
  value: number;
  /** team_members ids. */
  people: string[];
};

export type Contributor = { memberId: string; count: number; roles: Credit["role"][] };

export type CurrentView = PeriodView & {
  /** 0 to 1: how much of the period has gone by. */
  fraction: number;
  /** Where the count should be by now to stay on pace. */
  expected: number;
  /** At this pace, the count at the end (null early on). */
  forecast: number | null;
  /** How many a day are still needed (null once reached or over). */
  perDay: number | null;
  daysLeft: number;
  winner: WinnerView | null;
  items: ItemView[];
  contributors: Contributor[];
};

export type ObjectiveView = {
  id: string;
  title: string;
  metric: MetricId | string;
  /** False: a metric this version doesn't know (made by a newer version). */
  known: boolean;
  period: PeriodKind;
  /** The usual target. */
  target: number;
  filters: ObjectiveFilters;
  color: string;
  position: number;
  paused: boolean;
  createdAt: string;
  /** "Post 3 reels only on Instagram every week" */
  sentence: string;
  metricLabel: string;
  icon: IconKind;
  /** One platform chosen: its logo stands for the objective. */
  platform: Platform | null;
  lagDays: number;
  current: CurrentView;
  /** Oldest first, the current period last. */
  history: PeriodView[];
  stats: { streak: number; best: number; reached: number; counted: number; average: number | null };
  /** Targets set for single periods, from the current one on. */
  overrides: { start: string; target: number }[];
};

export type WinView = {
  objectiveId: string;
  title: string;
  color: string;
  period: PeriodKind;
  start: string;
  label: string;
  value: number;
  target: number;
  metric: string;
  reachedAt: string;
  celebratedAt: string | null;
  winner: WinnerView | null;
};

export type Board = {
  teamId: string;
  tz: string;
  today: string;
  now: LocalNow;
  generatedAt: string;
  objectives: ObjectiveView[];
  wins: WinView[];
  people: Record<string, PersonLite>;
  /** Is any platform connected for numbers (views, followers…)? */
  audienceReady: boolean;
};
