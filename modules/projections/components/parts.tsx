"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";
import { colorVar } from "@/modules/objectives/lib/metrics";
import type { ProjStatus } from "../lib/compute";
import { formatValue, metricOf } from "../lib/metrics";
import type { ProjectionView } from "../lib/types";

/*
 * The pieces of the Projections screens: the status pill, the two bars
 * (how far from the start to the target, how much of the time has gone),
 * the chart (each day's value, the straight line to the target, where it's
 * heading) and the words for the pace.
 */

export const STATUS: Record<ProjStatus, { label: string; cls: string }> = {
  reached: { label: "Reached", cls: "text-green bg-green/12" },
  ahead: { label: "Ahead", cls: "text-teal bg-teal/12" },
  on_track: { label: "On track", cls: "text-ink-soft bg-surface-2" },
  behind: { label: "Behind", cls: "text-coral bg-coral/12" },
  new: { label: "Just set", cls: "text-ink-soft bg-surface-2" },
  waiting: { label: "No numbers yet", cls: "text-ink-faint bg-surface-2" },
  done: { label: "Done", cls: "text-green bg-green/12" },
  missed: { label: "Ended short", cls: "text-ink-faint bg-surface-2" },
};

export function ProjStatusPill({ status, className = "" }: { status: ProjStatus; className?: string }) {
  const m = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 h-[22px] text-[11.5px] font-bold whitespace-nowrap ${m.cls} ${className}`}>
      {status === "reached" || status === "done" ? (
        <CheckIcon className="w-3 h-3" />
      ) : status === "behind" ? (
        <AlertIcon className="w-3 h-3" />
      ) : status === "ahead" ? (
        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" aria-hidden>
          <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
        </svg>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden />
      )}
      {m.label}
    </span>
  );
}

const fmtDay = (d: string, year = false) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
export { fmtDay };

/** "about 650 a day", "about 4.6K a week", "+0.4 points a week", "+3s a week", "$12 a day". */
export function paceWords(metric: string, perDay: number | null, currency?: string): string | null {
  if (perDay === null || !Number.isFinite(perDay) || perDay === 0) return null;
  const unit = metricOf(metric)?.unit ?? "count";
  const sign = perDay > 0 ? "+" : "−";
  const a = Math.abs(perDay);
  if (unit === "percent") return `${sign}${(Math.round(a * 7 * 10) / 10).toFixed(1)} pts a week`;
  if (unit === "seconds") return `${sign}${Math.max(1, Math.round(a * 7))}s a week`;
  if (unit === "per1k" || unit === "per_week" || unit === "per_month") return `${sign}${(Math.round(a * 7 * 100) / 100).toLocaleString("en-US")} a week`;
  const f = (v: number) => formatValue(metric, v, { currency });
  if (a >= 1) return `${sign}${f(a)} a day`;
  if (a * 7 >= 1) return `${sign}${f(a * 7)} a week`;
  return `${sign}${f(a * 30)} a month`;
}

/**
 * From where it started to the target: how far it's come, and (a thin
 * mark) where it should be by now if it went at an even pace.
 */
export function ProgressTrack({ p, height = 10, className = "" }: { p: ProjectionView; height?: number; className?: string }) {
  const f = p.a.progress === null ? 0 : Math.max(0, Math.min(1, p.a.progress));
  const done = p.a.status === "reached" || p.a.status === "done";
  const pace = !done && p.a.timeFraction > 0 && p.a.timeFraction < 1 ? p.a.timeFraction : null;
  return (
    <div className={`relative w-full obj-bar-in ${className}`} style={{ height }}>
      <div className="absolute inset-0 rounded-full overflow-hidden" style={{ background: colorVar(p.color, 0.16) }}>
        <div className="obj-bar-fill h-full rounded-full" style={{ width: `${f * 100}%`, background: colorVar(p.color) }} />
      </div>
      {pace !== null && (
        <span className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full bg-ink/70" style={{ left: `calc(${pace * 100}% - 1px)` }} title="Where an even pace would be by now" aria-hidden />
      )}
    </div>
  );
}

/** How much of the time has gone by, day by day. */
export function TimeTrack({ p, className = "" }: { p: ProjectionView; className?: string }) {
  const f = p.a.timeFraction;
  return (
    <div className={`relative h-1.5 w-full rounded-full bg-line/10 overflow-hidden ${className}`} aria-hidden>
      <div className="h-full rounded-full bg-ink/25 transition-[width] duration-700" style={{ width: `${f * 100}%` }} />
    </div>
  );
}

/**
 * Each day's value since it was set (solid), the even pace from the start
 * to the target (thin), where it's heading by the deadline (dashed) and the
 * target (a line across). Hover or focus for a day's value.
 */
export function ProjectionChart({ p, height = 220, axes = true, currency }: { p: ProjectionView; height?: number; axes?: boolean; currency?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const tip = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(el.clientWidth || 560);
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const day0 = Date.parse(`${p.startDay}T00:00:00Z`);
  const dayN = Date.parse(`${p.deadline}T00:00:00Z`);
  const span = Math.max(1, (dayN - day0) / 86_400_000);
  const pts = p.points.length ? p.points : p.current !== null ? [{ day: p.startDay, value: p.current }] : [];
  const start = p.startValue ?? pts[0]?.value ?? null;
  const vals = [...pts.map((x) => x.value), p.target, ...(start !== null ? [start] : []), ...(p.a.forecast !== null ? [p.a.forecast] : [])];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (!(hi > lo)) {
    hi = hi + Math.abs(hi || 1) * 0.1;
    lo = lo - Math.abs(lo || 1) * 0.1;
  }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(metricOf(p.metric)?.unit === "percent" || lo >= 0 ? 0 : -Infinity, lo - pad);
  hi = hi + pad;
  const left = axes ? 8 : 2;
  const right = axes ? 8 : 2;
  const top = axes ? 18 : 4;
  const bottom = axes ? 22 : 4;
  const iw = Math.max(10, w - left - right);
  const ih = height - top - bottom;
  const x = (day: string) => left + ((Date.parse(`${day}T00:00:00Z`) - day0) / 86_400_000 / span) * iw;
  const y = (v: number) => top + ih - ((v - lo) / (hi - lo)) * ih;
  const line = pts.map((q, i) => `${i ? "L" : "M"}${x(q.day).toFixed(1)},${y(q.value).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  const todayX = Math.min(left + iw, Math.max(left, x(p.a.daysElapsed >= p.a.daysTotal ? p.deadline : last?.day ?? p.startDay)));
  const id = useId().replace(/:/g, "");
  const fmt = (v: number) => formatValue(p.metric, v, { currency });
  const hv = hover === null ? null : pts[hover] ?? null;
  // The day with a value nearest to a point on the chart.
  const nearest = (px: number) => {
    let best = 0;
    let gap = Infinity;
    pts.forEach((q, i) => {
      const d = Math.abs(x(q.day) - px);
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    return best;
  };
  return (
    <div ref={box} className="relative">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={`${p.title}: ${p.current === null ? "no numbers yet" : fmt(p.current)} now, target ${fmt(p.target)} by ${fmtDay(p.deadline, true)}`}
        aria-describedby={hv ? tip : undefined}
        tabIndex={axes && pts.length ? 0 : undefined}
        className="block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-lg"
        // The nearest day under the pointer; ← → step through the days (focus alone shows nothing).
        onPointerMove={axes && pts.length ? (e) => setHover(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left)) : undefined}
        onPointerLeave={axes ? () => setHover(null) : undefined}
        onBlur={axes ? () => setHover(null) : undefined}
        onKeyDown={
          axes && pts.length
            ? (e) => {
                if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? pts.length) - 1));
                else if (e.key === "ArrowRight") setHover((h) => Math.min(pts.length - 1, (h ?? -1) + 1));
                else if (e.key === "Escape" && hover !== null) {
                  e.stopPropagation();
                  setHover(null);
                }
              }
            : undefined
        }
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colorVar(p.color, 0.28)} />
            <stop offset="100%" stopColor={colorVar(p.color, 0)} />
          </linearGradient>
        </defs>
        {/* The target, across. */}
        <line x1={left} x2={left + iw} y1={y(p.target)} y2={y(p.target)} stroke="rgb(var(--ink) / 0.45)" strokeWidth={1.25} strokeDasharray="2 3" />
        {axes && (
          <text x={left + iw} y={y(p.target) - 6} textAnchor="end" className="fill-ink-soft text-[10.5px] font-semibold">
            Target {fmt(p.target)}
          </text>
        )}
        {/* An even pace from the start to the target. */}
        {start !== null && <line x1={x(p.startDay)} x2={x(p.deadline)} y1={y(start)} y2={y(p.target)} stroke="rgb(var(--ink) / 0.14)" strokeWidth={1} />}
        {/* Where it's heading at this pace. */}
        {last && p.a.forecast !== null && p.a.daysLeft > 0 && (
          <line x1={x(last.day)} y1={y(last.value)} x2={x(p.deadline)} y2={y(p.a.forecast)} stroke={colorVar(p.color, 0.7)} strokeWidth={1.75} strokeDasharray="5 4" strokeLinecap="round" />
        )}
        {pts.length > 1 && <path d={`${line}L${x(last.day).toFixed(1)},${top + ih}L${x(pts[0].day).toFixed(1)},${top + ih}Z`} fill={`url(#g${id})`} />}
        {pts.length > 1 && <path d={line} fill="none" stroke={colorVar(p.color)} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
        {last && <circle cx={x(last.day)} cy={y(last.value)} r={4} fill={colorVar(p.color)} stroke="rgb(var(--surface))" strokeWidth={2} />}
        {axes && (
          <>
            <line x1={todayX} x2={todayX} y1={top} y2={top + ih} stroke="rgb(var(--line) / 0.25)" strokeWidth={1} />
            <text x={left} y={height - 6} className="fill-ink-faint text-[10.5px]">
              {fmtDay(p.startDay)}
            </text>
            <text x={left + iw} y={height - 6} textAnchor="end" className="fill-ink-faint text-[10.5px]">
              {fmtDay(p.deadline, true)}
            </text>
          </>
        )}
        {hv && <circle cx={x(hv.day)} cy={y(hv.value)} r={4.5} fill={colorVar(p.color)} stroke="rgb(var(--surface))" strokeWidth={2} pointerEvents="none" />}
      </svg>
      {hv && (
        <div
          id={tip}
          role="tooltip"
          className="absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink text-paper px-2.5 py-1.5 text-[11.5px] shadow-lg pointer-events-none"
          style={{ left: Math.max(60, Math.min(w - 60, x(hv.day))), top: y(hv.value) - 10 }}
        >
          <b className="font-semibold">{fmt(hv.value)}</b>
          <span className="opacity-75"> · {fmtDay(hv.day)}</span>
        </div>
      )}
    </div>
  );
}
