import { useMemo } from "react";
import { Environment, Stars } from "@react-three/drei";
import { palette } from "../palette";
import { useTimeOfDay } from "../lib/time-of-day";

interface CampusEnvironmentProps {
  /** Override the fog color. Default: palette.mist, adjusted by time-of-day. */
  fogColor?: string;
  /** Near distance where fog starts (world units). */
  fogNear?: number;
  /** Far distance where fog is fully opaque. */
  fogFar?: number;
  /**
   * drei Environment preset. If omitted, auto-picks from the user's
   * local time (Phase S note: requested by user — "map the environment
   * to the same time of day as the user").
   */
  preset?: Preset;
  /** Disable the three-light rig. */
  bareLights?: boolean;
  /** Deprecated — kept for API compatibility; drei <SoftShadows> was
   * removed because it breaks Lambert shadow shaders on three r150+. */
  softShadows?: boolean;
}

type Preset =
  | "sunset"
  | "dawn"
  | "park"
  | "apartment"
  | "forest"
  | "city"
  | "studio"
  | "warehouse"
  | "night"
  | "lobby";

interface TimeOfDayRig {
  preset: Preset;
  fogColor: string;
  keyPosition: [number, number, number];
  keyColor: string;
  keyIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fillColor: string;
  fillIntensity: number;
  environmentIntensity: number;
}

function pickRigForLocalHour(hour: number): TimeOfDayRig {
  // 5–7: dawn (cool pink-peach). 7–10: morning (bright, clean).
  // 10–16: midday (park, overhead, saturated).
  // 16–19: golden hour (warm, long shadows). 19–21: sunset (deep peach).
  // 21–5: night (moonlit, cool blue).
  if (hour >= 5 && hour < 7) {
    return {
      preset: "dawn",
      fogColor: "#f6d4c3",
      keyPosition: [14, 4, -2],
      keyColor: "#ffc9b0",
      keyIntensity: 1.8,
      ambientColor: "#ffe6d6",
      ambientIntensity: 0.45,
      hemiSky: "#ffd9c0",
      hemiGround: "#9ab0b8",
      hemiIntensity: 0.6,
      fillColor: "#b0c8df",
      fillIntensity: 0.35,
      environmentIntensity: 0.9,
    };
  }
  if (hour >= 7 && hour < 10) {
    return {
      preset: "park",
      fogColor: "#e4eef3",
      keyPosition: [12, 11, 4],
      keyColor: "#fff3d8",
      keyIntensity: 2.4,
      ambientColor: "#ffffff",
      ambientIntensity: 0.4,
      hemiSky: "#cfe5ee",
      hemiGround: "#d4c8a7",
      hemiIntensity: 0.5,
      fillColor: "#c7d4e3",
      fillIntensity: 0.3,
      environmentIntensity: 1.0,
    };
  }
  if (hour >= 10 && hour < 16) {
    return {
      preset: "park",
      fogColor: "#e0ecf2",
      keyPosition: [6, 14, 6],
      keyColor: "#fff9e6",
      keyIntensity: 2.8,
      ambientColor: "#ffffff",
      ambientIntensity: 0.45,
      hemiSky: "#d1e7f1",
      hemiGround: palette.sage,
      hemiIntensity: 0.55,
      fillColor: "#d8e6f2",
      fillIntensity: 0.25,
      environmentIntensity: 1.1,
    };
  }
  if (hour >= 16 && hour < 19) {
    return {
      preset: "sunset",
      fogColor: palette.mist,
      keyPosition: [12, 9, 5],
      keyColor: "#ffe0b3",
      keyIntensity: 2.6,
      ambientColor: "#fff0e0",
      ambientIntensity: 0.35,
      hemiSky: "#ffd3a5",
      hemiGround: "#8eb7c9",
      hemiIntensity: 0.55,
      fillColor: "#a0c4ff",
      fillIntensity: 0.4,
      environmentIntensity: 1.0,
    };
  }
  if (hour >= 19 && hour < 21) {
    return {
      preset: "sunset",
      fogColor: "#e8a88a",
      keyPosition: [14, 3, 2],
      keyColor: "#ff9c7a",
      keyIntensity: 2.0,
      ambientColor: "#d9b9a8",
      ambientIntensity: 0.35,
      hemiSky: "#e09a80",
      hemiGround: "#4a5a73",
      hemiIntensity: 0.5,
      fillColor: "#6d85ad",
      fillIntensity: 0.4,
      environmentIntensity: 0.85,
    };
  }
  // Night (21–5).
  return {
    preset: "night",
    fogColor: "#24304a",
    keyPosition: [-6, 8, -4],
    keyColor: "#b9c9ff",
    keyIntensity: 0.9,
    ambientColor: "#425478",
    ambientIntensity: 0.4,
    hemiSky: "#2e3c5c",
    hemiGround: "#0e1422",
    hemiIntensity: 0.45,
    fillColor: "#6a80b8",
    fillIntensity: 0.25,
    environmentIntensity: 0.55,
  };
}

/**
 * CampusEnvironment — Phase S1 (time-of-day aware).
 *
 * Mounts (inside a <Canvas> with `shadows` enabled):
 *  - drei <Environment> — preset auto-picked from the user's local hour
 *    so midday visits look bright, evening visits look warm and
 *    cinematic, midnight visits look moonlit blue. Override via
 *    `preset` prop.
 *  - Warm/cool fog tuned to the hour.
 *  - A three-light rig (key + cool fill + hemisphere + ambient) whose
 *    colors and intensities also follow the hour.
 *  - <SoftShadows> registered once at the root for PCF soft shadows.
 */
export function CampusEnvironment({
  fogColor,
  fogNear = 32,
  fogFar = 140,
  preset,
  bareLights = false,
}: CampusEnvironmentProps) {
  const { hour } = useTimeOfDay();
  const rig = useMemo(() => pickRigForLocalHour(hour), [hour]);
  const activePreset = preset ?? rig.preset;
  const activeFog = fogColor ?? rig.fogColor;
  const isNight = hour >= 21 || hour < 5;

  return (
    <>
      <fog attach="fog" args={[activeFog, fogNear, fogFar]} />

      <Environment
        preset={activePreset}
        background
        blur={0.5}
        environmentIntensity={rig.environmentIntensity}
      />

      {/* Phase S7: twinkling stars at night. Large radius so they read
          as distant sky, not specks near the island. `depth` puts them
          behind everything without needing a skybox hack. */}
      {isNight && (
        <Stars
          radius={220}
          depth={60}
          count={3000}
          factor={4}
          saturation={0.2}
          fade
          speed={0.6}
        />
      )}

      {!bareLights && (
        <>
          <ambientLight intensity={rig.ambientIntensity} color={rig.ambientColor} />
          <hemisphereLight args={[rig.hemiSky, rig.hemiGround, rig.hemiIntensity]} />
          <directionalLight
            position={rig.keyPosition}
            intensity={rig.keyIntensity}
            color={rig.keyColor}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-40}
            shadow-camera-right={40}
            shadow-camera-top={40}
            shadow-camera-bottom={-40}
            shadow-camera-near={0.5}
            shadow-camera-far={80}
            shadow-normalBias={0.04}
            shadow-bias={-0.0001}
          />
          <directionalLight
            position={[-rig.keyPosition[0], rig.keyPosition[1] / 2, -rig.keyPosition[2]]}
            intensity={rig.fillIntensity}
            color={rig.fillColor}
          />
        </>
      )}
    </>
  );
}
