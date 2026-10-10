"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { isObjectiveColor } from "@/modules/objectives/lib/metrics";
import { localNow } from "@/modules/objectives/lib/periods";
import { teamTimezone } from "@/modules/objectives/lib/board";
import { meets, round, valueAt } from "@/modules/projections/lib/compute";
import { loadProjData } from "@/modules/projections/lib/data";
import { baselineNow, getProjectionsBoard } from "@/modules/projections/lib/board";
import { cleanScope, formatValue, isMoney, isProjMetric, metricOf, projectionProblem, type ProjScope } from "@/modules/projections/lib/metrics";
import { recordProjections } from "@/modules/projections/lib/record";
import type { ProjectionsBoard } from "@/modules/projections/lib/types";

/*
 * Projections (1.15.0). Masters set them on the Objectives page →
 * Projections; the database checks it too (0080: only masters write them,
 * and money ones only show to the people who see revenue). The value when
 * it's set and the channel's key numbers that day are worked out here.
 */

type R<T = object> = ({ error?: undefined } & T) | { error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_0080 = "This needs the latest database update (migration 0080).";

export type ProjectionInput = {
  title: string;
  metric: string;
  scope: ProjScope;
  target: number;
  direction?: "up" | "down";
  deadline: string;
  color: string;
  note?: string | null;
};

async function who(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, member: false, master: false };
  const membership = await getMembership(supabase, teamId);
  return { supabase, user, member: !!membership, master: isMaster(membership?.roles ?? []) };
}

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") return NEEDS_0080;
  if (error.code === "23514" && error.message && !error.message.includes("violates check constraint")) return error.message;
  if (error.code === "42501") return "Only masters can change projections.";
  return fallback;
}

const refresh = () => revalidatePath("/objectives");

/** The board, for the page's refresh (anyone on the team). */
export async function loadProjectionsBoard(teamId: string): Promise<R<{ board: ProjectionsBoard }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const { supabase, user, member } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!member) return { error: "Not on this team." };
  return { board: await getProjectionsBoard(supabase, teamId) };
}

/** A draft's value right now (the editor shows it next to the target). Masters only. */
export async function previewProjection(teamId: string, metric: string, rawScope: unknown): Promise<R<{ current: number | null; today: string }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  if (!isProjMetric(metric)) return { error: "Pick what to measure." };
  const { supabase, user, master } = await who(teamId);
  if (!user || !master) return { error: "Only masters can set projections." };
  if (isMoney(metric)) {
    const { data } = await supabase.rpc("can_view_revenue", { p_team: teamId });
    if (data !== true) return { error: "Only people who see revenue can measure money." };
  }
  const tz = await teamTimezone(supabase, teamId);
  const today = localNow(tz).day;
  const data = await loadProjData(supabase, teamId, today, tz);
  return { current: round(valueAt(metric, cleanScope(metric, rawScope), data, today)), today };
}

function cleanInput(input: ProjectionInput, today: string): R<{ row: { title: string; metric: string; scope: ProjScope; target: number; direction: "up" | "down"; deadline: string; color: string; note: string | null } }> {
  const draft = {
    title: String(input?.title ?? "").trim().replace(/\s+/g, " "),
    metric: String(input?.metric ?? ""),
    target: Number(input?.target),
    deadline: String(input?.deadline ?? ""),
    today,
    color: String(input?.color ?? ""),
  };
  const problem = projectionProblem(draft);
  if (problem) return { error: problem };
  if (!isObjectiveColor(draft.color)) return { error: "Pick a colour." };
  const m = metricOf(draft.metric)!;
  const note = String(input?.note ?? "").trim().slice(0, 300) || null;
  return {
    row: {
      title: draft.title,
      metric: draft.metric,
      scope: cleanScope(draft.metric, input?.scope),
      target: Math.round(draft.target * 10_000) / 10_000,
      direction: input?.direction === "down" || input?.direction === "up" ? input.direction : m.dir,
      deadline: draft.deadline,
      color: draft.color,
      note,
    },
  };
}

/** A new projection: its value now and the channel's key numbers today are kept with it. */
export async function createProjection(teamId: string, input: ProjectionInput): Promise<R<{ id: string }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const { supabase, user, master } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!master) return { error: "Only masters can set projections." };
  const tz = await teamTimezone(supabase, teamId);
  const today = localNow(tz).day;
  const c = cleanInput(input, today);
  if (c.error !== undefined) return { error: c.error };
  const { row } = c;
  const { data: canMoney } = await supabase.rpc("can_view_revenue", { p_team: teamId });
  if (isMoney(row.metric) && canMoney !== true) return { error: "Only people who see revenue can measure money." };
  const data = await loadProjData(supabase, teamId, today, tz);
  const start = round(valueAt(row.metric, row.scope, data, today));
  if (start !== null && meets(start, row.target, row.direction)) return { error: `It's already at ${formatValue(row.metric, start)}. Pick a target past it.` };
  // Compare's "then": the key numbers today (money ones only on a money projection).
  const baseline = baselineNow(data, today, isMoney(row.metric) && canMoney === true);
  const { data: last } = await supabase.from("projections").select("position").eq("team_id", teamId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data: saved, error } = await supabase
    .from("projections")
    .insert({ team_id: teamId, ...row, start_day: today, start_value: start, baseline, position: Number((last as { position?: number } | null)?.position ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !saved) return { error: dbError(error, "Couldn't save the projection. Try again.") };
  // Its first point, so the chart starts today (and a target already met is noted, quietly: no celebration for setting it).
  if (start !== null) {
    try {
      await createAdminClient().from("projection_points").upsert({ projection_id: saved.id, day: today, team_id: teamId, value: start }, { onConflict: "projection_id,day" });
    } catch {}
  }
  refresh();
  return { id: saved.id as string };
}

/** Change the name, target, direction, deadline, colour or note (what it measures stays). */
export async function updateProjection(id: string, input: Omit<ProjectionInput, "metric" | "scope">): Promise<R> {
  if (!UUID.test(id)) return { error: "Projection not found." };
  const supabase = await createClient();
  const { data: cur } = await supabase.from("projections").select("team_id, metric, scope, start_day").eq("id", id).maybeSingle();
  if (!cur) return { error: "Projection not found." };
  const { user, master } = await who(cur.team_id as string);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!master) return { error: "Only masters can change projections." };
  const tz = await teamTimezone(supabase, cur.team_id as string);
  const today = localNow(tz).day;
  const c = cleanInput({ ...input, metric: cur.metric as string, scope: cur.scope as ProjScope }, today);
  if (c.error !== undefined) return { error: c.error };
  const { title, target, direction, deadline, color, note } = c.row;
  const { data, error } = await supabase.from("projections").update({ title, target, direction, deadline, color, note }).eq("id", id).select("id");
  if (error || !data?.length) return { error: dbError(error, "Couldn't save. Try again.") };
  refresh();
  return {};
}

export async function archiveProjection(id: string, archived: boolean): Promise<R> {
  if (!UUID.test(id)) return { error: "Projection not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("projections").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("id, team_id");
  if (error || !data?.length) return { error: dbError(error, "Only masters can change projections.") };
  refresh();
  return {};
}

export async function deleteProjection(id: string): Promise<R> {
  if (!UUID.test(id)) return { error: "Projection not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("projections").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: dbError(error, "Only masters can delete projections.") };
  refresh();
  return {};
}

/** Masters: record today's values now (after changing things), in the background of the action. */
export async function recordProjectionsNow(teamId: string): Promise<R> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const { user, master } = await who(teamId);
  if (!user || !master) return { error: "Only masters can do this." };
  await recordProjections(teamId);
  refresh();
  return {};
}
