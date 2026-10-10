"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import dynamic from "next/dynamic";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { MAP_MODES } from "@/modules/analytics/lib/map-modes";
import { CloseIcon, FillIcon, GripIcon, PlusIcon, ResizeCornerIcon, SettingsIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { sounds } from "@/lib/sounds";
import { saveLayout } from "../actions";
import { COLS, bottom, fill, preview as previewBoxes, compact, readingOrder, type Box, type Interaction } from "../grid";
import { CATALOG, CONTRIB_COLORS, DEFAULT_LAYOUT, addWidget, applyBoxes, limitsFor, toBox, type Layout, type WidgetInstance, type WidgetType } from "../layout";
import type { Done, Pipeline, PostToday, Task, TeamCard, TeamTasks, Todo, UpcomingLong, UpcomingShort } from "../lib/queries";
import { BoxContext } from "./widget-box";
import { WidgetBoundary } from "./widget-boundary";
import type { Meeting } from "@/modules/meetings/lib/types";

/** A widget's box before it's drawn (and while its code downloads). */
function WidgetSkeleton() {
  return (
    <div className="space-y-2 pt-0.5" aria-hidden>
      <div className="h-3 w-2/3 rounded bg-surface-2/70" />
      <div className="h-3 w-1/2 rounded bg-surface-2/50" />
    </div>
  );
}

/*
 * Each widget's code is downloaded only when it's on the board (or the
 * widget library is open), so the dashboard loads just what it shows.
 * While it downloads, its box shows the same skeleton as before widgets
 * are drawn. PRELOAD starts the downloads early (see DashboardStudio).
 */
const TasksWidget = dynamic(() => import("./tasks-widget").then((m) => m.TasksWidget), { ssr: false, loading: WidgetSkeleton });
const ContributionsWidget = dynamic(() => import("./contributions-widget").then((m) => m.ContributionsWidget), { ssr: false, loading: WidgetSkeleton });
const TodoWidget = dynamic(() => import("./todo-widget").then((m) => m.TodoWidget), { ssr: false, loading: WidgetSkeleton });
const ClockWidget = dynamic(() => import("./small-widgets").then((m) => m.ClockWidget), { ssr: false, loading: WidgetSkeleton });
const MiniCalendarWidget = dynamic(() => import("./small-widgets").then((m) => m.MiniCalendarWidget), { ssr: false, loading: WidgetSkeleton });
const TeamsWidget = dynamic(() => import("./small-widgets").then((m) => m.TeamsWidget), { ssr: false, loading: WidgetSkeleton });
const PipelineWidget = dynamic(() => import("./team-widgets").then((m) => m.PipelineWidget), { ssr: false, loading: WidgetSkeleton });
const PostingTodayWidget = dynamic(() => import("./team-widgets").then((m) => m.PostingTodayWidget), { ssr: false, loading: WidgetSkeleton });
const UpcomingLongsWidget = dynamic(() => import("./team-widgets").then((m) => m.UpcomingLongsWidget), { ssr: false, loading: WidgetSkeleton });
const UpcomingShortsWidget = dynamic(() => import("./team-widgets").then((m) => m.UpcomingShortsWidget), { ssr: false, loading: WidgetSkeleton });
const WeatherWidget = dynamic(() => import("./team-widgets").then((m) => m.WeatherWidget), { ssr: false, loading: WidgetSkeleton });
const WeatherCitySearch = dynamic(() => import("./team-widgets").then((m) => m.WeatherCitySearch), { ssr: false, loading: WidgetSkeleton });
const WordWidget = dynamic(() => import("./word-widget").then((m) => m.WordWidget), { ssr: false, loading: WidgetSkeleton });
const ObjectivesWidget = dynamic(() => import("./objectives-widget").then((m) => m.ObjectivesWidget), { ssr: false, loading: WidgetSkeleton });
const ObjectivesWidgetSettingsForm = dynamic(() => import("./objectives-widget").then((m) => m.ObjectivesWidgetSettingsForm), { ssr: false, loading: WidgetSkeleton });
const MeetingsWidget = dynamic(() => import("./meetings-widget").then((m) => m.MeetingsWidget), { ssr: false, loading: WidgetSkeleton });
const AudienceMapWidget = dynamic(() => import("./analytics-widgets").then((m) => m.AudienceMapWidget), { ssr: false, loading: WidgetSkeleton });
const FollowersWidget = dynamic(() => import("./analytics-widgets").then((m) => m.FollowersWidget), { ssr: false, loading: WidgetSkeleton });
const OutputWidget = dynamic(() => import("./analytics-widgets").then((m) => m.OutputWidget), { ssr: false, loading: WidgetSkeleton });
const TopVideosWidget = dynamic(() => import("./analytics-widgets").then((m) => m.TopVideosWidget), { ssr: false, loading: WidgetSkeleton });
const ViewsWidget = dynamic(() => import("./analytics-widgets").then((m) => m.ViewsWidget), { ssr: false, loading: WidgetSkeleton });

const PRELOAD: Record<WidgetType, () => Promise<unknown>> = {
  tasks: () => import("./tasks-widget"),
  contributions: () => import("./contributions-widget"),
  todo: () => import("./todo-widget"),
  teams: () => import("./small-widgets"),
  clock: () => import("./small-widgets"),
  minicalendar: () => import("./small-widgets"),
  upcomingShorts: () => import("./team-widgets"),
  upcomingLongs: () => import("./team-widgets"),
  pipeline: () => import("./team-widgets"),
  posting: () => import("./team-widgets"),
  weather: () => import("./team-widgets"),
  meetings: () => import("./meetings-widget"),
  views: () => import("./analytics-widgets"),
  followers: () => import("./analytics-widgets"),
  topVideos: () => import("./analytics-widgets"),
  audienceMap: () => import("./analytics-widgets"),
  output: () => import("./analytics-widgets"),
  word: () => import("./word-widget"),
  objectives: () => import("./objectives-widget"),
};

/** Starts downloading these widgets' code (each once; a failure shows in the widget's own box). */
function preload(types: Iterable<WidgetType>) {
  if (typeof window === "undefined") return;
  for (const t of new Set(types)) PRELOAD[t]?.().catch(() => {});
}
const preloadAll = () => preload(Object.keys(CATALOG) as WidgetType[]);

export type StudioData = {
  tasks: Task[];
  done: Done[];
  /** Everyone's tasks, when the team shares them (null: it doesn't, or before 0076). */
  teamTasks?: TeamTasks | null;
  todos: Todo[];
  teams: TeamCard[];
  teamId: string;
  upcomingShorts: UpcomingShort[];
  upcomingLongs: UpcomingLong[];
  pipeline: Pipeline;
  posts: PostToday[];
  /** Upcoming meetings (empty before migration 0057). */
  meetings?: Meeting[];
};

const GAP = 12;
/**
 * Below this board width widgets stack, 2 per row (small laptops, tablets) or
 * 1 (phones): no dragging there. Same widths as the @container rules for
 * .dash-board in globals.css. 1.9.6: 1100 (was 960), since 12 columns got
 * too small to read on ~1280px screens.
 */
const NARROW = 1100;

// False on the server and while hydrating, true after: widget contents
// depend on this device's clock, time zone and language, so they only
// render in the browser (boxes have fixed sizes, so nothing jumps).
const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Board size in px, same formula as .dash-board in globals.css. */
type Metrics = { W: number; col: number; row: number; narrow: boolean };
const metricsFor = (W: number): Metrics => {
  const rowh = Math.min(80, Math.max(56, W / 24));
  return { W, col: (W + GAP) / COLS, row: rowh + GAP, narrow: W < NARROW };
};

/**
 * The dashboard. "Customize" turns it into the Studio: drag any widget
 * anywhere, pull its edges to resize, add or remove widgets. Others make
 * room with animation; "Fill empty space" grows widgets into gaps.
 */
export function DashboardStudio({ name, initial, data }: { name: string; initial: Layout; data: StudioData }) {
  const toast = useToast();
  const [layout, setLayout] = useState(initial);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [library, setLibrary] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const editing = !!draft;
  const shown = draft ?? layout;
  const mounted = useMounted();
  // The board's widgets start downloading while the page wakes up (drawn once it has).
  useState(() => preload(initial.widgets.map((w) => w.type)));
  const [hello, setHello] = useState("Welcome back");
  useEffect(() => setHello(greeting()), []);

  function save() {
    if (!draft) return;
    start(async () => {
      const r = await saveLayout(draft);
      if (r.error) return void toast.error(r.error);
      setLayout(draft);
      setDraft(null);
      toast.success("Dashboard saved");
    });
  }
  const edit = () => {
    preloadAll(); // the library shows every widget
    setDraft(structuredClone(layout));
  };
  const set = (patch: Partial<Layout>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const active = data.tasks.filter((t) => t.state === "active").length;
  const editingWidget = shown.widgets.find((w) => w.id === settingsFor) ?? null;
  const onBoard = new Set(shown.widgets.map((w) => w.type));

  return (
    <div className="px-3 sm:px-5 xl:px-6 py-4 sm:py-5 w-full">
      <header className="flex items-center gap-3 flex-wrap mb-4">
        {/* Never narrower than ~15rem: on phones the Customize toolbar wraps below instead of squeezing the greeting. */}
        <div className="flex-1 min-w-[min(100%,15rem)]">
          <h1 className="font-display text-[22px] sm:text-[24px] font-semibold leading-tight">
            {hello}, {name}
          </h1>
          <p className="text-[13px] text-ink-soft">{active ? `You have ${active} thing${active === 1 ? "" : "s"} on your plate.` : "Nothing on your plate right now."}</p>
        </div>
        {!editing ? (
          <button type="button" onClick={edit} onPointerEnter={preloadAll} onFocus={preloadAll} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 hover:bg-surface-2">
            <SettingsIcon className="w-3.5 h-3.5" />
            Customize
          </button>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto animate-[modalin_.2s_var(--ease-out)]">
            <button type="button" onClick={() => setLibrary(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 h-8 text-[12.5px] font-semibold hover:border-line/40 hover:bg-surface-2">
              <PlusIcon className="w-3.5 h-3.5" />
              Add widget
            </button>
            <Toggle on={shown.fill} onChange={(v) => set({ fill: v })} label="Fill empty space" icon={<FillIcon className="w-3.5 h-3.5" />} />
            <span className="w-px h-5 bg-line/15 mx-0.5" />
            <button type="button" onClick={() => setDraft(structuredClone({ ...DEFAULT_LAYOUT, sounds: shown.sounds }))} className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Reset
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="ml-auto sm:ml-0 rounded-lg bg-amber text-white font-bold px-4 h-8 text-[12.5px] disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </header>

      <Board
        layout={shown}
        editing={editing}
        mounted={mounted}
        fresh={fresh}
        data={data}
        onChange={(widgets) => setDraft((d) => (d ? { ...d, widgets } : d))}
        onSettings={setSettingsFor}
      />

      {!shown.widgets.length && (
        <div className="rounded-xl border border-dashed border-line/25 py-12 text-center">
          <p className="text-[14px] text-ink-soft mb-3">Your dashboard is empty.</p>
          <button
            type="button"
            onClick={() => {
              if (!editing) edit();
              setLibrary(true);
            }}
            className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px]"
          >
            Add a widget
          </button>
        </div>
      )}

      <Dialog open={library} onClose={() => setLibrary(false)} title="Add a widget" description="Tap one to put it on your dashboard. You can move and resize it after." width="sm:max-w-5xl">
        {library && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(CATALOG) as WidgetType[])
              .sort((a, b) => Number(!!CATALOG[b].isNew) - Number(!!CATALOG[a].isNew))
              .map((type) => (
              <LibraryTile
                key={type}
                type={type}
                added={onBoard.has(type)}
                data={data}
                onAdd={() => {
                  const base = draft ?? structuredClone(layout);
                  const r = addWidget(base, type);
                  setDraft(r.layout);
                  setFresh(r.id);
                  setLibrary(false);
                  sounds.pop();
                  setTimeout(() => setFresh((f) => (f === r.id ? null : f)), 900);
                }}
              />
            ))}
          </div>
        )}
      </Dialog>

      <Dialog open={!!editingWidget} onClose={() => setSettingsFor(null)} title={editingWidget ? `${CATALOG[editingWidget.type].name} settings` : ""}>
        {editingWidget && (
          <WidgetSettings
            w={editingWidget}
            teamId={data.teamId}
            onChange={(settings) => {
              // Settings apply right away (saved with the layout).
              const apply = (ws: WidgetInstance[]) => ws.map((x) => (x.id === editingWidget.id ? { ...x, settings: { ...x.settings, ...settings } } : x));
              if (draft) setDraft({ ...draft, widgets: apply(draft.widgets) });
              else {
                const next = { ...layout, widgets: apply(layout.widgets) };
                setLayout(next);
                void saveLayout(next);
              }
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function Toggle({ on, onChange, label, icon }: { on: boolean; onChange: (v: boolean) => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-[12.5px] font-semibold transition-colors ${on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Board: placement, drag, resize
// ---------------------------------------------------------------------------

type Grab = {
  id: string;
  kind: "move" | "resize";
  edge: "r" | "b" | "rb";
  pointerId: number;
  el: HTMLElement;
  sx: number;
  sy: number;
  /** Pointer position inside the card, as a share of its size. */
  fx: number;
  fy: number;
  /** Card size in px when grabbed (resize starts from it). */
  w0: number;
  h0: number;
  started: boolean;
};

function Board({
  layout,
  editing,
  mounted,
  fresh,
  data,
  onChange,
  onSettings,
}: {
  layout: Layout;
  editing: boolean;
  mounted: boolean;
  fresh: string | null;
  data: StudioData;
  onChange: (w: WidgetInstance[]) => void;
  onSettings: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Metrics>(() => metricsFor(1200));
  const [measured, setMeasured] = useState(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      setM(metricsFor(el.clientWidth));
      setMeasured(true);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [act, setAct] = useState<Interaction | null>(null);
  // Widgets rise in one after another when the page opens, then never again.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1500);
    return () => clearTimeout(t);
  }, []);
  const [lifted, setLifted] = useState<string | null>(null);
  const [landing, setLanding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [extraRows, setExtraRows] = useState(0);
  const grab = useRef<Grab | null>(null);
  /** Pointer (screen), the card's drawn position (board px, eased toward the pointer), tilt, frame time. */
  const pointer = useRef({ x: 0, y: 0, cx: 0, cy: 0, tilt: 0, t: 0, cellX: -1, cellY: -1, rw: 0, rh: 0 });
  const frame = useRef(0);
  const lastAct = useRef<string>("");
  const scrollAtGrab = useRef(0);
  const [resizing, setResizing] = useState<string | null>(null);

  const widgets = layout.widgets;
  const limits = useMemo(() => limitsFor(widgets), [widgets]);
  const base = useMemo(() => compact(widgets.map(toBox)), [widgets]);
  /** Where things are (saved sizes), with the current drag or resize applied. */
  const placed = useMemo(() => (act ? previewBoxes(base, act, limits) : base), [base, act, limits]);
  /** What's drawn: grown into empty space when "Fill" is on. */
  const shown = useMemo(() => {
    if (!layout.fill) return placed;
    const keep = new Set(widgets.filter((w) => w.fixed).map((w) => w.id));
    if (act?.kind === "resize") keep.add(act.id);
    return fill(placed, limits, keep);
  }, [placed, layout.fill, widgets, limits, act]);
  const byId = useMemo(() => new Map(shown.map((b) => [b.i, b])), [shown]);
  // The latest drawn boxes, for the drag loop (which started on an earlier render).
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const order = useMemo(() => new Map(readingOrder(shown).map((id, k) => [id, k])), [shown]);
  const rows = Math.max(1, bottom(shown)) + (editing ? 1 : 0) + extraRows;
  const canDrag = editing && !m.narrow;

  // --- the drag loop: runs every frame while a widget is held -----------------
  const tick = useCallback(() => {
    const g = grab.current;
    const b = board.current;
    if (!g || !g.started || !b) return;
    const p = pointer.current;
    const r = b.getBoundingClientRect();

    // Near the top or bottom of the window: scroll.
    const edge = 72;
    const v = p.y < edge ? -Math.ceil((edge - p.y) / 5) : p.y > window.innerHeight - edge ? Math.ceil((p.y - (window.innerHeight - edge)) / 5) : 0;
    if (v) window.scrollBy(0, v);

    if (g.kind === "move") {
      const me = widgets.find((w) => w.id === g.id)!;
      const wpx = me.w * m.col - GAP;
      const hpx = me.h * m.row - GAP;
      const left = p.x - r.left - g.fx * wpx;
      const top = p.y - r.top - g.fy * hpx;
      // The card glides after the pointer (eased, frame-rate independent),
      // and leans a little into the direction it's moving.
      const now = performance.now();
      const dt = Math.min(48, now - (p.t || now - 16));
      p.t = now;
      const ease = 1 - Math.exp(-dt / 55);
      const px = p.cx;
      p.cx += (left - p.cx) * ease;
      p.cy += (top - p.cy) * ease;
      const speed = ((p.cx - px) / Math.max(dt, 1)) * 16;
      p.tilt += (Math.max(-3, Math.min(3, speed * 0.22)) - p.tilt) * Math.min(1, dt / 90);
      g.el.style.setProperty("--dx", `${p.cx.toFixed(1)}px`);
      g.el.style.setProperty("--dy", `${p.cy.toFixed(1)}px`);
      g.el.style.setProperty("--tilt", `${p.tilt.toFixed(2)}deg`);
      // Target cell with a little stickiness, so it doesn't flip between two
      // cells while the pointer sits near a boundary.
      const fx = left / m.col;
      const fy = top / m.row;
      if (p.cellX < 0 || Math.abs(fx - p.cellX) > 0.62) p.cellX = Math.round(fx);
      if (p.cellY < 0 || Math.abs(fy - p.cellY) > 0.62) p.cellY = Math.round(fy);
      const x = Math.max(0, Math.min(COLS - me.w, p.cellX));
      const y = Math.max(0, p.cellY);
      const key = `m${x},${y}`;
      if (key !== lastAct.current) {
        lastAct.current = key;
        setAct({ kind: "move", id: g.id, x, y });
        setExtraRows(Math.max(0, y + me.h - bottom(base)));
      }
    } else {
      const me = widgets.find((w) => w.id === g.id)!;
      const lim = limits[g.id];
      const startBox = byIdRef.current.get(g.id) ?? toBox(me);
      const maxW = Math.min(lim.maxW, COLS - startBox.x);
      const dx = g.edge === "b" ? 0 : p.x - g.sx;
      const dy = g.edge === "r" ? 0 : p.y - g.sy + (window.scrollY - scrollAtGrab.current);
      const wpx = Math.max(lim.minW * m.col - GAP, Math.min(maxW * m.col - GAP, g.w0 + dx));
      const hpx = Math.max(lim.minH * m.row - GAP, Math.min(lim.maxH * m.row - GAP, g.h0 + dy));
      const now = performance.now();
      const dt = Math.min(48, now - (p.t || now - 16));
      p.t = now;
      const ease = 1 - Math.exp(-dt / 45);
      p.rw += (wpx - p.rw) * ease;
      p.rh += (hpx - p.rh) * ease;
      g.el.style.setProperty("--rw", `${p.rw.toFixed(1)}px`);
      g.el.style.setProperty("--rh", `${p.rh.toFixed(1)}px`);
      const w = Math.round((wpx + GAP) / m.col);
      const h = Math.round((hpx + GAP) / m.row);
      const key = `r${w},${h}`;
      if (key !== lastAct.current) {
        lastAct.current = key;
        setAct({ kind: "resize", id: g.id, w, h });
        setExtraRows(Math.max(0, startBox.y + h - bottom(base)));
      }
    }
    frame.current = requestAnimationFrame(tick);
  }, [widgets, limits, m, base]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function begin(e: React.PointerEvent<HTMLElement>, id: string, kind: "move" | "resize", edge: Grab["edge"] = "rb") {
    if (!canDrag || e.button !== 0) return;
    const el = (e.currentTarget.closest("[data-widget]") as HTMLElement) ?? e.currentTarget;
    const rect = el.getBoundingClientRect();
    grab.current = {
      id,
      kind,
      edge,
      pointerId: e.pointerId,
      el,
      sx: e.clientX,
      sy: e.clientY,
      fx: (e.clientX - rect.left) / rect.width,
      fy: (e.clientY - rect.top) / rect.height,
      w0: rect.width,
      h0: rect.height,
      started: false,
    };
    scrollAtGrab.current = window.scrollY;
    pointer.current = { x: e.clientX, y: e.clientY, cx: 0, cy: 0, tilt: 0, t: 0, cellX: -1, cellY: -1, rw: rect.width, rh: rect.height };
    el.setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const g = grab.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const p = pointer.current;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!g.started) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
      g.started = true;
      lastAct.current = "";
      const b = board.current!.getBoundingClientRect();
      const r = g.el.getBoundingClientRect();
      if (g.kind === "move") {
        // Start exactly where the card is, then glide after the pointer.
        p.cx = r.left - b.left;
        p.cy = r.top - b.top;
        g.el.style.setProperty("--dx", `${p.cx}px`);
        g.el.style.setProperty("--dy", `${p.cy}px`);
        g.el.style.setProperty("--tilt", "0deg");
        setLifted(g.id);
        sounds.lift();
      } else {
        g.el.style.setProperty("--rw", `${r.width}px`);
        g.el.style.setProperty("--rh", `${r.height}px`);
        setResizing(g.id);
      }
      document.body.style.cursor = g.kind === "move" ? "grabbing" : g.edge === "r" ? "ew-resize" : g.edge === "b" ? "ns-resize" : "nwse-resize";
      document.body.style.userSelect = "none";
      frame.current = requestAnimationFrame(tick);
    }
  }

  function finish(e: React.PointerEvent<HTMLElement>, cancel = false) {
    const g = grab.current;
    if (!g || e.pointerId !== g.pointerId) return;
    grab.current = null;
    cancelAnimationFrame(frame.current);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    try {
      g.el.releasePointerCapture(g.pointerId);
    } catch {}
    if (!g.started) return;
    setResizing(null);
    if (!cancel && act) {
      const next = applyBoxes(widgets, previewBoxes(base, act, limits));
      onChange(act.kind === "resize" ? next.map((w) => (w.id === act.id ? { ...w, fixed: true } : w)) : next);
      sounds.drop();
    }
    setLanding(g.id);
    setTimeout(() => setLanding((l) => (l === g.id ? null : l)), 450);
    setLifted(null);
    setAct(null);
    setExtraRows(0);
  }

  // Keyboard: arrows move, Shift + arrows resize (when a widget is focused in Customize).
  function onKey(e: React.KeyboardEvent<HTMLElement>, id: string) {
    if (!canDrag || e.target !== e.currentTarget) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const b = base.find((x) => x.i === id)!;
    // Step further until it really lands somewhere new (others may be in the way).
    for (let k = 1; k <= 24; k++) {
      const a: Interaction = e.shiftKey ? { kind: "resize", id, w: b.w + d[0] * k, h: b.h + d[1] * k } : { kind: "move", id, x: b.x + d[0] * k, y: Math.max(0, b.y + d[1] * k) };
      const res = previewBoxes(base, a, limits);
      const me = res.find((x) => x.i === id)!;
      if (me.x === b.x && me.y === b.y && me.w === b.w && me.h === b.h) {
        if (e.shiftKey || (d[0] !== 0 && (b.x + d[0] * k < 0 || b.x + b.w + d[0] * k > COLS))) return;
        continue;
      }
      const next = applyBoxes(widgets, res);
      onChange(a.kind === "resize" ? next.map((w) => (w.id === id ? { ...w, fixed: true } : w)) : next);
      sounds.drop();
      return;
    }
  }

  function remove(id: string) {
    setRemoving(id);
    setTimeout(() => {
      setRemoving(null);
      onChange(applyBoxes(widgets.filter((w) => w.id !== id), compact(widgets.filter((w) => w.id !== id).map(toBox))));
    }, 190);
  }

  function resetSize(id: string) {
    const w = widgets.find((x) => x.id === id)!;
    const meta = CATALOG[w.type];
    const next = applyBoxes(widgets, previewBoxes(base, { kind: "resize", id, w: meta.w, h: meta.h }, limits));
    onChange(next.map((x) => (x.id === id ? { ...x, fixed: undefined } : x)));
  }

  const ghost = act ? byId.get(act.id) : null;

  return (
    <div ref={wrap} className="dash-cq">
      <div
        ref={board}
        className={`dash-board ${editing ? "dash-anim" : ""} ${intro ? "dash-intro" : ""}`}
        style={{ ["--rows" as string]: rows, ...(measured ? { ["--col-px" as string]: `${m.col}px`, ["--rowh-px" as string]: `${m.row - GAP}px` } : {}) }}
      >
        {/* The grid shows while customizing; it brightens while you move or resize something. */}
        {canDrag && (
          <div className={`dash-cells ${act ? "is-on" : ""}`} aria-hidden>
            {Array.from({ length: rows * COLS }, (_, k) => (
              <span key={k} />
            ))}
          </div>
        )}
        {ghost && <div className="dash-item dash-ghost" style={vars(ghost)} aria-hidden />}
        {widgets.map((w) => {
          const b = byId.get(w.id) ?? toBox(w);
          const isLifted = lifted === w.id;
          // Picked up: drawn at its own size (it grows back into space when dropped).
          const size = isLifted ? { ...b, w: w.w, h: w.h } : b;
          return (
            <WidgetCard
              key={w.id}
              w={w}
              box={size}
              order={order.get(w.id) ?? 0}
              editing={editing}
              canDrag={canDrag}
              className={[isLifted && "is-lifted", resizing === w.id && "is-resizing", landing === w.id && "is-landing", removing === w.id && "is-removing", fresh === w.id && "is-new"].filter(Boolean).join(" ")}
              onGrab={(e) => begin(e, w.id, "move")}
              onResize={(e, edge) => begin(e, w.id, "resize", edge)}
              onResetSize={() => resetSize(w.id)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => finish(e)}
              onPointerCancel={(e) => finish(e, true)}
              onKey={(e) => onKey(e, w.id)}
              onRemove={() => remove(w.id)}
              onSettings={() => onSettings(w.id)}
            >
              {mounted ? <WidgetBoundary name={CATALOG[w.type].name}>{renderWidget(w, data)}</WidgetBoundary> : <WidgetSkeleton />}
            </WidgetCard>
          );
        })}
      </div>
      {editing && (
        <p className="mt-3 text-center text-[12px] text-ink-faint">
          {m.narrow ? "Make the window wider to move and resize widgets." : "Drag a widget to move it. Pull its edges to resize. Arrow keys move the selected one, Shift + arrows resize."}
        </p>
      )}
    </div>
  );
}

const vars = (b: Box, extra: Record<string, string | number> = {}) =>
  ({ ["--x" as string]: b.x, ["--y" as string]: b.y, ["--w" as string]: b.w, ["--h" as string]: b.h, ...extra }) as React.CSSProperties;

export function renderWidget(w: Pick<WidgetInstance, "type" | "settings">, data: StudioData) {
  switch (w.type) {
    case "tasks":
      return <TasksWidget tasks={data.tasks} done={data.done} teamTasks={data.teamTasks ?? null} settings={w.settings} />;
    case "contributions":
      return <ContributionsWidget done={data.done} teamId={data.teamId} settings={w.settings} />;
    case "todo":
      return <TodoWidget todos={data.todos} />;
    case "teams":
      return <TeamsWidget teams={data.teams} currentTeamId={data.teamId} />;
    case "clock":
      return <ClockWidget settings={w.settings} />;
    case "minicalendar":
      return <MiniCalendarWidget />;
    case "upcomingShorts":
      return <UpcomingShortsWidget items={data.upcomingShorts} />;
    case "upcomingLongs":
      return <UpcomingLongsWidget items={data.upcomingLongs} />;
    case "pipeline":
      return <PipelineWidget pipeline={data.pipeline} />;
    case "posting":
      return <PostingTodayWidget posts={data.posts} />;
    case "meetings":
      return <MeetingsWidget meetings={data.meetings ?? []} />;
    case "weather":
      return <WeatherWidget settings={w.settings} />;
    case "views":
      return <ViewsWidget teamId={data.teamId} />;
    case "followers":
      return <FollowersWidget teamId={data.teamId} />;
    case "topVideos":
      return <TopVideosWidget teamId={data.teamId} />;
    case "audienceMap":
      return <AudienceMapWidget teamId={data.teamId} settings={w.settings} />;
    case "output":
      return <OutputWidget teamId={data.teamId} />;
    case "word":
      return <WordWidget />;
    case "objectives":
      return <ObjectivesWidget teamId={data.teamId} settings={w.settings} />;
  }
}
const HAS_SETTINGS: WidgetType[] = ["contributions", "clock", "tasks", "weather", "audienceMap", "objectives"];

/** Measures its content box so widgets can adapt to the space they get. */
function Measured({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 280 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      <BoxContext.Provider value={box}>{children}</BoxContext.Provider>
    </div>
  );
}

function WidgetCard({
  w,
  box,
  order,
  editing,
  canDrag,
  className,
  onGrab,
  onResize,
  onResetSize,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKey,
  onRemove,
  onSettings,
  children,
}: {
  w: WidgetInstance;
  box: Box;
  order: number;
  editing: boolean;
  canDrag: boolean;
  className: string;
  onGrab: (e: React.PointerEvent<HTMLElement>) => void;
  onResize: (e: React.PointerEvent<HTMLElement>, edge: "r" | "b" | "rb") => void;
  onResetSize: () => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  onRemove: () => void;
  onSettings: () => void;
  children: React.ReactNode;
}) {
  const meta = CATALOG[w.type];
  const hasSettings = HAS_SETTINGS.includes(w.type);
  const bare = meta.bare && !editing;
  // Stacked (small laptops, tablets, phones): each widget's own span and height (layout.ts, Stack).
  const st = meta.stack;
  const rows = Math.max(st.min, Math.min(st.max, w.h));
  const style = vars(box, { ["--o"]: order, ["--mw"]: st.span ?? (w.w >= 6 ? 2 : 1), ["--mh"]: rows, ["--mhp"]: (typeof st.phone === "function" ? st.phone(w.settings) : st.phone) ?? rows });
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <section
      data-widget={w.id}
      style={style}
      tabIndex={canDrag ? 0 : undefined}
      aria-label={canDrag ? `${meta.name}. Drag to move, arrow keys to move, Shift and arrows to resize.` : undefined}
      onPointerDown={canDrag ? onGrab : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onKeyDown={canDrag ? onKey : undefined}
      className={`dash-item group/card flex flex-col rounded-xl border bg-surface p-3 overflow-hidden outline-none ${
        editing ? `border-dashed border-line/30 ${canDrag ? "cursor-grab touch-none select-none focus-visible:ring-2 focus-visible:ring-amber" : ""}` : "border-line/10"
      } ${className}`}
    >
      {bare ? (
        hasSettings && (
          <button type="button" onClick={onSettings} aria-label={`${meta.name} settings`} className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md flex items-center justify-center text-ink-faint opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60 hover:text-ink hover:bg-surface-2 transition-opacity">
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        )
      ) : (
        <div className="flex items-center gap-1.5 h-5 mb-2 flex-shrink-0">
          {canDrag && <GripIcon className="w-3.5 h-3.5 -ml-0.5 text-ink-faint" />}
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-faint flex-1 truncate">{meta.name}</h2>
          {hasSettings && (
            <button
              type="button"
              onPointerDown={stop}
              onClick={onSettings}
              aria-label={`${meta.name} settings`}
              className={`w-6 h-6 -my-0.5 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 transition-opacity ${editing ? "" : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70"}`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {editing && (
            <button type="button" onPointerDown={stop} onClick={onRemove} aria-label={`Remove ${meta.name}`} className="w-6 h-6 -my-0.5 -mr-1 rounded-md flex items-center justify-center text-ink-faint hover:text-red hover:bg-red/10">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <Measured className={`flex-1 min-h-0 flex flex-col ${editing ? "pointer-events-none" : ""}`}>{children}</Measured>
      {canDrag && (
        <>
          <span onPointerDown={(e) => onResize(e, "r")} className="dash-resize absolute top-3 bottom-6 right-0 w-2.5 cursor-ew-resize group/edge flex items-center justify-center" aria-hidden>
            <span className="w-[3px] h-8 rounded-full bg-amber/0 group-hover/edge:bg-amber/70 transition-colors" />
          </span>
          <span onPointerDown={(e) => onResize(e, "b")} className="dash-resize absolute left-3 right-6 bottom-0 h-2.5 cursor-ns-resize group/edge flex items-center justify-center" aria-hidden>
            <span className="h-[3px] w-8 rounded-full bg-amber/0 group-hover/edge:bg-amber/70 transition-colors" />
          </span>
          <span
            onPointerDown={(e) => onResize(e, "rb")}
            onDoubleClick={onResetSize}
            title="Drag to resize. Double-click for the normal size."
            className="dash-resize absolute right-0 bottom-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 text-ink-faint hover:text-amber"
          >
            <ResizeCornerIcon className="w-4 h-4" />
          </span>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Library: every widget, drawn small with your real data
// ---------------------------------------------------------------------------

const PREVIEW_COL = 104;
const PREVIEW_ROW = 64;

function LibraryTile({ type, added, data, onAdd }: { type: WidgetType; added: boolean; data: StudioData; onAdd: () => void }) {
  const meta = CATALOG[type];
  const frame = useRef<HTMLDivElement>(null);
  const cols = Math.min(meta.w, 6);
  const rows = Math.min(meta.h, 5);
  const nw = cols * PREVIEW_COL - GAP;
  const nh = rows * PREVIEW_ROW - GAP;
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(Math.min((el.clientWidth - 24) / nw, (el.clientHeight - 24) / nh, 1));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nw, nh]);
  return (
    <div
      className={`group relative text-left rounded-xl border border-line/15 p-2 transition-all ${
        added ? "" : "hover:border-amber/60 hover:shadow-[0_10px_30px_-14px_rgb(0_0_0/0.35)] hover:-translate-y-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber"
      }`}
    >
      <div ref={frame} className="relative h-[168px] rounded-lg bg-surface-2/60 overflow-hidden">
        <div
          inert
          aria-hidden
          className="absolute left-1/2 top-1/2 flex flex-col rounded-xl border border-line/10 bg-surface p-3 shadow-sm pointer-events-none select-none"
          style={{ width: nw, height: nh, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {!meta.bare && <div className="h-5 mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint flex-shrink-0">{meta.name}</div>}
          <BoxContext.Provider value={{ w: nw - 24, h: nh - 24 - (meta.bare ? 0 : 28) }}>
            <div className="flex-1 min-h-0 flex flex-col">
              <WidgetBoundary name={meta.name}>{renderWidget({ type, settings: meta.settings }, data)}</WidgetBoundary>
            </div>
          </BoxContext.Provider>
        </div>
        {added && <span className="absolute top-2 right-2 rounded-md bg-surface/90 border border-line/15 px-1.5 h-5 inline-flex items-center text-[10.5px] font-bold text-ink-soft">On your dashboard</span>}
      </div>
      <div className="flex items-center gap-2 px-1 pt-2">
        <span className="text-[13.5px] font-semibold flex-1 min-w-0 truncate">
          {meta.name}
          {meta.isNew && <span className="ml-1.5 align-[1px] rounded-full bg-amber text-white px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide">New</span>}
        </span>
        {!added && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber/10 text-amber px-1.5 h-6 text-[11.5px] font-bold opacity-80 group-hover:opacity-100">
            <PlusIcon className="w-3 h-3" strokeWidth={2.5} /> Add
          </span>
        )}
      </div>
      <p className="px-1 pb-0.5 text-[12px] text-ink-soft leading-snug">{meta.description}</p>
      {/* The whole tile is the button (a sibling, so the preview's own buttons aren't nested in it). */}
      <button type="button" onClick={onAdd} disabled={added} aria-label={added ? `${meta.name} is on your dashboard` : `Add ${meta.name}`} className="absolute inset-0 rounded-xl outline-none disabled:cursor-default" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-widget settings
// ---------------------------------------------------------------------------

function WidgetSettings({ w, teamId, onChange }: { w: WidgetInstance; teamId: string; onChange: (s: Record<string, unknown>) => void }) {
  const s = w.settings ?? {};
  if (w.type === "objectives") return <ObjectivesWidgetSettingsForm teamId={teamId} settings={s} onChange={onChange} />;
  const row = "flex items-center justify-between gap-4 py-3 border-b border-line/10 last:border-none";
  const Switch = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0" style={{ background: on ? "rgb(var(--amber))" : "rgb(var(--line) / 0.25)" }}>
      <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
  if (w.type === "contributions") {
    const color = (s.color as string) ?? "#22c55e";
    return (
      <div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Colour</span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {CONTRIB_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => onChange({ color: c })} aria-label={c} className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${color === c ? "ring-2 ring-offset-2 ring-offset-surface ring-ink" : ""}`} style={{ background: c }} />
            ))}
            <label className="relative w-7 h-7 rounded-lg border border-dashed border-line/40 flex items-center justify-center text-ink-soft cursor-pointer" title="Custom colour">
              <PlusIcon className="w-3.5 h-3.5" />
              <input type="color" value={color} onChange={(e) => onChange({ color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
          </div>
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Count tasks from</span>
          <div className="flex rounded-lg border border-line/15 p-0.5">
            {(["all", "team"] as const).map((v) => (
              <button key={v} type="button" onClick={() => onChange({ scope: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${(s.scope ?? "all") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
                {v === "all" ? "All my teams" : "This team"}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (w.type === "clock") {
    return (
      <div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">24-hour time</span>
          <Switch on={s.h24 !== false} set={(v) => onChange({ h24: v })} />
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Second hand</span>
          <Switch on={s.secondHand !== false} set={(v) => onChange({ secondHand: v })} />
        </div>
      </div>
    );
  }
  if (w.type === "weather") {
    return (
      <div>
        <div className="py-3 border-b border-line/10">
          <div className="text-[13.5px] font-semibold mb-1">City</div>
          <p className="text-[12px] text-ink-soft mb-2">{typeof s.lat === "number" ? `Showing ${String(s.city)}.` : "Using this device's location (or Bucharest)."}</p>
          <WeatherCitySearch onPick={(p) => onChange(p)} />
          {typeof s.lat === "number" && (
            <button type="button" onClick={() => onChange({ city: undefined, lat: undefined, lon: undefined })} className="mt-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Use my location instead
            </button>
          )}
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Units</span>
          <div className="flex rounded-lg border border-line/15 p-0.5">
            {(["c", "f"] as const).map((v) => (
              <button key={v} type="button" onClick={() => onChange({ units: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${(s.units ?? "c") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
                °{v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (w.type === "audienceMap") {
    return (
      <div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Show as</span>
          <div className="flex rounded-lg border border-line/15 p-0.5">
            {(["map", "globe"] as const).map((v) => (
              <button key={v} type="button" onClick={() => onChange({ view: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${(s.view ?? "map") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
                {v === "map" ? "Flat map" : "3D globe"}
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Numbers</span>
          <div className="w-56">
            <Select value={(s.mode as string) ?? "all"} onChange={(v) => v && onChange({ mode: v })} options={MAP_MODES.map((m) => ({ value: m.id, label: m.label }))} ariaLabel="Numbers" className="!h-9 !text-[13px]" />
          </div>
        </div>
      </div>
    );
  }
  if (w.type === "tasks") {
    return (
      <div className={row}>
        <span className="text-[13.5px] font-semibold">Opens on</span>
        <div className="flex rounded-lg border border-line/15 p-0.5">
          {(["overdue", "today", "upcoming", "all", "team"] as const).map((v) => (
            <button key={v} type="button" onClick={() => onChange({ tab: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold capitalize ${(s.tab ?? "today") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}
