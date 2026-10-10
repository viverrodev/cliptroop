"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";
import { getMembership } from "@/lib/permissions/membership";
import { fetchYouTubeDay, syncTeamAnalytics } from "@/modules/analytics/lib/sync";
import { getAudience, getContent, getProduction, getViewsDay, sharedLookups, type Audience, type ContentItem, type DayViews, type Production } from "@/modules/analytics/lib/queries";
import { addDays, todayIn, windowFor } from "@/modules/analytics/lib/ranges";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };

/** Copy the numbers from the platforms now (masters and schedulers). */
export async function syncAnalyticsNow(teamId: string): Promise<Result<{ summary: string }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const membership = await getMembership(supabase, teamId);
  const roles = membership?.roles ?? [];
  if (!roles.includes("master") && !roles.includes("publisher")) return { error: "Only masters and schedulers can sync." };
  const results = await syncTeamAnalytics(teamId);
  revalidatePath("/analytics");
  if (!results.length) return { error: "No connected accounts. Connect them in Team → Connected accounts." };
  const name = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" } as const;
  const bad = results.filter((r) => !r.ok);
  if (bad.length === results.length) return { error: bad.map((r) => `${name[r.platform]}: ${r.error}`).join(" · ") };
  return { summary: results.map((r) => `${name[r.platform]} ${r.ok ? `updated${r.note ? ` (${r.note})` : ""}` : `failed (${r.error})`}`).join(" · ") };
}

/** Let someone see revenue, or take it away (masters only; the database checks). */
export async function setRevenueAccess(teamId: string, userId: string, on: boolean): Promise<Result> {
  if (!UUID.test(teamId) || !UUID.test(userId)) return { error: "Not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (on) {
    const { error } = await supabase.from("revenue_access").insert({ team_id: teamId, user_id: userId });
    if (error && !/duplicate/i.test(error.message)) return { error: "Only masters can choose who sees revenue." };
    if (!error && userId !== user.id) {
      const [actor, team] = await Promise.all([actorMeta(supabase, user.id), teamMeta(supabase, teamId)]);
      await sendNotifications({
        recipient_id: userId,
        kind: "revenue_access",
        body: `${actor.name} let you see ${team.name}'s revenue in Analytics.`,
        metadata: { actor, team, href: "/analytics?tab=revenue" },
      });
    }
  } else {
    const { error } = await supabase.from("revenue_access").delete().eq("team_id", teamId).eq("user_id", userId);
    if (error) return { error: "Only masters can choose who sees revenue." };
  }
  revalidatePath("/analytics");
  return {};
}

// ---------------------------------------------------------------------------
// Dashboard widgets (loaded by the widgets themselves, only when one is on
// the board or in the widget library, so the dashboard stays fast).
// ---------------------------------------------------------------------------

export type DashAudience = { audience: Audience; top: ContentItem[] };
export type DashProduction = { kpis: Production["kpis"]; from: string; to: string };

async function teamTz(teamId: string) {
  if (!UUID.test(teamId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [membership, { data: team }] = await Promise.all([getMembership(supabase, teamId), supabase.from("teams").select("timezone").eq("id", teamId).maybeSingle()]);
  if (!membership) return null;
  return ((team?.timezone as string | null) || "Europe/Bucharest") as string;
}

/** Views, followers, countries and the top videos of the last 28 days (platform numbers end yesterday). */
export async function loadDashAudience(teamId: string): Promise<Result<{ data: DashAudience }>> {
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  const w = windowFor("28d", addDays(todayIn(tz), -1));
  // The connected platforms and whose numbers they are: looked up once for both.
  const shared = sharedLookups(teamId, await createClient());
  const [audience, content] = await Promise.all([getAudience(teamId, w, shared), getContent(teamId, w, shared)]);
  return { data: { audience, top: content.items.slice(0, 8) } };
}

// A day's YouTube videos asked for at most once per 10 minutes (per server), when the daily copy didn't keep them.
const askedDays = new Map<string, number>();

/**
 * What got the views on one day of the Views chart: every video, on every
 * connected platform, with its views that day (anyone on the team). A day
 * the copies didn't keep YouTube's per-video numbers for is asked from
 * YouTube right then (and kept).
 */
export async function loadViewsDay(teamId: string, day: string): Promise<Result<{ data: DayViews }>> {
  if (!UUID.test(teamId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a day on the chart." };
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  let data = await getViewsDay(teamId, day);
  const yt = data.platforms.find((p) => p.platform === "youtube");
  const today = todayIn(tz);
  const yearsBack = addDays(today, -3 * 365);
  if (yt && !yt.count && (yt.views ?? 0) > 0 && day < today && day >= yearsBack) {
    const key = `${teamId}:${day}`;
    if ((askedDays.get(key) ?? 0) < Date.now() - 10 * 60_000) {
      askedDays.set(key, Date.now());
      if (askedDays.size > 2000) askedDays.clear();
      try {
        if (await fetchYouTubeDay(teamId, day)) data = await getViewsDay(teamId, day);
      } catch {
        /* YouTube didn't answer: the dialog says what it has */
      }
    }
  }
  return { data };
}

/** The last 7 days of our own work (shorts, long videos, on time, overdue). */
export async function loadDashProduction(teamId: string): Promise<Result<{ data: DashProduction }>> {
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  const w = windowFor("7d", todayIn(tz));
  const p = await getProduction(teamId, w, tz);
  return { data: { kpis: p.kpis, from: w.from, to: w.to } };
}

// ---------------------------------------------------------------------------
// Other income (sponsorships, brand deals, other platforms…): masters only;
// the database (0061) checks it again.
// ---------------------------------------------------------------------------

const SOURCES = ["sponsorship", "brand_deal", "affiliate", "youtube_other", "facebook", "instagram", "tiktok", "merch", "other"];

/**
 * Which currency revenue is shown in, for this person: saved on the account
 * (profiles.currency, migration 0062) and on this device (works before it).
 */
export async function setRevenueCurrency(code: string): Promise<Result> {
  if (!/^[A-Z]{3}$/.test(code)) return { error: "Pick a currency." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  (await cookies()).set("vp_currency", code, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  await supabase.from("profiles").update({ currency: code }).eq("id", user.id);
  revalidatePath("/analytics");
  return {};
}

export async function addRevenueEntry(teamId: string, input: { day: string; source: string; amount: number; note?: string | null; currency?: string }): Promise<Result> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return { error: "Pick a date." };
  if (!SOURCES.includes(input.source)) return { error: "Pick where it came from." };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 100_000_000) return { error: "Enter an amount above 0." };
  const note = (input.note ?? "").trim().slice(0, 300) || null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  // Entered in the currency on screen (any with an exchange rate).
  const currency = input.currency && /^[A-Z]{3}$/.test(input.currency) ? input.currency : (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const { error } = await supabase.from("revenue_entries").insert({ team_id: teamId, day: input.day, source: input.source, amount, currency, note });
  if (error) return { error: /revenue_entries/.test(error.message) && /exist|schema cache/i.test(error.message) ? "Run migration 0061 first." : "Only masters can add income." };
  revalidatePath("/analytics");
  return {};
}

export async function deleteRevenueEntry(teamId: string, id: string): Promise<Result> {
  if (!UUID.test(teamId) || !UUID.test(id)) return { error: "Not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("revenue_entries").delete().eq("team_id", teamId).eq("id", id).select("id");
  if (error || !data?.length) return { error: "Only masters can remove income." };
  revalidatePath("/analytics");
  return {};
}
