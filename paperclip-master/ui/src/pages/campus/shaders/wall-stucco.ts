import { shaderMaterial } from "@react-three/drei";
import { extend, type ThreeElement } from "@react-three/fiber";
import { Color } from "three";

/**
 * WallStuccoMaterial — perturbs a base color with low-amplitude value noise
 * for a subtle hand-plastered feel. No textures; everything procedural.
 *
 * Amplitude is bounded to ~5-8% lightness variation so the underlying
 * palette tone still reads cleanly; <Edges /> outlines stack on top.
 */
const WallStuccoMaterialImpl = shaderMaterial(
  {
    color: new Color("#f2ebdc"),
    uOpacity: 1.0,
  },
  /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  /* glsl */ `
    uniform vec3 color;
    uniform float uOpacity;
    varying vec3 vWorldPos;
    varying vec3 vNormal;

    // Cheap hash-based value noise.
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float vnoise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash(i + vec3(0.0, 0.0, 0.0));
      float n100 = hash(i + vec3(1.0, 0.0, 0.0));
      float n010 = hash(i + vec3(0.0, 1.0, 0.0));
      float n110 = hash(i + vec3(1.0, 1.0, 0.0));
      float n001 = hash(i + vec3(0.0, 0.0, 1.0));
      float n101 = hash(i + vec3(1.0, 0.0, 1.0));
      float n011 = hash(i + vec3(0.0, 1.0, 1.0));
      float n111 = hash(i + vec3(1.0, 1.0, 1.0));
      float nx00 = mix(n000, n100, f.x);
      float nx10 = mix(n010, n110, f.x);
      float nx01 = mix(n001, n101, f.x);
      float nx11 = mix(n011, n111, f.x);
      float nxy0 = mix(nx00, nx10, f.y);
      float nxy1 = mix(nx01, nx11, f.y);
      return mix(nxy0, nxy1, f.z);
    }

    void main() {
      float n = vnoise(vWorldPos * 18.0) * 0.6 + vnoise(vWorldPos * 48.0) * 0.4;
      float grain = (n - 0.5) * 0.14;
      vec3 tinted = clamp(color + grain, 0.0, 1.0);

      float lambert = max(dot(normalize(vNormal), normalize(vec3(0.4, 1.0, 0.2))), 0.0);
      vec3 lit = tinted * (0.75 + 0.25 * lambert);
      gl_FragColor = vec4(lit, uOpacity);
    }
  `
);

extend({ WallStuccoMaterial: WallStuccoMaterialImpl });

export const WallStuccoMaterial = WallStuccoMaterialImpl;

declare module "@react-three/fiber" {
  interface ThreeElements {
    wallStuccoMaterial: ThreeElement<typeof WallStuccoMaterialImpl>;
  }
}
