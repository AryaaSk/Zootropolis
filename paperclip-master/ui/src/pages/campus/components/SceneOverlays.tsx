import { Html } from "@react-three/drei";
import { Link } from "@/lib/router";
import { palette } from "../palette";

const baseStyle: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 6,
  background: palette.bone,
  color: palette.ink,
  border: `1px solid ${palette.ink}`,
  whiteSpace: "nowrap",
  pointerEvents: "auto",
};

/** Centered "Loading…" pill rendered inside the R3F canvas. */
export function LoadingOverlay({ label = "Loading…" }: { label?: string }) {
  return (
    <Html center>
      <div style={baseStyle}>{label}</div>
    </Html>
  );
}

/** Centered "Empty <layer>" pill — used when a container has no children. */
export function EmptyLayerOverlay({ layer }: { layer: string }) {
  return (
    <Html center>
      <div style={{ ...baseStyle, opacity: 0.85 }}>Empty {layer}</div>
    </Html>
  );
}

/**
 * "Not found" pill with a back link to the parent layer. Rendered when the
 * current `:id` doesn't match any agent in the company tree.
 */
export function NotFoundOverlay({
  layer,
  backHref,
  backLabel,
}: {
  layer: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <Html center>
      <div style={{ ...baseStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <span>Not found ({layer})</span>
        <Link
          to={backHref}
          style={{
            color: palette.deepBlue,
            textDecoration: "underline",
            fontWeight: 600,
          }}
        >
          ← {backLabel}
        </Link>
      </div>
    </Html>
  );
}
