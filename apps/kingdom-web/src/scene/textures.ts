// Texture bootstrapping. The shipped atlas (public/vista, packed by
// scripts/pack-art.mjs) supplies real art: ensureTextures aliases each
// manifest key to its atlas frame. Any frame the atlas fails to deliver —
// and fx:dot, which never ships — falls back to the programmatic
// "surveyor's sketch" prisms, so a missing or stale sheet degrades visibly
// but never breaks the scene.

import type Phaser from "phaser";
import { ASSET_MANIFEST, ATLAS } from "./assets";
import type { VistaPalette } from "./palette";

/** Queue the atlas download; called from the scene's preload. */
export function loadAtlas(scene: Phaser.Scene): void {
  // A 404 here is survivable: the loader logs an error, the atlas texture
  // never comes to exist, and ensureTextures falls back to placeholders.
  scene.load.atlas(ATLAS.key, ATLAS.png, ATLAS.json);
}

/**
 * Register `key` as its own texture backed by the atlas frame's pixels.
 * Scene code addresses textures by manifest key alone, so each frame gets
 * re-registered standalone (a canvas crop — 50 small frames, negligible).
 */
function aliasAtlasFrame(scene: Phaser.Scene, key: string, frame: Phaser.Textures.Frame): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = frame.cutWidth;
  canvas.height = frame.cutHeight;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return false;
  ctx.drawImage(
    frame.source.image as CanvasImageSource,
    frame.cutX,
    frame.cutY,
    frame.cutWidth,
    frame.cutHeight,
    0,
    0,
    frame.cutWidth,
    frame.cutHeight,
  );
  scene.textures.addCanvas(key, canvas);
  return true;
}

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
  const atlas = scene.textures.exists(ATLAS.key) ? scene.textures.get(ATLAS.key) : null;
  for (const [key, spec] of Object.entries(ASSET_MANIFEST)) {
    if (scene.textures.exists(key)) continue;
    if (
      spec.frame !== undefined &&
      atlas?.has(spec.frame) &&
      aliasAtlasFrame(scene, key, atlas.get(spec.frame))
    ) {
      continue;
    }
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
    } else if (key.startsWith("monument:")) {
      // Distinct monument silhouettes (Stage 6 placeholders).
      if (key === "monument:wellspring") {
        // A low, wide basin with a water-blue top and a small central spire.
        drawPrism(
          g,
          w / 2,
          h - 14,
          w * 0.7,
          spec.placeholder.body,
          spec.placeholder.roof,
          spec.placeholder.height,
          palette.outline,
        );
        drawPrism(
          g,
          w / 2,
          h - 14 - spec.placeholder.height,
          w * 0.16,
          spec.placeholder.body,
          spec.placeholder.roof,
          26,
          palette.outline,
        );
      } else if (key === "monument:founder") {
        // A wide pedestal bearing a tall, narrow bronze figure.
        drawPrism(
          g,
          w / 2,
          h - 14,
          w * 0.56,
          spec.placeholder.body,
          darken(spec.placeholder.body, 1.05),
          26,
          palette.outline,
        );
        drawPrism(
          g,
          w / 2,
          h - 40,
          w * 0.2,
          spec.placeholder.roof,
          darken(spec.placeholder.roof, 1.15),
          spec.placeholder.height,
          palette.outline,
        );
      } else {
        // The stargazers' tower: a tall shaft crowned with a round dome.
        drawPrism(
          g,
          w / 2,
          h - 14,
          w * 0.34,
          spec.placeholder.body,
          darken(spec.placeholder.body, 1.05),
          spec.placeholder.height,
          palette.outline,
        );
        const domeY = h - 14 - spec.placeholder.height - 10;
        g.fillStyle(spec.placeholder.roof, 1);
        g.fillCircle(w / 2, domeY, 16);
        g.lineStyle(2, palette.outline, 0.9);
        g.strokeCircle(w / 2, domeY, 16);
      }
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
