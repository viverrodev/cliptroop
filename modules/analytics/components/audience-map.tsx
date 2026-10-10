"use client";

import { APP_NAME } from "@/lib/brand";
import { useState } from "react";
import type { Audience } from "../lib/queries";
import { MAP_MODES, type MapMode, type MapView } from "../lib/map-modes";
import { WorldMap } from "./world-map";
import dynamic from "next/dynamic";

export { MAP_MODES, type MapMode, type MapView };

// The 3D globe (drawing + turning + zoom) is only downloaded when it's shown.
const Globe = dynamic(() => import("./globe").then((m) => m.Globe), {
  ssr: false,
  loading: () => (
    <div className="w-full flex justify-center py-4" aria-hidden>
      <div className="w-[min(100%,220px)] aspect-square rounded-full bg-line/[0.06] animate-pulse" />
    </div>
  ),
});

/*
 * Where the audience is, by country: one platform's numbers, or all of them
 * together. "All platforms" colours each country by its average share of
 * every platform that shares countries, and its hover card lists each one.
 * Shown as the flat map or the 3D globe (Audience tab and the dashboard
 * widget use the same layers).
 */

type Row = { code: string; value: number };
type Source = { id: Exclude<MapMode, "all">; name: string; what: string; color: string; rows: Row[]; format: (n: number) => string };

const int = (n: number) => Math.round(n).toLocaleString("en-US");
const hours = (n: number) => `${int(n)} h`;
const pct = (n: number) => `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;

type MapData = Pick<Audience, "countries" | "followerCountries">;

export function sourcesOf(a: MapData): Source[] {
  const f = a.followerCountries ?? { instagram: [], facebook: [], tiktok: [] };
  return [
    { id: "views", name: "YouTube", what: "views", color: "rgb(var(--chart-yt))", rows: a.countries.map((c) => ({ code: c.code, value: c.views })), format: int },
    { id: "watch", name: "YouTube", what: "hours watched", color: "rgb(var(--chart-yt))", rows: a.countries.filter((c) => c.watchMinutes).map((c) => ({ code: c.code, value: Math.round((c.watchMinutes ?? 0) / 60) })), format: hours },
    { id: "instagram", name: "Instagram", what: "followers", color: "rgb(var(--chart-ig))", rows: f.instagram ?? [], format: int },
    { id: "tiktok", name: "TikTok", what: "followers", color: "rgb(var(--chart-tt))", rows: f.tiktok ?? [], format: int },
    { id: "facebook", name: "Facebook", what: "followers", color: "rgb(var(--chart-fb))", rows: f.facebook ?? [], format: int },
  ].map((s) => ({ ...s, rows: s.rows.filter((r) => r.value > 0).sort((x, y) => y.value - x.value) })) as Source[];
}

/** The rows, format and hover card for one mode. */
export function layerFor(a: MapData, mode: MapMode) {
  const sources = sourcesOf(a);
  if (mode !== "all") {
    const s = sources.find((x) => x.id === mode)!;
    return { rows: s.rows, format: s.format, tooltip: undefined, sources, label: MAP_MODES.find((m) => m.id === mode)!.label };
  }
  // Watch time follows views, so it doesn't count twice.
  const used = sources.filter((s) => s.id !== "watch" && s.rows.length);
  const totals = new Map(used.map((s) => [s.id, s.rows.reduce((t, r) => t + r.value, 0)]));
  const share = new Map<string, number>();
  for (const s of used) for (const r of s.rows) share.set(r.code, (share.get(r.code) ?? 0) + r.value / (totals.get(s.id) || 1) / used.length);
  const rows = [...share.entries()].map(([code, value]) => ({ code, value })).sort((x, y) => y.value - x.value);
  const tooltip = (code: string) => (
    <div className="mt-0.5 space-y-0.5">
      {sources
        .filter((s) => s.rows.length)
        .map((s) => {
          const v = s.rows.find((r) => r.code === code)?.value ?? 0;
          const t = s.rows.reduce((x, r) => x + r.value, 0);
          return (
            <div key={s.id} className="flex items-center gap-1.5 text-ink-soft">
              <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: s.color }} aria-hidden />
              <span className="flex-1">
                {s.name} {s.what}
              </span>
              <b className="text-ink tabular-nums ml-3">{v ? s.format(v) : "–"}</b>
              <span className="w-11 text-right tabular-nums text-ink-faint">{v && t ? pct(v / t) : ""}</span>
            </div>
          );
        })}
      <div className="pt-1 mt-1 border-t border-line/10 text-ink-soft">
        Share of your audience: <b className="text-ink tabular-nums">{pct(share.get(code) ?? 0)}</b>
      </div>
    </div>
  );
  return { rows, format: pct, tooltip, sources, label: "All platforms" };
}

/** Why a layer is empty (said on the map itself). */
export function emptyText(mode: MapMode, youtubeReady: boolean) {
  switch (mode) {
    case "views":
    case "watch":
    case "all":
      return youtubeReady ? "Country numbers arrive with the next sync. YouTube shares them two or three days late." : "Connect YouTube (with stats allowed) to fill the map.";
    case "instagram":
      return "Instagram shares followers by country for accounts with 100+ followers. They arrive with the next sync.";
    case "facebook":
      return "Facebook shares followers by country for Pages with 100+ followers (when it does for your Page). They arrive with the next sync.";
    case "tiktok":
      return `TikTok doesn't share followers by country with apps like ${APP_NAME} yet (only its own business tools show them).`;
  }
}

/** The map or globe for a layer, with the list beside / under it. */
export function AudienceMapView({
  a,
  mode,
  view,
  youtubeReady,
  compact = false,
  globeSize,
  list,
}: {
  a: MapData;
  mode: MapMode;
  view: MapView;
  youtubeReady: boolean;
  compact?: boolean;
  globeSize?: number;
  /** Renders the country list (the card's own layout decides where). */
  list?: (rows: Row[], format: (n: number) => string, hover: { code: string | null; set: (c: string | null) => void }) => React.ReactNode;
}) {
  const layer = layerFor(a, mode);
  const [focus, setFocus] = useState<string | null>(null);
  const [onMap, setOnMap] = useState<string | null>(null);
  const label = `${view === "globe" ? "Globe" : "World map"}: ${layer.label} by country`;
  const empty = emptyText(mode, youtubeReady);
  return (
    <>
      {view === "globe" ? (
        <Globe data={layer.rows} format={layer.format} tooltip={layer.tooltip} label={label} empty={empty} compact={compact} focus={focus} maxSize={globeSize} onHover={setOnMap} />
      ) : (
        <WorldMap data={layer.rows} format={layer.format} tooltip={layer.tooltip} label={label} empty={empty} compact={compact} />
      )}
      {list?.(layer.rows, layer.format, { code: onMap ?? focus, set: setFocus })}
    </>
  );
}
