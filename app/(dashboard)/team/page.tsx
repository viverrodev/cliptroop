import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { StarIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { colorForId, displayName, initialsFor } from "@/lib/avatar";
import { getCachedUser } from "@/lib/supabase/get-user";
import { TeamLogoUploader } from "./team-logo-uploader";
import { TeamNameEditor } from "./team-name-editor";
import { InviteSearch } from "./invite-search";
import { PendingInvitesList } from "./pending-invites-list";
import { MemberManager, type MemberRow } from "./member-manager";
import { MemberAvatarLink, MemberNameLink } from "@/components/ui/member-identity";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };
import { RoleColorPicker } from "./role-color-picker";
import { TransferOwnership } from "./transfer-ownership";
import { DeleteTeamButton } from "./delete-team-button";
import { ShortSettingsForm } from "./short-settings";
import { APP_VERSION_LABEL } from "@/lib/version";
import { KindColorsForm } from "./kind-colors-form";
import { TeamTabs } from "./team-tabs";
import { MembersHeader } from "./invite-toggle";
import { LongSettingsForm } from "./long-settings";
import { ScriptSettingsForm } from "./script-settings";
import { DEFAULT_LONG_COLOR, DEFAULT_SHORT_COLOR } from "@/lib/kind-colors";
import { Suspense } from "react";
// Each tab's heavy parts load only on that tab (the page shows one tab at a time).
import { ConnectedAccounts, ObjectivesSettings } from "./lazy-tabs";
import { FACEBOOK_POST_SCOPE, PROVIDERS, YOUTUBE_EDIT_SCOPE, hasStatsScopes, statsEnabled, type SocialPlatform } from "@/lib/social/providers";
import { getSocialSetup } from "@/lib/social/setup";
import { socialKeyConfigured } from "@/lib/social/crypto";

import { getMediaKeep, getShortSettings, listTeamPeople } from "@/modules/short-videos/lib/queries";
import { MediaKeepForm } from "./media-keep-form";
import { TasksVisibilityForm } from "./tasks-visibility-form";
import { WhatsNewButton } from "@/components/ui/whats-new";
import { PendingNav, PendingSwap } from "@/components/ui/pending-nav";
import { TEAM_TABS, TeamTabSkeleton, teamTab, type TeamTab } from "./skeletons";

import { getObjectivesBoard } from "@/modules/objectives/lib/board";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { tab: tabParam, edit: editParam } = await searchParams;
  const tab: TeamTab = teamTab(tabParam);
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);

  if (!currentTeam) {
    return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  }

  // Everything this page needs, in one round trip. The parts only some people
  // see are read anyway (the database hides what isn't theirs) and dropped below.
  const nowIso = new Date().toISOString();
  const [
    membership,
    currentUser,
    roleColors,
    { data: team },
    { data: members },
    { data: pendingInvites },
    { data: socialRows },
    { data: historyRows },
    people,
    shortSettingsAny,
    scriptDefaultsAny,
    { data: transferRow },
    setupAny,
    mediaKeep,
    tasksVis,
    objectivesBoard,
  ] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    getCachedUser(),
    getRoleColors(supabase, currentTeam.id),
    supabase
      .from("teams")
      .select(
        "id, name, logo_url, color, owner_id, short_color, long_color, default_long_description, default_long_scripter_member_id, default_long_researcher_id, default_long_filmer_id, default_long_editor_id, default_long_packager_id, default_long_publisher_id"
      )
      .eq("id", currentTeam.id)
      .single(),
    supabase
      .from("team_members")
      .select("id, user_id, invited_email, status, profiles(username, full_name, email, avatar_url), member_roles(role)")
      .eq("team_id", currentTeam.id)
      .order("created_at"),
    supabase
      .from("team_invites")
      .select("id, proposed_roles, expires_at, created_at, profiles!team_invites_invited_user_id_fkey(username, full_name, email)")
      .eq("team_id", currentTeam.id)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false }),
    // Connected accounts: safe columns only (tokens can't be read by clients at all).
    supabase.from("social_accounts").select("platform, display_name, username, avatar_url, status, last_error, connected_at, scopes").eq("team_id", currentTeam.id),
    tab === "accounts"
      ? supabase
          .from("social_audit_log")
          .select("id, platform, action, detail, created_at, actor:profiles!social_audit_log_actor_id_fkey(username, full_name, email)")
          .eq("team_id", currentTeam.id)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: null }),
    listTeamPeople(currentTeam.id),
    tab === "defaults" ? getShortSettings(currentTeam.id) : Promise.resolve(null),
    // Script flow defaults (0062): who reviews and who stages.
    tab === "defaults" ? supabase.from("team_script_people").select("step, team_member_id").eq("team_id", currentTeam.id) : Promise.resolve({ data: [], error: null }),
    // The owner's live (pending, unexpired) ownership request, if any — so it can be shown and cancelled.
    supabase.from("ownership_transfer_requests").select("id, to_user_id, expires_at").eq("team_id", currentTeam.id).eq("status", "pending").gt("expires_at", nowIso).maybeSingle(),
    // Setup check: staging and your computer only (production keeps it out of sight).
    tab === "accounts" && process.env.VERCEL_ENV !== "production" ? getSocialSetup() : Promise.resolve(null),
    // Video files: how long they stay after posting (0070), and what's stored.
    tab === "defaults" ? getMediaKeep(currentTeam.id) : Promise.resolve(null),
    // Who sees everyone's tasks (0076): its own query, so an older database just says so.
    tab === "defaults" ? supabase.from("teams").select("tasks_visibility").eq("id", currentTeam.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    // Objectives (0078): the team's goals with where each stands now.
    tab === "objectives" ? getObjectivesBoard(supabase, currentTeam.id, { history: "none" }) : Promise.resolve(null),
  ]);
  const userIsMaster = isMaster(membership?.roles ?? []);
  const canManageSocial = userIsMaster || (membership?.roles ?? []).includes("publisher");
  const teamColors = team ? { short_color: team.short_color, long_color: team.long_color } : null;
  const longDefaults = team;
  const longPeople = userIsMaster ? people : [];
  const socialHistory = canManageSocial ? historyRows : null;
  const socialConfigured = {
    youtube: PROVIDERS.youtube.configured() && socialKeyConfigured(),
    instagram: PROVIDERS.instagram.configured() && socialKeyConfigured(),
    tiktok: PROVIDERS.tiktok.configured() && socialKeyConfigured(),
    facebook: PROVIDERS.facebook.configured() && socialKeyConfigured(),
  };
  const socialSetup = canManageSocial ? setupAny : null;
  const shortSettings = userIsMaster ? shortSettingsAny : null;
  const shortPeople = userIsMaster ? people : [];
  const scriptDefaults = userIsMaster && tab === "defaults" ? scriptDefaultsAny : { data: [], error: null };
  const viewerIsOwner = !!currentUser && currentUser.id === team?.owner_id;
  const pendingTransferRow = viewerIsOwner ? transferRow : null;

  const memberRows: MemberRow[] = (members ?? []).map((m) => {
    const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
    const email = profile?.email ?? m.invited_email;
    return {
      teamMemberId: m.id,
      userId: m.user_id,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      name: displayName(profile?.username, profile?.full_name, email),
      email,
      status: m.status as "invited" | "active",
      roles: (m.member_roles ?? []).map((r: { role: RoleId }) => r.role),
      isOwner: m.user_id === team?.owner_id,
      color: m.user_id ? colorForId(m.user_id) : "#999",
    };
  });


  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 w-full max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold mb-1">Team settings</h1>
        <p className="text-sm text-ink-soft">Manage {currentTeam.name} and who&rsquo;s in it.</p>
      </div>

      {/* Switching tabs answers at once: the tab is underlined and its skeleton shows until it's here. */}
      <PendingNav>
      <TeamTabs active={tab} showDefaults={userIsMaster} />

      <PendingSwap fallbacks={Object.fromEntries(TEAM_TABS.map((t) => [t.id, <TeamTabSkeleton key={t.id} tab={t.id} />]))}>
      <div className="space-y-6">

      {tab === "members" && (
        <div className="space-y-6">
        {/* Members: one list; "Invite people" right in the header */}
        <section>
          <MembersHeader count={memberRows.length} canInvite={userIsMaster}>
              <PendingInvitesList
                teamId={currentTeam.id}
                invites={(pendingInvites ?? []).map((inv) => {
                  const p = inv.profiles as unknown as {
                    username: string | null;
                    full_name: string | null;
                    email: string | null;
                  } | null;
                  return {
                    id: inv.id,
                    name: displayName(p?.username, p?.full_name, p?.email),
                    proposedRoles: (inv.proposed_roles ?? []) as RoleId[],
                    expiresAt: inv.expires_at,
                  };
                })}
              />
              <InviteSearch teamId={currentTeam.id} />
          </MembersHeader>
          <div className="rounded-2xl border border-line/15 bg-surface divide-y divide-line/10 overflow-hidden">
            {memberRows.map((m) => (
              <MemberManager
                key={m.teamMemberId}
                teamId={currentTeam.id}
                member={m}
                roleColors={roleColors}
                isSelf={m.userId === currentUser?.id}
                viewerIsOwner={viewerIsOwner}
                readOnly={!userIsMaster}
              />
            ))}
          </div>
        </section>
        </div>
      )}

      {tab === "defaults" && userIsMaster && (
        <div className="grid gap-6 xl:grid-cols-2 items-start">
        {userIsMaster && (
          <section className="rounded-xl border border-line/10 bg-surface p-6">
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">
              Short videos
            </h2>
            <p className="text-[12px] text-ink-soft mb-5">
              Your daily rhythm, and who works on new shorts by default.
            </p>
            <ShortSettingsForm
              teamId={currentTeam.id}
              settings={shortSettings!}
              people={shortPeople}
            />
          </section>
        )}
        {userIsMaster && (
          <section className="rounded-xl border border-line/10 bg-surface p-6">
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Long videos</h2>
            <p className="text-[12px] text-ink-soft mb-5">What every new long video starts with.</p>
            <LongSettingsForm
              teamId={currentTeam.id}
              description={(longDefaults?.default_long_description as string | undefined) ?? ""}
              scripter={(longDefaults?.default_long_scripter_member_id as string | null | undefined) ?? null}
            defaults={{
              researcher: (longDefaults?.default_long_researcher_id as string | null) ?? null,
              filmer: (longDefaults?.default_long_filmer_id as string | null) ?? null,
              editor: (longDefaults?.default_long_editor_id as string | null) ?? null,
              packager: (longDefaults?.default_long_packager_id as string | null) ?? null,
              publisher: (longDefaults?.default_long_publisher_id as string | null) ?? null,
            }}
              people={longPeople}
            />
          </section>
        )}
        {userIsMaster && (
          <section id="tasks" className="rounded-xl border border-line/10 bg-surface p-6 scroll-mt-20">
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Tasks</h2>
            <p className="text-[12px] text-ink-soft mb-5">Who can see everyone&rsquo;s tasks (who has to do what, and what&rsquo;s late) in My tasks on the dashboard.</p>
            <TasksVisibilityForm
              teamId={currentTeam.id}
              ready={!tasksVis.error}
              value={((tasksVis.data as { tasks_visibility?: string } | null)?.tasks_visibility as "own" | "masters" | "team" | undefined) ?? "own"}
            />
          </section>
        )}
        {userIsMaster && mediaKeep && (
          <section id="video-files" className="rounded-xl border border-line/10 bg-surface p-6 scroll-mt-20">
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Video files</h2>
            <p className="text-[12px] text-ink-soft mb-5">Shorts&rsquo; uploaded videos take the most space. Once a short is posted everywhere, its files are deleted after this long.</p>
            <MediaKeepForm teamId={currentTeam.id} days={mediaKeep.days} ready={mediaKeep.ready} files={mediaKeep.files} bytes={mediaKeep.bytes} />
          </section>
        )}
        {userIsMaster && (
          <section className="rounded-xl border border-line/10 bg-surface p-6">
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Scripts</h2>
            <p className="text-[12px] text-ink-soft mb-5">Script → Review → Staging: who&rsquo;s next when a script is handed on.</p>
            <ScriptSettingsForm
              teamId={currentTeam.id}
              ready={!scriptDefaults.error}
              defaults={{
                review: (scriptDefaults.data ?? []).filter((r) => r.step === "review").map((r) => r.team_member_id as string),
                staging: (scriptDefaults.data ?? []).filter((r) => r.step === "staging").map((r) => r.team_member_id as string),
              }}
              people={shortPeople}
            />
          </section>
        )}
        </div>
      )}

      {tab === "objectives" && objectivesBoard && (
        <section id="objectives" className="rounded-xl border border-line/10 bg-surface p-4 sm:p-6 scroll-mt-20">
          <ObjectivesSettings teamId={currentTeam.id} canEdit={userIsMaster} initial={objectivesBoard} people={people} editId={editParam ?? null} />
        </section>
      )}

      {tab === "accounts" && (
        <div className="space-y-6">
        <section id="connected-accounts" className="rounded-xl border border-line/10 bg-surface p-6 scroll-mt-20">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">
            Connected accounts
          </h2>
          <p className="text-[12px] text-ink-soft mb-5">
            Where approved shorts get posted, and where Analytics reads its numbers. Sign-ins are stored encrypted and never leave the server.
          </p>
          <Suspense>
            <ConnectedAccounts
              teamId={currentTeam.id}
              canManage={canManageSocial}
              configured={socialConfigured}
              accounts={(socialRows ?? []).map((r) => ({
                platform: r.platform as "youtube" | "instagram" | "tiktok" | "facebook",
                displayName: (r.display_name as string | null) ?? null,
                username: (r.username as string | null) ?? null,
                avatarUrl: (r.avatar_url as string | null) ?? null,
                status: r.status as "active" | "needs_reconnect",
                lastError: (r.last_error as string | null) ?? null,
                connectedAt: r.connected_at as string,
                // YouTube connected before "change scheduled videos" existed;
                // a Facebook Page connected before posting to it existed.
                missingPermission:
                  (r.platform === "youtube" && !((r.scopes as string[] | null) ?? []).includes(YOUTUBE_EDIT_SCOPE)) ||
                  (r.platform === "facebook" && !((r.scopes as string[] | null) ?? []).includes(FACEBOOK_POST_SCOPE)),
                // Analytics is switched on for this platform, but this sign-in predates it.
                statsMissing:
                  statsEnabled(r.platform as SocialPlatform) && !hasStatsScopes(r.platform as SocialPlatform, (r.scopes as string[] | null) ?? []),
              }))}
              setup={socialSetup}
              history={
                socialHistory
                  ? socialHistory.map((h) => {
                      const a = (Array.isArray(h.actor) ? h.actor[0] : h.actor) as { username: string | null; full_name: string | null; email: string | null } | null;
                      return {
                        id: h.id as number,
                        platform: h.platform as string,
                        action: h.action as string,
                        actor: a ? displayName(a.username, a.full_name, a.email) : null,
                        account: ((h.detail as { account?: string } | null)?.account ?? null) as string | null,
                        at: h.created_at as string,
                      };
                    })
                  : null
              }
            />
          </Suspense>
        </section>
        </div>
      )}

      {tab === "appearance" && (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
        {userIsMaster && (
          <section className="rounded-xl border border-line/10 bg-surface p-6">
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Colors</h2>
            <p className="text-[12px] text-ink-soft mb-5">The colours for shorts and long videos, used everywhere in the app.</p>
            <KindColorsForm
              teamId={currentTeam.id}
              short={(teamColors?.short_color as string | undefined) ?? DEFAULT_SHORT_COLOR}
              long={(teamColors?.long_color as string | undefined) ?? DEFAULT_LONG_COLOR}
            />
          </section>
        )}
        {/* Role colors */}
        <section className="rounded-xl border border-line/10 bg-surface p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">
            Role colors
          </h2>
          <p className="text-[12px] text-ink-soft mb-4">
            Used for role badges, @mentions, and everywhere a role shows up.
          </p>
          {userIsMaster ? (
            <RoleColorPicker teamId={currentTeam.id} roleColors={roleColors} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ROLES.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 rounded-lg border border-line/10 px-3 py-2.5">
                  <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: roleColors[r.id] }} />
                  <span className="text-[12.5px] font-semibold">{r.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>
      )}

      {tab === "team" && (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Workspace branding */}
        <section className="rounded-xl border border-line/10 bg-surface p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
            Workspace
          </h2>
          <div className="mb-4">
            <TeamNameEditor teamId={currentTeam.id} name={team?.name ?? currentTeam.name} />
          </div>
          {userIsMaster ? (
            <TeamLogoUploader
              teamId={currentTeam.id}
              logoUrl={team?.logo_url ?? null}
              initials={initialsFor(currentTeam.name)}
              color={team?.color ?? "#E8630D"}
            />
          ) : (
            <p className="text-[12.5px] text-ink-faint">Only the master can change workspace branding.</p>
          )}
        </section>
        {currentUser?.id === team?.owner_id && (
          <section className="rounded-xl border border-red/20 bg-red/5 p-6">
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-red mb-1">
              Transfer ownership
            </h2>
            <p className="text-[12px] text-ink-soft mb-4">
              Send someone a request to become this team&rsquo;s owner. Nothing
              changes until they accept. You stay the owner until then.
            </p>
            <TransferOwnership
              teamId={currentTeam.id}
              pendingTransfer={
                pendingTransferRow
                  ? {
                      name:
                        memberRows.find((m) => m.userId === pendingTransferRow.to_user_id)?.name ??
                        "a teammate",
                      expiresAt: pendingTransferRow.expires_at,
                    }
                  : null
              }
              candidates={memberRows
                .filter((m) => m.userId && m.userId !== currentUser?.id && m.status === "active")
                .map((m) => ({ userId: m.userId as string, name: m.name, avatarUrl: m.avatarUrl }))}
            />

            <div className="mt-5 pt-5 border-t border-red/20">
              <h3 className="text-[12px] font-bold text-red mb-1">Delete team</h3>
              <p className="text-[12px] text-ink-soft mb-3">
                Permanent. Every project, comment, and member goes with it.
              </p>
              <DeleteTeamButton
                teamId={currentTeam.id}
                teamName={currentTeam.name}
              />
            </div>
          </section>
        )}
        </div>
      )}
      </div>
      </PendingSwap>
      </PendingNav>

      <p className="text-center text-[11.5px] text-ink-faint tabular-nums pt-2">
        {APP_NAME} {APP_VERSION_LABEL} · <WhatsNewButton className="text-[11.5px]" /> ·{" "}
        <Link href="/status" className="hover:text-ink underline-offset-2 hover:underline">
          Status
        </Link>
      </p>
    </div>
  );
}
