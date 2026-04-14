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
} as const;

export type PaletteColor = keyof typeof palette;
