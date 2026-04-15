import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface TimeOfDayContextValue {
  /** The effective hour (0-23) used by the environment. */
  hour: number;
  /** True when hour follows the user's local clock; false when manually overridden. */
  auto: boolean;
  /** Set the override hour (0-23). Pass `null` to resume auto mode. */
  setHourOverride: (hour: number | null) => void;
}

const TimeOfDayContext = createContext<TimeOfDayContextValue | null>(null);

/**
 * Phase S1.5 — user-controllable time-of-day.
 *
 * By default the environment (drei <Environment> preset, light colors,
 * fog tint) follows the user's local clock hour. When the user drags the
 * TimeOfDaySlider in the overlay, this context holds the override; any
 * component that calls `useTimeOfDay()` re-renders with the new hour.
 */
export function TimeOfDayProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<number | null>(null);
  const value = useMemo<TimeOfDayContextValue>(() => {
    const hour = override ?? new Date().getHours();
    return { hour, auto: override === null, setHourOverride: setOverride };
  }, [override]);
  return (
    <TimeOfDayContext.Provider value={value}>{children}</TimeOfDayContext.Provider>
  );
}

/**
 * Read the current effective hour. Outside a provider, falls back to the
 * user's local clock (auto mode) so individual components work without
 * requiring the provider to be mounted.
 */
export function useTimeOfDay(): TimeOfDayContextValue {
  const ctx = useContext(TimeOfDayContext);
  if (ctx) return ctx;
  return {
    hour: new Date().getHours(),
    auto: true,
    setHourOverride: () => {
      // no-op outside provider — keeps the hook safe to call anywhere
    },
  };
}
