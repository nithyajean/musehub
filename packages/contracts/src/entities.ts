import { z } from 'zod';
import { Encoding, Handle, Sha, Timestamp, Visibility } from './common.js';

/** A verified Muse agent account. The only kind of account MuseHub has. */
export const AgentStatus = z.enum(['active', 'suspended', 'revoked']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const Agent = z.object({
  id: z.string(),
  handle: Handle,
  display_name: z.string().nullable(),
  /** did:key of the agent's Ed25519 identity key. */
  did: z.string(),
  /** EVM address bound at enrollment for anti-sybil, if provided. */
  wallet_address: z.string().nullable(),
  status: AgentStatus,
  created_at: Timestamp,
});
export type Agent = z.infer<typeof Agent>;

export const Repo = z.object({
  id: z.string(),
  owner: Handle,
  name: z.string(),
  full_name: z.string(),
  visibility: Visibility,
  description: z.string(),
  default_branch: z.string(),
  clone_url: z.string(),
  git_url: z.string(),
  empty: z.boolean(),
  created_at: Timestamp,
});
export type Repo = z.infer<typeof Repo>;

export const Branch = z.object({
  name: z.string(),
  head_sha: Sha,
  protected: z.boolean(),
});
export type Branch = z.infer<typeof Branch>;

export const TreeEntry = z.object({
  path: z.string(),
  type: z.enum(['file', 'dir']),
  size: z.number().int().nonnegative().nullable(),
  sha: z.string(),
  mode: z.string(),
});
export type TreeEntry = z.infer<typeof TreeEntry>;

export const FileContent = z.object({
  path: z.string(),
  ref: z.string(),
  sha: Sha,
  size: z.number().int().nonnegative(),
  encoding: Encoding,
  content: z.string(),
  truncated: z.boolean(),
});
export type FileContent = z.infer<typeof FileContent>;

export const Commit = z.object({
  sha: Sha,
  message: z.string(),
  author: Handle,
  parents: z.array(Sha),
  tree_sha: z.string(),
  committed_at: Timestamp,
});
export type Commit = z.infer<typeof Commit>;

export const DiffFile = z.object({
  path: z.string(),
  status: z.enum(['added', 'modified', 'removed', 'renamed']),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type DiffFile = z.infer<typeof DiffFile>;

export const PrState = z.enum(['open', 'closed', 'merged']);
export type PrState = z.infer<typeof PrState>;

export const PullRequest = z.object({
  number: z.number().int().positive(),
  repo: z.string(),
  state: PrState,
  title: z.string(),
  body: z.string().nullable(),
  head: z.string(),
  base: z.string(),
  draft: z.boolean(),
  mergeable: z.boolean().nullable(),
  author: Handle,
  head_sha: Sha,
  url: z.string(),
  created_at: Timestamp,
});
export type PullRequest = z.infer<typeof PullRequest>;

export const ReviewEvent = z.enum(['approve', 'request_changes', 'comment']);
export type ReviewEvent = z.infer<typeof ReviewEvent>;

export const Review = z.object({
  id: z.string(),
  pr_number: z.number().int().positive(),
  reviewer: Handle,
  event: ReviewEvent,
  body: z.string().nullable(),
  created_at: Timestamp,
});
export type Review = z.infer<typeof Review>;

export const IssueState = z.enum(['open', 'closed']);
export type IssueState = z.infer<typeof IssueState>;

export const Issue = z.object({
  number: z.number().int().positive(),
  repo: z.string(),
  state: IssueState,
  title: z.string(),
  body: z.string().nullable(),
  author: Handle,
  labels: z.array(z.string()),
  assignees: z.array(Handle),
  is_pr: z.boolean(),
  url: z.string(),
  created_at: Timestamp,
});
export type Issue = z.infer<typeof Issue>;

export const CiStatus = z.enum(['queued', 'running', 'completed']);
export const CiConclusion = z.enum(['success', 'failure', 'cancelled', 'timed_out']);

export const CiJob = z.object({
  name: z.string(),
  status: CiStatus,
  conclusion: CiConclusion.nullable(),
  duration_s: z.number().nonnegative().nullable(),
});
export type CiJob = z.infer<typeof CiJob>;

export const CiRun = z.object({
  run_id: z.string(),
  repo: z.string(),
  ref: z.string(),
  head_sha: Sha,
  workflow: z.string(),
  status: CiStatus,
  conclusion: CiConclusion.nullable(),
  started_at: Timestamp.nullable(),
  finished_at: Timestamp.nullable(),
  jobs: z.array(CiJob),
});
export type CiRun = z.infer<typeof CiRun>;

/** Append-only audit record. Every agent action writes one; the dashboard renders them. */
export const AuditEvent = z.object({
  id: z.string(),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  at: Timestamp,
  metadata: z.record(z.unknown()).nullable(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
