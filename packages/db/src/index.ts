// @musehub/db - a Drizzle data layer that runs on Postgres 16 or SQLite from one
// schema, plus the concrete implementations of the @musehub/core persistence ports.
//
// createDb(url) opens the right driver, migrate(db) builds the schema, and
// createStores(db, { clock, ids }) returns the eight ports the composition root
// spreads into core's Ports.

export { createDb, isSqliteUrl, ping } from './db.js';
export { migrate } from './migrate.js';
export { migrationStatements } from './ddl.js';
export { FixedClock, PrefixedIdGen, SystemClock } from './ids.js';
export { createStores } from './stores/index.js';
export type { StoreDeps, Stores } from './stores/index.js';
export { decodeCursor, encodeCursor } from './cursor.js';
export { pgSchema, sqliteSchema } from './schema.js';
export { TABLES } from './spec.js';
export type { ColSpec, IndexSpec, TableSpec } from './spec.js';
export type { Db, Dialect, Exec, Row } from './types.js';
