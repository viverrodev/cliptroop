import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localNow } from "@/modules/objectives/lib/periods";
import { teamTimezone } from "@/modules/objectives/lib/board";
import { isObjectiveColor } from "@/modules/objectives/lib/metrics";
import { assess, compareValues, followersByPlatform, round, valueAt, type Point, type ProjData } from "./compute";
import { cleanScope, describeProjection, isMoney, metricOf, platformsOf } from "./metrics";
import { loadProjData } from "./data";
import { PROJECTION_COLS, type Baseline, type ProjectionRow, type ProjectionView, type ProjectionsBoard } from "./types";

/*
 * The Projections board: every long-term target of the team with its value
 * now, its value each day since it was set, the pace, where it's heading by
 * the deadline, and the key numbers then and now (Compare). Worked out on
 * every load from the copied numbers, so it's never stale.
 */

type Db = SupabaseClient<any, any, any>;

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function readBaseline(raw: unknown): Baseline {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (x: unknown) => Object.fromEntries(Object.entries(x && typeof x === "object" ? (x as Record<string, unknown>) : {}).map(([k, v]) => [k, n(v)]));
  return { at: typeof r.at === "string" ? r.at : null, values: pick(r.values), followers: pick(r.followers) };
}

/** The key numbers right now (money ones only for people who see revenue). */
export function baselineNow(data: ProjData, today: string, money: boolean): Baseline {
  return { at: new Date().toISOString(), values: compareValues(data, today, money), followers: followersByPlatform(data, today) };
}

export function viewOf(row: ProjectionRow, data: ProjData, points: Point[], today: string, currency: string): ProjectionView {
  const m = metricOf(row.metric);
  const scope = cleanScope(row.metric, row.scope);
  const target = n(row.target) ?? 0;
  const live = m ? round(valueAt(row.metric, scope, data, today)) : null;
  // Past its deadline: its value then (recorded, or the last day kept before it), never today's.
  const over = row.deadline < today;
  const atDeadline = [...points].reverse().find((x) => x.day <= row.deadline)?.value ?? null;
  const current = over ? (n(row.ended_value) ?? atDeadline ?? live) : live;
  const startValue = n(row.start_value);
  const ps = platformsOf(row.metric, scope);
  const direction = row.direction === "down" ? "down" : "up";
  return {
    id: row.id,
    title: row.title,
    metric: row.metric,
    known: !!m,
    label: m?.label ?? "Unknown",
    group: m?.group ?? null,
    scope,
    platform: ps.length === 1 ? ps[0] : null,
    target,
    direction,
    startDay: row.start_day,
    deadline: row.deadline,
    color: isObjectiveColor(row.color) ? row.color : "blue",
    note: row.note,
    createdAt: row.created_at,
    createdBy: row.created_by,
    archived: !!row.archived_at,
    money: isMoney(row.metric),
    sentence: describeProjection({ metric: row.metric, scope, target, direction, deadline: row.deadline }, currency),
    startValue,
    current,
    achievedAt: row.achieved_at,
    achievedValue: n(row.achieved_value),
    endedAt: row.ended_at,
    endedValue: n(row.ended_value),
    points,
    a: assess({
      metric: row.metric,
      start: startValue,
      current,
      target,
      direction,
      startDay: row.start_day,
      deadline: row.deadline,
      today,
      points,
      achieved: !!row.achieved_at,
      ended: !!row.ended_at || over,
    }),
    baseline: readBaseline(row.baseline),
  };
}

export async function getProjectionsBoard(db: Db, teamId: string): Promise<ProjectionsBoard> {
  const currency = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const [tz, rowsRes, moneyRes] = await Promise.all([
    teamTimezone(db, teamId),
    db.from("projections").select(PROJECTION_COLS).eq("team_id", teamId).order("archived_at", { ascending: true, nullsFirst: true }).order("position").order("created_at").limit(200),
    db.rpc("can_view_revenue", { p_team: teamId }),
  ]);
  const today = localNow(tz).day;
  const money = !moneyRes.error && moneyRes.data === true;
  const empty: Baseline = { at: null, values: {}, followers: {} };
  if (rowsRes.error) return { ready: false, teamId, today, tz, currency, money, projections: [], now: empty };
  const rows = (rowsRes.data ?? []) as unknown as ProjectionRow[];
  const ids = rows.map((r) => r.id);
  const since = rows.length ? rows.map((r) => r.start_day).sort()[0] : today;
  const [data, pointsRes] = await Promise.all([
    loadProjData(db, teamId, today, tz),
    ids.length ? db.from("projection_points").select("projection_id, day, value").in("projection_id", ids).gte("day", since).order("day").limit(20_000) : Promise.resolve({ data: [], error: null }),
  ]);
  const byId = new Map<string, Point[]>();
  for (const p of (pointsRes.data ?? []) as { projection_id: string; day: string; value: number | string }[]) {
    const v = n(p.value);
    if (v === null) continue;
    const list = byId.get(p.projection_id) ?? [];
    list.push({ day: p.day, value: v });
    byId.set(p.projection_id, list);
  }
  return {
    ready: true,
    teamId,
    today,
    tz,
    currency,
    money,
    projections: rows.map((r) => viewOf(r, data, byId.get(r.id) ?? [], today, currency)),
    now: baselineNow(data, today, money),
  };
}
