import type {
  Agent,
  Branch,
  CiRun,
  Collaborator,
  EnrollArgs,
  Issue,
  IssueOpenArgs,
  Membership,
  Org,
  PullRequest,
  Repo,
  RepoGetArgs,
  Review,
  Team,
  TeamMember,
} from '@musehub/contracts';
import { ForgeError } from '@musehub/contracts';
import type {
  AuthContext,
  CodeHit,
  ForgeService,
  IssueHit,
  OrgDetail,
  PrDetail,
  RepoDetail,
} from '@musehub/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApi } from './index.js';

const TS = '2026-09-26T00:00:00.000Z';
const SHA = 'a'.repeat(40);

const agent: Agent = {
  id: 'agt_1',
  handle: 'checkout-bot',
  display_name: 'Checkout Bot',
  did: 'did:key:zTest',
  wallet_address: null,
  status: 'active',
  created_at: TS,
};
const repo: Repo = {
  id: 'repo_1',
  owner: 'checkout-bot',
  name: 'checkout',
  full_name: 'checkout-bot/checkout',
  visibility: 'private',
  description: '',
  default_branch: 'main',
  clone_url: 'https://git.musehub.dev/checkout-bot/checkout.git',
  git_url: 'git@musehub.dev:checkout-bot/checkout.git',
  empty: false,
  created_at: TS,
};
const repoDetail: RepoDetail = { ...repo, head_sha: SHA, open_pr_count: 0, open_issue_count: 0 };
const pr: PullRequest = {
  number: 1,
  repo: 'checkout-bot/checkout',
  state: 'open',
  title: 'Add login',
  body: null,
  head: 'feature/login',
  base: 'main',
  draft: false,
  mergeable: true,
  author: 'checkout-bot',
  head_sha: SHA,
  url: 'https://musehub.dev/checkout-bot/checkout/pulls/1',
  created_at: TS,
};
const prDetail: PrDetail = {
  ...pr,
  mergeable_state: 'clean',
  required_checks: [],
  review_state: 'approved',
  behind_by: 0,
};
const issue: Issue = {
  number: 1,
  repo: 'checkout-bot/checkout',
  state: 'open',
  title: 'Bug',
  body: null,
  author: 'checkout-bot',
  labels: [],
  assignees: [],
  is_pr: false,
  url: 'https://musehub.dev/checkout-bot/checkout/issues/1',
  created_at: TS,
};
const review: Review = {
  id: 'rev_1',
  pr_number: 1,
  reviewer: 'checkout-bot',
  event: 'approve',
  body: null,
  created_at: TS,
};
const ciRun: CiRun = {
  run_id: 'run_1',
  repo: 'checkout-bot/checkout',
  ref: 'main',
  head_sha: SHA,
  workflow: 'ci',
  status: 'queued',
  conclusion: null,
  started_at: null,
  finished_at: null,
  jobs: [],
};
const branch: Branch = { name: 'main', head_sha: SHA, protected: true };
const codeHit: CodeHit = {
  repo: 'checkout-bot/checkout',
  path: 'src/login.ts',
  ref: 'main',
  line: 1,
  snippet: 'export function login() {}',
  url: 'https://musehub.dev/checkout-bot/checkout/blob/main/src/login.ts#L1',
};
const issueHit: IssueHit = {
  repo: 'checkout-bot/checkout',
  number: 1,
  type: 'issue',
  title: 'Bug',
  state: 'open',
  url: issue.url,
};
const org: Org = { id: 'org_1', handle: 'acme', display_name: 'Acme', created_at: TS };
const orgDetail: OrgDetail = { ...org, member_count: 1, team_count: 0, viewer_role: 'owner' };
const membership: Membership = {
  org: 'acme',
  agent: 'checkout-bot',
  role: 'member',
  created_at: TS,
};
const team: Team = { id: 'team_1', org: 'acme', slug: 'core', name: 'Core', created_at: TS };
const teamMember: TeamMember = {
  org: 'acme',
  team: 'core',
  agent: 'checkout-bot',
  created_at: TS,
};
const collaborator: Collaborator = {
  repo: 'checkout-bot/checkout',
  agent: 'nova',
  permission: 'write',
  created_at: TS,
};

interface Spy {
  enroll?: EnrollArgs;
  whoami?: AuthContext;
  repoGet?: RepoGetArgs;
  issueOpen?: { ctx: AuthContext; args: IssueOpenArgs };
}

const page = <T>(items: T[]) => ({ items, next_cursor: null });

/** A fake ForgeService: canned values, one thrown ForgeError and a few recorded calls. */
function makeForge(): { forge: ForgeService; spy: Spy } {
  const spy: Spy = {};
  const forge: ForgeService = {
    async enroll(args) {
      spy.enroll = args;
      if (args.muse_attestation === 'human') {
        throw new ForgeError('forbidden_human', 'Onboarding is Muse-agents only.', {
          next: 'Enroll through the Muse agent identity flow.',
        });
      }
      return { agent, token: 'agent-token-xyz', token_expires_at: TS, is_new: true };
    },
    async whoami(ctx) {
      spy.whoami = ctx;
      return { agent, token_expires_at: TS };
    },
    async repoCreate() {
      return repo;
    },
    async repoList() {
      return page([repo]);
    },
    async repoGet(_ctx, args) {
      spy.repoGet = args;
      if (args.repo.endsWith('/missing')) {
        throw new ForgeError('repo_not_found', `Repo ${args.repo} not found.`, {
          next: 'Check owner/name with forge.repo_list. Otherwise create it with forge.repo_create.',
        });
      }
      return repoDetail;
    },
    async repoDelete() {
      return { unchanged: false };
    },
    async treeRead() {
      return { ref: 'main', sha: SHA, entries: [], truncated: false };
    },
    async fileRead() {
      return {
        path: 'README.md',
        ref: 'main',
        sha: SHA,
        size: 5,
        encoding: 'text',
        content: 'hello',
        truncated: false,
      };
    },
    async commitCreate() {
      return {
        commit_sha: SHA,
        branch: 'main',
        parents: [],
        tree_sha: SHA,
        files_changed: 1,
        unchanged: false,
      };
    },
    async fileWrite() {
      return {
        commit_sha: SHA,
        branch: 'main',
        parents: [],
        tree_sha: SHA,
        files_changed: 1,
        unchanged: false,
      };
    },
    async branchCreate() {
      return { branch: 'feature/login', head_sha: SHA, created: true };
    },
    async branchSwitch(_ctx, args) {
      return { repo: args.repo, branch: args.branch };
    },
    async diffGet() {
      return { base_sha: SHA, head_sha: SHA, files: [], truncated: false };
    },
    async prOpen() {
      return pr;
    },
    async prList() {
      return page([pr]);
    },
    async prGet() {
      return prDetail;
    },
    async prComment() {
      return { ok: true };
    },
    async prReview() {
      return review;
    },
    async prMerge() {
      return { merged: true, merge_sha: SHA, already_merged: false };
    },
    async issueOpen(ctx, args) {
      spy.issueOpen = { ctx, args };
      return issue;
    },
    async issueList() {
      return page([issue]);
    },
    async issueComment() {
      return { ok: true };
    },
    async issueClose() {
      return { unchanged: false };
    },
    async issueReopen() {
      return { unchanged: false };
    },
    async ciRun() {
      return ciRun;
    },
    async ciStatus() {
      return ciRun;
    },
    async ciLogs() {
      return { run_id: 'run_1', job: null, lines: [], next_cursor: null, truncated: false };
    },
    async searchRepos() {
      return page([repo]);
    },
    async searchCode() {
      return page([codeHit]);
    },
    async searchIssues() {
      return page([issueHit]);
    },
    async orgCreate() {
      return org;
    },
    async orgGet() {
      return orgDetail;
    },
    async orgList() {
      return page([org]);
    },
    async orgAddMember() {
      return membership;
    },
    async orgRemoveMember() {
      return { removed: true };
    },
    async teamCreate() {
      return team;
    },
    async teamAddMember() {
      return teamMember;
    },
    async repoAddCollaborator() {
      return collaborator;
    },
    async repoRemoveCollaborator() {
      return { removed: true };
    },
    async repoListCollaborators() {
      return page([collaborator]);
    },
    async listAudit() {
      return page([]);
    },
    async listBranches() {
      return [branch];
    },
  };
  return { forge, spy };
}

const GOOD = 'good-token';
const resolveAuth = async (token: string): Promise<AuthContext | null> =>
  token === GOOD ? { agent, tokenId: 'tok_1' } : null;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const basic = (user: string, pass: string) => ({
  authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
});

// PLACEHOLDER_TESTS
describe('@musehub/api', () => {
  let app: Awaited<ReturnType<typeof buildApi>>;
  let spy: Spy;

  beforeEach(async () => {
    const f = makeForge();
    spy = f.spy;
    app = await buildApi({ forge: f.forge, resolveAuth });
    await app.ready();
  });

  it('enroll returns a token-shaped body without any auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/enroll',
      payload: { muse_attestation: 'valid', handle: 'checkout-bot' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBe('agent-token-xyz');
    expect(body.agent.handle).toBe('checkout-bot');
    expect(body.is_new).toBe(true);
    expect(spy.enroll?.muse_attestation).toBe('valid');
  });

  it('maps a thrown forbidden_human to 403 on enroll', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/enroll',
      payload: { muse_attestation: 'human' },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe('forbidden_human');
    expect(body.error.http_status).toBe(403);
    expect(body.error.next).toBeTruthy();
  });

  it('rejects a body that fails the contract schema with validation_failed (422)', async () => {
    const missing = await app.inject({ method: 'POST', url: '/v1/enroll', payload: {} });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe('validation_failed');

    // .strict() on the contract schema means a hallucinated field also fails.
    const extra = await app.inject({
      method: 'POST',
      url: '/v1/enroll',
      payload: { muse_attestation: 'valid', bogus: true },
    });
    expect(extra.statusCode).toBe(422);
    expect(extra.json().error.code).toBe('validation_failed');
  });

  it('refuses a protected route with no token (401 unauthenticated)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('unauthenticated');
    expect(body.error.http_status).toBe(401);
    expect(spy.whoami).toBeUndefined();
  });

  it('refuses a protected route with a bad token (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer('nope') });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthenticated');
  });

  it('a valid token reaches the forge method with the resolved auth context', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(GOOD) });
    expect(res.statusCode).toBe(200);
    expect(res.json().agent.handle).toBe('checkout-bot');
    expect(spy.whoami?.tokenId).toBe('tok_1');
  });

  it('maps a thrown ForgeError to its catalog status and code', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/repos/checkout-bot/missing',
      headers: bearer(GOOD),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('repo_not_found');
    expect(spy.repoGet?.repo).toBe('checkout-bot/missing');
  });

  it('builds the repo spec from the path and returns the forge result', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/repos/checkout-bot/checkout',
      headers: bearer(GOOD),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().full_name).toBe('checkout-bot/checkout');
    expect(spy.repoGet?.repo).toBe('checkout-bot/checkout');
  });

  it('reassembles path plus body for a write route', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/repos/checkout-bot/checkout/issues',
      headers: bearer(GOOD),
      payload: { title: 'Bug', labels: ['triage'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().number).toBe(1);
    expect(spy.issueOpen?.args.repo).toBe('checkout-bot/checkout');
    expect(spy.issueOpen?.args.title).toBe('Bug');
  });

  it('coerces and validates query parameters', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: '/v1/repos?limit=abc',
      headers: bearer(GOOD),
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_failed');

    const ok = await app.inject({
      method: 'GET',
      url: '/v1/repos?limit=5&visibility=private',
      headers: bearer(GOOD),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().items).toHaveLength(1);
  });

  it('serves an OpenAPI document listing the routes at /openapi.json', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(typeof doc.openapi).toBe('string');
    expect(doc.paths['/v1/enroll']).toBeTruthy();
    expect(doc.paths['/v1/repos/{owner}/{repo}']).toBeTruthy();
    expect(doc.paths['/v1/repos/{owner}/{repo}/pulls/{number}/merge']).toBeTruthy();
    expect(doc.paths['/v1/orgs']).toBeTruthy();
    expect(doc.paths['/v1/orgs/{org}/members']).toBeTruthy();
    expect(doc.paths['/v1/repos/{owner}/{repo}/collaborators']).toBeTruthy();
    expect(Object.keys(doc.paths).length).toBeGreaterThan(20);
  });

  it('creates an org over POST /v1/orgs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orgs',
      headers: bearer(GOOD),
      payload: { handle: 'acme', display_name: 'Acme' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().handle).toBe('acme');
  });

  it('reassembles path plus body for an org member add', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orgs/acme/members',
      headers: bearer(GOOD),
      payload: { agent: 'nova', role: 'admin' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().org).toBe('acme');
  });

  it('lists and adds repo collaborators from the repo path', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/v1/repos/checkout-bot/checkout/collaborators',
      headers: bearer(GOOD),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0].agent).toBe('nova');

    const add = await app.inject({
      method: 'POST',
      url: '/v1/repos/checkout-bot/checkout/collaborators',
      headers: bearer(GOOD),
      payload: { agent: 'nova', permission: 'write' },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().permission).toBe('write');
  });

  describe('git smart-HTTP', () => {
    it('challenges an unauthenticated git fetch with Basic and 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/checkout-bot/checkout.git/info/refs' });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Basic');
      expect(res.json().error.code).toBe('unauthenticated');
    });

    it('answers a clear 503 envelope when no git backend is injected', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/checkout-bot/checkout.git/info/refs',
        headers: basic('x-access-token', GOOD),
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.http_status).toBe(503);
    });

    it('routes git receive-pack through auth and 503s without a backend', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/checkout-bot/checkout.git/git-receive-pack',
        headers: {
          ...basic('x-access-token', GOOD),
          'content-type': 'application/x-git-receive-pack-request',
        },
        payload: '0000',
      });
      expect(res.statusCode).toBe(503);
    });

    it('delegates to an injected git backend once authenticated', async () => {
      const f = makeForge();
      let seen: { owner: string; repo: string; service: string } | null = null;
      const gitApp = await buildApi({
        forge: f.forge,
        resolveAuth,
        gitHttp: async (_req, reply, ctx) => {
          seen = { owner: ctx.owner, repo: ctx.repo, service: ctx.service };
          reply.code(200).header('content-type', 'application/x-git-upload-pack-advertisement');
          reply.send('# service=git-upload-pack\n');
        },
      });
      await gitApp.ready();
      const res = await gitApp.inject({
        method: 'GET',
        url: '/checkout-bot/checkout.git/info/refs?service=git-upload-pack',
        headers: basic('x-access-token', GOOD),
      });
      expect(res.statusCode).toBe(200);
      expect(seen).toEqual({ owner: 'checkout-bot', repo: 'checkout', service: 'info-refs' });
      await gitApp.close();
    });
  });
});
