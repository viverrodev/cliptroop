"use client";

import { useCountUp } from "@/components/ui/count-up";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { colorVar } from "@/modules/objectives/lib/metrics";
import { formatValue, metricOf, unitWords } from "../lib/metrics";
import type { ProjectionView } from "../lib/types";
import { fmtDay, paceWords, ProgressTrack, ProjectionChart, ProjStatusPill, TimeTrack } from "./parts";

/** "92 days left", "last day", "ended Jan 10". */
export function leftWords(p: ProjectionView) {
  if (p.a.status === "done" || p.a.status === "missed" || p.endedAt) return `ended ${fmtDay(p.deadline, true)}`;
  const d = p.a.daysLeft;
  if (d <= 0) return "last day";
  if (d < 60) return `${d} day${d === 1 ? "" : "s"} left`;
  const weeks = Math.round(d / 7);
  return d < 180 ? `${weeks} weeks left` : `${Math.round(d / 30.4)} months left`;
}

/** The line about where it's heading. */
export function headingWords(p: ProjectionView, currency?: string): string | null {
  const fmt = (v: number) => formatValue(p.metric, v, { currency });
  const unit = unitWords(p.metric, p.target, p.scope);
  if (p.a.status === "reached") {
    const early = p.achievedAt ? Math.max(0, Math.round((Date.parse(`${p.deadline}T00:00:00Z`) - Date.parse(p.achievedAt)) / 86_400_000)) : 0;
    return `Reached${p.achievedAt ? ` on ${fmtDay(p.achievedAt.slice(0, 10))}` : ""}${early > 0 ? `, ${early} days early` : ""}.`;
  }
  if (p.a.status === "done") return `Ended on target${p.endedValue !== null ? ` at ${fmt(p.endedValue)}` : ""}.`;
  if (p.a.status === "missed") return `Ended at ${p.endedValue !== null ? fmt(p.endedValue) : p.current !== null ? fmt(p.current) : "–"} of ${fmt(p.target)}${unit ? ` ${unit}` : ""}.`;
  if (p.a.status === "waiting") return "No numbers yet: they come with the next morning's copy.";
  if (p.a.status === "new") return "Just set: the pace shows after a few days of numbers.";
  if (p.a.eta && p.a.eta <= p.deadline) {
    const early = Math.round((Date.parse(`${p.deadline}T00:00:00Z`) - Date.parse(`${p.a.eta}T00:00:00Z`)) / 86_400_000);
    return `At this pace it gets there around ${fmtDay(p.a.eta)}${early >= 7 ? `, ${Math.round(early / 7)} week${Math.round(early / 7) === 1 ? "" : "s"} early` : ""}.`;
  }
  if (p.a.forecast !== null) return `At this pace: about ${fmt(p.a.forecast)}${unit ? ` ${unit}` : ""} by ${fmtDay(p.deadline)}.`;
  return null;
}

/** "Needs +650 a day from now." */
export function needWords(p: ProjectionView, currency?: string): string | null {
  if (p.a.status === "reached" || p.a.status === "done" || p.a.status === "missed" || p.a.status === "waiting") return null;
  const w = paceWords(p.metric, p.a.needPerDay, currency);
  return w ? `Needs ${w} from now.` : null;
}

export function ProjectionCard({ p, currency, onOpen, onCompare }: { p: ProjectionView; currency: string; onOpen: () => void; onCompare: () => void }) {
  // Counts up for whole numbers (a rate or a duration just shows).
  const whole = p.current !== null && Number.isInteger(p.current) && metricOf(p.metric)?.unit === "count";
  const shown = useCountUp(whole ? (p.current as number) : 0);
  const fmt = (v: number) => formatValue(p.metric, v, { currency });
  const unit = unitWords(p.metric, p.target, p.scope);
  const reached = p.a.status === "reached" || p.a.status === "done";
  const pct = p.a.progress === null ? null : Math.round(Math.max(0, p.a.progress) * 100);
  const heading = headingWords(p, currency);
  const need = needWords(p, currency);
  return (
    <article
      className={`relative rounded-2xl border bg-surface p-4 sm:p-5 flex flex-col min-w-0 transition-shadow ${reached ? "border-transparent" : "border-line/10"} ${p.archived ? "opacity-70" : ""}`}
      style={reached ? { boxShadow: `inset 0 0 0 1.5px ${colorVar(p.color, 0.55)}` } : undefined}
    >
      <header className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: colorVar(p.color, 0.14), color: colorVar(p.color) }} aria-hidden>
          {p.platform ? (
            <PlatformIcon platform={p.platform} className="w-[18px] h-[18px] rounded-[5px]" />
          ) : (
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight">
            <button type="button" onClick={onOpen} className="text-left hover:underline underline-offset-2 decoration-line/30">
              {p.title}
            </button>
          </h3>
          <p className="text-[12px] text-ink-soft leading-snug mt-0.5">{p.sentence}</p>
        </div>
        <ProjStatusPill status={p.a.status} />
      </header>

      <div className="mt-4">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="font-display text-[32px] font-semibold leading-none tabular-nums">{p.current === null ? "–" : fmt(whole ? shown : p.current)}</span>
          <span className="text-[13px] text-ink-soft">
            of {fmt(p.target)}
            {unit ? ` ${unit}` : ""}
          </span>
          {pct !== null && !reached && <span className="ml-auto text-[12px] font-semibold text-ink-soft tabular-nums">{Math.min(100, pct)}% of the way</span>}
        </div>
        <ProgressTrack p={p} className="mt-3" />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-faint tabular-nums">
          <span>Started at {p.startValue === null ? "–" : fmt(p.startValue)}</span>
          <span>{fmtDay(p.deadline, true)}</span>
        </div>
        {heading && <p className="mt-2 text-[12.5px] text-ink-soft">{heading}</p>}
        {need && <p className="text-[12px] text-ink-faint">{need}</p>}
      </div>

      <div className="mt-3 -mx-1">
        <ProjectionChart p={p} height={64} axes={false} currency={currency} />
      </div>

      <footer className="mt-3 pt-3 border-t border-line/10 flex items-center gap-2 min-h-[28px]">
        <div className="min-w-0 flex-1">
          <TimeTrack p={p} />
          <span className="mt-1 block text-[11.5px] text-ink-faint">
            Day {Math.min(p.a.daysElapsed + 1, p.a.daysTotal)} of {p.a.daysTotal} · {leftWords(p)}
          </span>
        </div>
        <button type="button" onClick={onCompare} className="rounded-lg border border-line/15 px-2.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
          Compare
        </button>
        <button type="button" onClick={onOpen} className="rounded-lg px-2.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          Details →
        </button>
      </footer>
    </article>
  );
}
