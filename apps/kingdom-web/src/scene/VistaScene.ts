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
import { RegistryPanel, StewardPanel } from "./panels";
import type { PlacedStructure, PlacedTraveler, ReplayMoment, SceneModel } from "./sceneModel";
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
  private ambientSprites: Phaser.GameObjects.Image[] = [];
  private weatherFx = new Map<
    string,
    { severity: number; objects: Phaser.GameObjects.GameObject[] }
  >();
  private model: SceneModel | null = null;
  private pendingModel: SceneModel | null = null;
  private panel: StewardPanel | RegistryPanel | null = null;
  private ready = false;
  private replayTimers: Phaser.Time.TimerEvent[] = [];
  private pendingReplay: ReplayMoment[] | null = null;

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
    if (this.pendingReplay !== null) {
      const reel = this.pendingReplay;
      this.pendingReplay = null;
      this.playReplay(reel);
    }
  }

  /**
   * Stage 5: the "while you were away" reel — each moment gets a caption
   * chip and, when it has a home, a sparkle burst + pulse at the structure.
   * The DOM text strip remains the ledger; this is the spectacle.
   */
  playReplay(moments: ReplayMoment[]): void {
    if (!this.ready) {
      this.pendingReplay = moments;
      return;
    }
    for (const timer of this.replayTimers) timer.remove();
    this.replayTimers = moments.map((moment, i) =>
      this.time.delayedCall(600 + i * 2000, () => this.playMoment(moment)),
    );
  }

  private playMoment(moment: ReplayMoment): void {
    // Caption chip: bottom-center on the UI layer, in and out.
    const vw = this.scale.width;
    const vh = this.scale.height;
    const tone =
      moment.tone === "good" ? 0x059669 : moment.tone === "bad" ? 0xdc2626 : this.palette.ink;
    const label = this.add
      .text(0, 0, moment.caption, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "14px",
        color: `#${tone.toString(16).padStart(6, "0")}`,
      })
      .setResolution(Math.min(window.devicePixelRatio || 1, 2));
    const padX = 14;
    const chipW = label.width + padX * 2;
    const chip = this.add.graphics();
    chip.fillStyle(this.palette.parchment, 0.96);
    chip.fillRoundedRect(0, 0, chipW, label.height + 14, 9);
    chip.lineStyle(1.5, this.palette.parchmentEdge, 1);
    chip.strokeRoundedRect(0, 0, chipW, label.height + 14, 9);
    label.setPosition(padX, 7);
    const holder = this.add.container(Math.round((vw - chipW) / 2), vh - 52, [chip, label]);
    holder.setAlpha(0);
    this.uiLayer.add(holder);
    this.cameras.main.ignore(holder);
    this.tweens.add({
      targets: holder,
      alpha: 1,
      y: vh - 58,
      duration: 260,
      hold: 1300,
      yoyo: true,
      onComplete: () => holder.destroy(true),
    });

    // A located moment sparkles and pulses its structure.
    if (moment.at !== "sky") {
      const slot = SLOTS[moment.at];
      const pos = isoToScreen(slot.tx + slot.w / 2, slot.ty + slot.h / 2);
      this.burstAt(pos.x, pos.y - 40, moment.tone === "bad" ? 0xef4444 : 0xf59e0b);
      const sprite = this.structureSprites.get(moment.at);
      if (sprite !== undefined) {
        this.tweens.add({
          targets: sprite,
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 260,
          yoyo: true,
          ease: "Sine.easeInOut",
        });
      }
    }
  }

  /** A one-shot sparkle burst in world space. */
  private burstAt(x: number, y: number, tint: number): void {
    const burst = this.add.particles(x, y, "fx:dot", {
      lifespan: 900,
      speed: { min: 40, max: 120 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint,
      emitting: false,
    });
    burst.setDepth(95000);
    this.addWorld(burst);
    burst.explode(14);
    this.time.delayedCall(1000, () => burst.destroy());
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
  private lastViewportWidth = 0;

  private syncViewports(): void {
    this.cameras.main.setSize(this.scale.width, this.scale.height);
    this.uiCamera.setSize(this.scale.width, this.scale.height);
    this.fitWorldCamera();
    // Re-lay the panel only on WIDTH changes: phones fire height-only
    // resizes when the browser chrome collapses mid-scroll, and slamming
    // the report shut on scroll is hostile.
    if (Math.abs(this.scale.width - this.lastViewportWidth) > 2) {
      this.closePanel();
    }
    this.lastViewportWidth = this.scale.width;
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
    this.syncAmbient(model.ambientCount);
    this.syncWeather(model.weather);
    // Containers render children in LIST order — child depth is ignored
    // until the container is sorted. Without this, a traveler behind the
    // keep paints in front of it.
    this.worldLayer.sort("depth");
  }

  /**
   * Threat weather (Stage 3): ACTIVE threats become atmosphere — mood, not
   * UI. Winter snows, drought parches the ground, a spending fire sends
   * embers over the market, the bandit camp smokes, a feast means confetti
   * over the festival grounds. Dormant threats render NOTHING (contract).
   */
  private syncWeather(weather: SceneModel["weather"]): void {
    // Remove ended weather AND weather whose severity shifted (rebuild).
    for (const [kind, fx] of this.weatherFx) {
      const now = (weather as Record<string, number | undefined>)[kind];
      if (now === undefined || now !== fx.severity) {
        for (const obj of fx.objects) obj.destroy();
        this.weatherFx.delete(kind);
      }
    }
    const b = mapBounds();
    for (const [kind, severity] of Object.entries(weather) as Array<[string, 1 | 2 | 3]>) {
      if (this.weatherFx.has(kind)) continue;
      const objects: Phaser.GameObjects.GameObject[] = [];
      if (kind === "winter") {
        // Real snowFALL: flakes spawn inside the map diamond only, fall a
        // meaningful distance with a gentle sway, and fade at both ends.
        // Geom.Polygon has NO getRandomPoint (a polygon emit zone silently
        // collapses to the origin — the tiny-column-of-snow bug), so the
        // zone is a custom source that rejection-samples the diamond.
        // Alive ~= lifespan/(frequency/severity) — ≤51 at severity 3.
        const diamond = new Phaser.Geom.Polygon([
          isoToScreen(0, 0),
          isoToScreen(17, 0),
          isoToScreen(17, 12),
          isoToScreen(0, 12),
        ]);
        const diamondSource = {
          getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
            let x = 0;
            let y = 0;
            do {
              x = b.minX + Math.random() * (b.maxX - b.minX);
              y = b.minY + Math.random() * (b.maxY - b.minY);
            } while (!Phaser.Geom.Polygon.Contains(diamond, x, y));
            point.x = x;
            point.y = y;
            return point;
          },
        };
        const snow = this.add.particles(0, 0, "fx:dot", {
          emitZone: { type: "random", source: diamondSource, quantity: 40 },
          lifespan: 6000,
          speedY: { min: 34, max: 58 },
          speedX: { min: -14, max: 14 },
          scale: { start: 0.55, end: 0.35 },
          alpha: { values: [0, 0.9, 0.9, 0], interpolation: "linear" },
          quantity: 1,
          frequency: 350 / severity,
        });
        snow.setDepth(100000);
        objects.push(this.addWorld(snow));
      } else if (kind === "drought") {
        // Parch the land: a warm brown wash over the whole map diamond.
        const parch = this.add.graphics();
        parch.fillStyle(0x9a6b32, 0.12 * severity);
        const corners = [
          isoToScreen(0, 0),
          isoToScreen(17, 0),
          isoToScreen(17, 12),
          isoToScreen(0, 12),
        ];
        parch.fillPoints(
          corners.map((c) => new Phaser.Geom.Point(c.x, c.y)),
          true,
        );
        parch.setDepth(1);
        objects.push(this.addWorld(parch));
      } else if (kind === "fire") {
        const market = isoToScreen(6, 6);
        const embers = this.add.particles(market.x, market.y, "fx:dot", {
          x: { min: -120, max: 120 },
          lifespan: 2600,
          speedY: { min: -55, max: -25 },
          speedX: { min: -12, max: 12 },
          scale: { start: 0.4, end: 0 },
          alpha: { start: 0.9, end: 0 },
          tint: [0xf59e0b, 0xef4444, 0xfbbf24],
          quantity: severity,
          frequency: 260 / severity,
        });
        embers.setDepth(90000);
        objects.push(this.addWorld(embers));
      } else if (kind === "bandits") {
        const slot = SLOTS.banditCamp;
        const camp = isoToScreen(slot.tx + slot.w / 2, slot.ty + slot.h / 2);
        const smoke = this.add.particles(camp.x, camp.y - 90, "fx:dot", {
          x: { min: -10, max: 10 },
          lifespan: 4200,
          speedY: { min: -30, max: -16 },
          speedX: { min: -6, max: 14 },
          scale: { start: 0.6, end: 1.6 },
          alpha: { start: 0.5, end: 0 },
          tint: 0x57534e,
          quantity: 1,
          frequency: 520 / severity,
        });
        smoke.setDepth(90000);
        objects.push(this.addWorld(smoke));
      } else if (kind === "feast") {
        const slot = SLOTS.festival;
        const grounds = isoToScreen(slot.tx + slot.w / 2, slot.ty + slot.h / 2);
        const confetti = this.add.particles(grounds.x, grounds.y - 140, "fx:dot", {
          x: { min: -90, max: 90 },
          lifespan: 3200,
          speedY: { min: 14, max: 34 },
          speedX: { min: -18, max: 18 },
          scale: { start: 0.45, end: 0.2 },
          alpha: { start: 1, end: 0.2 },
          tint: [0xf59e0b, 0x34d399, 0x60a5fa, 0xf472b6],
          quantity: severity,
          frequency: 300 / severity,
        });
        confetti.setDepth(90000);
        objects.push(this.addWorld(confetti));
      }
      if (objects.length > 0) this.weatherFx.set(kind, { severity, objects });
    }
  }

  /**
   * Ambient life (Stage 2): villagers around the commons, their number set
   * by the builders resource — the kingdom literally grows busier as the
   * surplus does. Purely decorative, deterministic by index (no randomness:
   * the same kingdom always bustles the same way), never interactive.
   */
  private static readonly COMMONS: ReadonlyArray<{ tx: number; ty: number }> = [
    { tx: 6.2, ty: 6.4 }, // the market square
    { tx: 8.4, ty: 4.6 }, // before the keep
    { tx: 11.2, ty: 6.8 }, // the festival grounds
    { tx: 3.4, ty: 6.6 }, // by the granary
    { tx: 8.2, ty: 7.6 }, // the gate commons
  ];

  private syncAmbient(count: number): void {
    while (this.ambientSprites.length > count) {
      const sprite = this.ambientSprites.pop();
      if (sprite !== undefined) {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          duration: TWEEN_MS,
          onComplete: () => sprite.destroy(),
        });
      }
    }
    while (this.ambientSprites.length < count) {
      const i = this.ambientSprites.length;
      const anchor = VistaScene.COMMONS[i % VistaScene.COMMONS.length] as {
        tx: number;
        ty: number;
      };
      // Deterministic scatter around the anchor, index-derived.
      const ox = (((i * 37) % 7) - 3) * 0.22;
      const oy = (((i * 53) % 7) - 3) * 0.22;
      const home = isoToScreen(anchor.tx + ox, anchor.ty + oy);
      const sprite = this.add
        .image(home.x, home.y, "traveler:villager")
        .setOrigin(0.5, 1)
        .setDepth(home.y)
        .setAlpha(0);
      this.addWorld(sprite);
      this.ambientSprites.push(sprite);
      this.tweens.add({ targets: sprite, alpha: 0.9, duration: TWEEN_MS });
      // A small wandering loop: out to an index-derived point and back.
      const wander = isoToScreen(
        anchor.tx + ox + (((i * 17) % 5) - 2) * 0.35,
        anchor.ty + oy + (((i * 29) % 5) - 2) * 0.35,
      );
      this.tweens.add({
        targets: sprite,
        x: wander.x,
        y: wander.y,
        duration: 2600 + ((i * 331) % 1400),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: (i * 211) % 900,
      });
    }
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
        // A growth moment (level tier changed): dip-and-reveal + sparkle.
        const s = sprite;
        const pos = this.structurePosition(placed.key);
        this.tweens.add({
          targets: s,
          alpha: 0.3,
          duration: TWEEN_MS / 2,
          yoyo: true,
          onYoyo: () => s.setTexture(texture),
        });
        this.burstAt(pos.x, pos.y - 40, 0xf59e0b);
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
        this.addBob(sprite, t.id, pos.y);
      } else if (Math.abs(sprite.x - pos.x) > 1 || Math.abs(sprite.y - pos.y) > 4) {
        // Both axes move on an iso road; the idle bob must rebase to the
        // new y or the sprite drifts off the road over time.
        const moving = sprite;
        this.tweens.killTweensOf(moving);
        this.tweens.add({
          targets: moving,
          x: pos.x,
          y: pos.y,
          duration: TWEEN_MS,
          onComplete: () => this.addBob(moving, t.id, pos.y),
        });
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
      sprite.removeAllListeners("pointerup");
      const placed = t;
      sprite.on(
        "pointerup",
        (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.openRegistry(placed);
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

  /** One idle bob per traveler, phase-jittered by id so the road breathes. */
  private addBob(sprite: Phaser.GameObjects.Image, id: string, baseY: number): void {
    const jitter = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 400;
    this.tweens.add({
      targets: sprite,
      y: baseY - 3,
      duration: 900 + jitter,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
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

  /** Stage 4: the Road Registry opens in-world; naming flows back to React
   * (CAS handlers), the fresh model re-renders tints, the panel closes on
   * action as its feedback. */
  private openRegistry(placed: PlacedTraveler): void {
    this.closePanel();
    this.panel = new RegistryPanel(
      this,
      this.uiLayer,
      placed,
      this.palette,
      this.model?.registryReadOnly ?? true,
      (roleId) => {
        this.closePanel();
        this.callbacks.onAssignRole(placed.id, roleId);
      },
      () => {
        this.closePanel();
        this.callbacks.onClearRole(placed.id);
      },
      () => this.closePanel(),
    );
    this.cameras.main.ignore(this.panel.root);
  }

  private closePanel(): void {
    this.panel?.destroy();
    this.panel = null;
  }
}
