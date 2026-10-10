"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { addWidget, readLayout } from "@/modules/dashboard/layout";
import { cleanFilters, draftProblem, isMetricId, isObjectiveColor, nextColor, type MetricId, type ObjectiveFilters } from "@/modules/objectives/lib/metrics";
import { isPeriodKind, isPeriodStart, localNow, periodStart, type PeriodKind } from "@/modules/objectives/lib/periods";
import { getObjectivesBoard, historyCount, loadOverrides, loadPeople, needsOf, teamTimezone, viewFor, kindOf, type ObjectiveRow } from "@/modules/objectives/lib/board";
import { loadSources } from "@/modules/objectives/lib/sources";
import { queueObjectivesSync, syncObjectives } from "@/modules/objectives/lib/sync";
import { recentPeriods } from "@/modules/objectives/lib/periods";
import type { Board, ObjectiveView } from "@/modules/objectives/lib/types";
import { listTeamPeople, type TeamPerson } from "@/modules/short-videos/lib/queries";

/*
 * Objectives (1.14.0). Masters set them (Team → Objectives); the database
 * checks it too (0078: only masters write objectives and their per-period
 * targets). Every change is counted again right after (quietly for the
 * objective that changed: a target that's already met isn't a celebration).
 */

type R<T = object> = ({ error?: undefined } & T) | { error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_0078 = "This needs the latest database update (migration 0078).";

export type ObjectiveInput = {
  title: string;
  metric: string;
  period: string;
  target: number;
  filters: ObjectiveFilters;
  color: string;
};

function refresh() {
  revalidatePath("/objectives");
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42883") return NEEDS_0078;
  if (error.code === "23514" && error.message && !error.message.includes("violates check constraint")) return error.message;
  if (error.code === "42501") return "Only masters can change objectives.";
  return fallback;
}

/** The signed-in person, and whether they're a master of the team. */
async function who(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, member: false, master: false };
  const membership = await getMembership(supabase, teamId);
  return { supabase, user, member: !!membership, master: isMaster(membership?.roles ?? []) };
}

/** A clean objective from what the form sent (and the person, if one was picked, must be on the team). */
async function clean(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string, input: ObjectiveInput): Promise<R<{ row: { title: string; metric: MetricId; period: PeriodKind; target: number; filters: ObjectiveFilters; color: string } }>> {
  const target = Math.round(Number(input?.target));
  const draft = { title: String(input?.title ?? "").trim(), metric: String(input?.metric ?? ""), period: String(input?.period ?? ""), target, color: String(input?.color ?? "") };
  const problem = draftProblem(draft);
  if (problem) return { error: problem };
  const metric = draft.metric as MetricId;
  const filters = cleanFilters(metric, input.filters);
  if (filters.member) {
    const { data } = await supabase.from("team_members").select("id").eq("id", filters.member).eq("team_id", teamId).maybeSingle();
    if (!data) return { error: "That person isn't on this team." };
  }
  return { row: { title: draft.title.replace(/\s+/g, " "), metric, period: draft.period as PeriodKind, target, filters, color: draft.color } };
}

/** The objective's team (from the row, never from the browser). */
async function teamOf(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase.from("objectives").select("id, team_id, period, created_at").eq("id", id).maybeSingle();
  if (error) return { error: dbError(error, "Objective not found.") };
  if (!data) return { error: "Objective not found." };
  return { teamId: data.team_id as string, period: data.period as string, createdAt: data.created_at as string };
}

export async function createObjective(teamId: string, input: ObjectiveInput): Promise<R<{ id: string }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const { supabase, user, master } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!master) return { error: "Only masters can set objectives." };
  const c = await clean(supabase, teamId, input);
  if (c.error !== undefined) return { error: c.error };
  const { data: last } = await supabase.from("objectives").select("position").eq("team_id", teamId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("objectives")
    .insert({ team_id: teamId, ...c.row, position: Number((last as { position?: number } | null)?.position ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !data) return { error: dbError(error, "Couldn't save the objective. Try again.") };
  queueObjectivesSync(teamId, { quiet: [data.id as string] });
  refresh();
  return { id: data.id as string };
}

export async function updateObjective(id: string, input: ObjectiveInput): Promise<R> {
  if (!UUID.test(id)) return { error: "Objective not found." };
  const supabase = await createClient();
  const t = await teamOf(supabase, id);
  if ("error" in t) return { error: t.error as string };
  const { user, master } = await who(t.teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!master) return { error: "Only masters can change objectives." };
  const c = await clean(supabase, t.teamId, input);
  if (c.error !== undefined) return { error: c.error };
  const { data, error } = await supabase.from("objectives").update(c.row).eq("id", id).select("id");
  if (error) return { error: dbError(error, "Couldn't save the objective. Try again.") };
  if (!data?.length) return { error: "Only masters can change objectives." };
  queueObjectivesSync(t.teamId, { quiet: [id] });
  refresh();
  return {};
}

export async function deleteObjective(id: string): Promise<R> {
  if (!UUID.test(id)) return { error: "Objective not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("objectives").delete().eq("id", id).select("id");
  if (error) return { error: dbError(error, "Couldn't delete it. Try again.") };
  if (!data?.length) return { error: "Only masters can delete objectives." };
  refresh();
  return {};
}

/** Paused objectives keep their history but don't count, celebrate or show in the widget. */
export async function setObjectivePaused(id: string, paused: boolean): Promise<R> {
  if (!UUID.test(id)) return { error: "Objective not found." };
  const supabase = await createClient();
  const t = await teamOf(supabase, id);
  if ("error" in t) return { error: t.error as string };
  const { data, error } = await supabase
    .from("objectives")
    .update({ paused_at: paused ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) return { error: dbError(error, "Couldn't change it. Try again.") };
  if (!data?.length) return { error: "Only masters can pause objectives." };
  if (!paused) queueObjectivesSync(t.teamId, { quiet: [id] });
  refresh();
  return {};
}

/** The order on the page, in the widget and here (masters). */
export async function reorderObjectives(teamId: string, ids: string[]): Promise<R> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const list = [...new Set(ids)].filter((x) => UUID.test(x)).slice(0, 100);
  const { supabase, master } = await who(teamId);
  if (!master) return { error: "Only masters can reorder objectives." };
  const results = await Promise.all(list.map((id, i) => supabase.from("objectives").update({ position: i + 1 }).eq("id", id).eq("team_id", teamId)));
  if (results.some((r) => r.error)) return { error: "Couldn't save the order." };
  refresh();
  return {};
}

/** A copy to change (e.g. the same goal for another platform), right after the original. */
export async function duplicateObjective(id: string): Promise<R<{ id: string }>> {
  if (!UUID.test(id)) return { error: "Objective not found." };
  const supabase = await createClient();
  const { data: o, error } = await supabase.from("objectives").select("team_id, title, metric, period, target, filters, color, position").eq("id", id).maybeSingle();
  if (error || !o) return { error: dbError(error, "Objective not found.") };
  const { master } = await who(o.team_id as string);
  if (!master) return { error: "Only masters can set objectives." };
  const { data: used } = await supabase.from("objectives").select("color").eq("team_id", o.team_id);
  const title = `${String(o.title).slice(0, 72)} (copy)`;
  const { data, error: insErr } = await supabase
    .from("objectives")
    .insert({ team_id: o.team_id, title, metric: o.metric, period: o.period, target: o.target, filters: o.filters, color: nextColor(((used ?? []) as { color: string }[]).map((u) => u.color)), position: Number(o.position) + 0.5 })
    .select("id")
    .single();
  if (insErr || !data) return { error: dbError(insErr, "Couldn't copy it. Try again.") };
  queueObjectivesSync(o.team_id as string, { quiet: [data.id as string] });
  refresh();
  return { id: data.id as string };
}

/**
 * A different target for one period (from the current one on): `target`
 * null = back to the usual one, 0 = off for that period.
 */
export async function setPeriodTarget(id: string, start: string, target: number | null): Promise<R> {
  if (!UUID.test(id)) return { error: "Objective not found." };
  const supabase = await createClient();
  const t = await teamOf(supabase, id);
  if ("error" in t) return { error: t.error as string };
  const { master } = await who(t.teamId);
  if (!master) return { error: "Only masters can change targets." };
  if (!isPeriodKind(t.period) || !isPeriodStart(t.period, start)) return { error: "Pick one of its periods." };
  const tz = await teamTimezone(supabase, t.teamId);
  if (start < periodStart(t.period, localNow(tz).day)) return { error: "Periods that are over keep their target." };
  if (target === null) {
    const { error } = await supabase.from("objective_targets").delete().eq("objective_id", id).eq("period_start", start);
    if (error) return { error: dbError(error, "Couldn't change it. Try again.") };
  } else {
    const n = Math.round(Number(target));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return { error: "Pick a target from 0 (off) up." };
    const { data: upd, error } = await supabase.from("objective_targets").update({ target: n }).eq("objective_id", id).eq("period_start", start).select("objective_id");
    if (error) return { error: dbError(error, "Couldn't change it. Try again.") };
    if (!upd?.length) {
      const { error: insErr } = await supabase.from("objective_targets").insert({ objective_id: id, period_start: start, team_id: t.teamId, target: n });
      if (insErr) return { error: dbError(insErr, "Couldn't change it. Try again.") };
    }
  }
  queueObjectivesSync(t.teamId, { quiet: [id] });
  refresh();
  return {};
}

/**
 * The editor's live preview: what an objective that isn't saved yet would
 * show right now (this period, and how the last few went). Masters only.
 */
export async function previewObjective(teamId: string, input: ObjectiveInput, id?: string | null): Promise<R<{ view: ObjectiveView }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const { supabase, user, master } = await who(teamId);
  if (!user || !master) return { error: "Only masters can set objectives." };
  const metric = String(input?.metric ?? "");
  if (!isMetricId(metric) || !isPeriodKind(input?.period)) return { error: "Pick what to count and how often." };
  const target = Math.max(1, Math.round(Number(input.target) || 1));
  const row: ObjectiveRow = {
    id: id && UUID.test(id) ? id : "00000000-0000-4000-8000-000000000000",
    title: String(input.title || "Preview"),
    metric,
    period: input.period,
    target,
    filters: cleanFilters(metric, input.filters),
    color: isObjectiveColor(input.color) ? input.color : "blue",
    position: 0,
    paused_at: null,
    created_at: new Date().toISOString(),
  };
  const [tz, overrides, people] = await Promise.all([teamTimezone(supabase, teamId), id && UUID.test(id) ? loadOverrides(supabase, teamId) : Promise.resolve(new Map<string, Map<string, number>>()), loadPeople(supabase, teamId)]);
  const now = localNow(tz);
  const kind = kindOf(row.period);
  const from = recentPeriods(kind, now.day, historyCount(kind, "short"))[0];
  const src = await loadSources(supabase, teamId, needsOf([row]), from, now.day, tz);
  // How this target would have gone in the last few periods (none of them judged for real).
  return { view: viewFor(row, src, overrides, people, now, { history: "short", items: false, tz, whatIf: true }) };
}

/**
 * The board for the widget and the page's live refresh (anyone on the team).
 * The server's own count runs after it (at most every 30 s), so a goal
 * reached by something no hook saw is still celebrated.
 */
export async function loadObjectivesBoard(teamId: string, mode: "widget" | "page" = "widget"): Promise<R<{ board: Board & { ready: boolean; canEdit: boolean } }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const { supabase, user, member, master } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!member) return { error: "You're not on this team." };
  const board = await getObjectivesBoard(supabase, teamId, { history: mode === "page" ? "full" : "short", items: mode === "page" });
  if (board.ready && board.objectives.some((o) => !o.paused)) {
    after(() => syncObjectives(teamId, { throttle: 30 }).then(() => undefined, (e) => console.error("[objectives] load sync", e instanceof Error ? e.message : e)));
  }
  // canEdit: masters get "New objective" right on the dashboard widget.
  return { board: { ...board, canEdit: master } };
}

/** The team's people, for the objective editor opened from the dashboard widget (masters). */
export async function objectiveEditorPeople(teamId: string): Promise<R<{ people: TeamPerson[] }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const { user, master } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!master) return { error: "Only masters can set objectives." };
  return { people: await listTeamPeople(teamId) };
}

/** "Put it on my dashboard": adds the Objectives widget to your own layout. */
export async function addObjectivesWidget(): Promise<R<{ added: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data } = await supabase.from("profiles").select("dashboard_layout").eq("id", user.id).maybeSingle();
  const layout = readLayout((data as { dashboard_layout?: unknown } | null)?.dashboard_layout);
  if (layout.widgets.some((w) => w.type === "objectives")) return { added: false };
  const next = addWidget(layout, "objectives").layout;
  const { error } = await supabase.from("profiles").update({ dashboard_layout: next }).eq("id", user.id);
  if (error) return { error: "Couldn't change your dashboard. Try again." };
  revalidatePath("/dashboard");
  return { added: true };
}
