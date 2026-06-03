import pg from 'pg';
import type { AppConfig } from '../config.js';

export type DatabasePool = pg.Pool;

export function createDatabasePool(config: Pick<AppConfig, 'DATABASE_URL' | 'DATABASE_SSL'>): DatabasePool {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined
  });
}

export async function assertDatabaseConnection(pool: DatabasePool): Promise<void> {
  const result = await pool.query<{ ok: number }>('select 1 as ok');

  if (result.rows[0]?.ok !== 1) {
    throw new Error('Database health check failed');
  }
}
