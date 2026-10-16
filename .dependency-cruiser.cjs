// @ts-check
// Deep-module enforcement for dependency-cruiser (v18, see
// https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/rules-reference.md).
//
// Every workspace package under `packages/` is a DEEP MODULE: a lot of
// behaviour behind a small interface. A package's PUBLIC SURFACE is its entry
// points: `src/index.ts` (built to `dist/index.js`, which is what the package
// `exports` map resolves to) plus its other public root-level files (e.g.
// `packages/ui/tokens.css`). Every other file inside `src/` or `dist/` is
// internal and may only be imported by the owning package itself.
//
// This repo differs from the generic layout in one way: unit tests are
// COLOCATED in `src/` next to the code they exercise, so — unlike a tests/
// folder layout — a test may reach its OWN package's internals; it may not
// reach any other package's.
//
// The only thing you should ever need to edit here is PACKAGES_ROOT.
//
// Layering (which package may depend on which) is deliberately NOT duplicated
// here: it is enforced file-by-file by `scripts/guard.ts` (web import
// perimeter, infra/domain isolation, …). If that ever moves, add layering
// rules in the commented stub below.

/** Where packages live. One immediate child dir per package (flat, no nesting). */
const PACKAGES_ROOT = "packages";

// --- derived patterns (no need to edit) -------------------------------------
const R = PACKAGES_ROOT;
/** Test files: `*.test.ts`, `*.spec.tsx`, and type-level `*.test-d.ts`. */
const TEST_FILE = `\\.(test|spec)(-d)?\\.(ts|tsx)$`;
/** A package's source entry point — what its package.json "exports" maps from. */
const SRC_ENTRY = `^${R}/[^/]+/src/index\\.(ts|tsx)$`;
/** The compiled twin of the entry point. */
const DIST_ENTRY = `^${R}/[^/]+/dist/index\\.(js|mjs|cjs)$`;
/** Anything nested in a package's source/build trees … */
const PACKAGE_SUBFOLDERS = [`^${R}/[^/]+/src/.+`, `^${R}/[^/]+/dist/.+`];
/** … except the entry points themselves, which stay importable from outside. */
const ENTRY_POINTS = [SRC_ENTRY, DIST_ENTRY];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "entrypoint-boundary-from-app",
      comment:
        "Outside code (apps/, tools/, scripts/, examples/, root) may import a package's entry points, but nothing inside its subfolders.",
      severity: "error",
      from: { pathNot: `^${R}/` }, // importer is NOT inside any package
      to: { path: PACKAGE_SUBFOLDERS, pathNot: ENTRY_POINTS },
    },
    {
      name: "entrypoint-boundary-across-packages",
      comment:
        "A package's own files import each other freely, but may reach OTHER packages only through their entry points, never their internals.",
      severity: "error",
      // importer is inside a package ($1), but is not a test file
      from: { path: `^${R}/([^/]+)/`, pathNot: TEST_FILE },
      to: {
        path: PACKAGE_SUBFOLDERS,
        pathNot: [
          ...ENTRY_POINTS,
          `^${R}/$1/`, // same package → intra-package freedom
        ],
      },
    },
    {
      name: "tests-through-entrypoints",
      comment:
        "Colocated tests may reach their OWN package's internals (that is what unit tests are for), but they exercise every OTHER package through its entry points.",
      severity: "error",
      from: { path: `^${R}/([^/]+)/src/.+${TEST_FILE}` }, // a test file, in package $1
      to: {
        path: PACKAGE_SUBFOLDERS,
        pathNot: [
          ...ENTRY_POINTS,
          `^${R}/$1/`, // own package (incl. its src internals) → allowed
        ],
      },
    },
    {
      name: "tests-folder-is-private",
      comment:
        "A tests/ folder (e.g. tools/dev/tests) is fixture land: only files under a tests/ folder may import from a tests/ folder.",
      severity: "error",
      from: { pathNot: `(^|/)tests/` }, // importer is not itself a test
      to: { path: `^(packages|tools)/[^/]+/tests/` },
    },
    {
      name: "no-circular",
      comment:
        "No dependency cycles among source modules. Cycles that consist ONLY of type-only imports are allowed: they do not exist at runtime.",
      severity: "error",
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
    {
      name: "no-orphans",
      comment:
        "Modules with neither incoming nor outgoing dependencies are leftovers or unfinished work — review them. Report-only (warn): kept visible without failing the gate. Genuine tool-consumed config files (*.config.mjs etc., tsconfig.json) are excluded — external tools, not the module graph, load them.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          "(^|/)[^/]*\\.config\\.[cm]?[jt]s$",
        ],
      },
      to: {},
    },

    // --- Layering (deliberately left to scripts/guard.ts) ---------------------
    // Interface-hiding controls HOW you import (through the entry points); the
    // guard script controls WHICH packages may depend on which. If that ever
    // moves, add layering rules here, e.g.:
    //
    // {
    //   name: "web-may-not-depend-on-server",
    //   severity: "error",
    //   from: { path: "^apps/web/" },
    //   to:   { path: "^apps/server/" },
    // },
  ],
  options: {
    // Built output, dependencies, and tooling caches are targets only: never
    // cruised on their own (gather step) and never followed further (crawl
    // step).
    doNotFollow: {
      path: "(^|/)(node_modules|dist|out|build|coverage|\\.turbo|\\.next|\\.venv|\\.notebook|\\.tmp)(/|$)",
    },
    // Take type-only imports into account so a deep import cannot hide behind
    // `import type`. (Also faster per the docs.)
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
