import { forwardRef, useMemo } from "react";
import { Color, Uniform } from "three";
import { Effect, EffectAttribute, BlendFunction } from "postprocessing";

/**
 * DepthOutline — Phase S7 painterly-outline post-effect.
 *
 * Samples the depth buffer at 4 adjacent pixels in a cross pattern,
 * measures the local depth gradient, and darkens the pixel toward
 * `color` wherever the gradient is steep. Gives a Townscaper-style
 * hand-drawn ink outline around silhouettes WITHOUT needing per-mesh
 * inverted-hull geometry.
 *
 * - Works on any geometry already in the depth buffer (island, buildings,
 *   agents, props — everything).
 * - Very cheap: 4 texture reads per pixel, one mix.
 * - Tunables are gentle by default; scale up `strength` for cartoon mode.
 */

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uThickness;
  uniform float uStrength;
  uniform float uMinEdge;
  uniform float uMaxEdge;

  // postprocessing exposes depthBuffer + resolution via EffectAttribute.DEPTH.
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    vec2 texel = uThickness / resolution;
    // Read four neighbours' depth; depthBuffer is in [0,1] (perspective).
    float dN = texture2D(depthBuffer, uv + vec2(0.0, texel.y)).x;
    float dS = texture2D(depthBuffer, uv - vec2(0.0, texel.y)).x;
    float dE = texture2D(depthBuffer, uv + vec2(texel.x, 0.0)).x;
    float dW = texture2D(depthBuffer, uv - vec2(texel.x, 0.0)).x;
    float edge = abs(dN - dS) + abs(dE - dW);
    float outline = smoothstep(uMinEdge, uMaxEdge, edge);
    outputColor = vec4(mix(inputColor.rgb, uColor, outline * uStrength), inputColor.a);
  }
`;

interface DepthOutlineOptions {
  color?: Color | string | number;
  thickness?: number;
  strength?: number;
  minEdge?: number;
  maxEdge?: number;
}

class DepthOutlineEffectImpl extends Effect {
  constructor(options: DepthOutlineOptions = {}) {
    const {
      color = "#2a2420",
      thickness = 1.0,
      strength = 0.55,
      minEdge = 0.0005,
      maxEdge = 0.006,
    } = options;
    super("DepthOutlineEffect", fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["uColor", new Uniform(color instanceof Color ? color : new Color(color))],
        ["uThickness", new Uniform(thickness)],
        ["uStrength", new Uniform(strength)],
        ["uMinEdge", new Uniform(minEdge)],
        ["uMaxEdge", new Uniform(maxEdge)],
      ]),
    });
  }
}

export const DepthOutline = forwardRef<DepthOutlineEffectImpl, DepthOutlineOptions>(
  function DepthOutline(props, ref) {
    const effect = useMemo(() => new DepthOutlineEffectImpl(props), [
      props.color,
      props.thickness,
      props.strength,
      props.minEdge,
      props.maxEdge,
    ]);
    return <primitive ref={ref} object={effect} dispose={null} />;
  },
);
