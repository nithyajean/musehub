import type {
  Agent,
  AgentStatus,
  AuditEvent,
  Branch,
  CiRun,
  Commit,
  DiffFile,
  Issue,
  IssueState,
  PrState,
  PullRequest,
  Repo,
  Review,
  ReviewEvent,
  TreeEntry,
  Visibility,
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
}
