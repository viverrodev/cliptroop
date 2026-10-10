"use client";

import { useEffect, useState, useTransition } from "react";
import { setPalette } from "@/app/(dashboard)/settings/actions";
import { useToast } from "./toast-provider";
import { CheckIcon } from "./icons";

/*
 * Colour themes. The CSS for each lives in globals.css (html[data-palette]);
 * this file is the list, the device sync and the picker in Settings.
 * The choice is saved on the account (profiles.palette, migration 0060) and
 * cached on the device (localStorage "vp-palette") so the right colours are
 * on screen before the page paints (see the script in app/layout.tsx).
 */

export const PALETTES = [
  { id: "default", name: "Default", note: "Bone paper, orange", light: { paper: "237 238 231", surface: "255 255 255", accent: "232 99 13" }, dark: { paper: "18 15 11", surface: "28 24 17", accent: "232 99 13" } },
  { id: "coral", name: "Coral", note: "Peach paper, coral", light: { paper: "244 233 228", surface: "255 255 255", accent: "208 70 50" }, dark: { paper: "21 13 11", surface: "35 23 20", accent: "226 88 64" } },
  { id: "sand", name: "Sand", note: "Warm sand, golden brown", light: { paper: "243 237 225", surface: "255 253 249", accent: "161 98 7" }, dark: { paper: "20 16 10", surface: "33 27 18", accent: "178 120 8" } },
  { id: "solar", name: "Solar", note: "Cream paper, deep-sea blue", light: { paper: "248 241 222", surface: "255 252 242", accent: "33 113 181" }, dark: { paper: "0 28 36", surface: "6 36 45", accent: "45 140 210" } },
  { id: "cherry", name: "Cherry", note: "Rosy paper, cherry red", light: { paper: "242 233 233", surface: "255 255 255", accent: "200 30 48" }, dark: { paper: "20 11 12", surface: "33 21 23", accent: "229 62 74" } },
  { id: "berry", name: "Berry", note: "Blush, raspberry", light: { paper: "241 233 236", surface: "255 255 255", accent: "196 37 99" }, dark: { paper: "19 12 15", surface: "32 22 27", accent: "225 62 120" } },
  { id: "sakura", name: "Sakura", note: "Cherry blossom, leaf green", light: { paper: "245 233 238", surface: "255 255 255", accent: "46 125 72" }, dark: { paper: "20 13 16", surface: "35 24 29", accent: "64 150 92" } },
  { id: "orchid", name: "Orchid", note: "Pale lilac, orchid", light: { paper: "241 232 242", surface: "255 255 255", accent: "162 28 175" }, dark: { paper: "18 11 19", surface: "31 21 33", accent: "192 72 206" } },
  { id: "grape", name: "Grape", note: "Lavender, violet", light: { paper: "236 233 243", surface: "255 255 255", accent: "109 64 214" }, dark: { paper: "15 13 22", surface: "26 23 36", accent: "139 102 240" } },
  { id: "indigo", name: "Indigo", note: "Periwinkle, indigo", light: { paper: "234 234 245", surface: "255 255 255", accent: "79 70 229" }, dark: { paper: "13 13 24", surface: "24 24 41", accent: "109 100 240" } },
  { id: "ocean", name: "Ocean", note: "Cool grey-blue, blue", light: { paper: "233 237 242", surface: "255 255 255", accent: "37 99 235" }, dark: { paper: "12 15 21", surface: "21 26 35", accent: "59 130 246" } },
  { id: "sky", name: "Sky", note: "Icy blue, sky", light: { paper: "230 238 244", surface: "255 255 255", accent: "3 116 176" }, dark: { paper: "9 15 20", surface: "18 28 37", accent: "14 140 205" } },
  { id: "nord", name: "Nord", note: "Frost grey, steel blue", light: { paper: "229 233 240", surface: "255 255 255", accent: "76 106 150" }, dark: { paper: "22 26 33", surface: "34 39 49", accent: "98 134 178" } },
  { id: "lagoon", name: "Lagoon", note: "Sea glass, teal", light: { paper: "229 237 236", surface: "255 255 255", accent: "13 124 128" }, dark: { paper: "10 16 17", surface: "19 28 29", accent: "20 150 150" } },
  { id: "forest", name: "Forest", note: "Soft sage, green", light: { paper: "231 236 229", surface: "255 255 255", accent: "22 128 74" }, dark: { paper: "12 16 13", surface: "21 28 23", accent: "31 150 88" } },
  { id: "pine", name: "Pine", note: "Misty paper, deep pine", light: { paper: "230 236 233", surface: "255 255 255", accent: "22 101 72" }, dark: { paper: "10 16 13", surface: "19 29 24", accent: "34 140 100" } },
  { id: "lime", name: "Lime", note: "Pale olive, leaf green", light: { paper: "236 239 226", surface: "255 255 255", accent: "77 124 15" }, dark: { paper: "14 17 10", surface: "25 30 19", accent: "88 142 14" } },
  { id: "mocha", name: "Mocha", note: "Latte, coffee brown", light: { paper: "238 233 228", surface: "255 254 252", accent: "120 82 52" }, dark: { paper: "19 15 12", surface: "32 26 21", accent: "166 118 78" } },
  { id: "slate", name: "Slate", note: "Cool grey, graphite", light: { paper: "232 234 238", surface: "255 255 255", accent: "51 65 85" }, dark: { paper: "13 15 19", surface: "24 27 33", accent: "100 116 139" } },
  { id: "ink", name: "Ink", note: "Plain grey, black ink", light: { paper: "236 236 236", surface: "255 255 255", accent: "28 28 30" }, dark: { paper: "12 12 13", surface: "24 24 26", accent: "120 120 128" } },
  { id: "inkorange", name: "Ink Orange", note: "Ink's greys, orange buttons", light: { paper: "236 236 236", surface: "255 255 255", accent: "232 99 13" }, dark: { paper: "12 12 13", surface: "24 24 26", accent: "232 99 13" } },
  { id: "inkgrape", name: "Ink Grape", note: "Ink's greys, grape buttons", light: { paper: "236 236 236", surface: "255 255 255", accent: "109 64 214" }, dark: { paper: "12 12 13", surface: "24 24 26", accent: "139 102 240" } },
  { id: "inkorchid", name: "Ink Orchid", note: "Ink's greys, orchid buttons", light: { paper: "236 236 236", surface: "255 255 255", accent: "162 28 175" }, dark: { paper: "12 12 13", surface: "24 24 26", accent: "192 72 206" } },
  { id: "inkcherry", name: "Ink Cherry", note: "Ink's greys, cherry buttons", light: { paper: "236 236 236", surface: "255 255 255", accent: "200 30 48" }, dark: { paper: "12 12 13", surface: "24 24 26", accent: "229 62 74" } },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];
export const isPalette = (v: unknown): v is PaletteId => typeof v === "string" && PALETTES.some((p) => p.id === v);

const KEY = "vp-palette";
function apply(id: PaletteId | null) {
  try {
    const root = document.documentElement;
    if (!id || id === "default") {
      delete root.dataset.palette;
      localStorage.removeItem(KEY);
    } else {
      root.dataset.palette = id;
      localStorage.setItem(KEY, id);
    }
  } catch {
    /* private mode: the attribute still applies for this visit */
  }
}

/** Keeps this device on the account's colour theme (set on another device, say). */
export function PaletteSync({ palette }: { palette: string | null }) {
  useEffect(() => apply(isPalette(palette) ? palette : null), [palette]);
  return null;
}

const rgb = (v: string) => `rgb(${v.split(" ").join(",")})`;

/** Settings → Preferences → Colours: a little preview of each theme, light and dark. */
export function PaletteChoice({ value }: { value: string | null }) {
  const [current, setCurrent] = useState<PaletteId>(isPalette(value) ? value : "default");
  const [pending, start] = useTransition();
  const toast = useToast();
  function choose(id: PaletteId) {
    if (id === current) return;
    const prev = current;
    setCurrent(id);
    apply(id);
    start(async () => {
      const res = await setPalette(id === "default" ? null : id);
      if (res?.error) {
        setCurrent(prev);
        apply(prev);
        toast.error(res.error);
      } else toast.success(`Colour theme: ${PALETTES.find((p) => p.id === id)?.name ?? "Default"}`);
    });
  }
  return (
    <div role="radiogroup" aria-label="Colour theme" className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {PALETTES.map((p) => {
        const on = p.id === current;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={pending && !on}
            onClick={() => choose(p.id)}
            className={`group text-left rounded-xl border p-2 transition-all ${on ? "border-amber ring-2 ring-amber/30" : "border-line/15 hover:border-line/30 hover:-translate-y-0.5"}`}
          >
            {/* Light and dark side by side: paper, a card, the accent button. */}
            <span className="flex h-16 rounded-lg overflow-hidden border border-line/10" aria-hidden>
              {(["light", "dark"] as const).map((mode) => (
                <span key={mode} className="flex-1 p-2 flex flex-col gap-1.5" style={{ background: rgb(p[mode].paper) }}>
                  <span className="h-2 w-3/4 rounded-sm" style={{ background: rgb(p[mode].surface) }} />
                  <span className="h-2 w-1/2 rounded-sm" style={{ background: rgb(p[mode].surface) }} />
                  <span className="mt-auto h-3 w-9 rounded" style={{ background: rgb(p[mode].accent) }} />
                </span>
              ))}
            </span>
            <span className="mt-2 px-0.5 flex items-center gap-1.5">
              <span className="text-[13px] font-semibold flex-1 truncate">{p.name}</span>
              {on && <CheckIcon className="w-4 h-4 text-amber" />}
            </span>
            <span className="block px-0.5 text-[11.5px] text-ink-faint truncate">{p.note}</span>
          </button>
        );
      })}
    </div>
  );
}
