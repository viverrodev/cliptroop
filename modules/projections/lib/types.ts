/** Shapes shared by the projections server code and its screens. */
import type { Platform } from "@/modules/short-videos/lib/constants";
import type { Assessment, Point } from "./compute";
import type { ProjGroup, ProjScope } from "./metrics";

export type ProjectionRow = {
  id: string;
  team_id: string;
  title: string;
  metric: string;
  scope: unknown;
  target: number | string;
  direction: "up" | "down";
  start_day: string;
  deadline: string;
  start_value: number | string | null;
  baseline: unknown;
  color: string;
  note: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  achieved_at: string | null;
  achieved_value: number | string | null;
  ended_at: string | null;
  ended_value: number | string | null;
  archived_at: string | null;
};
export const PROJECTION_COLS =
  "id, team_id, title, metric, scope, target, direction, start_day, deadline, start_value, baseline, color, note, position, created_by, created_at, achieved_at, achieved_value, ended_at, ended_value, archived_at";

/** What was kept the day a projection was set (for Compare). */
export type Baseline = { at: string | null; values: Record<string, number | null>; followers: Record<string, number | null> };

export type ProjectionView = {
  id: string;
  title: string;
  metric: string;
  /** False: made by a newer version of the app. */
  known: boolean;
  label: string;
  group: ProjGroup | null;
  scope: ProjScope;
  /** The one platform it's about (its logo), if just one. */
  platform: Platform | null;
  target: number;
  direction: "up" | "down";
  startDay: string;
  deadline: string;
  color: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  archived: boolean;
  money: boolean;
  /** "Reach 100K followers on YouTube by Jan 10, 2027." */
  sentence: string;
  startValue: number | null;
  current: number | null;
  achievedAt: string | null;
  achievedValue: number | null;
  endedAt: string | null;
  endedValue: number | null;
  points: Point[];
  a: Assessment;
  baseline: Baseline;
};

export type ProjectionsBoard = {
  ready: boolean;
  teamId: string;
  today: string;
  tz: string;
  currency: string;
  /** Can see money projections and the money numbers in Compare. */
  money: boolean;
  projections: ProjectionView[];
  /** The key numbers right now (Compare's "now" column). */
  now: Baseline;
};
