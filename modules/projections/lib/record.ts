import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications, teamMeta } from "@/lib/notify";
import { localNow } from "@/modules/objectives/lib/periods";
import { teamTimezone } from "@/modules/objectives/lib/board";
import { daysBetween, meets, round, valueAt } from "./compute";
import { loadProjData } from "./data";
import { cleanScope, formatValue, isMoney, metricOf, unitWords } from "./metrics";
import { PROJECTION_COLS, type ProjectionRow } from "./types";

/*
 * Every day (after the morning copy of the numbers, and when someone opens
 * Projections and today's value is missing): each projection's value today
 * goes into projection_points; a target reached is recorded once and the
 * team is told; a deadline that passed is recorded once with the value then
 * and the masters are told how it ended. Never throws.
 */

const recent = new Map<string, number>();

export async function recordProjections(teamId: string): Promise<{ recorded: number; reached: number; ended: number }> {
  const admin = createAdminClient();
  const out = { recorded: 0, reached: 0, ended: 0 };
  const { data, error } = await admin.from("projections").select(PROJECTION_COLS).eq("team_id", teamId).is("archived_at", null).limit(200);
  if (error || !data?.length) return out;
  const rows = data as unknown as ProjectionRow[];
  const tz = await teamTimezone(admin, teamId);
  const today = localNow(tz).day;
  const live = rows.filter((r) => !r.ended_at);
  if (!live.length) return out;
  const nums = await loadProjData(admin, teamId, today, tz);
  const now = new Date().toISOString();
  const points: { projection_id: string; day: string; team_id: string; value: number }[] = [];
  const reached: { row: ProjectionRow; value: number }[] = [];
  const ended: { row: ProjectionRow; value: number | null }[] = [];
  for (const r of live) {
    if (!metricOf(r.metric)) continue;
    const value = round(valueAt(r.metric, cleanScope(r.metric, r.scope), nums, today));
    const over = r.deadline < today;
    // A point for every day up to the deadline (the value on the deadline is the result).
    if (value !== null && !over) points.push({ projection_id: r.id, day: today, team_id: teamId, value });
    if (!r.achieved_at && !over && value !== null && meets(value, Number(r.target), r.direction === "down" ? "down" : "up")) reached.push({ row: r, value });
    if (over) ended.push({ row: r, value: null });
  }
  if (points.length) {
    const { error: e } = await admin.from("projection_points").upsert(points, { onConflict: "projection_id,day" });
    if (!e) out.recorded = points.length;
  }
  // Reached: once (whoever's update finds it still open records it).
  const told: { row: ProjectionRow; value: number }[] = [];
  for (const x of reached) {
    const { data: hit } = await admin.from("projections").update({ achieved_at: now, achieved_value: x.value }).eq("id", x.row.id).is("achieved_at", null).select("id");
    if (hit?.length) told.push(x);
  }
  out.reached = told.length;
  // Ended: the value on the deadline (its point), else the last one before it.
  const finished: { row: ProjectionRow; value: number | null }[] = [];
  for (const x of ended) {
    const { data: pts } = await admin.from("projection_points").select("day, value").eq("projection_id", x.row.id).lte("day", x.row.deadline).order("day", { ascending: false }).limit(1);
    const v = pts?.[0] ? Number((pts[0] as { value: number }).value) : null;
    const { data: hit } = await admin.from("projections").update({ ended_at: now, ended_value: v }).eq("id", x.row.id).is("ended_at", null).select("id");
    if (hit?.length) finished.push({ row: x.row, value: v });
  }
  out.ended = finished.length;
  if (told.length || finished.length) {
    try {
      await tell(admin, teamId, told, finished, today);
    } catch (e) {
      console.error("[projections] notify", e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** Record today's values in the background if any are missing (page loads), at most every 10 minutes per team. */
export function queueRecordIfDue(teamId: string, rows: { id: string; deadline: string; ended: boolean; hasToday: boolean }[], today: string) {
  const due = rows.some((r) => (!r.ended && r.deadline >= today && !r.hasToday) || (!r.ended && r.deadline < today));
  if (!due) return;
  const last = recent.get(teamId) ?? 0;
  if (Date.now() - last < 10 * 60_000) return;
  recent.set(teamId, Date.now());
  if (recent.size > 5000) recent.clear();
  const run = () => recordProjections(teamId).then(() => undefined, (e) => console.error("[projections] record", e instanceof Error ? e.message : e));
  try {
    after(run);
  } catch {
    void run();
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/** Who may hear about one: everyone, or (money ones) masters and the people who see revenue. */
async function audience(admin: Admin, teamId: string) {
  const [{ data: members }, { data: access }] = await Promise.all([
    admin.from("team_members").select("user_id, member_roles(role)").eq("team_id", teamId).eq("status", "active"),
    admin.from("revenue_access").select("user_id").eq("team_id", teamId),
  ]);
  const list = ((members ?? []) as { user_id: string | null; member_roles: { role: string }[] | null }[]).filter((m) => m.user_id);
  const masters = list.filter((m) => (m.member_roles ?? []).some((r) => r.role === "master")).map((m) => m.user_id as string);
  const granted = new Set(((access ?? []) as { user_id: string }[]).map((a) => a.user_id));
  return {
    everyone: list.map((m) => m.user_id as string),
    masters,
    money: list.map((m) => m.user_id as string).filter((u) => masters.includes(u) || granted.has(u)),
  };
}

async function tell(admin: Admin, teamId: string, reached: { row: ProjectionRow; value: number }[], ended: { row: ProjectionRow; value: number | null }[], today: string) {
  const [people, team] = await Promise.all([audience(admin, teamId), teamMeta(admin, teamId)]);
  const currency = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const notes: Parameters<typeof sendNotifications>[0] = [];
  for (const { row, value } of reached) {
    const target = Number(row.target);
    const early = Math.max(0, daysBetween(today, row.deadline));
    const valueText = formatValue(row.metric, value, { currency });
    const targetText = formatValue(row.metric, target, { currency });
    const unit = unitWords(row.metric, target, cleanScope(row.metric, row.scope));
    const body = `🎯 ${row.title}: ${targetText}${unit ? ` ${unit}` : ""} reached${early ? `, ${early} day${early === 1 ? "" : "s"} early` : ""}. Well done, everyone!`;
    const to = isMoney(row.metric) ? people.money : people.everyone;
    for (const recipient_id of to)
      notes.push({ recipient_id, kind: "projection_reached", body, metadata: { team, projectionId: row.id, title: row.title, color: row.color, valueText, targetText, unit, early, href: `/objectives?view=projections&p=${row.id}` } });
  }
  for (const { row, value } of ended) {
    const target = Number(row.target);
    const made = !!row.achieved_at || (value !== null && meets(value, target, row.direction === "down" ? "down" : "up"));
    const valueText = formatValue(row.metric, value, { currency });
    const targetText = formatValue(row.metric, target, { currency });
    const unit = unitWords(row.metric, target, cleanScope(row.metric, row.scope));
    const body = made ? `🏁 ${row.title} ended on target: ${valueText} (the goal was ${targetText}${unit ? ` ${unit}` : ""}).` : `🏁 ${row.title} ended at ${valueText} of ${targetText}${unit ? ` ${unit}` : ""}. Set the next one?`;
    const to = new Set([...(isMoney(row.metric) ? people.money.filter((u) => people.masters.includes(u)) : people.masters), ...(row.created_by && (!isMoney(row.metric) || people.money.includes(row.created_by)) ? [row.created_by] : [])]);
    for (const recipient_id of to)
      notes.push({ recipient_id, kind: "projection_ended", body, metadata: { team, projectionId: row.id, title: row.title, color: row.color, valueText, targetText, unit, made, href: `/objectives?view=projections&p=${row.id}` } });
  }
  if (notes.length) await sendNotifications(notes);
}
