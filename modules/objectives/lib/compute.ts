/**
 * Progress per period, pace, streaks and who helped. Pure (tested in
 * tests/objectives.test.ts): the server feeds it hits (lib/hits.ts).
 */
import { daysLeft, elapsed, periodStart, type LocalNow, type PeriodKind } from "./periods";
import type { Contributor, Credit, Hit, Status } from "./types";

export type PeriodResult = {
  start: string;
  end: string;
  /** 0 = off for this period. */
  target: number;
  value: number;
  reached: boolean;
  /** The moment it crossed the target (null: not reached, or platform numbers without a time). */
  reachedAt: string | null;
  reachedDay: string | null;
  /** The hit that took it over the line. */
  winner: Hit | null;
  /** The period's hits, in the order they happened. */
  hits: Hit[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One period: what it counted, and when (if) it reached its target. */
export function periodResult(all: Hit[], start: string, end: string, target: number): PeriodResult {
  const hits = all.filter((h) => h.day >= start && h.day <= end).sort((a, b) => (a.day === b.day ? (a.at ?? "").localeCompare(b.at ?? "") : a.day.localeCompare(b.day)));
  let value = 0;
  let winner: Hit | null = null;
  for (const h of hits) {
    value += h.value;
    if (!winner && target > 0 && value >= target - 1e-9) winner = h;
  }
  value = round2(value);
  // A later drop (an unposted short, followers lost) can take it back under.
  const reached = target > 0 && value >= target - 1e-9;
  return {
    start,
    end,
    target,
    value,
    reached,
    reachedAt: reached && winner?.at ? winner.at : null,
    reachedDay: reached && winner ? winner.day : null,
    winner: reached ? winner : null,
    hits,
  };
}

export type Pace = { status: Status; fraction: number; expected: number; forecast: number | null; perDay: number | null; daysLeft: number };

/**
 * Where a period stands. Past: reached or missed. Current: reached, or ahead
 * of / on / behind the pace that reaches the target on its last day (with a
 * little slack, so a goal isn't "behind" an hour into the week).
 * `lagDays`: numbers that arrive a day late are judged against yesterday.
 */
export function paceFor(kind: PeriodKind, r: Pick<PeriodResult, "start" | "end" | "target" | "value">, now: LocalNow, lagDays = 0): Pace {
  const left = daysLeft(kind, r.start, now.day);
  if (r.start > now.day) return { status: "upcoming", fraction: 0, expected: 0, forecast: null, perDay: null, daysLeft: left };
  const over = r.end < now.day;
  const fraction = over ? 1 : elapsed(kind, r.start, now, lagDays);
  const expected = r.target * fraction;
  const forecast = !over && fraction >= 0.12 ? Math.round(r.value / fraction) : null;
  if (r.target <= 0) return { status: "off", fraction, expected: 0, forecast, perDay: null, daysLeft: left };
  if (r.value >= r.target - 1e-9) return { status: "reached", fraction, expected, forecast, perDay: null, daysLeft: left };
  if (over) return { status: "missed", fraction, expected, forecast: null, perDay: null, daysLeft: 0 };
  const perDay = left > 0 ? (r.target - r.value) / left : null;
  const status: Status = r.value >= expected * 1.2 + 0.5 && r.value > 0 ? "ahead" : r.value >= expected * 0.85 - 0.5 ? "on_track" : "behind";
  return { status, fraction, expected, forecast, perDay, daysLeft: left };
}

/**
 * Periods in a row that reached their target, counting back from the latest
 * finished one (oldest first in, the current one last). Periods switched off
 * (target 0) neither break nor extend it; the current one adds to it once
 * reached and never breaks it while it's still running.
 */
export function streakOf(periods: { target: number; value: number }[]): number {
  if (!periods.length) return 0;
  const cur = periods[periods.length - 1];
  let n = cur.target > 0 && cur.value >= cur.target ? 1 : 0;
  for (let i = periods.length - 2; i >= 0; i--) {
    const p = periods[i];
    if (p.target <= 0) continue;
    if (p.value >= p.target) n++;
    else break;
  }
  return n;
}

/**
 * The first period an objective is judged on: the one it was set in (a goal
 * set mid-week counts that whole week). Periods before it are still shown,
 * as what happened then, but never as "missed", and they never count toward
 * a streak, a best, an average or "reached X of Y".
 */
export function firstCounted(kind: PeriodKind, createdDay: string, currentStart: string): string {
  const s = periodStart(kind, createdDay);
  // (A creation date in the future, from a wrong clock, never hides the current period.)
  return s > currentStart ? currentStart : s;
}

export type Stats = { streak: number; best: number; reached: number; counted: number; average: number | null };

/**
 * Streak, best, reached and average, from the periods that count (oldest
 * first, the current one last; periods before the goal and periods without
 * numbers already left out). The average is over finished periods only.
 */
export function statsOf(periods: { target: number; value: number; reached: boolean }[]): Stats {
  if (!periods.length) return { streak: 0, best: 0, reached: 0, counted: 0, average: null };
  const cur = periods[periods.length - 1];
  const finished = periods.slice(0, -1).filter((r) => r.target > 0);
  return {
    streak: streakOf(periods),
    best: periods.reduce((m, r) => Math.max(m, r.value), 0),
    reached: periods.filter((r) => r.reached).length,
    counted: finished.length + (cur.reached ? 1 : 0),
    average: finished.length ? Math.round((finished.reduce((s, r) => s + r.value, 0) / finished.length) * 10) / 10 : null,
  };
}

/** Who helped: each person's count of the period's hits (and their parts), most first. */
export function contributorsOf(hits: Hit[]): Contributor[] {
  const by = new Map<string, { count: number; roles: Set<Credit["role"]> }>();
  for (const h of hits) {
    const mine = new Map<string, Set<Credit["role"]>>();
    for (const c of h.people) mine.set(c.member, (mine.get(c.member) ?? new Set()).add(c.role));
    for (const [member, roles] of mine) {
      const cur = by.get(member) ?? { count: 0, roles: new Set<Credit["role"]>() };
      cur.count += 1;
      roles.forEach((r) => cur.roles.add(r));
      by.set(member, cur);
    }
  }
  return [...by.entries()]
    .map(([memberId, v]) => ({ memberId, count: v.count, roles: [...v.roles] }))
    .sort((a, b) => b.count - a.count || a.memberId.localeCompare(b.memberId));
}
