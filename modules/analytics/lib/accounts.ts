import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSocialPlatform, type SocialPlatform } from "@/lib/social/providers";
import { nameKey, sameAccount, type NumbersVisibility } from "./account-rules";

export { inAccountTime, sameAccount, visibleRows, type NumbersVisibility } from "./account-rules";

/*
 * Whose numbers are these? Every platform's stored numbers belong to one
 * account (analytics_syncs.account_ref, migration 0079: the platform's own
 * id). Connecting another account deletes the old one's numbers before
 * anything new is copied, and the screens only ever show the numbers of the
 * accounts connected now. Nothing from a disconnected or replaced account
 * shows up anywhere: Analytics, the dashboard, objectives, projections.
 */

type Db = SupabaseClient<any, any, any>;

/** Every table with a platform's copied numbers. */
const NUMBER_TABLES = ["analytics_daily", "analytics_countries", "analytics_content", "analytics_content_days", "analytics_revenue_daily"] as const;


/** Delete a team's numbers for one platform (they belonged to another account). */
export async function purgeNumbers(admin: Db, teamId: string, platform: SocialPlatform) {
  // (A table that doesn't exist yet, before its migration, answers with an error: nothing to delete there.)
  await Promise.all(NUMBER_TABLES.map((t) => admin.from(t).delete().eq("team_id", teamId).eq("platform", platform)));
}

/**
 * Make the stored numbers of (team, platform) this account's. The same
 * account as before (by its id, or by its name for numbers kept from before
 * 1.15): nothing changes. Another account: the old numbers are deleted, and
 * the next copy fetches this one's history from the start.
 * `previousExternalId`: the account that was connected a moment ago (if
 * any), used when the database is older than 0079.
 */
export async function adoptAccount(
  admin: Db,
  teamId: string,
  platform: SocialPlatform,
  account: { externalId: string; name: string | null },
  previousExternalId?: string | null
): Promise<{ purged: boolean }> {
  const { data: s, error } = await admin.from("analytics_syncs").select("account_ref").eq("team_id", teamId).eq("platform", platform).maybeSingle();
  if (error) {
    // Before migration 0079: the old rule (another account replaced this one).
    if (previousExternalId && previousExternalId !== account.externalId) {
      await purgeNumbers(admin, teamId, platform);
      await admin.from("analytics_syncs").delete().eq("team_id", teamId).eq("platform", platform);
      return { purged: true };
    }
    return { purged: false };
  }
  const ref = ((s as { account_ref?: string | null } | null)?.account_ref ?? null) as string | null;
  if (s && sameAccount(ref, account)) {
    if (ref !== account.externalId) await admin.from("analytics_syncs").update({ account_ref: account.externalId }).eq("team_id", teamId).eq("platform", platform);
    return { purged: false };
  }
  // Another account's numbers (or numbers nobody can vouch for): gone, and a fresh start.
  const replaced = s || previousExternalId ? true : await hadOtherAccount(admin, teamId, platform, account.name);
  await purgeNumbers(admin, teamId, platform);
  await admin.from("analytics_syncs").upsert(
    {
      team_id: teamId,
      platform,
      account_ref: account.externalId,
      // Posts and links from before this moment were another account's (the Content tab leaves them out).
      account_since: replaced ? new Date().toISOString() : null,
      backfilled: false,
      last_run_at: null,
      last_ok_at: null,
      last_error: null,
      revenue_note: null,
    },
    { onConflict: "team_id,platform" }
  );
  return { purged: true };
}

/** Did the team connect another account on this platform before (by the history's names)? */
async function hadOtherAccount(admin: Db, teamId: string, platform: SocialPlatform, name: string | null) {
  const { data } = await admin
    .from("social_audit_log")
    .select("detail")
    .eq("team_id", teamId)
    .eq("platform", platform)
    .in("action", ["connected", "reconnected", "disconnected"])
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as { detail: { account?: unknown } | null }[]).some((r) => {
    const n = nameKey(typeof r.detail?.account === "string" ? r.detail.account : "");
    return n !== "" && n !== nameKey(name);
  });
}

/**
 * Which platforms' numbers may be shown for a team. Works with the person's
 * own client (RLS: teammates only) and with the server's. Once per request
 * (the Analytics page, its widgets and objectives all ask).
 */
export const numbersVisibility = cache(async (db: Db, teamId: string): Promise<NumbersVisibility> => {
  const [{ data: accounts }, syncs] = await Promise.all([
    db.from("social_accounts").select("platform, external_id, username, display_name, status").eq("team_id", teamId),
    db.from("analytics_syncs").select("platform, account_ref, account_since").eq("team_id", teamId),
  ]);
  // Before migration 0079 (no account_ref yet): every connected platform shows.
  const syncRows = syncs.error ? [] : ((syncs.data ?? []) as { platform: string; account_ref: string | null; account_since: string | null }[]);
  const out: NumbersVisibility = { platforms: new Set(), since: {} };
  for (const a of (accounts ?? []) as { platform: string; external_id: string; username: string | null; display_name: string | null; status: string }[]) {
    if (!isSocialPlatform(a.platform) || a.status === "revoked") continue;
    const p = a.platform;
    const s = syncRows.find((r) => r.platform === p);
    if (s && !sameAccount(s.account_ref, { externalId: a.external_id, name: a.username ?? a.display_name })) continue;
    out.platforms.add(p);
    out.since[p] = s?.account_since ?? null;
  }
  return out;
});

