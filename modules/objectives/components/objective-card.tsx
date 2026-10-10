"use client";

import { useEffect, useRef, useState } from "react";
import { FlameIcon, TrophyIcon } from "@/components/ui/icons";
import { useCountUp } from "@/components/ui/count-up";
import { colorVar, formatAmount, unitFor } from "../lib/metrics";
import { THIS, daysBetween, timeLeft, type PeriodKind } from "../lib/periods";
import type { ObjectiveView, PersonLite } from "../lib/types";
import { HistoryBars, Meter, ObjectiveIcon, PeopleStack, StatusPill, unjudged, useWhen } from "./parts";

/** "by Sunday", "by Oct 31", "by tonight". */
export function byWhen(kind: PeriodKind, end: string) {
  if (kind === "day") return "by tonight";
  if (kind === "week") return "by Sunday";
  return `by ${new Date(`${end}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/** "about 2 a day", "about 1 every 3 days", "about 32K a day". */
export function perDayWords(metric: string, perDay: number | null) {
  if (perDay === null || !(perDay > 0)) return null;
  if (perDay < 0.95) return `about 1 every ${Math.max(2, Math.round(1 / perDay))} days`;
  return `about ${perDay < 10 ? formatAmount(metric, Math.round(perDay * 10) / 10) : formatAmount(metric, Math.round(perDay))} a day`;
}

/** The line under the meter: what's left, or when it was reached. */
export function progressWords(o: ObjectiveView, when: (iso: string | null, day: string | null) => string) {
  const c = o.current;
  if (o.paused) return "Paused: not counting for now.";
  if (c.target === 0) return `Off ${THIS[o.period]}.`;
  if (c.status === "reached") {
    const early = c.reachedDay ? daysBetween(c.reachedDay, c.end) : 0;
    const at = c.reachedAt || c.reachedDay ? `Reached ${when(c.reachedAt, c.reachedDay)}` : "Reached";
    const extra = c.value > c.target ? `, ${formatAmount(o.metric, c.value - c.target)} over` : "";
    return `${at}${early > 0 ? `, ${early} day${early === 1 ? "" : "s"} early` : ""}${extra}.`;
  }
  const left = c.target - c.value;
  if (o.period === "day") return `${formatAmount(o.metric, left)} to go today.`;
  const parts = [`${formatAmount(o.metric, left)} to go`, c.daysLeft ? timeLeft(o.period, c.daysLeft) : null, perDayWords(o.metric, c.perDay)].filter(Boolean);
  return `${parts.join(" · ")}.`;
}

/**
 * One objective on the page. `wide`: the card spans the whole row (a lone card
 * at the end of a section) and puts its history beside the count on big screens.
 */
export function ObjectiveCard({ o, people, audienceReady, onOpen, wide = false }: { o: ObjectiveView; people: Record<string, PersonLite>; audienceReady: boolean; onOpen: () => void; wide?: boolean }) {
  const c = o.current;
  const when = useWhen();
  const shown = useCountUp(c.value);
  const reached = c.status === "reached";
  // A card that becomes reached while you're looking flashes once.
  const was = useRef(reached);
  const [won, setWon] = useState(false);
  useEffect(() => {
    if (reached && !was.current) {
      setWon(true);
      const t = setTimeout(() => setWon(false), 1700);
      was.current = reached;
      return () => clearTimeout(t);
    }
    was.current = reached;
  }, [reached]);
  // Only periods since the goal was set (with numbers) count toward "reached X of Y".
  const past = o.history.slice(0, -1).filter((p) => p.target > 0 && !unjudged(p));
  const forecast = !reached && c.forecast !== null && c.value > 0 && c.target > 0 && c.status !== "off" ? `At this pace: about ${formatAmount(o.metric, c.forecast)} ${byWhen(o.period, c.end)}.` : null;
  const unit = unitFor(o.metric, c.target || o.target, o.filters);

  return (
    <article
      className={`relative rounded-2xl border bg-surface p-4 sm:p-5 flex flex-col min-w-0 transition-shadow ${wide ? "lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-x-8" : ""} ${won ? "obj-won" : ""} ${reached ? "border-transparent" : "border-line/10"} ${o.paused ? "opacity-70" : ""}`}
      style={{ ["--glow" as string]: colorVar(o.color, 0.35), ...(reached ? { boxShadow: `inset 0 0 0 1.5px ${colorVar(o.color, 0.55)}` } : {}) }}
    >
      <div className="min-w-0">
        <header className="flex items-start gap-3">
          <ObjectiveIcon icon={o.icon} platform={o.platform} color={o.color} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-tight">
              <button type="button" onClick={onOpen} className="text-left hover:underline underline-offset-2 decoration-line/30">
                {o.title}
              </button>
            </h3>
            <p className="text-[12px] text-ink-soft leading-snug mt-0.5">{o.sentence}</p>
          </div>
          <StatusPill status={o.paused ? "off" : c.status} />
        </header>

        <div className="mt-4">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="font-display text-[34px] font-semibold leading-none tabular-nums">{formatAmount(o.metric, shown)}</span>
            <span className="text-[13px] text-ink-soft">
              of {c.target ? formatAmount(o.metric, c.target) : "no target"} {unit}
              <span className="text-ink-faint"> · {c.label.toLowerCase()}</span>
            </span>
            {reached && (
              <span className="ml-auto inline-flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: "rgb(245 197 66 / 0.22)", color: "#b8860b" }} title="Reached">
                <TrophyIcon className="w-4 h-4" />
              </span>
            )}
          </div>
          <Meter value={c.value} target={c.target} expected={reached ? null : c.expected} color={o.color} height={10} className="mt-3" />
          <p className="mt-2 text-[12.5px] text-ink-soft">{progressWords(o, when)}</p>
          {forecast && <p className="text-[12px] text-ink-faint">{forecast}</p>}
          {o.lagDays > 0 && !audienceReady && <p className="mt-1 text-[12px] text-coral">Connect an account (Team → Connected accounts) to count this.</p>}
          {!o.known && <p className="mt-1 text-[12px] text-ink-faint">Made with a newer version of the app. Refresh to see it count.</p>}
        </div>
      </div>

      {/* History and who helped: under the count (at the bottom, so cards side by side line up), or beside it on a wide card. */}
      <div className={`min-w-0 mt-auto flex flex-col ${wide ? "lg:mt-0 lg:border-l lg:border-line/10 lg:pl-8" : ""}`}>
        <div className={`mt-4 pt-4 border-t border-line/10 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 items-end ${wide ? "lg:mt-0 lg:pt-1 lg:border-t-0 lg:grid-cols-1" : ""}`}>
          <HistoryBars periods={o.history} color={o.color} kind={o.period} metric={o.metric} height={wide ? 72 : 48} />
          {/* Beside the columns, or (wide card) a line above them so the columns get the whole width. */}
          <dl className={`text-right text-[11.5px] leading-tight space-y-1 pb-4 ${wide ? "lg:order-first lg:text-left lg:pb-1 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-x-4" : ""}`}>
            {o.stats.streak > 0 && (
              <div className="flex items-center justify-end gap-1 font-semibold text-ink">
                <FlameIcon className="w-3.5 h-3.5 text-coral" />
                {o.stats.streak} in a row
              </div>
            )}
            <div className="text-ink-faint">
              Best <b className="text-ink-soft font-semibold">{formatAmount(o.metric, o.stats.best)}</b>
            </div>
            {past.length > 0 && (
              <div className="text-ink-faint">
                Reached <b className="text-ink-soft font-semibold">{past.filter((p) => p.reached).length}</b> of {past.length}
              </div>
            )}
          </dl>
        </div>

        <footer className={`mt-3 flex items-center gap-2 min-h-[28px] ${wide ? "lg:mt-auto lg:pt-3" : ""}`}>
          {c.contributors.length > 0 ? (
            <>
              <PeopleStack contributors={c.contributors} people={people} />
              <span className="text-[11.5px] text-ink-faint truncate">
                {c.contributors.length === 1 ? `${people[c.contributors[0].memberId]?.name ?? "Someone"} helped` : `${c.contributors.length} people helped`}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-ink-faint">{o.lagDays ? "From the platforms' numbers" : "Nothing counted yet"}</span>
          )}
          <button type="button" onClick={onOpen} className="ml-auto rounded-lg px-2.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Details →
          </button>
        </footer>
      </div>
    </article>
  );
}
