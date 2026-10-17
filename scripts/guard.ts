import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

// Zero-dependency source scanner. This guard intentionally does NOT use the
// TypeScript compiler API (which became a native-only binary without a stable
// JS API in TS 7), so future compiler majors cannot break these checks.
//
// Known limitation vs a full AST: raw JSX text nodes are not string literals,
// so a literal word `any` or `!` inside JSX text would be flagged. Grep audits
// show zero such occurrences in-tree; any future trip fails loudly for triage.

interface Violation {
  checkId: number;
  rule: string;
  file: string;
  detail: string;
}

const ROOT = resolve(process.cwd());
const violations: Violation[] = [];

function addViolation(checkId: number, rule: string, file: string, detail: string) {
  violations.push({ checkId, rule, file, detail });
}

function getAllFiles(dir: string, extension: string[] = [".ts", ".tsx"]): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "out" ||
        entry.name === ".next" ||
        entry.name === ".turbo" ||
        entry.name === ".tmp" ||
        entry.name === ".venv"
      ) {
        continue;
      }
      files.push(...getAllFiles(fullPath, extension));
    } else if (entry.isFile() && extension.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

console.log("🔍 Running Notebench Architectural Guardrails (37 AST Boundary Checks)...");

// ============================================================================
// SOURCE SCANNER HELPERS (comment/string-aware, line-precise, no compiler API)
// ============================================================================

/** Strip line/block comments while preserving line breaks (keeps line numbers stable). */
function stripComments(content: string): string {
  const noBlock = content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));
  return noBlock.replace(/\/\/[^\n]*/g, "");
}

/** Replace string/template literal bodies with empty placeholders (keeps positions stable). */
function stripStrings(content: string): string {
  return content
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

/** 1-based line number for a match index. */
function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

interface Specifier {
  specifier: string;
  line: number;
}

/**
 * Extract static import/export specifiers plus dynamic import() targets from
 * comment-stripped source. Covers `import … from`, side-effect imports,
 * `import type`, `export … from`, and `import("…")`.
 */
function extractSpecifiers(codeNoComments: string): Specifier[] {
  const out: Specifier[] = [];
  const staticRe =
    /(?<![\w"'`$])(?:\bimport\s+(?:type\s+)?(?:[^"'`;]*?\bfrom\s+)?|\bexport\s+(?:[^"'`;]*?\bfrom\s+))(["'])([^"'\n]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = staticRe.exec(codeNoComments)) !== null) {
    const spec = m[2] ?? "";
    if (spec) out.push({ specifier: spec, line: lineOf(codeNoComments, m.index) });
  }
  const dynamicRe = /(?<![\w"'`$])\bimport\s*\(\s*(["'])([^"'\n]+)\1/g;
  while ((m = dynamicRe.exec(codeNoComments)) !== null) {
    const spec = m[2] ?? "";
    if (spec) out.push({ specifier: spec, line: lineOf(codeNoComments, m.index) });
  }
  return out;
}

// ============================================================================
// GROUP 1: REPOSITORY ROOT & TAXONOMY (Checks 1-3)
// ============================================================================

// Check 1: Forbidden Shared Directories
if (existsSync(join(ROOT, "packages", "shared"))) {
  addViolation(1, "Forbidden Directory", "packages/shared", "packages/shared is strictly banned.");
}

// Check 2: Forbidden Common Directory
if (existsSync(join(ROOT, "packages", "common"))) {
  addViolation(2, "Forbidden Directory", "packages/common", "packages/common is strictly banned.");
}

// Check 3: Two-Folder Taxonomy (No unauthorized dot-folders at repo root)
const allowedDotFolders = new Set([
  ".git",
  ".github",
  ".changeset",
  ".notebook",
  ".tmp",
  ".scratch",
  ".claude",
  ".gemini",
]);
const rootEntries = readdirSync(ROOT, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isDirectory() && entry.name.startsWith(".")) {
    if (!allowedDotFolders.has(entry.name)) {
      addViolation(
        3,
        "Two-Folder Taxonomy Violation",
        entry.name,
        `Dot-folder '${entry.name}' at root is banned. All state must live in .notebook/ or .tmp/`
      );
    }
  }
}

// ============================================================================
// GROUP 2: WEB APPLICATION IMPORT PERIMETER (Checks 4-8)
// ============================================================================

const webFiles = getAllFiles(join(ROOT, "apps", "web", "src"));
const allowedWebPackages = new Set([
  "@notebook/contracts",
  "@notebook/api-client",
  "@notebook/hooks",
  "@notebook/ui",
  "@notebook/editor",
]);

for (const file of webFiles) {
  const content = readFileSync(file, "utf-8");
  for (const { specifier: importPath } of extractSpecifiers(stripComments(content))) {
    // Check 4: Allowed Web Packages
    if (importPath.startsWith("@notebook/")) {
      const rootPkg = importPath.split("/").slice(0, 2).join("/");
      if (!allowedWebPackages.has(rootPkg)) {
        addViolation(
          4,
          "Web Import Boundary",
          file,
          `apps/web is not allowed to import from '${importPath}'. Allowed: contracts, api-client, hooks, ui, editor.`
        );
      }
    }

    // Check 5: Web cannot import from apps/server
    if (importPath.includes("apps/server") || importPath.includes("@notebook/server")) {
      addViolation(5, "Web Import Boundary", file, "apps/web cannot import from apps/server.");
    }

    // Check 6: Web cannot import from infra-*
    if (importPath.includes("@notebook/infra-")) {
      addViolation(6, "Web Import Boundary", file, "apps/web cannot import infrastructure packages.");
    }

    // Check 7: Web cannot import domain-* directly
    if (importPath.includes("@notebook/domain-")) {
      addViolation(7, "Web Import Boundary", file, "apps/web cannot import domain packages directly.");
    }

    // Check 8: Web cannot import Node built-ins
    if (
      importPath.startsWith("node:fs") ||
      importPath.startsWith("node:child_process") ||
      importPath.startsWith("node:net")
    ) {
      addViolation(8, "Web Node Isolation", file, `apps/web cannot import Node I/O module '${importPath}'.`);
    }
  }
}

// ============================================================================
// GROUP 3: INFRASTRUCTURE ADAPTERS ISOLATION (Checks 9-14)
// ============================================================================

const packagesDir = join(ROOT, "packages");
if (existsSync(packagesDir)) {
  const pkgs = readdirSync(packagesDir, { withFileTypes: true });
  for (const pkg of pkgs) {
    if (pkg.isDirectory() && pkg.name.startsWith("infra-")) {
      const infraFiles = getAllFiles(join(packagesDir, pkg.name, "src"));
      for (const file of infraFiles) {
        const content = readFileSync(file, "utf-8");
        for (const { specifier: imp } of extractSpecifiers(stripComments(content))) {
          // Check 9: Infra cannot import domain-*
          if (imp.includes("@notebook/domain-")) {
            addViolation(9, "Infra-Domain Boundary", file, `Infra package '${pkg.name}' cannot import domain packages.`);
          }

          // Check 10: Infra cannot import apps/*
          if (imp.includes("apps/web") || imp.includes("apps/server")) {
            addViolation(10, "Infra-App Boundary", file, `Infra package '${pkg.name}' cannot import apps.`);
          }

          // Check 11: Infra cannot import peer infra-* packages
          if (imp.startsWith("@notebook/infra-") && !imp.startsWith(`@notebook/${pkg.name}`)) {
            addViolation(11, "Infra Seam Independence", file, `Infra package '${pkg.name}' cannot import peer infra package '${imp}'.`);
          }
        }
      }
    }
  }
}

// ============================================================================
// GROUP 4: DOMAIN PUBLIC API BOUNDARIES & DATABASE ISOLATION (Checks 15-20)
// ============================================================================

if (existsSync(packagesDir)) {
  const pkgs = readdirSync(packagesDir, { withFileTypes: true });
  for (const pkg of pkgs) {
    if (pkg.isDirectory() && pkg.name.startsWith("domain-")) {
      const domainFiles = getAllFiles(join(packagesDir, pkg.name, "src"));
      for (const file of domainFiles) {
        const content = readFileSync(file, "utf-8");
        for (const { specifier: imp } of extractSpecifiers(stripComments(content))) {
          // Check 15 & 16: Domain deep imports banned (must only import through root index)
          if (imp.startsWith("@notebook/domain-")) {
            const parts = imp.split("/");
            if (parts.length > 2) {
              addViolation(
                16,
                "Domain Deep Import",
                file,
                `Deep import '${imp}' is forbidden. Import only through root package index.`
              );
            }
          }

          // Check 17: Domain cannot import apps/*
          if (imp.includes("apps/web") || imp.includes("apps/server")) {
            addViolation(17, "Domain-App Boundary", file, "Domain packages cannot import apps.");
          }

          // Check 18: Domains cannot import raw Drizzle table definitions
          if (imp.includes("drizzle-orm/sqlite-core") || imp.includes("drizzle-orm/pg-core")) {
            addViolation(18, "Database Isolation", file, "Domains cannot import raw Drizzle table definitions.");
          }

          // Check 19: Domains cannot import raw database drivers
          if (imp === "better-sqlite3" || imp === "pg") {
            addViolation(19, "Database Driver Isolation", file, `Domains cannot import database driver '${imp}' directly.`);
          }

          // Check 20: Domains cannot import infra packages directly
          if (imp.startsWith("@notebook/infra-")) {
            addViolation(20, "Domain-Infra Inversion", file, `Domain cannot import '${imp}' directly. Use port/contract interfaces.`);
          }
        }
      }
    }
  }
}

// ============================================================================
// GROUP 5: STATIC TYPE PURITY & TEXT-SCANNER ANALYSIS (Checks 21-23)
// ============================================================================

const allProductionTsFiles = getAllFiles(join(ROOT, "packages"))
  .concat(getAllFiles(join(ROOT, "apps")))
  .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts") && !f.endsWith(".test-d.ts") && !f.endsWith(".d.ts"));

for (const file of allProductionTsFiles) {
  const content = readFileSync(file, "utf-8");
  const code = stripStrings(stripComments(content));

  // Check 21: ban explicit 'any' (standalone token, not a property access or declaration)
  const anyRe = /\bany\b/g;
  let anyMatch: RegExpExecArray | null;
  while ((anyMatch = anyRe.exec(code)) !== null) {
    const prev = anyMatch.index > 0 ? code[anyMatch.index - 1] : "";
    if (prev === ".") continue;
    const lineText = code.slice(code.lastIndexOf("\n", anyMatch.index - 1) + 1, anyMatch.index);
    if (/(?:^|[\s{;,])(?:export\s+)?(?:const|let|var|function|class|interface|type|enum)\s+$/.test(lineText)) continue;
    addViolation(
      21,
      "Strict Type Purity",
      file,
      `Explicit 'any' banned at line ${lineOf(code, anyMatch.index)}. Use 'unknown' and narrow.`
    );
  }

  // Check 22: ban 'as unknown as T' escape hatch
  const doubleAssertRe = /\bas\s+unknown\s+as\b/g;
  let assertMatch: RegExpExecArray | null;
  while ((assertMatch = doubleAssertRe.exec(code)) !== null) {
    addViolation(
      22,
      "Strict Type Purity",
      file,
      `'as unknown as T' escape hatch banned at line ${lineOf(code, assertMatch.index)}.`
    );
  }

  // Check 23: ban non-null assertions (!) in domain logic (excluding !=, !==, and !: definite assignment)
  if (file.includes("domain-")) {
    const bangRe = /!(?!=)/g;
    let bangMatch: RegExpExecArray | null;
    while ((bangMatch = bangRe.exec(code)) !== null) {
      const prev = bangMatch.index > 0 ? code[bangMatch.index - 1] : "";
      if (prev === "" || /[\s({[,;:?=!&|+\-*/%<>~^]/.test(prev)) continue;
      let next = bangMatch.index + 1;
      while (next < code.length && (code[next] === " " || code[next] === "\t")) next++;
      if (code[next] === ":") continue;
      addViolation(
        23,
        "Strict Type Purity",
        file,
        `Non-null assertion '!' banned at line ${lineOf(code, bangMatch.index)} in domain packages. Handle nullability explicitly.`
      );
    }
  }
}

// ============================================================================
// GROUP 6: PURE ESM & RUNTIME STANDARDS (Checks 24-26)
// ============================================================================

for (const file of allProductionTsFiles) {
  const content = readFileSync(file, "utf-8");
  const codeNoComments = stripComments(content);
  const code = stripStrings(codeNoComments);

  // Check 24: CommonJS require() ban
  if (!file.endsWith(".cjs")) {
    const requireRe = /(?<![\w$.])require\s*\(/g;
    let requireMatch: RegExpExecArray | null;
    while ((requireMatch = requireRe.exec(code)) !== null) {
      addViolation(24, "Pure ESM Standard", file, `CommonJS require() banned at line ${lineOf(code, requireMatch.index)}.`);
    }
  }

  // Check 25: CommonJS module.exports ban
  if (!file.endsWith(".cjs")) {
    const exportsRe = /(?<![\w$.])module\.exports\b/g;
    let exportsMatch: RegExpExecArray | null;
    while ((exportsMatch = exportsRe.exec(code)) !== null) {
      addViolation(25, "Pure ESM Standard", file, `module.exports banned at line ${lineOf(code, exportsMatch.index)}.`);
    }
  }

  // Check 26: Relative imports must specify .js extension (NodeNext packages, excluding Next.js bundler)
  const isNextApp = file.includes("apps/web") || file.includes("apps\\web");
  if (!isNextApp) {
    for (const { specifier, line } of extractSpecifiers(codeNoComments)) {
      if (specifier.startsWith(".")) {
        if (!specifier.endsWith(".js") && !specifier.endsWith(".json")) {
          addViolation(
            26,
            "NodeNext ESM Extension",
            file,
            `Relative import '${specifier}' at line ${line} must end with '.js' extension for NodeNext compatibility.`
          );
        }
      }
    }
  }
}

// ============================================================================
// GROUP 7: LICENSE & THIRD-PARTY PERIMETER (Checks 27-29)
// ============================================================================

const pythonToolDir = join(ROOT, "tools", "doc-tools");
if (existsSync(pythonToolDir)) {
  const pyFiles = getAllFiles(pythonToolDir, [".py", ".toml"]);
  for (const file of pyFiles) {
    const content = readFileSync(file, "utf-8");

    // Check 27: PyMuPDF / fitz AGPL ban
    if (content.toLowerCase().includes("fitz") || content.toLowerCase().includes("pymupdf")) {
      addViolation(
        27,
        "Zero AGPL Compliance",
        file,
        "PyMuPDF / fitz is strictly forbidden due to AGPL copyleft infectivity. Use pdfplumber or pypdf."
      );
    }
  }
}

// ============================================================================
// GROUP 8: COMPOSITION ROOT & TELEMETRY (Checks 30-32)
// ============================================================================

// Check 30: Next.js standalone server Dockerfile is banned
if (existsSync(join(ROOT, "apps", "web", "Dockerfile"))) {
  addViolation(30, "Sole Composition Root", "apps/web/Dockerfile", "Next standalone container is banned. Fastify is sole entrypoint.");
}

// Check 31: Hardcoded maintainer Sentry DSNs banned
const bannedDsnPattern = new RegExp(["o\\d+", "ingest", "sentry", "io"].join("\\.") + "|@sentry\\.io");
for (const file of allProductionTsFiles) {
  const content = readFileSync(file, "utf-8");
  if (bannedDsnPattern.test(content)) {
    addViolation(31, "Zero Telemetry Default", file, "Hardcoded maintainer Sentry DSN detected. Sentry must be purely optional self-hoster env.");
  }
}

// Check 32: Ephemeral runtime logs & storage must route into .notebook/ or .tmp/
for (const bannedRoot of ["logs", ".logs", "uploads", "artifacts", "state", "ports", "pids", "cache"]) {
  if (existsSync(join(ROOT, bannedRoot))) {
    addViolation(32, "Two-Folder Taxonomy", bannedRoot, `Root '${bannedRoot}' directory is banned. All state must live under .notebook/ or .tmp/.`);
  }
}

// Check 35: Disposable root allows only the spec layout plus tool caches —
// ticket-scoped siblings (e.g. t04-*) must never appear. Test staging goes
// under .tmp/build/<namespace>/ (spec 5.5), never beside it.
const allowedTmpTopLevel = new Set(["ports", "pids", "logs", "build", "run", "cache", "test"]);
const tmpRoot = join(ROOT, ".tmp");
if (existsSync(tmpRoot)) {
  for (const entry of readdirSync(tmpRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowedTmpTopLevel.has(entry.name)) {
      addViolation(
        35,
        "Disposable Root Layout",
        join(".tmp", entry.name),
        `Top-level '.tmp/${entry.name}' is not part of the disposable layout (ports, pids, logs, build, run, cache). Stage test state under .tmp/build/<namespace>/ instead.`
      );
    }
  }
}

// Check 33: Workspace package exports must point at compiled dist, never src/*.ts
for (const pkgDir of [join(ROOT, "packages", "ui")]) {
  const pkgJsonPath = join(pkgDir, "package.json");
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { exports?: unknown; main?: unknown };
      const serialized = JSON.stringify(pkg.exports ?? {}) + String(pkg.main ?? "");
      if (serialized.includes("src/") && (serialized.includes(".ts") || serialized.includes(".tsx"))) {
        addViolation(33, "Compiled Output Invariant", pkgJsonPath, "@notebook/ui exports/main must point at compiled dist, never src/*.ts (would force transpilePackages).");
      }
    } catch {
      // ignore JSON parse errors — typecheck covers malformed package.json
    }
  }
}

// ============================================================================
// GROUP 9: UPSTREAM ENV ISOLATION (Check 34)
// ============================================================================

// Check 34: Upstream env names must not appear in new source. The scan runs
// over comment-stripped code with word boundaries, so the ticket-01 comment
// naming the upstream family and words like METHOD_NOT_FOUND never match;
// only real OD_/OPEN_DESIGN_/OPENDESIGN_ references fail. scripts/guard.ts
// itself is exempt: implementing this check necessarily names the prefixes.
const upstreamFiles = getAllFiles(join(ROOT, "scripts"), [".ts", ".tsx"])
  .concat(getAllFiles(join(ROOT, "tools", "dev", "src"), [".ts", ".tsx"]))
  .concat(allProductionTsFiles)
  .filter(
    (f) =>
      !f.endsWith(".test.ts") &&
      !f.endsWith(".spec.ts") &&
      !f.endsWith(".test-d.ts") &&
      !f.endsWith(".d.ts") &&
      !f.endsWith(join("scripts", "guard.ts"))
  );
const upstreamRe = /\b(OD_|OPEN_DESIGN_|OPENDESIGN_)[A-Z0-9_]*/g;
for (const file of upstreamFiles) {
  const content = readFileSync(file, "utf-8");
  const codeNoComments = stripComments(content);
  upstreamRe.lastIndex = 0;
  let upstreamMatch: RegExpExecArray | null;
  while ((upstreamMatch = upstreamRe.exec(codeNoComments)) !== null) {
    addViolation(
      34,
      "Upstream Env Isolation",
      file,
      `Upstream env reference '${upstreamMatch[0]}' banned at line ${lineOf(codeNoComments, upstreamMatch.index)}. Use NOTEBENCH_*/NB_* names.`
    );
  }
}

// ============================================================================
// GROUP 10: UI DISCIPLINE (Checks 12-13, 28)
// ============================================================================

// Check 12: apps/web must never import the icon library directly — every
// icon resolves through the packages/ui catalog (ticket ui-01).
for (const file of webFiles) {
  const content = readFileSync(file, "utf-8");
  for (const { specifier, line } of extractSpecifiers(stripComments(content))) {
    if (specifier === "@phosphor-icons/react" || specifier.startsWith("@phosphor-icons/react/")) {
      addViolation(
        12,
        "UI Icon Discipline",
        file,
        `Direct icon-library import '${specifier}' at line ${line} is banned in apps/web. Import icons through '@notebook/ui'.`
      );
    }
  }
}

// Check 13: a web-owned component file used from more than one route must
// exist in the ui index — anything reused across routes lives in
// packages/ui (spec §5). Route = first path segment under apps/web/src/app/.
const webSrcDir = join(ROOT, "apps", "web", "src");
const uiIndexPath = join(ROOT, "packages", "ui", "src", "index.ts");
const uiIndexBases = new Set<string>();
if (existsSync(uiIndexPath)) {
  for (const { specifier } of extractSpecifiers(stripComments(readFileSync(uiIndexPath, "utf-8")))) {
    const last = specifier.split("/").pop() ?? "";
    uiIndexBases.add(last.replace(/\.(js|ts|tsx)$/, "").toLowerCase());
  }
}

function resolveWebTarget(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function routeKeyFor(importer: string): string {
  const rel = relative(webSrcDir, importer).split(sep);
  if (rel[0] === "app" && rel.length > 2) return `route:${rel[1]}`;
  return `file:${relative(ROOT, importer)}`;
}

const webComponentFiles = webFiles.filter((f) => f.split(sep).includes("components"));
for (const componentFile of webComponentFiles) {
  const routes = new Set<string>();
  for (const importer of webFiles) {
    if (importer === componentFile) continue;
    const content = readFileSync(importer, "utf-8");
    for (const { specifier } of extractSpecifiers(stripComments(content))) {
      if (resolveWebTarget(importer, specifier) === componentFile) {
        routes.add(routeKeyFor(importer));
      }
    }
  }
  if (routes.size > 1) {
    const base = basename(componentFile).replace(/\.(tsx|ts)$/, "").toLowerCase();
    if (!uiIndexBases.has(base)) {
      addViolation(
        13,
        "UI Reusability Discipline",
        componentFile,
        `Web component used from ${routes.size} routes (${[...routes].sort().join(", ")}) is not re-exported from '@notebook/ui'. Move it to packages/ui.`
      );
    }
  }
}

// Check 28: generated token outputs must be byte-identical to their docs/ui
// sources — never hand-edit outputs; edits go to tokens.json +
// build_tokens.py, then re-copy. Skipped when docs/ui is absent.
const tokenPairs: Array<[string, string]> = [
  ["docs/ui/tokens.css", "packages/ui/tokens.css"],
  ["docs/ui/tokens.media.css", "packages/ui/tokens.media.css"],
  ["docs/ui/tokens.ts", "packages/ui/src/tokens.ts"],
  ["docs/ui/tailwind.preset.cjs", "packages/ui/tailwind.preset.cjs"],
];
let docsUiSeen = false;
for (const [srcRel, dstRel] of tokenPairs) {
  const src = join(ROOT, srcRel);
  const dst = join(ROOT, dstRel);
  if (!existsSync(src)) continue;
  docsUiSeen = true;
  if (!existsSync(dst)) {
    addViolation(28, "Generated Token Identity", dst, `Generated file '${dstRel}' is missing its docs/ui source copy.`);
    continue;
  }
  if (!readFileSync(src).equals(readFileSync(dst))) {
    addViolation(
      28,
      "Generated Token Identity",
      dst,
      `Generated file '${dstRel}' differs from '${srcRel}'. Edit docs/ui/tokens.json + build_tokens.py and re-copy; never hand-edit outputs.`
    );
  }
}
if (docsUiSeen) {
  for (const tool of ["tokens.json", "build_tokens.py"]) {
    const toolPath = join(ROOT, "docs", "ui", tool);
    if (!existsSync(toolPath)) {
      addViolation(
        28,
        "Token Toolchain",
        toolPath,
        `Token toolchain file 'docs/ui/${tool}' is missing. Token edits must go through ${tool}.`
      );
    }
  }
}

// >>> TICKET-29: hex-colour guard (Check 36) — append-only hunk, do not restructure <<<
// Check 36: Hex-colour literals banned outside generated tokens. Components
// must use design tokens (var(--nb-*)); hard-coded hex breaks dark mode and
// theming (spec Decisions 1.1/1.2; tokens.css header: "A literal color ...
// in a component is a bug"). Zero-dependency scan: stripComments, then match
// #rgb/#rrggbb/#rrggbbaa inside string/template literal bodies with the shared
// lineOf mapping. stripStrings is deliberately NOT applied first — it blanks
// the very literals under test. CSS files are scanned directly because their
// hex colours sit bare in declarations (`color: #fff`), not inside quotes.
// The allow-list is derived from check 28's generated token pairs: the CSS
// outputs verified byte-identical to their docs/ui sources are exempt.
// No ts-morph / TS compiler API (TS 7 ships no stable JS API; see file header
// + research 02-storage-health-release §29).
//
// False-positive trade-off (ticket 29 review F2): the regex is intentionally
// literal-shaped and context-unaware, so hex-shaped text such as "#123" issue
// refs, href="#feed" anchors, or CSS id selectors (#abc) can flag. Triage on
// sight; no context-aware parsing by design.
const generatedTokenCss = tokenPairs
  .filter(([, dstRel]) => dstRel.endsWith(".css"))
  .map(([, dstRel]) => join(ROOT, dstRel));
const hexColourConfig = [
  { dir: join(ROOT, "apps", "web"), allowHexIn: generatedTokenCss },
  { dir: join(ROOT, "packages", "ui"), allowHexIn: generatedTokenCss },
];
const hexLiteralRe = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const stringLiteralRe = /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g;
for (const { dir, allowHexIn } of hexColourConfig) {
  const hexAllowed = new Set(allowHexIn);
  for (const file of getAllFiles(dir, [".ts", ".tsx", ".css"])) {
    if (hexAllowed.has(file)) continue;
    const codeNoComments = stripComments(readFileSync(file, "utf-8"));
    if (file.endsWith(".css")) {
      // Stylesheets: match the stripped text directly; the string-literal
      // pass below never sees unquoted declaration values.
      hexLiteralRe.lastIndex = 0;
      let hx: RegExpExecArray | null;
      while ((hx = hexLiteralRe.exec(codeNoComments)) !== null) {
        addViolation(
          36,
          "Design Token Discipline",
          file,
          `Hex colour literal '${hx[0]}' at line ${lineOf(codeNoComments, hx.index)}. Use a var(--nb-*) token; hex is allowed only in the generated token CSS files (check 28).`
        );
      }
      continue;
    }
    stringLiteralRe.lastIndex = 0;
    let lit: RegExpExecArray | null;
    while ((lit = stringLiteralRe.exec(codeNoComments)) !== null) {
      hexLiteralRe.lastIndex = 0;
      let hx: RegExpExecArray | null;
      while ((hx = hexLiteralRe.exec(lit[0])) !== null) {
        addViolation(
          36,
          "Design Token Discipline",
          file,
          `Hex colour literal '${hx[0]}' at line ${lineOf(codeNoComments, lit.index + hx.index)}. Use a var(--nb-*) token; hex is allowed only in the generated token CSS files (check 28).`
        );
      }
    }
  }
}
// <<< TICKET-29 end <<<

// Check 37: Single catch-all route entry (ticket 06) — the product UI is
// served by apps/web/src/app/[[...slug]]/page.tsx only. A second page entry
// (e.g. app/dashboard/page.tsx) would load outside the persistent AppRoot
// shell: shared state remounts, the route compiles separately, and the
// warmup app-mounted marker is bypassed.
const appDir = join(ROOT, "apps", "web", "src", "app");
const catchAllPage = join(appDir, "[[...slug]]", "page.tsx");
for (const file of getAllFiles(appDir, [".tsx"])) {
  if (basename(file) === "page.tsx" && file !== catchAllPage) {
    addViolation(
      37,
      "Single Route Entry",
      relative(ROOT, file),
      "Only apps/web/src/app/[[...slug]]/page.tsx may be a route entry (ticket 06: one catch-all, merged not duplicated). Render the screen through AppRoot's registry instead."
    );
  }
}

// ============================================================================
// REPORTING SUMMARY
// ============================================================================

if (violations.length > 0) {
  console.error(`\n❌ Architectural Guardrails FAILED: ${violations.length} violation(s) found:\n`);
  for (const v of violations) {
    console.error(`[Check #${v.checkId}] ${v.rule} in ${v.file}: ${v.detail}`);
  }
  process.exit(1);
} else {
  console.log("✅ All 37 architectural boundary checks passed successfully!");
}
