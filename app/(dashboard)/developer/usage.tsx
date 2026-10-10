import { ExternalIcon } from "@/components/ui/icons";
import { bucketLabel, loadUsage, planLimits, supabaseUsageUrl } from "./data";
import { fmtBytes, fmtNum } from "./format";
import { PeopleTable, TablesList, TeamsTable } from "./usage-tables";
import { card, h2, Meter, ShareRow, UploadsChart, Widget } from "./ui";

/**
 * Usage: everything the app stores. The plan's two limits first (database,
 * file storage), then what's counted, uploads per day, storage per kind of
 * file, every team, every person and the biggest tables.
 */
export async function UsageTab() {
  const { usage, error } = await loadUsage();
  const plan = planLimits();
  if (!usage)
    return (
      <section className={`${card} p-6 text-center`}>
        <p className="text-[14px] font-semibold">Usage isn&rsquo;t available</p>
        <p className="mt-1 text-[13px] text-ink-soft">{error ?? "Try again in a moment."}</p>
      </section>
    );
  const c = usage.counts;
  const bucketTotal = usage.buckets.reduce((t, b) => t + b.bytes, 0);
  const tiles: [string, number, string?][] = [
    ["Accounts", c.people, `${fmtNum(c.people7)} this week · ${fmtNum(c.people30)} this month`],
    ["Teams", c.teams],
    ["Shorts", c.shorts],
    ["Long videos", c.longs],
    ["Video files", c.videoFiles, `${fmtBytes(c.videoBytes)} · ${fmtNum(c.videoFilesCleaned)} cleaned up`],
    ["Scripts", c.scripts],
    ["Posts published", c.postsPublished],
    ["Tasks done", c.tasksDone],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Widget title={`Database · ${plan.name} plan`}>
          <Meter used={usage.database.bytes} limit={plan.database} />
        </Widget>
        <Widget title={`File storage · ${plan.name} plan`}>
          <Meter used={usage.storage.bytes} limit={plan.storage} />
          <p className="mt-2 text-[12px] text-ink-soft tabular-nums">{fmtNum(usage.storage.files)} files</p>
        </Widget>
        <Widget title="Counted by Supabase only">
          <p className="text-[12.5px] text-ink-soft leading-relaxed">
            Downloads (egress, {plan.egress} a month included) and monthly active sign-ins ({plan.people} included) are only counted by Supabase. Biggest single upload on this plan:{" "}
            {plan.upload}.
          </p>
          <a href={supabaseUsageUrl()} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-amber hover:underline">
            Supabase usage page
            <ExternalIcon className="w-3.5 h-3.5" />
          </a>
          <p className="mt-2 text-[11.5px] text-ink-faint">
            {plan.name === "Free" ? "Limits shown for the Free plan. On Pro, set SUPABASE_PLAN=pro in Vercel." : "Limits shown for the Pro plan (SUPABASE_PLAN=pro). Pro bills past them instead of stopping."}
          </p>
        </Widget>
      </div>

      <section className={`${card} p-4`}>
        <h2 className={`${h2} mb-3`}>What&rsquo;s stored</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
          {tiles.map(([label, n, sub]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[12px] text-ink-soft">{label}</dt>
              <dd className="font-display text-[24px] leading-tight font-semibold tabular-nums">{fmtNum(n)}</dd>
              {sub && <dd className="text-[11.5px] text-ink-faint truncate">{sub}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-5 items-start scroll-mt-24" id="storage">
        <div className="lg:col-span-3 flex flex-col gap-4 min-w-0">
          <Widget title="Uploads per day, 30 days">
            <UploadsChart days={usage.uploads} height={120} />
            <p className="mt-3 text-[12px] text-ink-soft">
              {fmtNum(usage.uploads.reduce((t, d) => t + d.files, 0))} files, {fmtBytes(usage.uploads.reduce((t, d) => t + d.bytes, 0))} in 30 days. Short videos are deleted after posting, on each team&rsquo;s
              schedule (Team → Defaults → Video files), so storage goes down too.
            </p>
          </Widget>
          <StorageOutlook uploads={usage.uploads} used={usage.storage.bytes} limit={plan.storage} buckets={usage.buckets} cleaned={c.videoFilesCleaned} />
        </div>
        <Widget title="Storage by kind of file" className="lg:col-span-2">
          {usage.buckets.length ? (
            <ul className="-my-2">
              {usage.buckets.map((b) => (
                <ShareRow key={b.id} label={bucketLabel(b.id)} sub={b.id} value={b.bytes} total={bucketTotal} right={<><b className="text-ink">{fmtBytes(b.bytes)}</b> · {fmtNum(b.files)}</>} />
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-soft">No files yet.</p>
          )}
        </Widget>
      </div>

      <section className={`${card} p-4 scroll-mt-24`} id="teams">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h2 className={h2}>Teams</h2>
          <span className="text-[12px] text-ink-faint">{fmtNum(usage.teams.length)}</span>
        </div>
        <p className="text-[12.5px] text-ink-soft mb-3">
          Files: everything stored for the team (videos, thumbnails, sketches…). Data: its rows in the database and, from them, about how much of the database it takes. Click a column to sort.
        </p>
        <TeamsTable teams={usage.teams} />
      </section>

      <section className={`${card} p-4 scroll-mt-24`} id="people">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h2 className={h2}>Everyone</h2>
          <span className="text-[12px] text-ink-faint">{fmtNum(usage.people.length)}</span>
        </div>
        <p className="text-[12.5px] text-ink-soft mb-3">Every account: its teams, when it last signed in, what it uploaded and how many tasks it finished.</p>
        <PeopleTable people={usage.people} />
      </section>

      <section className={`${card} p-4 scroll-mt-24`} id="tables">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h2 className={h2}>Database tables</h2>
          <span className="text-[12px] text-ink-faint">{fmtBytes(usage.database.bytes)} in all</span>
        </div>
        <p className="text-[12.5px] text-ink-soft mb-3">The biggest tables with their indexes. Rows of ours are exact; Supabase&rsquo;s own (auth, storage…) are estimates (≈).</p>
        <TablesList tables={usage.tables} total={usage.database.bytes} />
      </section>

      <p className="text-[11.5px] text-ink-faint">
        Counted <span className="tabular-nums">{new Date(usage.at).toISOString().slice(0, 16).replace("T", " ")}</span> UTC, when this page opened.
      </p>
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Where file storage is heading, from the last 30 days of uploads: the pace,
 * this week against the one before, the busiest day, the average file, how
 * much room the plan has left and when it would run out at this pace (before
 * clean-ups take videos away), and which weekdays the uploads come on.
 */
function StorageOutlook({ uploads, used, limit, buckets, cleaned }: { uploads: { day: string; files: number; bytes: number }[]; used: number; limit: number; buckets: { id: string; bytes: number }[]; cleaned: number }) {
  const today = new Date();
  const dayAgo = (n: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n)).toISOString().slice(0, 10);
  const sum = (from: number, to: number, f: (d: { files: number; bytes: number }) => number) => uploads.filter((d) => d.day >= dayAgo(from) && d.day <= dayAgo(to)).reduce((t, d) => t + f(d), 0);
  const bytes30 = sum(29, 0, (d) => d.bytes);
  const files30 = sum(29, 0, (d) => d.files);
  const week = sum(6, 0, (d) => d.bytes);
  const before = sum(13, 7, (d) => d.bytes);
  const change = before > 0 ? Math.round(((week - before) / before) * 100) : null;
  const perDay = bytes30 / 30;
  const busiest = uploads.reduce<{ day: string; bytes: number } | null>((b, d) => (!b || d.bytes > b.bytes ? d : b), null);
  const room = Math.max(0, limit - used);
  const daysLeft = perDay > 0 ? Math.floor(room / perDay) : null;
  const videos = buckets.find((b) => b.id === "review-videos")?.bytes ?? 0;
  const total = buckets.reduce((t, b) => t + b.bytes, 0);
  const byWeekday = WEEKDAYS.map(() => 0);
  for (const d of uploads) byWeekday[(new Date(`${d.day}T00:00:00Z`).getUTCDay() + 6) % 7] += d.bytes;
  const maxWeekday = Math.max(1, ...byWeekday);
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const tiles: { label: string; value: React.ReactNode; sub: React.ReactNode }[] = [
    { label: "A day, on average", value: fmtBytes(perDay), sub: `${(files30 / 30).toFixed(1)} files a day` },
    {
      label: "This week",
      value: fmtBytes(week),
      sub: change === null ? "nothing the week before" : <span className={change > 0 ? "text-gold" : change < 0 ? "text-green" : ""}>{change > 0 ? `${change}% more` : change < 0 ? `${-change}% less` : "the same"} than the week before</span>,
    },
    { label: "Average file", value: files30 ? fmtBytes(bytes30 / files30) : "–", sub: `${fmtNum(files30)} files in 30 days` },
    { label: "Busiest day", value: busiest && busiest.bytes ? fmtBytes(busiest.bytes) : "–", sub: busiest && busiest.bytes ? label(busiest.day) : "no uploads yet" },
    { label: "Short videos", value: total ? `${Math.round((videos / total) * 100)}%` : "–", sub: `of storage · ${fmtNum(cleaned)} cleaned up so far` },
    {
      label: "Room left",
      value: fmtBytes(room),
      sub: daysLeft === null ? "no uploads to measure a pace" : <span className={daysLeft < 30 ? "text-red" : daysLeft < 90 ? "text-gold" : ""}>{daysLeft > 3650 ? "years at this pace" : daysLeft < 1 ? "less than a day at this pace" : `≈ ${fmtNum(daysLeft)} day${Math.round(daysLeft) === 1 ? "" : "s"} at this pace`}</span>,
    },
  ];
  return (
    <Widget title="Where storage is heading">
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0">
            <dt className="text-[12px] text-ink-soft">{t.label}</dt>
            <dd className="font-display text-[22px] leading-tight font-semibold tabular-nums truncate">{t.value}</dd>
            <dd className="text-[11.5px] text-ink-faint">{t.sub}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 pt-4 border-t border-line/10">
        <div className="text-[12px] text-ink-soft mb-2">Uploads by weekday, 30 days</div>
        <div className="flex items-end gap-2 h-[72px]" role="img" aria-label={WEEKDAYS.map((w, i) => `${w}: ${fmtBytes(byWeekday[i])}`).join(", ")}>
          {WEEKDAYS.map((w, i) => (
            <span key={w} className="group flex-1 h-full flex flex-col items-center justify-end gap-1" title={`${w}: ${fmtBytes(byWeekday[i])}`}>
              <span className={`block w-full max-w-[24px] rounded-t-[4px] ${byWeekday[i] ? "bg-amber/80 group-hover:bg-amber" : "bg-line/10"}`} style={{ height: byWeekday[i] ? `${Math.max(6, (byWeekday[i] / maxWeekday) * 100)}%` : 2 }} />
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex gap-2 text-[11px] text-ink-faint">
          {WEEKDAYS.map((w) => (
            <span key={w} className="flex-1 text-center">
              {w}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-faint">The pace counts uploads only; clean-ups after posting take short videos away again, so storage grows slower than this.</p>
    </Widget>
  );
}
