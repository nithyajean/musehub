// Schema migration. migrate(db) runs the portable DDL from ddl.ts through the
// executor, so the same call builds the schema on SQLite or Postgres. Every
// statement uses IF NOT EXISTS, so migrate is safe to run more than once. This is
// what the tests call to build a fresh in-memory database.

import { sql } from 'drizzle-orm';
import { createDb } from './db.js';
import { migrationStatements } from './ddl.js';
import type { Db } from './types.js';

/** Create every table and index if it does not already exist. Idempotent. */
export async function migrate(db: Db): Promise<void> {
  for (const statement of migrationStatements(db.dialect)) {
    await db.exec.run(sql.raw(statement));
  }
}

async function main(): Promise<void> {
  const url =
    process.argv[2] ?? process.env.MUSEHUB_DB_URL ?? process.env.DATABASE_URL ?? './musehub.db';
  const db = createDb(url);
  try {
    await migrate(db);
    process.stdout.write(`migrated ${db.dialect} database at ${url}\n`);
  } finally {
    await db.close();
  }
}

// Run as a script (pnpm db:migrate / tsx src/migrate.ts), not when imported.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}
