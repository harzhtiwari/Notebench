import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { pgSchema } from "../schema/index.js";

const { Pool } = pg;

export interface PgDatabaseConfig {
  /**
   * Connection string URL (e.g. postgres://user:pass@localhost:5432/notebench).
   */
  connectionString?: string | undefined;
  /**
   * Existing pg.Pool instance.
   */
  pool?: pg.Pool | undefined;
  /**
   * Optional pool configuration options.
   */
  poolConfig?: pg.PoolConfig | undefined;
}

export interface PgDatabaseInstance {
  db: NodePgDatabase<typeof pgSchema>;
  pool: pg.Pool;
  close: () => Promise<void>;
}

/**
 * Factory function creating and configuring a PostgreSQL database adapter.
 */
export function createPgDatabase(
  config: PgDatabaseConfig = {}
): PgDatabaseInstance {
  const pool =
    config.pool ??
    new Pool(
      config.connectionString
        ? { connectionString: config.connectionString, ...config.poolConfig }
        : config.poolConfig
    );

  const db = drizzle(pool, { schema: pgSchema });

  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}
