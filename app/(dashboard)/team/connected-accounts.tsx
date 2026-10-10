"use client";

import { APP_NAME } from "@/lib/brand";
import { Ago } from "@/components/ui/ago";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { chooseFacebookPage, disconnectSocialAccount, listFacebookPages } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { CheckIcon, ChevronDownIcon, CopyIcon } from "@/components/ui/icons";
import type { SocialSetup } from "@/lib/social/setup";

type Platform = "youtube" | "instagram" | "tiktok" | "facebook";
export type AccountView = {
  platform: Platform;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  status: "active" | "needs_reconnect";
  lastError: string | null;
  connectedAt: string;
  /** Connected, but missing a permission added later (YouTube: change scheduled videos; Facebook: post Reels). */
  missingPermission?: boolean;
  /** Analytics is on for this platform, but this sign-in predates it. */
  statsMissing?: boolean;
};
export type HistoryView = { id: number; platform: string; action: string; actor: string | null; account: string | null; at: string };

const META = {
  youtube: { name: "YouTube", hint: "Your channel. Posts are uploaded and scheduled on YouTube itself." },
  instagram: { name: "Instagram", hint: "A Professional (Business or Creator) account." },
  tiktok: { name: "TikTok", hint: "Your TikTok account." },
  facebook: { name: "Facebook", hint: "A Facebook Page you manage. Shorts are posted to it as Reels, and Analytics reads its numbers." },
} as const;
const ORDER: Platform[] = ["youtube", "instagram", "tiktok", "facebook"];

const ERRORS: Record<string, string> = {
  not_configured: "isn't set up on the server yet (missing app keys).",
  forbidden: "can only be connected by the master or a scheduler.",
  expired: `sign-in expired or came back to a different copy of ${APP_NAME}. Try again; if it keeps happening, open Setup check below.`,
  cancelled: "connection was cancelled.",
  refused: "refused the connection",
  missing_permissions: "wasn't connected: leave every box ticked on the permissions screen. Missing",
  failed: "couldn't be connected.",
  bad_request: "link was invalid.",
  taken: `is already connected to another ${APP_NAME} team. An account can only be in one team: disconnect it there first (Team → Connected accounts), then connect it here.`,
};

const ACTION: Record<string, string> = {
  connected: "connected",
  reconnected: "reconnected",
  disconnected: "disconnected",
  refreshed: "sign-in renewed automatically",
  refresh_failed: "sign-in expired, needs reconnecting",
  refused_taken: "refused: already connected to another team",
};

export function ConnectedAccounts({
  teamId,
  accounts,
  configured,
  canManage,
  history,
  setup = null,
}: {
  teamId: string;
  accounts: AccountView[];
  configured: Record<Platform, boolean>;
  canManage: boolean;
  history: HistoryView[] | null;
  setup?: SocialSetup | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  // Disconnected here: gone from the cards at once, before the page has refreshed.
  const [gone, setGone] = useState<Platform[]>([]);
  const shown = accounts.filter((a) => !gone.includes(a.platform));
  // Once the page's own list no longer has it, forget it (so connecting again shows it).
  useEffect(() => {
    setGone((g) => (g.some((p) => !accounts.some((a) => a.platform === p)) ? g.filter((p) => accounts.some((a) => a.platform === p)) : g));
  }, [accounts]);

  // How connecting went: from the connect window (message / storage event),
  // or from the URL when it happened in this tab.
  const handled = useRef<string | null>(null);
  // A platform can send the same sign-in back twice: the repeat finds its
  // one-time code used ("expired") right next to the real success. So an
  // "expired" waits a moment and is dropped if that platform connected.
  const lastOk = useRef<{ platform: string | null; at: number } | null>(null);
  const heldError = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showResult = useCallback(
    (r: { ok: boolean; platform: string | null; error?: string | null; message?: string | null; note?: string | null }, held = false) => {
      const key = JSON.stringify([r.ok, r.platform, r.error ?? null, r.message ?? null, r.note ?? null]);
      if (!held && handled.current === key) return; // the same result can arrive by two routes
      handled.current = key;
      setTimeout(() => {
        if (handled.current === key) handled.current = null;
      }, 3000);
      if (r.ok) {
        lastOk.current = { platform: r.platform, at: Date.now() };
        if (heldError.current) clearTimeout(heldError.current);
        heldError.current = null;
      } else if (r.error === "expired") {
        if (lastOk.current?.platform === r.platform && Date.now() - lastOk.current.at < 60_000) return;
        if (!held) {
          if (heldError.current) clearTimeout(heldError.current);
          heldError.current = setTimeout(() => {
            heldError.current = null;
            showResult(r, true);
          }, 2500);
          return;
        }
      }
      setBusy(null);
      if (r.ok) setGone([]);
      const name = r.platform && r.platform in META ? META[r.platform as Platform].name : "The account";
      if (r.ok) {
        if (r.note === "stats_missing") toast.error(`${name} connected, but without the Analytics permission. Reconnect and leave every box ticked to see its numbers.`);
        else toast.success(`${name} connected`);
      } else toast.error(`${name} ${ERRORS[r.error ?? "failed"] ?? ERRORS.failed}${r.message ? ` (${r.message})` : ""}`);
      router.refresh();
    },
    [router, toast]
  );
  useEffect(() => {
    const ok = params.get("social");
    const err = params.get("social_error");
    if (!ok && !err) return;
    showResult({ ok: ok === "connected", platform: params.get("platform"), error: err, message: params.get("message"), note: params.get("note") });
    // Stay on this tab (the address keeps ?tab=accounts).
    router.replace(`${pathname}?tab=accounts#connected-accounts`, { scroll: false });
  }, [params, pathname, router, showResult]);
  useEffect(() => {
    const onResult = (data: unknown) => {
      const r = data as { type?: string; ok: boolean; platform: string | null; error?: string; message?: string; note?: string };
      if (r && r.type === "vp-social") showResult(r);
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("vp-social");
      bc.onmessage = (e) => onResult(e.data);
    } catch {}
    const onStorage = (e: StorageEvent) => {
      if (e.key === "vp-social" && e.newValue)
        try {
          onResult(JSON.parse(e.newValue));
        } catch {}
    };
    const onMessage = (e: MessageEvent) => e.origin === window.location.origin && onResult(e.data);
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
    };
  }, [showResult]);

  /** Connect in its own window, so this page stays as it is (falls back to this tab if pop-ups are blocked). */
  function connect(p: Platform, e: React.MouseEvent) {
    e.preventDefault();
    if (!configured[p]) return toast.error(`${META[p].name} ${ERRORS.not_configured}`);
    setGone((g) => g.filter((x) => x !== p));
    const url = `/api/social/${p}/connect?team=${teamId}`;
    const w = 520;
    const h = 720;
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
    const win = window.open(`${url}&popup=1`, "vp-connect", `popup,width=${w},height=${h},left=${left},top=${top}`);
    if (!win) {
      window.location.href = url;
      return;
    }
    setBusy(p);
    win.focus();
    // Closed without finishing: stop the spinner (checked gently; the result itself arrives by message).
    const started = Date.now();
    const t = setInterval(() => {
      let closed = false;
      try {
        closed = win.closed;
      } catch {}
      if (closed || Date.now() - started > 15 * 60_000) {
        clearInterval(t);
        setTimeout(() => setBusy((b) => (b === p ? null : b)), 1500);
      }
    }, 1000);
  }

  async function disconnect(platform: AccountView["platform"]) {
    const ok = await confirm({
      title: `Disconnect ${META[platform].name}?`,
      description: "Scheduled posts to it will stop, and its numbers leave Analytics, the dashboard and objectives. Connect the same account again to bring them back; connecting a different one starts fresh.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    setBusy(platform);
    const res = await disconnectSocialAccount(teamId, platform);
    setBusy(null);
    if ("error" in res && res.error) toast.error(res.error);
    else {
      setGone((g) => (g.includes(platform) ? g : [...g, platform]));
      toast.success(`${META[platform].name} disconnected`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((p) => {
          const a = shown.find((x) => x.platform === p);
          const needs = a?.status === "needs_reconnect";
          return (
            <div
              key={p}
              className={`rounded-xl border p-4 flex flex-col gap-3 ${needs ? "border-amber bg-amber/5" : "border-line/10 bg-surface-2/40"}`}
            >
              <div className="flex items-center gap-2.5">
                <PlatformIcon platform={p} className="w-7 h-7 rounded-lg" />
                <span className="text-[14px] font-semibold">{META[p].name}</span>
                <span className="flex-1" />
                {a && (
                  <span className={`text-[11px] font-bold uppercase tracking-wide ${needs ? "text-amber" : "text-green"}`}>
                    {needs ? "Reconnect" : "Connected"}
                  </span>
                )}
              </div>

              {a ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-surface-2 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{a.displayName ?? a.username ?? "Connected account"}</div>
                    <div className="text-[12px] text-ink-soft truncate">
                      {a.username ? `@${a.username.replace(/^@/, "")} · ` : ""}since <Ago iso={a.connectedAt} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-soft">{META[p].hint}</p>
              )}
              {needs && a?.lastError && <p className="text-[12px] text-amber">{a.lastError}</p>}
              {!needs && a?.missingPermission && (
                <p className="text-[12px] text-amber">
                  {p === "facebook"
                    ? "Reconnect once and allow managing posts, so shorts can be posted to this Page."
                    : "Reconnect once to allow changing and cancelling videos already scheduled on YouTube."}
                </p>
              )}
              {!needs && !a?.missingPermission && a?.statsMissing && <p className="text-[12px] text-amber">Reconnect once to allow Analytics to read its numbers.</p>}
              {p === "facebook" && a && canManage && <FacebookPagePicker teamId={teamId} current={a.displayName} />}

              {canManage && (
                <>
                {/* Two equal buttons (or one full-width Connect): never wider than the card. */}
                <div className={`grid gap-2 mt-auto ${a ? "grid-cols-2" : "grid-cols-1"}`}>
                  {(() => {
                    const urgent = !a || needs || a.missingPermission;
                    return (
                      <a
                        href={configured[p] ? `/api/social/${p}/connect?team=${teamId}` : undefined}
                        aria-disabled={!configured[p]}
                        onClick={(e) => connect(p, e)}
                        className={`press min-w-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 h-9 text-[12.5px] font-bold whitespace-nowrap transition-colors ${
                          !configured[p]
                            ? "bg-surface-2 text-ink-faint cursor-not-allowed"
                            : urgent
                              ? "bg-amber text-white hover:brightness-110"
                              : "border border-line/20 text-ink hover:border-line/40 hover:bg-surface-2"
                        }`}
                      >
                        {busy === p && <span className="w-3.5 h-3.5 rounded-full border-2 border-current/40 border-t-current animate-spin" />}
                        {a ? "Reconnect" : "Connect"}
                      </a>
                    );
                  })()}
                  {a && (
                    <button
                      type="button"
                      onClick={() => void disconnect(p)}
                      disabled={busy === p}
                      className="min-w-0 rounded-lg px-2 h-9 text-[12.5px] font-semibold whitespace-nowrap border border-line/20 text-ink-soft hover:text-red hover:border-red/40 hover:bg-red/10 transition-colors"
                    >
                      {busy === p ? "Disconnecting…" : "Disconnect"}
                    </button>
                  )}
                </div>
                {!configured[p] && !a && <span className="text-[11.5px] text-ink-faint">Keys not added yet</span>}
                </>
              )}
            </div>
          );
        })}
      </div>

      {setup && <SetupCheck setup={setup} />}

      {history && history.length > 0 && (
        <details className="group rounded-xl border border-line/10">
          <summary className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">History</span>
            <span className="rounded-full bg-surface-2 px-2 h-5 inline-flex items-center text-[11px] font-bold text-ink-soft tabular-nums">{history.length}</span>
            <span className="flex-1" />
            <ChevronDownIcon className="w-4 h-4 text-ink-soft transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ol className="space-y-1.5 px-3.5 pb-3">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                <PlatformIcon platform={h.platform as Platform} className="w-4 h-4 rounded" />
                <span>
                  <b className="text-ink font-semibold">
                    {h.actor ?? (META[h.platform as Platform]?.name ?? APP_NAME)}
                  </b>{" "}
                  {ACTION[h.action] ?? h.action}
                  {h.account ? ` ${h.account}` : ""}
                </span>
                <span className="text-ink-faint">· <Ago iso={h.at} /></span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup check: what THIS copy of the app sends to each platform.
// ---------------------------------------------------------------------------

const ENV_LABEL: Record<SocialSetup["env"], string> = {
  production: "Production",
  preview: "Staging / preview",
  development: "Vercel development",
  local: "Your computer",
};

const WHERE: Record<Platform, string> = {
  youtube: "Google Cloud Console → Google Auth Platform → Clients → your Web client → Authorized redirect URIs.",
  instagram: "Meta App Dashboard → Use cases → Instagram → API setup with Instagram Login → Set up Instagram business login → Business login settings → OAuth redirect URIs.",
  tiktok: "TikTok developer portal → Manage apps → your app (Sandbox or Production, whichever keys this copy uses) → Login Kit → Redirect URI.",
  facebook: "Meta App Dashboard → Facebook Login (for Business) → Settings → Valid OAuth Redirect URIs.",
};

function SetupCheck({ setup }: { setup: SocialSetup }) {
  const [copied, setCopied] = useState<string | null>(null);
  const local = setup.env === "local";
  const ok = (on: boolean, yes: string, no: string) => (
    <span className={`inline-flex items-center gap-1 font-semibold ${on ? "text-green" : "text-red"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-green" : "bg-red"}`} aria-hidden />
      {on ? yes : no}
    </span>
  );
  return (
    <details className="group rounded-xl border border-line/10">
      <summary className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Setup check</span>
        <span className="text-[11.5px] text-ink-faint truncate">
          {ENV_LABEL[setup.env]} · {setup.host}
        </span>
        <span className="flex-1" />
        <ChevronDownIcon className="w-4 h-4 text-ink-soft transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="px-3.5 pb-4 space-y-4 text-[12.5px]">
        <p className="text-ink-soft">
          What this copy of {APP_NAME} uses. Each <b className="text-ink">return address</b> must be listed exactly (same https, same spelling, no slash at the end) in that platform&rsquo;s developer app,
          and each copy (production, staging, your computer) needs its own.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>
            Encryption key (SOCIAL_TOKEN_KEY): {ok(setup.tokenKey, "set", "missing")}
          </span>
          {setup.pinnedUrl && (
            <span className="text-ink-soft">
              NEXT_PUBLIC_APP_URL = <code className="font-mono text-[11.5px]">{setup.pinnedUrl}</code>
              {setup.pinnedIgnored ? " (ignored on staging: it uses its own address)" : ""}
            </span>
          )}
        </div>
        <ul className="space-y-3">
          {setup.platforms.map((p) => (
            <li key={p.platform} className="rounded-lg bg-surface-2/50 p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <PlatformIcon platform={p.platform} className="w-5 h-5 rounded" />
                <b className="text-ink">{META[p.platform].name}</b>
                <span className="text-ink-faint">·</span>
                <span>App keys: {ok(p.keys, "set", "missing")}</span>
                <span className="text-ink-faint">·</span>
                <span>
                  Analytics permission:{" "}
                  <b className={p.stats || p.platform === "facebook" ? "text-ink" : "text-ink-faint"}>
                    {p.platform === "facebook" ? "always (with posting: pages_manage_posts)" : p.stats ? "asked for" : "not asked (not in SOCIAL_STATS_PLATFORMS)"}
                  </b>
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-ink-soft flex-shrink-0">Return address</span>
                <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1 font-mono text-[11.5px] border border-line/10">{p.redirectUri}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(p.redirectUri);
                    setCopied(p.platform);
                    setTimeout(() => setCopied((c) => (c === p.platform ? null : c)), 1500);
                  }}
                  className="flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-line/15 px-2 h-7 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30"
                >
                  {copied === p.platform ? <CheckIcon className="w-3.5 h-3.5 text-green" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  {copied === p.platform ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[11.5px] text-ink-faint">Where it&rsquo;s listed: {WHERE[p.platform]}</p>
              {p.platform === "tiktok" && local && <p className="text-[11.5px] text-amber">TikTok usually refuses localhost return addresses: test TikTok on staging.</p>}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/** Which of your Facebook Pages is posted to and feeds Analytics (when you manage more than one). */
function FacebookPagePicker({ teamId, current }: { teamId: string; current: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const [pages, setPages] = useState<{ id: string; name: string; picture: string | null; current: boolean }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  if (!pages)
    return (
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const r = await listFacebookPages(teamId);
          setLoading(false);
          if ("error" in r) toast.error(r.error);
          else if (r.pages.length <= 1) toast.success(`${current ?? "This Page"} is the only Page on this Facebook account.`);
          else setPages(r.pages);
        }}
        className="self-start text-[12px] font-semibold text-amber hover:brightness-110 disabled:opacity-60"
      >
        {loading ? "Loading Pages…" : "Use another Page"}
      </button>
    );
  return (
    <ul className="rounded-lg border border-line/15 divide-y divide-line/10 overflow-hidden">
      {pages.map((pg) => (
        <li key={pg.id}>
          <button
            type="button"
            disabled={pg.current || !!saving}
            onClick={async () => {
              setSaving(pg.id);
              const r = await chooseFacebookPage(teamId, pg.id);
              setSaving(null);
              if ("error" in r && r.error) toast.error(r.error);
              else {
                toast.success(`Now posting to ${pg.name}. Its numbers arrive in Analytics with the next sync.`);
                setPages(null);
                router.refresh();
              }
            }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-[12.5px] hover:bg-surface-2 disabled:cursor-default"
          >
            {pg.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pg.picture} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <span className="w-6 h-6 rounded-full bg-surface-2" />
            )}
            <span className="flex-1 truncate font-semibold">{pg.name}</span>
            {pg.current ? <CheckIcon className="w-4 h-4 text-green" /> : saving === pg.id ? <span className="text-ink-faint">Switching…</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
