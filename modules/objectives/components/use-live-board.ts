"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadObjectivesBoard } from "@/app/(dashboard)/objectives/actions";
import type { Board } from "../lib/types";

/*
 * The objectives board, live. Loaded through a server action (the same
 * numbers the page shows), then reloaded whenever the server records new
 * progress (objective_periods), a master changes an objective or one of its
 * per-period targets (realtime), when the tab comes back after a while, and
 * every few minutes (days left, pace). Widgets on the same team share one
 * request (and the library's previews reuse it).
 */

/** canEdit: the person is a master (the widget offers "New objective"); the page knows it already. */
export type LiveBoard = Board & { ready: boolean; canEdit?: boolean };
type Mode = "widget" | "page";
type Loaded = { board?: LiveBoard; error?: string };
const cache = new Map<string, { at: number; p: Promise<Loaded> }>();

function fetchBoard(teamId: string, mode: Mode, fresh = false): Promise<Loaded> {
  const key = `${teamId}:${mode}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 20_000) return hit.p;
  const p: Promise<Loaded> = loadObjectivesBoard(teamId, mode)
    .then((r): Loaded => (r.error !== undefined ? { error: r.error } : { board: r.board }))
    .catch((): Loaded => ({ error: "Couldn't load the objectives." }));
  cache.set(key, { at: Date.now(), p });
  return p;
}

export function useLiveBoard(teamId: string, mode: Mode, initial?: LiveBoard | null) {
  const [board, setBoard] = useState<LiveBoard | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(!initial);
  const last = useRef(initial ? Date.now() : 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (fresh: boolean) => {
      setBusy(true);
      return fetchBoard(teamId, mode, fresh).then((r) => {
        last.current = Date.now();
        setBusy(false);
        if (r.board) {
          setBoard(r.board);
          setError(null);
        } else if (r.error) {
          setError(r.error);
          cache.delete(`${teamId}:${mode}`);
        }
      });
    },
    [teamId, mode]
  );

  // A new initial board (the page re-rendered on the server) wins.
  useEffect(() => {
    if (initial) {
      setBoard(initial);
      last.current = Date.now();
    }
  }, [initial]);

  useEffect(() => {
    if (!initial) void load(false);
  }, [initial, load]);

  const soon = useCallback(
    (ms = 700) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(true), ms);
    },
    [load]
  );

  useEffect(() => {
    const supabase = createClient();
    const mine = (row: unknown) => (row as { team_id?: string } | null)?.team_id === teamId;
    const channel = supabase
      .channel(`objectives:${teamId}:${mode}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "objective_periods", filter: `team_id=eq.${teamId}` }, () => soon())
      // Deletes can't be filtered (they carry only the id): any delete reloads.
      .on("postgres_changes", { event: "*", schema: "public", table: "objectives" }, (p) => (p.eventType === "DELETE" || mine(p.new) ? soon(300) : undefined))
      .on("postgres_changes", { event: "*", schema: "public", table: "objective_targets" }, (p) => (p.eventType === "DELETE" || mine(p.new) ? soon(300) : undefined))
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > 60_000) soon(100);
    };
    document.addEventListener("visibilitychange", onVisible);
    const every = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5 * 60_000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [teamId, mode, soon, load]);

  return { board, error, busy, reload: () => load(true) };
}
