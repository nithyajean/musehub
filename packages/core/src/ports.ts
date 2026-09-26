import type {
  Agent,
  AgentStatus,
  AuditEvent,
  Branch,
  CiRun,
  Collaborator,
  Commit,
  DiffFile,
  EventType,
  Issue,
  IssueState,
  Membership,
  Notification,
  Org,
  OrgRole,
  PrState,
  PullRequest,
  Release,
  Repo,
  RepoPermission,
  Review,
  ReviewEvent,
  Team,
  TeamMember,
  TreeEntry,
  Visibility,
  Webhook,
  WebhookDelivery,
  WebhookDeliveryStatus,
} from '@musehub/contracts';

/**
 * Ports: the interfaces adapters implement. `core` and the transport layers
 * depend only on these, never on a concrete database, git binary or container
 * runtime. This is what lets each Wave-1 package be built and unit-tested in
 * isolation against fakes.
 */

/** Injected clock so time is deterministic in tests. */
export interface Clock {
  now(): Date;
}

/** Injected id generator (agents, repos, reviews, audit events, tokens). */
export interface IdGen {
  newId(prefix: string): string;
}

// --- Persistence ----------------------------------------------------------

export interface NewAgent {
  handle: string;
  displayName: string | null;
  did: string;
  walletAddress: string | null;
}

export interface AgentStore {
  create(a: NewAgent): Promise<Agent>;
  getById(id: string): Promise<Agent | null>;
  getByDid(did: string): Promise<Agent | null>;
  getByHandle(handle: string): Promise<Agent | null>;
  setStatus(id: string, status: AgentStatus): Promise<void>;
  handleTaken(handle: string): Promise<boolean>;
}

export interface NewRepo {
  owner: string;
  name: string;
  visibility: Visibility;
  description: string;
  defaultBranch: string;
}

export interface RepoQuery {
  owner?: string;
  visibility?: 'all' | 'public' | 'private';
  cursor?: string;
  limit: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export interface RepoStore {
  create(r: NewRepo): Promise<Repo_>;
  get(owner: string, name: string): Promise<Repo_ | null>;
  list(q: RepoQuery): Promise<Page<Repo_>>;
  delete(owner: string, name: string): Promise<boolean>;
  setEmpty(owner: string, name: string, empty: boolean): Promise<void>;
}

/** Repo row as stored (git-derived fields like clone_url are computed in the service). */
export type Repo_ = Omit<Repo, 'clone_url' | 'git_url' | 'full_name'>;

export interface PullRequestStore {
  create(input: {
    repo: string;
    author: string;
    title: string;
    body: string | null;
    head: string;
    base: string;
    draft: boolean;
    headSha: string;
  }): Promise<PullRequest>;
  get(repo: string, number: number): Promise<PullRequest | null>;
  list(q: {
    repo: string;
    state: PrState | 'all';
    base?: string;
    head?: string;
    cursor?: string;
    limit: number;
  }): Promise<Page<PullRequest>>;
  findOpenByHeadBase(repo: string, head: string, base: string): Promise<PullRequest | null>;
  setState(repo: string, number: number, state: PrState): Promise<void>;
  setMergeable(repo: string, number: number, mergeable: boolean | null): Promise<void>;
}

export interface ReviewStore {
  create(input: {
    repo: string;
    prNumber: number;
    reviewer: string;
    event: ReviewEvent;
    body: string | null;
  }): Promise<Review>;
  latestByReviewer(repo: string, prNumber: number): Promise<Review[]>;
  hasApproval(repo: string, prNumber: number): Promise<boolean>;
  addComment(input: {
    repo: string;
    prNumber: number;
    author: string;
    body: string;
    path?: string;
    line?: number;
  }): Promise<void>;
}

export interface IssueStore {
  create(input: {
    repo: string;
    author: string;
    title: string;
    body: string | null;
    labels: string[];
    assignees: string[];
  }): Promise<Issue>;
  get(repo: string, number: number): Promise<Issue | null>;
  list(q: {
    repo: string;
    state: IssueState | 'all';
    labels?: string[];
    assignee?: string;
    cursor?: string;
    limit: number;
  }): Promise<Page<Issue>>;
  setState(repo: string, number: number, state: IssueState): Promise<void>;
  addComment(repo: string, number: number, author: string, body: string): Promise<void>;
}

export interface CiRunStore {
  create(input: { repo: string; ref: string; headSha: string; workflow: string }): Promise<CiRun>;
  get(repo: string, runId: string): Promise<CiRun | null>;
  update(
    repo: string,
    runId: string,
    patch: Partial<Pick<CiRun, 'status' | 'conclusion' | 'started_at' | 'finished_at' | 'jobs'>>,
  ): Promise<void>;
  findByHeadSha(repo: string, headSha: string): Promise<CiRun[]>;
  appendLogs(runId: string, job: string, lines: string[]): Promise<void>;
  readLogs(runId: string, job: string | undefined, tail: number): Promise<string[]>;
}

export interface AuditLog {
  append(e: Omit<AuditEvent, 'id' | 'at'>): Promise<AuditEvent>;
  list(q: { actor?: string; cursor?: string; limit: number }): Promise<Page<AuditEvent>>;
}

/** Per-agent, per-repo working branch (the branch commit calls default to). */
export interface SessionStore {
  getWorkingBranch(agentId: string, repo: string): Promise<string | null>;
  setWorkingBranch(agentId: string, repo: string, branch: string): Promise<void>;
}

// --- Collaboration: orgs, teams, memberships, collaborators ---------------

export interface NewOrg {
  handle: string;
  displayName: string | null;
}

export interface OrgStore {
  create(o: NewOrg): Promise<Org>;
  getByHandle(handle: string): Promise<Org | null>;
  handleTaken(handle: string): Promise<boolean>;
  /** Orgs an agent is a member of, newest first. */
  listByMember(agent: string, q: { cursor?: string; limit: number }): Promise<Page<Org>>;
}

export interface OrgMemberStore {
  /** Add a member or update an existing member's role. Idempotent per (org, agent). */
  upsert(org: string, agent: string, role: OrgRole): Promise<Membership>;
  remove(org: string, agent: string): Promise<boolean>;
  get(org: string, agent: string): Promise<Membership | null>;
  listByOrg(org: string, q: { cursor?: string; limit: number }): Promise<Page<Membership>>;
}

export interface NewTeam {
  org: string;
  slug: string;
  name: string;
}

export interface TeamStore {
  create(t: NewTeam): Promise<Team>;
  get(org: string, slug: string): Promise<Team | null>;
  listByOrg(org: string, q: { cursor?: string; limit: number }): Promise<Page<Team>>;
}

export interface TeamMemberStore {
  /** Add an agent to a team. Idempotent per (org, slug, agent). */
  add(org: string, slug: string, agent: string): Promise<TeamMember>;
  remove(org: string, slug: string, agent: string): Promise<boolean>;
  /** True when the agent is on any team in the org (the team-grant check). */
  isMemberOfAnyTeam(org: string, agent: string): Promise<boolean>;
  listByTeam(org: string, slug: string): Promise<TeamMember[]>;
}

export interface CollaboratorStore {
  /** Grant or update a collaborator's permission. Idempotent per (repo, agent). */
  upsert(repo: string, agent: string, permission: RepoPermission): Promise<Collaborator>;
  remove(repo: string, agent: string): Promise<boolean>;
  get(repo: string, agent: string): Promise<Collaborator | null>;
  listByRepo(repo: string, q: { cursor?: string; limit: number }): Promise<Page<Collaborator>>;
}

// --- Releases -------------------------------------------------------------

export interface NewRelease {
  repo: string;
  tag: string;
  name: string;
  body: string | null;
  targetSha: string;
  prerelease: boolean;
  draft: boolean;
  author: string;
}

export interface ReleaseStore {
  /** Store a release. (repo, tag) is unique, so a duplicate tag is rejected upstream. */
  create(r: NewRelease): Promise<Release>;
  get(repo: string, tag: string): Promise<Release | null>;
  /** Releases in a repo, newest first. */
  list(repo: string, q: { cursor?: string; limit: number }): Promise<Page<Release>>;
  delete(repo: string, tag: string): Promise<boolean>;
}

// --- Events layer: webhooks, deliveries, notifications --------------------

/**
 * The internal event a mutation emits. It is not a wire type: the service builds
 * one after a mutation and hands it to the event fan-out, which POSTs it to
 * matching webhooks and creates notifications from it. The payload carries the
 * fields the fan-out needs (a pull request author, an issue's assignees, and so
 * on) so recipient resolution needs no extra reads.
 */
export interface ForgeEvent {
  type: EventType;
  /** The repo the event happened on, as owner/name. */
  repo: string;
  /** The handle that caused the event. */
  actor: string;
  /** A human ref for the subject, for example owner/name#3 or owner/name@branch. */
  target: string;
  payload: Record<string, unknown>;
}

export interface NewWebhook {
  repo: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
}

export interface WebhookStore {
  create(w: NewWebhook): Promise<Webhook>;
  get(repo: string, id: string): Promise<Webhook | null>;
  listByRepo(repo: string, q: { cursor?: string; limit: number }): Promise<Page<Webhook>>;
  /** Active webhooks on a repo whose event list matches the event name or carries '*'. */
  listActiveForEvent(repo: string, event: string): Promise<Webhook[]>;
  delete(repo: string, id: string): Promise<boolean>;
}

export interface NewDelivery {
  webhookId: string;
  repo: string;
  event: string;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  error: string | null;
}

export interface WebhookDeliveryStore {
  record(d: NewDelivery): Promise<WebhookDelivery>;
  listByWebhook(
    webhookId: string,
    q: { cursor?: string; limit: number },
  ): Promise<Page<WebhookDelivery>>;
}

export interface NotificationStore {
  create(input: { recipient: string; kind: string; subject: string }): Promise<Notification>;
  listByRecipient(
    recipient: string,
    q: { unread?: boolean; cursor?: string; limit: number },
  ): Promise<Page<Notification>>;
  /** Mark the named notifications read for this recipient. Returns how many changed. */
  markRead(recipient: string, ids: string[]): Promise<number>;
  /** Mark every notification of this recipient read. Returns how many changed. */
  markAllRead(recipient: string): Promise<number>;
}

/**
 * The injected webhook sender: a thin wrapper over fetch so a unit test can supply
 * a fake and no network happens in tests. It resolves with the HTTP status code, or
 * rejects for a transport failure (which the caller records as a failed delivery).
 */
export interface WebhookSender {
  send(input: {
    url: string;
    body: string;
    signature: string;
    event: string;
    deliveryId: string;
  }): Promise<{ statusCode: number }>;
}

// --- Git backend ----------------------------------------------------------

export interface CommitChange {
  path: string;
  op: 'write' | 'delete';
  content?: string;
  encoding: 'text' | 'base64';
}

export interface GitBackend {
  initRepo(owner: string, name: string, opts: { defaultBranch: string }): Promise<void>;
  deleteRepo(owner: string, name: string): Promise<void>;
  readTree(
    owner: string,
    name: string,
    ref: string,
    path: string,
    recursive: boolean,
  ): Promise<{ sha: string; entries: TreeEntry[]; truncated: boolean }>;
  readFile(
    owner: string,
    name: string,
    ref: string,
    path: string,
    maxBytes: number,
  ): Promise<{ sha: string; size: number; content: string; truncated: boolean } | null>;
  listBranches(owner: string, name: string): Promise<Branch[]>;
  getBranchHead(owner: string, name: string, branch: string): Promise<string | null>;
  createBranch(owner: string, name: string, branch: string, fromSha: string): Promise<string>;
  deleteBranch(owner: string, name: string, branch: string): Promise<void>;
  createCommit(input: {
    owner: string;
    name: string;
    branch: string;
    message: string;
    author: string;
    changes: CommitChange[];
    expectedHead?: string;
    createBranchFrom?: string;
  }): Promise<{
    sha: string;
    parents: string[];
    treeSha: string;
    filesChanged: number;
    unchanged: boolean;
  } | null>;
  diff(
    owner: string,
    name: string,
    base: string,
    head: string,
    format: 'patch' | 'summary',
    maxBytes: number,
  ): Promise<{
    baseSha: string;
    headSha: string;
    files: DiffFile[];
    patch?: string;
    truncated: boolean;
  }>;
  getCommit(owner: string, name: string, sha: string): Promise<Commit | null>;
  /** Test whether head merges cleanly into base (no conflict). */
  canMerge(owner: string, name: string, base: string, head: string): Promise<boolean>;
  merge(input: {
    owner: string;
    name: string;
    base: string;
    head: string;
    method: 'merge' | 'squash' | 'rebase';
    message: string;
    author: string;
  }): Promise<{ mergeSha: string }>;
  /**
   * Create a tag under refs/tags pointing at the commit `sha` resolves to. A
   * `message` makes it an annotated tag, otherwise a lightweight one. Returns the
   * tag name and the canonical commit sha it resolves to. Rejects a tag that
   * already exists.
   */
  createTag(
    owner: string,
    name: string,
    tag: string,
    sha: string,
    message?: string,
  ): Promise<{ name: string; sha: string }>;
  /** Every tag in the repo with the commit sha it resolves to (annotated tags peeled). */
  listTags(owner: string, name: string): Promise<{ name: string; sha: string }[]>;
  /** The commit sha a tag resolves to, or null when the tag does not exist. */
  getTagSha(owner: string, name: string, tag: string): Promise<string | null>;
  /** Remove a tag. A missing tag is a no-op. */
  deleteTag(owner: string, name: string, tag: string): Promise<void>;
}

// --- Identity gate --------------------------------------------------------

export interface AttestationResult {
  ok: boolean;
  did?: string;
  walletAddress?: string;
  reason?: string;
}

/** Pluggable proof that a caller is a verified Muse agent. Default is MuseHub-owned. */
export interface MuseAttestationVerifier {
  verify(attestation: string): Promise<AttestationResult>;
}

export interface TokenClaims {
  agentId: string;
  tokenId: string;
}

export interface IdentityService {
  issueChallenge(did: string): Promise<{ nonce: string; expiresAt: string }>;
  verifyChallenge(did: string, nonce: string, signatureB64: string): Promise<boolean>;
  mintToken(agentId: string): Promise<{ token: string; tokenId: string; expiresAt: string }>;
  verifyToken(token: string): Promise<TokenClaims | null>;
  revokeToken(tokenId: string): Promise<void>;
}

// --- CI runner ------------------------------------------------------------

export interface CiRunner {
  start(input: {
    runId: string;
    owner: string;
    name: string;
    headSha: string;
    workflow: string;
  }): Promise<void>;
}

/** Everything the ForgeService needs, injected at composition. */
export interface Ports {
  clock: Clock;
  ids: IdGen;
  agents: AgentStore;
  repos: RepoStore;
  pulls: PullRequestStore;
  reviews: ReviewStore;
  issues: IssueStore;
  ci: CiRunStore;
  audit: AuditLog;
  sessions: SessionStore;
  git: GitBackend;
  identity: IdentityService;
  attestation: MuseAttestationVerifier;
  runner: CiRunner;
  config: { gitBaseUrl: string; apiBaseUrl: string };
  // Collaboration stores are optional so a composition that predates multi-agent
  // collaboration keeps working: when they are absent authz falls back to the
  // owner-only path and the org/team/collaborator methods report internal_error.
  orgs?: OrgStore;
  orgMembers?: OrgMemberStore;
  teams?: TeamStore;
  teamMembers?: TeamMemberStore;
  collaborators?: CollaboratorStore;
  // Releases are optional the same way: a composition that predates releases keeps
  // working (the release tools report releases_unavailable). Tag support lives on the
  // always-present git backend, so the store is the only thing this gates.
  releases?: ReleaseStore;
  // Events layer stores are optional the same way: a composition that predates the
  // events layer keeps working (no events fire, and the webhook/notification tools
  // report events_unavailable). The activity feed reads the always-present audit log,
  // so it works with or without these.
  webhooks?: WebhookStore;
  webhookDeliveries?: WebhookDeliveryStore;
  notifications?: NotificationStore;
  /** Delivers a signed webhook body. Defaults to a fetch-based sender when omitted. */
  webhookSender?: WebhookSender;
}
