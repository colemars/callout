import type { NextConfig } from "next";

const config: NextConfig = {
  // Static export served from GitHub Pages under /pennykingdom/kingdom (pages.yml).
  output: "export",
  basePath: "/pennykingdom/kingdom",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
