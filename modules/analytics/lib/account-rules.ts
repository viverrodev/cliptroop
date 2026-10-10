import type { SocialPlatform } from "@/lib/social/providers";

/*
 * The rules for whose numbers may be shown (pure; tested in
 * tests/connected-numbers.test.ts). The server side is in ./accounts.ts.
 */

export const nameKey = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Is `ref` (what the stored numbers belong to) this account? `name:` refs come from before 1.15 (by name). */
export function sameAccount(ref: string | null | undefined, account: { externalId: string; name: string | null }) {
  if (!ref) return true;
  if (ref === account.externalId) return true;
  return ref.startsWith("name:") && nameKey(ref.slice(5)) !== "" && nameKey(ref.slice(5)) === nameKey(account.name);
}

export type NumbersVisibility = {
  /** Platforms whose numbers may be shown: an account is connected now, and the stored numbers are that account's. */
  platforms: Set<SocialPlatform>;
  /** When the connected account became the team's (null: from the start). Posts before it were another account's. */
  since: Partial<Record<SocialPlatform, string | null>>;
};

/** Keep only the rows of platforms whose numbers may be shown. */
export const visibleRows = <T extends { platform?: unknown }>(rows: T[], v: NumbersVisibility) => rows.filter((r) => v.platforms.has(r.platform as SocialPlatform));

/** Posted on this platform while the connected account was the team's? */
export const inAccountTime = (v: NumbersVisibility, platform: string, at: string | null | undefined) => {
  if (!v.platforms.has(platform as SocialPlatform)) return false;
  const since = v.since[platform as SocialPlatform];
  return !since || !at || Date.parse(at) >= Date.parse(since);
};
