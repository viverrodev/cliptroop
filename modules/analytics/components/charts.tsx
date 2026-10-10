"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/*
 * Small SVG charts for Analytics (no chart library). Rules followed:
 * 2px lines, ≤24px bars with a 4px rounded end and a 2px gap between
 * stacked parts, hairline grid, one y-axis, legend for 2+ series, text in
 * text colours (the coloured mark beside it carries identity), a crosshair
 * tooltip on lines and a per-column tooltip on bars, keyboard too.
 */

export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : Math.round(n).toLocaleString("en-US"));
export function fmtCompact(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

/** Clean axis maximum and ticks (0, 1K, 2K…). */
function niceScale(max: number, count = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  // From 1 up, steps are whole numbers (counts never get "2.5" or "0.5" ticks).
  const whole = (s: number) => max < 1 || Number.isInteger(Math.round(s * 1e9) / 1e9);
  const step = Math.max(max >= 1 ? 1 : 0, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && whole(s)) ?? 10 * mag);
  const top = Math.round(Math.ceil(max / step) * step * 1e6) / 1e6;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max: top, ticks };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type Series = { key: string; label: string; color: string; values: (number | null)[] };

/** Legend: a short line (lines) or a swatch (bars) + the name, in text colour. */
export function Legend({ items, shape = "line" }: { items: { key: string; label: string; color: string; dashed?: boolean }[]; shape?: "line" | "rect" }) {
  if (items.length < 2) return null;
  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px] text-ink-soft" role="list">
      {items.map((s) => (
        <span key={s.key} role="listitem" className="inline-flex items-center gap-1.5">
          {shape === "line" ? (
            s.dashed ? (
              <svg width="16" height="2" aria-hidden className="overflow-visible">
                <line x1="1" x2="15" y1="1" y2="1" stroke={s.color} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
              </svg>
            ) : (
              <span className="w-4 h-[2px] rounded-full" style={{ background: s.color }} aria-hidden />
            )
          ) : (
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          )}
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  // Keeps inside the chart: flips to the left of the pointer near the right edge.
  const left = x > width - 190 ? Math.max(0, x - 180) : x + 12;
  return (
    <div className="pointer-events-none absolute z-10 min-w-[150px] max-w-[220px] rounded-xl border border-line/15 bg-surface shadow-xl px-3 py-2 text-[12px]" style={{ left, top: Math.max(0, y) }}>
      {children}
    </div>
  );
}

/**
 * Lines over time: one per series (+ an optional grey "previous period"
 * line). Crosshair + tooltip on hover/focus, ← → keys move it.
 */
export function LineChart({
  labels,
  series,
  previous,
  format = fmtCompact,
  height = 240,
  ariaLabel,
  onPick,
  pickHint = "Click for this day's videos",
}: {
  labels: string[];
  series: Series[];
  previous?: { label: string; values: (number | null)[] } | null;
  format?: (n: number | null) => string;
  height?: number;
  ariaLabel: string;
  /** Click (or Enter on) a point: its index (e.g. to open that day's videos). */
  onPick?: (index: number) => void;
  pickHint?: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const all = [...series.flatMap((s) => s.values), ...(previous?.values ?? [])].filter((v): v is number => v !== null);
  const { max, ticks } = niceScale(Math.max(0, ...all));
  const left = Math.max(32, String(format(max)).length * 7 + 10);
  const right = 14;
  const top = 10;
  const bottom = 26;
  const iw = Math.max(10, width - left - right);
  const ih = height - top - bottom;
  const x = (i: number) => left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => top + ih - (v / max) * ih;
  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const indexAt = (clientX: number, el: SVGElement) => {
    const r = el.getBoundingClientRect();
    const px = clientX - r.left;
    return Math.max(0, Math.min(n - 1, Math.round(((px - left) / iw) * (n - 1))));
  };
  const pick = (clientX: number, el: SVGElement) => setHover(indexAt(clientX, el));
  return (
    <div ref={box} className="relative select-none">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className={`block outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-lg ${onPick ? "cursor-pointer" : ""}`}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onClick={onPick ? (e) => onPick(indexAt(e.clientX, e.currentTarget)) : undefined}
          onFocus={() => setHover((h) => h ?? n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
            if (onPick && (e.key === "Enter" || e.key === " ") && hover !== null) {
              e.preventDefault();
              onPick(hover);
            }
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + iw} y1={y(t)} y2={y(t)} stroke="rgb(var(--line) / 0.08)" strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[10.5px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % step === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-ink-faint text-[10.5px]">
                {i === n - 1 || n - 1 - i >= step * 0.6 ? l : ""}
              </text>
            ) : null
          )}
          {previous && <path d={path(previous.values)} fill="none" stroke="rgb(var(--ink-faint) / 0.7)" strokeWidth={1.5} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />}
          {series.map((s) => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {/* A lone point (one day of data) still shows. */}
          {series.map((s) =>
            s.values.map((v, i) => (v !== null && (s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null ? <circle key={`${s.key}${i}`} cx={x(i)} cy={y(v)} r={3} fill={s.color} /> : null))
          )}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + ih} stroke="rgb(var(--line) / 0.25)" strokeWidth={1} />
              {series.map((s) =>
                s.values[hover] !== null ? <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="rgb(var(--surface))" strokeWidth={2} /> : null
              )}
            </g>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={x(hover)} y={top} width={width}>
          <div className="text-[11px] font-semibold text-ink-faint mb-1">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 py-0.5">
              <span className="w-3 h-[2px] rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="font-bold tabular-nums text-ink">{format(s.values[hover])}</span>
              <span className="text-ink-soft truncate">{s.label}</span>
            </div>
          ))}
          {previous && (
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-3 h-[2px] rounded-full flex-shrink-0 bg-ink-faint/60" />
              <span className="font-bold tabular-nums text-ink">{format(previous.values[hover] ?? null)}</span>
              <span className="text-ink-soft truncate">{previous.label}</span>
            </div>
          )}
          {onPick && <div className="mt-1 pt-1 border-t border-line/10 text-[10.5px] text-ink-faint">{pickHint}</div>}
        </Tooltip>
      )}
    </div>
  );
}

/** Stacked columns (e.g. shorts + long videos per week). Hover/focus a column for its numbers. */
export function StackedColumns({
  labels,
  series,
  format = fmtInt,
  height = 220,
  ariaLabel,
}: {
  labels: string[];
  series: { key: string; label: string; color: string; values: number[] }[];
  format?: (n: number | null) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const { max, ticks } = niceScale(Math.max(1, ...totals));
  const left = Math.max(28, String(format(max)).length * 7 + 10);
  const top = 10;
  const bottom = 26;
  const iw = Math.max(10, width - left - 8);
  const ih = height - top - bottom;
  const slot = iw / Math.max(1, n);
  const bw = Math.max(3, Math.min(24, slot * 0.62));
  const y = (v: number) => top + ih - (v / max) * ih;
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  const GAP = 2;
  const R = 4;
  return (
    <div ref={box} className="relative select-none">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + iw} y1={y(t)} y2={y(t)} stroke="rgb(var(--line) / 0.08)" strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[10.5px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const cx = left + slot * i + slot / 2;
            let base = top + ih;
            const segs = series
              .map((s) => ({ s, v: s.values[i] ?? 0 }))
              .filter((x) => x.v > 0);
            return (
              <g
                key={i}
                tabIndex={0}
                role="img"
                aria-label={`${l}: ${series.map((s) => `${s.label} ${format(s.values[i] ?? 0)}`).join(", ")}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                <rect x={cx - slot / 2} y={top} width={slot} height={ih} fill={hover === i ? "rgb(var(--line) / 0.04)" : "transparent"} />
                {segs.map(({ s, v }, k) => {
                  const h = Math.max(1, (v / max) * ih - (k ? GAP : 0));
                  const yTop = base - h;
                  const isTop = k === segs.length - 1;
                  const r = isTop ? Math.min(R, h, bw / 2) : 0;
                  const x0 = cx - bw / 2;
                  const d = `M${x0},${base}V${yTop + r}${r ? `Q${x0},${yTop} ${x0 + r},${yTop}` : ""}H${x0 + bw - r}${r ? `Q${x0 + bw},${yTop} ${x0 + bw},${yTop + r}` : ""}V${base}Z`;
                  base = yTop - GAP;
                  return <path key={s.key} d={d} fill={s.color} />;
                })}
                {(i === n - 1 || (i % step === 0 && n - 1 - i >= step * 0.6)) && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-ink-faint text-[10.5px]">
                    {l}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={left + slot * hover + slot / 2} y={top} width={width}>
          <div className="text-[11px] font-semibold text-ink-faint mb-1">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 py-0.5">
              <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: s.color }} />
              <span className="font-bold tabular-nums text-ink">{format(s.values[hover] ?? 0)}</span>
              <span className="text-ink-soft">{s.label}</span>
            </div>
          ))}
          {series.length > 1 && <div className="mt-1 pt-1 border-t border-line/10 text-ink-soft">Total <b className="text-ink tabular-nums">{format(totals[hover])}</b></div>}
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal bars with the value at the tip (one colour: the bars are compared by length). */
export function BarList({
  items,
  format = fmtInt,
  color = "rgb(var(--amber))",
  empty = "No data yet.",
  onHover,
  active,
}: {
  items: { key: string; label: React.ReactNode; value: number | null; sub?: string; color?: string }[];
  format?: (n: number | null) => string;
  color?: string;
  empty?: string;
  /** Pointing at a row (e.g. turns the globe to that country). */
  onHover?: (key: string | null) => void;
  /** A row to show as highlighted (e.g. the country hovered on the map). */
  active?: string | null;
}) {
  const max = Math.max(0, ...items.map((i) => i.value ?? 0));
  if (!items.length) return <p className="text-[13px] text-ink-faint">{empty}</p>;
  return (
    <ul className="space-y-2" onMouseLeave={onHover ? () => onHover(null) : undefined}>
      {items.map((it) => (
        <li
          key={it.key}
          onMouseEnter={onHover ? () => onHover(it.key) : undefined}
          className={`grid grid-cols-[minmax(6rem,9rem)_1fr] sm:grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-3 rounded-md transition-colors ${onHover ? "-mx-1.5 px-1.5 py-0.5 hover:bg-surface-2" : ""} ${active === it.key ? "bg-surface-2" : ""}`}
        >
          <span className="text-[13px] text-ink-soft truncate">{it.label}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="flex-1 min-w-0 h-2.5 rounded-full bg-line/[0.06] overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${max ? Math.max(2, ((it.value ?? 0) / max) * 100) : 0}%`, background: it.color ?? color, opacity: it.value === null ? 0 : 1 }} />
            </span>
            <span className="w-14 text-right text-[12.5px] font-semibold tabular-nums text-ink flex-shrink-0">{format(it.value)}</span>
          </span>
          {it.sub && <span className="col-start-2 -mt-1.5 text-[11px] text-ink-faint">{it.sub}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * A headline number with its change vs the previous period. `good`:
 * which direction is good news (colours the change; an arrow + sign carry it too).
 */
export function StatTile({
  label,
  value,
  prev,
  format = fmtCompact,
  good = "up",
  unit = "",
  compare = true,
  hint,
  deltaMode = "percent",
  className = "",
}: {
  className?: string;
  label: string;
  value: number | null;
  prev?: number | null;
  format?: (n: number | null) => string;
  good?: "up" | "down" | "none";
  unit?: string;
  compare?: boolean;
  hint?: string;
  /** "points" for percentages (62% → 70% = +8 pts). */
  deltaMode?: "percent" | "points" | "absolute";
}) {
  const delta = useMemo(() => {
    if (!compare || value === null || prev === null || prev === undefined) return null;
    if (deltaMode === "points" || deltaMode === "absolute") return value - prev;
    if (prev === 0) return value === 0 ? 0 : null;
    const pct = ((value - prev) / Math.abs(prev)) * 100;
    // Rounds to 0.0%: no change worth an arrow or a colour.
    return Math.abs(pct) < 0.05 ? 0 : pct;
  }, [compare, value, prev, deltaMode]);
  const tone = delta === null || delta === 0 || good === "none" ? "text-ink-soft bg-surface-2" : (delta > 0) === (good === "up") ? "text-green bg-green/10" : "text-red bg-red/10";
  const deltaText =
    delta === null
      ? null
      : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${deltaMode === "points" ? `${Math.abs(Math.round(delta))} pts` : deltaMode === "absolute" ? `${Math.abs(Math.round(delta * 10) / 10)}${unit}` : `${Math.abs(delta) >= 10 ? Math.round(Math.abs(delta)) : Math.abs(delta).toFixed(1)}%`}`;
  return (
    <div className={`rounded-2xl border border-line/10 bg-surface p-4 min-w-0 ${className}`}>
      <div className="text-[12.5px] text-ink-soft truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-[28px] font-semibold leading-none">{format(value)}</span>
        {value !== null && unit && <span className="text-[14px] font-semibold text-ink-soft">{unit}</span>}
      </div>
      <div className="mt-2 min-h-[20px] flex items-center gap-1.5 flex-wrap">
        {deltaText && (
          <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 h-5 text-[11.5px] font-bold ${tone}`}>
            {delta! !== 0 && (
              <svg viewBox="0 0 10 10" className={`w-2.5 h-2.5 ${delta! < 0 ? "rotate-180" : ""}`} aria-hidden>
                <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
              </svg>
            )}
            {deltaText}
          </span>
        )}
        {compare && prev !== null && prev !== undefined && <span className="text-[11.5px] text-ink-faint">vs {format(prev)}{prev !== null && unit ? unit : ""}</span>}
        {hint && <span className="text-[11.5px] text-ink-faint">{hint}</span>}
      </div>
    </div>
  );
}

/** A card around a chart: title (what's plotted), optional legend/actions, then the chart. */
export function ChartCard({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0 ${className}`}>
      {/* The title keeps at least ~13rem; when the controls don't fit beside it, they drop below (phones). */}
      <div className="flex items-start gap-x-3 gap-y-2.5 mb-3 flex-wrap">
        <div className="flex-1 basis-52 min-w-0">
          <h2 className="text-[14.5px] font-semibold">{title}</h2>
          {sub && <p className="text-[12px] text-ink-faint mt-0.5">{sub}</p>}
        </div>
        {right && <div className="max-w-full min-w-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}
