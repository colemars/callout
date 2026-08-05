// The Vista — Phaser scene. A thin shell over SceneModel (CONTRACT.md: the
// renderer invents nothing): terrain and roads from the authored layout,
// structures and travelers keyed by their stable ids, tweens only on model
// change plus one idle bob per traveler. Two cameras: the world camera
// fit-zooms the map; the UI camera renders panels 1:1 in screen space so
// report text stays CSS-pixel readable at every viewport.

import Phaser from "phaser";
import type { StructureState } from "../model/types";
import type { VistaCallbacks } from "./bridge";
import { GATE, RESERVED_PLOTS, ROADS, SLOTS, isoToScreen, mapBounds, pathPoint } from "./layout";
import { TONE_TINT, type VistaPalette } from "./palette";
import { StewardPanel } from "./panels";
import type { PlacedStructure, PlacedTraveler, SceneModel } from "./sceneModel";
import { ensureTextures } from "./textures";

const TWEEN_MS = 700;

export class VistaScene extends Phaser.Scene {
  private palette!: VistaPalette;
  private callbacks!: VistaCallbacks;
  private worldLayer!: Phaser.GameObjects.Container;
  private uiLayer!: Phaser.GameObjects.Container;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private structureSprites = new Map<string, Phaser.GameObjects.Image>();
  private travelerSprites = new Map<string, Phaser.GameObjects.Image>();
  private model: SceneModel | null = null;
  private pendingModel: SceneModel | null = null;
  private panel: StewardPanel | null = null;
  private ready = false;

  constructor() {
    super("vista");
  }

  init(data: { palette: VistaPalette; callbacks: VistaCallbacks; model: SceneModel }) {
    this.palette = data.palette;
    this.callbacks = data.callbacks;
    this.pendingModel = data.model;
  }

  create() {
    ensureTextures(this, this.palette);
    this.cameras.main.setBackgroundColor(this.palette.sky);

    this.worldLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0);

    // Two cameras: main renders the world (ignores UI); uiCamera renders
    // screen-space UI (ignores the world).
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.ignore(this.worldLayer);
    this.cameras.main.ignore(this.uiLayer);

    this.drawTerrain();
    this.syncViewports();
    this.scale.on("resize", () => this.syncViewports());

    if (this.pendingModel !== null) this.applyModel(this.pendingModel);
    this.pendingModel = null;
    this.ready = true;
    this.callbacks.onReady();
  }

  /** Public entry from the React shell. */
  updateModel(model: SceneModel): void {
    if (!this.ready) {
      this.pendingModel = model;
      return;
    }
    this.applyModel(model);
  }

  /**
   * World objects must be ignored by the UI camera INDIVIDUALLY: container-
   * level ignore covers rendering, but input hit-testing checks each child's
   * own camera filter — without this, clicks resolve through the UI
   * camera's identity transform and miss the zoomed world entirely.
   */
  private addWorld<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.worldLayer.add(obj);
    this.uiCamera.ignore(obj);
    return obj;
  }

  /**
   * BOTH cameras must track the game size explicitly: a camera created (or
   * a scene booted) while the container was mid-layout keeps its stale
   * viewport otherwise, and a world hit-test culls against that stale
   * rectangle — clicks beyond it silently miss.
   */
  private syncViewports(): void {
    this.cameras.main.setSize(this.scale.width, this.scale.height);
    this.uiCamera.setSize(this.scale.width, this.scale.height);
    this.fitWorldCamera();
    // A panel laid out for the old viewport re-lays on next open.
    this.closePanel();
  }

  private fitWorldCamera(): void {
    if (this.scale.width < 50 || this.scale.height < 40) return; // not laid out yet
    const b = mapBounds();
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const zoom = Math.min(this.scale.width / bw, this.scale.height / bh) * 0.96;
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(b.minX + bw / 2, b.minY + bh / 2);
  }

  private drawTerrain(): void {
    // Ground: the full map diamond.
    const ground = this.add.graphics();
    const corners = [
      isoToScreen(0, 0),
      isoToScreen(17, 0),
      isoToScreen(17, 12),
      isoToScreen(0, 12),
    ];
    ground.fillStyle(this.palette.grass, 1);
    ground.fillPoints(
      corners.map((c) => new Phaser.Geom.Point(c.x, c.y)),
      true,
    );
    ground.lineStyle(3, this.palette.outline, 0.5);
    ground.strokePoints(
      [...corners, corners[0] as { x: number; y: number }].map(
        (c) => new Phaser.Geom.Point(c.x, c.y),
      ),
      false,
      true,
    );
    this.addWorld(ground);

    // Roads: sampled strips along each polyline.
    const roadsG = this.add.graphics();
    roadsG.lineStyle(18, this.palette.road, 0.95);
    for (const roadId of Object.keys(ROADS) as Array<keyof typeof ROADS>) {
      const points = Array.from({ length: 25 }, (_, i) => pathPoint(roadId, i / 24));
      roadsG.strokePoints(
        points.map((p) => new Phaser.Geom.Point(p.x, p.y)),
        false,
        false,
      );
    }
    this.addWorld(roadsG);

    // The gate marker.
    const gatePos = isoToScreen(GATE.tx, GATE.ty);
    const gate = this.add.image(gatePos.x, gatePos.y, "tile:road").setScale(1.1);
    this.addWorld(gate);

    // Reserved plots: faint held ground (the Stage 6 endgame, visible now).
    for (const plot of RESERVED_PLOTS) {
      const center = isoToScreen(plot.tx + plot.w / 2, plot.ty + plot.h / 2);
      const tile = this.add.image(center.x, center.y, "tile:plot").setAlpha(0.55);
      this.addWorld(tile);
    }

    // A few trees for life at the map edges.
    for (const [tx, ty] of [
      [1, 1],
      [15, 2],
      [2, 10],
      [15.5, 6],
    ] as const) {
      const p = isoToScreen(tx, ty);
      const tree = this.add.image(p.x, p.y, "tile:tree").setOrigin(0.5, 1);
      tree.setDepth(p.y);
      this.addWorld(tree);
    }
  }

  private applyModel(model: SceneModel): void {
    this.model = model;
    this.syncStructures(model.structures);
    this.syncTravelers(model.travelers);
  }

  private structurePosition(key: PlacedStructure["key"]): { x: number; y: number } {
    const slot = SLOTS[key];
    return isoToScreen(slot.tx + slot.w / 2, slot.ty + slot.h / 2);
  }

  private syncStructures(structures: PlacedStructure[]): void {
    const seen = new Set<string>();
    for (const placed of structures) {
      seen.add(placed.key);
      const texture = `structure:${placed.key}:t${placed.artTier}`;
      let sprite = this.structureSprites.get(placed.key);
      if (sprite === undefined) {
        const pos = this.structurePosition(placed.key);
        sprite = this.add
          .image(pos.x, pos.y + 24, texture)
          .setOrigin(0.5, 1)
          .setDepth(pos.y)
          .setAlpha(0);
        // Generous hit area: small structures stay tappable on phones.
        sprite.setInteractive(
          new Phaser.Geom.Rectangle(-24, -24, sprite.width + 48, sprite.height + 48),
          Phaser.Geom.Rectangle.Contains,
        );
        this.addWorld(sprite);
        this.tweens.add({ targets: sprite, alpha: 1, duration: TWEEN_MS });
        this.structureSprites.set(placed.key, sprite);
      } else if (sprite.texture.key !== texture) {
        // A growth moment (level tier changed): quick dip-and-reveal.
        const s = sprite;
        this.tweens.add({
          targets: s,
          alpha: 0.3,
          duration: TWEEN_MS / 2,
          yoyo: true,
          onYoyo: () => s.setTexture(texture),
        });
      }
      sprite.setTint(placed.state.hostile === true ? 0xffd5d5 : 0xffffff);
      sprite.removeAllListeners("pointerup");
      const state = placed.state;
      sprite.on(
        "pointerup",
        (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.openPanel(state);
        },
      );
    }
    for (const [key, sprite] of this.structureSprites) {
      if (!seen.has(key)) {
        sprite.destroy();
        this.structureSprites.delete(key);
      }
    }
  }

  private travelerPosition(t: PlacedTraveler): { x: number; y: number } {
    const base = pathPoint(t.roadId, t.t);
    if (t.gateSlot === null) return base;
    // Fan clustered travelers in a small arc before the gate.
    const offset = t.gateSlot - 1;
    return { x: base.x + offset * 34, y: base.y + Math.abs(offset) * 10 + 8 };
  }

  private syncTravelers(travelers: PlacedTraveler[]): void {
    const seen = new Set<string>();
    for (const t of travelers) {
      seen.add(t.id);
      const pos = this.travelerPosition(t);
      let sprite = this.travelerSprites.get(t.id);
      if (sprite === undefined) {
        sprite = this.add
          .image(pos.x, pos.y, `traveler:${t.archetype}`)
          .setOrigin(0.5, 1)
          .setAlpha(0);
        sprite.setInteractive(
          new Phaser.Geom.Rectangle(-30, -24, sprite.width + 60, sprite.height + 48),
          Phaser.Geom.Rectangle.Contains,
        );
        this.addWorld(sprite);
        this.travelerSprites.set(t.id, sprite);
        // One idle bob each, phase-jittered by id so the road breathes.
        const jitter = [...t.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 400;
        this.tweens.add({
          targets: sprite,
          y: pos.y - 3,
          duration: 900 + jitter,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      } else if (Math.abs(sprite.x - pos.x) > 1) {
        this.tweens.add({ targets: sprite, x: pos.x, duration: TWEEN_MS });
      }
      sprite.setTexture(`traveler:${t.archetype}`);
      sprite.setDepth(pos.y + 1000);
      sprite.setTint(TONE_TINT[t.tone]);
      this.tweens.add({
        targets: sprite,
        alpha: t.ghosted ? 0.4 : 1,
        duration: TWEEN_MS,
      });
      if (t.agitated) sprite.setTint(0xff8080);
      const id = t.id;
      sprite.removeAllListeners("pointerup");
      sprite.on(
        "pointerup",
        (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.callbacks.onTravelerTap(id);
        },
      );
    }
    for (const [id, sprite] of this.travelerSprites) {
      if (!seen.has(id)) {
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          duration: TWEEN_MS,
          onComplete: () => sprite.destroy(),
        });
        this.travelerSprites.delete(id);
      }
    }
  }

  private openPanel(structure: StructureState): void {
    this.closePanel();
    this.panel = new StewardPanel(this, this.uiLayer, structure, this.palette, () =>
      this.closePanel(),
    );
    // Ignore-by-container only covers children present at call time — the
    // panel's children exist NOW, so exclude them from the world camera now.
    this.cameras.main.ignore(this.panel.root);
  }

  private closePanel(): void {
    this.panel?.destroy();
    this.panel = null;
  }
}
