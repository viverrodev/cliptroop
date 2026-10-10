"use client";

import { Dialog } from "@/components/ui/dialog";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { colorVar } from "@/modules/objectives/lib/metrics";
import { COMPARE_MONEY, COMPARE_SET, formatValue, metricOf, platformName, unitWords } from "../lib/metrics";
import type { Baseline, ProjectionView } from "../lib/types";
import { fmtDay } from "./parts";

/*
 * Compare: the channel's key numbers the day a projection was set, next to
 * the same numbers now, with how much each moved (green when it moved the
 * good way, coral when not). The projection's own number comes first.
 */

type Row = { key: string; label: string; metric: string; then: number | null; now: number | null };

function change(metric: string, then: number | null, now: number | null, currency: string) {
  if (then === null || now === null) return null;
  const d = now - then;
  const unit = metricOf(metric)?.unit;
  const abs =
    unit === "percent" ? `${d >= 0 ? "+" : "−"}${(Math.round(Math.abs(d) * 10) / 10).toLocaleString("en-US")} pts` : `${d >= 0 ? "+" : "−"}${formatValue(metric, Math.abs(d), { currency })}`;
  const rel = then !== 0 && unit !== "percent" ? Math.round((d / Math.abs(then)) * 100) : null;
  const dir = metricOf(metric)?.dir ?? "up";
  const good = d === 0 ? null : dir === "up" ? d > 0 : d < 0;
  return { abs, rel, good, d };
}

function Delta({ metric, then, now, currency }: { metric: string; then: number | null; now: number | null; currency: string }) {
  const c = change(metric, then, now, currency);
  if (!c) return <span className="text-ink-faint">–</span>;
  if (c.d === 0) return <span className="text-ink-faint">no change</span>;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${c.good ? "text-green" : "text-coral"}`}>
      <svg viewBox="0 0 10 10" className={`w-2.5 h-2.5 ${c.d < 0 ? "rotate-180" : ""}`} aria-hidden>
        <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
      </svg>
      {c.abs}
      {c.rel !== null && <span className="font-medium opacity-80">({c.rel > 0 ? "+" : ""}{c.rel}%)</span>}
    </span>
  );
}

export function CompareDialog({ p, now, money, currency, onClose }: { p: ProjectionView | null; now: Baseline; money: boolean; currency: string; onClose: () => void }) {
  if (!p) return null;
  const then = p.baseline;
  const since = then.at ? then.at.slice(0, 10) : p.startDay;
  const days = Math.max(0, Math.round((Date.now() - Date.parse(`${since}T00:00:00Z`)) / 86_400_000));
  const rows: Row[] = [...COMPARE_SET, ...(p.money && money ? COMPARE_MONEY : [])]
    .map((c) => ({ key: c.key, label: c.label, metric: c.metric, then: then.values[c.key] ?? null, now: now.values[c.key] ?? null }))
    .filter((r) => r.then !== null || r.now !== null);
  const platforms = (["youtube", "instagram", "tiktok", "facebook"] as const).filter((x) => (then.followers[x] ?? null) !== null || (now.followers[x] ?? null) !== null);
  const fmt = (metric: string, v: number | null) => (v === null ? "–" : formatValue(metric, v, { currency }));
  const unit = unitWords(p.metric, p.target, p.scope);
  return (
    <Dialog open onClose={onClose} title={`Compare: ${p.title}`} description={`The day it was set (${fmtDay(since, true)}, ${days} day${days === 1 ? "" : "s"} ago) next to now.`} width="sm:max-w-2xl">
      <div className="space-y-5">
        {/* Its own number first. */}
        <section className="rounded-2xl border p-4" style={{ borderColor: colorVar(p.color, 0.35), background: colorVar(p.color, 0.06) }}>
          <div className="text-[12px] font-semibold text-ink-soft">{p.label}</div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="font-display text-[22px] font-semibold tabular-nums text-ink-soft">{fmt(p.metric, p.startValue)}</span>
            <span className="text-ink-faint" aria-hidden>
              →
            </span>
            <span className="font-display text-[28px] font-semibold tabular-nums">{fmt(p.metric, p.current)}</span>
            {unit && <span className="text-[13px] text-ink-soft">{unit}</span>}
            <span className="ml-auto text-[13px]">
              <Delta metric={p.metric} then={p.startValue} now={p.current} currency={currency} />
            </span>
          </div>
          <p className="mt-1 text-[12px] text-ink-faint">
            Target {fmt(p.metric, p.target)} by {fmtDay(p.deadline, true)}
            {p.a.progress !== null ? ` · ${Math.round(Math.max(0, p.a.progress) * 100)}% of the way` : ""}
          </p>
        </section>

        {platforms.length > 0 && (
          <section>
            <h3 className="text-[13px] font-semibold mb-2">Followers by platform</h3>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              {platforms.map((x) => (
                <div key={x} className="rounded-xl border border-line/10 bg-surface-2/40 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft">
                    <PlatformIcon platform={x} className="w-4 h-4 rounded" />
                    {platformName(x)}
                  </div>
                  <div className="mt-0.5 font-display text-[18px] font-semibold tabular-nums">{fmt("followers", now.followers[x] ?? null)}</div>
                  <div className="text-[11px]">
                    <Delta metric="followers" then={then.followers[x] ?? null} now={now.followers[x] ?? null} currency={currency} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-[13px] font-semibold mb-2">Everything else</h3>
          {rows.length ? (
            <div className="rounded-xl border border-line/10 overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-2/60 text-ink-soft">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Number</th>
                    <th className="text-right font-semibold px-3 py-2">Then</th>
                    <th className="text-right font-semibold px-3 py-2">Now</th>
                    <th className="text-right font-semibold px-3 py-2">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/10">
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-3 py-2 font-semibold">{r.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmt(r.metric, r.then)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(r.metric, r.now)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        <Delta metric={r.metric} then={r.then} now={r.now} currency={currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-faint">No platform numbers to compare yet.</p>
          )}
          <p className="mt-2 text-[11.5px] text-ink-faint">
            &ldquo;Then&rdquo; is what the copied numbers said the day it was set; averages and rates cover the 28 days before each date. Only the accounts connected now are counted.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
