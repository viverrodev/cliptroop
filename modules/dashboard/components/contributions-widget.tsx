"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { KindIcon } from "@/components/ui/kind-icon";
import type { Done } from "../lib/queries";
import { localDay } from "./tasks-widget";
import { CountUp } from "@/components/ui/count-up";
import { WordIcon } from "@/components/ui/icons";

const LEVEL_MIX = [0, 30, 55, 78, 100];
const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);
export { CONTRIB_COLORS } from "../layout";

/** GitHub-style grid: one square per day, more finished tasks (and the daily word) = more intense. */
export function ContributionsWidget({ done, teamId, settings }: { done: Done[]; teamId: string; settings?: Record<string, unknown> }) {
  const color = (settings?.color as string) || "#22c55e";
  const scope = (settings?.scope as string) === "team" ? "team" : "all";
  const [open, setOpen] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Squares fit the card both ways (8–16px); very narrow cards scroll instead.
  const [cell, setCell] = useState(10);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => {
      const byWidth = Math.floor((el.clientWidth - 30) / 53) - 3;
      const byHeight = Math.floor((el.clientHeight - 16) / 7) - 3;
      setCell(Math.max(8, Math.min(16, byWidth, byHeight)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const step = cell + 3;

  const items = useMemo(() => (scope === "team" ? done.filter((d) => d.teamId === teamId) : done), [done, scope, teamId]);
  const byDay = useMemo(() => {
    const m = new Map<string, Done[]>();
    for (const d of items) {
      const k = localDay(new Date(d.at));
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  }, [items]);

  // 53 weeks, Monday first, ending this week.
  const { weeks, months } = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 52 * 7 - ((end.getDay() + 6) % 7));
    const weeks: string[][] = [];
    const months: { col: number; label: string }[] = [];
    const cur = new Date(start);
    for (let w = 0; w < 53; w++) {
      const col: string[] = [];
      for (let d = 0; d < 7; d++) {
        col.push(localDay(cur));
        if (cur.getDate() === 1 || (w === 0 && d === 0)) months.push({ col: w, label: cur.toLocaleDateString("en-US", { month: "short" }) });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(col);
    }
    return { weeks, months: months.filter((m, i, a) => i === 0 || m.col - a[i - 1].col > 2) };
  }, []);
  const today = localDay();
  const total = items.length;
  // Streaks: days in a row with at least one finished task.
  const { streak, best, week } = useMemo(() => {
    const has = (d: Date) => (byDay.get(localDay(d))?.length ?? 0) > 0;
    const d = new Date();
    if (!has(d)) d.setDate(d.getDate() - 1); // today not started yet: count from yesterday
    let streak = 0;
    while (has(d) && streak < 400) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    let best = 0;
    let run = 0;
    for (const col of weeks)
      for (const day of col) {
        run = (byDay.get(day)?.length ?? 0) > 0 ? run + 1 : 0;
        best = Math.max(best, run);
      }
    const mon = new Date();
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const from = localDay(mon);
    let week = 0;
    for (const [k, v] of byDay) if (k >= from) week += v.length;
    return { streak, best, week };
  }, [byDay, weeks]);
  useEffect(() => {
    scroller.current?.scrollTo({ left: scroller.current.scrollWidth });
  }, []);


  const shade = (n: number) =>
    n ? `color-mix(in srgb, ${color} ${LEVEL_MIX[level(n)]}%, rgb(var(--surface-2)))` : "rgb(var(--line) / 0.12)";
  const stat = (n: number, label: string) => (
    <span className="whitespace-nowrap">
      <b className="text-ink tabular-nums">
        <CountUp value={n} />
      </b>{" "}
      {label}
    </span>
  );
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11.5px] text-ink-soft mb-1.5 flex-shrink-0">
        {stat(total, `done this year${scope === "team" ? " here" : ""}`)}
        {stat(week, "this week")}
        {stat(streak, "day streak")}
        {stat(best, "best streak")}
        <span className="ml-auto hidden sm:flex items-center gap-1 text-[10.5px] text-ink-faint">
          Less
          {[0, 1, 2, 4, 7].map((n) => (
            <span key={n} className="w-2.5 h-2.5 rounded-[2px]" style={{ background: shade(n) }} />
          ))}
          More
        </span>
      </div>
      <div ref={scroller} className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="grid w-max mx-auto gap-y-1" style={{ gridTemplateColumns: "auto 1fr" }}>
          <span />
          <div className="relative h-3.5 text-[10px] leading-none text-ink-faint" style={{ width: weeks.length * step }}>
            {months.map((m) => (
              <span key={m.col} className="absolute" style={{ left: m.col * step }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="grid grid-rows-7 gap-[3px] pr-1.5 text-[9.5px] leading-none text-ink-faint">
            {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
              <span key={i} className="flex items-center" style={{ height: cell }}>
                {d}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((col, w) => (
              <div key={w} className="contrib-col grid grid-rows-7 gap-[3px]" style={{ animationDelay: `${w * 11}ms` }}>
                {col.map((d) => {
                  const n = byDay.get(d)?.length ?? 0;
                  const future = d > today;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={future}
                      onClick={() => setOpen(d)}
                      title={`${n || "No"} contribution${n === 1 ? "" : "s"} on ${new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`}
                      className={`rounded-[2px] transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${future ? "opacity-0 pointer-events-none" : ""} ${d === today ? "ring-1 ring-ink/40" : ""}`}
                      style={{ background: shade(n), width: cell, height: cell }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? new Date(`${open}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}
        description={open ? `${byDay.get(open)?.length ?? 0} contribution${(byDay.get(open)?.length ?? 0) === 1 ? "" : "s"}: tasks finished and the daily word` : undefined}
      >
        {open && (byDay.get(open)?.length ? (
          <ul className="space-y-1">
            {byDay.get(open)!.map((d) => (
              <li key={d.id}>
                <Link href={d.href} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-surface-2">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${d.kind === "word" ? "bg-green/12 text-green" : "bg-surface-2"}`}>
                    {d.kind === "word" ? <WordIcon className="w-4 h-4" /> : <KindIcon kind={d.kind} className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold truncate">{d.action}</span>
                    <span className="block text-[12.5px] text-ink-soft truncate">
                      {d.kind === "word" ? "Counts as a contribution" : d.kind === "meeting" ? <><span className="text-ink-faint">From</span> {d.title}</> : <><span className="font-mono text-ink-faint">#{d.number}</span> {d.title}</>}
                    </span>
                  </span>
                  <span className="text-[12px] text-ink-faint">{new Date(d.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-soft">Nothing finished that day.</p>
        ))}
      </Dialog>
    </div>
  );
}
