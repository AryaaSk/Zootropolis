import { shaderMaterial } from "@react-three/drei";
import { extend, type ThreeElement } from "@react-three/fiber";
import { Color } from "three";
import { palette } from "../palette";

/**
 * GrassMaterial — soft noise between two greens for the campus ground.
 * No per-pixel lighting needed (the plane is flat-up); the noise itself
 * provides all the texture.
 */
const GrassMaterialImpl = shaderMaterial(
  {
    colorA: new Color(palette.grassLight),
    colorB: new Color(palette.grassDark),
  },
  /* glsl */ `
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  /* glsl */ `
    uniform vec3 colorA;
    uniform vec3 colorB;
    varying vec3 vWorldPos;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      vec2 p = vWorldPos.xz;
      float low = vnoise(p * 0.6);
      float mid = vnoise(p * 2.4);
      float hi  = vnoise(p * 9.0);
      float n = low * 0.55 + mid * 0.30 + hi * 0.15;
      vec3 base = mix(colorB, colorA, smoothstep(0.25, 0.85, n));
      gl_FragColor = vec4(base, 1.0);
    }
  `
);

extend({ GrassMaterial: GrassMaterialImpl });

export const GrassMaterial = GrassMaterialImpl;

declare module "@react-three/fiber" {
  interface ThreeElements {
    grassMaterial: ThreeElement<typeof GrassMaterialImpl>;
  }
}
