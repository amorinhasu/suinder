import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { createDatabasePool } from './client.js';

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), '../../..');
const migrationsDir = path.join(projectRoot, 'migrations');

async function ensureMigrationsTable(pool: ReturnType<typeof createDatabasePool>): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function appliedVersions(pool: ReturnType<typeof createDatabasePool>): Promise<Set<string>> {
  const result = await pool.query<{ version: string }>('select version from schema_migrations order by version');
  return new Set(result.rows.map((row) => row.version));
}

export async function runMigrations(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const pool = createDatabasePool(config);

  try {
    await ensureMigrationsTable(pool);
    const applied = await appliedVersions(pool);
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) {
        logger.debug('Skipping already applied migration', { migration: file });
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const client = await pool.connect();

      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
        logger.info('Applied migration', { migration: file });
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

const invokedFromCli = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (invokedFromCli) {
  runMigrations().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
