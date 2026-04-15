import { LogOut } from "lucide-react";
import { useNavigate } from "@/lib/router";

/**
 * ExitCampusButton — small HTML overlay in the top-left that drops you
 * out of the 3D campus back into the standard Paperclip UX.
 *
 * Phase U: dark glass pill matching the Breadcrumb / Minimap treatment.
 */
export function ExitCampusButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      aria-label="Exit campus — return to standard Paperclip"
      className="pointer-events-auto absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-accent hover:text-accent-foreground"
      title="Return to the standard Paperclip view"
    >
      <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
      <span>Exit campus</span>
    </button>
  );
}
