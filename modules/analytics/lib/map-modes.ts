/*
 * The audience map's layers (the Audience tab and the dashboard widget).
 * Kept apart from the drawing code so the widget's settings can list them
 * without downloading the map.
 */

export type MapMode = "all" | "views" | "watch" | "instagram" | "tiktok" | "facebook";
export type MapView = "map" | "globe";

export const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: "all", label: "All platforms" },
  { id: "views", label: "YouTube views" },
  { id: "watch", label: "YouTube watch time" },
  { id: "instagram", label: "Instagram followers" },
  { id: "tiktok", label: "TikTok followers" },
  { id: "facebook", label: "Facebook followers" },
];
