import type { NextConfig } from "next";

const config: NextConfig = {
  // Static export served from GitHub Pages under /callout/kingdom (pages.yml).
  output: "export",
  basePath: "/callout/kingdom",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
