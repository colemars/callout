# The Vista — art prompt pack

The canvas currently draws "surveyor's sketch" placeholders (programmatic iso
prisms, `src/scene/textures.ts`). This document is everything an image
generator needs to produce the real sprite sheet. **Cole approves the sheet
before it ships.** Frames drop in via `src/scene/assets.ts` (each manifest
entry gains a `frame` name matching its key verbatim) — zero scene-code
changes.

**Per-frame prompts are generated**: `art/PROMPTS.md` (human) and
`art/prompt-pack.json` (pipeline) hold one finished prompt per frame,
derived from `ASSET_MANIFEST` by `src/scene/promptPack.ts` so names and
sizes cannot drift. Regenerate after any manifest or prompt change:
`UPDATE_PROMPT_PACK=1 pnpm --filter @platform/kingdom-web test -- promptPack`.

## Global spec

- **Projection**: isometric 2:1 (26.57°), consistent southwest light.
- **Canvas sizes**: the scene renders every texture at its natural size, so
  delivered frames must match `ASSET_MANIFEST` px exactly (author at 2× and
  downscale if the generator needs room). Base tile 128×64. Structures by
  tier: t1 128×128, t2 128×160, t3 128×192. Travelers 40×56 (villager
  26×38). Tree 64×96. Badges 24×24. Transparent backgrounds.
- **Delivery**: one PNG sprite sheet + JSON atlas (TexturePacker "JSON Hash"
  or Phaser 3 format). Frame names MUST equal the manifest keys below.
- **Style**: pixel-painterly medieval, warm and readable at 50% scale; inked
  outlines in deep amber; no photorealism, no modern objects.

## Palette (from the product theme)

parchment `#fef3c7` · ink `#451a03` · outline `#78350f` · gold `#f59e0b` ·
stone `#a8a29e` · wood `#8b5e34` · grass `#84a94b` · road `#c9a86a` ·
water `#4a90a4` · hostile `#991b1b` · friendly `#065f46`

## Structures — 11 keys × 3 tiers (33 frames)

Frame names: `structure:<key>:t1|t2|t3`. Each tier is a visible upgrade of
the same building — silhouette must stay recognizable across tiers and
distinct from every other structure at 50% scale.

| key | identity | t1 → t2 → t3 progression |
|---|---|---|
| keep | the castle itself | wooden motte tower → stone keep with banner → great keep, twin towers, gold banner |
| granary | grain stores | single thatched silo → two silos + loft → stone granary row with windmill |
| walls | gatehouse & walls | palisade gate → stone gatehouse → crenellated gatehouse with portcullis |
| treasury | sealed vaults | strongbox hut → columned vault front → marble treasury, gold trim |
| caravans | trade wealth | tent + one wagon → wagon circle → covered market caravanserai |
| market | market square | stalls + awning → rows of stalls → arcaded market hall |
| festival | festival grounds | maypole → maypole + tents → pavilion with pennants |
| manor | the mortgaged home | cottage → timbered house → gabled manor with garden |
| guildDebt | scholars' debt | lectern shack → scriptorium → guild hall with bell |
| oaths | hall of oaths | shrine post → timber hall → stone hall, shield above door |
| banditCamp | HOSTILE camp | campfire + one tent → palisaded tents, red flag → fortified camp, watchtower, smoke |

Example prompt (adapt per row): *"isometric 2:1 pixel-painterly medieval
granary, tier 2 of 3: two round thatched silos beside a wooden loft, warm
amber palette (#84a94b grass base, #8b5e34 wood, #78350f inked outline),
southwest light, transparent background, 128×160, readable at 50% scale."*

## Travelers — 6 archetypes + villager (7 frames)

Frame names: `traveler:<archetype>`. Small figures with a **grayscale/neutral
garb zone that tints well** (the engine tints by tone: friendly green /
neutral tan / hostile red).

merchant (pack + walking staff) · courier (satchel + horn) · official
(ledger + seal sash) · guard (spear + kite shield) · raider (hood + axe) ·
guest (cloak + gift box)

Plus `traveler:villager` (26×38) — the tiny ambient figure around the
commons: simple tunic, no props, plainer than the road travelers.

## Monuments — 3 frames (Stage 6 build-plots)

Frame names: `monument:<key>`. One frame each — a monument is finished the
day it is raised. These are the Influence-spend showpieces; make them feel
EARNED (finer detail than same-size structures is welcome).

- `monument:wellspring` (128×120) — a low octagonal stone fountain on the
  commons: clear blue water, a slender central jet, worn coping stones.
- `monument:founder` (128×168) — a bronze statue of a crowned figure on a
  wide stone pedestal; verdigris accents, laurel at the base.
- `monument:stargazers` (128×184) — a tall slim observatory tower crowned
  with a deep-blue dome, a brass telescope barrel just visible at the slit.

## Tiles & badges (7 frames)

`tile:grass`, `tile:road` (worn dirt, subtle wheel ruts), `tile:water`,
`tile:plot` (staked-out empty ground — the future build plots), `tile:tree`
(64×96), `badge:lock` (24×24 gold padlock), `badge:lien` (24×24 bank
pennant).

`fx:dot` stays programmatic (a plain white particle) and is NOT part of the
atlas.

## Acceptance checklist (before shipping)

- [ ] Every structure identifiable by silhouette alone at 50% scale
- [ ] Tiers read as growth of the SAME building
- [ ] Traveler garb tints cleanly (no baked-in strong hues)
- [ ] Consistent light direction and outline weight across all frames
- [ ] banditCamp reads hostile without being cartoonishly evil
- [ ] Frame dimensions match `ASSET_MANIFEST` px exactly (promptPack test green)
- [ ] Cole has approved the sheet
