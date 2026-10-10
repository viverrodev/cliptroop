import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatform, isShortType, type Platform } from "@/modules/short-videos/lib/constants";
import { addDays } from "./periods";
import type { Need } from "./metrics";
import type { DailyRow, LongSrc, PostSrc, ShortSrc, Sources, StageSrc } from "./types";
import { numbersVisibility, visibleRows } from "@/modules/analytics/lib/accounts";

/*
 * Loads exactly the rows the objectives need, for one team and a range of
 * the team's local days. Works with the signed-in person's client (pages:
 * the database's rules decide what they see) and with the admin client
 * (the server's own counting, lib/sync.ts).
 */

/** Either client: the signed-in person's (typed) or the admin one (untyped). */
export type Db = SupabaseClient<any, any, any>;
type Row = Record<string, unknown>;

/** Every row of a query (the database hands out 1,000 at a time). */
async function all<T = Row>(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, cap = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error || !data) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

/** The same query for a long list of ids, 100 at a time (all pages of each). */
async function byIds<T = Row>(ids: string[], make: (chunk: string[], from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const parts = await Promise.all(chunks.map((c) => all<T>((a, b) => make(c, a, b))));
  return parts.flat();
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const platformsOf = (v: unknown): Platform[] => (Array.isArray(v) ? v.filter(isPlatform) : []);

export const SHORT_COLS = "id, entry_number, title, platforms, short_type, created_at, created_by, editor_member_id, reviewer_member_id, scheduler_member_id, short_scripters(team_member_id)";
export const LONG_COLS =
  "id, entry_number, title, platforms, video_type, stage, created_at, created_by, filmed_at, filmed_by, edited_at, edited_by, posted_at, published_at, project_assignees(stage, team_member_id), long_video_scripters(team_member_id)";

function toShort(r: Row): ShortSrc {
  return {
    id: r.id as string,
    number: Number(r.entry_number ?? 0),
    title: (r.title as string) ?? "",
    platforms: platformsOf(r.platforms),
    type: isShortType(r.short_type) ? r.short_type : "filler",
    createdAt: (r.created_at as string) ?? new Date(0).toISOString(),
    createdBy: str(r.created_by),
    scripters: ((r.short_scripters as { team_member_id: string }[] | null) ?? []).map((s) => s.team_member_id).filter(Boolean),
    editor: str(r.editor_member_id),
    reviewer: str(r.reviewer_member_id),
    scheduler: str(r.scheduler_member_id),
  };
}

function toLong(r: Row): LongSrc {
  return {
    id: r.id as string,
    number: Number(r.entry_number ?? 0),
    title: (r.title as string) ?? "",
    platforms: platformsOf(r.platforms),
    types: Array.isArray(r.video_type) ? (r.video_type as string[]) : [],
    stage: (r.stage as string) ?? "",
    createdAt: (r.created_at as string) ?? new Date(0).toISOString(),
    createdBy: str(r.created_by),
    filmedAt: str(r.filmed_at),
    filmedBy: str(r.filmed_by),
    editedAt: str(r.edited_at),
    editedBy: str(r.edited_by),
    postedAt: str(r.posted_at) ?? (r.stage === "done" ? str(r.published_at) : null),
    assignees: ((r.project_assignees as { stage: string; team_member_id: string }[] | null) ?? []).map((a) => ({ stage: String(a.stage), member: a.team_member_id })).filter((a) => a.member),
    scripters: ((r.long_video_scripters as { team_member_id: string }[] | null) ?? []).map((s) => s.team_member_id).filter(Boolean),
  };
}

function pushTo<T>(map: Map<string, T[]>, key: string, v: T) {
  const cur = map.get(key);
  if (cur) cur.push(v);
  else map.set(key, [v]);
}

/**
 * The rows for `needs`, between two local days (both included). Times are
 * read with a day to spare on each side, so every time zone's days are
 * covered (lib/hits.ts keeps only the right ones).
 */
export async function loadSources(db: Db, teamId: string, needs: Set<Need>, from: string, to: string, tz: string): Promise<Sources> {
  const fromIso = `${addDays(from, -1)}T00:00:00Z`;
  const toIso = `${addDays(to, 2)}T00:00:00Z`;
  const need = (n: Need) => needs.has(n);
  const none = Promise.resolve([] as Row[]);

  const [members, recentShortPosts, createdShorts, recentStages, recentLongPosts, legacyLongs, createdLongs, filmedLongs, editedLongs, daily] = await Promise.all([
    all((a, b) => db.from("team_members").select("id, user_id").eq("team_id", teamId).range(a, b)),
    need("shortPosts")
      ? all((a, b) => db.from("short_video_posts").select("short_id, short_videos!inner(team_id)").eq("short_videos.team_id", teamId).gte("posted_at", fromIso).lt("posted_at", toIso).range(a, b))
      : none,
    need("shortsCreated") ? all((a, b) => db.from("short_videos").select(SHORT_COLS).eq("team_id", teamId).gte("created_at", fromIso).lt("created_at", toIso).range(a, b)) : none,
    need("shortStages")
      ? all((a, b) =>
          db
            .from("short_video_events")
            .select("short_id, short_videos!inner(team_id)")
            .eq("short_videos.team_id", teamId)
            .eq("kind", "stage")
            .in("to_stage", ["review", "ready", "posted"])
            .gte("created_at", fromIso)
            .lt("created_at", toIso)
            .range(a, b)
        )
      : none,
    need("longPosts")
      ? all((a, b) => db.from("long_video_posts").select("project_id, long_video_projects!inner(team_id)").eq("long_video_projects.team_id", teamId).gte("posted_at", fromIso).lt("posted_at", toIso).range(a, b))
      : none,
    // Long videos marked Posted before platforms were ticked one by one (no rows in long_video_posts).
    need("longPosts")
      ? all((a, b) =>
          db
            .from("long_video_projects")
            .select(LONG_COLS)
            .eq("team_id", teamId)
            .eq("stage", "done")
            .or(`and(posted_at.gte.${fromIso},posted_at.lt.${toIso}),and(published_at.gte.${fromIso},published_at.lt.${toIso})`)
            .range(a, b)
        )
      : none,
    need("longsCreated") ? all((a, b) => db.from("long_video_projects").select(LONG_COLS).eq("team_id", teamId).gte("created_at", fromIso).lt("created_at", toIso).range(a, b)) : none,
    need("longsFilmed") ? all((a, b) => db.from("long_video_projects").select(LONG_COLS).eq("team_id", teamId).gte("filmed_at", fromIso).lt("filmed_at", toIso).range(a, b)) : none,
    need("longsEdited") ? all((a, b) => db.from("long_video_projects").select(LONG_COLS).eq("team_id", teamId).gte("edited_at", fromIso).lt("edited_at", toIso).range(a, b)) : none,
    need("daily")
      ? Promise.all([
          all((a, b) =>
            db
              .from("analytics_daily")
              .select("platform, day, content, views, likes, watch_minutes, followers_gained, followers_lost, followers, total_views, total_likes")
              .eq("team_id", teamId)
              .gte("day", addDays(from, -1))
              .lte("day", addDays(to, 1))
              .range(a, b)
          ),
          numbersVisibility(db, teamId),
          // Only the accounts connected now count (a disconnected or replaced account's numbers never do).
        ]).then(([rows, vis]) => visibleRows(rows, vis))
      : none,
  ]);

  const shortPostIds = [...new Set(recentShortPosts.map((r) => r.short_id as string).filter(Boolean))];
  const stageIds = [...new Set(recentStages.map((r) => r.short_id as string).filter(Boolean))];
  const longPostIds = [...new Set(recentLongPosts.map((r) => r.project_id as string).filter(Boolean))];

  // The whole story of each short / long video that moved in the range: an
  // earlier first post (or an earlier move into review) means it doesn't count again.
  const shorts = new Map<string, ShortSrc>();
  for (const r of createdShorts) shorts.set(r.id as string, toShort(r));
  const longs = new Map<string, LongSrc>();
  for (const r of [...legacyLongs, ...createdLongs, ...filmedLongs, ...editedLongs]) longs.set(r.id as string, toLong(r));
  const missingShorts = [...new Set([...shortPostIds, ...stageIds])].filter((id) => !shorts.has(id));
  const missingLongs = longPostIds.filter((id) => !longs.has(id));

  const [allShortPosts, allStages, moreShorts, allLongPosts, moreLongs] = await Promise.all([
    shortPostIds.length ? byIds(shortPostIds, (c, a, b) => db.from("short_video_posts").select("short_id, platform, posted_at").in("short_id", c).range(a, b)) : [],
    stageIds.length ? byIds(stageIds, (c, a, b) => db.from("short_video_events").select("short_id, to_stage, created_at").in("short_id", c).eq("kind", "stage").in("to_stage", ["review", "ready", "posted"]).range(a, b)) : [],
    missingShorts.length ? byIds(missingShorts, (c, a, b) => db.from("short_videos").select(SHORT_COLS).in("id", c).range(a, b)) : [],
    longPostIds.length ? byIds(longPostIds, (c, a, b) => db.from("long_video_posts").select("project_id, platform, posted_at").in("project_id", c).range(a, b)) : [],
    missingLongs.length ? byIds(missingLongs, (c, a, b) => db.from("long_video_projects").select(LONG_COLS).in("id", c).range(a, b)) : [],
  ]);
  for (const r of moreShorts) shorts.set(r.id as string, toShort(r));
  for (const r of moreLongs) longs.set(r.id as string, toLong(r));

  const shortPosts = new Map<string, PostSrc[]>();
  for (const r of allShortPosts) if (isPlatform(r.platform) && typeof r.posted_at === "string") pushTo(shortPosts, r.short_id as string, { platform: r.platform, at: r.posted_at });
  const shortStages = new Map<string, StageSrc[]>();
  for (const r of allStages) if (typeof r.created_at === "string") pushTo(shortStages, r.short_id as string, { stage: String(r.to_stage), at: r.created_at });
  const longPosts = new Map<string, PostSrc[]>();
  for (const r of allLongPosts) if (isPlatform(r.platform) && typeof r.posted_at === "string") pushTo(longPosts, r.project_id as string, { platform: r.platform, at: r.posted_at });

  const userMember = new Map<string, string>();
  for (const m of members) if (m.user_id) userMember.set(m.user_id as string, m.id as string);

  return { tz, shorts, shortPosts, shortStages, longs, longPosts, daily: daily as unknown as DailyRow[], userMember };
}

