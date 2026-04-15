// Townscaper-inspired palette for Zootropolis.
// Named colors only — never hardcode hex literals in components.
// Warm off-whites, muted terracottas, dusty blues, one saturated accent.
//
// AO deferred — emissives + edges already give us most of the visual lift
// (see CampusPostFx + drei <Edges /> on every container shell). If we
// revisit, N8AO from @react-three/postprocessing is already available and
// three-mesh-bvh is in node_modules for accelerated raycasting.

export const palette = {
  // Sky / background
  sky: "#cfe4ef",

  // Ground / plane
  ground: "#e8dcc4",

  // Walls / off-whites
  bone: "#f2ebdc",
  cream: "#e5d9bf",

  // Terracottas (animal / roof)
  terracotta: "#c97a5a",
  clay: "#a65c45",

  // Dusty blues
  dustBlue: "#7a96a8",
  deepBlue: "#4a6b7d",

  // Accent (status / active)
  accent: "#6fd4c4",

  // Grass (G1 campus ground shader — two greens)
  grassLight: "#a9c98b",
  grassDark: "#7ea862",

  // Outline / detail
  ink: "#2a2420",

  // Phase S — Townscaper sunset story.
  sunset: "#f4b183",    // warm peach key-light tint, sun-facing surfaces
  mist: "#e9d1b8",      // mid-distance fog / haze
  ember: "#ffb870",     // emissive rim piping on slabs, lamps
  ocean: "#8ec5d8",     // water shallow
  oceanDeep: "#5e9fb0", // water mid
  sand: "#efd9ae",      // beachy hex tops
  sage: "#9ab78a",      // soft greenery on hex tops
  // Warm window glow — emissive when agent is working.
  windowGlow: "#ffd27a",
} as const;

/**
 * Phase S3 — Townscaper-inspired wall-tint palette. Each building gets
 * a deterministic pick based on agent id, so the campus reads as a
 * patchwork of pastel boxes rather than a sea of cream.
 */
export const BUILDING_TINTS = [
  "#f4ebdc", // off-white
  "#f5d56d", // saffron
  "#eaa880", // coral
  "#c8786a", // clay-red
  "#9cc6d8", // sky-blue
  "#6b93b0", // deep-blue
  "#a3c88f", // sage
  "#b39fc9", // lavender
  "#d896a8", // dusty pink
  "#e9d3a8", // sand
] as const;


export type PaletteColor = keyof typeof palette;
