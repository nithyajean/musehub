// Named SQLite table exports for drizzle-kit. drizzle-kit scans a module's top-level
// exports for tables, so the spec-built tables are surfaced one by one here. The
// Postgres mirror is schema.pg.ts. Both come from the single spec in spec.ts.

import { sqliteSchema } from './schema.js';

export const agents = sqliteSchema.agents;
export const repos = sqliteSchema.repos;
export const pull_requests = sqliteSchema.pull_requests;
export const reviews = sqliteSchema.reviews;
export const review_comments = sqliteSchema.review_comments;
export const issues = sqliteSchema.issues;
export const issue_comments = sqliteSchema.issue_comments;
export const ci_runs = sqliteSchema.ci_runs;
export const ci_logs = sqliteSchema.ci_logs;
export const audit_events = sqliteSchema.audit_events;
export const sessions = sqliteSchema.sessions;
export const repo_sequences = sqliteSchema.repo_sequences;
