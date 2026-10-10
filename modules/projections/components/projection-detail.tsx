"use client";

import { Dialog } from "@/components/ui/dialog";
import { EditIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { colorVar } from "@/modules/objectives/lib/metrics";
import { formatValue, metricOf, unitWords } from "../lib/metrics";
import type { ProjectionView } from "../lib/types";
import { headingWords, leftWords, needWords } from "./projection-card";
import { fmtDay, paceWords, ProgressTrack, ProjectionChart, ProjStatusPill } from "./parts";

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface-2/40 px-3 py-2.5 min-w-0">
      <div className="text-[11.5px] text-ink-soft truncate">{label}</div>
      <div className="mt-0.5 font-display text-[19px] font-semibold leading-tight tabular-nums truncate">{value}</div>
      {sub && <div className="text-[11px] text-ink-faint truncate">{sub}</div>}
    </div>
  );
}

/**
 * One projection in full: where it is against the target, each day since it
 * was set, the pace now and the pace it needs, where it lands at this pace,
 * and (masters) changing, archiving or deleting it.
 */
export function ProjectionDetail({
  p,
  currency,
  canEdit,
  onClose,
  onCompare,
  onEdit,
  onArchive,
  onDelete,
}: {
  p: ProjectionView | null;
  currency: string;
  canEdit: boolean;
  onClose: () => void;
  onCompare: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  if (!p) return null;
  const fmt = (v: number | null) => (v === null ? "–" : formatValue(p.metric, v, { currency }));
  const unit = unitWords(p.metric, p.target, p.scope);
  const m = metricOf(p.metric);
  const changed = p.current !== null && p.startValue !== null ? p.current - p.startValue : null;
  const pct = p.a.progress === null ? null : Math.round(Math.max(0, p.a.progress) * 100);
  return (
    <Dialog open onClose={onClose} title={p.title} description={p.sentence} width="sm:max-w-3xl">
      <div className="space-y-6">
        {/* Where the dialog puts the focus when it opens (not on the chart: that would light it up). */}
        <section data-autofocus tabIndex={-1} className="outline-none">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: colorVar(p.color, 0.14), color: colorVar(p.color) }} aria-hidden>
              {p.platform ? (
                <PlatformIcon platform={p.platform} className="w-6 h-6 rounded-[5px]" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l6-6 4 4 8-8" />
                  <path d="M14 7h7v7" />
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-display text-[34px] font-semibold leading-none tabular-nums">{fmt(p.current)}</span>
                <span className="text-[13px] text-ink-soft">
                  of {fmt(p.target)}
                  {unit ? ` ${unit}` : ""} by {fmtDay(p.deadline, true)}
                </span>
              </div>
            </div>
            <ProjStatusPill status={p.a.status} />
          </div>
          <ProgressTrack p={p} height={12} className="mt-3" />
          <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-ink-faint tabular-nums">
            <span>
              Started at {fmt(p.startValue)} on {fmtDay(p.startDay)}
            </span>
            <span>{pct !== null ? `${Math.min(pct, 999)}% of the way` : ""}</span>
          </div>
          {headingWords(p, currency) && <p className="mt-2 text-[12.5px] text-ink-soft">{headingWords(p, currency)}</p>}
          {needWords(p, currency) && <p className="text-[12px] text-ink-faint">{needWords(p, currency)} The thin mark on the bar is where an even pace would be by now.</p>}
        </section>

        <section className="rounded-2xl border border-line/10 p-3 sm:p-4">
          <ProjectionChart p={p} height={230} currency={currency} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-[2px] rounded-full" style={{ background: colorVar(p.color) }} />
              Each day
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed" style={{ borderColor: colorVar(p.color, 0.7) }} />
              At this pace
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-px bg-ink/20" />
              An even pace to the target
            </span>
          </div>
        </section>

        <section className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <Tile label="Change so far" value={changed === null ? "–" : `${changed >= 0 ? "+" : "−"}${formatValue(p.metric, Math.abs(changed), { currency })}`} sub={`since ${fmtDay(p.startDay)}`} />
          <Tile label="Pace now" value={paceWords(p.metric, p.a.perDay, currency) ?? "–"} sub={p.a.perDay === null ? "after a few days" : "the trend"} />
          <Tile label="Pace it needs" value={paceWords(p.metric, p.a.needPerDay, currency) ?? "–"} sub="from today" />
          <Tile label="At the deadline" value={p.a.forecast === null ? "–" : fmt(p.a.forecast)} sub="at this pace" />
          <Tile label="Gets there" value={p.a.eta ? fmtDay(p.a.eta, p.a.eta.slice(0, 4) !== p.deadline.slice(0, 4)) : p.a.status === "reached" || p.a.status === "done" ? "Reached" : "–"} sub={p.a.eta ? (p.a.eta <= p.deadline ? "before the deadline" : "after the deadline") : "at this pace"} />
          <Tile label="Time" value={`Day ${Math.min(p.a.daysElapsed + 1, p.a.daysTotal)} of ${p.a.daysTotal}`} sub={leftWords(p)} />
          <Tile label="Measured" value={m ? (m.kind === "window" ? `Last ${p.scope.window ?? 28} days` : "The total") : "–"} sub={m?.source} />
          <Tile label="Days with numbers" value={String(p.points.length)} sub="one a day, every morning" />
        </section>

        {p.note && (
          <section>
            <h3 className="text-[13px] font-semibold mb-1">Note</h3>
            <p className="text-[13px] text-ink-soft whitespace-pre-line">{p.note}</p>
          </section>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={onCompare} className="rounded-lg bg-ink text-paper px-3.5 h-9 text-[12.5px] font-bold hover:opacity-90">
            Compare then and now
          </button>
          <span className="flex-1" />
          {canEdit && (
            <>
              <button type="button" onClick={onDelete} className="rounded-lg px-3 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-red hover:bg-red/10">
                Delete
              </button>
              <button type="button" onClick={onArchive} className="rounded-lg border border-line/15 px-3 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                {p.archived ? "Bring back" : "Archive"}
              </button>
              <button type="button" onClick={onEdit} className="rounded-lg border border-line/15 px-3 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                <EditIcon className="w-3.5 h-3.5" />
                Change
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
