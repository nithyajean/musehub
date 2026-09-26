// createDb opens the right driver for a url and hands back a drizzle instance with
// its executor. SQLite is used for a file path or an in-memory url, Postgres for a
// postgres:// url. Every dialect difference lives here and nowhere else.

import BetterSqlite3 from 'better-sqlite3';
import { type SQL, sql } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { type PostgresJsDatabase, drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Db, Exec, Row } from './types.js';

const PG_URL = /^postgres(ql)?:\/\//i;

/** True when the url should open SQLite rather than Postgres. */
export function isSqliteUrl(url: string): boolean {
  return !PG_URL.test(url);
}

/** Map a url to the file better-sqlite3 opens. Handles the sqlite: and file: prefixes. */
function sqlitePath(url: string): string {
  if (url === ':memory:' || url === 'sqlite::memory:' || url === 'sqlite://:memory:') {
    return ':memory:';
  }
  if (url.startsWith('sqlite://')) return url.slice('sqlite://'.length);
  if (url.startsWith('sqlite:')) return url.slice('sqlite:'.length);
  if (url.startsWith('file:')) return url.slice('file:'.length);
  return url;
}

function sqliteExec(orm: BetterSQLite3Database, close: () => void): Exec {
  return {
    dialect: 'sqlite',
    all: async <T = Row>(query: SQL) => orm.all<T>(query),
    get: async <T = Row>(query: SQL) => {
      const row = orm.get<T>(query) as T | undefined;
      return row ?? null;
    },
    run: async (query: SQL) => {
      orm.run(query);
    },
    close: async () => {
      close();
    },
  };
}

function pgExec(orm: PostgresJsDatabase, close: () => Promise<void>): Exec {
  return {
    dialect: 'pg',
    all: async <T = Row>(query: SQL) => (await orm.execute(query)) as unknown as T[],
    get: async <T = Row>(query: SQL) => {
      const rows = (await orm.execute(query)) as unknown as T[];
      return rows[0] ?? null;
    },
    run: async (query: SQL) => {
      await orm.execute(query);
    },
    close,
  };
}

/**
 * Open a database. A file path or `:memory:` opens SQLite through better-sqlite3, a
 * `postgres://` url opens Postgres through the postgres driver. The returned handle
 * carries the drizzle instance, its executor and a close method.
 */
export function createDb(url: string): Db {
  if (isSqliteUrl(url)) {
    const path = sqlitePath(url);
    const sqlite = new BetterSqlite3(path);
    // WAL is meaningless for an in-memory database, so only ask for it on a file.
    if (path !== ':memory:') sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const orm = drizzleSqlite(sqlite);
    const exec = sqliteExec(orm, () => sqlite.close());
    return { dialect: 'sqlite', orm, exec, close: () => exec.close() };
  }
  const client = postgres(url);
  const orm = drizzlePg(client);
  const exec = pgExec(orm, () => client.end({ timeout: 5 }));
  return { dialect: 'pg', orm, exec, close: () => exec.close() };
}

/** Ping the connection. Useful for a Postgres smoke test. */
export async function ping(db: Db): Promise<boolean> {
  const row = await db.exec.get<{ ok: number }>(sql`SELECT 1 AS ok`);
  return row?.ok === 1;
}
