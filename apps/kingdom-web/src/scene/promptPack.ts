// The art prompt pack (ART.md is the brief; this is the per-frame expansion).
// One fully written image-generation prompt per atlas frame, derived from
// ASSET_MANIFEST so frame names and canvas sizes cannot drift from the code.
// Scene code renders every texture at its natural size, so each delivered
// atlas frame must measure exactly the manifest px — author larger and
// downscale if the generator wants room, but ship at these dimensions.
//
// Not imported by scene code. Consumed by tests/promptPack.test.ts, which
// also regenerates art/PROMPTS.md and art/prompt-pack.json from it.

import type { StructureKey } from "../model/types";
import { ASSET_MANIFEST } from "./assets";
import type { TravelerArchetype } from "./sceneModel";

export interface PromptEntry {
  /** Atlas frame name — equals the ASSET_MANIFEST key verbatim. */
  frame: string;
  w: number;
  h: number;
  category: "structure" | "traveler" | "monument" | "tile" | "badge";
  prompt: string;
}

/** Manifest keys that stay programmatic and are NOT part of the atlas. */
export const PACK_EXCLUDED: readonly string[] = ["fx:dot"];

const OUTLINE = "inked outline #78350f";
const LIGHT = "consistent southwest light";
const TAIL =
  "pixel-painterly medieval style, no photorealism, no modern objects, transparent background";

const size = (w: number, h: number): string => `exactly ${w}×${h} px canvas`;

// ---------------------------------------------------------------------------
// Structures: 11 keys × 3 tiers. Silhouette must stay recognizable across
// tiers and distinct from every other structure at 50% scale.
// ---------------------------------------------------------------------------

const STRUCTURE_SUBJECTS: Record<StructureKey, [string, string, string]> = {
  keep: [
    "the kingdom's keep, tier 1 of 3: a squat wooden motte tower on a low earthen mound, ringed by a rough timber palisade, ladder to the door",
    "the kingdom's keep, tier 2 of 3: a square stone keep grown from the old motte, arrow slits, one gold banner (#f59e0b) flying from the roof",
    "the kingdom's keep, tier 3 of 3: a great stone keep with twin flanking towers, crenellations, a large gold banner (#f59e0b) between them",
  ],
  granary: [
    "a granary, tier 1 of 3: one round thatched grain silo with a small wooden door and a scatter of grain sacks",
    "a granary, tier 2 of 3: two round thatched silos beside a raised wooden grain loft on stilts",
    "a granary, tier 3 of 3: a stone granary row with tiled roofs and a small working windmill at one end",
  ],
  walls: [
    "the town gate, tier 1 of 3: a timber palisade gate of sharpened stakes with a simple crossbar door",
    "the town gate, tier 2 of 3: a stone gatehouse with a heavy wooden gate and short curtain-wall stubs to each side",
    "the town gate, tier 3 of 3: a crenellated stone gatehouse with a raised iron portcullis and walled walkway stubs",
  ],
  treasury: [
    "the treasury, tier 1 of 3: a small hut built around an iron-banded strongbox with a heavy padlock",
    "the treasury, tier 2 of 3: a columned vault front set into a stone block, sealed bronze door",
    "the treasury, tier 3 of 3: a marble treasury with gold trim (#f59e0b) along the cornice and tall sealed bronze doors",
  ],
  caravans: [
    "a trade caravan post, tier 1 of 3: one canvas trade tent beside a single covered wagon",
    "a trade caravan post, tier 2 of 3: a circle of covered wagons around a small campfire, bales of goods between them",
    "a trade caravan post, tier 3 of 3: a covered caravanserai — an arched market building with laden wagons at its gate",
  ],
  market: [
    "the market square, tier 1 of 3: two wooden market stalls under a shared striped awning",
    "the market square, tier 2 of 3: rows of market stalls with crates, baskets, and hanging goods",
    "the market square, tier 3 of 3: an arcaded stone market hall, goods spilling from its open arches",
  ],
  festival: [
    "the festival grounds, tier 1 of 3: a maypole with trailing ribbons on trampled grass",
    "the festival grounds, tier 2 of 3: the maypole joined by festival tents and strung bunting",
    "the festival grounds, tier 3 of 3: a festival pavilion with pennants flying from its banner poles",
  ],
  manor: [
    "the family home, tier 1 of 3: a small cottage with a kitchen-garden plot by the door",
    "the family home, tier 2 of 3: a timber-framed two-story house with a garden",
    "the family home, tier 3 of 3: a gabled manor house with a low-walled garden",
  ],
  guildDebt: [
    "the scholars' guild, tier 1 of 3: a lean-to shack sheltering a reading lectern and stacked ledgers",
    "the scholars' guild, tier 2 of 3: a scriptorium with tall windows, ink pots and scrolls at the door",
    "the scholars' guild, tier 3 of 3: a guild hall with a small bell tower and a ledger-shaped sign above the door",
  ],
  oaths: [
    "the hall of oaths, tier 1 of 3: a carved wooden shrine post hung with knotted oath ribbons",
    "the hall of oaths, tier 2 of 3: a timber hall with carved doorposts and a low stone threshold",
    "the hall of oaths, tier 3 of 3: a stone hall with a painted shield mounted above the door",
  ],
  banditCamp: [
    "a HOSTILE bandit camp, tier 1 of 3: a low campfire beside one ragged tent — worn and menacing, not cartoonishly evil",
    "a HOSTILE bandit camp, tier 2 of 3: ragged tents behind a crude palisade, a small red flag (#991b1b) — worn and menacing, not cartoonishly evil",
    "a HOSTILE bandit camp, tier 3 of 3: a fortified camp with a wooden watchtower and thin smoke rising, red flag (#991b1b) — worn and menacing, not cartoonishly evil",
  ],
};

// ---------------------------------------------------------------------------
// Travelers: small figures whose garb the engine tints by tone (friendly
// green / neutral tan / hostile red), so cloth must stay grayscale/neutral.
// ---------------------------------------------------------------------------

const TRAVELER_SUBJECTS: Record<TravelerArchetype | "villager", string> = {
  merchant: "a traveling merchant on foot: pack frame on the back, walking staff in hand",
  courier: "a courier on foot: leather satchel across the chest, brass horn at the hip",
  official: "a kingdom official on foot: ledger under one arm, seal sash across the chest",
  guard: "a guard on foot: spear upright in one hand, kite shield on the other arm",
  raider: "a raider on foot: deep hood shadowing the face, hand axe held low",
  guest: "an invited guest on foot: long cloak, small wrapped gift box held in both hands",
  villager:
    "a tiny ambient villager: simple tunic and simple posture, no props, smaller and plainer than the road travelers",
};

const TRAVELER_TINT_NOTE =
  "garb in flat neutral grays and undyed cloth tones ONLY (the game engine tints clothing green, tan, or red at runtime — no baked-in strong hues), skin and props may keep natural color";

// ---------------------------------------------------------------------------
// Monuments (Stage 6): one frame each, finished the day they are raised.
// The Influence-spend showpieces — finer detail than same-size structures.
// ---------------------------------------------------------------------------

const MONUMENT_SUBJECTS: Record<string, string> = {
  wellspring:
    "the Wellspring monument: a low octagonal stone fountain on the commons, clear blue water (#4a90a4), a slender central jet, worn coping stones",
  founder:
    "the Founder monument: a bronze statue of a crowned figure atop a wide stone pedestal, verdigris accents, laurel wreath at the base",
  stargazers:
    "the Stargazers' monument: a tall slim observatory tower crowned with a deep-blue dome, a brass telescope barrel just visible at the dome slit",
};

const MONUMENT_NOTE =
  "a ceremonial showpiece — render with finer detail and craftsmanship than an ordinary building of this size";

// ---------------------------------------------------------------------------
// Tiles & badges.
// ---------------------------------------------------------------------------

const TILE_SUBJECTS: Record<string, string> = {
  grass:
    "a flat isometric ground tile of meadow grass (#84a94b) with subtle tuft and shade variation, edges clean for seamless tiling",
  road: "a flat isometric ground tile of worn dirt road (#c9a86a) with subtle wheel ruts, edges blending toward grass (#84a94b) so it tiles beside tile:grass",
  water:
    "a flat isometric ground tile of still water (#4a90a4) with gentle ripple highlights, edges clean for seamless tiling",
  plot: "a flat isometric ground tile of staked-out empty ground: four corner stakes joined by taut string on grass (#84a94b) — a building plot awaiting construction",
  tree: "a single broadleaf tree: sturdy trunk (#8b5e34) and a full rounded canopy, no ground base",
};

const BADGE_SUBJECTS: Record<string, string> = {
  lock: "a small flat UI badge icon: a gold padlock (#f59e0b) with deep-amber outline (#78350f), readable at 24×24",
  lien: "a small flat UI badge icon: a bank lien pennant, deep-brown flag (#78350f) bearing a parchment emblem (#fef3c7), readable at 24×24",
};

// ---------------------------------------------------------------------------
// Assembly.
// ---------------------------------------------------------------------------

const GRASS_BASE =
  "sitting on a 128×64 isometric ground diamond of grass (#84a94b) at the bottom of the frame";
const DIRT_BASE =
  "sitting on a 128×64 isometric ground diamond of trampled dirt (#c9a86a) at the bottom of the frame";

function structurePrompt(key: StructureKey, tier: 1 | 2 | 3, w: number, h: number): string {
  const subject = STRUCTURE_SUBJECTS[key][tier - 1];
  const base = key === "banditCamp" ? DIRT_BASE : GRASS_BASE;
  return `isometric 2:1 game sprite, ${subject}, ${base}, silhouette recognizable at 50% scale and consistent across the three tiers, wood #8b5e34, stone #a8a29e, ${OUTLINE}, ${LIGHT}, ${TAIL}, ${size(w, h)}.`;
}

function travelerPrompt(archetype: string, w: number, h: number): string {
  const subject = TRAVELER_SUBJECTS[archetype as TravelerArchetype | "villager"];
  return `isometric 2:1 game sprite, ${subject}, ${TRAVELER_TINT_NOTE}, ${OUTLINE}, ${LIGHT}, ${TAIL}, ${size(w, h)}.`;
}

function monumentPrompt(key: string, w: number, h: number): string {
  return `isometric 2:1 game sprite, ${MONUMENT_SUBJECTS[key]}, ${MONUMENT_NOTE}, ${GRASS_BASE}, stone #a8a29e, ${OUTLINE}, ${LIGHT}, ${TAIL}, ${size(w, h)}.`;
}

function tilePrompt(key: string, w: number, h: number): string {
  return `isometric 2:1 game sprite, ${TILE_SUBJECTS[key]}, ${OUTLINE}, ${LIGHT}, ${TAIL}, ${size(w, h)}.`;
}

function badgePrompt(key: string, w: number, h: number): string {
  return `${BADGE_SUBJECTS[key]}, ${TAIL}, ${size(w, h)}.`;
}

export function buildPromptPack(): PromptEntry[] {
  const entries: PromptEntry[] = [];
  for (const [frame, spec] of Object.entries(ASSET_MANIFEST)) {
    if (PACK_EXCLUDED.includes(frame)) continue;
    const { w, h } = spec.px;
    const [category = "", key = "", tier = ""] = frame.split(":");
    let prompt: string;
    switch (category) {
      case "structure":
        prompt = structurePrompt(key as StructureKey, Number(tier.slice(1)) as 1 | 2 | 3, w, h);
        break;
      case "traveler":
        prompt = travelerPrompt(key, w, h);
        break;
      case "monument":
        prompt = monumentPrompt(key, w, h);
        break;
      case "tile":
        prompt = tilePrompt(key, w, h);
        break;
      case "badge":
        prompt = badgePrompt(key, w, h);
        break;
      default:
        throw new Error(`prompt pack: no prompt rule for manifest key "${frame}"`);
    }
    entries.push({
      frame,
      w,
      h,
      category: category as PromptEntry["category"],
      prompt,
    });
  }
  return entries;
}

const CATEGORY_TITLES: Record<PromptEntry["category"], string> = {
  structure: "Structures",
  traveler: "Travelers",
  monument: "Monuments",
  tile: "Tiles",
  badge: "Badges",
};

/** Render the human-readable pack (art/PROMPTS.md). */
export function renderPromptsMarkdown(pack: PromptEntry[]): string {
  const lines: string[] = [
    "<!-- GENERATED from src/scene/promptPack.ts — do not edit by hand. -->",
    "<!-- Regenerate: UPDATE_PROMPT_PACK=1 pnpm --filter @platform/kingdom-web test -- promptPack -->",
    "",
    "# The Vista — generated prompt pack",
    "",
    "One prompt per atlas frame. Frame names and canvas sizes come straight",
    "from `src/scene/assets.ts` (`ASSET_MANIFEST`) — the scene renders every",
    "texture at natural size, so delivered frames must match these dimensions",
    "exactly. The brief, palette, and acceptance checklist live in `ART.md`.",
    "",
  ];
  let current: string | null = null;
  for (const entry of pack) {
    if (entry.category !== current) {
      current = entry.category;
      lines.push(`## ${CATEGORY_TITLES[entry.category]}`, "");
    }
    lines.push(`### \`${entry.frame}\` (${entry.w}×${entry.h})`, "", `> ${entry.prompt}`, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Render the machine-readable pack (art/prompt-pack.json). */
export function renderPromptsJson(pack: PromptEntry[]): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}
