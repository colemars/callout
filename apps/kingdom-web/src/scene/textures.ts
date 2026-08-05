// Placeholder texture generation — the "surveyor's sketch" era. Every frame
// in ASSET_MANIFEST is drawn programmatically (layered iso prisms with inked
// outlines) until Cole's approved atlas replaces them via assets.ts frame
// names. Deterministic from manifest params; no external files, no basePath.

import type Phaser from "phaser";
import { ASSET_MANIFEST } from "./assets";
import type { VistaPalette } from "./palette";

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/** An iso prism: diamond top + two shaded faces + inked outline. */
function drawPrism(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  baseY: number,
  w: number,
  body: number,
  roof: number,
  height: number,
  outline: number,
) {
  const halfW = w / 2;
  const halfH = w / 4; // 2:1 iso
  const topY = baseY - height;

  // Left face
  g.fillStyle(darken(body, 0.75), 1);
  g.fillPoints(
    [
      { x: cx - halfW, y: topY },
      { x: cx, y: topY + halfH },
      { x: cx, y: baseY + halfH },
      { x: cx - halfW, y: baseY },
    ],
    true,
  );
  // Right face
  g.fillStyle(darken(body, 0.9), 1);
  g.fillPoints(
    [
      { x: cx + halfW, y: topY },
      { x: cx, y: topY + halfH },
      { x: cx, y: baseY + halfH },
      { x: cx + halfW, y: baseY },
    ],
    true,
  );
  // Roof diamond
  g.fillStyle(roof, 1);
  g.fillPoints(
    [
      { x: cx, y: topY - halfH },
      { x: cx + halfW, y: topY },
      { x: cx, y: topY + halfH },
      { x: cx - halfW, y: topY },
    ],
    true,
  );
  // Inked outline
  g.lineStyle(2, outline, 0.9);
  g.strokePoints(
    [
      { x: cx, y: topY - halfH },
      { x: cx + halfW, y: topY },
      { x: cx + halfW, y: baseY },
      { x: cx, y: baseY + halfH },
      { x: cx - halfW, y: baseY },
      { x: cx - halfW, y: topY },
      { x: cx, y: topY - halfH },
    ],
    false,
    true,
  );
}

/** A flat iso tile diamond. */
function drawTile(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  body: number,
  edge: number,
) {
  g.fillStyle(body, 1);
  g.fillPoints(
    [
      { x: w / 2, y: 0 },
      { x: w, y: h / 2 },
      { x: w / 2, y: h },
      { x: 0, y: h / 2 },
    ],
    true,
  );
  g.lineStyle(1, edge, 0.6);
  g.strokePoints(
    [
      { x: w / 2, y: 0 },
      { x: w, y: h / 2 },
      { x: w / 2, y: h },
      { x: 0, y: h / 2 },
      { x: w / 2, y: 0 },
    ],
    false,
    true,
  );
}

export function ensureTextures(scene: Phaser.Scene, palette: VistaPalette): void {
  for (const [key, spec] of Object.entries(ASSET_MANIFEST)) {
    if (scene.textures.exists(key)) continue;
    const { w, h } = spec.px;
    const g = scene.add.graphics();

    if (key === "fx:dot") {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(w / 2, h / 2, w / 2 - 1);
    } else if (key.startsWith("tile:")) {
      if (key === "tile:tree") {
        // Trunk + canopy prism
        g.fillStyle(spec.placeholder.roof, 1);
        g.fillRect(w / 2 - 4, h - 26, 8, 22);
        drawPrism(
          g,
          w / 2,
          h - 30,
          w * 0.8,
          spec.placeholder.body,
          darken(spec.placeholder.body, 1.15),
          spec.placeholder.height,
          palette.outline,
        );
      } else {
        drawTile(g, w, h, spec.placeholder.body, spec.placeholder.roof);
      }
    } else if (key.startsWith("badge:")) {
      g.fillStyle(spec.placeholder.body, 1);
      g.fillCircle(w / 2, h / 2, w / 2 - 2);
      g.lineStyle(2, spec.placeholder.roof, 1);
      g.strokeCircle(w / 2, h / 2, w / 2 - 2);
    } else if (key.startsWith("traveler:")) {
      // A small figure: body prism + head dot.
      drawPrism(
        g,
        w / 2,
        h - 10,
        w * 0.7,
        spec.placeholder.body,
        darken(spec.placeholder.body, 1.1),
        spec.placeholder.height - 14,
        palette.outline,
      );
      g.fillStyle(spec.placeholder.roof, 1);
      g.fillCircle(w / 2, h - spec.placeholder.height - 4, 7);
      g.lineStyle(1.5, palette.outline, 0.9);
      g.strokeCircle(w / 2, h - spec.placeholder.height - 4, 7);
    } else {
      // structure:<key>:t<n> — a prism whose mass grows with tier; tier 3
      // gains a smaller second prism (a wing) for silhouette variety.
      const tier = Number(key.slice(-1)) as 1 | 2 | 3;
      drawPrism(
        g,
        w / 2,
        h - 14,
        w * (0.52 + tier * 0.12),
        spec.placeholder.body,
        spec.placeholder.roof,
        spec.placeholder.height,
        palette.outline,
      );
      if (tier === 3) {
        drawPrism(
          g,
          w * 0.78,
          h - 10,
          w * 0.34,
          spec.placeholder.body,
          spec.placeholder.roof,
          spec.placeholder.height * 0.6,
          palette.outline,
        );
      }
    }

    g.generateTexture(key, w, h);
    g.destroy();
  }
}
