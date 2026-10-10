import { mkdirSync, copyFileSync, existsSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const BACKUP_DIR = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, ".tmp", "backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetDir = join(BACKUP_DIR, `notebench_backup_${timestamp}`);

mkdirSync(join(targetDir, "state"), { recursive: true });
mkdirSync(join(targetDir, "notebook"), { recursive: true });

console.log(`📦 Creating Notebench backup at: ${targetDir}`);

// 1. Transactional SQLite Backup
const dbFile = join(ROOT, ".notebook", "state", "app.sqlite");
const walFile = join(ROOT, ".notebook", "state", "app.sqlite-wal");

if (existsSync(dbFile)) {
  console.log("  - Backing up SQLite database from .notebook/state/...");
  try {
    // Attempt checkpoint via sqlite3 CLI if available
    execSync(`sqlite3 "${dbFile}" "PRAGMA wal_checkpoint(TRUNCATE);"`, { stdio: "ignore" });
    execSync(`sqlite3 "${dbFile}" ".backup '${join(targetDir, "state", "app.sqlite")}'"`, { stdio: "ignore" });
  } catch {
    copyFileSync(dbFile, join(targetDir, "state", "app.sqlite"));
    if (existsSync(walFile)) {
      copyFileSync(walFile, join(targetDir, "state", "app.sqlite-wal"));
    }
  }
}

// 2. Recursive Copy of Storage Assets
function copyDir(src: string, dest: string) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else copyFileSync(srcPath, destPath);
  }
}

for (const folder of ["uploads", "artifacts", "vault", "state"]) {
  const src = join(ROOT, ".notebook", folder);
  if (existsSync(src)) {
    console.log(`  - Archiving .notebook/${folder}...`);
    copyDir(src, join(targetDir, "notebook", folder));
  }
}

// 3. Generate SHA-256 Manifest
console.log("  - Generating cryptographic integrity manifest...");
const manifest: { timestamp: string; files: Record<string, string> } = {
  timestamp,
  files: {},
};

function hashFiles(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      hashFiles(fullPath);
    } else if (entry.name !== "manifest.json") {
      const content = readFileSync(fullPath);
      const rel = relative(targetDir, fullPath).replace(/\\/g, "/");
      manifest.files[rel] = createHash("sha256").update(content).digest("hex");
    }
  }
}

hashFiles(targetDir);
writeFileSync(join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

console.log(`✅ Backup successfully created at: ${targetDir}`);
