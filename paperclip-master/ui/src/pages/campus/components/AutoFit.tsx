import { useEffect } from "react";
import { useBounds } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { Object3D } from "three";

interface AutoFitProps {
  /** Re-fit whenever this key changes (e.g. island tile count). */
  refitKey?: string | number;
  /**
   * Magnification factor applied AFTER drei's bounds.fit() settles.
   *   1.0 = drei's default fit (no extra zoom)
   *   1.25 = 25% closer (zoomed IN by 25%)
   *   0.8 = 20% farther (zoomed OUT)
   * Internally we shorten the camera-to-target distance by 1/zoom.
   * Default 1.3 = 30% closer than drei's fit.
   */
  zoom?: number;
}

/**
 * Phase X12 — drei `<Bounds>` companion that auto-frames the scene and
 * then dollies the camera toward the controls' target by a fixed
 * factor (default 0.7 = 30% closer). drei's default fit leaves a large
 * margin; the dolly tightens the frame to feel filled.
 *
 * Re-fits whenever `refitKey` changes; otherwise leaves the camera
 * alone so the user can orbit / pan freely after the initial fit.
 */
export function AutoFit({ refitKey, zoom = 1.3 }: AutoFitProps) {
  const bounds = useBounds();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as
    | { target: { x: number; y: number; z: number } }
    | null;
  useEffect(() => {
    const fitTimeout = setTimeout(() => {
      // Temporarily hide anything tagged userData.boundsIgnore — used
      // by AgentScreen so its giant Html-transform plane (96+ units
      // wide in world space) doesn't blow up the fit distance.
      const hidden: Object3D[] = [];
      scene.traverse((obj) => {
        if (obj.userData?.boundsIgnore && obj.visible) {
          obj.visible = false;
          hidden.push(obj);
        }
      });
      bounds.refresh().clip().fit();
      // Restore visibility on the next frame so the fit pass sees only
      // the structural geometry.
      requestAnimationFrame(() => {
        for (const obj of hidden) obj.visible = true;
      });
      // drei's bounds.fit() animates over ~750ms. Wait past that
      // before we shorten the distance, otherwise we multiply a
      // mid-tween position and the camera ends up in the wrong place.
      const dollyTimeout = setTimeout(() => {
        if (!controls) return;
        // distance multiplier = 1/zoom: zoom > 1 = closer (IN).
        const k = 1 / zoom;
        const tx = controls.target.x;
        const ty = controls.target.y;
        const tz = controls.target.z;
        const dx = camera.position.x - tx;
        const dy = camera.position.y - ty;
        const dz = camera.position.z - tz;
        camera.position.set(tx + dx * k, ty + dy * k, tz + dz * k);
      }, 850);
      return () => clearTimeout(dollyTimeout);
    }, 80);
    return () => clearTimeout(fitTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitKey, zoom]);
  return null;
}
