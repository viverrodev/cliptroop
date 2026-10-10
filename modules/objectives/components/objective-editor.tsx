"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { CheckIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { PLATFORM_META, SHORT_TYPES, SHORT_TYPE_META } from "@/modules/short-videos/lib/constants";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";
import { createObjective, previewObjective, updateObjective } from "@/app/(dashboard)/objectives/actions";
import {
  COLOR_LABEL,
  GROUP_LABEL,
  LONG_TYPES,
  METRICS,
  METRIC_ORDER,
  COLOR_WHEEL,
  cleanFilters,
  colorVar,
  describe,
  draftProblem,
  formatAmount,
  nextColor,
  sameFilters,
  suggestTitle,
  unitFor,
  type MetricGroup,
  type MetricId,
  type ObjectiveFilters,
} from "../lib/metrics";
import { PERIODS, PERIOD_NAME, THIS, type PeriodKind } from "../lib/periods";
import type { ObjectiveView } from "../lib/types";
import { HistoryBars, Meter, ObjectiveIcon, StatusPill } from "./parts";

/*
 * Set or change an objective (masters, Team → Objectives): what to count,
 * which platforms (on any of them, or only them), types, whose work, how
 * often and the target, with a live preview of what it counts right now and
 * how the last few periods would have gone.
 */

export type EditorSeed = { metric: MetricId; period: PeriodKind; target: number; filters: ObjectiveFilters; title?: string; color?: string };
type Draft = { title: string; metric: MetricId; period: PeriodKind; target: number; filters: ObjectiveFilters; color: string };

const EVERY_UNIT: Record<PeriodKind, string> = { day: "a day", week: "a week", month: "a month", quarter: "a quarter", year: "a year" };
const PERIOD_WORD: Record<PeriodKind, string> = { day: "days", week: "weeks", month: "months", quarter: "quarters", year: "years" };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="py-4 border-b border-line/10 last:border-none first:pt-0">
      <h3 className="text-[12.5px] font-bold text-ink">{title}</h3>
      {hint && <p className="text-[12px] text-ink-faint mt-0.5">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Chip({ on, onClick, children, disabled, title }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 h-9 text-[12.5px] font-semibold transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
        on ? "border-amber/60 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl border border-line/15 p-0.5 max-w-full">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`px-3 h-8 rounded-[9px] text-[12.5px] font-semibold transition-colors disabled:opacity-40 ${value === o.value ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_rgb(var(--line)/0.12)]" : "text-ink-soft hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function fromView(o: ObjectiveView): Draft {
  return { title: o.title, metric: (o.metric as MetricId) ?? "shorts_posted", period: o.period, target: o.target, filters: o.filters, color: o.color };
}

export function ObjectiveEditor({
  open,
  onClose,
  teamId,
  people,
  objective,
  seed,
  usedColors,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  people: TeamPerson[];
  objective?: ObjectiveView | null;
  seed?: EditorSeed | null;
  usedColors: string[];
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const editing = !!objective;
  const start = useMemo<Draft>(() => {
    if (objective) return fromView(objective);
    const s = seed ?? { metric: "shorts_posted" as MetricId, period: "week" as PeriodKind, target: METRICS.shorts_posted.suggest.week, filters: {} };
    return { title: s.title ?? "", metric: s.metric, period: s.period, target: s.target, filters: cleanFilters(s.metric, s.filters), color: s.color ?? nextColor(usedColors) };
  }, [objective, seed, usedColors]);
  const [d, setD] = useState<Draft>(start);
  const [titleTouched, setTitleTouched] = useState(editing);
  const [targetTouched, setTargetTouched] = useState(editing);
  const [group, setGroup] = useState<MetricGroup>(METRICS[start.metric].group);
  const [saving, startSaving] = useTransition();
  useEffect(() => {
    if (!open) return;
    setD(start);
    setTitleTouched(!!objective || !!seed?.title);
    setTargetTouched(!!objective);
    setGroup(METRICS[start.metric].group);
  }, [open, start, objective, seed]);

  const m = METRICS[d.metric];
  const filters = cleanFilters(d.metric, d.filters);
  const memberName = filters.member ? people.find((p) => p.memberId === filters.member)?.name ?? null : null;
  const title = titleTouched ? d.title : suggestTitle({ metric: d.metric, filters }, memberName);
  const sentence = describe({ metric: d.metric, period: d.period, target: d.target || 1, filters }, memberName);

  const setMetric = (metric: MetricId) => {
    setD((x) => {
      const f = cleanFilters(metric, x.filters);
      return { ...x, metric, filters: f, target: targetTouched ? x.target : METRICS[metric].suggest[x.period] };
    });
  };
  const setPeriod = (period: PeriodKind) => setD((x) => ({ ...x, period, target: targetTouched ? x.target : METRICS[x.metric].suggest[period] }));
  const setFilters = (patch: Partial<ObjectiveFilters>) => setD((x) => ({ ...x, filters: { ...x.filters, ...patch } }));
  const togglePlatform = (p: (typeof m.platforms)[number]) => {
    const cur = d.filters.platforms ?? [];
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    setFilters({ platforms: next, ...(next.length ? {} : { only: false }) });
  };

  // ---- Live preview (what it counts right now) -----------------------------
  const [preview, setPreview] = useState<{ view: ObjectiveView | null; error: string | null; loading: boolean }>({ view: null, error: null, loading: false });
  const seq = useRef(0);
  const key = JSON.stringify({ m: d.metric, p: d.period, t: d.target, f: filters });
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    setPreview((p) => ({ ...p, loading: true }));
    const t = setTimeout(async () => {
      try {
        const r = await previewObjective(teamId, { title: title || "Preview", metric: d.metric, period: d.period, target: Math.max(1, d.target || 1), filters, color: d.color }, objective?.id ?? null);
        if (n !== seq.current) return;
        setPreview(r.error !== undefined ? { view: null, error: r.error, loading: false } : { view: r.view, error: null, loading: false });
      } catch {
        if (n === seq.current) setPreview({ view: null, error: "The preview didn't load.", loading: false });
      }
    }, 450);
    return () => clearTimeout(t);
    // The key covers what the preview depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, teamId]);

  async function save() {
    const problem = draftProblem({ title, metric: d.metric, period: d.period, target: d.target, color: d.color });
    if (problem) return void toast.error(problem);
    if (objective) {
      const redefined = objective.metric !== d.metric || objective.period !== d.period || !sameFilters(cleanFilters(d.metric, objective.filters), filters);
      if (redefined) {
        const ok = await confirm({
          title: "Count it differently?",
          description: `${objective.period !== d.period ? "Its targets for single periods and its" : "Its"} recorded wins are cleared, and its history is worked out again with the new rule.`,
          confirmLabel: "Save the change",
        });
        if (!ok) return;
      }
    }
    startSaving(async () => {
      const input = { title: title.trim(), metric: d.metric, period: d.period, target: d.target, filters, color: d.color };
      const r = objective ? await updateObjective(objective.id, input) : await createObjective(teamId, input);
      if (r.error !== undefined) return void toast.error(r.error);
      toast.success(objective ? "Objective saved" : "Objective set. Everyone on the team can see it now.");
      onClose();
    });
  }

  const v = preview.view;
  const suggestions = [...new Set([m.suggest[d.period], Math.round(m.suggest[d.period] / 2), m.suggest[d.period] * 2].filter((x) => x >= 1))].sort((a, b) => a - b);
  const hasFilters = m.platforms.length > 0 || m.shortTypes || m.longTypes || m.content || m.member;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit objective" : "New objective"}
      description="A goal for the whole team. Everyone sees it fill up live."
      width="sm:max-w-4xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg border border-line/15 px-3.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-amber text-white px-4 h-9 text-[13px] font-bold disabled:opacity-60 hover:brightness-110">
            {saving ? "Saving…" : editing ? "Save" : "Set objective"}
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Section title="What to count">
            <div className="mb-2.5">
              <Segmented
                label="Kind of goal"
                value={group}
                onChange={setGroup}
                options={(["posting", "making", "audience"] as MetricGroup[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {METRIC_ORDER.filter((id) => METRICS[id].group === group).map((id) => {
                const x = METRICS[id];
                const on = d.metric === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMetric(id)}
                    className={`text-left flex items-start gap-2.5 rounded-xl border p-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                      on ? "border-amber/60 bg-amber/[0.07] ring-1 ring-amber/30" : "border-line/15 hover:border-line/30"
                    }`}
                  >
                    <ObjectiveIcon icon={x.icon} color={d.color} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight">{x.label}</span>
                      <span className="block text-[11.5px] text-ink-faint leading-snug mt-0.5">{x.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {hasFilters && (
            <Section title="Which ones" hint="Leave a group empty to count them all.">
              <div className="space-y-3">
                {m.platforms.length > 0 && (
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Platforms</div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.platforms.map((p) => (
                        <Chip key={p} on={!!d.filters.platforms?.includes(p)} onClick={() => togglePlatform(p)}>
                          <PlatformIcon platform={p} className="w-5 h-5 rounded-[5px]" />
                          {PLATFORM_META[p].name}
                        </Chip>
                      ))}
                    </div>
                    {m.only && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Segmented
                          label="Platform rule"
                          value={filters.only ? "only" : "any"}
                          onChange={(v) => setFilters({ only: v === "only" })}
                          options={[
                            { value: "any", label: "Posted there" },
                            { value: "only", label: "Only there", disabled: !filters.platforms?.length },
                          ]}
                        />
                      </div>
                    )}
                    {m.only && filters.platforms?.length ? (
                      <p className="text-[11.5px] text-ink-faint mt-1.5">
                        {filters.only ? "Only the ones planned for nowhere else, like Instagram-only reels." : "Counted the first time it goes out on one of these, wherever else it goes too."}
                      </p>
                    ) : null}
                  </div>
                )}
                {m.content && (
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">{d.metric === "views" ? "Views on" : "Posts of"}</div>
                    <Segmented
                      label="Shorts or long videos"
                      value={filters.content ?? "all"}
                      onChange={(v) => setFilters({ content: v === "all" ? undefined : v })}
                      options={[
                        { value: "all", label: "Everything" },
                        { value: "shorts", label: "Shorts" },
                        { value: "long", label: "Long videos" },
                      ]}
                    />
                    {d.metric === "views" && filters.content && <p className="text-[11.5px] text-ink-faint mt-1.5">Only YouTube splits Shorts from long videos, so this counts YouTube.</p>}
                  </div>
                )}
                {m.shortTypes && (
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Short types</div>
                    <div className="flex flex-wrap gap-1.5">
                      {SHORT_TYPES.map((t) => {
                        const on = !!d.filters.shortTypes?.includes(t);
                        return (
                          <Chip key={t} on={on} onClick={() => setFilters({ shortTypes: on ? (d.filters.shortTypes ?? []).filter((x) => x !== t) : [...(d.filters.shortTypes ?? []), t] })}>
                            {SHORT_TYPE_META[t].color && <span className="w-2 h-2 rounded-[3px]" style={{ background: SHORT_TYPE_META[t].color! }} aria-hidden />}
                            {SHORT_TYPE_META[t].label}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                )}
                {m.longTypes && (
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Long video types</div>
                    <div className="flex flex-wrap gap-1.5">
                      {LONG_TYPES.map((t) => {
                        const on = !!d.filters.longTypes?.includes(t);
                        return (
                          <Chip key={t} on={on} onClick={() => setFilters({ longTypes: on ? (d.filters.longTypes ?? []).filter((x) => x !== t) : [...(d.filters.longTypes ?? []), t] })}>
                            {t}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                )}
                {m.member && (
                  <div>
                    <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Whose work</div>
                    <div className="max-w-xs">
                      <Select
                        value={filters.member ?? null}
                        onChange={(v) => setFilters({ member: v ?? undefined })}
                        emptyOption="The whole team"
                        ariaLabel="Whose work"
                        options={people.map((p) => ({ value: p.memberId, label: p.name, icon: <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />, hint: p.username && p.username !== p.name ? `@${p.username}` : undefined }))}
                      />
                    </div>
                    {filters.member && <p className="text-[11.5px] text-ink-faint mt-1.5">Counts the ones {memberName ?? "they"} {m.member}.</p>}
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title="How often" hint="It starts over every period, in the team's time zone. Weeks run Monday to Sunday.">
            <Segmented label="How often" value={d.period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: PERIOD_NAME[p] }))} />
          </Section>

          <Section title="Target" hint="You can change it for single periods later (Change a period's target).">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-xl border border-line/20 h-10 overflow-hidden">
                <button
                  type="button"
                  aria-label="Less"
                  onClick={() => {
                    setTargetTouched(true);
                    setD((x) => ({ ...x, target: Math.max(1, x.target - (x.target > 100 ? Math.round(x.target / 10) : 1)) }));
                  }}
                  className="w-9 h-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
                >
                  <MinusIcon className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1_000_000_000}
                  value={Number.isFinite(d.target) && d.target > 0 ? d.target : ""}
                  onChange={(e) => {
                    setTargetTouched(true);
                    setD((x) => ({ ...x, target: Math.max(0, Math.min(1_000_000_000, Math.round(Number(e.target.value) || 0))) }));
                  }}
                  aria-label="Target"
                  className="w-24 h-full bg-transparent text-center text-[15px] font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label="More"
                  onClick={() => {
                    setTargetTouched(true);
                    setD((x) => ({ ...x, target: Math.min(1_000_000_000, x.target + (x.target >= 100 ? Math.round(x.target / 10) : 1)) }));
                  }}
                  className="w-9 h-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-[13px] text-ink-soft">
                {unitFor(d.metric, d.target, filters)} {EVERY_UNIT[d.period]}
              </span>
              <span className="flex flex-wrap gap-1 ml-auto">
                {suggestions.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setTargetTouched(true);
                      setD((x) => ({ ...x, target: n }));
                    }}
                    className={`rounded-lg px-2 h-7 text-[12px] font-semibold tabular-nums border ${d.target === n ? "border-amber/60 bg-amber/10" : "border-line/15 text-ink-soft hover:text-ink"}`}
                  >
                    {formatAmount(d.metric, n)}
                  </button>
                ))}
              </span>
            </div>
          </Section>

          <Section title="Name and colour">
            <input
              value={title}
              onChange={(e) => {
                setTitleTouched(true);
                setD((x) => ({ ...x, title: e.target.value.slice(0, 80) }));
              }}
              maxLength={80}
              aria-label="Name"
              className="w-full rounded-xl border border-line/20 bg-transparent px-3 h-10 text-[14px] font-semibold outline-none focus:border-amber/60"
            />
            {titleTouched && (
              <button
                type="button"
                onClick={() => {
                  setTitleTouched(false);
                  setD((x) => ({ ...x, title: "" }));
                }}
                className="mt-1 text-[11.5px] font-semibold text-ink-faint hover:text-ink"
              >
                Use the suggested name
              </button>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
              {COLOR_WHEEL.map((c) => {
                const on = d.color === c;
                const taken = usedColors.includes(c) && objective?.color !== c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${COLOR_LABEL[c]}${taken ? " (another objective has it)" : ""}`}
                    title={`${COLOR_LABEL[c]}${taken ? " (another objective has it)" : ""}`}
                    onClick={() => setD((x) => ({ ...x, color: c }))}
                    className={`relative w-8 h-8 rounded-lg transition-transform hover:scale-110 ${on ? "ring-2 ring-offset-2 ring-offset-surface ring-ink" : ""}`}
                    style={{ background: colorVar(c) }}
                  >
                    {on && <CheckIcon className="absolute inset-0 m-auto w-4 h-4 text-white" />}
                    {taken && !on && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-surface ring-1 ring-line/30" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        {/* The preview: the sentence, this period so far, the last few. */}
        <aside className="lg:sticky lg:top-0 self-start rounded-2xl border border-line/10 bg-surface-2/40 p-4 space-y-3" aria-live="polite">
          <div className="flex items-start gap-2.5">
            <ObjectiveIcon icon={m.icon} platform={filters.platforms?.length === 1 ? filters.platforms[0] : d.metric === "watch_hours" ? "youtube" : null} color={d.color} />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-tight break-words">{title || "Objective"}</div>
              <div className="text-[12px] text-ink-soft leading-snug mt-0.5">{sentence}</div>
            </div>
          </div>
          {preview.error ? (
            <p className="text-[12px] text-ink-faint">{preview.error}</p>
          ) : !v ? (
            <div className="space-y-2" aria-busy="true">
              <div className="skeleton h-7 w-24 rounded" />
              <div className="skeleton h-2.5 w-full rounded-full" />
              <div className="skeleton h-14 w-full rounded" />
            </div>
          ) : (
            <div className={`space-y-3 transition-opacity ${preview.loading ? "opacity-60" : ""}`}>
              <div>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="font-display text-[26px] font-semibold leading-none tabular-nums">{formatAmount(d.metric, v.current.value)}</span>
                  <span className="text-[12.5px] text-ink-soft">
                    of {formatAmount(d.metric, v.current.target)} {THIS[d.period]}
                  </span>
                  <StatusPill status={v.current.status} className="ml-auto" />
                </div>
                <Meter value={v.current.value} target={v.current.target} expected={v.current.expected} color={d.color} height={8} className="mt-2" />
              </div>
              <div>
                <HistoryBars periods={v.history} color={d.color} kind={d.period} metric={d.metric} height={52} />
                <p className="text-[11.5px] text-ink-faint mt-1.5">
                  {(() => {
                    const past = v.history.slice(0, -1).filter((p) => p.target > 0);
                    const won = past.filter((p) => p.reached).length;
                    return past.length ? `Reached ${won} of the last ${past.length} ${PERIOD_WORD[d.period]} with this target.` : "No history yet.";
                  })()}
                </p>
              </div>
              {m.lagDays > 0 && <p className="text-[11.5px] text-ink-faint">Platform numbers arrive a day late (copied every morning).</p>}
            </div>
          )}
        </aside>
      </div>
    </Dialog>
  );
}
