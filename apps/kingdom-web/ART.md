# The Vista — art prompt pack

The canvas currently draws "surveyor's sketch" placeholders (programmatic iso
prisms, `src/scene/textures.ts`). This document is everything an image
generator needs to produce the real sprite sheet. **Cole approves the sheet
before it ships.** Frames drop in via `src/scene/assets.ts` (each manifest
entry gains a `frame` name matching its key verbatim) — zero scene-code
changes.

## Global spec

- **Projection**: isometric 2:1 (26.57°), consistent southwest light.
- **Base tile**: 128×64 px. **Structures**: 128×160 px (tier 3 may use
  128×192). **Travelers**: 64×96 px. Transparent backgrounds.
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

## Travelers — 6 archetypes (6 frames)

Frame names: `traveler:<archetype>`. Small figures with a **grayscale/neutral
garb zone that tints well** (the engine tints by tone: friendly green /
neutral tan / hostile red).

merchant (pack + walking staff) · courier (satchel + horn) · official
(ledger + seal sash) · guard (spear + kite shield) · raider (hood + axe) ·
guest (cloak + gift box)

## Tiles & badges (7 frames)

`tile:grass`, `tile:road` (worn dirt, subtle wheel ruts), `tile:water`,
`tile:plot` (staked-out empty ground — the future build plots), `tile:tree`
(64×96), `badge:lock` (24×24 gold padlock), `badge:lien` (24×24 bank
pennant).

## Acceptance checklist (before shipping)

- [ ] Every structure identifiable by silhouette alone at 50% scale
- [ ] Tiers read as growth of the SAME building
- [ ] Traveler garb tints cleanly (no baked-in strong hues)
- [ ] Consistent light direction and outline weight across all frames
- [ ] banditCamp reads hostile without being cartoonishly evil
- [ ] Cole has approved the sheet
