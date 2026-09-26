// Single source of truth for the schema. Both the portable DDL in ddl.ts and the
// drizzle table objects in schema.ts derive from this one spec, so the two cannot
// drift. Column kinds map to storage the same way in both dialects: text, json and
// timestamps store as TEXT, integers and booleans store as INTEGER (0 or 1). That
// one value shape is what lets the stores run one query codebase on Postgres and
// SQLite alike.

export type ColKind = 'text' | 'int' | 'bool' | 'json' | 'ts';

export interface ColSpec {
  name: string;
  kind: ColKind;
  notNull?: boolean;
  pk?: boolean;
  /** Raw default clause for the DDL, for example "''" or "0" or "'[]'". */
  default?: string;
}

export interface IndexSpec {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface TableSpec {
  name: string;
  columns: ColSpec[];
  /** Composite primary key. Single-column keys use the column's own pk flag. */
  primaryKey?: string[];
  indexes?: IndexSpec[];
}

export const TABLES: TableSpec[] = [
  {
    name: 'agents',
    columns: [
      { name: 'id', kind: 'text', pk: true, notNull: true },
      { name: 'handle', kind: 'text', notNull: true },
      { name: 'display_name', kind: 'text' },
      { name: 'did', kind: 'text', notNull: true },
      { name: 'wallet_address', kind: 'text' },
      { name: 'status', kind: 'text', notNull: true },
      { name: 'created_at', kind: 'ts', notNull: true },
    ],
    indexes: [
      { name: 'agents_handle_uidx', columns: ['handle'], unique: true },
      { name: 'agents_did_uidx', columns: ['did'], unique: true },
    ],
  },
  {
    name: 'repos',
    columns: [
      { name: 'id', kind: 'text', pk: true, notNull: true },
      { name: 'owner', kind: 'text', notNull: true },
      { name: 'name', kind: 'text', notNull: true },
      { name: 'visibility', kind: 'text', notNull: true },
      { name: 'description', kind: 'text', notNull: true, default: "''" },
      { name: 'default_branch', kind: 'text', notNull: true },
      { name: 'empty', kind: 'bool', notNull: true, default: '1' },
      { name: 'created_at', kind: 'ts', notNull: true },
    ],
    indexes: [
      { name: 'repos_owner_name_uidx', columns: ['owner', 'name'], unique: true },
      { name: 'repos_created_idx', columns: ['created_at', 'id'] },
    ],
  },
  {
    name: 'pull_requests',
    columns: [
      { name: 'repo', kind: 'text', notNull: true },
      { name: 'number', kind: 'int', notNull: true },
      { name: 'state', kind: 'text', notNull: true },
      { name: 'title', kind: 'text', notNull: true },
      { name: 'body', kind: 'text' },
      { name: 'head', kind: 'text', notNull: true },
      { name: 'base', kind: 'text', notNull: true },
      { name: 'draft', kind: 'bool', notNull: true, default: '0' },
      { name: 'mergeable', kind: 'bool' },
      { name: 'author', kind: 'text', notNull: true },
      { name: 'head_sha', kind: 'text', notNull: true },
      { name: 'url', kind: 'text', notNull: true },
      { name: 'created_at', kind: 'ts', notNull: true },
    ],
    primaryKey: ['repo', 'number'],
    indexes: [
      { name: 'pr_repo_state_idx', columns: ['repo', 'state'] },
      { name: 'pr_head_base_idx', columns: ['repo', 'head', 'base'] },
    ],
  },
  {
    name: 'reviews',
    columns: [
      { name: 'id', kind: 'text', pk: true, notNull: true },
      { name: 'repo', kind: 'text', notNull: true },
      { name: 'pr_number', kind: 'int', notNull: true },
      { name: 'reviewer', kind: 'text', notNull: true },
      { name: 'event', kind: 'text', notNull: true },
      { name: 'body', kind: 'text' },
      { name: 'created_at', kind: 'ts', notNull: true },
    ],
    indexes: [{ name: 'reviews_pr_idx', columns: ['repo', 'pr_number'] }],
  },
  {
    name: 'review_comments',
    columns: [
      { name: 'id', kind: 'text', pk: true, notNull: true },
      { name: 'repo', kind: 'text', notNull: true },
      { name: 'pr_number', kind: 'int', notNull: true },
      { name: 'author', kind: 'text', notNull: true },
      { name: 'body', kind: 'text', notNull: true },
      { name: 'path', kind: 'text' },
      { name: 'line', kind: 'int' },
      { name: 'created_at', kind: 'ts', notNull: true },
    ],
    indexes: [{ name: 'rc_pr_idx', columns: ['repo', 'pr_number'] }],
  },
  {
    name: 'issues',
    columns: [
      { name: 'repo', kind: 'text', notNull: true },
      { name: 'number', kind: 'int', notNull: true },
      { name: 'state', kind: 'text', notNull: true },
      { name: 'title', kind: 'text', notNull: true },
      { name: 'body', kind: 'text' },
      { name: 'author', kind: 'text', notNull: true },
      { name: 'labels', kind: 'json', notNull: true, default: "'[]'" },
      { name: 'assignees', kind: 'json', notNull: true, default: "'[]'" },
      { name: 'is_pr', kind: 'bool', notNull: true, default: '0' },
      { name: 'url', kind: 'text', notNull: true },
      { name: 'created_at', kind: 'ts', notNull: true },
    ],
    primaryKey: ['repo', 'number'],
    indexes: [{ name: 'issues_repo_state_idx', columns: ['repo', 'state'] }],
  },
  {
    name: 'issue_comments',
    columns: [
      { name: 'id', kind: 'text', pk: true, notNull: true },
      { name: 'repo', kind: 'text', notNull: true },
      { name: 'issue_number', kind: 'int', notNull: true },
      { name: 'author', kind: 'text', notNull: true },
      { name: 'body', kind: 'text', notNull: true },
      { name: 'created_at', kind: 'ts', notNull: true },
    ],
    indexes: [{ name: 'ic_issue_idx', columns: ['repo', 'issue_number'] }],
  },
  {
    name: 'ci_runs',
    columns: [
      { name: 'run_id', kind: 'text', pk: true, notNull: true },
      { name: 'repo', kind: 'text', notNull: true },
      { name: 'ref', kind: 'text', notNull: true },
      { name: 'head_sha', kind: 'text', notNull: true },
      { name: 'workflow', kind: 'text', notNull: true },
      { name: 'status', kind: 'text', notNull: true },
      { name: 'conclusion', kind: 'text' },
      { name: 'started_at', kind: 'ts' },
      { name: 'finished_at', kind: 'ts' },
      { name: 'jobs', kind: 'json', notNull: true, default: "'[]'" },
      { name: 'created_at', kind: 'ts', notNull: true },
    ],
    indexes: [{ name: 'ci_runs_repo_sha_idx', columns: ['repo', 'head_sha'] }],
  },
  {
    name: 'ci_logs',
    columns: [
      { name: 'id', kind: 'text', pk: true, notNull: true },
      { name: 'run_id', kind: 'text', notNull: true },
      { name: 'job', kind: 'text', notNull: true },
      { name: 'seq', kind: 'int', notNull: true },
      { name: 'line', kind: 'text', notNull: true },
    ],
    indexes: [{ name: 'ci_logs_run_idx', columns: ['run_id', 'seq'] }],
  },
  {
    name: 'audit_events',
    columns: [
      { name: 'id', kind: 'text', pk: true, notNull: true },
      { name: 'seq', kind: 'int', notNull: true },
      { name: 'actor', kind: 'text', notNull: true },
      { name: 'action', kind: 'text', notNull: true },
      { name: 'target', kind: 'text', notNull: true },
      { name: 'at', kind: 'ts', notNull: true },
      { name: 'metadata', kind: 'json' },
    ],
    indexes: [
      { name: 'audit_seq_idx', columns: ['seq'] },
      { name: 'audit_actor_idx', columns: ['actor', 'seq'] },
    ],
  },
  {
    name: 'sessions',
    columns: [
      { name: 'agent_id', kind: 'text', notNull: true },
      { name: 'repo', kind: 'text', notNull: true },
      { name: 'branch', kind: 'text', notNull: true },
      { name: 'updated_at', kind: 'ts', notNull: true },
    ],
    primaryKey: ['agent_id', 'repo'],
  },
  {
    name: 'repo_sequences',
    columns: [
      { name: 'repo', kind: 'text', pk: true, notNull: true },
      { name: 'last_number', kind: 'int', notNull: true },
    ],
  },
];
