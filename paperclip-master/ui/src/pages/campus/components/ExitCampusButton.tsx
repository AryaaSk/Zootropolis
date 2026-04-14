import { LogOut } from "lucide-react";
import { useNavigate } from "@/lib/router";
import { palette } from "../palette";

/**
 * ExitCampusButton — small HTML overlay in the top-left that drops you
 * out of the 3D campus back into the standard Paperclip UX (Org chart,
 * Issues, Agents, etc.). Mirrors the sidebar's own Campus ↔ Org nav, but
 * placed inside the campus canvas for discoverability when the drawer
 * is closed and the user wants out.
 */
export function ExitCampusButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      aria-label="Exit campus — return to standard Paperclip"
      className="pointer-events-auto absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur-md transition-colors"
      style={{
        backgroundColor: `${palette.bone}d9`,
        borderColor: palette.ink,
        color: palette.ink,
      }}
      title="Return to the standard Paperclip view"
    >
      <LogOut className="h-3.5 w-3.5" style={{ color: palette.deepBlue }} />
      <span>Exit campus</span>
    </button>
  );
}
