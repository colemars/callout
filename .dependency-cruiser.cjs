/**
 * Architecture boundary rules (ARCHITECTURE.md "Layered Architecture" +
 * "Domain Rules"). Biome handles style; this file owns the dependency arrows.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      // financial-core is the zero-dependency domain layer: no other packages,
      // no npm packages, nothing. (Test files may import vitest.)
      name: "financial-core-is-pure",
      severity: "error",
      from: { path: "^packages/financial-core/src" },
      to: {
        pathNot: "^packages/financial-core/src",
      },
    },
    {
      // No Node built-ins anywhere in financial-core source.
      name: "financial-core-no-node-builtins",
      severity: "error",
      from: { path: "^packages/financial-core/src" },
      to: { dependencyTypes: ["core"] },
    },
    {
      // insight-engine may depend only on financial-core (and itself).
      name: "insight-engine-deps",
      severity: "error",
      from: { path: "^packages/insight-engine/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(insight-engine|financial-core)/",
      },
    },
    {
      // Dependencies point downward: packages never import from apps.
      name: "packages-not-to-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    exclude: { path: "(\\.(test|spec)\\.ts$|/dist/|/node_modules/)" },
  },
};
