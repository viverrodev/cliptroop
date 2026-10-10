"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CloseIcon, DownloadIcon, ExternalIcon, LockIcon, PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Mascot } from "@/components/ui/mascot";
import { addRevenueEntry, deleteRevenueEntry, setRevenueAccess, setRevenueCurrency, syncAnalyticsNow } from "@/app/(dashboard)/analytics/actions";
import { Select, type SelectOption } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-provider";
import { DateChip } from "@/components/ui/date-picker";
import { RANGES, type RangeId, type TabId, type Window } from "../lib/ranges";
import type { Audience, ContentItem, PlatformStatus, Production, Revenue } from "../lib/queries";
import { BarList, ChartCard, fmtCompact, fmtInt, Legend, LineChart, StackedColumns, StatTile } from "./charts";
import { countryName } from "./world-map";
import { AudienceMapView, MAP_MODES, sourcesOf, type MapMode, type MapView } from "./audience-map";
import { startNavProgress } from "@/components/ui/nav-progress";

// Only loaded when a day on the Views chart is clicked.
const DayVideos = dynamic(() => import("./day-videos").then((m) => m.DayVideos), { ssr: false });

type Data =
  | { tab: "production"; production: Production }
  | { tab: "audience"; audience: Audience }
  | { tab: "content"; content: { items: ContentItem[]; status: PlatformStatus[] } }
  | { tab: "revenue"; revenue: Revenue };

const PLATFORM = {
  youtube: { name: "YouTube", color: "rgb(var(--chart-yt))" },
  instagram: { name: "Instagram", color: "rgb(var(--chart-ig))" },
  tiktok: { name: "TikTok", color: "rgb(var(--chart-tt))" },
  facebook: { name: "Facebook", color: "rgb(var(--chart-fb))" },
} as const;
type P = keyof typeof PLATFORM;
const ALL_P = Object.keys(PLATFORM) as P[];

/** Platforms that are connected and have anything to show. */
const usableIn = (a: Audience) =>
  ALL_P.filter((p) => {
    const s = a.perPlatform[p];
    return a.status.some((x) => x.platform === p && x.connected) && (s.views.some((v) => v !== null) || s.engagement.some((v) => v !== null) || a.followersNow[p] !== undefined);
  });
const sumArr = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
/** Day-by-day sum of the picked platforms (null where none has a number). */
const addUp = (a: Audience, picked: P[], pick: (p: P) => (number | null)[]) => {
  const len = picked.length ? pick(picked[0]).length : 0;
  return Array.from({ length: len }, (_, i) => sumArr(picked.map((p) => pick(p)[i])));
};
const SHORT_COLOR = "rgb(var(--chart-short))";
const LONG_COLOR = "rgb(var(--chart-long))";
const TOTAL_COLOR = "rgb(var(--amber))";

const niceDay = (d: string, withYear = false) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
const fmtDays = (n: number | null) => (n === null ? "–" : n < 10 ? n.toFixed(1) : String(Math.round(n)));
const fmtPct = (n: number | null) => (n === null ? "–" : `${Math.round(n)}`);

function csvDownload(name: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function AnalyticsView({
  teamId,
  teamName,
  window: w,
  range,
  compare,
  canSync,
  catchingUp = false,
  revenueAllowed,
  data,
}: {
  teamId: string;
  teamName: string;
  window: Window;
  range: RangeId;
  compare: boolean;
  canSync: boolean;
  /** The morning copy was missed and a catch-up just started (this page refreshes itself when it's likely done). */
  catchingUp?: boolean;
  revenueAllowed: boolean;
  data: Data;
}) {
  const router = useRouter();
  const toast = useToast();
  const [updating, setUpdating] = useState(catchingUp);
  useEffect(() => {
    if (catchingUp) setUpdating(true);
  }, [catchingUp]);
  useEffect(() => {
    if (!updating) return;
    const soon = window.setTimeout(() => router.refresh(), 35_000);
    const done = window.setTimeout(() => {
      router.refresh();
      setUpdating(false);
    }, 70_000);
    return () => {
      window.clearTimeout(soon);
      window.clearTimeout(done);
    };
  }, [updating, router]);
  // Audience: which platforms to show (null = all that have numbers). Remembered on
  // this device; read after the first paint so the server and browser render the same.
  const [picked, setPickedState] = useState<P[] | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("vp-audience-platforms");
      const v = raw ? (JSON.parse(raw) as string[]).filter((x): x is P => x in PLATFORM) : null;
      if (v && v.length) setPickedState(v);
    } catch {}
  }, []);
  const setPicked = (v: P[] | null) => {
    setPickedState(v);
    try {
      if (v) window.localStorage.setItem("vp-audience-platforms", JSON.stringify(v));
      else window.localStorage.removeItem("vp-audience-platforms");
    } catch {}
  };
  const [navigating, startNav] = useTransition();
  const [syncing, startSync] = useTransition();
  const href = (p: { tab?: TabId; range?: RangeId; compare?: boolean }) => {
    const q = new URLSearchParams({ tab: p.tab ?? data.tab, range: p.range ?? range });
    if (!(p.compare ?? compare)) q.set("compare", "0");
    return `/analytics?${q}`;
  };
  const go = (p: Parameters<typeof href>[0]) => {
    startNavProgress(href(p));
    startNav(() => router.push(href(p), { scroll: false }));
  };
  const tabs: { id: TabId; label: string; locked?: boolean }[] = [
    { id: "production", label: "Production" },
    { id: "audience", label: "Audience" },
    { id: "content", label: "Content" },
    { id: "revenue", label: "Revenue", locked: !revenueAllowed },
  ];

  function exportCsv() {
    const stamp = `${w.from}_${w.to}`;
    if (data.tab === "production") {
      const p = data.production;
      csvDownload(`production_${stamp}.csv`, [
        ["Type", "Number", "Title", "Posted", "Planned", "Days to post"],
        ...p.posted.map((x) => [x.kind === "short" ? "Short" : "Long video", x.number, x.title, x.day, x.plannedDay, x.cycleDays]),
      ]);
    } else if (data.tab === "audience") {
      const a = data.audience;
      const ps = pickedIn(a, picked);
      csvDownload(`audience_${stamp}.csv`, [
        ["Date", ...ps.flatMap((p) => [`${PLATFORM[p].name} views`, `${PLATFORM[p].name} engagement`]), ...(ps.includes("youtube") ? ["YouTube watch hours"] : [])],
        ...a.days.map((d, i) => [
          d,
          ...ps.flatMap((p) => [a.perPlatform[p].views[i], a.perPlatform[p].engagement[i]]),
          ...(ps.includes("youtube") ? [a.perPlatform.youtube.watchHours[i] === null ? null : Math.round(a.perPlatform.youtube.watchHours[i]! * 10) / 10] : []),
        ]),
        [],
        ["Country", "YouTube views"],
        ...a.countries.map((c) => [countryName(c.code), c.views]),
      ]);
    } else if (data.tab === "content") {
      csvDownload(`content_${stamp}.csv`, [
        ["Platform", "Title", "Published", "Views", "Likes", "Comments", "Shares", "Link"],
        ...data.content.items.map((c) => [PLATFORM[c.platform].name, c.title, c.publishedAt?.slice(0, 10) ?? null, c.views, c.likes, c.comments, c.shares, c.url]),
      ]);
    } else if (data.revenue.allowed) {
      const r = data.revenue;
      csvDownload(`revenue_${stamp}.csv`, [
        ["Stream", `Amount (${r.currency})`],
        ...r.streams.map((x) => [x.label, x.amount.toFixed(2)]),
        ["All streams", (r.all.value ?? 0).toFixed(2)],
        [],
        ["Month", `YouTube (${r.currency})`, `Facebook (${r.currency})`, `Other income (${r.currency})`, `Total (${r.currency})`, "YouTube views"],
        ...r.months.map((m) => [m.month, m.revenue.toFixed(2), m.facebook.toFixed(2), m.other.toFixed(2), (m.revenue + m.facebook + m.other).toFixed(2), m.views]),
        [],
        ["Date", "Other income", `Amount (${r.currency})`, "Note"],
        ...r.entries.map((e) => [e.day, e.source, e.amount.toFixed(2), e.note]),
      ]);
    }
  }

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-6 mb-5 flex-wrap">
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Analytics</h1>
          <p className="text-[14.5px] text-ink-soft">
            {teamName}: how the work flows, and how the videos do. {niceDay(w.from, true)} – {niceDay(w.to, true)}.
          </p>
        </div>
        {data.tab !== "production" && (updating || canSync) && (
        <div className="flex flex-col items-start sm:items-end gap-1.5">
        {canSync && (
          <button
            type="button"
            disabled={syncing}
            onClick={() =>
              startSync(async () => {
                const r = await syncAnalyticsNow(teamId);
                if (r.error !== undefined) toast.error(r.error);
                else {
                  toast.success(r.summary);
                  setUpdating(false);
                  router.refresh();
                }
              })
            }
            className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 h-10 text-[13.5px] font-semibold hover:border-line/40 hover:bg-surface-2 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
            </svg>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
          <p className="text-[11.5px] text-ink-faint sm:text-right max-w-[260px]" role="status">
            {updating ? (
              <span className="flex items-start sm:justify-end gap-1.5 text-ink-soft">
                <span aria-hidden className="mt-[5px] w-1.5 h-1.5 shrink-0 rounded-full bg-amber animate-pulse" />
                <span>Getting the latest numbers… this page updates by itself.</span>
              </span>
            ) : (
              "Updates by itself every morning."
            )}
          </p>
        </div>
        )}
      </div>

      <nav className="flex items-center gap-1 border-b border-line/15 overflow-x-auto no-scrollbar -mx-1 px-1 mb-4" aria-label="Analytics">
        {tabs.map((t) => {
          const on = t.id === data.tab;
          return (
            <Link
              key={t.id}
              href={href({ tab: t.id })}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center gap-1.5 text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {t.label}
              {t.locked && <LockIcon className="w-3.5 h-3.5 text-ink-faint" />}
              <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
            </Link>
          );
        })}
      </nav>

      {/* One row of filters: they scope everything below. */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-lg border border-line/15 p-0.5 bg-surface">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={range === r.id}
              onClick={() => go({ range: r.id })}
              className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors ${range === r.id ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={compare}
          onClick={() => go({ compare: !compare })}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-[12.5px] font-semibold transition-colors ${compare ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
        >
          <span className={`w-7 h-4 rounded-full relative transition-colors ${compare ? "bg-amber" : "bg-line/20"}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${compare ? "left-3.5" : "left-0.5"}`} />
          </span>
          Compare with the {RANGES.find((r) => r.id === range)!.label} before
        </button>
        <span className="flex-1" />
        {!(data.tab === "revenue" && !data.revenue.allowed) && (
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
            <DownloadIcon className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      <div className={`transition-opacity duration-200 ${navigating ? "opacity-50" : ""}`}>
        {data.tab === "production" && <ProductionTab p={data.production} compare={compare} w={w} />}
        {data.tab === "audience" && <AudienceTab teamId={teamId} a={data.audience} compare={compare} picked={pickedIn(data.audience, picked)} setPicked={setPicked} />}
        {data.tab === "content" && <ContentTab items={data.content.items} status={data.content.status} />}
        {data.tab === "revenue" && <RevenueTab r={data.revenue} compare={compare} teamId={teamId} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

function ProductionTab({ p, compare, w }: { p: Production; compare: boolean; w: Window }) {
  const k = p.kpis;
  const nothing = !p.posted.length && !p.people.some((x) => x.done);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatTile label="Shorts posted" value={k.shortsPosted.value} prev={k.shortsPosted.prev} compare={compare} format={fmtInt} />
        <StatTile label="Long videos published" value={k.longsPublished.value} prev={k.longsPublished.prev} compare={compare} format={fmtInt} />
        <StatTile label="Shorts posted on time" value={k.onTime.value} prev={k.onTime.prev} compare={compare} format={fmtPct} unit="%" deltaMode="points" />
        <StatTile label="Days to post" value={k.cycleDays.value} prev={k.cycleDays.prev} compare={compare} format={fmtDays} good="down" hint="from idea · shorts, median" />
        <StatTile className="col-span-2 lg:col-span-1" label="Overdue right now" value={k.overdueNow} compare={false} format={fmtInt} good="down" hint={k.overdueNow ? "shorts past their date" : "nothing late"} />
      </div>

      {nothing ? (
        <div className="rounded-2xl border-2 border-dashed border-line/15 py-12 px-6 text-center flex flex-col items-center">
          <Mascot mood="idle" size={96} />
          <p className="text-[15px] font-semibold mt-3">Nothing posted in these {w.days} days</p>
          <p className="text-[13px] text-ink-soft mt-1">Pick a longer range, or come back once a few videos are out.</p>
        </div>
      ) : (
        <>
          <ChartCard
            title="Videos out"
            sub={w.days <= 31 ? "Per day" : w.days <= 120 ? "Per week" : "Per month"}
            right={<Legend shape="rect" items={[{ key: "s", label: "Shorts", color: SHORT_COLOR }, { key: "l", label: "Long videos", color: LONG_COLOR }]} />}
          >
            <StackedColumns
              ariaLabel="Videos posted per period"
              labels={p.buckets.map((b) => b.label)}
              series={[
                { key: "shorts", label: "Shorts", color: SHORT_COLOR, values: p.output.map((o) => o.shorts) },
                { key: "longs", label: "Long videos", color: LONG_COLOR, values: p.output.map((o) => o.longs) },
              ]}
            />
          </ChartCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Where work waits" sub="Average days a video spends in each step (steps finished in this range)">
              <div className="space-y-5">
                {(["short", "long"] as const).map((kind) => {
                  const list = p.stages.filter((s) => s.kind === kind && s.count > 0);
                  const slowest = list.reduce<(typeof list)[number] | null>((m, s) => (!m || (s.days ?? 0) > (m.days ?? 0) ? s : m), null);
                  return (
                    <div key={kind}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: kind === "short" ? SHORT_COLOR : LONG_COLOR }} />
                        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-soft">{kind === "short" ? "Shorts" : "Long videos"}</span>
                        {slowest && list.length > 1 && <span className="text-[12px] text-ink-faint">· slowest: {slowest.label}</span>}
                      </div>
                      <BarList
                        items={list.map((s) => ({ key: s.stage, label: s.label, value: s.days, sub: undefined }))}
                        format={(n) => (n === null ? "–" : `${fmtDays(n)} d`)}
                        color={kind === "short" ? SHORT_COLOR : LONG_COLOR}
                        empty="No steps finished in this range."
                      />
                    </div>
                  );
                })}
              </div>
            </ChartCard>

            <ChartCard title="People" sub="Steps finished in this range · on time = by their due date">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-ink-faint text-left">
                      <th className="font-bold px-1 pb-2">Person</th>
                      <th className="font-bold px-1 pb-2 text-right">Done</th>
                      <th className="font-bold px-1 pb-2 text-right">On time</th>
                      <th className="font-bold px-1 pb-2 text-right">On their plate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.people.map((x) => (
                      <tr key={x.userId} className="border-t border-line/10">
                        <td className="px-1 py-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <PersonAvatar name={x.name} avatarUrl={x.avatarUrl} color={x.color} className="w-6 h-6 text-[9px]" />
                            <span className="truncate font-semibold">{x.name}</span>
                          </span>
                        </td>
                        <td className="px-1 py-2 text-right tabular-nums font-semibold">{x.done}</td>
                        <td className="px-1 py-2 text-right tabular-nums text-ink-soft">{x.onTime === null ? "–" : `${x.onTime}%`}</td>
                        <td className="px-1 py-2 text-right tabular-nums text-ink-soft">{x.active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <ChartCard title="Posted in this range" sub="Newest first">
              <ul className="divide-y divide-line/10 -my-1">
                {p.posted.slice(0, 15).map((x) => {
                  const late = x.plannedDay && x.day > x.plannedDay;
                  return (
                    <li key={`${x.kind}${x.id}`} className="flex items-center gap-3 py-2">
                      <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: x.kind === "short" ? SHORT_COLOR : LONG_COLOR }} aria-label={x.kind === "short" ? "Short" : "Long video"} />
                      <Link href={x.kind === "short" ? `/shorts/${x.id}` : `/videos/${x.id}`} className="flex-1 min-w-0 truncate text-[13.5px] hover:underline">
                        <span className="font-mono text-ink-faint mr-1.5 text-[12px]">#{x.number}</span>
                        {x.title}
                      </Link>
                      {x.plannedDay && <span className={`text-[11.5px] font-semibold ${late ? "text-red" : "text-green"}`}>{late ? "late" : "on time"}</span>}
                      <span className="text-[12px] text-ink-faint tabular-nums w-14 text-right">{niceDay(x.day)}</span>
                    </li>
                  );
                })}
              </ul>
              {p.posted.length > 15 && <p className="text-[12px] text-ink-faint mt-2">and {p.posted.length - 15} more (in the CSV).</p>}
            </ChartCard>
            <ChartCard title="Automatic posting" sub="Scheduled posts in this range">
              {p.posting.length ? (
                <ul className="space-y-3">
                  {p.posting.map((x) => {
                    const total = x.published + x.failed;
                    return (
                      <li key={x.platform} className="flex items-center gap-3">
                        <PlatformIcon platform={x.platform as P} className="w-7 h-7 rounded-lg" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13.5px] font-semibold">{PLATFORM[x.platform as keyof typeof PLATFORM]?.name ?? x.platform}</span>
                          <span className="block text-[12px] text-ink-soft">
                            {x.published} posted
                            {x.failed > 0 && <span className="text-red font-semibold"> · {x.failed} failed</span>}
                          </span>
                        </span>
                        <span className={`text-[13px] font-bold tabular-nums ${x.failed ? "text-ink" : "text-green"}`}>{total ? Math.round((x.published / total) * 100) : 0}%</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-faint">No automatic posts in this range.</p>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

function statusText(s: PlatformStatus) {
  return !s.connected
    ? "not connected"
    : !s.statsReady
      ? "reconnect to allow stats"
      : s.lastError
        ? "last sync failed"
        : s.lastOkAt
          ? `synced ${new Date(s.lastOkAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : "waiting for the first sync";
}

function StatusRow({ status }: { status: PlatformStatus[] }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      {status.map((s) => (
        <span
          key={s.platform}
          title={s.lastError ?? undefined}
          className={`inline-flex items-center gap-2 rounded-full border pl-1 pr-3 h-8 text-[12px] font-semibold ${s.lastError && s.connected ? "border-red/30 bg-red/5" : "border-line/15 bg-surface"}`}
        >
          <PlatformIcon platform={s.platform} className={`w-6 h-6 rounded-full ${s.connected ? "" : "opacity-40 grayscale"}`} />
          <span className="text-ink">{PLATFORM[s.platform].name}</span>
          <span className="text-ink-faint font-medium">{statusText(s)}</span>
        </span>
      ))}
    </div>
  );
}

/** The platforms the Audience tab adds up (all with numbers, unless you pick some). */
function pickedIn(a: Audience, picked: P[] | null): P[] {
  const usable = usableIn(a);
  const chosen = picked ? usable.filter((p) => picked.includes(p)) : usable;
  return chosen.length ? chosen : usable;
}

/** One chip per platform: its sync status, and a switch to include it in the numbers. */
function PlatformFilter({ a, picked, setPicked }: { a: Audience; picked: P[]; setPicked: (v: P[] | null) => void }) {
  const usable = usableIn(a);
  const all = picked.length === usable.length;
  return (
    <div className="flex items-center gap-2 flex-wrap mb-5" role="group" aria-label="Platforms to include">
      {usable.length > 1 && (
        <button
          type="button"
          onClick={() => setPicked(null)}
          aria-pressed={all}
          className={`inline-flex items-center rounded-full px-3 h-8 text-[12px] font-semibold border transition-colors ${all ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
        >
          All together
        </button>
      )}
      {a.status.map((s) => {
        const p = s.platform as P;
        const can = usable.includes(p);
        const on = can && picked.includes(p);
        return (
          <button
            key={p}
            type="button"
            disabled={!can}
            aria-pressed={on}
            title={s.lastError ?? (can ? (on ? `Leave ${PLATFORM[p].name} out` : `Add ${PLATFORM[p].name}`) : undefined)}
            onClick={() => {
              // Click one while all are on: just that one. Otherwise add / remove it (never none).
              if (all && usable.length > 1) return setPicked([p]);
              const next = on ? picked.filter((x) => x !== p) : [...picked, p];
              setPicked(next.length === 0 || next.length === usable.length ? null : next);
            }}
            className={`inline-flex items-center gap-2 rounded-full border pl-1 pr-3 h-8 text-[12px] font-semibold transition-colors disabled:cursor-default ${
              on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)]" : can ? "border-line/15 bg-surface/50 opacity-70 hover:opacity-100" : "border-line/10 bg-transparent"
            } ${s.lastError && s.connected ? "!border-red/40" : ""}`}
          >
            <PlatformIcon platform={p} className={`w-6 h-6 rounded-full ${can ? "" : "opacity-40 grayscale"}`} />
            <span className={can ? "text-ink" : "text-ink-faint"}>{PLATFORM[p].name}</span>
            {on && usable.length > 1 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM[p].color }} aria-hidden />}
            <span className="text-ink-faint font-medium">{statusText(s)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * After a platform's account was replaced (another channel, account or
 * Page): whose numbers these are. The old account's were removed then, so
 * nothing here ever mixes the two.
 */
function AccountNote({ status, className = "" }: { status: PlatformStatus[]; className?: string }) {
  const recent = status.filter((s) => s.connected && s.since && Date.parse(s.since) > Date.now() - 180 * 86_400_000);
  if (!recent.length) return null;
  return (
    <div className={`flex flex-col gap-1 text-[12px] text-ink-faint ${className}`}>
      {recent.map((s) => (
        <p key={s.platform} className="flex items-start gap-1.5">
          <PlatformIcon platform={s.platform} className="w-4 h-4 rounded mt-px flex-shrink-0" />
          <span>
            {PLATFORM[s.platform].name} shows {s.account ? <b className="font-semibold text-ink-soft">{s.account}</b> : "the connected account"} only, connected on {niceDay(s.since!.slice(0, 10))}. The
            previous account&rsquo;s numbers and posts were removed.
          </span>
        </p>
      ))}
    </div>
  );
}

function SetupCard({ status }: { status: PlatformStatus[] }) {
  const connected = status.some((s) => s.connected);
  return (
    <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
      <Mascot mood="idle" size={110} className="flex-shrink-0" />
      <div className="min-w-0">
        <h2 className="font-display text-[22px] font-semibold">No platform numbers yet</h2>
        <ol className="mt-3 space-y-2 text-[14px] text-ink-soft list-decimal pl-5">
          <li className={connected ? "line-through text-ink-faint" : ""}>
            Connect YouTube, Instagram, TikTok or a Facebook Page in{" "}
            <Link href="/team?tab=accounts" className="font-semibold text-amber hover:underline">
              Team → Connected accounts
            </Link>
            .
          </li>
          <li>If it says &ldquo;reconnect to allow stats&rdquo;, reconnect it once: the sign-in now also asks to read stats (and YouTube revenue).</li>
          <li>The numbers are copied every morning. A master or scheduler can press &ldquo;Sync now&rdquo; for the first copy (it brings the last 90 days).</li>
        </ol>
        <p className="mt-3 text-[12.5px] text-ink-faint">The Production tab works right away: it uses your own shorts and long videos.</p>
      </div>
    </div>
  );
}

function AudienceTab({ teamId, a, compare, picked, setPicked }: { teamId: string; a: Audience; compare: boolean; picked: P[]; setPicked: (v: P[] | null) => void }) {
  const ready = a.status.some((s) => s.connected && s.statsReady);
  const dayLabels = a.days.map((d) => niceDay(d));
  const [mode, setMode] = useState<"platform" | "total">("platform");
  // A day clicked on the Views chart: its videos.
  const [dayAt, setDayAt] = useState<number | null>(null);
  const closeDay = useCallback(() => setDayAt(null), []);
  if (!ready || !a.hasData)
    return (
      <>
        <StatusRow status={a.status} />
        <SetupCard status={a.status} />
      </>
    );
  const pp = a.perPlatform;
  const withViews = picked.filter((p) => pp[p].views.some((v) => v !== null));
  // One platform: its line IS the total, so compare right away.
  const together = mode === "total" || withViews.length <= 1;
  const views = addUp(a, picked, (p) => pp[p].views);
  const prevViews = addUp(a, picked, (p) => pp[p].prevViews);
  const kpi = (now: (number | null)[], prev: (number | null)[]) => ({ value: sumArr(now), prev: sumArr(prev) });
  const kViews = kpi(views, prevViews);
  const kEngage = kpi(addUp(a, picked, (p) => pp[p].engagement), addUp(a, picked, (p) => pp[p].prevEngagement));
  const hasYT = picked.includes("youtube");
  const kWatch = hasYT ? kpi(pp.youtube.watchHours, pp.youtube.prevWatchHours) : { value: null, prev: null };
  const kFollow = { value: sumArr(picked.map((p) => pp[p].followersNet)), prev: sumArr(picked.map((p) => pp[p].prevFollowersNet)) };
  const names = picked.length === usableIn(a).length ? "All platforms" : picked.map((p) => PLATFORM[p].name).join(" + ");
  const single = picked.length === 1 ? PLATFORM[picked[0]] : null;
  const split = a.youtubeSplit;
  const splitTotal = split ? split.shorts + split.long : 0;
  const ttWaiting = picked.includes("tiktok") && a.tiktok && !pp.tiktok.views.some((v) => v !== null);
  return (
    <div className="space-y-5">
      <PlatformFilter a={a} picked={picked} setPicked={setPicked} />
      <AccountNote status={a.status} className="-mt-3" />
      {ttWaiting && (
        <p className="rounded-xl border border-line/15 bg-surface px-4 py-3 text-[13px] text-ink-soft flex items-start gap-3">
          <PlatformIcon platform="tiktok" className="w-5 h-5 rounded mt-0.5 flex-shrink-0" />
          <span>
            TikTok only shares running totals, so its views per day start the day after the first copy. So far:{" "}
            <b className="text-ink">{fmtCompact(a.tiktok!.totalViews)}</b> views and <b className="text-ink">{fmtCompact(a.tiktok!.totalLikes)}</b> likes in total
            {a.followersNow.tiktok !== undefined ? (
              <>
                , <b className="text-ink">{fmtCompact(a.followersNow.tiktok)}</b> followers
              </>
            ) : null}
            .
          </span>
        </p>
      )}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label={picked.length === 1 ? `Views on ${single!.name}` : "Views"} value={kViews.value} prev={kViews.prev} compare={compare} />
        <StatTile label="Watch time (YouTube)" value={kWatch.value} prev={kWatch.prev} compare={compare && hasYT} unit=" h" hint={hasYT ? undefined : "YouTube isn't picked"} />
        <StatTile label="Likes, comments & shares" value={kEngage.value} prev={kEngage.prev} compare={compare} />
        <StatTile label="New followers (net)" value={kFollow.value} prev={kFollow.prev} compare={compare} good="up" />
      </div>

      <ChartCard
        title="Views per day"
        sub={
          (together
            ? `${names}${compare ? ` · dashed: the ${a.days.length} days before` : ""}`
            : `By platform${compare ? " · switch to Together to compare with before" : ""}`) + " · click a day for its videos"
        }
        right={
          <div className="flex items-center gap-4 flex-wrap justify-end">
            {!together && <Legend items={withViews.map((p) => ({ key: p, label: PLATFORM[p].name, color: PLATFORM[p].color }))} />}
            {together && compare && (
              <Legend
                items={[
                  { key: "now", label: "This range", color: single ? single.color : TOTAL_COLOR },
                  { key: "prev", label: "Before", color: "rgb(var(--ink-faint))", dashed: true },
                ]}
              />
            )}
            {withViews.length > 1 && (
              <div role="radiogroup" aria-label="Lines" className="inline-flex rounded-lg border border-line/15 p-0.5">
                {(["platform", "total"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${mode === m ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
                  >
                    {m === "platform" ? "By platform" : "Together"}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      >
        {!views.some((v) => v !== null) ? (
          <p className="py-16 text-center text-[13px] text-ink-faint">No views per day yet for {names === "All platforms" ? "these platforms" : names}.</p>
        ) : (
        <LineChart
          ariaLabel={together ? `Views per day, ${names}` : "Views per day by platform"}
          labels={dayLabels}
          series={
            together
              ? [{ key: "total", label: "Views", color: withViews.length === 1 ? PLATFORM[withViews[0]].color : TOTAL_COLOR, values: views }]
              : withViews.map((p) => ({ key: p, label: PLATFORM[p].name, color: PLATFORM[p].color, values: pp[p].views }))
          }
          previous={together && compare ? { label: "Before", values: prevViews } : null}
          onPick={setDayAt}
        />
        )}
      </ChartCard>
      {dayAt !== null && <DayVideos teamId={teamId} days={a.days} index={dayAt} platforms={picked} onClose={closeDay} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Views by platform" sub="This range">
          <BarList
            items={a.byPlatform
              .filter((x) => picked.includes(x.platform as P) && (x.views || x.prev))
              .map((x) => ({
                key: x.platform,
                label: (
                  <span className="inline-flex items-center gap-2">
                    <PlatformIcon platform={x.platform} className="w-5 h-5 rounded" />
                    {PLATFORM[x.platform as P].name}
                  </span>
                ),
                value: x.views,
                color: PLATFORM[x.platform as P].color,
                sub: compare && x.prev ? `before: ${fmtCompact(x.prev)}` : undefined,
              }))}
            format={fmtCompact}
            empty="No views per day yet for these platforms."
          />
          <div className="mt-4 pt-4 border-t border-line/10 flex flex-wrap gap-x-6 gap-y-2">
            {picked
              .filter((p) => a.followersNow[p] !== undefined)
              .map((p) => (
                <span key={p} className="text-[12.5px] text-ink-soft">
                  {PLATFORM[p].name}: <b className="text-ink tabular-nums">{fmtCompact(a.followersNow[p]!)}</b> {p === "youtube" ? "subscribers" : "followers"}
                </span>
              ))}
          </div>
        </ChartCard>
        <ChartCard title="Shorts vs long videos" sub="YouTube views in this range">
          {!hasYT ? (
            <p className="text-[13px] text-ink-faint">Pick YouTube above to see how its views split between shorts and long videos.</p>
          ) : split && splitTotal > 0 ? (
            <div>
              <div className="flex h-6 rounded-lg overflow-hidden gap-[2px]" role="img" aria-label={`Shorts ${fmtCompact(split.shorts)}, long videos ${fmtCompact(split.long)}`}>
                <span style={{ width: `${(split.shorts / splitTotal) * 100}%`, background: SHORT_COLOR }} />
                <span style={{ width: `${(split.long / splitTotal) * 100}%`, background: LONG_COLOR }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  ["Shorts", split.shorts, SHORT_COLOR],
                  ["Long videos", split.long, LONG_COLOR],
                ].map(([label, v, c]) => (
                  <div key={label as string} className="flex items-start gap-2">
                    <span className="mt-1.5 w-2.5 h-2.5 rounded-[3px]" style={{ background: c as string }} />
                    <span>
                      <span className="block text-[12.5px] text-ink-soft">{label as string}</span>
                      <span className="block text-[20px] font-display font-semibold">{fmtCompact(v as number)}</span>
                      <span className="block text-[12px] text-ink-faint">{Math.round(((v as number) / splitTotal) * 100)}% of views</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">YouTube hasn&rsquo;t split these days yet.</p>
          )}
        </ChartCard>
      </div>

      <CountryMap a={a} />
    </div>
  );
}

/**
 * Where the audience is: one platform's countries or all together, on the
 * flat map or the 3D globe (both choices remembered on this device).
 */
function CountryMap({ a }: { a: Audience }) {
  const [mode, setMode] = useState<MapMode>("all");
  const [view, setView] = useState<MapView>("map");
  useEffect(() => {
    try {
      const v = localStorage.getItem("vp-map-view");
      if (v === "map" || v === "globe") setView(v);
      const m = localStorage.getItem("vp-map-mode");
      if (MAP_MODES.some((x) => x.id === m)) setMode(m as MapMode);
    } catch {}
  }, []);
  const remember = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
  const sources = sourcesOf(a);
  const hasData = (id: MapMode) => (id === "all" ? sources.filter((s) => s.id !== "watch" && s.rows.length).length > 0 : (sources.find((s) => s.id === id)?.rows.length ?? 0) > 0);
  const ytReady = a.status.some((s) => s.platform === "youtube" && s.connected && s.statsReady);
  const sub =
    mode === "all"
      ? "Each country's share of your audience, averaged over every platform that shares countries"
      : mode === "views" || mode === "watch"
        ? `${mode === "watch" ? "Hours watched" : "YouTube views"} by country in this range${a.countriesSince ? ` (since ${niceDay(a.countriesSince)}, when copying started)` : ""}`
        : `${MAP_MODES.find((m) => m.id === mode)!.label} by country (latest copy)`;
  return (
    <ChartCard
      title="Where your audience is"
      sub={sub}
      right={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-[13.5rem] max-w-full">
            <Select
              value={mode}
              onChange={(v) => {
                if (!v) return;
                setMode(v as MapMode);
                remember("vp-map-mode", v);
              }}
              ariaLabel="Map shows"
              className="!h-8 !text-[12.5px]"
              menuMinWidth={240}
              options={MAP_MODES.map((m) => ({
                value: m.id,
                label: m.label,
                hint: hasData(m.id) ? undefined : m.id === "tiktok" ? "Not shared by TikTok" : "No countries yet",
                icon: <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: m.id === "all" ? "rgb(var(--amber))" : sources.find((x) => x.id === m.id)?.color }} aria-hidden />,
              }))}
            />
          </div>
          <div role="radiogroup" aria-label="Show as" className="inline-flex rounded-lg border border-line/15 p-0.5">
            {(["map", "globe"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => {
                  setView(v);
                  remember("vp-map-view", v);
                }}
                className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${view === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {v === "map" ? "Map" : "Globe"}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] items-center">
        <AudienceMapView
          a={a}
          mode={mode}
          view={view}
          youtubeReady={ytReady}
          globeSize={440}
          list={(rows, _format, hover) => (
            <div>
              {rows.length ? (
                <>
                  <BarList
                    items={rows.slice(0, 10).map((c) => ({ key: c.code, label: countryName(c.code), value: c.value, color: mode === "all" ? undefined : sources.find((x) => x.id === mode)?.color }))}
                    format={(n) => (n === null ? "–" : mode === "all" ? `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%` : mode === "watch" ? `${fmtCompact(n)} h` : fmtCompact(n))}
                    onHover={view === "globe" ? hover.set : undefined}
                    active={hover.code}
                  />
                  {rows.length > 10 && <p className="text-[12px] text-ink-faint mt-2">and {rows.length - 10} more countries{mode === "views" ? " (in the CSV)" : ""}.</p>}
                  {view === "globe" && <p className="text-[11.5px] text-ink-faint mt-2">Point at a country to turn the globe to it.</p>}
                </>
              ) : (
                <p className="text-[13px] text-ink-faint">No countries yet.</p>
              )}
            </div>
          )}
        />
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * One row of platform chips, like the Audience tab's: All, then every
 * platform (with its count and how its copy is doing). Pick one to see only
 * its videos; pick it again, or All, for everything.
 */
function ContentFilter({ items, status, platform, setPlatform }: { items: ContentItem[]; status: PlatformStatus[]; platform: "all" | P; setPlatform: (p: "all" | P) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Platform">
      <button
        type="button"
        onClick={() => setPlatform("all")}
        aria-pressed={platform === "all"}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12px] font-semibold border transition-colors ${
          platform === "all" ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"
        }`}
      >
        All
        <span className={`font-medium tabular-nums ${platform === "all" ? "text-paper/60" : "text-ink-faint"}`}>{items.length}</span>
      </button>
      {ALL_P.map((p) => {
        const s = status.find((x) => x.platform === p);
        const n = items.filter((i) => i.platform === p).length;
        const on = platform === p;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            title={s?.lastError ?? undefined}
            onClick={() => setPlatform(on ? "all" : p)}
            className={`inline-flex items-center gap-2 rounded-full border pl-1 pr-3 h-8 text-[12px] font-semibold transition-colors ${
              on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)]" : "border-line/15 bg-surface/50 hover:bg-surface"
            } ${s?.lastError && s.connected ? "!border-red/40" : ""}`}
          >
            <PlatformIcon platform={p} className={`w-6 h-6 rounded-full ${s?.connected || n ? "" : "opacity-40 grayscale"}`} />
            <span className="text-ink">{PLATFORM[p].name}</span>
            <span className="text-ink-faint font-medium tabular-nums">{n}</span>
            {s && <span className="hidden sm:inline text-ink-faint font-medium">· {statusText(s)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ContentTab({ items, status }: { items: ContentItem[]; status: PlatformStatus[] }) {
  const [platform, setPlatform] = useState<"all" | P>("all");
  const list = useMemo(() => items.filter((i) => platform === "all" || i.platform === platform), [items, platform]);
  if (!status.some((s) => s.connected) && !items.length)
    return (
      <>
        <StatusRow status={status} />
        <SetupCard status={status} />
      </>
    );
  const picked = platform === "all" ? null : status.find((s) => s.platform === platform) ?? null;
  return (
    <div className="space-y-4">
      <ContentFilter items={items} status={status} platform={platform} setPlatform={setPlatform} />
      <AccountNote status={platform === "all" ? status : status.filter((s) => s.platform === platform)} />
      {list.length ? (
        <div className="rounded-2xl border border-line/10 bg-surface overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint text-left">
                <th className="px-3 py-2 font-bold">Video</th>
                <th className="px-3 py-2 font-bold">Published</th>
                <th className="px-3 py-2 font-bold text-right">Views</th>
                <th className="px-3 py-2 font-bold text-right">Likes</th>
                <th className="px-3 py-2 font-bold text-right">Comments</th>
                <th className="px-3 py-2 font-bold text-right">Shares</th>
                <th className="px-3 py-2 font-bold">Ours</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={`${c.platform}${c.id}`} className="border-t border-line/10 hover:bg-surface-2/40">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="relative w-16 h-9 rounded-md overflow-hidden bg-surface-2 flex-shrink-0">
                        {c.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                        )}
                        <PlatformIcon platform={c.platform} className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded" />
                      </span>
                      <span className="min-w-0">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold hover:underline">
                            <span className="truncate max-w-[22rem]">{c.title || "Untitled"}</span>
                            <ExternalIcon className="w-3 h-3 text-ink-faint flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="font-semibold truncate block max-w-[22rem]">{c.title || "Untitled"}</span>
                        )}
                        <span className="text-[11.5px] text-ink-faint">
                          {c.kind === "short" ? "Short" : c.kind === "long" ? "Long video" : "Post"}
                          {c.noNumbers ? ` · no numbers from ${PLATFORM[c.platform].name} yet` : ""}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{c.publishedAt ? niceDay(c.publishedAt.slice(0, 10)) : "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtInt(c.views)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.likes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.comments)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.shares)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.ours ? (
                      <Link href={c.ours.kind === "short" ? `/shorts/${c.ours.id}` : `/videos/${c.ours.id}`} className="font-mono text-[12px] font-semibold text-amber hover:underline">
                        #{c.ours.number ?? "?"}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line/20 py-10 px-6 text-center text-[13.5px] text-ink-soft">
          {picked && !picked.connected
            ? `${PLATFORM[picked.platform].name} isn't connected, and nothing was posted there in this range.`
            : picked && !picked.statsReady
              ? `Nothing posted to ${PLATFORM[picked.platform].name} in this range. Its numbers need one more permission: reconnect it in Team → Connected accounts.`
              : `Nothing published${picked ? ` on ${PLATFORM[picked.platform].name}` : ""} in this range.`}
        </p>
      )}
      <p className="text-[12px] text-ink-faint">
        Numbers are each video&rsquo;s totals as of the last sync. YouTube: the latest 50 uploads · Instagram: the latest 25 posts · TikTok: public videos · Facebook: the latest 25 Page posts and Reels. Shorts the team posted show here too, with &ldquo;–&rdquo; until the platform shares their numbers. Only the accounts connected now are listed: posts on a disconnected or earlier account never are.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

const YT_COLOR = "rgb(var(--chart-yt))";
const FB_COLOR = "rgb(var(--chart-fb))";
const OTHER_COLOR = "rgb(var(--chart-tt))";
const STREAM_COLOR = { youtube: YT_COLOR, facebook: FB_COLOR, other: OTHER_COLOR } as const;

function RevenueTab({ r, compare, teamId }: { r: Revenue; compare: boolean; teamId: string }) {
  const [adding, setAdding] = useState(false);
  if (!r.allowed)
    return (
      <div className="rounded-2xl border border-line/10 bg-surface p-8 text-center flex flex-col items-center">
        <span className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-ink-soft">
          <LockIcon className="w-6 h-6" />
        </span>
        <p className="text-[15px] font-semibold mt-3">Revenue is private</p>
        <p className="text-[13px] text-ink-soft mt-1 max-w-sm">Only masters, and the people a master chooses, can see the channel&rsquo;s revenue.</p>
      </div>
    );
  // Big numbers and round axis ticks without cents; everything else with them (as many as the currency uses).
  const money = (n: number | null) => {
    if (n === null) return "–";
    if (Math.abs(n) >= 1000 || Number.isInteger(n)) return new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency, maximumFractionDigits: 0 }).format(n);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency }).format(n);
  };
  const cents = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency }).format(n);
  const streamTotal = r.streams.reduce((t, x) => t + x.amount, 0);
  const splitTotal = r.split ? r.split.shorts + r.split.long : 0;
  const hasOther = r.perBucket.some((b) => b.other > 0);
  const hasFb = r.hasFacebook;
  const fbMonths = r.months.some((m) => m.facebook);
  return (
    <div className="space-y-5">
      <CurrencyBar r={r} />
      {r.note && <p className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-[13px] text-ink">{r.note}</p>}
      {r.fxNote && <p className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-[13px] text-ink">{r.fxNote}</p>}
      <div className={`grid gap-3 grid-cols-2 ${hasFb ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <StatTile className={`ring-1 ring-amber/30 ${hasFb ? "col-span-2 lg:col-span-1" : ""}`} label="All streams together" value={r.all.value} prev={r.all.prev} compare={compare} format={money} />
        <StatTile label="YouTube (estimated)" value={r.total.value} prev={r.total.prev} compare={compare} format={money} hint={r.bestDay ? `best day ${niceDay(r.bestDay.day)}: ${cents(r.bestDay.revenue)}` : undefined} />
        {hasFb && <StatTile label="Facebook" value={r.facebook.value} prev={r.facebook.prev} compare={compare} format={money} hint="Content Monetization" />}
        <StatTile label="Other income" value={r.other.value} prev={r.other.prev} compare={compare} format={money} hint={r.other.value === null ? "sponsorships, deals, other platforms" : undefined} />
        <StatTile label="Per 1,000 views" value={r.rpm.value} prev={r.rpm.prev} compare={compare} format={(n) => (n === null ? "–" : cents(n))} hint="YouTube revenue ÷ views" />
      </div>
      {r.facebookNote && <p className="-mt-2 text-[12.5px] text-ink-soft">{r.facebookNote}</p>}

      {r.hasData ? (
        <ChartCard
          title="Revenue"
          sub={`${!r.buckets.length || r.buckets[0].from === r.buckets[0].to ? "Per day" : r.buckets[0].key.length === 7 ? "Per month" : "Per week"} · ${r.currency}`}
          right={
            hasOther || hasFb ? (
              <Legend
                shape="rect"
                items={[
                  { key: "yt", label: "YouTube", color: YT_COLOR },
                  ...(hasFb ? [{ key: "fb", label: "Facebook", color: FB_COLOR }] : []),
                  ...(hasOther ? [{ key: "other", label: "Other income", color: OTHER_COLOR }] : []),
                ]}
              />
            ) : undefined
          }
        >
          <StackedColumns
            ariaLabel="Revenue per period"
            labels={r.buckets.map((b) => b.label)}
            series={[
              { key: "rev", label: "YouTube", color: YT_COLOR, values: r.perBucket.map((b) => b.revenue) },
              ...(hasFb ? [{ key: "fb", label: "Facebook", color: FB_COLOR, values: r.perBucket.map((b) => b.facebook) }] : []),
              ...(hasOther ? [{ key: "other", label: "Other income", color: OTHER_COLOR, values: r.perBucket.map((b) => b.other) }] : []),
            ]}
            format={money}
          />
        </ChartCard>
      ) : (
        <p className="rounded-2xl border border-dashed border-line/20 py-10 px-6 text-center text-[13.5px] text-ink-soft">
          No revenue yet. YouTube&rsquo;s and Facebook&rsquo;s come with a sync (a monetized channel, or a Page in Facebook&rsquo;s Content Monetization); other income you add below.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Where it comes from" sub="Every stream in this range, biggest first">
          {r.streams.length ? (
            <ul className="space-y-2.5">
              {r.streams.map((x) => (
                <li key={x.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
                  <span className="flex items-center gap-2 min-w-0 text-[13px]">
                    <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: STREAM_COLOR[x.kind] }} aria-hidden />
                    <span className="truncate">{x.label}</span>
                  </span>
                  <span className="text-[13px] tabular-nums">
                    <b>{cents(x.amount)}</b>
                    <span className="text-ink-faint ml-2 inline-block w-10 text-right">{streamTotal ? `${Math.round((x.amount / streamTotal) * 100)}%` : ""}</span>
                  </span>
                  <span className="col-span-2 mt-1 h-1.5 rounded-full bg-line/[0.07] overflow-hidden" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${streamTotal ? Math.max(2, (x.amount / streamTotal) * 100) : 0}%`, background: STREAM_COLOR[x.kind] }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-faint">Nothing in this range.</p>
          )}
          {r.split && splitTotal > 0 && (
            <div className="mt-5 pt-4 border-t border-line/10">
              <div className="text-[12px] font-semibold text-ink-soft mb-2">YouTube revenue: Shorts vs long videos</div>
              <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={`Shorts ${cents(r.split.shorts)}, long videos ${cents(r.split.long)}`}>
                <span style={{ width: `${(r.split.shorts / splitTotal) * 100}%`, background: SHORT_COLOR }} />
                <span style={{ width: `${(r.split.long / splitTotal) * 100}%`, background: LONG_COLOR }} />
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-ink-soft">
                <span>
                  <span className="inline-block w-2 h-2 rounded-[2px] mr-1.5" style={{ background: SHORT_COLOR }} />
                  Shorts <b className="text-ink">{cents(r.split.shorts)}</b> · {Math.round((r.split.shorts / splitTotal) * 100)}%
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-[2px] mr-1.5" style={{ background: LONG_COLOR }} />
                  Long <b className="text-ink">{cents(r.split.long)}</b> · {Math.round((r.split.long / splitTotal) * 100)}%
                </span>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Other income"
          sub="Sponsorships, brand deals, affiliate links, other platforms: anything the synced numbers don't show"
          right={
            r.isMaster && !adding ? (
              <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] hover:brightness-110">
                <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.4} />
                Add income
              </button>
            ) : undefined
          }
        >
          {adding && <IncomeForm teamId={teamId} currency={r.currency} onDone={() => setAdding(false)} />}
          {r.entries.length ? (
            <ul className="divide-y divide-line/10 -my-1">
              {r.entries.map((e) => (
                <IncomeRow key={e.id} e={e} teamId={teamId} canEdit={r.isMaster} money={cents} />
              ))}
            </ul>
          ) : (
            !adding && <p className="text-[13px] text-ink-faint">{r.isMaster ? "Nothing added in this range." : "Nothing in this range."}</p>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="By month" sub="The last 12 months">
          {r.months.length ? (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-ink-faint text-left">
                    <th className="font-bold pb-2 px-1">Month</th>
                    <th className="font-bold pb-2 px-1 text-right">YouTube</th>
                    {fbMonths && <th className="font-bold pb-2 px-1 text-right">Facebook</th>}
                    <th className="font-bold pb-2 px-1 text-right">Other</th>
                    <th className="font-bold pb-2 px-1 text-right">Total</th>
                    <th className="font-bold pb-2 px-1 text-right">RPM</th>
                  </tr>
                </thead>
                <tbody>
                  {r.months.map((m) => (
                    <tr key={m.month} className="border-t border-line/10">
                      <td className="py-2 px-1 whitespace-nowrap">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</td>
                      <td className="py-2 px-1 text-right tabular-nums">{cents(m.revenue)}</td>
                      {fbMonths && <td className="py-2 px-1 text-right tabular-nums">{m.facebook ? cents(m.facebook) : "–"}</td>}
                      <td className="py-2 px-1 text-right tabular-nums text-ink-soft">{m.other ? cents(m.other) : "–"}</td>
                      <td className="py-2 px-1 text-right tabular-nums font-semibold">{cents(m.revenue + m.facebook + m.other)}</td>
                      <td className="py-2 px-1 text-right tabular-nums text-ink-soft">{m.views ? cents((m.revenue / m.views) * 1000) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">Nothing yet.</p>
          )}
        </ChartCard>
        {r.isMaster && <AccessCard r={r} teamId={teamId} />}
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  sponsorship: "Sponsorship",
  brand_deal: "Brand deal",
  affiliate: "Affiliate links",
  youtube_other: "YouTube (outside the estimate)",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  merch: "Merch",
  other: "Other",
};

/** Brand-ish dots for the income sources in the dropdown (meaning stays in the words). */
const SOURCE_TONE: Record<string, string> = {
  youtube_other: "rgb(var(--chart-yt))",
  facebook: "rgb(var(--chart-fb))",
  instagram: "rgb(var(--chart-ig))",
  tiktok: "rgb(var(--chart-tt))",
};

const POPULAR_CURRENCIES = ["USD", "EUR", "GBP", "RON", "CAD", "AUD", "CHF", "JPY", "INR", "BRL", "MXN", "PLN", "SEK", "NOK", "DKK", "HUF", "CZK", "TRY", "AED", "ZAR"];
let currencyNames: Intl.DisplayNames | null = null;
function currencyName(code: string) {
  try {
    currencyNames ??= new Intl.DisplayNames(["en"], { type: "currency" });
    return currencyNames.of(code) ?? code;
  } catch {
    return code;
  }
}
function currencySymbol(code: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((x) => x.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/** "Amounts in [EUR · Euro ▾]": any currency with an exchange rate, saved for this person. */
function CurrencyBar({ r }: { r: Revenue }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(r.currency);
  useEffect(() => setValue(r.currency), [r.currency]);
  const options = useMemo<SelectOption[]>(() => {
    const opt = (code: string, group: string): SelectOption => ({
      value: code,
      label: currencyName(code),
      hint: `${code} · ${currencySymbol(code)}`,
      group,
      icon: <span className="w-9 flex-shrink-0 text-[11px] font-bold font-mono text-ink-soft">{code}</span>,
    });
    const popular = POPULAR_CURRENCIES.filter((c) => r.currencies.includes(c));
    return [...popular.map((c) => opt(c, "Common")), ...r.currencies.filter((c) => !popular.includes(c)).map((c) => opt(c, "All currencies"))];
  }, [r.currencies]);
  const updated = r.fx?.updatedAt ? new Date(r.fx.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
      <span className="text-[12.5px] font-semibold text-ink-soft">Amounts in</span>
      <div className="w-[15.5rem] max-w-full">
        <Select
          value={value}
          onChange={(code) => {
            if (!code || code === value) return;
            const prev = value;
            setValue(code);
            start(async () => {
              const res = await setRevenueCurrency(code);
              if (res.error !== undefined) {
                setValue(prev);
                toast.error(res.error);
              } else router.refresh();
            });
          }}
          options={options}
          searchable
          ariaLabel="Currency"
          menuMinWidth={280}
          className={`!h-9 !text-[13px] ${pending ? "opacity-60" : ""}`}
          renderValue={(o) => (
            <span className="truncate">
              <b className="font-mono text-[12px] mr-1.5">{value}</b>
              {o?.label ?? currencyName(value)}
            </span>
          )}
        />
      </div>
      {r.fx && (
        <span className="text-[11.5px] text-ink-faint">
          {r.fx.converted ? "Converted at today\u2019s rate" : "Exchange rates"}
          {updated ? ` (${updated})` : ""} ·{" "}
          <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline decoration-line/30 underline-offset-2 hover:text-ink">
            Rates By Exchange Rate API
          </a>
        </span>
      )}
    </div>
  );
}

function IncomeForm({ teamId, currency, onDone }: { teamId: string; currency: string; onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const today = new Date();
  const [day, setDay] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
  const [source, setSource] = useState("sponsorship");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="mb-4 rounded-xl border border-line/15 bg-surface-2/50 p-3 grid gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)_8rem]"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const res = await addRevenueEntry(teamId, { day, source, amount: Number(amount.replace(",", ".")), note, currency });
        setSaving(false);
        if (res.error !== undefined) return toast.error(res.error);
        toast.success("Income added");
        onDone();
        router.refresh();
      }}
    >
      <DateChip value={day} onChange={setDay} ariaLabel="Date of the income" />
      <Select
        value={source}
        onChange={(v) => v && setSource(v)}
        ariaLabel="Where it came from"
        className="!h-9 !text-[13px]"
        menuMinWidth={240}
        options={Object.entries(SOURCE_LABEL).map(([k, v]) => ({ value: k, label: v, icon: <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SOURCE_TONE[k] ?? OTHER_COLOR }} aria-hidden /> }))}
      />
      <label className="flex items-center h-9 rounded-lg border border-line/15 bg-surface px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-amber/40">
        <span className="text-ink-faint mr-1.5 text-[12px] font-semibold">{currency}</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Amount" className="w-full bg-transparent outline-none tabular-nums" autoFocus />
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note (optional): brand, campaign, which video…" aria-label="Note" className="sm:col-span-3 h-9 rounded-lg border border-line/15 bg-surface px-2.5 text-[13px]" />
      <div className="sm:col-span-3 flex items-center gap-2">
        <button type="submit" disabled={saving || !amount} className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] disabled:opacity-50">
          {saving ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Cancel
        </button>
      </div>
    </form>
  );
}

function IncomeRow({ e, teamId, canEdit, money }: { e: Revenue["entries"][number]; teamId: string; canEdit: boolean; money: (n: number) => string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-14 text-[12px] text-ink-faint tabular-nums flex-shrink-0">{niceDay(e.day)}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold truncate">{SOURCE_LABEL[e.source] ?? "Other"}</span>
        {(e.note || e.video) && (
          <span className="block text-[11.5px] text-ink-soft truncate">
            {e.video && (
              <Link href={e.video.kind === "short" ? `/shorts/${e.video.id}` : `/videos/${e.video.id}`} className="font-mono text-amber hover:underline mr-1.5">
                #{e.video.number ?? "?"}
              </Link>
            )}
            {e.note}
          </span>
        )}
      </span>
      <span className="text-right">
        <b className="block text-[13px] tabular-nums">{money(e.amount)}</b>
        {e.original && (
          <span className="block text-[11px] text-ink-faint tabular-nums">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: e.original.currency }).format(e.original.amount)}
          </span>
        )}
      </span>
      {canEdit && (
        <button
          type="button"
          disabled={busy}
          aria-label="Remove this income"
          onClick={async () => {
            const ok = await confirm({ title: "Remove this income?", description: `${SOURCE_LABEL[e.source] ?? "Other"}, ${money(e.amount)} on ${niceDay(e.day)}.`, confirmLabel: "Remove", danger: true });
            if (!ok) return;
            setBusy(true);
            const res = await deleteRevenueEntry(teamId, e.id);
            setBusy(false);
            if (res.error !== undefined) toast.error(res.error);
            else router.refresh();
          }}
          className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-red hover:bg-red/10 disabled:opacity-50"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}

function AccessCard({ r, teamId }: { r: Revenue; teamId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <ChartCard title="Who can see revenue" sub="Masters always can. Turn it on for anyone else you trust with it.">
      <ul className="space-y-1">
        {r.access.map((p) => {
          const on = p.master || p.granted;
          return (
            <li key={p.userId} className="flex items-center gap-2.5 py-1.5">
              <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-7 h-7 text-[10px]" />
              <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{p.name}</span>
              {p.master ? (
                <span className="text-[12px] text-ink-faint">Master</span>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${p.name} can see revenue`}
                  disabled={busy === p.userId}
                  onClick={async () => {
                    setBusy(p.userId);
                    const res = await setRevenueAccess(teamId, p.userId, !on);
                    setBusy(null);
                    if (res.error !== undefined) toast.error(res.error);
                    else router.refresh();
                  }}
                  className={`w-10 h-6 rounded-full relative transition-colors disabled:opacity-60 ${on ? "bg-amber" : "bg-line/20"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
