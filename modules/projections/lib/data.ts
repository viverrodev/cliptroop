import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { numbersVisibility, visibleRows } from "@/modules/analytics/lib/accounts";
import { dayInZone } from "@/modules/objectives/lib/periods";
import { addDays, type PContent, type PDaily, type PPost, type PRevenue, type ProjData } from "./compute";

/*
 * The numbers projections are worked out from, for one team: the platforms'
 * daily numbers and videos (only the accounts connected now, like Analytics),
 * revenue (the database only gives it to the people who see revenue), and
 * the shorts and long videos the team posted. Works with the person's own
 * client (pages) and the server's (the daily record).
 */

type Db = SupabaseClient<any, any, any>;
type Row = Record<string, unknown>;

/** Every row (PostgREST hands out 1,000 at a time). */
async function all(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, cap = 20_000): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error || !data) break;
    out.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

const CONTENT_BASE = "platform, kind, published_at, views, likes, comments, shares";
const CONTENT_MORE = `${CONTENT_BASE}, engaged_views, avg_view_seconds, avg_view_pct, subscribers_gained, skip_rate`;

export type Needs = { daily: boolean; content: boolean; revenue: boolean; posts: boolean };
export const NEED_ALL: Needs = { daily: true, content: true, revenue: true, posts: true };

export async function loadProjData(db: Db, teamId: string, today: string, tz: string, needs: Needs = NEED_ALL): Promise<ProjData> {
  // The longest window is 90 days; followers counts can be a while old.
  const from = addDays(today, -125);
  const postsFrom = `${addDays(today, -400)}T00:00:00Z`;
  const [vis, daily, content, revenue, shortPosts, longPosts, longs] = await Promise.all([
    numbersVisibility(db, teamId),
    needs.daily ? all((a, b) => db.from("analytics_daily").select("*").eq("team_id", teamId).gte("day", from).lte("day", addDays(today, 1)).order("day").range(a, b)) : Promise.resolve([] as Row[]),
    needs.content
      ? (async () => {
          const read = (cols: string) => db.from("analytics_content").select(cols).eq("team_id", teamId).gte("published_at", `${addDays(today, -95)}T00:00:00Z`).limit(2000);
          const first = await read(CONTENT_MORE);
          // Before migration 0079 the per-video analytics columns don't exist yet.
          return ((first.error ? (await read(CONTENT_BASE)).data : first.data) ?? []) as unknown as Row[];
        })()
      : Promise.resolve([] as Row[]),
    needs.revenue ? all((a, b) => db.from("analytics_revenue_daily").select("platform, day, content, revenue").eq("team_id", teamId).gte("day", from).lte("day", today).range(a, b)) : Promise.resolve([] as Row[]),
    needs.posts ? all((a, b) => db.from("short_video_posts").select("short_id, platform, posted_at, short_videos!inner(team_id)").eq("short_videos.team_id", teamId).gte("posted_at", postsFrom).range(a, b)) : Promise.resolve([] as Row[]),
    needs.posts ? all((a, b) => db.from("long_video_posts").select("project_id, platform, posted_at, long_video_projects!inner(team_id)").eq("long_video_projects.team_id", teamId).gte("posted_at", postsFrom).range(a, b)) : Promise.resolve([] as Row[]),
    needs.posts
      ? all((a, b) => db.from("long_video_projects").select("id, posted_at, published_at").eq("team_id", teamId).eq("stage", "done").or(`posted_at.gte.${postsFrom},published_at.gte.${postsFrom}`).range(a, b))
      : Promise.resolve([] as Row[]),
  ]);
  const posts: PPost[] = [];
  for (const r of shortPosts) if (typeof r.posted_at === "string") posts.push({ kind: "short", id: r.short_id as string, platform: (r.platform as string) ?? null, day: dayInZone(r.posted_at, tz) });
  for (const r of longPosts) if (typeof r.posted_at === "string") posts.push({ kind: "long", id: r.project_id as string, platform: null, day: dayInZone(r.posted_at, tz) });
  // Long videos marked done before platforms were ticked one by one.
  for (const r of longs) {
    const at = (r.published_at as string | null) ?? (r.posted_at as string | null);
    if (at) posts.push({ kind: "long", id: r.id as string, platform: null, day: dayInZone(at, tz) });
  }
  return {
    // Only the accounts connected now (a disconnected or replaced account's numbers never count).
    daily: visibleRows(daily, vis) as unknown as PDaily[],
    content: visibleRows(content, vis) as unknown as PContent[],
    revenue: visibleRows(revenue.map((r) => ({ ...r, platform: (r.platform as string | null) ?? "youtube" })), vis) as unknown as PRevenue[],
    posts,
  };
}
