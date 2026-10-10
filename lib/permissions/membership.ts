import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type RoleId, hasStageAccess, isMaster, type PipelineStage } from "./roles";
import { getCachedUser } from "@/lib/supabase/get-user";
import { retryOnce } from "@/lib/supabase/retry";

export type Membership = {
  teamMemberId: string;
  roles: RoleId[];
};

/**
 * The current user's team_members row + roles for a given team.
 * UI-side only — used to decide what to show/hide. The database's own
 * RLS policies are the real enforcement; this just keeps the interface
 * from offering buttons that would fail anyway.
 *
 * Cached per-request — several places on a project page all need to
 * know "am I the master / do I have access to this stage," and this
 * makes sure that's one query, not several.
 */
export const getMembership = cache(async function getMembership(
  supabase: SupabaseClient,
  teamId: string
): Promise<Membership | null> {
  const user = await getCachedUser();
  if (!user) return null;

  // A passing error gets another try (it would otherwise read as "not on this team").
  const { data } = await retryOnce(() =>
    supabase
      .from("team_members")
      .select("id, member_roles(role)")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()
  );

  if (!data) return null;

  return {
    teamMemberId: data.id,
    roles: (data.member_roles ?? []).map(
      (r: { role: RoleId }) => r.role
    ) as RoleId[],
  };
});

export function canActOnStage(
  membership: Membership | null,
  stage: PipelineStage
): boolean {
  if (!membership) return false;
  return isMaster(membership.roles) || hasStageAccess(membership.roles, stage);
}
