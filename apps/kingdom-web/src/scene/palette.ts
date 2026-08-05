// The vista's palette, lifted from the kingdom's amber/stone Tailwind theme
// so canvas and page read as one product. Day for light mode, dusk for dark.
// Pure constants — no Phaser imports.

export interface VistaPalette {
  sky: number;
  skyLow: number;
  grass: number;
  grassShade: number;
  road: number;
  water: number;
  plot: number;
  outline: number;
  parchment: number;
  parchmentEdge: number;
  ink: number;
  inkMuted: number;
  gold: number;
  stone: number;
  wood: number;
  roofA: number;
  roofB: number;
  hostile: number;
  friendly: number;
  warn: number;
}

export const DAY: VistaPalette = {
  sky: 0xfef3c7, // amber-100
  skyLow: 0xfde68a, // amber-200
  grass: 0x84a94b,
  grassShade: 0x6d8f3c,
  road: 0xc9a86a,
  water: 0x4a90a4,
  plot: 0x9db36b,
  outline: 0x78350f, // amber-900
  parchment: 0xfef3c7,
  parchmentEdge: 0xd6b98c,
  ink: 0x451a03, // amber-950
  inkMuted: 0x92703f,
  gold: 0xf59e0b, // amber-500
  stone: 0xa8a29e, // stone-400
  wood: 0x8b5e34,
  roofA: 0xb45309, // amber-700
  roofB: 0x7c2d12, // orange-900
  hostile: 0x991b1b, // red-800
  friendly: 0x065f46, // emerald-800
  warn: 0xb45309,
};

export const DUSK: VistaPalette = {
  ...DAY,
  sky: 0x1c1917, // stone-900
  skyLow: 0x292524, // stone-800
  grass: 0x4a5d33,
  grassShade: 0x3a4a28,
  road: 0x8a7350,
  water: 0x2c5866,
  plot: 0x55663f,
  outline: 0xfde68a, // amber-200 lines glow at dusk
  parchment: 0x292524,
  parchmentEdge: 0x57534e,
  ink: 0xfde68a,
  inkMuted: 0xa8a29e,
};

/** Traveler garb tint by assigned tone. */
export const TONE_TINT: Record<"friendly" | "neutral" | "hostile", number> = {
  friendly: 0x34d399,
  neutral: 0xd6b98c,
  hostile: 0xef4444,
};
