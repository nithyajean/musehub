// drizzle-kit config for the SQLite schema (the demo and test dialect). Point a
// second config at ./src/schema.pg.ts with dialect 'postgresql' for Postgres. The
// tested schema creator is the programmatic migrate() in src/migrate.ts, which runs
// the same spec-derived DDL. drizzle-kit generate here is for saved migration files.

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.sqlite.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.MUSEHUB_DB_URL ?? './musehub.db',
  },
});
