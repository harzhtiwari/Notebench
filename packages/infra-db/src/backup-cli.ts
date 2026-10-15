import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  backupLiveDatabase,
  defaultBackupDir,
  pruneBackups,
  removeWalShmFiles,
  verifyBackupIntegrity,
} from "./backup.js";

function usageError(message: string): number {
  console.error(`Error: ${message}`);
  console.error(
    "Usage: backup-cli backup <dbPath> <destPath> | verify <dbPath> | prune [dir] [--max N] [--days N] | unlink-wal-shm <dbPath>"
  );
  return 2;
}

function parseNonNegativeInt(
  value: string | undefined,
  flag: string
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }
  return parsed;
}

/**
 * Thin process entry for scripts/backup.sh and scripts/restore.sh.
 * All policy lives in backup.js; this file only maps argv to it.
 */
export async function runBackupCli(argv: string[]): Promise<number> {
  const command = argv[0];
  try {
    switch (command) {
      case "backup": {
        const dbPath = argv[1];
        const destPath = argv[2];
        if (dbPath === undefined || destPath === undefined) {
          return usageError("backup requires <dbPath> <destPath>");
        }
        const db = new Database(resolve(dbPath), { fileMustExist: true });
        try {
          // Awaited before close: closing aborts pending backups.
          const result = await backupLiveDatabase(db, resolve(destPath));
          console.log(JSON.stringify(result));
          return 0;
        } finally {
          db.close();
        }
      }
      case "verify": {
        const dbPath = argv[1];
        if (dbPath === undefined) return usageError("verify requires <dbPath>");
        const report = verifyBackupIntegrity(resolve(dbPath));
        console.log(JSON.stringify(report));
        return 0;
      }
      case "prune": {
        let dir: string | undefined;
        let max: number | undefined;
        let days: number | undefined;
        for (let i = 1; i < argv.length; i++) {
          const token = argv[i];
          if (token === "--max") {
            max = parseNonNegativeInt(argv[i + 1], "--max");
            i++;
          } else if (token === "--days") {
            days = parseNonNegativeInt(argv[i + 1], "--days");
            i++;
          } else if (token !== undefined && !token.startsWith("--") && dir === undefined) {
            dir = token;
          } else {
            return usageError(`unexpected argument: ${token ?? ""}`);
          }
        }
        const result = pruneBackups(resolve(dir ?? defaultBackupDir()), {
          ...(max === undefined ? {} : { maxRetained: max }),
          ...(days === undefined ? {} : { retentionDays: days }),
        });
        console.log(JSON.stringify(result));
        return 0;
      }
      case "unlink-wal-shm": {
        const dbPath = argv[1];
        if (dbPath === undefined) {
          return usageError("unlink-wal-shm requires <dbPath>");
        }
        const result = removeWalShmFiles(resolve(dbPath));
        console.log(JSON.stringify(result));
        return 0;
      }
      default: {
        return usageError(`unknown command: ${command ?? "(none)"}`);
      }
    }
  } catch (err) {
    console.error(`backup-cli failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const code = await runBackupCli(process.argv.slice(2));
  process.exit(code);
}
