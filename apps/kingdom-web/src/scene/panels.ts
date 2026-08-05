// In-canvas parchment panels on the UI layer (screen space, CSS-pixel fonts,
// text resolution = capped DPR — the two-camera fix keeps them readable on
// every device). Two panels share the core: the steward's report (structure
// parity with the old DOM StructureModal) and the Road Registry (Stage 4 —
// the crown names its visitors without leaving the world).
// (Owner-accepted tradeoffs: canvas text is softer than DOM, and there is
// no screen-reader access until a later stage.)

import Phaser from "phaser";
import { ROLE_CATALOG, type RoleId, roleFor } from "../model/roads";
import type { StructureState } from "../model/types";
import type { VistaPalette } from "./palette";
import type { PlacedTraveler } from "./sceneModel";

const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

/** A pointerup that traveled is a scroll, not a tap — never an action. */
const isDrag = (p: Phaser.Input.Pointer): boolean =>
  Math.hypot(p.upX - p.downX, p.upY - p.downY) > 8;

const TONE_COLORS = {
  bad: 0xdc2626,
  warn: 0xd97706,
  good: 0x059669,
} as const;

interface TextOpts {
  x?: number;
  style?: Partial<Phaser.Types.GameObjects.Text.TextStyle>;
  width?: number;
}

/** Shared parchment mechanics: scrim, content flow, frame, scroll. */
abstract class ParchmentPanel {
  readonly root: Phaser.GameObjects.Container;
  protected readonly scene: Phaser.Scene;
  protected readonly palette: VistaPalette;
  protected readonly width: number;
  protected readonly pad = 16;
  protected readonly textWidth: number;
  protected readonly resolution: number;
  protected readonly content: Phaser.GameObjects.Container;
  protected y: number;

  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Container,
    palette: VistaPalette,
    onClose: () => void,
  ) {
    this.scene = scene;
    this.palette = palette;
    const vw = scene.scale.width;
    this.width = Math.min(440, vw - 24);
    this.textWidth = this.width - this.pad * 2;
    this.resolution = Math.min(window.devicePixelRatio || 1, 2);
    this.y = this.pad;

    this.root = scene.add.container(0, 0);
    uiLayer.add(this.root);

    // Scrim: tap-out closes. stopPropagation everywhere in the panel —
    // Phaser dispatches a pointerup to EVERY hit object, so without it the
    // closing click falls through to the world and reopens things.
    const scrim = scene.add
      .rectangle(0, 0, vw, scene.scale.height, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive();
    scrim.on(
      "pointerup",
      (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        onClose();
      },
    );
    this.root.add(scrim);
    this.content = scene.add.container(0, 0);
  }

  protected text(value: string, size: number, color: number, opts?: TextOpts) {
    const t = this.scene.add.text(opts?.x ?? this.pad, this.y, value, {
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: `${size}px`,
      color: css(color),
      wordWrap: { width: opts?.width ?? this.textWidth },
      ...opts?.style,
    });
    t.setResolution(this.resolution);
    this.content.add(t);
    return t;
  }

  protected rightText(value: string, size: number, color: number) {
    const t = this.scene.add
      .text(this.width - this.pad, this.y, value, {
        fontFamily: "Georgia, serif",
        fontSize: `${size}px`,
        color: css(color),
      })
      .setOrigin(1, 0)
      .setResolution(this.resolution);
    this.content.add(t);
    return t;
  }

  protected rule(): void {
    const g = this.scene.add.graphics();
    g.lineStyle(1, this.palette.parchmentEdge, 1);
    g.lineBetween(this.pad, this.y, this.width - this.pad, this.y);
    this.content.add(g);
  }

  protected closeLink(onClose: () => void): void {
    const close = this.scene.add
      .text(this.width - this.pad, this.pad, "close", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: css(this.palette.inkMuted),
      })
      .setOrigin(1, 0)
      .setResolution(this.resolution);
    // Touch floor: the text is ~13px; the tap target must not be.
    close.setInteractive(
      new Phaser.Geom.Rectangle(-14, -14, close.width + 28, close.height + 28),
      Phaser.Geom.Rectangle.Contains,
    );
    close.on(
      "pointerup",
      (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        onClose();
      },
    );
    this.content.add(close);
  }

  /** Frame the parchment around the built content; add scroll if needed. */
  protected finalize(): void {
    const scene = this.scene;
    const vw = scene.scale.width;
    const vh = scene.scale.height;
    const contentHeight = this.y + this.pad;
    const height = Math.min(contentHeight, vh - 24);
    const panelX = Math.round((vw - this.width) / 2);
    const panelY = Math.round((vh - height) / 2);

    const parchment = scene.add.graphics();
    parchment.fillStyle(this.palette.parchment, 1);
    parchment.fillRoundedRect(0, 0, this.width, height, 12);
    parchment.lineStyle(2, this.palette.parchmentEdge, 1);
    parchment.strokeRoundedRect(0, 0, this.width, height, 12);

    const panel = scene.add.container(panelX, panelY, [parchment, this.content]);
    parchment.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    parchment.on(
      "pointerup",
      (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) =>
        event.stopPropagation(),
    );
    this.root.add(panel);

    const overflow = contentHeight - height;
    if (overflow > 0) {
      const mask = scene.add
        .graphics()
        .fillStyle(0xffffff)
        .fillRoundedRect(panelX, panelY, this.width, height, 12)
        .setVisible(false);
      this.root.add(mask);
      this.content.setMask(mask.createGeometryMask());
      let scrollY = 0;
      const applyScroll = (dy: number) => {
        scrollY = Math.max(-overflow, Math.min(0, scrollY - dy));
        this.content.y = scrollY;
      };
      parchment.on("wheel", (_p: unknown, _dx: number, dy: number) => applyScroll(dy * 0.5));
      let dragging = false;
      let lastY = 0;
      parchment.on("pointerdown", (p: Phaser.Input.Pointer) => {
        dragging = true;
        lastY = p.y;
      });
      scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
        if (!dragging) return;
        applyScroll(lastY - p.y);
        lastY = p.y;
      });
      scene.input.on("pointerup", () => {
        dragging = false;
      });
    }
  }

  destroy(): void {
    this.root.destroy(true);
  }
}

/** The steward's report — parity with the retired DOM StructureModal. */
export class StewardPanel extends ParchmentPanel {
  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Container,
    structure: StructureState,
    palette: VistaPalette,
    onClose: () => void,
  ) {
    super(scene, uiLayer, palette, onClose);

    const title = this.text(`${structure.icon}  ${structure.name}`, 18, palette.ink, {
      style: { fontStyle: "bold" },
      width: this.textWidth - 60,
    });
    this.closeLink(onClose);
    this.y += title.height + 6;

    const pips = scene.add.graphics();
    for (let i = 0; i < 5; i++) {
      pips.fillStyle(
        structure.hostile === true ? palette.hostile : palette.gold,
        i < structure.level ? 1 : 0.25,
      );
      pips.fillCircle(this.pad + 7 + i * 20, this.y + 7, 6);
    }
    this.content.add(pips);
    const badges = [
      structure.locked === true ? "🔒 sealed until old age" : null,
      structure.lien === true ? "🏦 pledged to the bank" : null,
    ].filter((badge) => badge !== null);
    if (badges.length > 0) {
      const b = scene.add
        .text(this.pad + 5 * 20 + 12, this.y, badges.join("   "), {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: css(palette.inkMuted),
        })
        .setResolution(this.resolution);
      this.content.add(b);
    }
    this.y += 24;

    this.rule();
    this.y += 10;
    this.y += this.text(structure.detail, 14, palette.ink).height + 10;

    for (const line of structure.lines ?? []) {
      if (line.heading === true) {
        this.y += 4;
        const h = this.text(line.label.toUpperCase(), 11, palette.inkMuted, {
          style: { fontStyle: "bold" },
        });
        this.y += h.height + 4;
        continue;
      }
      const label = this.text(line.label, 13, palette.ink, {
        width: line.value !== undefined ? this.textWidth - 110 : this.textWidth,
      });
      if (line.value !== undefined) this.rightText(line.value, 13, palette.ink);
      this.y += label.height + 1;
      if (line.note !== undefined) {
        const toneColor = line.tone !== undefined ? TONE_COLORS[line.tone] : palette.inkMuted;
        this.y += this.text(line.note, 12, toneColor).height + 3;
      }
      this.y += 3;
    }

    if (structure.basis !== undefined) {
      this.y += 6;
      this.rule();
      this.y += 8;
      this.y += this.text(`Per the royal surveyors: ${structure.basis}.`, 11, palette.inkMuted, {
        style: { fontStyle: "italic" },
      }).height;
    }

    this.finalize();
  }
}

/** Stage 4: the Road Registry, in-world — the crown names its visitors. */
export class RegistryPanel extends ParchmentPanel {
  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Container,
    placed: PlacedTraveler,
    palette: VistaPalette,
    readOnly: boolean,
    onAssign: (roleId: RoleId) => void,
    onClear: () => void,
    onClose: () => void,
  ) {
    super(scene, uiLayer, palette, onClose);
    const traveler = placed.state;
    const currentRole = roleFor(traveler.role);

    const title = this.text(`${currentRole.icon}  ${traveler.name}`, 18, palette.ink, {
      style: { fontStyle: "bold" },
      width: this.textWidth - 60,
    });
    this.closeLink(onClose);
    this.y += title.height + 2;
    this.y += this.text("The Road Registry", 11, palette.inkMuted).height + 8;

    this.rule();
    this.y += 8;
    const rows: Array<[string, string]> = [
      ["Arrival", traveler.arrivalCopy],
      ...(traveler.amount !== undefined
        ? ([
            [
              traveler.source === "income" ? "Brings" : "Takes",
              `$${(Math.abs(traveler.amount.amountMinor) / 100).toFixed(2)}`,
            ],
          ] as Array<[string, string]>)
        : []),
      ["Cadence", traveler.cadence],
    ];
    for (const [label, value] of rows) {
      const l = this.text(label, 12, palette.inkMuted, { width: 90 });
      const v = this.scene.add
        .text(this.width - this.pad, this.y, value, {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: css(palette.ink),
          wordWrap: { width: this.textWidth - 90 },
          align: "right",
        })
        .setOrigin(1, 0)
        .setResolution(this.resolution);
      this.content.add(v);
      this.y += Math.max(l.height, v.height) + 4;
    }

    this.y += 4;
    const header = this.text(
      readOnly ? "THE SCRIBES CANNOT WRITE HERE" : "NAME THIS VISITOR",
      11,
      palette.inkMuted,
      { style: { fontStyle: "bold" } },
    );
    this.y += header.height + 6;

    if (!readOnly) {
      const ordinary = ROLE_CATALOG.filter((r) => r.byDecreeOnly !== true);
      const byDecree = ROLE_CATALOG.filter((r) => r.byDecreeOnly === true);
      this.roleGrid(ordinary, traveler.role, traveler.roleAssigned, onAssign);
      this.y += 6;
      const decreeHeader = this.text("BY DECREE OF THE CROWN", 11, palette.inkMuted, {
        style: { fontStyle: "bold" },
      });
      this.y += decreeHeader.height + 6;
      this.roleGrid(byDecree, traveler.role, traveler.roleAssigned, onAssign);

      if (traveler.roleAssigned) {
        this.y += 6;
        const clear = this.text("let the visitor pass unnamed", 12, palette.inkMuted, {
          style: { fontStyle: "italic" },
        });
        clear.setInteractive(
          new Phaser.Geom.Rectangle(-10, -12, clear.width + 20, clear.height + 24),
          Phaser.Geom.Rectangle.Contains,
        );
        clear.on(
          "pointerup",
          (
            p: Phaser.Input.Pointer,
            _x: unknown,
            _y: unknown,
            event: Phaser.Types.Input.EventData,
          ) => {
            event.stopPropagation();
            if (!isDrag(p)) onClear();
          },
        );
        this.y += clear.height + 4;
      }
    }

    this.y += 8;
    this.rule();
    this.y += 8;
    this.y += this.text(
      "The registry names the visitor; it does not bar the gate. To close a road, speak with the bank or the merchant — when a tithe ends, its road falls quiet on its own.",
      11,
      palette.inkMuted,
    ).height;
    this.y += 6;
    this.y += this.text(`Per the royal surveyors: ${traveler.basis}.`, 11, palette.inkMuted, {
      style: { fontStyle: "italic" },
    }).height;

    this.finalize();
  }

  /** Two-column role buttons with 44px-floor tap targets. */
  private roleGrid(
    roles: ReadonlyArray<(typeof ROLE_CATALOG)[number]>,
    currentRole: string,
    assigned: boolean,
    onAssign: (roleId: RoleId) => void,
  ): void {
    const colWidth = Math.floor((this.textWidth - 8) / 2);
    const rowHeight = 30;
    roles.forEach((role, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = this.pad + col * (colWidth + 8);
      const y = this.y + row * rowHeight;
      const active = assigned && role.id === currentRole;
      const label = this.scene.add
        .text(x + 6, y + 6, `${role.icon} ${role.name}`, {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: css(active ? this.palette.gold : this.palette.ink),
          fontStyle: active ? "bold" : "normal",
        })
        .setResolution(this.resolution);
      const box = this.scene.add.graphics();
      box.lineStyle(1, active ? this.palette.gold : this.palette.parchmentEdge, 1);
      box.strokeRoundedRect(x, y, colWidth, rowHeight - 4, 6);
      box.setInteractive(
        new Phaser.Geom.Rectangle(x, y - 4, colWidth, rowHeight + 4),
        Phaser.Geom.Rectangle.Contains,
      );
      box.on(
        "pointerup",
        (
          p: Phaser.Input.Pointer,
          _x: unknown,
          _y: unknown,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          if (!active && !isDrag(p)) onAssign(role.id);
        },
      );
      this.content.add(box);
      this.content.add(label);
    });
    this.y += Math.ceil(roles.length / 2) * rowHeight + 2;
  }
}
