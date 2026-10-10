"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { ChevronLeftIcon, ChevronRightIcon, ExternalIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { loadViewsDay } from "@/app/(dashboard)/analytics/actions";
import type { DayVideo, DayViews } from "../lib/queries";
import { fmtCompact, fmtInt } from "./charts";

/*
 * One day of the Views chart, opened by clicking it: every video that got
 * views that day on the connected platforms, how many each got, and how much
 * of the day it was. Filter by platform and kind, sort, step to the day
 * before or after (← →), open any video.
 */

const NAME = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" } as const;
const COLOR = { youtube: "rgb(var(--chart-yt))", instagram: "rgb(var(--chart-ig))", tiktok: "rgb(var(--chart-tt))", facebook: "rgb(var(--chart-fb))" } as const;
type P = keyof typeof NAME;
type Kind = "all" | DayVideo["kind"];
const KIND_WORD: Record<DayVideo["kind"], string> = { short: "Short", long: "Long video", post: "Post" };

const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Kept per day while the dialog is open (stepping back and forth is instant). */
type Loaded = { data: DayViews } | { error: string };

export function DayVideos({ teamId, days, index, platforms, onClose }: { teamId: string; days: string[]; index: number | null; platforms: P[]; onClose: () => void }) {
  const [at, setAt] = useState(index);
  useEffect(() => setAt(index), [index]);
  const day = at === null ? null : days[at] ?? null;
  const cache = useRef(new Map<string, Loaded>());
  const [loaded, setLoaded] = useState<{ day: string; res: Loaded } | null>(null);
  // One platform picked on the chart: start with it.
  const [platform, setPlatform] = useState<"all" | P>(platforms.length === 1 ? platforms[0] : "all");
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<"views" | "newest">("views");

  useEffect(() => {
    if (!day) return;
    const hit = cache.current.get(day);
    if (hit) return setLoaded({ day, res: hit });
    let alive = true;
    loadViewsDay(teamId, day)
      .then((r) => {
        const res: Loaded = "error" in r && r.error !== undefined ? { error: r.error } : { data: (r as { data: DayViews }).data };
        if (!("error" in res)) cache.current.set(day, res);
        if (alive) setLoaded({ day, res });
      })
      .catch(() => alive && setLoaded({ day, res: { error: "Couldn't load this day. Check your connection and try again." } }));
    return () => {
      alive = false;
    };
  }, [day, teamId]);

  const step = useCallback(
    (d: number) => setAt((i) => (i === null ? i : Math.max(0, Math.min(days.length - 1, i + d)))),
    [days.length]
  );
  // ← → step through the days (not while typing somewhere).
  useEffect(() => {
    if (at === null) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [at, step]);

  const res = loaded && loaded.day === day ? loaded.res : null;
  const data = res && "data" in res ? res.data : null;
  // The chart's own platforms first (what was picked there), then the rest that have views.
  const rows = useMemo(() => (data?.platforms ?? []).filter((p) => (p.views ?? 0) > 0 || p.count > 0), [data]);
  const allViews = rows.reduce((t, p) => t + (p.views ?? 0), 0);
  const total = platform === "all" ? allViews : rows.find((p) => p.platform === platform)?.views ?? 0;
  const list = useMemo(() => {
    const xs = (data?.videos ?? []).filter((v) => (platform === "all" || v.platform === platform) && (kind === "all" || v.kind === kind));
    return sort === "views" ? xs : [...xs].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  }, [data, platform, kind, sort]);
  const kinds = useMemo(() => new Set((data?.videos ?? []).filter((v) => platform === "all" || v.platform === platform).map((v) => v.kind)), [data, platform]);
  const top = list.length ? Math.max(...list.map((v) => v.views)) : 1;
  const dayTotal = (p: P) => rows.find((r) => r.platform === p)?.views ?? null;

  if (at === null || !day) return null;
  return (
    <Dialog open onClose={onClose} title={`Views on ${longDay(day)}`} description="Every video that got views that day, on the accounts connected now." width="sm:max-w-3xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} disabled={at <= 0} aria-label="The day before" className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-[12.5px] font-semibold tabular-nums min-w-[4.5rem] text-center">{shortDay(day)}</span>
          <button type="button" onClick={() => step(1)} disabled={at >= days.length - 1} aria-label="The day after" className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
          <span className="flex-1" />
          {data && (
            <span className="text-[12.5px] text-ink-soft">
              <b className="font-display text-[20px] text-ink tabular-nums">{fmtInt(total)}</b> views{platform === "all" ? "" : ` on ${NAME[platform]}`}
            </span>
          )}
        </div>

        {!res ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading the day">
            <div className="skeleton h-14 rounded-xl" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-xl" style={{ opacity: 1 - i * 0.18 }} />
            ))}
          </div>
        ) : "error" in res ? (
          <p className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-[13px] text-ink-soft">{res.error}</p>
        ) : !rows.length ? (
          <p className="rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-[13px] text-ink-soft">No views copied for this day yet.</p>
        ) : (
          <>
            {/* Each platform's part of the day, and a filter. */}
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4" role="group" aria-label="Platform">
              {rows.map((p) => {
                const on = platform === p.platform;
                const share = allViews > 0 && p.views ? Math.round((p.views / allViews) * 100) : null;
                return (
                  <button
                    key={p.platform}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPlatform(on ? "all" : (p.platform as P))}
                    className={`text-left rounded-xl border px-3 py-2 transition-colors ${on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.12)]" : "border-line/10 bg-surface-2/40 hover:border-line/25"}`}
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
                      <PlatformIcon platform={p.platform} className="w-4 h-4 rounded" />
                      {NAME[p.platform as P]}
                    </span>
                    <span className="block font-display text-[19px] font-semibold tabular-nums leading-tight mt-0.5">{p.views === null ? "–" : fmtCompact(p.views)}</span>
                    <span className="block h-1 rounded-full bg-line/10 mt-1.5 overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${share ?? 0}%`, background: COLOR[p.platform as P] }} />
                    </span>
                    <span className="block text-[11px] text-ink-faint mt-1 truncate">
                      {share !== null ? `${share}% of the day` : ""}
                      {p.count ? `${share !== null ? " · " : ""}${p.count} video${p.count === 1 ? "" : "s"}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(["all", "short", "long", "post"] as const)
                .filter((k) => k === "all" || kinds.has(k))
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                    className={`rounded-full px-3 h-7 text-[12px] font-semibold border transition-colors ${kind === k ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
                  >
                    {k === "all" ? "Everything" : k === "short" ? "Shorts" : k === "long" ? "Long videos" : "Posts"}
                  </button>
                ))}
              <span className="flex-1" />
              <div role="radiogroup" aria-label="Order" className="inline-flex rounded-lg border border-line/15 p-0.5">
                {(["views", "newest"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={sort === s}
                    onClick={() => setSort(s)}
                    className={`px-2.5 h-6 rounded-md text-[11.5px] font-semibold transition-colors ${sort === s ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
                  >
                    {s === "views" ? "Most views" : "Newest"}
                  </button>
                ))}
              </div>
            </div>

            {list.length ? (
              <ul className="rounded-xl border border-line/10 divide-y divide-line/10 overflow-hidden">
                {list.map((v, i) => {
                  const ofPlatform = dayTotal(v.platform as P);
                  const share = ofPlatform ? Math.round((v.views / ofPlatform) * 100) : null;
                  const fresh = v.publishedAt?.slice(0, 10) === day;
                  return (
                    <li key={`${v.platform}:${v.id}`} className="px-3 py-2.5 flex items-center gap-2.5 sm:gap-3 min-w-0 animate-[fadein_.25s_ease_both]" style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}>
                      <span className="relative w-11 h-11 sm:w-[72px] sm:h-[40px] rounded-md overflow-hidden bg-surface-2 flex-shrink-0">
                        {v.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                        )}
                        <PlatformIcon platform={v.platform} className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {v.url ? (
                          <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex items-start sm:items-center gap-1 text-[13px] font-semibold leading-snug hover:underline min-w-0">
                            {/* Two lines on a phone, one on a computer. */}
                            <span className="line-clamp-2 sm:line-clamp-none sm:truncate">{v.title || "Untitled"}</span>
                            <ExternalIcon className="w-3 h-3 mt-0.5 sm:mt-0 text-ink-faint flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="block text-[13px] font-semibold leading-snug line-clamp-2 sm:line-clamp-none sm:truncate">{v.title || "Untitled"}</span>
                        )}
                        <span className="flex items-center flex-wrap gap-x-1.5 text-[11.5px] text-ink-faint min-w-0">
                          <span className="whitespace-nowrap">{KIND_WORD[v.kind]}</span>
                          {v.publishedAt && <span className="whitespace-nowrap">· {fresh ? "posted that day" : `posted ${shortDay(v.publishedAt.slice(0, 10))}`}</span>}
                          {v.watchMinutes !== null && v.watchMinutes > 0 && <span className="hidden sm:inline">· {fmtCompact(Math.round(v.watchMinutes / 6) / 10)} h watched</span>}
                          {v.ours && (
                            <Link href={v.ours.kind === "short" ? `/shorts/${v.ours.id}` : `/videos/${v.ours.id}`} className="font-mono font-semibold text-amber hover:underline">
                              #{v.ours.number ?? "?"}
                            </Link>
                          )}
                        </span>
                      </span>
                      <span className="text-right flex-shrink-0 w-[4.75rem] sm:w-[6.5rem]">
                        <span className="block text-[14px] font-bold tabular-nums">{fmtInt(v.views)}</span>
                        <span className="block h-1 rounded-full bg-line/10 mt-1 overflow-hidden" aria-hidden>
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (v.views / top) * 100)}%`, background: COLOR[v.platform as P] }} />
                        </span>
                        <span className="block text-[10.5px] text-ink-faint mt-0.5">{share !== null && share <= 100 ? `${share}% of ${NAME[v.platform as P]}` : v.how === "change" ? "between copies" : ""}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line/20 px-4 py-6 text-center text-[13px] text-ink-soft">No videos with this filter.</p>
            )}

            {/* What isn't explained by the listed videos, and why a platform has no list. */}
            <div className="space-y-1 text-[11.5px] text-ink-faint">
              {rows
                .filter((p) => platform === "all" || p.platform === platform)
                .map((p) => {
                  const rest = p.views !== null ? p.views - p.listed : null;
                  const line = p.note ?? (rest !== null && rest > Math.max(5, (p.views ?? 0) * 0.02) ? `${fmtInt(rest)} more views on ${NAME[p.platform as P]} came from other videos (older ones, or below the top 50).` : null);
                  return line ? (
                    <p key={p.platform} className="flex items-start gap-1.5">
                      <PlatformIcon platform={p.platform} className="w-3.5 h-3.5 rounded mt-px flex-shrink-0" />
                      <span>{line}</span>
                    </p>
                  ) : null;
                })}
              <p>YouTube counts each video&rsquo;s views per day. Instagram, TikTok and Facebook only share running totals, so theirs is the change between that morning&rsquo;s copy and the next.</p>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
