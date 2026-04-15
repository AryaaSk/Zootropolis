import { useEffect, useState } from "react";

const STORAGE_KEY = "zootropolis.containerInspector.open";

const subscribers = new Set<(value: boolean) => void>();

function readStored(defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // ignore
  }
  return defaultValue;
}

function writeStored(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
  for (const fn of subscribers) fn(value);
}

/**
 * Shared open/closed state for the campus ContainerInspector.
 * Persists to localStorage so it survives navigation + page reload.
 * Multiple components subscribe via a tiny module-level pub/sub so
 * they re-render in sync when the state flips.
 *
 * Used by both ContainerInspector (the drawer itself) AND each campus
 * view's outer layout — so the canvas width can shrink when the
 * sidebar is open instead of being covered by an overlay.
 */
export function useInspectorOpen(defaultValue = false): [boolean, (value: boolean | ((prev: boolean) => boolean)) => void] {
  const [open, setOpenLocal] = useState<boolean>(() => readStored(defaultValue));

  useEffect(() => {
    const cb = (next: boolean) => setOpenLocal(next);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  const setOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    setOpenLocal((prev) => {
      const next = typeof value === "function" ? (value as (p: boolean) => boolean)(prev) : value;
      writeStored(next);
      return next;
    });
  };

  return [open, setOpen];
}

/** Width the inspector occupies when open (kept in sync with the CSS). */
export const INSPECTOR_OPEN_WIDTH = 360;
