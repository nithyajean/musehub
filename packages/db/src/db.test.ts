import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Db,
  FixedClock,
  PrefixedIdGen,
  type Stores,
  createDb,
  createStores,
  decodeCursor,
  encodeCursor,
  isSqliteUrl,
  migrate,
  migrationStatements,
} from './index.js';

let db: Db;
let stores: Stores;
let clock: FixedClock;

beforeEach(async () => {
  db = createDb(':memory:');
  clock = new FixedClock('2026-01-01T00:00:00.000Z');
  await migrate(db);
  stores = createStores(db, { clock, ids: new PrefixedIdGen() });
});

afterEach(async () => {
  await db.close();
});

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

// PLACEHOLDER_APPEND

describe('dialect detection and helpers', () => {
  it('routes urls to the right driver', () => {
    expect(isSqliteUrl(':memory:')).toBe(true);
    expect(isSqliteUrl('sqlite::memory:')).toBe(true);
    expect(isSqliteUrl('./forge.db')).toBe(true);
    expect(isSqliteUrl('file:/tmp/forge.db')).toBe(true);
    expect(isSqliteUrl('postgres://u@localhost/db')).toBe(false);
    expect(isSqliteUrl('postgresql://u@localhost/db')).toBe(false);
  });

  it('emits create statements for every table', () => {
    const statements = migrationStatements('sqlite');
    expect(statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS agents'))).toBe(true);
    expect(statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS pull_requests'))).toBe(
      true,
    );
    expect(statements.length).toBeGreaterThan(12);
  });

  it('round-trips opaque cursors and rejects junk', () => {
    expect(decodeCursor<{ n: number }>(encodeCursor({ n: 7 }))).toEqual({ n: 7 });
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('this-is-not-json')).toBeNull();
  });

  it('mints prefixed ids that do not repeat', () => {
    const ids = new PrefixedIdGen();
    const a = ids.newId('agent');
    const b = ids.newId('agent');
    expect(a).toMatch(/^agent_[0-9a-f]{24}$/);
    expect(a).not.toBe(b);
  });
});

describe('AgentStore', () => {
  it('creates, reads by every key, and sets status', async () => {
    const agent = await stores.agents.create({
      handle: 'muse-01',
      displayName: 'Muse One',
      did: 'did:key:z1',
      walletAddress: '0xabc',
    });
    expect(agent.id).toMatch(/^agent_/);
    expect(agent.status).toBe('active');
    expect(agent.created_at).toBe('2026-01-01T00:00:00.000Z');

    expect(await stores.agents.getById(agent.id)).toEqual(agent);
    expect(await stores.agents.getByDid('did:key:z1')).toEqual(agent);
    expect(await stores.agents.getByHandle('muse-01')).toEqual(agent);
    expect(await stores.agents.handleTaken('muse-01')).toBe(true);
    expect(await stores.agents.handleTaken('ghost')).toBe(false);

    await stores.agents.setStatus(agent.id, 'suspended');
    expect((await stores.agents.getById(agent.id))?.status).toBe('suspended');
  });

  it('stores a null display name and wallet', async () => {
    const agent = await stores.agents.create({
      handle: 'muse-02',
      displayName: null,
      did: 'did:key:z2',
      walletAddress: null,
    });
    expect(agent.display_name).toBeNull();
    expect(agent.wallet_address).toBeNull();
    expect((await stores.agents.getById(agent.id))?.display_name).toBeNull();
  });
});

describe('RepoStore', () => {
  it('creates empty, reads back, and toggles empty', async () => {
    const repo = await stores.repos.create({
      owner: 'muse-01',
      name: 'forge',
      visibility: 'private',
      description: 'the forge',
      defaultBranch: 'main',
    });
    expect(repo.empty).toBe(true);
    expect(await stores.repos.get('muse-01', 'forge')).toEqual(repo);

    await stores.repos.setEmpty('muse-01', 'forge', false);
    expect((await stores.repos.get('muse-01', 'forge'))?.empty).toBe(false);
  });

  it('paginates with an opaque cursor and reports a total', async () => {
    clock.set('2026-02-01T00:00:00.000Z');
    for (const name of ['one', 'two', 'three']) {
      await stores.repos.create({
        owner: 'muse-01',
        name,
        visibility: 'private',
        description: '',
        defaultBranch: 'main',
      });
      clock.advance(1000);
    }
    const page1 = await stores.repos.list({ visibility: 'all', limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await stores.repos.list({
      visibility: 'all',
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    const seen = new Set([...page1.items, ...page2.items].map((r) => r.id));
    expect(seen.size).toBe(3);
  });

  it('filters by owner and visibility, and deletes', async () => {
    await stores.repos.create({
      owner: 'muse-01',
      name: 'pub',
      visibility: 'public',
      description: '',
      defaultBranch: 'main',
    });
    await stores.repos.create({
      owner: 'muse-01',
      name: 'priv',
      visibility: 'private',
      description: '',
      defaultBranch: 'main',
    });
    await stores.repos.create({
      owner: 'muse-02',
      name: 'other',
      visibility: 'public',
      description: '',
      defaultBranch: 'main',
    });

    const pub = await stores.repos.list({ visibility: 'public', limit: 50 });
    expect(pub.items.every((r) => r.visibility === 'public')).toBe(true);
    expect(pub.total).toBe(2);

    const mine = await stores.repos.list({ owner: 'muse-01', visibility: 'all', limit: 50 });
    expect(mine.total).toBe(2);
    expect(mine.items.every((r) => r.owner === 'muse-01')).toBe(true);

    expect(await stores.repos.delete('muse-01', 'pub')).toBe(true);
    expect(await stores.repos.delete('muse-01', 'pub')).toBe(false);
    expect(await stores.repos.get('muse-01', 'pub')).toBeNull();
  });
});

describe('per-repo sequential numbering', () => {
  it('shares one sequence between PRs and issues within a repo', async () => {
    const repo = 'muse-01/forge';
    const pr1 = await stores.pulls.create({
      repo,
      author: 'muse-01',
      title: 'first pr',
      body: null,
      head: 'feat-1',
      base: 'main',
      draft: false,
      headSha: SHA_A,
    });
    const issue1 = await stores.issues.create({
      repo,
      author: 'muse-01',
      title: 'first issue',
      body: null,
      labels: [],
      assignees: [],
    });
    const pr2 = await stores.pulls.create({
      repo,
      author: 'muse-01',
      title: 'second pr',
      body: null,
      head: 'feat-2',
      base: 'main',
      draft: false,
      headSha: SHA_B,
    });
    expect([pr1.number, issue1.number, pr2.number]).toEqual([1, 2, 3]);

    const other = await stores.pulls.create({
      repo: 'muse-01/other',
      author: 'muse-01',
      title: 'fresh repo',
      body: null,
      head: 'x',
      base: 'main',
      draft: false,
      headSha: SHA_A,
    });
    expect(other.number).toBe(1);
  });
});

describe('PullRequestStore', () => {
  const repo = 'muse-01/forge';
  async function openPr(head: string, headSha = SHA_A) {
    return stores.pulls.create({
      repo,
      author: 'muse-01',
      title: `pr ${head}`,
      body: 'body',
      head,
      base: 'main',
      draft: false,
      headSha,
    });
  }

  it('creates, reads, filters by state, and transitions', async () => {
    const pr1 = await openPr('feat-1', SHA_A);
    const pr2 = await openPr('feat-2', SHA_B);
    expect(pr1.state).toBe('open');
    expect(pr1.mergeable).toBeNull();
    expect(pr1.url).toBe(`/${repo}/pull/${pr1.number}`);
    expect(await stores.pulls.get(repo, pr1.number)).toEqual(pr1);

    await stores.pulls.setMergeable(repo, pr1.number, true);
    expect((await stores.pulls.get(repo, pr1.number))?.mergeable).toBe(true);
    await stores.pulls.setMergeable(repo, pr1.number, null);
    expect((await stores.pulls.get(repo, pr1.number))?.mergeable).toBeNull();

    await stores.pulls.setState(repo, pr1.number, 'closed');
    const open = await stores.pulls.list({ repo, state: 'open', limit: 50 });
    expect(open.items.map((p) => p.number)).toEqual([pr2.number]);
    expect(open.total).toBe(1);

    const all = await stores.pulls.list({ repo, state: 'all', limit: 50 });
    expect(all.total).toBe(2);
  });

  it('finds an open PR by head and base', async () => {
    const pr = await openPr('feat-open');
    const found = await stores.pulls.findOpenByHeadBase(repo, 'feat-open', 'main');
    expect(found?.number).toBe(pr.number);
    await stores.pulls.setState(repo, pr.number, 'merged');
    expect(await stores.pulls.findOpenByHeadBase(repo, 'feat-open', 'main')).toBeNull();
  });
});

describe('ReviewStore', () => {
  const repo = 'muse-01/forge';
  let prNumber: number;

  beforeEach(async () => {
    const pr = await stores.pulls.create({
      repo,
      author: 'muse-01',
      title: 'pr under review',
      body: null,
      head: 'feat',
      base: 'main',
      draft: false,
      headSha: SHA_A,
    });
    prNumber = pr.number;
  });

  it('tracks the latest review per reviewer and approval state', async () => {
    await stores.reviews.create({
      repo,
      prNumber,
      reviewer: 'muse-02',
      event: 'approve',
      body: null,
    });
    expect(await stores.reviews.hasApproval(repo, prNumber)).toBe(true);

    clock.advance(1000);
    await stores.reviews.create({
      repo,
      prNumber,
      reviewer: 'muse-02',
      event: 'request_changes',
      body: 'no',
    });
    const latest = await stores.reviews.latestByReviewer(repo, prNumber);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.event).toBe('request_changes');
    expect(await stores.reviews.hasApproval(repo, prNumber)).toBe(false);

    clock.advance(1000);
    await stores.reviews.create({
      repo,
      prNumber,
      reviewer: 'muse-03',
      event: 'approve',
      body: null,
    });
    // muse-02 still blocks, so one approval does not clear it.
    expect(await stores.reviews.hasApproval(repo, prNumber)).toBe(false);
    expect(await stores.reviews.latestByReviewer(repo, prNumber)).toHaveLength(2);
  });

  it('appends line comments', async () => {
    await stores.reviews.addComment({
      repo,
      prNumber,
      author: 'muse-02',
      body: 'nit here',
      path: 'src/x.ts',
      line: 10,
    });
    await stores.reviews.addComment({ repo, prNumber, author: 'muse-02', body: 'general note' });
    const row = await db.exec.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM review_comments`);
    expect(Number(row?.n)).toBe(2);
  });
});

describe('IssueStore', () => {
  const repo = 'muse-01/issues-repo';

  async function seed() {
    await stores.issues.create({
      repo,
      author: 'muse-01',
      title: 'a',
      body: null,
      labels: ['bug'],
      assignees: ['muse-02'],
    });
    await stores.issues.create({
      repo,
      author: 'muse-01',
      title: 'b',
      body: 'x',
      labels: ['bug', 'p1'],
      assignees: [],
    });
    await stores.issues.create({
      repo,
      author: 'muse-01',
      title: 'c',
      body: null,
      labels: ['docs'],
      assignees: ['muse-03'],
    });
  }

  it('creates sequential issues and reads back', async () => {
    await seed();
    const two = await stores.issues.get(repo, 2);
    expect(two?.title).toBe('b');
    expect(two?.labels).toEqual(['bug', 'p1']);
    expect(two?.is_pr).toBe(false);
    expect(two?.url).toBe(`/${repo}/issues/2`);
  });

  it('filters by label (all must match) and by assignee', async () => {
    await seed();
    const byBug = await stores.issues.list({ repo, state: 'all', labels: ['bug'], limit: 50 });
    expect(byBug.items.map((i) => i.number)).toEqual([1, 2]);

    const byBoth = await stores.issues.list({
      repo,
      state: 'all',
      labels: ['bug', 'p1'],
      limit: 50,
    });
    expect(byBoth.items.map((i) => i.number)).toEqual([2]);

    const byAssignee = await stores.issues.list({
      repo,
      state: 'all',
      assignee: 'muse-03',
      limit: 50,
    });
    expect(byAssignee.items.map((i) => i.number)).toEqual([3]);
  });

  it('paginates and filters by state', async () => {
    await seed();
    const page1 = await stores.issues.list({ repo, state: 'all', limit: 2 });
    expect(page1.items.map((i) => i.number)).toEqual([1, 2]);
    expect(page1.total).toBe(3);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await stores.issues.list({
      repo,
      state: 'all',
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items.map((i) => i.number)).toEqual([3]);
    expect(page2.nextCursor).toBeNull();

    await stores.issues.setState(repo, 1, 'closed');
    const open = await stores.issues.list({ repo, state: 'open', limit: 50 });
    expect(open.items.map((i) => i.number)).toEqual([2, 3]);
  });

  it('appends issue comments', async () => {
    await seed();
    await stores.issues.addComment(repo, 2, 'muse-02', 'thanks');
    const row = await db.exec.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM issue_comments`);
    expect(Number(row?.n)).toBe(1);
  });
});

describe('CiRunStore', () => {
  const repo = 'muse-01/forge';

  it('creates, updates, and finds by head sha', async () => {
    const run = await stores.ci.create({
      repo,
      ref: 'refs/heads/main',
      headSha: SHA_B,
      workflow: 'ci',
    });
    expect(run.status).toBe('queued');
    expect(run.jobs).toEqual([]);
    expect(await stores.ci.get(repo, run.run_id)).toEqual(run);

    await stores.ci.update(repo, run.run_id, {
      status: 'running',
      started_at: '2026-01-01T00:00:01.000Z',
    });
    await stores.ci.update(repo, run.run_id, {
      status: 'completed',
      conclusion: 'success',
      finished_at: '2026-01-01T00:00:02.000Z',
      jobs: [{ name: 'build', status: 'completed', conclusion: 'success', duration_s: 1 }],
    });
    const done = await stores.ci.get(repo, run.run_id);
    expect(done?.status).toBe('completed');
    expect(done?.conclusion).toBe('success');
    expect(done?.started_at).toBe('2026-01-01T00:00:01.000Z');
    expect(done?.jobs).toHaveLength(1);
    expect(done?.jobs[0]?.name).toBe('build');

    const byHead = await stores.ci.findByHeadSha(repo, SHA_B);
    expect(byHead.map((r) => r.run_id)).toEqual([run.run_id]);
  });

  it('appends and tails logs, filtered by job', async () => {
    const run = await stores.ci.create({
      repo,
      ref: 'refs/heads/main',
      headSha: SHA_A,
      workflow: 'ci',
    });
    await stores.ci.appendLogs(run.run_id, 'build', ['l1', 'l2', 'l3']);
    await stores.ci.appendLogs(run.run_id, 'test', ['t1', 't2']);

    expect(await stores.ci.readLogs(run.run_id, undefined, 100)).toEqual([
      'l1',
      'l2',
      'l3',
      't1',
      't2',
    ]);
    expect(await stores.ci.readLogs(run.run_id, 'build', 100)).toEqual(['l1', 'l2', 'l3']);
    expect(await stores.ci.readLogs(run.run_id, undefined, 2)).toEqual(['t1', 't2']);
  });
});

describe('AuditLog', () => {
  it('appends, lists newest first, filters by actor, and paginates', async () => {
    const first = await stores.audit.append({
      actor: 'muse-01',
      action: 'repo.create',
      target: 'muse-01/forge',
      metadata: { visibility: 'private' },
    });
    expect(first.id).toMatch(/^evt_/);
    expect(first.at).toBe('2026-01-01T00:00:00.000Z');

    clock.advance(1000);
    await stores.audit.append({
      actor: 'muse-02',
      action: 'pr.open',
      target: 'muse-01/forge#1',
      metadata: null,
    });

    const all = await stores.audit.list({ limit: 50 });
    expect(all.items.map((e) => e.action)).toEqual(['pr.open', 'repo.create']);
    expect(all.total).toBe(2);
    expect(all.items.find((e) => e.action === 'repo.create')?.metadata).toEqual({
      visibility: 'private',
    });

    const mine = await stores.audit.list({ actor: 'muse-01', limit: 50 });
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]?.actor).toBe('muse-01');

    const page1 = await stores.audit.list({ limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await stores.audit.list({ limit: 1, cursor: page1.nextCursor ?? undefined });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id);
  });
});

describe('SessionStore', () => {
  it('reads null, sets, and upserts the working branch', async () => {
    expect(await stores.sessions.getWorkingBranch('agent-x', 'muse-01/forge')).toBeNull();
    await stores.sessions.setWorkingBranch('agent-x', 'muse-01/forge', 'feature');
    expect(await stores.sessions.getWorkingBranch('agent-x', 'muse-01/forge')).toBe('feature');
    await stores.sessions.setWorkingBranch('agent-x', 'muse-01/forge', 'main');
    expect(await stores.sessions.getWorkingBranch('agent-x', 'muse-01/forge')).toBe('main');
  });
});

// Opt-in Postgres smoke. Set MUSEHUB_TEST_PG_URL to a reachable database to run it.
// Skipped by default so the suite needs only in-memory SQLite.
const PG_URL = process.env.MUSEHUB_TEST_PG_URL;
describe.skipIf(!PG_URL)('Postgres smoke', () => {
  it('migrates and round-trips an agent on Postgres', async () => {
    const pg = createDb(PG_URL as string);
    try {
      await migrate(pg);
      const pgStores = createStores(pg, { clock: new FixedClock(), ids: new PrefixedIdGen() });
      const handle = `smoke-${Date.now()}`;
      const agent = await pgStores.agents.create({
        handle,
        displayName: 'Smoke',
        did: `did:key:${handle}`,
        walletAddress: null,
      });
      expect(await pgStores.agents.getByHandle(handle)).toEqual(agent);
    } finally {
      await pg.close();
    }
  });
});
