"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Mascot } from "@/components/ui/mascot";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { objectiveEditorPeople } from "@/app/(dashboard)/objectives/actions";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";
import { useLiveBoard } from "@/modules/objectives/components/use-live-board";
import { Meter, Rings, StatusPill, useWhen, type Ring } from "@/modules/objectives/components/parts";
import { progressWords } from "@/modules/objectives/components/objective-card";
import { colorVar, formatAmount } from "@/modules/objectives/lib/metrics";
import { PERIODS, timeLeft, type PeriodKind } from "@/modules/objectives/lib/periods";
import type { ObjectiveView } from "@/modules/objectives/lib/types";
import { useBox } from "./widget-box";

/*
 * Objectives on the dashboard: concentric rings (one per goal, up to four)
 * that fill up live as videos go out, beside a list with each goal's count,
 * what's left and the days to go. Reached rings glow and get a tick; the
 * whole team gets confetti from the app shell. Settings: which goals (all,
 * one cadence, or picked ones).
 */

export type ObjectivesWidgetSettings = { show?: "all" | PeriodKind; ids?: string[] };

// The editor only loads when a master opens it from the widget.
const ObjectiveEditor = dynamic(() => import("@/modules/objectives/components/objective-editor").then((m) => m.ObjectiveEditor), { ssr: false });

/**
 * Masters set a new objective right from the dashboard: the same editor as
 * Team settings, in a window over the dashboard. The ring fills in as soon
 * as it's saved (realtime, or the reload when the window closes).
 */
function useNewObjective(teamId: string, used: string[], onDone: () => void) {
  const toast = useToast();
  const [people, setPeople] = useState<TeamPerson[] | null>(null);
  const [opening, start] = useTransition();
  const open = () =>
    start(async () => {
      const r = await objectiveEditorPeople(teamId);
      if (r.error !== undefined) return void toast.error(r.error);
      setPeople(r.people);
    });
  const editor = people ? (
    <ObjectiveEditor
      open
      onClose={() => {
        setPeople(null);
        onDone();
      }}
      teamId={teamId}
      people={people}
      usedColors={used}
    />
  ) : null;
  return { open, opening, editor };
}

const daysWord = (kind: PeriodKind, n: number) => {
  const s = timeLeft(kind, n);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function pick(list: ObjectiveView[], s: ObjectivesWidgetSettings | undefined) {
  const active = list.filter((o) => !o.paused && o.known);
  const ids = Array.isArray(s?.ids) ? s!.ids!.filter((x) => typeof x === "string") : [];
  if (ids.length) {
    const chosen = active.filter((o) => ids.includes(o.id));
    if (chosen.length) return chosen;
  }
  const show = s?.show;
  return show && show !== "all" && (PERIODS as readonly string[]).includes(show) ? active.filter((o) => o.period === show) : active;
}

function Row({ o, wide }: { o: ObjectiveView; wide: boolean }) {
  const c = o.current;
  const reached = c.status === "reached";
  return (
    <Link href={`/objectives?o=${o.id}`} className="group block rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: colorVar(o.color) }} aria-hidden />
        <span className="text-[12.5px] font-semibold truncate flex-1 min-w-0">{o.title}</span>
        <span className="text-[12px] tabular-nums text-ink-soft whitespace-nowrap">
          <b className="text-ink font-semibold">{formatAmount(o.metric, c.value)}</b>
          {c.target > 0 ? <>/{formatAmount(o.metric, c.target)}</> : null}
        </span>
        {reached ? (
          <span className="w-4 h-4 rounded-full bg-green/15 text-green flex items-center justify-center flex-shrink-0" title="Reached">
            <CheckIcon className="w-2.5 h-2.5" />
          </span>
        ) : c.status === "behind" ? (
          <span className="w-1.5 h-1.5 rounded-full bg-coral flex-shrink-0" title="Behind" />
        ) : null}
      </div>
      {wide && (
        <div className="mt-1 pl-[18px] flex items-center gap-2">
          <Meter value={c.value} target={c.target} expected={c.expected} color={o.color} height={5} className="flex-1" />
          <span className="text-[10.5px] text-ink-faint whitespace-nowrap w-[78px] text-right">
            {c.target === 0 ? "Off" : reached ? "Reached" : c.daysLeft ? daysWord(o.period, c.daysLeft) : ""}
          </span>
        </div>
      )}
    </Link>
  );
}

export function ObjectivesWidget({ teamId, settings }: { teamId: string; settings?: Record<string, unknown> }) {
  const box = useBox();
  const when = useWhen();
  const { board, error, reload } = useLiveBoard(teamId, "widget");
  const add = useNewObjective(teamId, board?.objectives.map((o) => o.color) ?? [], () => void reload());
  const canAdd = !!board?.canEdit && board.ready;
  // "+": over the widget's title row, beside its settings button.
  const plus = canAdd ? (
    <button
      type="button"
      onClick={add.open}
      disabled={add.opening}
      aria-label="New objective"
      title="New objective"
      className="absolute top-[10px] right-9 z-10 w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70 transition-opacity disabled:opacity-40"
    >
      <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
    </button>
  ) : null;

  if (!board && !error)
    return (
      <div className="h-full flex items-center gap-3" aria-busy="true">
        <div className="skeleton rounded-full flex-shrink-0" style={{ width: Math.max(48, Math.min(box.h - 8, 120)), height: Math.max(48, Math.min(box.h - 8, 120)) }} />
        {box.w > 220 && (
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
        )}
      </div>
    );
  if (!board) return <p className="h-full flex items-center justify-center text-center text-[12.5px] text-ink-soft">{error}</p>;
  if (!board.ready) return <p className="h-full flex items-center justify-center text-center text-[12.5px] text-ink-soft">Objectives arrive with the next database update.</p>;

  const list = pick(board.objectives, settings as ObjectivesWidgetSettings | undefined);
  if (!list.length)
    return (
      <div className="h-full flex items-center gap-3">
        {box.w >= 230 && box.h >= 80 && <Mascot mood="idle" size={Math.max(44, Math.min(78, box.h - 20))} />}
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-soft leading-snug">
            {board.objectives.length ? "Nothing to show with these settings." : canAdd ? "No objectives yet. Set the team's first goal here." : "No objectives yet. Masters set the team's goals."}
          </p>
          {!board.objectives.length && canAdd ? (
            <button type="button" onClick={add.open} disabled={add.opening} className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber text-white px-2.5 h-7 text-[12px] font-bold hover:brightness-110 disabled:opacity-60">
              <PlusIcon className="w-3 h-3" strokeWidth={2.5} />
              New objective
            </button>
          ) : (
            <Link href="/objectives" className="text-[12.5px] font-semibold text-amber hover:brightness-110">
              See {board.objectives.length ? "them all" : "Objectives"} →
            </Link>
          )}
        </div>
        {add.editor}
      </div>
    );

  const rings: Ring[] = list.slice(0, 4).map((o) => ({
    key: o.id,
    color: o.color,
    value: o.current.value,
    target: o.current.target,
    label: `${o.title}: ${formatAmount(o.metric, o.current.value)} of ${formatAmount(o.metric, o.current.target)}`,
  }));
  const reachedCount = list.filter((o) => o.current.status === "reached").length;
  const kinds = new Set(list.map((o) => o.period));
  const one = kinds.size === 1 ? list[0] : null;
  const summary = one ? `${one.current.label}${one.current.daysLeft && one.current.status !== "reached" && one.period !== "day" ? ` · ${daysWord(one.period, one.current.daysLeft)}` : ""}` : null;

  // Layouts by the box: just the rings (tiny), the rings over the list (narrow
  // and tall), small rings beside rows in columns (short and wide), or the
  // rings beside the list (the rest; rows get pace bars when there's room).
  const { w: W, h: H } = box;
  const tiny = W < 150 || H < 64 || (W < 230 && H < 250);
  const stacked = !tiny && W < 300 && H >= 250;
  const strip = !tiny && !stacked && H < 120;
  const ringSize = tiny
    ? Math.max(48, Math.min(W, H) - 4)
    : stacked
      ? Math.min(W - 8, Math.round(H * 0.42), 200)
      : strip
        ? Math.max(56, Math.min(H - 4, 110))
        : Math.max(72, Math.min(H - 6, Math.round(W * 0.4), 190));
  const center = (
    <div className="leading-none">
      {list.length === 1 ? (
        <>
          <div className="font-display font-semibold tabular-nums" style={{ fontSize: Math.max(13, ringSize * 0.17) }}>
            {formatAmount(list[0].metric, list[0].current.value)}
          </div>
          {ringSize >= 84 && <div className="text-[10.5px] text-ink-faint mt-1">of {formatAmount(list[0].metric, list[0].current.target)}</div>}
        </>
      ) : (
        <>
          <div className="font-display font-semibold tabular-nums" style={{ fontSize: Math.max(13, ringSize * (rings.length > 2 ? 0.13 : 0.16)) }}>
            {reachedCount}/{list.length}
          </div>
          {ringSize >= 96 && <div className="text-[10.5px] text-ink-faint mt-1">reached</div>}
        </>
      )}
    </div>
  );

  if (tiny)
    return (
      <>
        <Link href="/objectives" className="h-full flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber" aria-label="Objectives">
          <Rings rings={rings} size={ringSize}>
            {center}
          </Rings>
        </Link>
        {plus}
        {add.editor}
      </>
    );

  const wide = W >= 470 && !stacked && !strip;
  const single = list.length === 1 ? list[0] : null;
  const rowH = wide ? 44 : 30;
  const cols = strip ? Math.max(1, Math.min(3, Math.floor((W - ringSize - 16) / 210))) : 1;
  const listH = stacked ? H - ringSize - 12 : H - (summary && !strip ? 22 : 0) - (single && !strip ? 20 : 0);
  const fits = Math.max(1, Math.floor(listH / rowH)) * cols;
  const rows = list.slice(0, list.length > fits ? fits - 1 : fits);
  const hidden = list.length - rows.length;

  return (
    <div className={`h-full min-h-0 flex ${stacked ? "flex-col items-stretch gap-3" : `items-center ${strip ? "gap-3" : "gap-4"}`}`}>
      <Link href="/objectives" className={`rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${stacked ? "self-center" : ""}`} aria-label="Open objectives">
        <Rings rings={rings} size={ringSize}>
          {center}
        </Rings>
      </Link>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col justify-center">
        {summary && !stacked && !strip && (
          <div className="flex items-center gap-2 mb-1.5 min-w-0">
            <span className="text-[11.5px] font-semibold text-ink-soft truncate">{summary}</span>
            {W >= 380 && single && <StatusPill status={single.current.status} />}
          </div>
        )}
        <div className={`min-h-0 ${cols > 1 ? "grid gap-x-4 gap-y-0.5" : "space-y-0.5"}`} style={cols > 1 ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
          {rows.map((o) => (
            <Row key={o.id} o={o} wide={wide} />
          ))}
          {hidden > 0 && strip && (
            <Link href="/objectives" className="self-center px-1.5 text-[11.5px] font-semibold text-ink-soft hover:text-ink">
              +{hidden} more →
            </Link>
          )}
        </div>
        {single && !stacked && !strip && <p className="mt-1 text-[11.5px] text-ink-faint truncate">{progressWords(single, when)}</p>}
        {hidden > 0 && !strip && (
          <Link href="/objectives" className="mt-1 text-[11.5px] font-semibold text-ink-soft hover:text-ink">
            +{hidden} more →
          </Link>
        )}
      </div>
      {plus}
      {add.editor}
    </div>
  );
}

/** Its settings: all objectives, one cadence, or the ones you pick. */
export function ObjectivesWidgetSettingsForm({ teamId, settings, onChange }: { teamId: string; settings: Record<string, unknown>; onChange: (s: Record<string, unknown>) => void }) {
  const { board } = useLiveBoard(teamId, "widget");
  const s = settings as ObjectivesWidgetSettings;
  const ids = Array.isArray(s.ids) ? s.ids : [];
  const present = new Set((board?.objectives ?? []).filter((o) => !o.paused).map((o) => o.period));
  const shows: ("all" | PeriodKind)[] = ["all", ...PERIODS.filter((p) => present.has(p))];
  const label: Record<string, string> = { all: "All", day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };
  const row = "py-3 border-b border-line/10 last:border-none";
  return (
    <div>
      <div className={row}>
        <div className="text-[13.5px] font-semibold mb-2">Show</div>
        <div className="flex flex-wrap rounded-lg border border-line/15 p-0.5 w-fit max-w-full">
          {shows.map((v) => (
            <button key={v} type="button" onClick={() => onChange({ show: v, ids: [] })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${(s.show ?? "all") === v && !ids.length ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
              {label[v]}
            </button>
          ))}
        </div>
      </div>
      <div className={row}>
        <div className="text-[13.5px] font-semibold">Or pick them</div>
        <p className="text-[12px] text-ink-soft mb-2">The first four get rings; the rest are listed.</p>
        {!board ? (
          <div className="space-y-2">
            <div className="skeleton h-8 rounded-lg" />
            <div className="skeleton h-8 rounded-lg" />
          </div>
        ) : !board.objectives.length ? (
          <p className="text-[12.5px] text-ink-faint">No objectives yet.</p>
        ) : (
          <div className="space-y-1">
            {board.objectives
              .filter((o) => !o.paused)
              .map((o) => {
                const on = ids.includes(o.id);
                return (
                  <label key={o.id} className="flex items-center gap-2.5 rounded-lg px-2 h-9 hover:bg-surface-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onChange({ ids: on ? ids.filter((x) => x !== o.id) : [...ids, o.id] })}
                      className="w-4 h-4 accent-[rgb(var(--amber))]"
                    />
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: colorVar(o.color) }} aria-hidden />
                    <span className="text-[13px] font-semibold truncate flex-1">{o.title}</span>
                    <span className="text-[11.5px] text-ink-faint">{label[o.period]}</span>
                  </label>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
