// Drizzle table objects for both dialects, built from the one spec in spec.ts. These
// back drizzle-kit (see drizzle.config.ts) and give the ORM a typed handle on the
// schema. The tested schema creator is the portable DDL in ddl.ts, which the
// programmatic migrate runs. Both derive from the same spec, so they cannot drift.

import {
  index as pgIndex,
  integer as pgInteger,
  primaryKey as pgPrimaryKey,
  pgTable,
  text as pgText,
  uniqueIndex as pgUniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  primaryKey as sqlitePrimaryKey,
  sqliteTable,
  text as sqliteText,
  uniqueIndex as sqliteUniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { TABLES, type TableSpec } from './spec.js';
import type { ColKind } from './types.js';

function isInteger(kind: ColKind): boolean {
  return kind === 'int' || kind === 'bool';
}

// A spec-driven column record. drizzle column builders change type on every chained
// call, so this is typed loosely on purpose.
// biome-ignore lint/suspicious/noExplicitAny: spec-driven drizzle column builders.
type Cols = Record<string, any>;

// drizzle's primaryKey and index .on want a non-empty column tuple. Every spec key
// has at least one column, so this reshape is safe.
// biome-ignore lint/suspicious/noExplicitAny: drizzle expects a non-empty column tuple.
function tuple(names: string[], t: Cols): [any, ...any[]] {
  // biome-ignore lint/suspicious/noExplicitAny: same non-empty column tuple.
  return names.map((n) => t[n]) as [any, ...any[]];
}

function buildSqliteTable(spec: TableSpec) {
  const cols: Cols = {};
  for (const c of spec.columns) {
    let col = isInteger(c.kind) ? sqliteInteger(c.name) : sqliteText(c.name);
    if (c.pk && !spec.primaryKey) col = col.primaryKey();
    if (c.notNull) col = col.notNull();
    cols[c.name] = col;
  }
  return sqliteTable(spec.name, cols, (t: Cols) => {
    const extra: Cols = {};
    if (spec.primaryKey) {
      extra.pk = sqlitePrimaryKey({ columns: tuple(spec.primaryKey, t) });
    }
    for (const idx of spec.indexes ?? []) {
      const make = idx.unique ? sqliteUniqueIndex(idx.name) : sqliteIndex(idx.name);
      extra[idx.name] = make.on(...tuple(idx.columns, t));
    }
    return extra;
  });
}

function buildPgTable(spec: TableSpec) {
  const cols: Cols = {};
  for (const c of spec.columns) {
    let col = isInteger(c.kind) ? pgInteger(c.name) : pgText(c.name);
    if (c.pk && !spec.primaryKey) col = col.primaryKey();
    if (c.notNull) col = col.notNull();
    cols[c.name] = col;
  }
  return pgTable(spec.name, cols, (t: Cols) => {
    const extra: Cols = {};
    if (spec.primaryKey) {
      extra.pk = pgPrimaryKey({ columns: tuple(spec.primaryKey, t) });
    }
    for (const idx of spec.indexes ?? []) {
      const make = idx.unique ? pgUniqueIndex(idx.name) : pgIndex(idx.name);
      extra[idx.name] = make.on(...tuple(idx.columns, t));
    }
    return extra;
  });
}

function buildSchema(build: (spec: TableSpec) => unknown): Record<string, unknown> {
  const schema: Record<string, unknown> = {};
  for (const spec of TABLES) schema[spec.name] = build(spec);
  return schema;
}

/** Every table as a SQLite drizzle table, keyed by table name. */
export const sqliteSchema = buildSchema(buildSqliteTable);

/** Every table as a Postgres drizzle table, keyed by table name. */
export const pgSchema = buildSchema(buildPgTable);
