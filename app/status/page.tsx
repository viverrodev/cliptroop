import { APP_NAME } from "@/lib/brand";
import type { Metadata } from "next";
import { publicMetadata } from "@/lib/public-pages";
import Link from "next/link";
import { getCachedUser } from "@/lib/supabase/get-user";
import { isDeveloper } from "@/lib/errors";
import { coreChecks, jobChecks, PARTS, partName, statusHistory, statusIncidents, VENDORS, vendorChecks, worst, type Level } from "@/lib/status";
import { BAR_COLOR, durationText, LEVEL, type BarView } from "@/lib/status-levels";
import { Brand } from "@/components/ui/clip-logo";
import { AlertIcon, CheckIcon, ChevronRightIcon, ExternalIcon } from "@/components/ui/icons";
import { AutoRefresh, BarsAxis, BarsLegend, LocalTime, StatusBars } from "@/components/status/status-board";

export const metadata: Metadata = publicMetadata("/status", "Status", `Is ${APP_NAME} working right now? Live status and the last 3 days, hour by hour.`);
export const dynamic = "force-dynamic";

const HOURS = 72;

const BANNER: Record<Level, { title: string; box: string; icon: string }> = {
  ok: { title: "Everything is working", box: "border-green/30 bg-green/10", icon: "bg-green" },
  warn: { title: "Mostly working", box: "border-gold/35 bg-gold/10", icon: "bg-gold" },
  down: { title: "Something isn't working", box: "border-red/35 bg-red/10", icon: "bg-red" },
  unknown: { title: "Checking…", box: "border-line/15 bg-surface", icon: "bg-line/40" },
};

/**
 * The public status page: is the app working, and how it went the last
 * 3 days, hour by hour (recorded every 10 minutes, migration 0067). Only
 * levels, never details: errors and every check in full are on
 * /developer. One team's problems (a post that failed, an account to
 * reconnect) are on that team's Posting page.
 */
export default async function StatusPage() {
  const [core, jobs, vendors, history, incidents, user] = await Promise.all([
    coreChecks(),
    jobChecks(),
    vendorChecks(),
    statusHistory(HOURS),
    statusIncidents(7),
    getCachedUser(),
  ]);
  const developer = await isDeveloper(user);

  // Right now: the app answered this request, so "Website and app" is up.
  const now: Record<string, Level> = { app: "ok" };
  for (const c of [...core, ...jobs]) if (c.publicPart) now[c.key] = c.level;
  const overall = worst(PARTS.map((p) => now[p.key] ?? "unknown").filter((l) => l !== "unknown"));
  const affected = PARTS.filter((p) => now[p.key] === "down" || now[p.key] === "warn");
  const vendorNow = Object.fromEntries(vendors.map((v) => [v.key, v.level]));

  // Levels only: no details leave the server on this page.
  const bars = (key: string): BarView[] => (history.bars[key] ?? []).map(({ hour, level, samples, warn, down }) => ({ hour, level, samples, warn, down }));
  const shownIncidents = incidents
    .filter((i) => PARTS.some((p) => p.key === i.part) || VENDORS.some((v) => v.key === i.part))
    // Ongoing first, then newest first.
    .sort((a, b) => Number(!b.endedAt) - Number(!a.endedAt) || b.startedAt.localeCompare(a.startedAt))
    .slice(0, 30);

  const Part = ({ k, name, caption, href }: { k: string; name: string; caption?: string; href?: string }) => {
    const level: Level = (k in vendorNow ? vendorNow[k] : now[k]) ?? "unknown";
    return (
      <li className="py-4">
        <div className="flex items-center gap-3 mb-2.5">
          <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1.5">
                {name}
                <ExternalIcon className="w-3.5 h-3.5 text-ink-faint" />
              </a>
            ) : (
              name
            )}
            {caption && <span className="ml-1.5 text-[12px] font-normal text-ink-faint">{caption}</span>}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap ${LEVEL[level].tone}`}>
            <span className={`w-2 h-2 rounded-full ${LEVEL[level].dot}`} aria-hidden />
            {LEVEL[level].label}
          </span>
        </div>
        <StatusBars name={name} bars={bars(k)} />
        <BarsAxis hours={HOURS} uptime={history.uptime[k] ?? null} />
      </li>
    );
  };

  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:py-12">
      <AutoRefresh />
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/dashboard" aria-label={APP_NAME}>
            <Brand />
          </Link>
          <span className="text-[12px] text-ink-faint">System status</span>
        </header>

        <section className={`rounded-2xl border px-5 py-4 flex items-start gap-3.5 ${BANNER[overall].box}`}>
          <span className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 ${BANNER[overall].icon}`} aria-hidden>
            {overall === "ok" ? <CheckIcon className="w-4 h-4" /> : <AlertIcon className="w-4 h-4" />}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-semibold leading-tight">{BANNER[overall].title}</h1>
            {affected.length > 0 && (
              <p className="text-[13.5px] mt-1">
                {affected.map((p, i) => (
                  <span key={p.key}>
                    {i > 0 && (i === affected.length - 1 ? " and " : ", ")}
                    <b>{p.name}</b>
                  </span>
                ))}{" "}
                {affected.length === 1 ? (now[affected[0].key] === "down" ? "isn\u2019t working right now." : "isn\u2019t fully working right now.") : "aren\u2019t fully working right now."}
              </p>
            )}
            <p className="text-[12.5px] text-ink-soft mt-1">
              Checked <LocalTime iso={new Date().toISOString()} date={false} />. This page checks again every minute.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-line/10 bg-surface px-5 pt-4 pb-1">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">{APP_NAME}</h2>
            <span className="text-[11.5px] text-ink-faint">One bar per hour · hover or tap a bar</span>
          </div>
          <ul className="divide-y divide-line/10">
            {PARTS.map((p) => (
              <Part key={p.key} k={p.key} name={p.name} />
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line/10 bg-surface px-5 pt-4 pb-1">
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">Services {APP_NAME} runs on</h2>
          <ul className="divide-y divide-line/10">
            {VENDORS.map((v) => (
              <Part key={v.key} k={v.key} name={v.name} caption={v.what} href={v.url} />
            ))}
          </ul>
        </section>

        <BarsLegend />

        <section className="rounded-2xl border border-line/10 bg-surface px-5 py-4">
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink-faint mb-1">Past 7 days</h2>
          {shownIncidents.length === 0 ? (
            <p className="py-2 text-[13.5px] text-ink-soft">{history.since ? "No problems in the last 7 days." : "Nothing recorded yet. The history fills in from the first check (every 10 minutes)."}</p>
          ) : (
            <>
              {/* The latest three; the rest fold away. */}
              <ul className="divide-y divide-line/10">
                {shownIncidents.slice(0, 3).map((i) => (
                  <IncidentItem key={`${i.part}-${i.startedAt}`} i={i} />
                ))}
              </ul>
              {shownIncidents.length > 3 && (
                <details className="group border-t border-line/10">
                  <summary className="list-none cursor-pointer select-none flex items-center gap-1.5 py-3 text-[12.5px] font-semibold text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                    <ChevronRightIcon className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                    <span className="group-open:hidden">Show {shownIncidents.length - 3} more</span>
                    <span className="hidden group-open:inline">Show fewer</span>
                  </summary>
                  <ul className="divide-y divide-line/10 border-t border-line/10">
                    {shownIncidents.slice(3).map((i) => (
                      <IncidentItem key={`${i.part}-${i.startedAt}`} i={i} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-line/10 bg-surface px-5 py-4 text-[13px] text-ink-soft space-y-1.5">
          <p>
            <b className="text-ink">A problem with one of your posts or accounts?</b> That&rsquo;s shown to your team on the{" "}
            <Link href="/posting" className="text-amber font-semibold hover:underline">
              Posting page
            </Link>{" "}
            (a post that failed, an account to reconnect). This page is only about {APP_NAME} as a whole.
          </p>
          {developer && (
            <p>
              <Link href="/developer" className="text-amber font-semibold hover:underline">
                Developer page
              </Link>{" "}
              for errors and every check in full (only you see that link).
            </p>
          )}
        </section>

        <p className="text-center text-[11.5px] text-ink-faint">
          v{process.env.NEXT_PUBLIC_APP_VERSION} · For uptime monitors: /api/health answers 200 when the core is up, 503 when it isn&rsquo;t.
        </p>
      </div>
    </main>
  );
}

type Incident = Awaited<ReturnType<typeof statusIncidents>>[number];

function IncidentItem({ i }: { i: Incident }) {
  const end = i.endedAt ? Date.parse(i.endedAt) : Date.now();
  return (
    <li className="py-3 flex items-start gap-3">
      <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${BAR_COLOR[i.level]}`} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold">
          {partName(i.part)} · {i.level === "down" ? "not working" : "slow or partly working"}
          {!i.endedAt && <span className="ml-2 rounded-full bg-red/15 text-red px-2 py-0.5 text-[11px] font-bold">Ongoing</span>}
        </span>
        <span className="block text-[12.5px] text-ink-soft">
          <LocalTime iso={i.startedAt} /> · {i.endedAt ? `for ${durationText(end - Date.parse(i.startedAt))}` : `for ${durationText(end - Date.parse(i.startedAt))} so far`}
        </span>
      </span>
    </li>
  );
}
