// The asset contract (ART.md is the human side of this file): every sprite
// the vista draws has a logical key here. Today each key carries PLACEHOLDER
// parameters (programmatic "surveyor's sketch" prisms drawn by textures.ts);
// when Cole's approved atlas lands, each entry gains an atlas frame name —
// frame names ARE these keys verbatim — and scene code changes not at all.

import type { StructureKey } from "../model/types";
import type { TravelerArchetype } from "./sceneModel";

export interface PlaceholderParams {
  /** Body color of the sketch prism. */
  body: number;
  /** Roof/top color. */
  roof: number;
  /** Prism height in px per art tier step. */
  height: number;
}

export interface AssetSpec {
  px: { w: number; h: number };
  placeholder: PlaceholderParams;
  /** Set when the real atlas ships: the frame name inside atlas "kingdom". */
  frame?: string;
}

const structure = (body: number, roof: number, tier: 1 | 2 | 3): AssetSpec => ({
  px: { w: 128, h: 96 + tier * 32 },
  placeholder: { body, roof, height: 28 + tier * 22 },
});

const traveler = (body: number): AssetSpec => ({
  px: { w: 40, h: 56 },
  placeholder: { body, roof: 0xf5e6c8, height: 34 },
});

const STRUCTURE_COLORS: Record<StructureKey, { body: number; roof: number }> = {
  keep: { body: 0xa8a29e, roof: 0xb45309 },
  granary: { body: 0xd9b98a, roof: 0x8b5e34 },
  walls: { body: 0x8f8880, roof: 0xa8a29e },
  treasury: { body: 0xc9c3bb, roof: 0xf59e0b },
  caravans: { body: 0xb08d57, roof: 0x7c2d12 },
  market: { body: 0xc9a86a, roof: 0x9a3412 },
  festival: { body: 0xd97706, roof: 0xfbbf24 },
  manor: { body: 0xbfae94, roof: 0x78350f },
  guildDebt: { body: 0x9c8f7f, roof: 0x57534e },
  oaths: { body: 0xd6cfc2, roof: 0x92400e },
  banditCamp: { body: 0x6b7280, roof: 0x991b1b },
};

const TRAVELER_COLORS: Record<TravelerArchetype, number> = {
  merchant: 0xb08d57,
  courier: 0x2563eb,
  official: 0x57534e,
  guard: 0x475569,
  raider: 0x991b1b,
  guest: 0x065f46,
};

export type AssetKey = string;

export function buildManifest(): Record<AssetKey, AssetSpec> {
  const manifest: Record<AssetKey, AssetSpec> = {};
  for (const [key, colors] of Object.entries(STRUCTURE_COLORS)) {
    for (const tier of [1, 2, 3] as const) {
      manifest[`structure:${key}:t${tier}`] = structure(colors.body, colors.roof, tier);
    }
  }
  for (const [archetype, body] of Object.entries(TRAVELER_COLORS)) {
    manifest[`traveler:${archetype}`] = traveler(body);
  }
  manifest["traveler:villager"] = {
    px: { w: 26, h: 38 },
    placeholder: { body: 0x9a8467, roof: 0xf5e6c8, height: 22 },
  };
  manifest["tile:grass"] = {
    px: { w: 128, h: 64 },
    placeholder: { body: 0x84a94b, roof: 0x6d8f3c, height: 0 },
  };
  manifest["tile:road"] = {
    px: { w: 128, h: 64 },
    placeholder: { body: 0xc9a86a, roof: 0xb08d57, height: 0 },
  };
  manifest["tile:water"] = {
    px: { w: 128, h: 64 },
    placeholder: { body: 0x4a90a4, roof: 0x2c5866, height: 0 },
  };
  manifest["tile:plot"] = {
    px: { w: 128, h: 64 },
    placeholder: { body: 0x9db36b, roof: 0x84a94b, height: 0 },
  };
  manifest["tile:tree"] = {
    px: { w: 64, h: 96 },
    placeholder: { body: 0x3f6212, roof: 0x8b5e34, height: 48 },
  };
  manifest["fx:dot"] = {
    px: { w: 8, h: 8 },
    placeholder: { body: 0xffffff, roof: 0xffffff, height: 0 },
  };
  manifest["badge:lock"] = {
    px: { w: 24, h: 24 },
    placeholder: { body: 0xf59e0b, roof: 0x78350f, height: 0 },
  };
  manifest["badge:lien"] = {
    px: { w: 24, h: 24 },
    placeholder: { body: 0x78350f, roof: 0xfef3c7, height: 0 },
  };
  return manifest;
}

export const ASSET_MANIFEST = buildManifest();
