// Emits openapi.json for packages/api-client generation. Handlers never run,
// so stub deps are safe — only route schemas are collected.
import { writeFileSync } from "node:fs";
import type { JwtVerifier } from "@platform/auth";
import type { PlatformDb } from "@platform/database";
import { buildApp } from "./app.js";

const app = await buildApp({
  db: null as unknown as PlatformDb,
  verifier: { verify: async () => ({ userId: "stub" }) } as unknown as JwtVerifier,
  logger: false,
});
await app.ready();

const out = new URL("../openapi.json", import.meta.url);
writeFileSync(out, JSON.stringify(app.swagger(), null, 2));
console.log(`wrote ${out.pathname}`);
await app.close();
