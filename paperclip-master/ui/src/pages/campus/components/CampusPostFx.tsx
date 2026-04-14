import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { ReactNode } from "react";
import { useLowQualityMode } from "../lib/quality-mode";

/**
 * CampusPostFx — wraps scene contents in an EffectComposer with soft Bloom
 * on emissive surfaces (status lights, building window grids). Drop this
 * INSIDE a <Canvas> as a sibling of the scene contents:
 *
 *   <Canvas>
 *     ...lights + scene...
 *     <CampusPostFx />
 *   </Canvas>
 *
 * Optionally accepts children to compose additional effects alongside
 * Bloom without duplicating the EffectComposer.
 *
 * Cel-shade / posterize pass: skipped for now — the scene already reads
 * cel-shaded because every shell uses flat meshLambert + drei <Edges /> for
 * hard outlines. A threshold pass would flatten the gentle palette gradients
 * the Townscaper look depends on, so we leave it off.
 */
export function CampusPostFx({ children }: { children?: ReactNode }) {
  // Phase G6: ?lq=1 in the URL skips the postprocess pass entirely. The
  // EffectComposer + Bloom is the single most expensive frame contributor
  // on weak GPUs, so it's the first thing to drop.
  const lowQuality = useLowQualityMode();
  if (lowQuality) {
    return <>{children}</>;
  }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        intensity={0.4}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        mipmapBlur
      />
      {children as never}
    </EffectComposer>
  );
}
