import { Breadcrumb } from "./Breadcrumb";
import { Minimap } from "./Minimap";
import { ExitCampusButton } from "./ExitCampusButton";

/**
 * CampusOverlay — HTML-layer UX glue for the Zootropolis 3D views.
 * Renders ExitCampusButton (top-left), Breadcrumb (top-center), and
 * Minimap (top-right) as DOM siblings of the view's <Canvas>. The parent
 * container should be `relative`/positioned so these absolute overlays
 * anchor correctly.
 */
export function CampusOverlay() {
  return (
    <>
      <ExitCampusButton />
      <Breadcrumb />
      <Minimap />
    </>
  );
}
