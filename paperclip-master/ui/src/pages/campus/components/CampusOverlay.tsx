import { Breadcrumb } from "./Breadcrumb";
import { CampusBackButton } from "./CampusBackButton";
import { Minimap } from "./Minimap";
import { ExitCampusButton } from "./ExitCampusButton";
import { HireAgentButton } from "./HireAgentButton";
import { TimeOfDaySlider } from "./TimeOfDaySlider";

/**
 * CampusOverlay — HTML-layer UX glue for the Zootropolis 3D views.
 * Renders ExitCampusButton + CampusBackButton (top-left), Breadcrumb
 * (top-center), Minimap (top-right corner), HireAgentButton (top-right,
 * below the Minimap), and the TimeOfDaySlider (bottom-center) as DOM
 * siblings of the view's <Canvas>. The parent container should be
 * `relative`/positioned so these absolute overlays anchor correctly.
 */
export function CampusOverlay() {
  return (
    <>
      <ExitCampusButton />
      <CampusBackButton />
      <Breadcrumb />
      <Minimap />
      <HireAgentButton />
      <TimeOfDaySlider />
    </>
  );
}
