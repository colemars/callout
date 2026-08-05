#!/usr/bin/env node
// Generate Vista sprite frames from art/prompt-pack.json via the OpenAI
// images API (gpt-image-1, transparent background). Raw ~1024px PNGs land
// in art/raw/, named after the frame key with ':' replaced by '__'
// (e.g. structure__keep__t1.png). Downscaling to exact manifest px and
// atlas packing happen in a later step.
//
// Usage (from apps/kingdom-web, needs OPENAI_API_KEY in env or repo .env):
//   node scripts/gen-art.mjs --test        # 5-frame style test for approval
//   node scripts/gen-art.mjs --all         # every frame missing from art/raw
//   node scripts/gen-art.mjs keep granary  # frames whose key contains a term
//   node scripts/gen-art.mjs --force ...   # regenerate even if file exists

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK = JSON.parse(readFileSync(join(HERE, "../art/prompt-pack.json"), "utf8"));
const OUT_DIR = join(HERE, "../art/raw");

const TEST_FRAMES = [
  "structure:keep:t1",
  "structure:keep:t2",
  "structure:keep:t3",
  "traveler:merchant",
  "tile:grass",
];

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  for (const rel of ["../../../.env", "../../.env"]) {
    const path = join(HERE, rel);
    if (!existsSync(path)) continue;
    const match = readFileSync(path, "utf8").match(/^OPENAI_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }
  console.error("OPENAI_API_KEY not found in env or .env");
  process.exit(1);
}

// gpt-image-1 accepts 1024x1024, 1024x1536, 1536x1024 — pick by frame aspect.
function genSize(w, h) {
  const ratio = w / h;
  if (ratio <= 0.75) return "1024x1536";
  if (ratio >= 1.5) return "1536x1024";
  return "1024x1024";
}

async function generate(key, entry) {
  const body = {
    model: "gpt-image-1",
    prompt: entry.prompt,
    size: genSize(entry.w, entry.h),
    quality: "high",
    background: "transparent",
    n: 1,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      return Buffer.from(json.data[0].b64_json, "base64");
    }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      console.warn(`  ${entry.frame}: HTTP ${res.status}, retry ${attempt}/3`);
      await new Promise((r) => setTimeout(r, 15000 * attempt));
      continue;
    }
    throw new Error(`${entry.frame}: HTTP ${res.status} — ${text}`);
  }
  throw new Error(`${entry.frame}: gave up after 3 attempts`);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const terms = args.filter((a) => !a.startsWith("--"));

let selected;
if (args.includes("--test")) {
  selected = PACK.filter((e) => TEST_FRAMES.includes(e.frame));
} else if (args.includes("--all")) {
  selected = PACK;
} else if (terms.length > 0) {
  selected = PACK.filter((e) => terms.some((t) => e.frame.includes(t)));
} else {
  console.error("pass --test, --all, or one or more frame-key substrings");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const key = apiKey();
let done = 0;
let skipped = 0;
let failed = 0;

for (const entry of selected) {
  const file = join(OUT_DIR, `${entry.frame.replaceAll(":", "__")}.png`);
  if (!force && existsSync(file)) {
    skipped++;
    continue;
  }
  process.stdout.write(`generating ${entry.frame} (${genSize(entry.w, entry.h)})... `);
  try {
    const png = await generate(key, entry);
    writeFileSync(file, png);
    done++;
    console.log(`ok (${Math.round(png.length / 1024)} KB)`);
  } catch (err) {
    failed++;
    console.log("FAILED");
    console.error(`  ${err.message}`);
  }
}

console.log(`\n${done} generated, ${skipped} already present, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
