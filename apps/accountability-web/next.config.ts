import type { NextConfig } from "next";

const config: NextConfig = {
  // Static export served from GitHub Pages under /callout/app (see pages.yml).
  // Everything is client-rendered against the platform API — no server needed.
  // Move to Vercel later only if SSR becomes worth a second hosting vendor.
  output: "export",
  basePath: "/callout/app",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
