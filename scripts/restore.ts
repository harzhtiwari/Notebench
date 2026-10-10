import { copyFileSync, existsSync, readdirSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const ROOT = resolve(process.cwd());
const backupPath = process.argv[2] ? resolve(process.argv[2]) : "";

if (!backupPath || !existsSync(backupPath)) {
  console.error("❌ Error: Please provide a valid backup directory path.");
  console.error("Usage: pnpm run restore <path-to-backup-dir>");
  process.exit(1);
}

console.log(`🔄 Restoring Notebench from: ${backupPath}`);

// 1. Validate Integrity Manifest if Present
const manifestPath = join(backupPath, "manifest.json");
if (existsSync(manifestPath)) {
  console.log("  - Verifying SHA-256 backup integrity manifest...");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    files: Record<string, string>;
  };
  for (const [relPath, expectedHash] of Object.entries(manifest.files)) {
    const full = join(backupPath, relPath);
    if (!existsSync(full)) {
      console.error(`❌ Corrupted backup: Missing file ${relPath}`);
      process.exit(1);
    }
    const actualHash = createHash("sha256").update(readFileSync(full)).digest("hex");
    if (actualHash !== expectedHash) {
      console.error(`❌ Checksum mismatch in ${relPath}: expected ${expectedHash}, got ${actualHash}`);
      process.exit(1);
    }
  }
  console.log("    ✅ All checksums verified.");
}

// 2. Sanitize Database Directory (Purge Stale WAL/SHM)
console.log("  - Purging existing WAL and SHM files to prevent corruption...");
const stateDir = join(ROOT, ".notebook", "state");
mkdirSync(stateDir, { recursive: true });
rmSync(join(stateDir, "app.sqlite-wal"), { force: true });
rmSync(join(stateDir, "app.sqlite-shm"), { force: true });

// 3. Restore Database
const backupDb = join(backupPath, "state", "app.sqlite");
if (existsSync(backupDb)) {
  console.log("  - Restoring SQLite database file...");
  copyFileSync(backupDb, join(stateDir, "app.sqlite"));
  const backupWal = join(backupPath, "state", "app.sqlite-wal");
  if (existsSync(backupWal)) {
    copyFileSync(backupWal, join(stateDir, "app.sqlite-wal"));
  }
}

// 4. Restore Storage Directories
function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else copyFileSync(srcPath, destPath);
  }
}

const backupNotebook = join(backupPath, "notebook");
if (existsSync(backupNotebook)) {
  for (const folder of readdirSync(backupNotebook)) {
    console.log(`  - Restoring .notebook/${folder}...`);
    copyDir(join(backupNotebook, folder), join(ROOT, ".notebook", folder));
  }
}

console.log("✅ Restore completed successfully.");
