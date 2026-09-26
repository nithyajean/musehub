// Lightweight in-memory fakes for the @musehub/core ports, used only by the
// service tests. Not exported from the package entry, so they never ship. The git
// fake is functional enough to run the real onboard -> commit -> PR -> CI -> merge
// loop, so the tests prove the service decisions rather than the plumbing.

import { createHash } from 'node:crypto';
import type {
  Agent,
  AuditEvent,
  Branch,
  CiRun,
  Collaborator,
  Commit,
  DiffFile,
  Issue,
  IssueState,
  Membership,
  Notification,
  Org,
  OrgRole,
  PrState,
  PullRequest,
  RepoPermission,
  Review,
  Team,
  TeamMember,
  TreeEntry,
  Webhook,
  WebhookDelivery,
} from '@musehub/contracts';
import type {
  AgentStore,
  AttestationResult,
  AuditLog,
  CiRunStore,
  CiRunner,
  Clock,
  CollaboratorStore,
  GitBackend,
  IdGen,
  IdentityService,
  IssueStore,
  MuseAttestationVerifier,
  NewAgent,
  NewDelivery,
  NewOrg,
  NewRepo,
  NewTeam,
  NewWebhook,
  NotificationStore,
  OrgMemberStore,
  OrgStore,
  Page,
  Ports,
  PullRequestStore,
  RepoQuery,
  Repo_,
  ReviewStore,
  SessionStore,
  TeamMemberStore,
  TeamStore,
  WebhookDeliveryStore,
  WebhookSender,
  WebhookStore,
} from '@musehub/core';

const NOW = '2026-09-26T00:00:00.000Z';

function sha40(seed: string): string {
  return createHash('sha1').update(seed).digest('hex');
}

function encodeOffset(n: number): string {
  return Buffer.from(`p:${n}`).toString('base64url');
}

function decodeOffset(cursor?: string): number {
  if (!cursor) {
    return 0;
  }
  const match = /^p:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  return match ? Number(match[1]) : 0;
}

function paginate<T>(all: T[], cursor: string | undefined, limit: number): Page<T> {
  const offset = decodeOffset(cursor);
  const items = all.slice(offset, offset + limit);
  const hasMore = offset + limit < all.length;
  return { items, nextCursor: hasMore ? encodeOffset(offset + limit) : null, total: all.length };
}

export class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW);
  }
}

export class CounterIdGen implements IdGen {
  private n = 0;
  newId(prefix: string): string {
    this.n += 1;
    return `${prefix}_${this.n}`;
  }
}

export class FakeAgents implements AgentStore {
  private byId = new Map<string, Agent>();
  private seq = 0;

  async create(a: NewAgent): Promise<Agent> {
    this.seq += 1;
    const agent: Agent = {
      id: `agent_${this.seq}`,
      handle: a.handle,
      display_name: a.displayName,
      did: a.did,
      wallet_address: a.walletAddress,
      status: 'active',
      created_at: NOW,
    };
    this.byId.set(agent.id, agent);
    return agent;
  }
  async getById(id: string): Promise<Agent | null> {
    return this.byId.get(id) ?? null;
  }
  async getByDid(did: string): Promise<Agent | null> {
    for (const agent of this.byId.values()) {
      if (agent.did === did) {
        return agent;
      }
    }
    return null;
  }
  async getByHandle(handle: string): Promise<Agent | null> {
    for (const agent of this.byId.values()) {
      if (agent.handle === handle) {
        return agent;
      }
    }
    return null;
  }
  async setStatus(id: string, status: Agent['status']): Promise<void> {
    const agent = this.byId.get(id);
    if (agent) {
      this.byId.set(id, { ...agent, status });
    }
  }
  async handleTaken(handle: string): Promise<boolean> {
    return (await this.getByHandle(handle)) !== null;
  }
}

export class FakeRepos {
  private rows: Repo_[] = [];
  private seq = 0;

  async create(r: NewRepo): Promise<Repo_> {
    this.seq += 1;
    const repo: Repo_ = {
      id: `repo_${this.seq}`,
      owner: r.owner,
      name: r.name,
      visibility: r.visibility,
      description: r.description,
      default_branch: r.defaultBranch,
      empty: true,
      created_at: NOW,
    };
    this.rows.push(repo);
    return repo;
  }
  async get(owner: string, name: string): Promise<Repo_ | null> {
    return this.rows.find((r) => r.owner === owner && r.name === name) ?? null;
  }
  async list(q: RepoQuery): Promise<Page<Repo_>> {
    let filtered = this.rows;
    if (q.owner !== undefined) {
      filtered = filtered.filter((r) => r.owner === q.owner);
    }
    if (q.visibility === 'public') {
      filtered = filtered.filter((r) => r.visibility === 'public');
    } else if (q.visibility === 'private') {
      filtered = filtered.filter((r) => r.visibility === 'private');
    }
    return paginate(filtered, q.cursor, q.limit);
  }
  async delete(owner: string, name: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.owner === owner && r.name === name));
    return this.rows.length < before;
  }
  async setEmpty(owner: string, name: string, empty: boolean): Promise<void> {
    const repo = await this.get(owner, name);
    if (repo) {
      repo.empty = empty;
    }
  }
}

export class FakePulls implements PullRequestStore {
  private rows: PullRequest[] = [];
  private counters = new Map<string, number>();

  async create(input: {
    repo: string;
    author: string;
    title: string;
    body: string | null;
    head: string;
    base: string;
    draft: boolean;
    headSha: string;
  }): Promise<PullRequest> {
    const number = (this.counters.get(input.repo) ?? 0) + 1;
    this.counters.set(input.repo, number);
    const pr: PullRequest = {
      number,
      repo: input.repo,
      state: 'open',
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
      draft: input.draft,
      mergeable: null,
      author: input.author,
      head_sha: input.headSha,
      url: `https://forge.test/${input.repo}/pulls/${number}`,
      created_at: NOW,
    };
    this.rows.push(pr);
    return pr;
  }
  async get(repo: string, number: number): Promise<PullRequest | null> {
    return this.rows.find((p) => p.repo === repo && p.number === number) ?? null;
  }
  async list(q: {
    repo: string;
    state: PrState | 'all';
    base?: string;
    head?: string;
    cursor?: string;
    limit: number;
  }): Promise<Page<PullRequest>> {
    let filtered = this.rows.filter((p) => p.repo === q.repo);
    if (q.state !== 'all') {
      filtered = filtered.filter((p) => p.state === q.state);
    }
    if (q.base !== undefined) {
      filtered = filtered.filter((p) => p.base === q.base);
    }
    if (q.head !== undefined) {
      filtered = filtered.filter((p) => p.head === q.head);
    }
    return paginate(filtered, q.cursor, q.limit);
  }
  async findOpenByHeadBase(repo: string, head: string, base: string): Promise<PullRequest | null> {
    return (
      this.rows.find(
        (p) => p.repo === repo && p.head === head && p.base === base && p.state === 'open',
      ) ?? null
    );
  }
  async setState(repo: string, number: number, state: PrState): Promise<void> {
    const pr = await this.get(repo, number);
    if (pr) {
      pr.state = state;
    }
  }
  async setMergeable(repo: string, number: number, mergeable: boolean | null): Promise<void> {
    const pr = await this.get(repo, number);
    if (pr) {
      pr.mergeable = mergeable;
    }
  }
}

interface StoredComment {
  repo: string;
  prNumber: number;
  author: string;
  body: string;
  path?: string;
  line?: number;
}

export class FakeReviews implements ReviewStore {
  private reviews: Review[] = [];
  readonly comments: StoredComment[] = [];
  private seq = 0;

  async create(input: {
    repo: string;
    prNumber: number;
    reviewer: string;
    event: Review['event'];
    body: string | null;
  }): Promise<Review> {
    this.seq += 1;
    const review: Review = {
      id: `review_${this.seq}`,
      pr_number: input.prNumber,
      reviewer: input.reviewer,
      event: input.event,
      body: input.body,
      created_at: NOW,
    };
    this.reviews.push({ ...review });
    // Track the repo alongside for lookups (Review has no repo field).
    this.repoOf.set(review.id, input.repo);
    return review;
  }
  private repoOf = new Map<string, string>();

  private forPr(repo: string, prNumber: number): Review[] {
    return this.reviews.filter((r) => this.repoOf.get(r.id) === repo && r.pr_number === prNumber);
  }
  async latestByReviewer(repo: string, prNumber: number): Promise<Review[]> {
    const latest = new Map<string, Review>();
    for (const r of this.forPr(repo, prNumber)) {
      latest.set(r.reviewer, r);
    }
    return [...latest.values()];
  }
  async hasApproval(repo: string, prNumber: number): Promise<boolean> {
    const latest = await this.latestByReviewer(repo, prNumber);
    return latest.some((r) => r.event === 'approve');
  }
  async addComment(input: {
    repo: string;
    prNumber: number;
    author: string;
    body: string;
    path?: string;
    line?: number;
  }): Promise<void> {
    this.comments.push(input);
  }
}

export class FakeIssues implements IssueStore {
  private rows: Issue[] = [];
  private counters = new Map<string, number>();
  readonly comments: { repo: string; number: number; author: string; body: string }[] = [];

  async create(input: {
    repo: string;
    author: string;
    title: string;
    body: string | null;
    labels: string[];
    assignees: string[];
  }): Promise<Issue> {
    const number = (this.counters.get(input.repo) ?? 0) + 1;
    this.counters.set(input.repo, number);
    const issue: Issue = {
      number,
      repo: input.repo,
      state: 'open',
      title: input.title,
      body: input.body,
      author: input.author,
      labels: input.labels,
      assignees: input.assignees,
      is_pr: false,
      url: `https://forge.test/${input.repo}/issues/${number}`,
      created_at: NOW,
    };
    this.rows.push(issue);
    return issue;
  }
  async get(repo: string, number: number): Promise<Issue | null> {
    return this.rows.find((i) => i.repo === repo && i.number === number) ?? null;
  }
  async list(q: {
    repo: string;
    state: IssueState | 'all';
    labels?: string[];
    assignee?: string;
    cursor?: string;
    limit: number;
  }): Promise<Page<Issue>> {
    let filtered = this.rows.filter((i) => i.repo === q.repo);
    if (q.state !== 'all') {
      filtered = filtered.filter((i) => i.state === q.state);
    }
    if (q.labels && q.labels.length > 0) {
      filtered = filtered.filter((i) => q.labels?.every((l) => i.labels.includes(l)));
    }
    if (q.assignee !== undefined) {
      filtered = filtered.filter((i) => i.assignees.includes(q.assignee as string));
    }
    return paginate(filtered, q.cursor, q.limit);
  }
  async setState(repo: string, number: number, state: IssueState): Promise<void> {
    const issue = await this.get(repo, number);
    if (issue) {
      issue.state = state;
    }
  }
  async addComment(repo: string, number: number, author: string, body: string): Promise<void> {
    this.comments.push({ repo, number, author, body });
  }
}

export class FakeSessions implements SessionStore {
  private branches = new Map<string, string>();
  private key(agentId: string, repo: string): string {
    return `${agentId}::${repo}`;
  }
  async getWorkingBranch(agentId: string, repo: string): Promise<string | null> {
    return this.branches.get(this.key(agentId, repo)) ?? null;
  }
  async setWorkingBranch(agentId: string, repo: string, branch: string): Promise<void> {
    this.branches.set(this.key(agentId, repo), branch);
  }
}

export class FakeCi implements CiRunStore {
  private runs: CiRun[] = [];
  private logs = new Map<string, { job: string; line: string }[]>();
  private seq = 0;

  async create(input: {
    repo: string;
    ref: string;
    headSha: string;
    workflow: string;
  }): Promise<CiRun> {
    this.seq += 1;
    const run: CiRun = {
      run_id: `run_${this.seq}`,
      repo: input.repo,
      ref: input.ref,
      head_sha: input.headSha,
      workflow: input.workflow,
      status: 'queued',
      conclusion: null,
      started_at: null,
      finished_at: null,
      jobs: [],
    };
    this.runs.push(run);
    return run;
  }
  async get(repo: string, runId: string): Promise<CiRun | null> {
    return this.runs.find((r) => r.repo === repo && r.run_id === runId) ?? null;
  }
  async update(
    repo: string,
    runId: string,
    patch: Partial<Pick<CiRun, 'status' | 'conclusion' | 'started_at' | 'finished_at' | 'jobs'>>,
  ): Promise<void> {
    const run = await this.get(repo, runId);
    if (run) {
      Object.assign(run, patch);
    }
  }
  async findByHeadSha(repo: string, headSha: string): Promise<CiRun[]> {
    return this.runs.filter((r) => r.repo === repo && r.head_sha === headSha);
  }
  async appendLogs(runId: string, job: string, lines: string[]): Promise<void> {
    const existing = this.logs.get(runId) ?? [];
    for (const line of lines) {
      existing.push({ job, line });
    }
    this.logs.set(runId, existing);
  }
  async readLogs(runId: string, job: string | undefined, tail: number): Promise<string[]> {
    const all = (this.logs.get(runId) ?? [])
      .filter((entry) => job === undefined || entry.job === job)
      .map((entry) => entry.line);
    return all.slice(Math.max(0, all.length - tail));
  }
}

export class FakeAudit implements AuditLog {
  readonly events: AuditEvent[] = [];
  private seq = 0;

  async append(e: Omit<AuditEvent, 'id' | 'at'>): Promise<AuditEvent> {
    this.seq += 1;
    const event: AuditEvent = { id: `audit_${this.seq}`, at: NOW, ...e };
    this.events.push(event);
    return event;
  }
  async list(q: { actor?: string; cursor?: string; limit: number }): Promise<Page<AuditEvent>> {
    // Newest first, the order a dashboard reads.
    let ordered = [...this.events].reverse();
    if (q.actor !== undefined) {
      ordered = ordered.filter((e) => e.actor === q.actor);
    }
    return paginate(ordered, q.cursor, q.limit);
  }
}

interface RepoState {
  defaultBranch: string;
  branches: Map<string, string>;
  trees: Map<string, Map<string, string>>;
  parents: Map<string, string[]>;
}

function treesEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [path, content] of a) {
    if (b.get(path) !== content) {
      return false;
    }
  }
  return true;
}

function serializeTree(tree: Map<string, string>): string {
  return [...tree.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([path, content]) => `${path}:${content}`)
    .join('\n');
}

/** A functional in-memory git backend: real branches, trees and commit SHAs, so
 *  the onboard -> commit -> PR -> CI -> merge loop runs end to end in a test. */
export class FakeGit implements GitBackend {
  private repos = new Map<string, RepoState>();
  private conflicts = new Set<string>();
  private commitSeq = 0;

  private key(owner: string, name: string): string {
    return `${owner}/${name}`;
  }
  private state(owner: string, name: string): RepoState {
    const state = this.repos.get(this.key(owner, name));
    if (!state) {
      throw new Error(`repo ${owner}/${name} not initialised in FakeGit`);
    }
    return state;
  }
  private resolveRef(state: RepoState, ref: string): string | null {
    if (/^[0-9a-f]{40}$/.test(ref) && state.trees.has(ref)) {
      return ref;
    }
    return state.branches.get(ref) ?? null;
  }
  /** Force canMerge to report a conflict for a base/head pair. */
  setConflict(owner: string, name: string, base: string, head: string): void {
    this.conflicts.add(`${this.key(owner, name)}:${base}:${head}`);
  }
  /** Clear a forced conflict for a base/head pair. */
  clearConflict(owner: string, name: string, base: string, head: string): void {
    this.conflicts.delete(`${this.key(owner, name)}:${base}:${head}`);
  }

  async initRepo(owner: string, name: string, opts: { defaultBranch: string }): Promise<void> {
    this.repos.set(this.key(owner, name), {
      defaultBranch: opts.defaultBranch,
      branches: new Map(),
      trees: new Map(),
      parents: new Map(),
    });
  }
  async deleteRepo(owner: string, name: string): Promise<void> {
    this.repos.delete(this.key(owner, name));
  }
  async getBranchHead(owner: string, name: string, branch: string): Promise<string | null> {
    return this.state(owner, name).branches.get(branch) ?? null;
  }
  async createBranch(
    owner: string,
    name: string,
    branch: string,
    fromSha: string,
  ): Promise<string> {
    this.state(owner, name).branches.set(branch, fromSha);
    return fromSha;
  }
  async deleteBranch(owner: string, name: string, branch: string): Promise<void> {
    this.state(owner, name).branches.delete(branch);
  }
  async listBranches(owner: string, name: string): Promise<Branch[]> {
    const state = this.state(owner, name);
    return [...state.branches.entries()].map(([branchName, head]) => ({
      name: branchName,
      head_sha: head,
      protected: branchName === state.defaultBranch,
    }));
  }

  async createCommit(input: {
    owner: string;
    name: string;
    branch: string;
    message: string;
    author: string;
    changes: {
      path: string;
      op: 'write' | 'delete';
      content?: string;
      encoding: 'text' | 'base64';
    }[];
    expectedHead?: string;
    createBranchFrom?: string;
  }): Promise<{
    sha: string;
    parents: string[];
    treeSha: string;
    filesChanged: number;
    unchanged: boolean;
  } | null> {
    const state = this.state(input.owner, input.name);
    const branchExisted = state.branches.has(input.branch);
    const currentHead = state.branches.get(input.branch) ?? null;
    if (input.expectedHead !== undefined && input.expectedHead !== currentHead) {
      return null; // stale tip
    }
    let baseTree = new Map<string, string>();
    let parents: string[] = [];
    if (branchExisted && currentHead) {
      baseTree = new Map(state.trees.get(currentHead));
      parents = [currentHead];
    } else if (input.createBranchFrom) {
      const fromSha = this.resolveRef(state, input.createBranchFrom);
      if (fromSha) {
        baseTree = new Map(state.trees.get(fromSha));
        parents = [fromSha];
      }
    }
    const newTree = new Map(baseTree);
    for (const change of input.changes) {
      if (change.op === 'delete') {
        newTree.delete(change.path);
      } else {
        newTree.set(change.path, change.content ?? '');
      }
    }
    const treeSha = sha40(`tree:${serializeTree(newTree)}`);
    if (branchExisted && currentHead && treesEqual(baseTree, newTree)) {
      return { sha: currentHead, parents, treeSha, filesChanged: 0, unchanged: true };
    }
    this.commitSeq += 1;
    const sha = sha40(`commit:${this.commitSeq}:${treeSha}:${parents.join(',')}`);
    state.trees.set(sha, newTree);
    state.parents.set(sha, parents);
    state.branches.set(input.branch, sha);
    return { sha, parents, treeSha, filesChanged: input.changes.length, unchanged: false };
  }

  async readTree(
    owner: string,
    name: string,
    ref: string,
    path: string,
    recursive: boolean,
  ): Promise<{ sha: string; entries: TreeEntry[]; truncated: boolean }> {
    const state = this.state(owner, name);
    const sha = this.resolveRef(state, ref);
    if (!sha) {
      return { sha: '', entries: [], truncated: false };
    }
    const tree = state.trees.get(sha) ?? new Map<string, string>();
    const prefix = path === '' ? '' : path.endsWith('/') ? path : `${path}/`;
    const entries: TreeEntry[] = [];
    const dirs = new Set<string>();
    for (const [filePath, content] of tree) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }
      const rest = filePath.slice(prefix.length);
      if (recursive || !rest.includes('/')) {
        entries.push({
          path: filePath,
          type: 'file',
          size: Buffer.byteLength(content),
          sha: sha40(`blob:${content}`),
          mode: '100644',
        });
      } else {
        const dir = `${prefix}${rest.slice(0, rest.indexOf('/'))}`;
        dirs.add(dir);
      }
    }
    for (const dir of dirs) {
      entries.push({
        path: dir,
        type: 'dir',
        size: null,
        sha: sha40(`tree:${dir}`),
        mode: '040000',
      });
    }
    return { sha, entries, truncated: false };
  }

  async readFile(
    owner: string,
    name: string,
    ref: string,
    path: string,
    maxBytes: number,
  ): Promise<{ sha: string; size: number; content: string; truncated: boolean } | null> {
    const state = this.state(owner, name);
    const sha = this.resolveRef(state, ref);
    if (!sha) {
      return null;
    }
    const content = state.trees.get(sha)?.get(path);
    if (content === undefined) {
      return null;
    }
    const size = Buffer.byteLength(content);
    const truncated = size > maxBytes;
    return {
      sha: sha40(`blob:${content}`),
      size,
      content: truncated ? content.slice(0, maxBytes) : content,
      truncated,
    };
  }

  async diff(
    owner: string,
    name: string,
    base: string,
    head: string,
    format: 'patch' | 'summary',
    _maxBytes: number,
  ): Promise<{
    baseSha: string;
    headSha: string;
    files: DiffFile[];
    patch?: string;
    truncated: boolean;
  }> {
    const state = this.state(owner, name);
    const baseSha = this.resolveRef(state, base);
    const headSha = this.resolveRef(state, head);
    const baseTree = baseSha ? (state.trees.get(baseSha) ?? new Map()) : new Map<string, string>();
    const headTree = headSha ? (state.trees.get(headSha) ?? new Map()) : new Map<string, string>();
    const files: DiffFile[] = [];
    const paths = new Set<string>([...baseTree.keys(), ...headTree.keys()]);
    for (const path of paths) {
      const inBase = baseTree.has(path);
      const inHead = headTree.has(path);
      if (inHead && !inBase) {
        files.push({ path, status: 'added', additions: 1, deletions: 0 });
      } else if (!inHead && inBase) {
        files.push({ path, status: 'removed', additions: 0, deletions: 1 });
      } else if (baseTree.get(path) !== headTree.get(path)) {
        files.push({ path, status: 'modified', additions: 1, deletions: 1 });
      }
    }
    const result = {
      baseSha: baseSha ?? '',
      headSha: headSha ?? '',
      files,
      truncated: false,
    };
    return format === 'patch'
      ? { ...result, patch: files.map((f) => `--- ${f.path}\n+++ ${f.path}`).join('\n') }
      : result;
  }

  async getCommit(owner: string, name: string, sha: string): Promise<Commit | null> {
    const state = this.state(owner, name);
    if (!state.trees.has(sha)) {
      return null;
    }
    return {
      sha,
      message: '',
      author: 'unknown',
      parents: state.parents.get(sha) ?? [],
      tree_sha: sha40(`tree:${serializeTree(state.trees.get(sha) ?? new Map())}`),
      committed_at: NOW,
    };
  }

  async canMerge(owner: string, name: string, base: string, head: string): Promise<boolean> {
    return !this.conflicts.has(`${this.key(owner, name)}:${base}:${head}`);
  }

  async merge(input: {
    owner: string;
    name: string;
    base: string;
    head: string;
    method: 'merge' | 'squash' | 'rebase';
    message: string;
    author: string;
  }): Promise<{ mergeSha: string }> {
    const state = this.state(input.owner, input.name);
    const baseSha = this.resolveRef(state, input.base);
    const headSha = this.resolveRef(state, input.head);
    const merged = new Map(baseSha ? state.trees.get(baseSha) : undefined);
    if (headSha) {
      for (const [path, content] of state.trees.get(headSha) ?? new Map()) {
        merged.set(path, content);
      }
    }
    this.commitSeq += 1;
    const mergeSha = sha40(`merge:${this.commitSeq}:${input.base}:${input.head}`);
    state.trees.set(mergeSha, merged);
    state.parents.set(
      mergeSha,
      [baseSha, headSha].filter((s): s is string => s !== null),
    );
    state.branches.set(input.base, mergeSha);
    return { mergeSha };
  }
}

export class FakeIdentity implements IdentityService {
  private seq = 0;
  async issueChallenge(_did: string): Promise<{ nonce: string; expiresAt: string }> {
    return { nonce: 'nonce', expiresAt: '2026-09-27T00:00:00.000Z' };
  }
  async verifyChallenge(_did: string, _nonce: string, _sig: string): Promise<boolean> {
    return true;
  }
  async mintToken(agentId: string): Promise<{ token: string; tokenId: string; expiresAt: string }> {
    this.seq += 1;
    return {
      token: `token_${agentId}_${this.seq}`,
      tokenId: `tid_${this.seq}`,
      expiresAt: '2026-12-31T00:00:00.000Z',
    };
  }
  async verifyToken(_token: string): Promise<{ agentId: string; tokenId: string } | null> {
    return null;
  }
  async revokeToken(_tokenId: string): Promise<void> {}
}

export class FakeRunner implements CiRunner {
  shouldThrow = false;
  readonly started: { runId: string }[] = [];
  async start(input: {
    runId: string;
    owner: string;
    name: string;
    headSha: string;
    workflow: string;
  }): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('runner unavailable');
    }
    this.started.push({ runId: input.runId });
  }
}

/**
 * The test attestation verifier. An attestation is a JSON string
 * `{ "did": "...", "wallet": "0x..." }`. A did on the allowlist is admitted; any
 * other did, or a malformed string, is refused. This stands in for the real
 * MuseHub-owned ed25519 verifier so the tests exercise the gate decision, not the
 * signature maths (that is @musehub/identity's own suite).
 */
export class FakeVerifier implements MuseAttestationVerifier {
  constructor(private readonly allow: Set<string>) {}
  admit(did: string): void {
    this.allow.add(did);
  }
  async verify(attestation: string): Promise<AttestationResult> {
    let parsed: { did?: unknown; wallet?: unknown };
    try {
      parsed = JSON.parse(attestation);
    } catch {
      return { ok: false, reason: 'malformed_attestation' };
    }
    if (typeof parsed.did !== 'string') {
      return { ok: false, reason: 'malformed_attestation' };
    }
    if (!this.allow.has(parsed.did)) {
      return { ok: false, did: parsed.did, reason: 'did_not_allowlisted' };
    }
    return {
      ok: true,
      did: parsed.did,
      ...(typeof parsed.wallet === 'string' ? { walletAddress: parsed.wallet } : {}),
    };
  }
}

export class FakeOrgMembers implements OrgMemberStore {
  private rows: Membership[] = [];

  async upsert(org: string, agent: string, role: OrgRole): Promise<Membership> {
    const existing = this.rows.find((m) => m.org === org && m.agent === agent);
    if (existing) {
      existing.role = role;
      return { ...existing };
    }
    const membership: Membership = { org, agent, role, created_at: NOW };
    this.rows.push(membership);
    return { ...membership };
  }
  async remove(org: string, agent: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((m) => !(m.org === org && m.agent === agent));
    return this.rows.length < before;
  }
  async get(org: string, agent: string): Promise<Membership | null> {
    return this.rows.find((m) => m.org === org && m.agent === agent) ?? null;
  }
  async listByOrg(org: string, q: { cursor?: string; limit: number }): Promise<Page<Membership>> {
    const mine = this.rows
      .filter((m) => m.org === org)
      .sort((a, b) => (a.agent < b.agent ? -1 : a.agent > b.agent ? 1 : 0));
    return paginate(mine, q.cursor, q.limit);
  }
  orgHandlesForAgent(agent: string): string[] {
    return this.rows.filter((m) => m.agent === agent).map((m) => m.org);
  }
}

export class FakeOrgs implements OrgStore {
  private rows: Org[] = [];
  private seq = 0;
  constructor(private readonly members: FakeOrgMembers) {}

  async create(o: NewOrg): Promise<Org> {
    this.seq += 1;
    const org: Org = {
      id: `org_${this.seq}`,
      handle: o.handle,
      display_name: o.displayName,
      created_at: NOW,
    };
    this.rows.push(org);
    return org;
  }
  async getByHandle(handle: string): Promise<Org | null> {
    return this.rows.find((o) => o.handle === handle) ?? null;
  }
  async handleTaken(handle: string): Promise<boolean> {
    return this.rows.some((o) => o.handle === handle);
  }
  async listByMember(agent: string, q: { cursor?: string; limit: number }): Promise<Page<Org>> {
    const handles = new Set(this.members.orgHandlesForAgent(agent));
    const mine = this.rows.filter((o) => handles.has(o.handle));
    return paginate(mine, q.cursor, q.limit);
  }
}

export class FakeTeams implements TeamStore {
  private rows: Team[] = [];
  private seq = 0;

  async create(t: NewTeam): Promise<Team> {
    this.seq += 1;
    const team: Team = {
      id: `team_${this.seq}`,
      org: t.org,
      slug: t.slug,
      name: t.name,
      created_at: NOW,
    };
    this.rows.push(team);
    return team;
  }
  async get(org: string, slug: string): Promise<Team | null> {
    return this.rows.find((t) => t.org === org && t.slug === slug) ?? null;
  }
  async listByOrg(org: string, q: { cursor?: string; limit: number }): Promise<Page<Team>> {
    const mine = this.rows
      .filter((t) => t.org === org)
      .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    return paginate(mine, q.cursor, q.limit);
  }
}

export class FakeTeamMembers implements TeamMemberStore {
  private rows: TeamMember[] = [];

  async add(org: string, slug: string, agent: string): Promise<TeamMember> {
    const existing = this.rows.find((m) => m.org === org && m.team === slug && m.agent === agent);
    if (existing) {
      return { ...existing };
    }
    const member: TeamMember = { org, team: slug, agent, created_at: NOW };
    this.rows.push(member);
    return { ...member };
  }
  async remove(org: string, slug: string, agent: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((m) => !(m.org === org && m.team === slug && m.agent === agent));
    return this.rows.length < before;
  }
  async isMemberOfAnyTeam(org: string, agent: string): Promise<boolean> {
    return this.rows.some((m) => m.org === org && m.agent === agent);
  }
  async listByTeam(org: string, slug: string): Promise<TeamMember[]> {
    return this.rows.filter((m) => m.org === org && m.team === slug);
  }
}

export class FakeCollaborators implements CollaboratorStore {
  private rows: Collaborator[] = [];

  async upsert(repo: string, agent: string, permission: RepoPermission): Promise<Collaborator> {
    const existing = this.rows.find((c) => c.repo === repo && c.agent === agent);
    if (existing) {
      existing.permission = permission;
      return { ...existing };
    }
    const grant: Collaborator = { repo, agent, permission, created_at: NOW };
    this.rows.push(grant);
    return { ...grant };
  }
  async remove(repo: string, agent: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((c) => !(c.repo === repo && c.agent === agent));
    return this.rows.length < before;
  }
  async get(repo: string, agent: string): Promise<Collaborator | null> {
    return this.rows.find((c) => c.repo === repo && c.agent === agent) ?? null;
  }
  async listByRepo(
    repo: string,
    q: { cursor?: string; limit: number },
  ): Promise<Page<Collaborator>> {
    const mine = this.rows.filter((c) => c.repo === repo);
    return paginate(mine, q.cursor, q.limit);
  }
}

export class FakeWebhooks implements WebhookStore {
  private rows: Webhook[] = [];
  private seq = 0;

  async create(w: NewWebhook): Promise<Webhook> {
    this.seq += 1;
    const hook: Webhook = {
      id: `whk_${this.seq}`,
      repo: w.repo,
      url: w.url,
      events: [...w.events],
      active: w.active,
      secret: w.secret,
      created_at: NOW,
    };
    this.rows.push(hook);
    return { ...hook };
  }
  async get(repo: string, id: string): Promise<Webhook | null> {
    const hook = this.rows.find((h) => h.repo === repo && h.id === id);
    return hook ? { ...hook } : null;
  }
  async listByRepo(repo: string, q: { cursor?: string; limit: number }): Promise<Page<Webhook>> {
    const mine = this.rows.filter((h) => h.repo === repo).map((h) => ({ ...h }));
    return paginate(mine, q.cursor, q.limit);
  }
  async listActiveForEvent(repo: string, event: string): Promise<Webhook[]> {
    return this.rows
      .filter((h) => h.repo === repo && h.active)
      .filter((h) => h.events.includes('*') || h.events.includes(event))
      .map((h) => ({ ...h }));
  }
  async delete(repo: string, id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((h) => !(h.repo === repo && h.id === id));
    return this.rows.length < before;
  }
}

export class FakeWebhookDeliveries implements WebhookDeliveryStore {
  readonly rows: WebhookDelivery[] = [];
  private seq = 0;

  async record(d: NewDelivery): Promise<WebhookDelivery> {
    this.seq += 1;
    const delivery: WebhookDelivery = {
      id: `whd_${this.seq}`,
      webhook_id: d.webhookId,
      repo: d.repo,
      event: d.event,
      status: d.status,
      status_code: d.statusCode,
      error: d.error,
      created_at: NOW,
    };
    this.rows.push(delivery);
    return { ...delivery };
  }
  async listByWebhook(
    webhookId: string,
    q: { cursor?: string; limit: number },
  ): Promise<Page<WebhookDelivery>> {
    const mine = this.rows.filter((d) => d.webhook_id === webhookId).reverse();
    return paginate(mine, q.cursor, q.limit);
  }
}

export class FakeNotifications implements NotificationStore {
  readonly rows: Notification[] = [];
  private seq = 0;

  async create(input: { recipient: string; kind: string; subject: string }): Promise<Notification> {
    this.seq += 1;
    const notification: Notification = {
      id: `ntf_${this.seq}`,
      recipient: input.recipient,
      kind: input.kind,
      subject: input.subject,
      read: false,
      created_at: NOW,
    };
    this.rows.push(notification);
    return { ...notification };
  }
  async listByRecipient(
    recipient: string,
    q: { unread?: boolean; cursor?: string; limit: number },
  ): Promise<Page<Notification>> {
    let mine = this.rows.filter((n) => n.recipient === recipient);
    if (q.unread) {
      mine = mine.filter((n) => !n.read);
    }
    // Newest first, the order a reader wants.
    mine = [...mine].reverse();
    return paginate(mine, q.cursor, q.limit);
  }
  async markRead(recipient: string, ids: string[]): Promise<number> {
    let marked = 0;
    for (const n of this.rows) {
      if (n.recipient === recipient && !n.read && ids.includes(n.id)) {
        n.read = true;
        marked += 1;
      }
    }
    return marked;
  }
  async markAllRead(recipient: string): Promise<number> {
    let marked = 0;
    for (const n of this.rows) {
      if (n.recipient === recipient && !n.read) {
        n.read = true;
        marked += 1;
      }
    }
    return marked;
  }
}

/**
 * A webhook sender that records every send and never touches the network. The next
 * response is programmable so a test can prove both a delivered and a failed record,
 * and throwOnce simulates a transport error (a rejected fetch).
 */
export class FakeWebhookSender implements WebhookSender {
  readonly sent: { url: string; body: string; signature: string; event: string }[] = [];
  nextStatus = 200;
  throwNext = false;

  async send(input: {
    url: string;
    body: string;
    signature: string;
    event: string;
    deliveryId: string;
  }): Promise<{ statusCode: number }> {
    this.sent.push({
      url: input.url,
      body: input.body,
      signature: input.signature,
      event: input.event,
    });
    if (this.throwNext) {
      this.throwNext = false;
      throw new Error('connection refused');
    }
    return { statusCode: this.nextStatus };
  }
}

export interface Harness {
  ports: Ports;
  agents: FakeAgents;
  repos: FakeRepos;
  pulls: FakePulls;
  reviews: FakeReviews;
  issues: FakeIssues;
  ci: FakeCi;
  audit: FakeAudit;
  sessions: FakeSessions;
  git: FakeGit;
  identity: FakeIdentity;
  runner: FakeRunner;
  verifier: FakeVerifier;
  orgs: FakeOrgs;
  orgMembers: FakeOrgMembers;
  teams: FakeTeams;
  teamMembers: FakeTeamMembers;
  collaborators: FakeCollaborators;
  webhooks: FakeWebhooks;
  webhookDeliveries: FakeWebhookDeliveries;
  notifications: FakeNotifications;
  webhookSender: FakeWebhookSender;
  allow: Set<string>;
}

/** Assemble a fresh Ports bundle backed by the fakes, plus handles to each fake. */
export function buildHarness(): Harness {
  const allow = new Set<string>();
  const orgMembers = new FakeOrgMembers();
  const parts = {
    agents: new FakeAgents(),
    repos: new FakeRepos(),
    pulls: new FakePulls(),
    reviews: new FakeReviews(),
    issues: new FakeIssues(),
    ci: new FakeCi(),
    audit: new FakeAudit(),
    sessions: new FakeSessions(),
    git: new FakeGit(),
    identity: new FakeIdentity(),
    runner: new FakeRunner(),
    verifier: new FakeVerifier(allow),
    orgs: new FakeOrgs(orgMembers),
    orgMembers,
    teams: new FakeTeams(),
    teamMembers: new FakeTeamMembers(),
    collaborators: new FakeCollaborators(),
    webhooks: new FakeWebhooks(),
    webhookDeliveries: new FakeWebhookDeliveries(),
    notifications: new FakeNotifications(),
    webhookSender: new FakeWebhookSender(),
  };
  const ports: Ports = {
    clock: new FixedClock(),
    ids: new CounterIdGen(),
    agents: parts.agents,
    repos: parts.repos,
    pulls: parts.pulls,
    reviews: parts.reviews,
    issues: parts.issues,
    ci: parts.ci,
    audit: parts.audit,
    sessions: parts.sessions,
    git: parts.git,
    identity: parts.identity,
    attestation: parts.verifier,
    runner: parts.runner,
    orgs: parts.orgs,
    orgMembers: parts.orgMembers,
    teams: parts.teams,
    teamMembers: parts.teamMembers,
    collaborators: parts.collaborators,
    webhooks: parts.webhooks,
    webhookDeliveries: parts.webhookDeliveries,
    notifications: parts.notifications,
    webhookSender: parts.webhookSender,
    config: { gitBaseUrl: 'https://git.test', apiBaseUrl: 'https://api.test/v1' },
  };
  return { ports, allow, ...parts };
}
