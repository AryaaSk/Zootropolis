import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTimeOfDay } from "../lib/time-of-day";

function hourLabel(h: number): string {
  const clamped = ((h % 24) + 24) % 24;
  const ampm = clamped < 12 ? "AM" : "PM";
  const displayHour = clamped === 0 ? 12 : clamped > 12 ? clamped - 12 : clamped;
  return `${displayHour}:00 ${ampm}`;
}

function hourDescriptor(h: number): string {
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 10) return "morning";
  if (h >= 10 && h < 16) return "midday";
  if (h >= 16 && h < 19) return "golden hour";
  if (h >= 19 && h < 21) return "sunset";
  return "night";
}

/**
 * Phase S1.5 — bottom-center slider that overrides the scene's time of day.
 *
 * Phase U: dark glass treatment matching the rest of the campus chrome.
 */
export function TimeOfDaySlider() {
  const { hour, auto, setHourOverride } = useTimeOfDay();
  return (
    <div
      // Phase W3: the bottom-left quadrant is now owned by
      // FocalContainerPanel. Offset to the right-of-center so the two
      // chrome elements don't collide.
      className="pointer-events-auto absolute bottom-4 left-[calc(50%+180px)] z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-2 text-xs text-foreground shadow-sm backdrop-blur-md"
    >
      <span className="w-24 tabular-nums text-muted-foreground">
        {hourLabel(hour)}
      </span>
      <input
        type="range"
        min={0}
        max={23}
        step={1}
        value={hour}
        onChange={(e) => setHourOverride(Number(e.target.value))}
        aria-label="Time of day"
        className="w-48 accent-primary"
      />
      <span className="w-20 italic text-muted-foreground">
        {hourDescriptor(hour)}
      </span>
      <Button
        type="button"
        variant={auto ? "default" : "ghost"}
        size="xs"
        onClick={() => setHourOverride(null)}
        className={cn("rounded-full", auto ? "" : "text-muted-foreground")}
        title={auto ? "Following your local clock" : "Click to follow your local clock"}
      >
        Auto
      </Button>
    </div>
  );
}
