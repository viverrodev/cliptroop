import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { getCachedUser } from "@/lib/supabase/get-user";
import { readLayout } from "@/modules/dashboard/layout";
import { getObjectivesBoard } from "@/modules/objectives/lib/board";
import { syncObjectives } from "@/modules/objectives/lib/sync";
import { getProjectionsBoard } from "@/modules/projections/lib/board";
import { queueRecordIfDue } from "@/modules/projections/lib/record";
// One view per visit: each loads only its own code.
import { ObjectivesView, ProjectionsView } from "./views";

export const metadata: Metadata = { title: "Objectives" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Objectives or Projections. */
function Tabs({ view }: { view: "objectives" | "projections" }) {
  const tab = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3.5 h-8 text-[13px] font-semibold transition-colors ${on ? "bg-ink text-paper shadow-sm" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`;
  return (
    <nav className="mb-5 inline-flex rounded-xl border border-line/15 bg-surface p-1 gap-1" aria-label="Objectives or projections">
      <Link href="/objectives" aria-current={view === "objectives" ? "page" : undefined} className={tab(view === "objectives")}>
        Objectives
      </Link>
      <Link href="/objectives?view=projections" aria-current={view === "projections" ? "page" : undefined} className={tab(view === "projections")}>
        Projections
      </Link>
    </nav>
  );
}

/**
 * The team's goals, live (1.14.0), and its long-term projections (1.15.0).
 * ?o=<id> opens an objective, ?view=projections&p=<id> a projection (where
 * notifications lead).
 */
export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ o?: string; view?: string; p?: string }> }) {
  const { o, view, p } = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;

  if (view === "projections") {
    const [membership, board] = await Promise.all([getMembership(supabase, currentTeam.id), getProjectionsBoard(supabase, currentTeam.id)]);
    // Today's values, in the background, if the morning's record hasn't run yet.
    if (board.ready && board.projections.length)
      queueRecordIfDue(
        currentTeam.id,
        board.projections.filter((x) => !x.archived).map((x) => ({ id: x.id, deadline: x.deadline, ended: !!x.endedAt, hasToday: x.points.some((pt) => pt.day === board.today) })),
        board.today
      );
    return (
      <div className="px-4 sm:px-8 py-5 sm:py-8 w-full max-w-[1500px] mx-auto">
        <Tabs view="projections" />
        <ProjectionsView initial={board} canEdit={isMaster(membership?.roles ?? [])} openId={p && UUID.test(p) ? p : null} />
      </div>
    );
  }

  const user = await getCachedUser();
  const [membership, board, { data: profile }] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    getObjectivesBoard(supabase, currentTeam.id, { history: "full", items: true }),
    supabase.from("profiles").select("dashboard_layout").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  // The server's own count, after the page is sent (at most every 30 s): a
  // goal reached by something no action told it about still gets celebrated.
  if (board.ready && board.objectives.some((x) => !x.paused)) {
    const teamId = currentTeam.id;
    after(() => syncObjectives(teamId, { throttle: 30 }).then(() => undefined, (e) => console.error("[objectives] page sync", e instanceof Error ? e.message : e)));
  }
  const onDashboard = readLayout((profile as { dashboard_layout?: unknown } | null)?.dashboard_layout).widgets.some((w) => w.type === "objectives");
  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 w-full max-w-[1500px] mx-auto">
      <Tabs view="objectives" />
      <ObjectivesView initial={board} teamId={currentTeam.id} canEdit={isMaster(membership?.roles ?? [])} openId={o && UUID.test(o) ? o : null} onDashboard={onDashboard} />
    </div>
  );
}
