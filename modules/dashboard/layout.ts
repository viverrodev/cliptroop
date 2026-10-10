/** Dashboard Studio: which widgets, where, how big, their settings. */
import { COLS, compact, firstFit, type Box, type Limits } from "./grid";

export type WidgetType =
  | "tasks"
  | "contributions"
  | "todo"
  | "teams"
  | "clock"
  | "minicalendar"
  | "upcomingShorts"
  | "upcomingLongs"
  | "pipeline"
  | "posting"
  | "weather"
  | "meetings"
  | "views"
  | "followers"
  | "topVideos"
  | "audienceMap"
  | "output"
  | "word"
  | "objectives";

/**
 * One widget on the 12 column grid: x/y = column/row of its top-left
 * corner, w/h = columns/rows it covers. `fixed` = you sized it yourself,
 * so "Fill empty space" leaves it at exactly that size.
 */
export type WidgetInstance = { id: string; type: WidgetType; x: number; y: number; w: number; h: number; fixed?: boolean; settings?: Record<string, unknown> };

/** The Contributions widget's colours (its settings list them without loading the widget). */
export const CONTRIB_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#eab308", "#14b8a6"];
export type Layout = { v: 2; widgets: WidgetInstance[]; fill: boolean; sounds: boolean };

/**
 * Stacked (boards under 1100px: 2 per row, under 600px: 1 per row), where
 * there's no dragging: rows of 60px (+12px gap). `span` 2 = the full width
 * in 2-per-row (default: wide widgets, w ≥ 6). Height = the widget's own
 * height kept between `min` and `max`; `phone` = rows when 1 per row (else
 * the same). Sized so each one reads and taps well on a phone.
 */
export type Stack = { span?: 1 | 2; min: number; max: number; phone?: number | ((settings?: Record<string, unknown>) => number) };
/** `isNew`: shown first in Add a widget, with a "New" badge (for a release or two). */
type Meta = { name: string; description: string; w: number; h: number; limits: Limits; bare?: boolean; settings?: Record<string, unknown>; stack: Stack; isNew?: boolean };

/** Every widget once per dashboard. w/h = size when added. */
export const CATALOG: Record<WidgetType, Meta> = {
  tasks: { name: "My tasks", description: "What you need to do: overdue, today, coming up.", w: 4, h: 6, limits: { minW: 3, minH: 3, maxW: 12, maxH: 12 } , stack: { min: 5, max: 8, phone: 5 } },
  teams: { name: "Teams", description: "Your teams and who's in them. Click to switch.", w: 2, h: 2, limits: { minW: 2, minH: 2, maxW: 6, maxH: 6 } , stack: { min: 2, max: 4 } },
  clock: { name: "Clock", description: "A clock face with moving hands, the time and date.", w: 2, h: 2, limits: { minW: 2, minH: 2, maxW: 4, maxH: 4 }, bare: true, settings: { h24: true, secondHand: true } , stack: { min: 2, max: 3, phone: 2 } },
  word: { name: "Daily word", description: "Start your day with a five-letter word. Finishing it counts as a contribution.", w: 2, h: 3, limits: { minW: 2, minH: 2, maxW: 4, maxH: 6 }, stack: { min: 3, max: 4, phone: 4 } },
  // Objectives (1.14.0): loads its own numbers and stays live.
  objectives: { name: "Objectives", description: "The team's goals as rings that fill up live as videos go out, with what's left and the days to go. Confetti when one is reached.", w: 4, h: 3, limits: { minW: 2, minH: 2, maxW: 12, maxH: 8 }, settings: { show: "all" }, stack: { min: 3, max: 6, phone: 4 }, isNew: true },
  posting: { name: "Posting today", description: "Today's posts per short, where each platform stands, with filters; and anything that failed.", w: 2, h: 3, limits: { minW: 2, minH: 2, maxW: 6, maxH: 8 } , stack: { min: 2, max: 4, phone: 3 } },
  todo: { name: "To-do list", description: "Your own list: priorities, due dates, notes.", w: 2, h: 4, limits: { minW: 2, minH: 3, maxW: 6, maxH: 12 } , stack: { min: 5, max: 8, phone: 5 } },
  upcomingShorts: { name: "Upcoming shorts", description: "The next shorts by date, with their step and editor.", w: 2, h: 4, limits: { minW: 2, minH: 2, maxW: 6, maxH: 12 } , stack: { min: 5, max: 8, phone: 6 } },
  minicalendar: { name: "Calendar", description: "This month with shorts and long videos marked.", w: 2, h: 4, limits: { minW: 2, minH: 4, maxW: 4, maxH: 8 } , stack: { min: 6, max: 7, phone: 6 } },
  upcomingLongs: { name: "Long videos", description: "Long videos in progress, with thumbnails and dates.", w: 4, h: 3, limits: { minW: 2, minH: 2, maxW: 8, maxH: 10 } , stack: { min: 4, max: 7, phone: 5 } },
  contributions: { name: "Contributions", description: "A year of finished tasks, one square per day.", w: 6, h: 3, limits: { minW: 4, minH: 3, maxW: 12, maxH: 5 }, settings: { color: "#22c55e", scope: "all" } , stack: { span: 2, min: 3, max: 4, phone: 3 } },
  pipeline: { name: "Pipeline", description: "How many videos sit at each step: bottlenecks at a glance.", w: 12, h: 4, limits: { minW: 3, minH: 3, maxW: 12, maxH: 6 } , stack: { span: 2, min: 4, max: 6, phone: 5 } },
  meetings: { name: "Next meeting", description: "The next team meeting: when, where, who's coming. Answer right here.", w: 4, h: 2, limits: { minW: 2, minH: 2, maxW: 8, maxH: 6 } , stack: { min: 2, max: 4, phone: 3 } },
  weather: { name: "Weather", description: "Now and the next days, for your city.", w: 2, h: 2, limits: { minW: 2, minH: 2, maxW: 6, maxH: 4 }, bare: true, settings: { units: "c" } , stack: { min: 2, max: 3, phone: 2 } },
  // Analytics (1.5): each loads its own numbers when it appears.
  output: { name: "This week", description: "Shorts and long videos out in the last 7 days, how many on time, and what's late.", w: 6, h: 2, limits: { minW: 2, minH: 2, maxW: 12, maxH: 4 } , stack: { min: 3, max: 3, phone: 3 } },
  views: { name: "Views", description: "Views on YouTube, Instagram and TikTok in the last 7 days, and the trend.", w: 3, h: 3, limits: { minW: 2, minH: 2, maxW: 8, maxH: 6 } , stack: { min: 3, max: 4, phone: 3 } },
  followers: { name: "Followers", description: "Subscribers and followers on each platform, and how they changed.", w: 3, h: 3, limits: { minW: 2, minH: 2, maxW: 6, maxH: 5 } , stack: { min: 4, max: 5, phone: 4 } },
  topVideos: { name: "Top videos", description: "Your best videos of the last 28 days, by views.", w: 4, h: 4, limits: { minW: 3, minH: 3, maxW: 8, maxH: 10 } , stack: { span: 2, min: 4, max: 6, phone: 5 } },
  audienceMap: { name: "Audience map", description: "Where your audience is, last 28 days: a world map or a 3D globe of YouTube views, followers, or all platforms together.", w: 6, h: 4, limits: { minW: 3, minH: 3, maxW: 12, maxH: 8 }, settings: { view: "map", mode: "all" } , stack: { span: 2, min: 5, max: 7, phone: (st) => (st?.view === "globe" ? 7 : 5) } },
};

export const LIMITS_BY_TYPE = Object.fromEntries(Object.entries(CATALOG).map(([k, v]) => [k, v.limits])) as Record<WidgetType, Limits>;

/** The arrangement from the team's favourite screenshot (6 columns there, 12 here). */
export const DEFAULT_LAYOUT: Layout = {
  v: 2,
  fill: true,
  sounds: true,
  widgets: [
    { id: "w-tasks", type: "tasks", x: 0, y: 0, w: 4, h: 6 },
    { id: "w-teams", type: "teams", x: 4, y: 0, w: 2, h: 2 },
    { id: "w-clock", type: "clock", x: 6, y: 0, w: 2, h: 2, settings: { h24: true, secondHand: true } },
    { id: "w-posting", type: "posting", x: 8, y: 0, w: 2, h: 2 },
    { id: "w-todo", type: "todo", x: 10, y: 0, w: 2, h: 4 },
    { id: "w-shorts", type: "upcomingShorts", x: 4, y: 2, w: 2, h: 4 },
    { id: "w-cal", type: "minicalendar", x: 6, y: 2, w: 2, h: 4 },
    { id: "w-longs", type: "upcomingLongs", x: 8, y: 4, w: 4, h: 3 },
    { id: "w-contrib", type: "contributions", x: 0, y: 6, w: 6, h: 3, settings: { color: "#22c55e", scope: "all" } },
    { id: "w-meetings", type: "meetings", x: 8, y: 7, w: 4, h: 2 },
    { id: "w-pipeline", type: "pipeline", x: 0, y: 9, w: 12, h: 4 },
  ],
};

export const toBox = (w: WidgetInstance): Box => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h });
export const limitsFor = (widgets: WidgetInstance[]) => Object.fromEntries(widgets.map((w) => [w.id, CATALOG[w.type].limits])) as Record<string, Limits>;

/** Puts boxes (from the engine) back onto the widgets. */
export function applyBoxes(widgets: WidgetInstance[], boxes: Box[]): WidgetInstance[] {
  const m = new Map(boxes.map((b) => [b.i, b]));
  return widgets.map((w) => {
    const b = m.get(w.id);
    return b ? { ...w, x: b.x, y: b.y, w: b.w, h: b.h } : w;
  });
}

/** Adds a widget in the first free spot that fits. */
export function addWidget(l: Layout, type: WidgetType): { layout: Layout; id: string } {
  const meta = CATALOG[type];
  const id = `w-${type}-${Date.now().toString(36)}`;
  const spot = firstFit(l.widgets.map(toBox), id, meta.w, meta.h);
  const widgets = [...l.widgets, { id, type, x: spot.x, y: spot.y, w: spot.w, h: spot.h, settings: meta.settings ? { ...meta.settings } : {} }];
  return { layout: { ...l, widgets: applyBoxes(widgets, compact(widgets.map(toBox))) }, id };
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/**
 * A saved layout, cleaned up: unknown widgets dropped, one of each type,
 * sizes inside their limits, nothing overlapping. Old layouts (v1: an
 * order + S/M/L sizes) become the default arrangement with your widgets
 * and settings kept.
 */
export function readLayout(raw: unknown): Layout {
  const l = raw as { v?: number; widgets?: unknown[]; fill?: unknown; sounds?: unknown } | null;
  if (!l || !Array.isArray(l.widgets)) return DEFAULT_LAYOUT;
  const seen = new Set<string>();
  const ok = (l.widgets as Partial<WidgetInstance>[]).filter(
    (w) => w && typeof w.id === "string" && typeof w.type === "string" && w.type in CATALOG && !seen.has(w.type) && (seen.add(w.type), true)
  ) as WidgetInstance[];

  if (l.v === 1) {
    const kept = new Map(ok.map((w) => [w.type, w]));
    let out: Layout = { ...DEFAULT_LAYOUT, widgets: DEFAULT_LAYOUT.widgets.filter((d) => kept.has(d.type)).map((d) => ({ ...d, settings: kept.get(d.type)?.settings ?? d.settings })) };
    for (const w of ok)
      if (!out.widgets.some((d) => d.type === w.type)) {
        const r = addWidget(out, w.type);
        out = { ...r.layout, widgets: r.layout.widgets.map((x) => (x.id === r.id ? { ...x, settings: w.settings ?? x.settings } : x)) };
      }
    return out;
  }
  if (l.v !== 2) return DEFAULT_LAYOUT;

  const widgets: WidgetInstance[] = ok.map((w) => {
    const lim = CATALOG[w.type].limits;
    const ww = Math.max(lim.minW, Math.min(lim.maxW, Math.round(num(w.w, CATALOG[w.type].w))));
    return {
      id: w.id,
      type: w.type,
      w: ww,
      h: Math.max(lim.minH, Math.min(lim.maxH, Math.round(num(w.h, CATALOG[w.type].h)))),
      x: Math.max(0, Math.min(COLS - ww, Math.round(num(w.x, 0)))),
      y: Math.max(0, Math.round(num(w.y, 0))),
      fixed: w.fixed === true || undefined,
      settings: w.settings && typeof w.settings === "object" ? w.settings : undefined,
    };
  });
  // Overlaps (hand-edited or from an old bug) are pushed apart.
  return { v: 2, fill: l.fill !== false, sounds: l.sounds !== false, widgets: applyBoxes(widgets, compact(widgets.map(toBox))) };
}
