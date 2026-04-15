import { MeshReflectorMaterial } from "@react-three/drei";
import { palette } from "../palette";

interface InfiniteWaterProps {
  /** Y of the water surface. Default -0.6 — just below the island underside. */
  y?: number;
  /** Plane size. 300 is plenty for the campus camera at default FOV. */
  size?: number;
  /** Mirror strength. 0 = no reflection, 1 = perfect mirror. */
  mirror?: number;
  /** Reflection resolution. Lower = faster but blurrier. 512 is a fine default. */
  resolution?: number;
}

/**
 * Phase S2 water — a reflective mirror plane tinted with the palette's
 * ocean color. `MeshReflectorMaterial` renders a secondary camera pass
 * so buildings + the island actually reflect. `blur` softens the
 * reflection so low-poly edges read painterly rather than CGI-crisp.
 *
 * Performance: `resolution=512` is the knob to drop first if the scene
 * chugs (drop to 256); `mirror=0.5` also tones down the pass.
 */
export function InfiniteWater({
  y = -0.6,
  size = 300,
  mirror = 0.55,
  resolution = 512,
}: InfiniteWaterProps) {
  return (
    <mesh
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[size, size, 1, 1]} />
      <MeshReflectorMaterial
        blur={[250, 80]}
        resolution={resolution}
        mixBlur={1.2}
        mixStrength={1.1}
        mirror={mirror}
        mixContrast={1}
        roughness={0.75}
        depthScale={0.3}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color={palette.ocean}
        metalness={0.15}
      />
    </mesh>
  );
}
