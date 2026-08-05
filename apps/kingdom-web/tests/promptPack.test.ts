// Guards the generated art prompt pack (art/PROMPTS.md + art/prompt-pack.json)
// against drift from ASSET_MANIFEST and promptPack.ts. Regenerate both files:
//   UPDATE_PROMPT_PACK=1 pnpm --filter @platform/kingdom-web test -- promptPack

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ASSET_MANIFEST } from "../src/scene/assets";
import {
  PACK_EXCLUDED,
  buildPromptPack,
  renderPromptsJson,
  renderPromptsMarkdown,
} from "../src/scene/promptPack";

const MD_PATH = fileURLToPath(new URL("../art/PROMPTS.md", import.meta.url));
const JSON_PATH = fileURLToPath(new URL("../art/prompt-pack.json", import.meta.url));

const pack = buildPromptPack();

describe("prompt pack", () => {
  it("covers every manifest key except the programmatic exclusions", () => {
    const covered = pack.map((entry) => entry.frame);
    const expected = Object.keys(ASSET_MANIFEST).filter((key) => !PACK_EXCLUDED.includes(key));
    expect(covered).toEqual(expected);
  });

  it("carries the exact manifest canvas size in every prompt", () => {
    for (const entry of pack) {
      const spec = ASSET_MANIFEST[entry.frame];
      if (!spec) throw new Error(`no manifest entry for ${entry.frame}`);
      expect({ frame: entry.frame, w: entry.w, h: entry.h }).toEqual({
        frame: entry.frame,
        w: spec.px.w,
        h: spec.px.h,
      });
      expect(entry.prompt).toContain(`exactly ${spec.px.w}×${spec.px.h} px canvas`);
    }
  });

  it("keeps traveler garb tintable (no baked-in strong hues)", () => {
    for (const entry of pack.filter((e) => e.category === "traveler")) {
      expect(entry.prompt).toContain("neutral grays");
      expect(entry.prompt).toContain("no baked-in strong hues");
    }
  });

  it("matches the generated files on disk", () => {
    const md = renderPromptsMarkdown(pack);
    const json = renderPromptsJson(pack);
    if (process.env.UPDATE_PROMPT_PACK) {
      writeFileSync(MD_PATH, md);
      writeFileSync(JSON_PATH, json);
      return;
    }
    expect(readFileSync(MD_PATH, "utf8"), "art/PROMPTS.md is stale — regenerate").toBe(md);
    expect(readFileSync(JSON_PATH, "utf8"), "art/prompt-pack.json is stale — regenerate").toBe(
      json,
    );
  });
});
