// Shared low-level types for the data layer. The Exec interface is the one seam
// that hides the dialect: the stores build dialect-neutral drizzle `sql` fragments
// and run them through an Exec, and createDb wires the concrete SQLite or Postgres
// executor behind it.

import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export type Dialect = 'sqlite' | 'pg';

export type ColKind = 'text' | 'int' | 'bool' | 'json' | 'ts';

/** A raw result row keyed by column name. */
export type Row = Record<string, unknown>;

/**
 * Runs prepared SQL and returns plain rows. SQLite runs synchronously under the
 * hood and Postgres asynchronously, so every method is async and callers never
 * see the difference.
 */
export interface Exec {
  readonly dialect: Dialect;
  all<T = Row>(query: SQL): Promise<T[]>;
  get<T = Row>(query: SQL): Promise<T | null>;
  run(query: SQL): Promise<void>;
  close(): Promise<void>;
}

/** The drizzle instance createDb returns, tagged with its dialect and executor. */
export interface Db {
  readonly dialect: Dialect;
  readonly orm: BetterSQLite3Database | PostgresJsDatabase;
  readonly exec: Exec;
  close(): Promise<void>;
}
