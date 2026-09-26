// Portable DDL derived from the spec. This is the schema creator the tests and the
// programmatic migrate use. The generated statements use only TEXT, INTEGER,
// PRIMARY KEY, NOT NULL and DEFAULT, which mean the same thing in SQLite and
// Postgres, so one set of statements builds both. Identifiers come from the spec
// alone, never from user input, so raw text here is safe.

import { TABLES, type TableSpec } from './spec.js';
import type { ColKind, Dialect } from './types.js';

function sqlType(kind: ColKind): string {
  switch (kind) {
    case 'int':
    case 'bool':
      return 'INTEGER';
    default:
      return 'TEXT';
  }
}

function columnClause(col: TableSpec['columns'][number], singlePk: boolean): string {
  const parts = [col.name, sqlType(col.kind)];
  if (singlePk) parts.push('PRIMARY KEY');
  if (col.notNull) parts.push('NOT NULL');
  if (col.default !== undefined) parts.push(`DEFAULT ${col.default}`);
  return parts.join(' ');
}

function createTable(table: TableSpec): string {
  const composite = table.primaryKey && table.primaryKey.length > 0;
  const lines = table.columns.map((c) => `  ${columnClause(c, !composite && c.pk === true)}`);
  if (composite) {
    lines.push(`  PRIMARY KEY (${(table.primaryKey as string[]).join(', ')})`);
  }
  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n${lines.join(',\n')}\n)`;
}

function createIndexes(table: TableSpec): string[] {
  return (table.indexes ?? []).map((idx) => {
    const unique = idx.unique ? 'UNIQUE ' : '';
    return `CREATE ${unique}INDEX IF NOT EXISTS ${idx.name} ON ${table.name} (${idx.columns.join(', ')})`;
  });
}

/** Every CREATE statement for the schema, tables first then their indexes. */
export function migrationStatements(_dialect: Dialect): string[] {
  const statements: string[] = [];
  for (const table of TABLES) {
    statements.push(createTable(table));
  }
  for (const table of TABLES) {
    statements.push(...createIndexes(table));
  }
  return statements;
}
