import { useEffect, useState } from "react";

/**
 * Global alt-key-pressed state. Used to flip OrbitControls' LEFT mouse
 * button binding between ROTATE and PAN, and to bail out of mesh drag
 * gestures so Alt+drag always pans the camera.
 */
export function useAltKey(): boolean {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.altKey) setPressed(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (!e.altKey) setPressed(false);
    };
    const onBlur = () => setPressed(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  return pressed;
}
