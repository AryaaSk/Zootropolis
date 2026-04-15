import { palette } from "../palette";
import { useTimeOfDay } from "./time-of-day";

/**
 * Returns the text color that should be used for 3D labels given the
 * current time of day. Dark ink on pastel ground during day/golden hour;
 * warm cream on dark indigo during night so the label stays legible.
 */
export function useLabelColor(): string {
  const { hour } = useTimeOfDay();
  // Night: 20:00 → 05:00 inclusive. Warm cream reads on dark blue fog.
  if (hour >= 20 || hour < 5) return palette.bone;
  // Deep sunset 19–20: borderline; use a warm off-white for safety.
  if (hour >= 19) return "#fff1df";
  return palette.ink;
}
