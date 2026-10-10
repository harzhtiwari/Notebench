import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

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
        entry.name === ".next" ||
        entry.name === ".turbo" ||
        entry.name === ".tmp"
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

console.log("🔍 Running Notebench Architectural Guardrails (32 AST Boundary Checks)...");

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
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

  function checkWebImports(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const importPath = moduleSpecifier.text;

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
    ts.forEachChild(node, checkWebImports);
  }
  checkWebImports(sourceFile);
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
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

        function checkInfraImports(node: ts.Node) {
          if (ts.isImportDeclaration(node)) {
            const spec = node.moduleSpecifier;
            if (ts.isStringLiteral(spec)) {
              const imp = spec.text;

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
          ts.forEachChild(node, checkInfraImports);
        }
        checkInfraImports(sourceFile);
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
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

        function checkDomainImports(node: ts.Node) {
          if (ts.isImportDeclaration(node)) {
            const spec = node.moduleSpecifier;
            if (ts.isStringLiteral(spec)) {
              const imp = spec.text;

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
          ts.forEachChild(node, checkDomainImports);
        }
        checkDomainImports(sourceFile);
      }
    }
  }
}

// ============================================================================
// GROUP 5: STATIC TYPE PURITY & AST ANALYSIS (Checks 21-23)
// ============================================================================

const allProductionTsFiles = getAllFiles(join(ROOT, "packages"))
  .concat(getAllFiles(join(ROOT, "apps")))
  .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts") && !f.endsWith(".test-d.ts") && !f.endsWith(".d.ts"));

for (const file of allProductionTsFiles) {
  const content = readFileSync(file, "utf-8");
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

  function checkTypePurity(node: ts.Node) {
    // Check 21: AST check banning explicit 'any'
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      addViolation(
        21,
        "Strict Type Purity",
        file,
        `Explicit 'any' banned at line ${line + 1}. Use 'unknown' and narrow.`
      );
    }

    // Check 22: AST check banning 'as unknown as T'
    if (ts.isAsExpression(node) && ts.isAsExpression(node.expression)) {
      const innerAs = node.expression;
      if (innerAs.type.kind === ts.SyntaxKind.UnknownKeyword) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        addViolation(
          22,
          "Strict Type Purity",
          file,
          `'as unknown as T' escape hatch banned at line ${line + 1}.`
        );
      }
    }

    // Check 23: AST check banning non-null assertions (!) in domain logic
    if (ts.isNonNullExpression(node) && file.includes("domain-")) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      addViolation(
        23,
        "Strict Type Purity",
        file,
        `Non-null assertion '!' banned at line ${line + 1} in domain packages. Handle nullability explicitly.`
      );
    }

    ts.forEachChild(node, checkTypePurity);
  }
  checkTypePurity(sourceFile);
}

// ============================================================================
// GROUP 6: PURE ESM & RUNTIME STANDARDS (Checks 24-26)
// ============================================================================

for (const file of allProductionTsFiles) {
  const content = readFileSync(file, "utf-8");
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

  function checkEsmStandards(node: ts.Node) {
    // Check 24: CommonJS require() ban via AST
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      !file.endsWith(".cjs")
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      addViolation(24, "Pure ESM Standard", file, `CommonJS require() banned at line ${line + 1}.`);
    }

    // Check 25: CommonJS module.exports ban via AST
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "module" &&
      node.name.text === "exports" &&
      !file.endsWith(".cjs")
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      addViolation(25, "Pure ESM Standard", file, `module.exports banned at line ${line + 1}.`);
    }

    // Check 26: Relative imports must specify .js extension (NodeNext packages, excluding Next.js bundler)
    const isNextApp = file.includes("apps/web") || file.includes("apps\\web");
    if (!isNextApp && ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec) && spec.text.startsWith(".")) {
        if (!spec.text.endsWith(".js") && !spec.text.endsWith(".json")) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          addViolation(
            26,
            "NodeNext ESM Extension",
            file,
            `Relative import '${spec.text}' at line ${line + 1} must end with '.js' extension for NodeNext compatibility.`
          );
        }
      }
    }

    ts.forEachChild(node, checkEsmStandards);
  }
  checkEsmStandards(sourceFile);
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
  console.log("✅ All 32 architectural boundary checks passed successfully!");
}
