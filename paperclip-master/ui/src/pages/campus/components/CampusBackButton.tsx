import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * CampusBackButton — top-left back button that walks one level up the
 * campus hierarchy. Equivalent in spirit to the browser back button:
 * just calls `navigate(-1)`. Hidden when there's nowhere meaningful to
 * go back to (i.e. when this is the first entry in history — typically
 * a fresh tab landing directly on a deep URL).
 *
 * Sits to the right of ExitCampusButton (which lives at left-4); we
 * offset to left-[140px] so the two buttons read as a pair.
 */
export function CampusBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show the button on the campus root itself — there's nothing
  // to step back to within the campus hierarchy. ExitCampusButton
  // covers the "leave the campus entirely" case.
  const isCampusRoot = /^\/campus\/[^/]+\/?$/.test(location.pathname);
  if (isCampusRoot) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      aria-label="Back one level"
      title="Back (same as browser back)"
      className="pointer-events-auto absolute left-[160px] top-4 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
      <span>Back</span>
    </button>
  );
}
