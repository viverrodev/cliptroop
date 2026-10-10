"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DateChip } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast-provider";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { COLOR_LABEL, COLOR_WHEEL, colorVar, nextColor } from "@/modules/objectives/lib/metrics";
import type { Platform } from "@/modules/short-videos/lib/constants";
import { createProjection, previewProjection, updateProjection } from "@/app/(dashboard)/objectives/projection-actions";
import { meets } from "../lib/compute";
import {
  DEADLINE_PRESETS,
  GROUP_LABEL,
  GROUP_ORDER,
  METRICS_BY_GROUP,
  PROJ_METRICS,
  WINDOWS,
  addMonths,
  cleanScope,
  compact,
  describeProjection,
  formatValue,
  isMoney,
  metricOf,
  platformName,
  projectionProblem,
  suggestProjectionTitle,
  unitWords,
  type ProjGroup,
  type ProjMetricId,
  type ProjScope,
  type WindowDays,
} from "../lib/metrics";
import type { ProjectionView } from "../lib/types";

/*
 * Setting a projection (masters): what to measure (grouped, each with what
 * it is and where the number comes from), where (platforms, shorts or long
 * videos, the window an average covers), the target with its value right
 * now beside it, the date, a name and a colour. Changing one keeps what it
 * measures (a different measure is a new projection).
 */

export type EditorStart = { metric?: ProjMetricId; scope?: ProjScope; months?: number; lift?: number };

export const TEMPLATES: { key: string; label: string; start: EditorStart }[] = [
  { key: "subs", label: "Subscribers in 3 months", start: { metric: "followers", scope: { platforms: ["youtube"] }, months: 3, lift: 1.2 } },
  { key: "followers", label: "Followers everywhere by next year", start: { metric: "followers", months: 12, lift: 1.5 } },
  { key: "views", label: "Views a day", start: { metric: "views_per_day", scope: { window: 28 }, months: 3, lift: 1.3 } },
  { key: "pct", label: "% viewed on long videos", start: { metric: "avg_pct_per_video", scope: { content: "long", window: 90 }, months: 6, lift: 1.1 } },
  { key: "skip", label: "Reels skip rate down", start: { metric: "skip_rate", scope: { window: 28 }, months: 3, lift: 0.85 } },
  { key: "eng", label: "Engagement rate", start: { metric: "engagement_rate", scope: { window: 28 }, months: 3, lift: 1.15 } },
  { key: "hits", label: "Shorts over 100K views", start: { metric: "hit_rate", scope: { content: "shorts", window: 90, threshold: 100_000 }, months: 6, lift: 1.25 } },
  { key: "shorts", label: "Shorts a week", start: { metric: "shorts_per_week", scope: { window: 28 }, months: 3, lift: 1.25 } },
];

/** A round number near n (2 significant digits for big ones). */
function nice(n: number, metric: string) {
  const unit = metricOf(metric)?.unit;
  if (unit === "percent" || unit === "per1k") return Math.round(n * 10) / 10;
  if (unit === "per_week" || unit === "per_month") return Math.round(n * 2) / 2;
  if (unit === "seconds") return Math.round(n);
  const a = Math.abs(n);
  if (a < 100) return Math.round(n);
  const p = Math.pow(10, Math.floor(Math.log10(a)) - 1);
  return Math.round(n / p) * p;
}

export function ProjectionEditor({
  open,
  teamId,
  today,
  money,
  editing,
  start,
  used,
  currency,
  onClose,
  onSaved,
}: {
  open: boolean;
  teamId: string;
  today: string;
  /** Can measure money (sees revenue). */
  money: boolean;
  editing: ProjectionView | null;
  start: EditorStart | null;
  used: string[];
  currency: string;
  onClose: () => void;
  onSaved: (id: string | null) => void;
}) {
  const toast = useToast();
  const [metric, setMetric] = useState<ProjMetricId>("followers");
  const [group, setGroup] = useState<ProjGroup>("audience");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [content, setContent] = useState<"all" | "shorts" | "long">("all");
  const [win, setWin] = useState<WindowDays>(28);
  const [threshold, setThreshold] = useState("100000");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [deadline, setDeadline] = useState(addMonths(today, 3));
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [color, setColor] = useState("blue");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<{ current: number | null; loading: boolean; error: string | null }>({ current: null, loading: false, error: null });
  const [saving, startSaving] = useTransition();
  const lift = useRef<number | null>(null);

  // Fill the form when it opens.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const m = (editing.metric in PROJ_METRICS ? editing.metric : "followers") as ProjMetricId;
      setMetric(m);
      setGroup(PROJ_METRICS[m].group);
      setPlatforms(editing.scope.platforms ?? []);
      setContent(editing.scope.content ?? "all");
      setWin(editing.scope.window ?? 28);
      setThreshold(String(editing.scope.threshold ?? 100_000));
      setTarget(String(editing.target));
      setDirection(editing.direction);
      setDeadline(editing.deadline);
      setTitle(editing.title);
      setTitleTouched(true);
      setColor(editing.color);
      setNote(editing.note ?? "");
      lift.current = null;
      return;
    }
    const m = start?.metric ?? "followers";
    setMetric(m);
    setGroup(PROJ_METRICS[m].group);
    setPlatforms(start?.scope?.platforms ?? []);
    setContent(start?.scope?.content ?? "all");
    setWin(start?.scope?.window ?? 28);
    setThreshold(String(start?.scope?.threshold ?? 100_000));
    setTarget("");
    setDirection(PROJ_METRICS[m].dir);
    setDeadline(addMonths(today, start?.months ?? 3));
    setTitleTouched(false);
    setColor(nextColor(used));
    setNote("");
    lift.current = start?.lift ?? null;
  }, [open, editing, start, today, used]);

  const m = metricOf(metric)!;
  const scope = useMemo(
    () => cleanScope(metric, { platforms, content: content === "all" ? undefined : content, window: win, threshold: Number(threshold) }),
    [metric, platforms, content, win, threshold]
  );
  const scopeKey = JSON.stringify(scope);
  const shownPlatforms = scope.platforms ?? [...m.platforms];
  const splitOk = !!m.content && (m.group === "videos" || shownPlatforms.includes("youtube"));

  // The name follows what's measured until it's typed.
  useEffect(() => {
    if (!titleTouched && !editing) setTitle(suggestProjectionTitle(metric, scope));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, scopeKey, titleTouched, editing]);

  // Its value right now (and a target to start from, for a template).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPreview((p) => ({ ...p, loading: true, error: null }));
    const t = setTimeout(() => {
      previewProjection(teamId, metric, scope)
        .then((r) => {
          if (!alive) return;
          if (r.error !== undefined) return setPreview({ current: null, loading: false, error: r.error });
          setPreview({ current: r.current, loading: false, error: null });
          if (lift.current !== null && r.current !== null && r.current !== 0) {
            setTarget(String(nice(r.current * lift.current, metric)));
            lift.current = null;
          }
        })
        .catch(() => alive && setPreview({ current: null, loading: false, error: "Couldn't get the number right now." }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId, metric, scopeKey]);

  const t = Number(target);
  const problem =
    projectionProblem({ title, metric, target: target.trim() === "" ? NaN : t, deadline, today, color }) ??
    (!editing && preview.current !== null && target.trim() !== "" && Number.isFinite(t) && meets(preview.current, t, direction)
      ? `It's already at ${formatValue(metric, preview.current, { currency })}. Pick a target past it.`
      : null);
  const sentence = Number.isFinite(t) && target.trim() !== "" ? describeProjection({ metric, scope, target: t, direction, deadline }, currency) : null;
  const daysLeft = Math.max(1, Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000));
  const perDay = preview.current !== null && Number.isFinite(t) && target.trim() !== "" ? (t - preview.current) / daysLeft : null;

  function pick(id: ProjMetricId) {
    setMetric(id);
    setDirection(PROJ_METRICS[id].dir);
    setPlatforms((ps) => ps.filter((p) => (PROJ_METRICS[id].platforms as readonly string[]).includes(p)));
    if (!("content" in PROJ_METRICS[id])) setContent("all");
    setTarget("");
  }

  function save() {
    if (problem) return toast.error(problem);
    startSaving(async () => {
      const input = { title: title.trim(), target: t, direction, deadline, color, note: note.trim() || null };
      const r = editing ? await updateProjection(editing.id, input) : await createProjection(teamId, { ...input, metric, scope });
      if (r.error !== undefined) return void toast.error(r.error);
      toast.success(editing ? "Saved" : "Projection set. Check back any time.");
      onSaved(editing ? editing.id : (r as { id: string }).id);
    });
  }

  const unit = m.unit;
  const unitHint =
    unit === "percent" ? "%" : unit === "seconds" ? "seconds" : unit === "hours" ? "hours" : unit === "money" ? currency : unit === "per1k" ? "per 1K views" : unit === "per_week" ? "a week" : unit === "per_month" ? "a month" : unitWords(metric, 2, scope);
  const groups = GROUP_ORDER.filter((g) => g !== "money" || money);

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Change “${editing.title}”` : "New projection"} description={editing ? "What it measures stays the same (a different measure is a new projection)." : "A target for a date, months away. Set it, then check back."} width="sm:max-w-3xl">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-5 min-w-0">
          {!editing && (
            <section>
              <h3 className="text-[12.5px] font-semibold text-ink-soft mb-2">What to measure</h3>
              <div className="flex gap-1.5 flex-wrap mb-2.5" role="tablist" aria-label="Kind">
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="tab"
                    aria-selected={group === g}
                    onClick={() => setGroup(g)}
                    className={`rounded-full px-3 h-7 text-[12px] font-semibold border transition-colors ${group === g ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
                  >
                    {GROUP_LABEL[g]}
                  </button>
                ))}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Metric">
                {METRICS_BY_GROUP[group]
                  .filter((id) => money || !isMoney(id))
                  .map((id) => {
                    const x = PROJ_METRICS[id];
                    const on = metric === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => pick(id)}
                        className={`text-left rounded-xl border px-3 py-2 transition-colors ${on ? "border-amber/60 bg-amber/10" : "border-line/10 hover:border-line/30"}`}
                      >
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                          {x.label}
                          <span className="ml-auto flex -space-x-1">
                            {x.platforms.map((p) => (
                              <PlatformIcon key={p} platform={p} className="w-3.5 h-3.5 rounded-[3px] ring-1 ring-surface" />
                            ))}
                          </span>
                        </span>
                        <span className="block text-[11.5px] text-ink-faint leading-snug mt-0.5">{x.help}</span>
                      </button>
                    );
                  })}
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">From: {m.source}.</p>
            </section>
          )}

          {!editing && (m.platforms.length > 1 || splitOk || m.kind === "window" || m.threshold) && (
            <section className="space-y-3">
              <h3 className="text-[12.5px] font-semibold text-ink-soft">Where</h3>
              {m.platforms.length > 1 && (
                <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Platforms">
                  {m.platforms.map((p) => {
                    const on = platforms.length === 0 || platforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const all = platforms.length === 0 ? [...m.platforms] : platforms;
                          const next = on ? all.filter((x) => x !== p) : [...all, p];
                          setPlatforms(next.length === 0 || next.length === m.platforms.length ? [] : next);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full border pl-1 pr-3 h-8 text-[12px] font-semibold transition-colors ${on ? "border-ink/40 bg-surface" : "border-line/10 text-ink-faint opacity-70 hover:opacity-100"}`}
                      >
                        <PlatformIcon platform={p} className="w-6 h-6 rounded-full" />
                        {platformName(p)}
                      </button>
                    );
                  })}
                </div>
              )}
              {splitOk && (
                <div className="inline-flex rounded-lg border border-line/15 p-0.5" role="radiogroup" aria-label="Shorts or long videos">
                  {(["all", "shorts", "long"] as const).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={content === c} onClick={() => setContent(c)} className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${content === c ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}>
                      {c === "all" ? "Everything" : c === "shorts" ? "Shorts" : "Long videos"}
                    </button>
                  ))}
                </div>
              )}
              {m.kind === "window" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-ink-soft">{m.group === "videos" ? "Videos published in the last" : "Over the last"}</span>
                  <div className="inline-flex rounded-lg border border-line/15 p-0.5" role="radiogroup" aria-label="Days">
                    {WINDOWS.map((d) => (
                      <button key={d} type="button" role="radio" aria-checked={win === d} onClick={() => setWin(d)} className={`px-2.5 h-7 rounded-md text-[12px] font-semibold tabular-nums transition-colors ${win === d ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}>
                        {d} days
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {m.threshold && (
                <label className="flex items-center gap-2 text-[12px] text-ink-soft">
                  Views mark
                  <input inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ""))} className="w-28 rounded-lg border border-line/20 bg-surface px-2.5 h-8 text-[13px] tabular-nums" aria-label="Views mark" />
                  <span className="text-ink-faint">{Number(threshold) ? `${compact(Number(threshold))}+ views counts as a hit` : ""}</span>
                </label>
              )}
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-[12.5px] font-semibold text-ink-soft">Target</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-line/15 p-0.5" role="radiogroup" aria-label="Direction">
                {(["up", "down"] as const).map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)} className={`px-2.5 h-8 rounded-md text-[12px] font-semibold transition-colors ${direction === d ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}>
                    {d === "up" ? "At least" : "At most"}
                  </button>
                ))}
              </div>
              <input
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={preview.current !== null ? String(nice(preview.current * (direction === "up" ? 1.25 : 0.8), metric)) : "Target"}
                className="w-40 rounded-lg border border-line/20 bg-surface px-3 h-9 text-[15px] font-semibold tabular-nums"
                aria-label="Target"
                data-autofocus
              />
              <span className="text-[12.5px] text-ink-soft">{unitHint}</span>
            </div>
            <p className="text-[12px] text-ink-soft">
              Now:{" "}
              {preview.loading ? (
                <span className="inline-block skeleton h-3 w-14 rounded align-middle" />
              ) : preview.error ? (
                <span className="text-ink-faint">{preview.error}</span>
              ) : (
                <b className="text-ink tabular-nums">{formatValue(metric, preview.current, { currency })}</b>
              )}
              {preview.current !== null && unit === "seconds" && target && Number.isFinite(t) ? <span className="text-ink-faint"> · target {formatValue(metric, t)}</span> : null}
            </p>
            {preview.current !== null && preview.current !== 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {(direction === "up" ? [1.1, 1.25, 1.5, 2] : [0.9, 0.75, 0.5]).map((k) => (
                  <button key={k} type="button" onClick={() => setTarget(String(nice(preview.current! * k, metric)))} className="rounded-full border border-line/15 px-2.5 h-7 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 tabular-nums">
                    {k >= 1 ? (k === 2 ? "×2" : `+${Math.round((k - 1) * 100)}%`) : `−${Math.round((1 - k) * 100)}%`} · {formatValue(metric, nice(preview.current! * k, metric), { currency })}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-[12.5px] font-semibold text-ink-soft">By</h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DEADLINE_PRESETS.map((d) => {
                const day = addMonths(today, d.months);
                return (
                  <button key={d.label} type="button" onClick={() => setDeadline(day)} aria-pressed={deadline === day} className={`rounded-full px-3 h-8 text-[12px] font-semibold border transition-colors ${deadline === day ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}>
                    {d.label}
                  </button>
                );
              })}
              <DateChip value={deadline} onChange={setDeadline} ariaLabel="Deadline" />
            </div>
            <p className="text-[11.5px] text-ink-faint">
              {daysLeft} days from today
              {perDay !== null && perDay !== 0 ? ` · that's about ${formatValue(metric, Math.abs(perDay) * (Math.abs(perDay) < 1 ? 7 : 1), { currency })} ${Math.abs(perDay) < 1 ? "a week" : "a day"}${unit === "percent" || unit === "seconds" ? " of change" : ""}` : ""}
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12.5px] font-semibold text-ink-soft">Name</span>
              <input
                value={title}
                maxLength={80}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleTouched(true);
                }}
                className="mt-1 w-full rounded-lg border border-line/20 bg-surface px-3 h-9 text-[13.5px]"
              />
            </label>
            <label className="block">
              <span className="text-[12.5px] font-semibold text-ink-soft">Note (optional)</span>
              <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Why this target, the plan…" className="mt-1 w-full rounded-lg border border-line/20 bg-surface px-3 h-9 text-[13.5px]" />
            </label>
          </section>

          <section>
            <h3 className="text-[12.5px] font-semibold text-ink-soft mb-2">Colour</h3>
            <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Colour">
              {COLOR_WHEEL.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={COLOR_LABEL[c]}
                  title={COLOR_LABEL[c]}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-offset-surface scale-110" : "hover:scale-110"}`}
                  style={{ background: colorVar(c), ["--tw-ring-color" as string]: colorVar(c) }}
                />
              ))}
            </div>
          </section>
        </div>

        {/* What it will say, live. */}
        <aside className="rounded-2xl border border-line/10 bg-surface-2/40 p-4 h-fit lg:sticky lg:top-0 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: colorVar(color, 0.14), color: colorVar(color) }} aria-hidden>
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M14 7h7v7" />
              </svg>
            </span>
            <span className="text-[14px] font-semibold leading-tight break-words min-w-0">{title || "Projection"}</span>
          </div>
          <p className="text-[12.5px] text-ink-soft leading-snug">{sentence ?? "Set a target to see the sentence."}</p>
          <div className="text-[12px] text-ink-faint space-y-1">
            <p>
              Now: <b className="text-ink-soft">{formatValue(metric, preview.current, { currency })}</b>
            </p>
            <p>
              Deadline: <b className="text-ink-soft">{new Date(`${deadline}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</b>
            </p>
            <p>Its value is kept every morning; the team hears when it&rsquo;s reached.</p>
          </div>
          {problem && target.trim() !== "" && <p className="text-[12px] text-coral">{problem}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-line/15 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving || !!problem} className="flex-1 rounded-lg bg-amber text-white h-9 text-[12.5px] font-bold hover:brightness-110 disabled:opacity-50">
              {saving ? "Saving…" : editing ? "Save" : "Set it"}
            </button>
          </div>
        </aside>
      </div>
    </Dialog>
  );
}
