import { shaderMaterial } from "@react-three/drei";
import { extend, type ThreeElement } from "@react-three/fiber";
import { Color } from "three";

/**
 * RoofShingleMaterial — repeating overlapping arcs in a darker tone of the
 * base color, evoking tiled shingles. Uses UVs so tile density is consistent
 * regardless of mesh scale. `tile` controls density (default ~12).
 */
const RoofShingleMaterialImpl = shaderMaterial(
  {
    color: new Color("#a65c45"),
    tile: 12.0,
  },
  /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform vec3 color;
    uniform float tile;
    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
      // Brick-offset the rows so shingles interlock.
      vec2 uv = vUv * vec2(tile, tile);
      float row = floor(uv.y);
      float offset = mod(row, 2.0) * 0.5;
      vec2 cell = vec2(fract(uv.x + offset), fract(uv.y));

      // Arc: distance from the bottom-center of the cell; a darker band at
      // the arc's rim gives the overlapping-shingle look.
      vec2 d = cell - vec2(0.5, 0.0);
      float dist = length(vec2(d.x, d.y * 1.2));
      float rim = smoothstep(0.42, 0.48, dist) - smoothstep(0.48, 0.54, dist);

      // Slight top-to-bottom shade inside each tile for depth.
      float shade = mix(0.88, 1.0, cell.y);

      vec3 darker = color * 0.72;
      vec3 base = mix(color * shade, darker, rim);

      float lambert = max(dot(normalize(vNormal), normalize(vec3(0.3, 1.0, 0.4))), 0.0);
      vec3 lit = base * (0.7 + 0.3 * lambert);
      gl_FragColor = vec4(lit, 1.0);
    }
  `
);

extend({ RoofShingleMaterial: RoofShingleMaterialImpl });

export const RoofShingleMaterial = RoofShingleMaterialImpl;

declare module "@react-three/fiber" {
  interface ThreeElements {
    roofShingleMaterial: ThreeElement<typeof RoofShingleMaterialImpl>;
  }
}
