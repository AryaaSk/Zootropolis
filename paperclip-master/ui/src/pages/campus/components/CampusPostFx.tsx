import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  HueSaturation,
  N8AO,
  SMAA,
  Vignette,
} from "@react-three/postprocessing";
import type { ReactNode } from "react";
import { useLowQualityMode } from "../lib/quality-mode";
import { DepthOutline } from "./DepthOutlineEffect";

/**
 * CampusPostFx — Phase S1 + S7 post-processing stack.
 *
 * Order matters:
 *   SMAA → N8AO → DepthOutline → Bloom → HueSaturation → BrightnessContrast → Vignette
 *
 * Phase S7 tweaks for the Townscaper-pastel brief:
 *   - Added DepthOutline — subtle ink outlines at silhouette edges so
 *     buildings / hexes / animals read hand-drawn without per-mesh
 *     inverted-hull geometry.
 *   - HueSaturation dropped from +0.15 → -0.08 (desaturate into pastel).
 *   - BrightnessContrast gets a tiny brightness bump so the softer
 *     palette doesn't feel muddy.
 *
 * ?lq=1 URL gate: strips N8AO + DepthOutline (the depth-buffer-heavy
 * passes). SMAA + Bloom + color grading + Vignette remain so the scene
 * still looks intentional on weak GPUs.
 */
export function CampusPostFx({ children }: { children?: ReactNode }) {
  const lowQuality = useLowQualityMode();
  return (
    <EffectComposer multisampling={0} enableNormalPass={!lowQuality}>
      <SMAA />
      {lowQuality ? (
        <></>
      ) : (
        <N8AO
          aoRadius={2.0}
          intensity={3.0}
          color="#4a2a1a"
          distanceFalloff={1.0}
          quality="performance"
        />
      )}
      {lowQuality ? (
        <></>
      ) : (
        <DepthOutline
          color="#2a2420"
          thickness={1.0}
          strength={0.72}
          minEdge={0.0007}
          maxEdge={0.0055}
        />
      )}
      <Bloom
        intensity={0.45}
        luminanceThreshold={0.9}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <HueSaturation hue={0} saturation={-0.08} />
      <BrightnessContrast brightness={0.04} contrast={0.03} />
      <Vignette offset={0.3} darkness={0.45} eskil={false} />
      {children as never}
    </EffectComposer>
  );
}
