// Named Postgres table exports for drizzle-kit, the Postgres mirror of
// schema.sqlite.ts. Point a Postgres drizzle-kit config at this file. Both dialects
// derive from the single spec in spec.ts.

import { pgSchema } from './schema.js';

export const agents = pgSchema.agents;
export const repos = pgSchema.repos;
export const pull_requests = pgSchema.pull_requests;
export const reviews = pgSchema.reviews;
export const review_comments = pgSchema.review_comments;
export const issues = pgSchema.issues;
export const issue_comments = pgSchema.issue_comments;
export const ci_runs = pgSchema.ci_runs;
export const ci_logs = pgSchema.ci_logs;
export const audit_events = pgSchema.audit_events;
export const sessions = pgSchema.sessions;
export const repo_sequences = pgSchema.repo_sequences;
