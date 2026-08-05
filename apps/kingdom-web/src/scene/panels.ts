// The steward's report, rendered INSIDE the world — a parchment panel on the
// UI layer (screen space, CSS-pixel fonts, text resolution = capped DPR so
// it stays readable on every device; the two-camera fix). Reaches parity
// with the DOM StructureModal: icon, name, pips, detail, structured lines
// with tone-colored notes, lock/lien badges, basis footnote.
// (Owner-accepted Stage 1 tradeoffs: canvas text is softer than DOM, and
// there is no screen-reader access until a later stage.)

import Phaser from "phaser";
import type { StructureState } from "../model/types";
import type { VistaPalette } from "./palette";

const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

const TONE_COLORS = {
  bad: 0xdc2626,
  warn: 0xd97706,
  good: 0x059669,
} as const;

export class StewardPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Container,
    structure: StructureState,
    palette: VistaPalette,
    onClose: () => void,
  ) {
    this.scene = scene;
    const vw = scene.scale.width;
    const vh = scene.scale.height;
    const width = Math.min(440, vw - 24);
    const maxHeight = vh - 24;
    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    const pad = 16;
    const textWidth = width - pad * 2;

    this.root = scene.add.container(0, 0);
    uiLayer.add(this.root);

    // Backdrop: full-screen scrim, tap to close.
    const scrim = scene.add.rectangle(0, 0, vw, vh, 0x000000, 0.55).setOrigin(0).setInteractive();
    // stopPropagation everywhere in the panel: Phaser dispatches a pointerup
    // to EVERY hit object, so without it the click that closes the panel
    // falls through to the structure beneath and reopens it instantly.
    scrim.on(
      "pointerup",
      (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        onClose();
      },
    );
    this.root.add(scrim);

    // Content builds top-down into a child container; measured, then framed.
    const content = scene.add.container(0, 0);
    let y = pad;

    const text = (
      value: string,
      size: number,
      color: number,
      opts?: {
        x?: number;
        style?: Partial<Phaser.Types.GameObjects.Text.TextStyle>;
        width?: number;
      },
    ): Phaser.GameObjects.Text => {
      const t = scene.add.text(opts?.x ?? pad, y, value, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: `${size}px`,
        color: css(color),
        wordWrap: { width: opts?.width ?? textWidth },
        ...opts?.style,
      });
      t.setResolution(resolution);
      content.add(t);
      return t;
    };

    // Header: icon + name + close.
    const title = text(`${structure.icon}  ${structure.name}`, 18, palette.ink, {
      style: { fontStyle: "bold" },
      width: textWidth - 60,
    });
    const close = scene.add
      .text(width - pad, y, "close", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: css(palette.inkMuted),
      })
      .setOrigin(1, 0)
      .setResolution(resolution);
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
    content.add(close);
    y += title.height + 6;

    // Pips (level 0-5).
    const pips = scene.add.graphics();
    for (let i = 0; i < 5; i++) {
      const filled = i < structure.level;
      pips.fillStyle(
        structure.hostile === true ? palette.hostile : palette.gold,
        filled ? 1 : 0.25,
      );
      pips.fillCircle(pad + 7 + i * 20, y + 7, 6);
    }
    content.add(pips);
    // Lock / lien badges beside the pips.
    const badges = [
      structure.locked === true ? "🔒 sealed until old age" : null,
      structure.lien === true ? "🏦 pledged to the bank" : null,
    ].filter((b) => b !== null);
    if (badges.length > 0) {
      const b = scene.add
        .text(pad + 5 * 20 + 12, y, badges.join("   "), {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: css(palette.inkMuted),
        })
        .setResolution(resolution);
      content.add(b);
    }
    y += 24;

    // Detail line under a hairline rule.
    const rule = scene.add.graphics();
    rule.lineStyle(1, palette.parchmentEdge, 1);
    rule.lineBetween(pad, y, width - pad, y);
    content.add(rule);
    y += 10;
    y += text(structure.detail, 14, palette.ink).height + 10;

    // Structured lines: heading dividers, label/value rows, toned notes.
    for (const line of structure.lines ?? []) {
      if (line.heading === true) {
        y += 4;
        const h = text(line.label.toUpperCase(), 11, palette.inkMuted, {
          style: { fontStyle: "bold" },
        });
        y += h.height + 4;
        continue;
      }
      const label = text(line.label, 13, palette.ink, {
        width: line.value !== undefined ? textWidth - 110 : textWidth,
      });
      if (line.value !== undefined) {
        const v = scene.add
          .text(width - pad, y, line.value, {
            fontFamily: "Georgia, serif",
            fontSize: "13px",
            color: css(palette.ink),
          })
          .setOrigin(1, 0)
          .setResolution(resolution);
        content.add(v);
      }
      y += label.height + 1;
      if (line.note !== undefined) {
        const toneColor = line.tone !== undefined ? TONE_COLORS[line.tone] : palette.inkMuted;
        y += text(line.note, 12, toneColor).height + 3;
      }
      y += 3;
    }

    // Basis footnote.
    if (structure.basis !== undefined) {
      y += 6;
      const rule2 = scene.add.graphics();
      rule2.lineStyle(1, palette.parchmentEdge, 1);
      rule2.lineBetween(pad, y, width - pad, y);
      content.add(rule2);
      y += 8;
      y += text(`Per the royal surveyors: ${structure.basis}.`, 11, palette.inkMuted, {
        style: { fontStyle: "italic" },
      }).height;
    }
    const contentHeight = y + pad;

    // Frame the parchment; scroll when content exceeds the viewport.
    const height = Math.min(contentHeight, maxHeight);
    const panelX = Math.round((vw - width) / 2);
    const panelY = Math.round((vh - height) / 2);

    const parchment = scene.add.graphics();
    parchment.fillStyle(palette.parchment, 1);
    parchment.fillRoundedRect(0, 0, width, height, 12);
    parchment.lineStyle(2, palette.parchmentEdge, 1);
    parchment.strokeRoundedRect(0, 0, width, height, 12);

    const panel = scene.add.container(panelX, panelY, [parchment, content]);
    // Swallow taps on the parchment so the scrim doesn't close under them.
    parchment.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
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
        .fillRoundedRect(panelX, panelY, width, height, 12)
        .setVisible(false);
      this.root.add(mask);
      content.setMask(mask.createGeometryMask());
      let scrollY = 0;
      const applyScroll = (dy: number) => {
        scrollY = Math.max(-overflow, Math.min(0, scrollY - dy));
        content.y = scrollY;
      };
      parchment.on("wheel", (_p: unknown, _dx: number, dy: number) => applyScroll(dy * 0.5));
      // Touch drag.
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
