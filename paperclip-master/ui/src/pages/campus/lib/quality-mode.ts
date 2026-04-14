/**
 * Phase G6 — performance escape hatch.
 *
 * The default Zootropolis campus aesthetic uses procedural shaders,
 * postprocess bloom + cel-shade, GLB-style decorations, idle micro-anims,
 * per-window flicker, and atmospheric sky/fog. On a 2020 MacBook Air with
 * 50 agents the target is 60fps. If you're hitting <50fps:
 *
 *   http://localhost:5173/campus/<companyId>?lq=1
 *
 * skips:
 *   - shader materials (falls back to flat Lambert)
 *   - postprocess pass (bloom, cel-shade)
 *   - decorations (trees, lampposts, clouds, chimneys, benches)
 *   - per-window flicker (windows render solid)
 *   - idle micro-animations (animals/lights stand still when not pulsing)
 *
 * Heartbeat pulses + status colors + camera transitions still work — the
 * load-bearing signals stay on.
 *
 * The flag is read from the URL on render. A future v1.2 settings page
 * will surface it; for now it's hidden so it doesn't tempt people into
 * turning off the nice visuals by default.
 */

export function isLowQualityMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const v = (params.get("lq") ?? "").toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  } catch {
    return false;
  }
}

/**
 * Memoised hook variant. Subscribes to popstate so toggling the URL
 * mid-session updates rendering without a hard reload.
 */
import { useEffect, useState } from "react";

export function useLowQualityMode(): boolean {
  const [lq, setLq] = useState(() => isLowQualityMode());
  useEffect(() => {
    const onChange = () => setLq(isLowQualityMode());
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return lq;
}
