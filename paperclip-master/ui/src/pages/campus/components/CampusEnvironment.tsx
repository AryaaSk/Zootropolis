import { Sky } from "@react-three/drei";
import { palette } from "../palette";

interface CampusEnvironmentProps {
  /** Override the fog color. Default: a lightened palette.sky. */
  fogColor?: string;
  /** Near distance where fog starts (world units). */
  fogNear?: number;
  /** Far distance where fog is fully opaque. */
  fogFar?: number;
  /** Turn off the drei <Sky /> and use a flat background instead. */
  flatSky?: boolean;
}

/**
 * CampusEnvironment — Phase G5 atmosphere.
 *
 * Renders into the R3F scene tree:
 *  - drei <Sky /> with warm-dusty sun settings (Townscaper-adjacent; soft
 *    turquoise-leaning sky rather than harsh blue).
 *  - A <fog> falloff so distant ground / building edges dissolve into the
 *    sky palette instead of hard-cutting against the viewport.
 *
 * Must be mounted inside a <Canvas>. Replaces the flat
 * `<color attach="background" args={[palette.sky]} />` line in each view.
 */
export function CampusEnvironment({
  fogColor = "#dcebf1",
  fogNear = 25,
  fogFar = 120,
  flatSky = false,
}: CampusEnvironmentProps) {
  return (
    <>
      {/* Fog: atmospheric distance falloff. Color is a lightened palette.sky
          so distant geometry blends into the warm-cool horizon. */}
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />

      {flatSky ? (
        <color attach="background" args={[palette.sky]} />
      ) : (
        /* drei <Sky /> — tuned for a warm dusty afternoon:
            - sunPosition slightly off-axis for soft directional shading
            - turbidity low so the sky isn't hazy-white
            - rayleigh modest so the horizon stays in the palette range
            - mieCoefficient tiny to avoid a too-saturated sun disc. */
        <Sky
          distance={450000}
          sunPosition={[8, 4, 6]}
          inclination={0.49}
          azimuth={0.25}
          turbidity={3.2}
          rayleigh={1.1}
          mieCoefficient={0.004}
          mieDirectionalG={0.82}
        />
      )}
    </>
  );
}
