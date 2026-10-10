import "server-only";
import { colorForId, displayName } from "@/lib/avatar";
import { hasStatsScopes, type SocialPlatform } from "@/lib/social/providers";
import { PLATFORM_META, type Platform } from "@/modules/short-videos/lib/constants";
import { METRICS, cleanFilters, describe, isMetricId, isObjectiveColor, type IconKind, type Need, type ObjectiveFilters } from "./metrics";
import { HISTORY, dayInZone, isPeriodKind, localNow, periodEnd, periodLabel, periodRange, periodStart, recentPeriods, type LocalNow, type PeriodKind } from "./periods";
import { hitsFor } from "./hits";
import { contributorsOf, firstCounted, paceFor, periodResult, statsOf, type PeriodResult } from "./compute";
import { loadSources, type Db } from "./sources";
import type { Board, CurrentView, Hit, ItemView, ObjectiveView, PeriodView, PersonLite, Sources, Status, WinView, WinnerView } from "./types";

/*
 * Everything the Objectives page, the dashboard widget and Team → Objectives
 * show, worked out from the team's own data every time (so it's never stale):
 * each objective's current period, its history, pace, who helped, and the
 * team's recent wins (recorded by lib/sync.ts).
 */

export type ObjectiveRow = {
  id: string;
  title: string;
  metric: string;
  period: string;
  target: number;
  filters: unknown;
  color: string;
  position: number;
  paused_at: string | null;
  created_at: string;
};
export const OBJECTIVE_COLS = "id, title, metric, period, target, filters, color, position, paused_at, created_at";

export type History = "full" | "short" | "none";
/** How many periods each mode shows (the current one included). */
export const historyCount = (kind: PeriodKind, h: History) => (h === "full" ? HISTORY[kind] : h === "short" ? Math.min(8, HISTORY[kind]) : 2);

export const DEFAULT_TZ = "Europe/Bucharest";

export async function teamTimezone(db: Db, teamId: string): Promise<string> {
  const { data } = await db.from("teams").select("timezone").eq("id", teamId).maybeSingle();
  const tz = (data as { timezone?: string | null } | null)?.timezone;
  return tz || DEFAULT_TZ;
}

/** Overrides for single periods: objective id → period start → target. */
export async function loadOverrides(db: Db, teamId: string): Promise<Map<string, Map<string, number>>> {
  const { data } = await db.from("objective_targets").select("objective_id, period_start, target").eq("team_id", teamId).limit(5000);
  const out = new Map<string, Map<string, number>>();
  for (const r of (data ?? []) as { objective_id: string; period_start: string; target: number }[]) {
    const m = out.get(r.objective_id) ?? new Map<string, number>();
    m.set(r.period_start, Number(r.target));
    out.set(r.objective_id, m);
  }
  return out;
}

export async function loadPeople(db: Db, teamId: string): Promise<Record<string, PersonLite>> {
  const { data } = await db.from("team_members").select("id, user_id, profiles(username, full_name, email, avatar_url)").eq("team_id", teamId).limit(500);
  const out: Record<string, PersonLite> = {};
  for (const m of (data ?? []) as Record<string, unknown>[]) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { username?: string | null; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null;
    const userId = (m.user_id as string | null) ?? null;
    out[m.id as string] = {
      memberId: m.id as string,
      userId,
      name: p ? displayName(p.username, p.full_name, p.email) : "A former teammate",
      avatarUrl: p?.avatar_url ?? null,
      color: userId ? colorForId(userId) : "#8a8577",
    };
  }
  return out;
}

/** Which source data these objectives need. */
export function needsOf(rows: { metric: string }[]): Set<Need> {
  const s = new Set<Need>();
  for (const r of rows) if (isMetricId(r.metric)) METRICS[r.metric].needs.forEach((n) => s.add(n));
  return s;
}

/** The kind of period, never anything unexpected. */
export const kindOf = (p: string): PeriodKind => (isPeriodKind(p) ? p : "week");

/** The target for one period: its own, or the usual one. */
export const targetIn = (row: { id: string; target: number }, overrides: Map<string, Map<string, number>>, start: string) => overrides.get(row.id)?.get(start) ?? Number(row.target);

const dayWord = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function winnerView(h: Hit | null, people: Record<string, PersonLite>): WinnerView | null {
  if (!h) return null;
  if (!h.ref) return { kind: "day", title: dayWord(h.day), platform: h.platform ?? null, people: [] };
  const names = [...new Set(h.people.map((c) => people[c.member]?.name).filter((n): n is string => !!n))];
  return { kind: h.ref.kind, number: h.ref.number, title: h.ref.title, id: h.ref.id, platform: h.platform ?? null, people: names.slice(0, 4) };
}

function itemsOf(hits: Hit[]): ItemView[] {
  // Platform numbers: one line per day (all platforms together); videos: one line each.
  const days = new Map<string, ItemView>();
  const out: ItemView[] = [];
  for (const h of hits) {
    if (!h.ref) {
      const cur = days.get(h.day);
      if (cur) cur.value = Math.round((cur.value + h.value) * 100) / 100;
      else {
        const it: ItemView = { key: h.day, kind: "day", title: dayWord(h.day), day: h.day, at: null, value: h.value, people: [] };
        days.set(h.day, it);
        out.push(it);
      }
      continue;
    }
    out.push({
      key: h.key,
      kind: h.ref.kind,
      id: h.ref.id,
      number: h.ref.number,
      title: h.ref.title,
      href: h.ref.kind === "short" ? `/shorts/${h.ref.id}` : `/videos/${h.ref.id}`,
      platform: h.platform ?? null,
      day: h.day,
      at: h.at,
      value: h.value,
      people: [...new Set(h.people.map((c) => c.member))],
    });
  }
  return out.reverse().slice(0, 80);
}

const iconOf = (metric: string): IconKind => (isMetricId(metric) ? METRICS[metric].icon : "post");

/**
 * One objective, from its hits: the current period in full, the ones before
 * as history. Periods from before the objective was set are shown but not
 * judged (status "before"); `whatIf` (the editor's preview) judges them all,
 * to show how this target would have gone. `tz`: the team's time zone (the
 * day the objective was set).
 */
export function viewFor(
  row: ObjectiveRow,
  src: Sources | null,
  overrides: Map<string, Map<string, number>>,
  people: Record<string, PersonLite>,
  now: LocalNow,
  opts: { history: History; items: boolean; tz: string; whatIf?: boolean }
): ObjectiveView {
  const kind = kindOf(row.period);
  const metric = row.metric;
  const known = isMetricId(metric);
  const filters: ObjectiveFilters = known ? cleanFilters(metric, row.filters) : {};
  const lag = known ? METRICS[metric].lagDays : 0;
  const starts = recentPeriods(kind, now.day, historyCount(kind, opts.history));
  const hits = known && src ? hitsFor({ metric, filters }, src, starts[0], now.day) : [];
  const results: PeriodResult[] = starts.map((s) => periodResult(hits, s, periodEnd(kind, s), targetIn(row, overrides, s)));
  const cur = results[results.length - 1];
  const first = opts.whatIf ? starts[0] : firstCounted(kind, row.created_at ? dayInZone(row.created_at, opts.tz) : starts[0], cur.start);
  // Platform numbers: a finished period without a single copied day (no
  // account connected then) has nothing to judge.
  const platforms: string[] = !known || !lag ? [] : metric === "watch_hours" ? ["youtube"] : filters.platforms?.length ? filters.platforms : [...METRICS[metric].platforms];
  const hasNumbers = (r: PeriodResult) => !platforms.length || !!src?.daily.some((d) => d.day >= r.start && d.day <= r.end && platforms.includes(d.platform));
  const statusOf = (r: PeriodResult): Status =>
    r !== cur && r.start < first ? "before" : r !== cur && !hasNumbers(r) ? "nodata" : paceFor(kind, r, now, lag).status;
  const toView = (r: PeriodResult): PeriodView => {
    const status = statusOf(r);
    const judged = status !== "before" && status !== "nodata";
    return {
      start: r.start,
      end: r.end,
      label: periodLabel(kind, r.start, now.day),
      range: periodRange(kind, r.start),
      target: r.target,
      value: r.value,
      reached: judged && r.reached,
      reachedAt: judged ? r.reachedAt : null,
      reachedDay: judged ? r.reachedDay : null,
      status,
    };
  };
  const pace = paceFor(kind, cur, now, lag);
  const member = filters.member ? people[filters.member]?.name ?? "A former teammate" : null;
  // Only the periods since the objective was set, with numbers to judge, count.
  const counting = results.filter((r) => r === cur || (r.start >= first && hasNumbers(r)));
  const current: CurrentView = {
    ...toView(cur),
    status: pace.status,
    fraction: pace.fraction,
    expected: Math.round(pace.expected * 100) / 100,
    forecast: pace.forecast,
    perDay: pace.perDay === null ? null : Math.round(pace.perDay * 100) / 100,
    daysLeft: pace.daysLeft,
    winner: winnerView(cur.winner, people),
    items: opts.items ? itemsOf(cur.hits) : [],
    contributors: contributorsOf(cur.hits).slice(0, 12),
  };
  const platform: Platform | null = filters.platforms?.length === 1 ? filters.platforms[0] : metric === "watch_hours" ? "youtube" : null;
  const ov = overrides.get(row.id);
  return {
    id: row.id,
    title: row.title,
    metric,
    known,
    period: kind,
    target: Number(row.target),
    filters,
    color: isObjectiveColor(row.color) ? row.color : "blue",
    position: Number(row.position ?? 0),
    paused: !!row.paused_at,
    createdAt: row.created_at,
    sentence: describe({ metric, period: kind, target: Number(row.target), filters }, member),
    metricLabel: known ? METRICS[metric].label : "Unknown",
    icon: iconOf(metric),
    platform,
    lagDays: lag,
    current,
    history: results.map(toView),
    stats: statsOf(counting),
    overrides: ov ? [...ov.entries()].filter(([s]) => s >= periodStart(kind, now.day)).sort(([a], [b]) => a.localeCompare(b)).map(([start, target]) => ({ start, target })) : [],
  };
}

/** The team's wins (recorded by the server) from the last 90 days, newest first. */
async function loadWins(db: Db, teamId: string, rows: ObjectiveRow[], today: string): Promise<WinView[]> {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString();
  const { data } = await db
    .from("objective_periods")
    .select("objective_id, period_start, value, target, reached_at, celebrated_at, winner")
    .eq("team_id", teamId)
    .not("reached_at", "is", null)
    .gte("reached_at", since)
    .order("reached_at", { ascending: false })
    .limit(40);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: WinView[] = [];
  for (const w of (data ?? []) as Record<string, unknown>[]) {
    const o = byId.get(w.objective_id as string);
    if (!o) continue;
    const kind = kindOf(o.period);
    out.push({
      objectiveId: o.id,
      title: o.title,
      color: isObjectiveColor(o.color) ? o.color : "blue",
      period: kind,
      start: w.period_start as string,
      label: periodLabel(kind, w.period_start as string, today),
      value: Number(w.value),
      target: Number(w.target),
      metric: o.metric,
      reachedAt: w.reached_at as string,
      celebratedAt: (w.celebrated_at as string | null) ?? null,
      winner: (w.winner && typeof w.winner === "object" ? (w.winner as WinnerView) : null) ?? null,
    });
  }
  return out;
}

/** Is any account connected with stats allowed (for views, followers…)? */
async function audienceReady(db: Db, teamId: string): Promise<boolean> {
  const { data } = await db.from("social_accounts").select("platform, status, scopes").eq("team_id", teamId);
  return ((data ?? []) as { platform: SocialPlatform; status: string; scopes: string[] | null }[]).some((a) => a.status === "active" && hasStatsScopes(a.platform, a.scopes ?? []));
}

/**
 * The whole board. `history`: "full" (the page), "short" (the widget's
 * sparkline), "none" (just now). `items`: the current period's videos.
 * `ready` is false before migration 0078 (the screens say so).
 */
export async function getObjectivesBoard(db: Db, teamId: string, opts: { history?: History; items?: boolean; at?: number } = {}): Promise<Board & { ready: boolean }> {
  const history = opts.history ?? "full";
  const [tz, rowsRes, overrides, people, audience] = await Promise.all([
    teamTimezone(db, teamId),
    db.from("objectives").select(OBJECTIVE_COLS).eq("team_id", teamId).order("position").order("created_at").limit(100),
    loadOverrides(db, teamId),
    loadPeople(db, teamId),
    audienceReady(db, teamId).catch(() => false),
  ]);
  const ready = !rowsRes.error;
  const rows = ((rowsRes.data ?? []) as ObjectiveRow[]).filter((r) => r && r.id);
  const now = localNow(tz, opts.at);
  const from = rows.length ? rows.map((r) => recentPeriods(kindOf(r.period), now.day, historyCount(kindOf(r.period), history))[0]).sort()[0] : now.day;
  const [src, wins] = await Promise.all([rows.length ? loadSources(db, teamId, needsOf(rows), from, now.day, tz) : Promise.resolve(null), rows.length ? loadWins(db, teamId, rows, now.day) : Promise.resolve([])]);
  return {
    ready,
    teamId,
    tz,
    today: now.day,
    now,
    generatedAt: new Date().toISOString(),
    objectives: rows.map((r) => viewFor(r, src, overrides, people, now, { history, items: opts.items ?? false, tz })),
    wins,
    people,
    audienceReady: audience,
  };
}

/** A platform's name, for the screens. */
export const platformName = (p: Platform) => PLATFORM_META[p].name;
