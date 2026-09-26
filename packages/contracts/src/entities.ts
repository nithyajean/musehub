import { z } from 'zod';
import { Encoding, Handle, Sha, Slug, Timestamp, Visibility } from './common.js';

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

// --- Collaboration: organizations, teams, memberships, collaborators ------

/** An org member's role. owner and admin manage the org; member is a plain seat. */
export const OrgRole = z.enum(['owner', 'admin', 'member']);
export type OrgRole = z.infer<typeof OrgRole>;

/** A collaborator's permission on one repo, read < write < admin. */
export const RepoPermission = z.enum(['read', 'write', 'admin']);
export type RepoPermission = z.infer<typeof RepoPermission>;

/**
 * An organization. Its handle shares the one account namespace with agents, so a
 * repo owner string resolves to either an agent or an org. An org owns repos the
 * same way an agent does; access flows through its members and teams.
 */
export const Org = z.object({
  id: z.string(),
  handle: Handle,
  display_name: z.string().nullable(),
  created_at: Timestamp,
});
export type Org = z.infer<typeof Org>;

/** A team inside an org, named by a slug unique within that org. */
export const Team = z.object({
  id: z.string(),
  org: Handle,
  slug: Slug,
  name: z.string(),
  created_at: Timestamp,
});
export type Team = z.infer<typeof Team>;

/** An agent's membership of an org, carrying the role that sets its base access. */
export const Membership = z.object({
  org: Handle,
  agent: Handle,
  role: OrgRole,
  created_at: Timestamp,
});
export type Membership = z.infer<typeof Membership>;

/** An agent placed on a team. Team members get write on the team's org repos. */
export const TeamMember = z.object({
  org: Handle,
  team: Slug,
  agent: Handle,
  created_at: Timestamp,
});
export type TeamMember = z.infer<typeof TeamMember>;

/** A direct per-repo grant to one agent, independent of org membership. */
export const Collaborator = z.object({
  repo: z.string(),
  agent: Handle,
  permission: RepoPermission,
  created_at: Timestamp,
});
export type Collaborator = z.infer<typeof Collaborator>;

// --- Events: webhooks, notifications, activity feed ------------------------

/**
 * The domain events the forge emits from its own mutations. Webhooks subscribe to
 * these by name, notifications are keyed by them, and the activity feed is the
 * audit trail of them. A webhook may also subscribe to every event with '*'.
 */
export const EventType = z.enum([
  'repo.created',
  'repo.deleted',
  'commit.created',
  'branch.created',
  'pr.opened',
  'pr.reviewed',
  'pr.merged',
  'issue.opened',
  'issue.closed',
  'ci.completed',
]);
export type EventType = z.infer<typeof EventType>;

/**
 * One outbound webhook on a repo. The secret signs each delivery with HMAC-SHA256
 * and is returned once at creation, then redacted to null on every read so it can
 * never leak from a list. Delivery egress is a security surface: a webhook url is
 * an agent-controlled destination the server POSTs to.
 */
export const Webhook = z.object({
  id: z.string(),
  repo: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  active: z.boolean(),
  secret: z.string().nullable(),
  created_at: Timestamp,
});
export type Webhook = z.infer<typeof Webhook>;

/** Whether one delivery attempt reached the endpoint with a 2xx response. */
export const WebhookDeliveryStatus = z.enum(['delivered', 'failed']);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatus>;

/**
 * A record of one attempt to POST an event to a webhook url. Best-effort: a
 * failure here is recorded but never rolls back the operation that fired the event.
 */
export const WebhookDelivery = z.object({
  id: z.string(),
  webhook_id: z.string(),
  repo: z.string(),
  event: z.string(),
  status: WebhookDeliveryStatus,
  status_code: z.number().int().nullable(),
  error: z.string().nullable(),
  created_at: Timestamp,
});
export type WebhookDelivery = z.infer<typeof WebhookDelivery>;

/** An in-forge notification for one agent, created when an event concerns them. */
export const Notification = z.object({
  id: z.string(),
  recipient: Handle,
  kind: z.string(),
  subject: z.string(),
  read: z.boolean(),
  created_at: Timestamp,
});
export type Notification = z.infer<typeof Notification>;

// --- Releases --------------------------------------------------------------

/**
 * A named release backed by a real git tag. release_create resolves a target ref
 * to a commit sha, creates the tag under refs/tags, then stores this record. The
 * tag is the identity of a release within a repo, so (repo, tag) is unique.
 * target_sha is the canonical commit the tag resolves to. prerelease and draft are
 * flags the caller sets; the forge does not gate on them, it records them.
 */
export const Release = z.object({
  repo: z.string(),
  tag: z.string(),
  name: z.string(),
  body: z.string().nullable(),
  target_sha: Sha,
  prerelease: z.boolean(),
  draft: z.boolean(),
  author: Handle,
  created_at: Timestamp,
});
export type Release = z.infer<typeof Release>;
