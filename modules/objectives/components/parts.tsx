"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertIcon, ApprovedIcon, CameraIcon, CheckIcon, ClockIcon, EyeIcon, HeartIcon, LightbulbIcon, PostingIcon, ScissorsIcon, ShortsIcon, UsersIcon, VideoIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import type { Platform } from "@/modules/short-videos/lib/constants";
import { colorVar, formatAmount, type IconKind } from "../lib/metrics";
import { periodTick, type PeriodKind } from "../lib/periods";
import type { Contributor, PeriodView, PersonLite, Status } from "../lib/types";

/*
 * The pieces every objectives screen is made of (page, widget, Team tab,
 * celebration): the icon tile, the status pill, the rings, the pace meter,
 * the history columns and the people who helped. Colours: the objective's
 * own (--obj-* tokens), text always in text colours beside the coloured mark.
 */

const ICONS: Record<IconKind, (p: { className?: string }) => React.ReactElement> = {
  short: ShortsIcon,
  long: VideoIcon,
  post: PostingIcon,
  idea: LightbulbIcon,
  edit: ScissorsIcon,
  approve: ApprovedIcon,
  film: CameraIcon,
  views: EyeIcon,
  followers: UsersIcon,
  likes: HeartIcon,
  watch: ClockIcon,
};

/** The objective's tile: its icon (or its one platform's logo) on a tint of its colour. */
export function ObjectiveIcon({ icon, platform, color, size = "md" }: { icon: IconKind; platform?: Platform | null; color: string; size?: "sm" | "md" | "lg" }) {
  const Icon = ICONS[icon] ?? PostingIcon;
  const box = size === "sm" ? "w-6 h-6 rounded-md" : size === "lg" ? "w-11 h-11 rounded-xl" : "w-8 h-8 rounded-lg";
  const inner = size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-6 h-6" : "w-[18px] h-[18px]";
  return (
    <span className={`${box} flex-shrink-0 flex items-center justify-center`} style={{ background: colorVar(color, 0.14), color: colorVar(color) }} aria-hidden>
      {platform ? <PlatformIcon platform={platform} className={`${inner} rounded-[5px]`} /> : <Icon className={inner} />}
    </span>
  );
}

export const STATUS_META: Record<Status, { label: string; cls: string }> = {
  reached: { label: "Reached", cls: "text-green bg-green/12" },
  ahead: { label: "Ahead", cls: "text-teal bg-teal/12" },
  on_track: { label: "On track", cls: "text-ink-soft bg-surface-2" },
  behind: { label: "Behind", cls: "text-coral bg-coral/12" },
  missed: { label: "Missed", cls: "text-ink-faint bg-surface-2" },
  off: { label: "Off", cls: "text-ink-faint bg-surface-2" },
  upcoming: { label: "Not started", cls: "text-ink-faint bg-surface-2" },
  before: { label: "Before this goal", cls: "text-ink-faint bg-surface-2" },
  nodata: { label: "No numbers", cls: "text-ink-faint bg-surface-2" },
};

/** A period that isn't judged: from before the goal was set, or without any numbers. */
export const unjudged = (p: Pick<PeriodView, "status">) => p.status === "before" || p.status === "nodata";

/** Reached / Ahead / On track / Behind / Missed / Off, always with an icon or dot (never colour alone). */
export function StatusPill({ status, className = "" }: { status: Status; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 h-[22px] text-[11.5px] font-bold whitespace-nowrap ${m.cls} ${className}`}>
      {status === "reached" ? (
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

export type Ring = { key: string; color: string; value: number; target: number; label: string };

/**
 * Concentric progress rings, outermost first (one per objective). They fill
 * in when they appear and glide to new values; a reached ring glows once and
 * gets a tick at the top. `children` sits in the middle, when the middle is
 * at least `minHole` px across (tiny rings show just the rings).
 */
export function Rings({ rings, size, stroke, gap, minHole = 30, children, className = "" }: { rings: Ring[]; size: number; stroke?: number; gap?: number; minHole?: number; children?: React.ReactNode; className?: string }) {
  const n = Math.max(1, rings.length);
  // Thick enough to read as rings, thin enough to leave the middle for the count.
  const sw = stroke ?? Math.max(5, Math.min(16, Math.round(size / (n * 2 + 7))));
  const g = gap ?? Math.max(2, Math.round(sw * 0.25));
  const hole = size - 2 * n * sw - 2 * (n - 1) * g;
  const reachedBefore = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // A ring that becomes reached while you're looking glows once.
  useEffect(() => {
    const now = new Set(rings.filter((r) => r.target > 0 && r.value >= r.target).map((r) => r.key));
    if (reachedBefore.current) {
      const newly = [...now].filter((k) => !reachedBefore.current!.has(k));
      if (newly.length) {
        setFresh(new Set(newly));
        const t = setTimeout(() => setFresh(new Set()), 2600);
        reachedBefore.current = now;
        return () => clearTimeout(t);
      }
    }
    reachedBefore.current = now;
  }, [rings]);

  const label = rings.map((r) => r.label).join(". ");
  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} className="obj-ring-in block -rotate-90">
        {rings.map((r, i) => {
          const radius = size / 2 - sw / 2 - i * (sw + g);
          if (radius <= sw / 2) return null;
          const c = 2 * Math.PI * radius;
          const f = r.target > 0 ? Math.max(0, Math.min(1, r.value / r.target)) : 0;
          const done = r.target > 0 && r.value >= r.target;
          return (
            <g key={r.key} className={fresh.has(r.key) ? "obj-ring-done" : undefined} style={{ ["--glow" as string]: colorVar(r.color) }}>
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colorVar(r.color, 0.16)} strokeWidth={sw} />
              {f > 0 && (
                <circle
                  className="obj-ring-arc"
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={colorVar(r.color)}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - f)}
                  style={{ ["--c" as string]: c, ["--d" as string]: `${i * 110}ms` }}
                />
              )}
              {done && sw >= 9 && (
                <g transform={`rotate(90 ${size / 2} ${size / 2})`}>
                  <g className="obj-tick" style={{ ["--d" as string]: `${700 + i * 110}ms`, transformBox: "fill-box", transformOrigin: "center" }}>
                    <circle cx={size / 2} cy={size / 2 - radius} r={sw / 2 - 0.5} fill={colorVar(r.color)} />
                    <path
                      d={`M${size / 2 - sw * 0.22} ${size / 2 - radius + 0.2} l${sw * 0.15} ${sw * 0.15} l${sw * 0.27} -${sw * 0.3}`}
                      fill="none"
                      stroke="white"
                      strokeWidth={Math.max(1.4, sw * 0.14)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {children && hole >= minHole && <div className="absolute inset-0 flex items-center justify-center text-center pointer-events-none">{children}</div>}
    </div>
  );
}

/**
 * The pace meter: the count so far, and a thin mark where it should be by
 * now to reach the target on the last day.
 */
export function Meter({ value, target, expected, color, height = 10, className = "" }: { value: number; target: number; expected?: number | null; color: string; height?: number; className?: string }) {
  const f = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  const pace = target > 0 && expected !== null && expected !== undefined && expected > 0 && expected < target ? expected / target : null;
  return (
    <div className={`relative w-full obj-bar-in ${className}`} style={{ height }}>
      <div className="absolute inset-0 rounded-full overflow-hidden" style={{ background: colorVar(color, 0.16) }}>
        <div className="obj-bar-fill h-full rounded-full" style={{ width: `${f * 100}%`, background: colorVar(color) }} />
      </div>
      {pace !== null && (
        <span
          className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full bg-ink/70"
          style={{ left: `calc(${pace * 100}% - 1px)` }}
          title="Where it should be by now"
          aria-hidden
        />
      )}
    </div>
  );
}

/**
 * One column per period, oldest first, the current one last. Each column has
 * a short line at its own target (targets can change week to week); reached
 * columns are solid, missed ones faint, the current one half-solid. Hover or
 * focus a column for its numbers.
 */
export function HistoryBars({
  periods,
  color,
  kind,
  metric,
  height = 64,
  ticks = true,
  className = "",
}: {
  periods: PeriodView[];
  color: string;
  kind: PeriodKind;
  metric: string;
  height?: number;
  ticks?: boolean;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(280);
  const [hover, setHover] = useState<number | null>(null);
  const tipId = useId();
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setW(el.clientWidth || 280);
    const ro = new ResizeObserver(([e]) => setW(Math.max(80, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!periods.length) return null;
  const n = periods.length;
  // Periods that aren't judged keep their columns (what happened then) but not their target lines.
  const top = Math.max(1, ...periods.map((p) => Math.max(p.value, unjudged(p) ? 0 : p.target))) * 1.08;
  const slot = w / n;
  const bw = Math.max(3, Math.min(24, slot * 0.62));
  const H = height;
  const y = (v: number) => H - (Math.max(0, v) / top) * (H - 4);
  const p = hover === null ? null : periods[hover];
  // Where the goal was set: the first judged column after ones from before it.
  const setAt = periods.findIndex((x) => x.status !== "before");
  const words = (x: PeriodView) =>
    x.status === "before"
      ? `${x.label}: ${formatAmount(metric, x.value)} (before this goal)`
      : x.status === "nodata"
        ? `${x.label}: no numbers`
        : `${x.label}: ${formatAmount(metric, x.value)} of ${formatAmount(metric, x.target)}${x.target === 0 ? " (off)" : x.reached ? ", reached" : x.status === "missed" ? ", missed" : ""}`;
  return (
    <div ref={wrap} className={`relative ${className}`}>
      <svg width="100%" height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={periods.map(words).join(". ")} className="block overflow-visible">
        <line x1={0} x2={w} y1={H - 0.5} y2={H - 0.5} stroke="rgb(var(--line) / 0.15)" strokeWidth={1} />
        {setAt > 0 && (
          <line x1={slot * setAt + 0.5} x2={slot * setAt + 0.5} y1={2} y2={H - 1} stroke="rgb(var(--ink) / 0.28)" strokeWidth={1} strokeDasharray="3 3">
            <title>Goal set</title>
          </line>
        )}
        {periods.map((x, i) => {
          const cx = slot * i + slot / 2;
          const current = i === n - 1;
          const vy = y(x.value);
          const h = Math.max(x.value > 0 ? 3 : 0, H - vy);
          const opacity = unjudged(x) ? 0.16 : x.target === 0 ? 0.25 : x.reached ? 1 : current ? 0.6 : 0.32;
          const r = Math.min(4, bw / 2, h);
          return (
            <g
              key={x.start}
              tabIndex={0}
              aria-describedby={hover === i ? tipId : undefined}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((c) => (c === i ? null : c))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((c) => (c === i ? null : c))}
              className="outline-none cursor-default"
            >
              <rect x={slot * i + 1} y={0} width={Math.max(0, slot - 2)} height={H} rx={4} fill={hover === i ? "rgb(var(--line) / 0.06)" : "transparent"} />
              {h > 0 && (
                <path
                  className="obj-col"
                  d={`M${cx - bw / 2} ${H} V${H - h + r} Q${cx - bw / 2} ${H - h} ${cx - bw / 2 + r} ${H - h} H${cx + bw / 2 - r} Q${cx + bw / 2} ${H - h} ${cx + bw / 2} ${H - h + r} V${H} Z`}
                  fill={colorVar(color)}
                  fillOpacity={hover === i ? Math.min(1, opacity + 0.2) : opacity}
                />
              )}
              {x.target > 0 && !unjudged(x) && <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={y(x.target) + 0.5} y2={y(x.target) + 0.5} stroke="rgb(var(--ink) / 0.55)" strokeWidth={1.5} strokeLinecap="round" />}
              {x.reached && bw >= 10 && h >= 14 && (
                <path d={`M${cx - 3} ${H - h + 7} l2.2 2.2 l4 -4.4`} fill="none" stroke="white" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              )}
            </g>
          );
        })}
      </svg>
      {ticks && (
        <div className="flex justify-between mt-1 text-[10.5px] text-ink-faint tabular-nums" aria-hidden>
          <span>{periodTick(kind, periods[0].start)}</span>
          <span>{periods.length > 1 ? (kind === "day" ? "Today" : "Now") : ""}</span>
        </div>
      )}
      {p && (
        <div
          id={tipId}
          role="tooltip"
          className="absolute z-10 -top-2 -translate-y-full -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink text-paper px-2.5 py-1.5 text-[11.5px] shadow-lg pointer-events-none"
          style={{ left: Math.max(70, Math.min(w - 70, slot * (hover as number) + slot / 2)) }}
        >
          {p.status === "nodata" ? (
            <>
              <b className="font-semibold">No numbers</b>
              <span className="opacity-75"> · {p.label}</span>
            </>
          ) : p.status === "before" ? (
            <>
              <b className="font-semibold">{formatAmount(metric, p.value)}</b>
              <span className="opacity-75"> · {p.label} · before this goal</span>
            </>
          ) : (
            <>
              <b className="font-semibold">{formatAmount(metric, p.value)}</b>
              <span className="opacity-75"> of {formatAmount(metric, p.target)} · {p.label}</span>
              {p.target === 0 ? <span className="opacity-75"> · off</span> : p.reached ? <span className="text-[#7ee2a8]"> · reached</span> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Who helped: overlapping avatars (most first) with their count; "+N" for the rest. */
export function PeopleStack({ contributors, people, max = 5, size = "w-6 h-6 text-[9.5px]" }: { contributors: Contributor[]; people: Record<string, PersonLite>; max?: number; size?: string }) {
  const shown = contributors.filter((c) => people[c.memberId]).slice(0, max);
  const rest = contributors.length - shown.length;
  if (!shown.length) return null;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((c) => {
        const p = people[c.memberId];
        return (
          <span key={c.memberId} title={`${p.name}: ${c.count}`} className="rounded-full ring-2 ring-surface">
            <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className={size} />
          </span>
        );
      })}
      {rest > 0 && <span className={`${size} rounded-full ring-2 ring-surface bg-surface-2 text-ink-soft font-bold flex items-center justify-center`}>+{rest}</span>}
    </span>
  );
}

/** "Thu 15:02" in this device's zone, once the page is live (the server renders the day only). */
export function useWhen() {
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  return (iso: string | null, day: string | null) => {
    if (iso && live) return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    const d = day ?? (iso ? iso.slice(0, 10) : null);
    return d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";
  };
}
