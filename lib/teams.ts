import { cache } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedUser } from "./supabase/get-user";
import { retryOnce } from "./supabase/retry";
import { reportError } from "./errors";

export const CURRENT_TEAM_COOKIE = "vp_team";

export type TeamSummary = {
  id: string;
  name: string;
  slug: string;
  color: string;
  logoUrl: string | null;
  /** The team's colours for shorts and long videos (Team → Appearance). */
  shortColor?: string | null;
  longColor?: string | null;
  /** The team's time zone (its days: the daily word, objectives, projections). */
  timezone?: string | null;
};

const TEAM_COLS = "id, name, slug, color, logo_url, short_color, long_color, timezone";
type TeamRow = { id: string; name: string; slug: string; color: string; logo_url: string | null; short_color?: string | null; long_color?: string | null; timezone?: string | null };

/** The teams you're an active member of, in one query (teams joined to your membership). */
function joined(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("teams")
    // Explicit relationship: teams also point at team_members (default
    // short editor/reviewer/scheduler, migration 0027), so without the hint
    // Supabase can't tell which link to follow and the query fails.
    .select(`${TEAM_COLS}, team_members!team_members_team_id_fkey!inner(user_id, status)`)
    .eq("team_members.user_id", userId)
    .eq("team_members.status", "active")
    .order("created_at", { ascending: true });
}

/** The same the other way round (your memberships, then those teams): no relationship involved. */
async function twoStep(supabase: SupabaseClient, userId: string) {
  const m = await supabase.from("team_members").select("team_id").eq("user_id", userId).eq("status", "active");
  if (m.error) return { data: null, error: m.error };
  const ids = [...new Set(((m.data ?? []) as { team_id: string }[]).map((r) => r.team_id).filter(Boolean))];
  if (!ids.length) return { data: [] as TeamRow[], error: null };
  return supabase.from("teams").select(TEAM_COLS).in("id", ids).order("created_at", { ascending: true });
}

/**
 * Every team the current user is an active member of, plus which one
 * should be treated as "current" for this request — either whatever
 * they last switched to (stored in a cookie) or the first team they
 * belong to, as a sensible default.
 *
 * Wrapped in cache() — the layout and the page both need this, and
 * without caching that's two identical database round trips per
 * request instead of one.
 */
export const getTeamsAndCurrent = cache(async (supabase: SupabaseClient) => {
  const user = await getCachedUser();

  if (!user) return { teams: [] as TeamSummary[], currentTeam: null };

  // A failed read must never look like "you have no team" (that showed
  // "Start your first team" to people who had one, until they refreshed):
  // a passing error gets another try, and nothing found gets a second look
  // the other way round before anyone is told they have no team.
  let res: { data: TeamRow[] | null; error: { message: string; code?: string | null } | null } = await retryOnce(() => joined(supabase, user.id));
  if (res.error || !res.data?.length) {
    const first = res.error?.message ?? null;
    const second = await retryOnce(() => twoStep(supabase, user.id));
    if (!second.error) {
      if (second.data?.length) {
        try {
          after(() => reportError({ source: "server", message: `Teams only loaded the second way (${first ?? "the first way found none"})`, route: "getTeamsAndCurrent", userId: user.id }));
        } catch {}
      }
      res = second as typeof res;
    } else if (res.error) {
      // Both ways failed: an error screen with Try again, never the wrong page.
      throw new Error("Couldn't load your teams. Check your connection and try again.");
    }
  }

  const list: TeamSummary[] = (res.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
    logoUrl: t.logo_url,
    shortColor: t.short_color ?? null,
    longColor: t.long_color ?? null,
    timezone: t.timezone ?? null,
  }));

  if (list.length === 0) return { teams: list, currentTeam: null };

  const cookieStore = await cookies();
  const savedId = cookieStore.get(CURRENT_TEAM_COOKIE)?.value;
  const currentTeam = list.find((t) => t.id === savedId) ?? list[0];

  return { teams: list, currentTeam };
});
