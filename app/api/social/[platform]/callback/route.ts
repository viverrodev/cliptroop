import { APP_NAME } from "@/lib/brand";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PROVIDERS, ProviderError, hasStatsScopes, isSocialPlatform, missingRequired, redirectUriFor, statsEnabled } from "@/lib/social/providers";
import { requireSocialManager } from "@/lib/social/access";
import { encryptToken } from "@/lib/social/crypto";
import { logSocial } from "@/lib/social/tokens";
import { POPUP_COOKIE } from "@/lib/social/popup";
import { adoptAccount } from "@/modules/analytics/lib/accounts";

export const dynamic = "force-dynamic";

type Result = { ok: boolean; platform: string | null; error?: string; message?: string; note?: string };

/**
 * When connecting happened in its own window (the usual way): a tiny page
 * that tells the Team page how it went (BroadcastChannel + storage event,
 * which work even when the platform's sign-in cut the link to the opener)
 * and closes itself. If it can't close, it goes to the accounts tab.
 */
function popupPage(result: Result, fallback: string) {
  const json = JSON.stringify({ type: "vp-social", ...result }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME}</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#edeee7;color:#14110c}@media (prefers-color-scheme:dark){body{background:#120f0b;color:#f0ece3}}p{margin:0;padding:24px;text-align:center}</style></head>
<body><p>${result.ok ? "Connected. You can close this window." : "That didn&rsquo;t work. You can close this window."}</p>
<script>
(function(){var r=${json};
try{var bc=new BroadcastChannel("vp-social");bc.postMessage(r);bc.close();}catch(e){}
try{localStorage.setItem("vp-social",JSON.stringify(Object.assign({t:Date.now()},r)));}catch(e){}
try{if(window.opener)window.opener.postMessage(r,location.origin);}catch(e){}
setTimeout(function(){window.close();setTimeout(function(){location.replace(${JSON.stringify(fallback)});},500);},250);})();
</script></body></html>`;
  const res = new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
  res.cookies.set(POPUP_COOKIE, "", { path: "/api/social", maxAge: 0 });
  return res;
}

/** This person connected this platform in the last 2 minutes (a repeat of that sign-in). */
async function justConnected(admin: ReturnType<typeof createAdminClient>, platform: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await admin
      .from("social_accounts")
      .select("id")
      .eq("platform", platform)
      .eq("connected_by", user.id)
      .eq("status", "active")
      .gte("connected_at", new Date(Date.now() - 2 * 60_000).toISOString())
      .limit(1);
    return !!data?.length;
  } catch {
    return false;
  }
}

/**
 * The platform sends the person back here. We only accept it if the
 * "state" is ours, fresh (15 min), used once, and belongs to the same
 * signed-in person, who must still be a master or scheduler.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const q = request.nextUrl.searchParams;
  const popup = request.cookies.get(POPUP_COOKIE)?.value === "1";
  const finish = (r: Result) => {
    const query = new URLSearchParams({ tab: "accounts" });
    if (r.ok) query.set("social", "connected");
    else query.set("social_error", r.error ?? "failed");
    if (r.platform) query.set("platform", r.platform);
    if (r.message) query.set("message", r.message);
    if (r.note) query.set("note", r.note);
    const target = `/team?${query}#connected-accounts`;
    if (popup) return popupPage(r, target);
    const res = NextResponse.redirect(new URL(target, request.url));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };
  if (!isSocialPlatform(platform)) return finish({ ok: false, platform: null, error: "bad_request" });

  try {
    const state = q.get("state") ?? "";
    const admin = createAdminClient();
    // Single use: take it out as we read it.
    const { data: saved } = await admin
      .from("oauth_states")
      .delete()
      .eq("state", state)
      .eq("platform", platform)
      .select("team_id, user_id, code_verifier, created_at")
      .maybeSingle();
    if (!saved) {
      // The same sign-in can arrive twice (Instagram does this): the first
      // one already connected the account, so this one is that success, not
      // an expired attempt.
      if (await justConnected(admin, platform)) return finish({ ok: true, platform });
      return finish({ ok: false, platform, error: "expired" });
    }
    if (Date.now() - Date.parse(saved.created_at as string) > 15 * 60_000) return finish({ ok: false, platform, error: "expired" });

    const access = await requireSocialManager(saved.team_id as string);
    if (!access.user || access.user.id !== saved.user_id) return finish({ ok: false, platform, error: "expired" });
    if (!access.ok) return finish({ ok: false, platform, error: "forbidden" });

    // The person pressed "Cancel" on the platform's screen, or the platform
    // refused (wrong scopes, app not allowed for this account…): say why.
    const refused = q.get("error");
    if (refused || !q.get("code")) {
      const why = q.get("error_description") || q.get("error_reason") || "";
      if (!refused || /^(access_denied|user_denied|user_cancel)/i.test(refused)) {
        return finish({ ok: false, platform, error: "cancelled", message: why && !/cancel|denied the request|user denied|permissions error/i.test(why) ? why.slice(0, 200) : undefined });
      }
      return finish({ ok: false, platform, error: "refused", message: (why || refused).slice(0, 200) });
    }

    const provider = PROVIDERS[platform];
    const tokens = await provider.exchange({
      code: q.get("code")!,
      verifier: (saved.code_verifier as string | null) ?? null,
      redirectUri: redirectUriFor(platform, request.nextUrl.origin),
    });
    // Some boxes were unticked on the consent screen: refuse it (and keep
    // the connection we already had) instead of saving a half-working one.
    const missing = missingRequired(platform, tokens.scopes);
    if (missing.length) return finish({ ok: false, platform, error: "missing_permissions", message: missing.map((m) => m.label).join(" · ") });

    const profile = await provider.profile(tokens.accessToken);

    const { data: existing } = await admin.from("social_accounts").select("id, external_id").eq("team_id", saved.team_id).eq("platform", platform).maybeSingle();

    // One account, one team: if this channel / account / Page is connected to
    // another team (anyone's), it must be disconnected there first. The
    // database enforces it too (0063); this gives the clear message.
    const { data: elsewhere } = await admin
      .from("social_accounts")
      .select("id")
      .eq("platform", platform)
      .eq("external_id", profile.externalId)
      .neq("team_id", saved.team_id)
      .limit(1);
    if (elsewhere?.length) {
      await logSocial(saved.team_id as string, platform, "refused_taken", access.user.id, { account: profile.username ?? profile.displayName });
      return finish({ ok: false, platform, error: "taken" });
    }

    const { error } = await admin.from("social_accounts").upsert(
      {
        team_id: saved.team_id,
        platform,
        external_id: profile.externalId,
        display_name: profile.displayName,
        username: profile.username,
        avatar_url: profile.avatarUrl,
        access_token_enc: encryptToken(tokens.accessToken),
        refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        token_expires_at: tokens.expiresAt?.toISOString() ?? null,
        refresh_expires_at: tokens.refreshExpiresAt?.toISOString() ?? null,
        scopes: tokens.scopes,
        status: "active",
        last_error: null,
        connected_by: access.user.id,
        connected_at: new Date().toISOString(),
        last_refreshed_at: null,
      },
      { onConflict: "team_id,platform" }
    );
    if (error) {
      // Lost a race with another team connecting the same account (unique index, 0063).
      if (error.code === "23505") return finish({ ok: false, platform, error: "taken" });
      throw new ProviderError("Couldn't save the connection.");
    }

    // A different channel / account / Page than the one whose numbers we
    // have (even one disconnected weeks ago): its numbers go before anything
    // is copied, so two accounts never mix (modules/analytics/lib/accounts.ts).
    await adoptAccount(admin, saved.team_id as string, platform, { externalId: profile.externalId, name: profile.username ?? profile.displayName }, existing?.external_id ?? null);

    await logSocial(saved.team_id as string, platform, existing ? "reconnected" : "connected", access.user.id, {
      account: profile.username ?? profile.displayName,
    });
    // Connected, but the Analytics box was left unticked: say so.
    const statsMissing = statsEnabled(platform) && !hasStatsScopes(platform, tokens.scopes);
    return finish({ ok: true, platform, note: statsMissing ? "stats_missing" : undefined });
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : "Something went wrong talking to the platform.";
    return finish({ ok: false, platform, error: "failed", message: msg.slice(0, 200) });
  }
}
