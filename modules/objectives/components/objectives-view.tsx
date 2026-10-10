"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Mascot } from "@/components/ui/mascot";
import { useToast } from "@/components/ui/toast-provider";
import { EditIcon, FlameIcon, PlusIcon, TrophyIcon } from "@/components/ui/icons";
import { addObjectivesWidget } from "@/app/(dashboard)/objectives/actions";
import { GROUP_LABEL, METRICS, colorVar, formatAmount, isMetricId, type MetricGroup } from "../lib/metrics";
import { PERIODS, THIS, periodTick, timeLeft, type PeriodKind } from "../lib/periods";
import type { ObjectiveView, WinView } from "../lib/types";
import { useLiveBoard, type LiveBoard } from "./use-live-board";
import { ObjectiveCard } from "./objective-card";
import { ObjectiveDetail } from "./objective-detail";
import { ScheduleDialog } from "./schedule-dialog";
import { Rings, useWhen, type Ring } from "./parts";

/*
 * The Objectives page: every goal of the team, live. A summary with the
 * rings, filters (cadence, how it's going, kind), one section per cadence
 * (today, this week, this month…) with a card per goal, the recent wins, and
 * a full view of any goal (?o=<id>, where notifications lead).
 */

type StatusFilter = "all" | "reached" | "on_track" | "behind";
const STATUS_LABEL: Record<StatusFilter, string> = { all: "Any", reached: "Reached", on_track: "On track", behind: "Behind" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function chip(on: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12.5px] font-semibold border transition-colors whitespace-nowrap ${on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`;
}

const statusOf = (o: ObjectiveView): StatusFilter | null => {
  const s = o.current.status;
  return s === "reached" ? "reached" : s === "ahead" || s === "on_track" ? "on_track" : s === "behind" ? "behind" : null;
};

export function ObjectivesView({ initial, teamId, canEdit, openId, onDashboard }: { initial: LiveBoard; teamId: string; canEdit: boolean; openId: string | null; onDashboard: boolean }) {
  const { board } = useLiveBoard(teamId, "page", initial);
  const b = board ?? initial;
  const toast = useToast();
  const when = useWhen();
  const [cadence, setCadence] = useState<"all" | PeriodKind>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [group, setGroup] = useState<"all" | MetricGroup>("all");
  // Opened after hydration (dialogs live in a portal, so not while rendering on the server).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ObjectiveView | null>(null);
  const [added, setAdded] = useState(onDashboard);
  const [allWins, setAllWins] = useState(false);
  const [adding, startAdding] = useTransition();
  useEffect(() => setDetailId(openId), [openId]);

  const active = useMemo(() => b.objectives.filter((o) => !o.paused), [b.objectives]);
  const paused = useMemo(() => b.objectives.filter((o) => o.paused), [b.objectives]);
  const cadences = PERIODS.filter((p) => active.some((o) => o.period === p));
  const groups = (["posting", "making", "audience"] as MetricGroup[]).filter((g) => active.some((o) => isMetricId(o.metric) && METRICS[o.metric].group === g));
  const shown = active.filter(
    (o) => (cadence === "all" || o.period === cadence) && (status === "all" || statusOf(o) === status) && (group === "all" || (isMetricId(o.metric) && METRICS[o.metric].group === group))
  );
  const detail = b.objectives.find((o) => o.id === detailId) ?? null;
  const counts = { all: active.length, reached: active.filter((o) => statusOf(o) === "reached").length, on_track: active.filter((o) => statusOf(o) === "on_track").length, behind: active.filter((o) => statusOf(o) === "behind").length };

  const closeSchedule = useCallback(() => setSchedule(null), []);
  // Stable, so the open dialog doesn't take the focus back every time the board refreshes live.
  const closeDetail = useCallback(() => {
    setDetailId(null);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("o")) {
        u.searchParams.delete("o");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      }
    } catch {}
  }, []);

  function addToDashboard() {
    startAdding(async () => {
      const r = await addObjectivesWidget();
      if (r.error !== undefined) return void toast.error(r.error);
      setAdded(true);
      toast.success(r.added ? "Added to your dashboard" : "It's already on your dashboard");
    });
  }

  const header = (
    <header className="flex items-start gap-3 flex-wrap mb-5">
      <div className="flex-1 min-w-[min(100%,16rem)]">
        <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold">Objectives</h1>
        <p className="mt-2 text-[13.5px] text-ink-soft flex items-center gap-2">
          <span className="relative inline-flex w-2 h-2" aria-hidden>
            <span className="obj-pulse-dot absolute inset-0 rounded-full bg-green/60" />
            <span className="relative w-2 h-2 rounded-full bg-green" />
          </span>
          The team&rsquo;s goals, live: they fill up as videos go out.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {!added && b.objectives.length > 0 && (
          <button type="button" onClick={addToDashboard} disabled={adding} className="rounded-lg border border-line/15 px-3 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 disabled:opacity-60">
            <PlusIcon className="w-3.5 h-3.5" />
            Put it on my dashboard
          </button>
        )}
        {canEdit && (
          <Link href="/team?tab=objectives" className="rounded-lg bg-amber text-white px-3.5 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-bold hover:brightness-110">
            <EditIcon className="w-3.5 h-3.5" />
            Edit objectives
          </Link>
        )}
      </div>
    </header>
  );

  if (!b.ready)
    return (
      <div>
        {header}
        <p className="text-[13px] text-ink-soft">Objectives need the latest database update (migration 0078).</p>
      </div>
    );

  if (!b.objectives.length)
    return (
      <div>
        {header}
        <div className="rounded-3xl border border-dashed border-line/25 px-6 py-12 flex flex-col items-center text-center">
          <Mascot mood="idle" size={120} />
          <h2 className="mt-3 font-display text-[22px] font-semibold">No objectives yet</h2>
          <p className="mt-1 text-[13.5px] text-ink-soft max-w-md">
            Goals like 14 shorts a week, 3 Instagram-only reels, 2 long videos a month or a million views. They fill up live, and the whole team is congratulated when one is reached.
          </p>
          {canEdit ? (
            <Link href="/team?tab=objectives" className="mt-5 rounded-lg bg-amber text-white px-4 h-10 inline-flex items-center gap-1.5 text-[13px] font-bold hover:brightness-110">
              <PlusIcon className="w-4 h-4" strokeWidth={2.5} />
              Set the first one
            </Link>
          ) : (
            <p className="mt-4 text-[12.5px] text-ink-faint">Masters set them in Team settings.</p>
          )}
        </div>
      </div>
    );

  // ---- The summary --------------------------------------------------------
  const ringList = active.slice(0, 4);
  const rings: Ring[] = ringList.map((o) => ({ key: o.id, color: o.color, value: o.current.value, target: o.current.target, label: `${o.title}: ${formatAmount(o.metric, o.current.value)} of ${formatAmount(o.metric, o.current.target)}` }));
  const reachedNow = active.filter((o) => o.current.status === "reached").length;
  const since = Date.now() - 30 * 86_400_000;
  const wins30 = b.wins.filter((w) => Date.parse(w.reachedAt) >= since).length;
  const best = [...active].sort((x, y) => y.stats.streak - x.stats.streak)[0];
  const winGroups = groupWins(b.wins.slice(0, 40)).slice(0, 15);

  return (
    <div>
      {header}

      <section className="rounded-3xl border border-line/10 bg-surface p-4 sm:p-6 mb-5">
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-7 items-center sm:items-stretch">
          <div className="flex flex-col items-center gap-3">
            <Rings rings={rings} size={168} className="hidden sm:block">
              <div className="leading-none">
                <div className="font-display text-[30px] font-semibold tabular-nums">
                  {reachedNow}/{active.length}
                </div>
                <div className="text-[11px] text-ink-faint mt-1">reached</div>
              </div>
            </Rings>
            <Rings rings={rings} size={136} className="sm:hidden">
              <div className="leading-none">
                <div className="font-display text-[24px] font-semibold tabular-nums">
                  {reachedNow}/{active.length}
                </div>
                <div className="text-[10.5px] text-ink-faint mt-1">reached</div>
              </div>
            </Rings>
          </div>
          <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
            {/* The rings' names (identity is never colour alone). */}
            <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {ringList.map((o) => (
                <li key={o.id} className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: colorVar(o.color) }} aria-hidden />
                  <button type="button" onClick={() => setDetailId(o.id)} className="text-[13px] font-semibold truncate hover:underline underline-offset-2 text-left">
                    {o.title}
                  </button>
                  <span className="ml-auto text-[12px] tabular-nums text-ink-soft whitespace-nowrap">
                    {formatAmount(o.metric, o.current.value)}/{o.current.target ? formatAmount(o.metric, o.current.target) : "off"}
                  </span>
                </li>
              ))}
              {active.length > ringList.length && <li className="text-[12px] text-ink-faint">and {active.length - ringList.length} more below</li>}
            </ul>
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mt-auto">
              {cadences.map((k) => {
                const list = active.filter((o) => o.period === k);
                const done = list.filter((o) => o.current.status === "reached").length;
                const left = list[0]?.current.daysLeft ?? 0;
                return (
                  <button key={k} type="button" onClick={() => setCadence((c) => (c === k ? "all" : k))} className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${cadence === k ? "border-amber/50 bg-amber/[0.06]" : "border-line/10 bg-surface-2/40 hover:border-line/25"}`}>
                    <div className="text-[11.5px] text-ink-soft">{cap(THIS[k])}</div>
                    <div className="font-display text-[20px] font-semibold leading-tight tabular-nums">
                      {done}
                      <span className="text-ink-faint text-[15px]">/{list.length}</span>
                    </div>
                    <div className="text-[11px] text-ink-faint">{done === list.length ? "All reached" : cap(timeLeft(k, left))}</div>
                  </button>
                );
              })}
              <div className="rounded-xl border border-line/10 bg-surface-2/40 px-3 py-2.5">
                <div className="text-[11.5px] text-ink-soft">Wins, 30 days</div>
                <div className="font-display text-[20px] font-semibold leading-tight tabular-nums flex items-center gap-1.5">
                  <TrophyIcon className="w-4 h-4 text-gold" />
                  {wins30}
                </div>
                <div className="text-[11px] text-ink-faint truncate">{best && best.stats.streak > 1 ? `${best.stats.streak} in a row: ${best.title}` : "Every goal reached counts"}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filters: one row above everything they filter. */}
      <div className="flex items-center gap-2 mb-5 -mx-4 px-4 overflow-x-auto no-scrollbar sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible" role="toolbar" aria-label="Filter objectives">
        {cadences.length > 1 && (
          <div className="flex items-center gap-1.5 flex-shrink-0 sm:flex-wrap">
            <button type="button" aria-pressed={cadence === "all"} onClick={() => setCadence("all")} className={chip(cadence === "all")}>
              All
            </button>
            {cadences.map((k) => (
              <button key={k} type="button" aria-pressed={cadence === k} onClick={() => setCadence(k)} className={chip(cadence === k)}>
                {cap(THIS[k])}
              </button>
            ))}
          </div>
        )}
        {cadences.length > 1 && <span className="w-px h-5 bg-line/15 mx-1 flex-shrink-0" aria-hidden />}
        <div className="flex items-center gap-1.5 flex-shrink-0 sm:flex-wrap">
          {(["all", "reached", "on_track", "behind"] as StatusFilter[]).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} disabled={s !== "all" && !counts[s]} onClick={() => setStatus(s)} className={`${chip(status === s)} disabled:opacity-40`}>
              {STATUS_LABEL[s]}
              <span className="text-ink-faint tabular-nums">{counts[s]}</span>
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <>
            <span className="w-px h-5 bg-line/15 mx-1 flex-shrink-0" aria-hidden />
            <div className="flex items-center gap-1.5 flex-shrink-0 sm:flex-wrap">
              {(["all", ...groups] as ("all" | MetricGroup)[]).map((g) => (
                <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={chip(group === g)}>
                  {g === "all" ? "Every kind" : GROUP_LABEL[g]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="space-y-8 min-w-0">
          {!shown.length && (
            <div className="rounded-2xl border border-dashed border-line/25 py-10 text-center">
              <p className="text-[13px] text-ink-soft">Nothing matches these filters.</p>
              <button type="button" onClick={() => (setCadence("all"), setStatus("all"), setGroup("all"))} className="mt-2 text-[12.5px] font-semibold text-amber">
                Show everything
              </button>
            </div>
          )}
          {PERIODS.filter((k) => shown.some((o) => o.period === k)).map((k) => {
            const list = shown.filter((o) => o.period === k);
            const first = list[0].current;
            const done = list.filter((o) => o.current.status === "reached").length;
            return (
              <section key={k} aria-label={cap(THIS[k])}>
                <div className="flex items-baseline gap-2 flex-wrap mb-3">
                  <h2 className="font-display text-[22px] font-semibold">{cap(THIS[k])}</h2>
                  <span className="text-[12.5px] text-ink-faint">
                    {first.range}
                    {first.daysLeft && k !== "day" ? ` · ${timeLeft(k, first.daysLeft)}` : ""}
                  </span>
                  <span className="ml-auto text-[12.5px] text-ink-soft tabular-nums">
                    {done} of {list.length} reached
                  </span>
                </div>
                <div className="grid gap-4 lg:grid-cols-2 motion-stagger">
                  {list.map((o, i) => (
                    <ObjectiveCard key={o.id} o={o} people={b.people} audienceReady={b.audienceReady} onOpen={() => setDetailId(o.id)} wide={i === list.length - 1 && list.length % 2 === 1} />
                  ))}
                </div>
              </section>
            );
          })}
          {paused.length > 0 && (
            <details className="group rounded-2xl border border-line/10 bg-surface">
              <summary className="cursor-pointer list-none px-4 h-11 flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
                Paused <span className="text-ink-faint tabular-nums">{paused.length}</span>
                <span className="ml-auto text-[12px] text-ink-faint group-open:hidden">Show</span>
              </summary>
              <div className="grid gap-4 lg:grid-cols-2 p-4 pt-0">
                {paused.map((o, i) => (
                  <ObjectiveCard key={o.id} o={o} people={b.people} audienceReady={b.audienceReady} onOpen={() => setDetailId(o.id)} wide={i === paused.length - 1 && paused.length % 2 === 1} />
                ))}
              </div>
            </details>
          )}
        </div>

        <aside className="rounded-2xl border border-line/10 bg-surface p-4 xl:sticky xl:top-20">
          <h2 className="text-[14.5px] font-semibold flex items-center gap-2">
            <TrophyIcon className="w-4 h-4 text-gold" />
            Recent wins
          </h2>
          <p className="text-[12px] text-ink-faint mt-0.5 mb-3">Every goal the team reached, the last 90 days.</p>
          {!b.wins.length ? (
            <div className="flex items-center gap-3 py-2">
              <Mascot mood="idle" size={56} />
              <p className="text-[12.5px] text-ink-soft">No wins yet. The first one gets confetti.</p>
            </div>
          ) : (
            // Beside the goals on big screens (a scrolling list), under them otherwise (in columns).
            <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1 xl:max-h-[620px] xl:overflow-y-auto xl:pb-6 xl:[mask-image:linear-gradient(to_bottom,black_88%,transparent)] widget-scroll -mx-1 px-1">
              {winGroups.map((g, i) => (
                <WinRow key={`${g[0].objectiveId}:${g[0].start}`} wins={g} when={when} onOpen={() => setDetailId(g[0].objectiveId)} className={i >= 6 && !allWins ? "hidden xl:block" : ""} />
              ))}
            </ol>
          )}
          {winGroups.length > 6 && !allWins && (
            <button type="button" onClick={() => setAllWins(true)} className="xl:hidden mt-2 w-full rounded-lg border border-line/15 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Show all {winGroups.length}
            </button>
          )}
          {best && best.stats.streak > 1 && (
            <p className="mt-3 pt-3 border-t border-line/10 text-[12px] text-ink-soft flex items-center gap-1.5">
              <FlameIcon className="w-4 h-4 text-coral flex-shrink-0" />
              <span>
                Longest run now: <b className="text-ink">{best.title}</b>, {best.stats.streak} in a row.
              </span>
            </p>
          )}
        </aside>
      </div>

      <ObjectiveDetail
        o={detail}
        people={b.people}
        canEdit={canEdit}
        onClose={closeDetail}
        onSchedule={() => {
          const o = detail;
          closeDetail();
          setSchedule(o);
        }}
      />
      <ScheduleDialog open={!!schedule} onClose={closeSchedule} objective={schedule} canEdit={canEdit} />
    </div>
  );
}

/** Wins in a row of the same goal (a daily goal reached day after day) share one line. */
function groupWins(wins: WinView[]): WinView[][] {
  const out: WinView[][] = [];
  for (const w of wins) {
    const last = out[out.length - 1];
    if (last && last[0].objectiveId === w.objectiveId) last.push(w);
    else out.push([w]);
  }
  return out;
}

function WinRow({ wins, when, onOpen, className = "" }: { wins: WinView[]; when: (iso: string | null, day: string | null) => string; onOpen: () => void; className?: string }) {
  const w = wins[0];
  const many = wins.length > 1;
  return (
    <li className={className}>
      <button type="button" onClick={onOpen} className="w-full text-left flex items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-surface-2/70">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: colorVar(w.color, 0.14), color: colorVar(w.color) }} aria-hidden>
          <TrophyIcon className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold truncate">{w.title}</span>
          <span className="block text-[11.5px] text-ink-soft">
            {many ? `Reached ${wins.length} times · ${periodTick(w.period, wins[wins.length - 1].start)} to ${periodTick(w.period, w.start)}` : `${formatAmount(w.metric, w.value)} of ${formatAmount(w.metric, w.target)} · ${w.label}`}
          </span>
          <span className="block text-[11px] text-ink-faint truncate">
            {when(w.reachedAt, null)}
            {!w.celebratedAt ? " · already reached when set" : w.winner && (w.winner.kind === "short" || w.winner.kind === "long") && w.winner.number ? ` · #${w.winner.number} took it over` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}
