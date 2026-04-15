import type { ZootropolisLayer } from "@paperclipai/shared";

/**
 * Tailwind class for each Zootropolis layer pill. Matches the badge used
 * in OrgChart.tsx so the layer reads the same everywhere it appears
 * (inspector drawer, floating agent screens, org chart).
 */
export const LAYER_PILL_CLASS: Record<ZootropolisLayer, string> = {
  agent: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  room: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  floor: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  building: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  campus: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

/**
 * Helper for call sites that may use the synthetic "campus-root" label
 * (for CampusView and the drawer's top-level view). Maps it to the campus
 * pill class.
 */
export function layerPillClass(
  layer: ZootropolisLayer | "campus-root",
): string {
  return layer === "campus-root" ? LAYER_PILL_CLASS.campus : LAYER_PILL_CLASS[layer];
}
