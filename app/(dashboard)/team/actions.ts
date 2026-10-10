"use server";

import { APP_NAME } from "@/lib/brand";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { displayName } from "@/lib/avatar";
import { actorMeta, teamMeta, sendNotifications } from "@/lib/notify";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { isOwnStorageUrl } from "@/lib/storage-url";
import { isMediaKeepDays } from "@/lib/media-keep";

async function requireMaster(teamId: string) {
  const supabase = await createClient();
  const membership = await getMembership(supabase, teamId);
  if (!isMaster(membership?.roles ?? [])) {
    return { ok: false as const, error: "Only the master can do this." };
  }
  return { ok: true as const };
}

const VALID_ROLE_IDS = new Set<string>(ROLES.map((r) => r.id));


/**
 * Invites an EXISTING VPlanner account to join this team. This does not
 * create any account — that only ever happens via the Supabase
 * dashboard, done directly by the project owner. This just sends the
 * person a real in-app notification they can accept or decline; nothing
 * about their team membership changes until they respond.
 */
export async function inviteExistingUser(
  teamId: string,
  userId: string,
  roleIds: RoleId[]
) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const validRoles = roleIds.filter(
    (r) => r !== "master" && ROLES.some((role) => role.id === r)
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  // Clear out any of THEIR pending invites to THIS team that have gone
  // stale (past the 1-hour window) — this is what makes re-inviting
  // possible after a failure, without weakening the rule that a
  // genuinely still-live pending invite blocks a duplicate.
  // (Admin client: the master has no UPDATE access to invites since
  // 0022 — and before that, this update silently matched nothing.)
  await createAdminClient()
    .from("team_invites")
    .update({ status: "expired" })
    .eq("team_id", teamId)
    .eq("invited_user_id", userId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const [{ data: team }, { data: inviterProfile }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", teamId).single(),
    supabase.from("profiles").select("username, full_name, email").eq("id", user.id).single(),
  ]);

  const { data: invite, error } = await supabase
    .from("team_invites")
    .insert({
      team_id: teamId,
      invited_user_id: userId,
      invited_by: user.id,
      proposed_roles: validRoles,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "They already have a live invite to this team (expires within an hour of being sent)." };
    }
    return { error: "Couldn't send the invite. Try again." };
  }

  const inviterName = displayName(inviterProfile?.username, inviterProfile?.full_name, inviterProfile?.email);
  const actor = await actorMeta(supabase, user.id);
  const teamInfo = await teamMeta(supabase, teamId);

  const { error: notifyError } = await sendNotifications({
    recipient_id: userId,
    team_invite_id: invite.id,
    kind: "team_invite",
    metadata: { actor, team: teamInfo },
    body: `${inviterName} invited you to join ${team?.name ?? "a team"}.`,
  });

  if (notifyError) {
    // Without the notification, the invite is genuinely undiscoverable
    // by the invited person — don't leave a dangling invite they'll
    // never see. Roll back and report the real failure.
    await supabase.from("team_invites").delete().eq("id", invite.id);
    return { error: "Couldn't notify them. Try again." };
  }

  revalidatePath("/team");
  return { success: true };
}

export async function cancelInvite(teamId: string, inviteId: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("team_invites").delete().eq("id", inviteId).eq("team_id", teamId);
  if (error) return { error: "Couldn't cancel the invite." };

  revalidatePath("/team");
  return { success: true };
}

/**
 * Deletes a team permanently — owner-only (not just any master, since
 * this destroys everyone's work on the team, not a single master-level
 * decision), and blocked entirely while any social account is
 * connected. That's a deliberate hard stop, not just a warning:
 * disconnecting first is a real, separate decision the owner has to
 * make on purpose, since it likely affects scheduled/published content
 * tied to that account.
 */
export async function deleteTeam(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", teamId).single();
  if (!team || team.owner_id !== user.id) {
    return { error: "Only the team's owner can delete it." };
  }

  const admin = createAdminClient();

  // Capture who to tell and what to call it BEFORE it's gone. The logo is
  // deliberately left out: it's deleted along with the team, so the
  // notification falls back to the team's color + initials.
  const [{ data: teamRow }, { data: memberRows }, actor] = await Promise.all([
    admin.from("teams").select("name, color").eq("id", teamId).single(),
    admin.from("team_members").select("user_id").eq("team_id", teamId).eq("status", "active"),
    actorMeta(admin, user.id),
  ]);
  const recipients = (memberRows ?? [])
    .map((m) => m.user_id as string | null)
    .filter((id): id is string => !!id && id !== user.id);

  const { data: projects } = await admin
    .from("long_video_projects")
    .select("id")
    .eq("team_id", teamId);

  await Promise.all(
    (projects ?? []).flatMap((p) => [
      (async () => {
        const { data } = await admin.storage.from("thumbnails").list(p.id);
        if (data && data.length > 0) {
          await admin.storage.from("thumbnails").remove(data.map((f) => `${p.id}/${f.name}`));
        }
      })(),
      (async () => {
        const { data } = await admin.storage.from("comment-attachments").list(p.id);
        if (data && data.length > 0) {
          await admin.storage.from("comment-attachments").remove(data.map((f) => `${p.id}/${f.name}`));
        }
      })(),
    ])
  );

  const { data: logoFiles } = await admin.storage.from("team-logos").list(teamId);
  if (logoFiles && logoFiles.length > 0) {
    await admin.storage.from("team-logos").remove(logoFiles.map((f) => `${teamId}/${f.name}`));
  }

  const { error } = await admin.from("teams").delete().eq("id", teamId);
  if (error) return { error: "Couldn't delete the team. Try again." };

  if (recipients.length > 0) {
    const teamName = teamRow?.name ?? "A team";
    await sendNotifications(
      recipients.map((recipient_id) => ({
        recipient_id,
        kind: "team_disbanded",
        metadata: {
          actor,
          team: { name: teamName, color: teamRow?.color ?? "#E8630D", logoUrl: null },
        },
        body: `${actor.name} disbanded ${teamName}.`,
      }))
    );
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function setMemberRoles(
  teamId: string,
  teamMemberId: string,
  roleIds: RoleId[]
) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const nextRoles = Array.from(new Set(roleIds)).filter((r) => VALID_ROLE_IDS.has(r)) as RoleId[];

  const [{ data: team }, { data: targetMember }] = await Promise.all([
    supabase.from("teams").select("owner_id, name").eq("id", teamId).single(),
    supabase
      .from("team_members")
      .select("user_id, member_roles(role)")
      .eq("id", teamMemberId)
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);

  if (!team || !targetMember) return { error: "That member isn't on this team." };

  const currentRoles = ((targetMember.member_roles ?? []) as { role: RoleId }[]).map((r) => r.role);
  const toAdd = nextRoles.filter((r) => !currentRoles.includes(r));
  const toRemove = currentRoles.filter((r) => !nextRoles.includes(r));

  // The team's owner is always its master — a permanent invariant.
  if (targetMember.user_id === team.owner_id && toRemove.includes("master")) {
    return { error: "The team owner is always Master. That can't be changed." };
  }

  // Master is the boss role: only the owner hands it out or takes it away.
  const touchesMaster = toAdd.includes("master") || toRemove.includes("master");
  if (touchesMaster && user.id !== team.owner_id) {
    return { error: "Only the team owner can grant or remove Master." };
  }

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { success: true };
  }

  // Only delete/insert what actually changed — no "wipe and re-add",
  // so an unchanged Master role is never touched.
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("member_roles")
      .delete()
      .eq("team_member_id", teamMemberId)
      .in("role", toRemove);
    if (error) return { error: "Couldn't update roles. Try again." };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("member_roles")
      .insert(toAdd.map((role) => ({ team_member_id: teamMemberId, role })));
    if (error) return { error: "Couldn't update roles. Try again." };
  }

  if (targetMember.user_id) {
    const teamRoleColors = await getRoleColors(supabase, teamId);
    const roleObjs = nextRoles
      .map((r) => {
        const name = ROLES.find((role) => role.id === r)?.name;
        return name ? { name, color: teamRoleColors[r] ?? "#999" } : null;
      })
      .filter(Boolean);
    const teamInfo = await teamMeta(supabase, teamId);
    await sendNotifications({
      recipient_id: targetMember.user_id,
      kind: "role_changed",
      metadata: { team: teamInfo, roles: roleObjs },
      body:
        roleObjs.length > 0
          ? `Your role on ${team.name ?? "the team"} changed to ${roleObjs.map((r) => r!.name).join(", ")}.`
          : `Your roles on ${team.name ?? "the team"} were cleared.`,
    });
  }

  revalidatePath("/team");
  return { success: true };
}

export async function kickMember(teamId: string, teamMemberId: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const [{ data: team }, { data: member }] = await Promise.all([
    supabase.from("teams").select("owner_id, name").eq("id", teamId).single(),
    supabase
      .from("team_members")
      .select("user_id, member_roles(role)")
      .eq("id", teamMemberId)
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);

  if (!team || !member) return { error: "That member isn't on this team." };

  if (member.user_id === team.owner_id) {
    return { error: "The team's owner can't be removed." };
  }

  const memberIsMaster = ((member.member_roles ?? []) as { role: RoleId }[]).some((r) => r.role === "master");
  if (memberIsMaster && user.id !== team.owner_id) {
    return { error: "Only the team owner can remove another Master." };
  }

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", teamMemberId)
    .eq("team_id", teamId);
  if (error) return { error: "Couldn't remove them. Try again." };

  if (member.user_id) {
    const teamInfo = await teamMeta(supabase, teamId);
    await sendNotifications({
      recipient_id: member.user_id,
      kind: "kicked",
      metadata: { team: teamInfo },
      body: `You were removed from ${team.name ?? "a team"}.`,
    });
  }

  revalidatePath("/team");
  return { success: true };
}

export async function updateTeamName(teamId: string, name: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Team name can't be empty." };
  if (trimmed.length > 60) return { error: "Keep the name under 60 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ name: trimmed }).eq("id", teamId);
  if (error) return { error: "Couldn't rename the team. Try again." };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateTeamLogo(teamId: string, logoUrl: string | null) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  // Only accept logos that live in this team's own storage folder.
  if (logoUrl !== null) {
    if (!isOwnStorageUrl(logoUrl, "team-logos", teamId)) return { error: "Invalid logo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ logo_url: logoUrl }).eq("id", teamId);
  if (error) return { error: "Couldn't save the logo. Try again." };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function setRoleColor(teamId: string, role: RoleId, color: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };
  if (!VALID_ROLE_IDS.has(role)) return { error: "Unknown role." };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "Invalid color." };

  const supabase = await createClient();
  await supabase
    .from("role_colors")
    .upsert({ team_id: teamId, role, color }, { onConflict: "team_id,role" });

  revalidatePath("/team");
  return { success: true };
}

/**
 * Hands ownership of the team to another active member. Restricted to
 * the CURRENT owner specifically — not just any master — since this is
 * fundamentally "I'm relinquishing my own ownership," not a general
 * management action. The new owner automatically gets Master (the
 * "owner is always master" invariant has to hold immediately, not as a
 * follow-up step); the outgoing owner keeps whatever roles they already
 * had and is free to edit their own roles afterward, since they're no
 * longer owner-locked.
 */
export async function requestOwnershipTransfer(teamId: string, toUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { data: team } = await supabase.from("teams").select("owner_id, name").eq("id", teamId).single();
  if (!team || team.owner_id !== user.id) {
    return { error: "Only the current owner can request a transfer." };
  }
  if (toUserId === user.id) {
    return { error: "That's already you." };
  }

  const { data: targetMember } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", toUserId)
    .eq("status", "active")
    .single();

  if (!targetMember) {
    return { error: "They need to be an active member of this team first." };
  }

  // Clear any stale (expired) request for this team so a fresh one can
  // go out — same pattern as team invites.
  const admin = createAdminClient();
  await admin
    .from("ownership_transfer_requests")
    .update({ status: "expired" })
    .eq("team_id", teamId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const { data: request, error } = await supabase
    .from("ownership_transfer_requests")
    .insert({ team_id: teamId, from_user_id: user.id, to_user_id: toUserId })
    .select("id")
    .single();

  if (error || !request) {
    if (error?.code === "23505") {
      return { error: "There's already a live transfer request for this team." };
    }
    return { error: "Couldn't send the request. Try again." };
  }

  const actor = await actorMeta(supabase, user.id);
  const teamInfo = await teamMeta(supabase, teamId);

  const { error: notifyError } = await sendNotifications({
    recipient_id: toUserId,
    ownership_transfer_id: request.id,
    kind: "ownership_request",
    metadata: { actor, team: teamInfo },
    body: `${team.name} owner wants to make you the new owner.`,
  });

  if (notifyError) {
    await admin.from("ownership_transfer_requests").delete().eq("id", request.id);
    return { error: "Couldn't notify them. Try again." };
  }

  revalidatePath("/team");
  return { success: true };
}

/**
 * Cancels the team's pending ownership request. Owner-only. Deleting
 * the row also removes the recipient's notification (FK cascade), same
 * as canceling a team invite.
 */
export async function cancelOwnershipTransfer(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", teamId).single();
  if (!team || team.owner_id !== user.id) {
    return { error: "Only the current owner can cancel a transfer." };
  }

  const { error } = await createAdminClient()
    .from("ownership_transfer_requests")
    .delete()
    .eq("team_id", teamId)
    .eq("from_user_id", user.id)
    .eq("status", "pending");

  if (error) return { error: "Couldn't cancel the request. Try again." };

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Short-video scheduling settings + default people for new shorts.
 * Changing per-day / weekends / time zone immediately re-flows every
 * auto-scheduled short (database trigger, migration 0027).
 */
export async function updateShortSettings(
  teamId: string,
  input: {
    perDay: number;
    weekends: boolean;
    rollForward: boolean;
    defaultType: "filler" | "sponsorship" | "big";
    timezone: string;
    defaultEditor: string | null;
    defaultReviewer: string | null;
    defaultScheduler: string | null;
    defaultScripter: string | null;
    youtubeDescription: string;
  }
) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };

  const perDay = Math.round(Number(input.perDay));
  if (!Number.isFinite(perDay) || perDay < 1 || perDay > 10) {
    return { error: "Shorts per day must be between 1 and 10." };
  }
  const timezone = String(input.timezone ?? "").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: "Pick a valid time zone." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .update({
      shorts_per_day: perDay,
      shorts_weekends: !!input.weekends,
      shorts_roll_forward: !!input.rollForward,
      default_short_type: ["filler", "sponsorship", "big"].includes(input.defaultType) ? input.defaultType : "filler",
      timezone,
      default_short_editor_member_id: input.defaultEditor || null,
      default_short_reviewer_member_id: input.defaultReviewer || null,
      default_short_scheduler_member_id: input.defaultScheduler || null,
      default_short_scripter_member_id: input.defaultScripter || null,
      default_youtube_description: String(input.youtubeDescription ?? "").slice(0, 5000),
    })
    .eq("id", teamId);

  if (error) {
    const own = error.code === "23514" || error.code === "42501";
    return { error: own ? error.message : "Couldn't save the settings. Try again." };
  }

  revalidatePath("/team");
  revalidatePath("/shorts");
  return { success: true };
}

/** Team → Defaults → Video files: how long posted shorts' files stay (masters). */
export async function updateMediaKeepDays(teamId: string, days: number) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };
  if (!isMediaKeepDays(days)) return { error: "Pick 1, 2 or 3 weeks, or 1 month." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").update({ media_keep_days: days }).eq("id", teamId).select("id");
  if (error) {
    return { error: error.code === "42703" || error.code === "PGRST204" ? "This needs the latest database update (migration 0070)." : "Couldn't save. Try again." };
  }
  if (!data?.length) return { error: "Only the master can do this." };
  revalidatePath("/team");
  return { success: true };
}

/**
 * Disconnect a social account: revoke our access at the platform where
 * it allows it, delete the stored tokens, and record it.
 */
export async function disconnectSocialAccount(teamId: string, platform: string) {
  const { isSocialPlatform, PROVIDERS } = await import("@/lib/social/providers");
  const { requireSocialManager } = await import("@/lib/social/access");
  const { decryptToken } = await import("@/lib/social/crypto");
  const { logSocial } = await import("@/lib/social/tokens");
  const { createAdminClient } = await import("@/lib/supabase/admin");

  if (!isSocialPlatform(platform)) return { error: "Unknown platform." };
  const access = await requireSocialManager(teamId);
  if (!access.user) return { error: "Your session expired. Sign in again." };
  if (!access.ok) return { error: "Only the master or a scheduler can disconnect accounts." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("social_accounts")
    .select("id, access_token_enc, refresh_token_enc, username, display_name")
    .eq("team_id", teamId)
    .eq("platform", platform)
    .maybeSingle();
  if (!row) return { error: "That account isn't connected." };

  // Best effort: even if the platform is unreachable, we still forget the tokens.
  try {
    await PROVIDERS[platform].revoke({
      accessToken: decryptToken(row.access_token_enc as string),
      refreshToken: row.refresh_token_enc ? decryptToken(row.refresh_token_enc as string) : null,
    });
  } catch {
    /* ignore */
  }
  const { error } = await admin.from("social_accounts").delete().eq("id", row.id);
  if (error) return { error: "Couldn't disconnect. Try again." };
  await logSocial(teamId, platform, "disconnected", access.user.id, { account: row.username ?? row.display_name });

  revalidatePath("/team");
  return { success: true };
}

/** The Facebook Pages the person who connected Facebook manages (to pick which one is posted to and feeds Analytics). */
export async function listFacebookPages(teamId: string): Promise<{ error: string } | { pages: { id: string; name: string; picture: string | null; current: boolean }[] }> {
  const { facebookPages } = await import("@/lib/social/providers");
  const { requireSocialManager } = await import("@/lib/social/access");
  const { decryptToken } = await import("@/lib/social/crypto");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const access = await requireSocialManager(teamId);
  if (!access.user) return { error: "Your session expired. Sign in again." };
  if (!access.ok) return { error: "Only the master or a scheduler can change this." };
  const admin = createAdminClient();
  const { data: row } = await admin.from("social_accounts").select("external_id, refresh_token_enc").eq("team_id", teamId).eq("platform", "facebook").maybeSingle();
  if (!row?.refresh_token_enc) return { error: "Connect Facebook again to pick a Page." };
  try {
    const pages = await facebookPages(decryptToken(row.refresh_token_enc as string));
    return { pages: pages.map((p) => ({ id: p.id, name: p.name, picture: p.picture, current: p.id === row.external_id })) };
  } catch {
    return { error: "Facebook didn't answer. Reconnect Facebook and try again." };
  }
}

/** Use another of your Pages for posting and Analytics (its numbers are copied from the next sync). */
export async function chooseFacebookPage(teamId: string, pageId: string) {
  const { facebookPages } = await import("@/lib/social/providers");
  const { requireSocialManager } = await import("@/lib/social/access");
  const { decryptToken, encryptToken } = await import("@/lib/social/crypto");
  const { logSocial } = await import("@/lib/social/tokens");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  if (!/^\d{3,30}$/.test(pageId)) return { error: "Unknown Page." };
  const access = await requireSocialManager(teamId);
  if (!access.user) return { error: "Your session expired. Sign in again." };
  if (!access.ok) return { error: "Only the master or a scheduler can change this." };
  const admin = createAdminClient();
  const { data: row } = await admin.from("social_accounts").select("id, refresh_token_enc, external_id").eq("team_id", teamId).eq("platform", "facebook").maybeSingle();
  if (!row?.refresh_token_enc) return { error: "Connect Facebook again to pick a Page." };
  let page;
  try {
    page = (await facebookPages(decryptToken(row.refresh_token_enc as string))).find((p) => p.id === pageId);
  } catch {
    return { error: "Facebook didn't answer. Reconnect Facebook and try again." };
  }
  if (!page) return { error: "That Page isn't available to this Facebook account any more." };
  // One Page, one team.
  const { data: elsewhere } = await admin.from("social_accounts").select("id").eq("platform", "facebook").eq("external_id", page.id).neq("team_id", teamId).limit(1);
  if (elsewhere?.length) return { error: `That Page is already connected to another ${APP_NAME} team. Disconnect it there first.` };
  const { error } = await admin
    .from("social_accounts")
    .update({ access_token_enc: encryptToken(page.token), external_id: page.id, display_name: page.name, username: null, avatar_url: page.picture, status: "active", last_error: null })
    .eq("id", row.id);
  if (error) return { error: error.code === "23505" ? `That Page is already connected to another ${APP_NAME} team. Disconnect it there first.` : "Couldn't switch the Page. Try again." };
  // Another Page: the old one's numbers (every table) no longer belong here,
  // and the next sync starts fresh (90 days). The same Page: nothing changes.
  const { adoptAccount } = await import("@/modules/analytics/lib/accounts");
  await adoptAccount(admin, teamId, "facebook", { externalId: page.id, name: page.name }, (row.external_id as string | null) ?? null);
  await logSocial(teamId, "facebook", "reconnected", access.user.id, { account: page.name });
  revalidatePath("/team");
  revalidatePath("/analytics");
  return { success: true };
}

/** The team's colours for shorts and long videos (masters). */
export async function updateTeamColors(teamId: string, shortColor: string, longColor: string) {
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!hex.test(shortColor) || !hex.test(longColor)) return { error: "Pick valid colours." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .update({ short_color: shortColor.toUpperCase(), long_color: longColor.toUpperCase() })
    .eq("id", teamId)
    .select("id");
  if (error || !data?.length) return { error: "Only the master can change the team's colours." };
  // Colours are used on every page.
  revalidatePath("/", "layout");
  return { success: true };
}

/** Team → Long videos: default description and default scripter (masters). */
export async function updateLongSettings(
  teamId: string,
  input: { description: string; scripter: string | null; people?: Partial<Record<"researcher" | "filmer" | "editor" | "packager" | "publisher", string | null>> }
) {
  const description = String(input.description ?? "");
  if (description.length > 5000) return { error: "Descriptions can be up to 5,000 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .update({
      default_long_description: description,
      default_long_scripter_member_id: input.scripter || null,
      ...(input.people
        ? {
            default_long_researcher_id: input.people.researcher || null,
            default_long_filmer_id: input.people.filmer || null,
            default_long_editor_id: input.people.editor || null,
            default_long_packager_id: input.people.packager || null,
            default_long_publisher_id: input.people.publisher || null,
          }
        : {}),
    })
    .eq("id", teamId)
    .select("id");
  if (error?.code === "42703" || error?.code === "PGRST204") {
    return { error: "The database is missing the newest update: run migration 0052 in Supabase, then save again." };
  }
  if (error) return { error: `Couldn't save: ${error.message}` };
  if (!data?.length) return { error: "Only the master can change these settings." };
  revalidatePath("/team");
  return { success: true };
}

const TASKS_VISIBILITY = ["own", "masters", "team"] as const;
export type TasksVisibility = (typeof TASKS_VISIBILITY)[number];

/** Team → Defaults → Tasks (masters): who can see everyone's tasks in My tasks → Team (0076). */
export async function updateTasksVisibility(teamId: string, value: string) {
  const check = await requireMaster(teamId);
  if (!check.ok) return { error: check.error };
  if (!(TASKS_VISIBILITY as readonly string[]).includes(value)) return { error: "Pick who can see everyone's tasks." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").update({ tasks_visibility: value }).eq("id", teamId).select("id");
  if (error) return { error: error.code === "42703" || error.code === "PGRST204" ? "This needs the latest database update (migration 0076)." : "Couldn't save. Try again." };
  if (!data?.length) return { error: "Only the master can do this." };
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return { success: true };
}
