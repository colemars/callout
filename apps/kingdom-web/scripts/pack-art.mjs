#!/usr/bin/env node
// Pack raw generated frames (art/raw/*.png, ~1024px, transparent) into the
// shipping atlas: trim each frame to its alpha bounding box, downscale to
// the exact ASSET_MANIFEST px from art/prompt-pack.json, crisp the alpha
// edge, shelf-pack everything into one sheet, and emit a Phaser 3 JSON-hash
// atlas. Pure Node (zlib) — no image dependencies.
//
//   node scripts/pack-art.mjs            # packs into public/vista/
//
// Outputs: public/vista/kingdom.png + public/vista/kingdom.json, plus
// art/frames/<key>.png for eyeballing individual results.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(HERE, "../art/raw");
const FRAMES_DIR = join(HERE, "../art/frames");
const OUT_DIR = join(HERE, "../public/vista");
const PACK = JSON.parse(readFileSync(join(HERE, "../art/prompt-pack.json"), "utf8"));

// --- PNG decode (RGBA8 only, which is what gpt-image-1 emits) --------------

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  let pos = 8;
  const idat = [];
  let w = 0;
  let h = 0;
  let colorType = -1;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IHDR") {
      w = buf.readUInt32BE(pos + 8);
      h = buf.readUInt32BE(pos + 12);
      colorType = buf[pos + 17];
    }
    if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  if (colorType !== 6) throw new Error(`unsupported PNG color type ${colorType} (need RGBA8)`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const img = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filt = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = img.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? out[i - 4] : 0;
      const up = prev ? prev[i] : 0;
      const ul = prev && i >= 4 ? prev[i - 4] : 0;
      let v = src[i];
      if (filt === 1) v += left;
      else if (filt === 2) v += up;
      else if (filt === 3) v += (left + up) >> 1;
      else if (filt === 4) v += paeth(left, up, ul);
      out[i] = v & 255;
    }
  }
  return { w, h, data: img };
}

function encodePng({ w, h, data }) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "ascii");
    const crcBuf = Buffer.concat([head.subarray(4), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    chunks.push(head, body, crc);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunk("IHDR", ihdr);
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 }));
  chunk("IEND", Buffer.alloc(0));
  return Buffer.concat(chunks);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- Image ops --------------------------------------------------------------

/** Alpha bounding box (alpha > 8), or null for a fully transparent image. */
function contentBox(img) {
  const { w, h, data } = img;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function crop(img, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    img.data.copy(
      out,
      y * box.w * 4,
      ((box.y + y) * img.w + box.x) * 4,
      ((box.y + y) * img.w + box.x + box.w) * 4,
    );
  }
  return { w: box.w, h: box.h, data: out };
}

/** Premultiplied box-filter resize — no background halo bleed. */
function resize(img, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const xr = img.w / dw;
  const yr = img.h / dh;
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * yr;
    const sy1 = Math.min((dy + 1) * yr, img.h);
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * xr;
      const sx1 = Math.min((dx + 1) * xr, img.w);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let sy = Math.floor(sy0); sy < sy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < sx1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          const weight = wx * wy;
          const i = (sy * img.w + sx) * 4;
          const pa = img.data[i + 3] / 255;
          r += img.data[i] * pa * weight;
          g += img.data[i + 1] * pa * weight;
          b += img.data[i + 2] * pa * weight;
          a += pa * weight;
          area += weight;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round((a / area) * 255);
      }
    }
  }
  return { w: dw, h: dh, data: out };
}

/** Crisp the soft generation halo: cull faint alpha, solidify near-opaque. */
function crispAlpha(img) {
  for (let i = 3; i < img.data.length; i += 4) {
    const a = img.data[i];
    if (a < 32) img.data[i] = 0;
    else if (a > 224) img.data[i] = 255;
  }
  return img;
}

/** Scale-to-contain into exactly tw×th, anchored bottom-center or center. */
function fitInto(img, tw, th, anchor) {
  const scale = Math.min(tw / img.w, th / img.h);
  const sw = Math.max(1, Math.round(img.w * scale));
  const sh = Math.max(1, Math.round(img.h * scale));
  const scaled = resize(img, sw, sh);
  const out = Buffer.alloc(tw * th * 4);
  const ox = Math.floor((tw - sw) / 2);
  const oy = anchor === "bottom" ? th - sh : Math.floor((th - sh) / 2);
  for (let y = 0; y < sh; y++) {
    scaled.data.copy(out, ((oy + y) * tw + ox) * 4, y * sw * 4, (y + 1) * sw * 4);
  }
  return { w: tw, h: th, data: out };
}

// --- Pipeline ---------------------------------------------------------------

// Tiles fill their whole diamond footprint, so stretch to exact size; badges
// center; everything that stands on the ground anchors to the bottom edge.
function fitMode(entry) {
  if (entry.frame === "tile:tree") return { mode: "contain", anchor: "bottom" };
  if (entry.category === "tile") return { mode: "stretch" };
  if (entry.category === "badge") return { mode: "contain", anchor: "center" };
  return { mode: "contain", anchor: "bottom" };
}

function processFrame(entry, rawPath) {
  const img = decodePng(readFileSync(rawPath));
  const box = contentBox(img);
  if (!box) throw new Error(`${entry.frame}: image is fully transparent`);
  const trimmed = crop(img, box);
  const fit = fitMode(entry);
  const sized =
    fit.mode === "stretch"
      ? resize(trimmed, entry.w, entry.h)
      : fitInto(trimmed, entry.w, entry.h, fit.anchor);
  return crispAlpha(sized);
}

// Shelf packing: tallest first, fixed sheet width, 2px padding all around.
function packSheet(frames) {
  const PAD = 2;
  const SHEET_W = 1024;
  const sorted = [...frames].sort((a, b) => b.img.h - a.img.h || a.frame.localeCompare(b.frame));
  let x = PAD;
  let y = PAD;
  let shelfH = 0;
  for (const f of sorted) {
    if (x + f.img.w + PAD > SHEET_W) {
      x = PAD;
      y += shelfH + PAD;
      shelfH = 0;
    }
    f.x = x;
    f.y = y;
    x += f.img.w + PAD;
    if (f.img.h > shelfH) shelfH = f.img.h;
  }
  const sheetH = y + shelfH + PAD;
  const sheet = { w: SHEET_W, h: sheetH, data: Buffer.alloc(SHEET_W * sheetH * 4) };
  for (const f of sorted) {
    for (let row = 0; row < f.img.h; row++) {
      f.img.data.copy(
        sheet.data,
        ((f.y + row) * SHEET_W + f.x) * 4,
        row * f.img.w * 4,
        (row + 1) * f.img.w * 4,
      );
    }
  }
  return { sheet, placed: sorted };
}

function atlasJson(placed, sheetName, sheet) {
  const frames = {};
  for (const f of placed) {
    frames[f.frame] = {
      frame: { x: f.x, y: f.y, w: f.img.w, h: f.img.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.img.w, h: f.img.h },
      sourceSize: { w: f.img.w, h: f.img.h },
    };
  }
  return {
    frames,
    meta: {
      app: "pack-art.mjs",
      image: sheetName,
      size: { w: sheet.w, h: sheet.h },
      scale: "1",
    },
  };
}

const missing = [];
const frames = [];
for (const entry of PACK) {
  const rawPath = join(RAW_DIR, `${entry.frame.replaceAll(":", "__")}.png`);
  if (!existsSync(rawPath)) {
    missing.push(entry.frame);
    continue;
  }
  process.stdout.write(`packing ${entry.frame} -> ${entry.w}x${entry.h}... `);
  const img = processFrame(entry, rawPath);
  frames.push({ frame: entry.frame, img, x: 0, y: 0 });
  console.log("ok");
}

if (missing.length > 0) {
  console.warn(`\nWARNING: ${missing.length} frames missing from art/raw:`);
  for (const m of missing) console.warn(`  ${m}`);
}

mkdirSync(FRAMES_DIR, { recursive: true });
for (const f of frames) {
  writeFileSync(join(FRAMES_DIR, `${f.frame.replaceAll(":", "__")}.png`), encodePng(f.img));
}

const { sheet, placed } = packSheet(frames);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "kingdom.png"), encodePng(sheet));
writeFileSync(
  join(OUT_DIR, "kingdom.json"),
  `${JSON.stringify(atlasJson(placed, "kingdom.png", sheet), null, 2)}\n`,
);
console.log(
  `\n${frames.length} frames packed into public/vista/kingdom.png (${sheet.w}x${sheet.h}), atlas kingdom.json written`,
);
process.exit(missing.length > 0 ? 1 : 0);
