import pg from "pg";

/**
 * Ticket 28 — PostgreSQL integration harness.
 *
 * All live-Postgres tests under `packages/infra-db/test/` are gated on
 * `POSTGRES_URL`:
 *
 * - unset  → the Postgres dialect/test skips cleanly with a clear message.
 *            `pnpm test:postgres` starts a pgvector container and sets it.
 * - set    → the tests run and fail loudly if the server is unreachable
 *            (that is the CI gate; the script only sets it once pg_isready).
 */

const { Pool } = pg;

export const POSTGRES_URL = process.env["POSTGRES_URL"];

/**
 * Returns a human-readable reason when Postgres integration tests must skip,
 * or null when they should run.
 */
export function pgIntegrationSkipReason(): string | null {
  if (!POSTGRES_URL) {
    return "POSTGRES_URL is not set. Run `pnpm test:postgres` to start a pgvector container (or point POSTGRES_URL at a service).";
  }
  return null;
}

export interface FreshPgDatabase {
  /** Connection string for the freshly created, empty database. */
  url: string;
  /** Drops the database and closes the admin pool. */
  close: () => Promise<void>;
}

let databaseCounter = 0;

/**
 * Creates a brand-new empty database on the Postgres server addressed by
 * POSTGRES_URL and returns its connection string. This is what makes the
 * migration test an "applies to an empty Postgres database" proof: every
 * harness instance gets its own database, created and dropped per test.
 */
export async function createFreshPgDatabase(): Promise<FreshPgDatabase> {
  const adminUrl = POSTGRES_URL;
  if (!adminUrl) {
    throw new Error(
      "POSTGRES_URL is not set; Postgres integration tests must skip before calling createFreshPgDatabase()"
    );
  }

  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  const name = `notebench_t28_${Date.now()}_${databaseCounter++}`;

  try {
    // Identifier is generated above (no user input), so interpolation is safe.
    await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await admin.end();
    throw new Error(
      `Cannot create test database on Postgres at POSTGRES_URL (is the server reachable?): ${String(error)}`
    );
  }

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;

  return {
    url: url.toString(),
    close: async () => {
      try {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    },
  };
}
