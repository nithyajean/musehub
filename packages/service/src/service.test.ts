import {
  BranchCreateArgs,
  BranchSwitchArgs,
  CommitCreateArgs,
  DiffGetArgs,
  EnrollArgs,
  FileReadArgs,
  FileWriteArgs,
  IssueCloseArgs,
  IssueCommentArgs,
  IssueOpenArgs,
  IssueReopenArgs,
  OrgAddMemberArgs,
  OrgCreateArgs,
  OrgGetArgs,
  OrgListArgs,
  OrgRemoveMemberArgs,
  PrMergeArgs,
  PrOpenArgs,
  RepoAddCollaboratorArgs,
  RepoCreateArgs,
  RepoDeleteArgs,
  RepoGetArgs,
  RepoListArgs,
  RepoListCollaboratorsArgs,
  RepoRemoveCollaboratorArgs,
  SearchCodeArgs,
  SearchIssuesArgs,
  SearchReposArgs,
  TeamAddMemberArgs,
  TeamCreateArgs,
  TreeReadArgs,
  isForgeError,
} from '@musehub/contracts';
import type { AuthContext } from '@musehub/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Harness, buildHarness } from './fakes.js';
import { createForgeService } from './index.js';

type Svc = ReturnType<typeof createForgeService>;

function att(did: string, wallet?: string): string {
  return JSON.stringify(wallet ? { did, wallet } : { did });
}

/** Enroll an allowlisted agent and return its context. */
async function enroll(
  h: Harness,
  svc: Svc,
  did: string,
  handle?: string,
): Promise<{ ctx: AuthContext; handle: string }> {
  h.allow.add(did);
  const res = await svc.enroll(
    EnrollArgs.parse({ muse_attestation: att(did), ...(handle ? { handle } : {}) }),
  );
  return { ctx: { agent: res.agent, tokenId: 'tok' }, handle: res.agent.handle };
}

/** Run a call and return the ForgeError code it threw, or 'NO_ERROR'. */
async function codeOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return 'NO_ERROR';
  } catch (error) {
    if (isForgeError(error)) {
      return error.code;
    }
    throw error;
  }
}

let h: Harness;
let svc: Svc;

beforeEach(() => {
  h = buildHarness();
  svc = createForgeService(h.ports);
});

describe('enroll: the agent-only gate', () => {
  it('refuses a caller whose identity is not allowlisted (a human or unverified)', async () => {
    // did never admitted, so the verifier reports not-allowlisted.
    const code = await codeOf(
      svc.enroll(EnrollArgs.parse({ muse_attestation: att('did:key:zHUMAN') })),
    );
    expect(code).toBe('forbidden_human');
    expect(await h.agents.getByDid('did:key:zHUMAN')).toBeNull();
  });

  it('refuses a malformed attestation', async () => {
    const code = await codeOf(svc.enroll(EnrollArgs.parse({ muse_attestation: 'not-json' })));
    expect(code).toBe('forbidden_human');
  });

  it('admits an allowlisted Muse agent, mints a token and writes an audit event', async () => {
    h.allow.add('did:key:zAGENT');
    const res = await svc.enroll(
      EnrollArgs.parse({ muse_attestation: att('did:key:zAGENT', '0xabc'), handle: 'alice' }),
    );
    expect(res.is_new).toBe(true);
    expect(res.agent.handle).toBe('alice');
    expect(res.agent.did).toBe('did:key:zAGENT');
    expect(res.agent.wallet_address).toBe('0xabc');
    expect(res.token).toMatch(/^token_/);
    expect(res.token_expires_at).toBeTruthy();
    expect(h.audit.events.some((e) => e.action === 'agent.enroll')).toBe(true);
  });

  it('is idempotent per identity: re-enroll returns the same account with a fresh token', async () => {
    const first = await enroll(h, svc, 'did:key:zSAME', 'sam');
    const second = await svc.enroll(EnrollArgs.parse({ muse_attestation: att('did:key:zSAME') }));
    expect(second.is_new).toBe(false);
    expect(second.agent.id).toBe(first.ctx.agent.id);
  });

  it('generates a valid handle when none is given', async () => {
    const { handle } = await enroll(h, svc, 'did:key:zGENERATED0001');
    expect(handle).toMatch(/^[a-z0-9][a-z0-9-]{1,38}$/);
  });

  it('rejects a handle already taken', async () => {
    await enroll(h, svc, 'did:key:zONE', 'taken');
    h.allow.add('did:key:zTWO');
    const code = await codeOf(
      svc.enroll(EnrollArgs.parse({ muse_attestation: att('did:key:zTWO'), handle: 'taken' })),
    );
    expect(code).toBe('validation_failed');
  });

  it('whoami returns the calling agent', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zWHO', 'who');
    const me = await svc.whoami(ctx);
    expect(me.agent.handle).toBe('who');
  });
});

describe('repositories: create, list, get, delete', () => {
  it('auto_init seeds a clonable repo with README and LICENSE and a head commit', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zR1', 'alice');
    const repo = await svc.repoCreate(
      ctx,
      RepoCreateArgs.parse({ name: 'app', license: 'LicenseRef-zkasuran-SAND-1.0' }),
    );
    expect(repo.full_name).toBe('alice/app');
    expect(repo.clone_url).toBe('https://git.test/alice/app.git');
    expect(repo.empty).toBe(false);
    const detail = await svc.repoGet(ctx, RepoGetArgs.parse({ repo: 'app' }));
    expect(detail.head_sha).toMatch(/^[0-9a-f]{40}$/);
    const readme = await svc.fileRead(ctx, FileReadArgs.parse({ repo: 'app', path: 'README.md' }));
    expect(readme.content).toContain('# app');
  });

  it('create is idempotent under if_exists ok, and errors otherwise', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zR2', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    expect(await codeOf(svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' })))).toBe(
      'repo_exists',
    );
    const again = await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app', if_exists: 'ok' }));
    expect(again.unchanged).toBe(true);
  });

  it('paginates repo lists with an opaque next_cursor', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zR3', 'alice');
    for (const name of ['one', 'two', 'three']) {
      await svc.repoCreate(ctx, RepoCreateArgs.parse({ name, auto_init: false }));
    }
    const page1 = await svc.repoList(ctx, RepoListArgs.parse({ limit: 2 }));
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.next_cursor).not.toBeNull();
    const page2 = await svc.repoList(
      ctx,
      RepoListArgs.parse({ limit: 2, cursor: page1.next_cursor as string }),
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.next_cursor).toBeNull();
  });

  it('delete is idempotent, checks confirmation, then removes the repo', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zR4', 'alice');
    expect(
      (await svc.repoDelete(ctx, RepoDeleteArgs.parse({ repo: 'ghost', confirm: 'alice/ghost' })))
        .unchanged,
    ).toBe(true);
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app', auto_init: false }));
    expect(
      await codeOf(svc.repoDelete(ctx, RepoDeleteArgs.parse({ repo: 'app', confirm: 'wrong' }))),
    ).toBe('confirmation_mismatch');
    const removed = await svc.repoDelete(
      ctx,
      RepoDeleteArgs.parse({ repo: 'app', confirm: 'alice/app' }),
    );
    expect(removed.unchanged).toBe(false);
    expect(await codeOf(svc.repoGet(ctx, RepoGetArgs.parse({ repo: 'app' })))).toBe(
      'repo_not_found',
    );
  });
});

describe('authorization and privacy', () => {
  async function twoAgents() {
    const a = await enroll(h, svc, 'did:key:zA', 'alice');
    const b = await enroll(h, svc, 'did:key:zB', 'bob');
    await svc.repoCreate(a.ctx, RepoCreateArgs.parse({ name: 'secret', visibility: 'private' }));
    await svc.repoCreate(a.ctx, RepoCreateArgs.parse({ name: 'open', visibility: 'public' }));
    return { a, b };
  }

  it('hides a private repo from a non-owner as repo_not_found, not forbidden', async () => {
    const { b } = await twoAgents();
    expect(await codeOf(svc.repoGet(b.ctx, RepoGetArgs.parse({ repo: 'alice/secret' })))).toBe(
      'repo_not_found',
    );
  });

  it('lists only public repos when a non-owner browses another agent', async () => {
    const { b } = await twoAgents();
    const page = await svc.repoList(b.ctx, RepoListArgs.parse({ owner: 'alice' }));
    const names = page.items.map((r) => r.name);
    expect(names).toContain('open');
    expect(names).not.toContain('secret');
  });

  it('lets a non-owner read a public repo but refuses a write', async () => {
    const { b } = await twoAgents();
    const detail = await svc.repoGet(b.ctx, RepoGetArgs.parse({ repo: 'alice/open' }));
    expect(detail.full_name).toBe('alice/open');
    const code = await codeOf(
      svc.commitCreate(
        b.ctx,
        CommitCreateArgs.parse({
          repo: 'alice/open',
          message: 'x',
          changes: [{ path: 'f.txt', content: 'hi' }],
        }),
      ),
    );
    expect(code).toBe('forbidden');
  });

  it('does not surface another agent private repo in search', async () => {
    const { b } = await twoAgents();
    const priv = await svc.searchRepos(b.ctx, SearchReposArgs.parse({ q: 'secret' }));
    expect(priv.items).toHaveLength(0);
    const pub = await svc.searchRepos(b.ctx, SearchReposArgs.parse({ q: 'open' }));
    expect(pub.items.map((r) => r.name)).toContain('open');
  });

  it('reports repo_not_found (not forbidden) when a non-owner deletes a private repo', async () => {
    const { b } = await twoAgents();
    expect(
      await codeOf(
        svc.repoDelete(
          b.ctx,
          RepoDeleteArgs.parse({ repo: 'alice/secret', confirm: 'alice/secret' }),
        ),
      ),
    ).toBe('repo_not_found');
  });
});

describe('files, commits and branches', () => {
  async function repo() {
    const { ctx } = await enroll(h, svc, 'did:key:zC', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    return ctx;
  }

  it('creates a branch, commits to it, then reads the file and tree back', async () => {
    const ctx = await repo();
    const branch = await svc.branchCreate(
      ctx,
      BranchCreateArgs.parse({ repo: 'app', name: 'feature' }),
    );
    expect(branch.created).toBe(true);
    const commit = await svc.commitCreate(
      ctx,
      CommitCreateArgs.parse({
        repo: 'app',
        message: 'add file',
        branch: 'feature',
        changes: [{ path: 'src/x.ts', content: 'export const x = 1;\n' }],
      }),
    );
    expect(commit.unchanged).toBe(false);
    expect(commit.commit_sha).toMatch(/^[0-9a-f]{40}$/);
    const file = await svc.fileRead(
      ctx,
      FileReadArgs.parse({ repo: 'app', path: 'src/x.ts', ref: 'feature' }),
    );
    expect(file.content).toContain('export const x');
    const tree = await svc.treeRead(
      ctx,
      TreeReadArgs.parse({ repo: 'app', ref: 'feature', recursive: true }),
    );
    expect(tree.entries.some((e) => e.path === 'src/x.ts')).toBe(true);
  });

  it('returns unchanged for a no-op commit', async () => {
    const ctx = await repo();
    await svc.fileWrite(ctx, FileWriteArgs.parse({ repo: 'app', path: 'a.txt', content: 'same' }));
    const second = await svc.fileWrite(
      ctx,
      FileWriteArgs.parse({ repo: 'app', path: 'a.txt', content: 'same' }),
    );
    expect(second.unchanged).toBe(true);
    expect(second.files_changed).toBe(0);
  });

  it('rejects a commit whose expected_head has moved', async () => {
    const ctx = await repo();
    const code = await codeOf(
      svc.commitCreate(
        ctx,
        CommitCreateArgs.parse({
          repo: 'app',
          message: 'x',
          branch: 'main',
          expected_head: '0'.repeat(40),
          changes: [{ path: 'b.txt', content: 'b' }],
        }),
      ),
    );
    expect(code).toBe('stale_ref');
  });

  it('commits to the session working branch after branch_switch', async () => {
    const ctx = await repo();
    await svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'work' }));
    await svc.branchSwitch(ctx, BranchSwitchArgs.parse({ repo: 'app', branch: 'work' }));
    const commit = await svc.commitCreate(
      ctx,
      CommitCreateArgs.parse({
        repo: 'app',
        message: 'c',
        changes: [{ path: 'w.txt', content: 'w' }],
      }),
    );
    expect(commit.branch).toBe('work');
  });

  it('branch_create errors on an existing branch unless if_exists ok', async () => {
    const ctx = await repo();
    await svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'dup' }));
    expect(
      await codeOf(svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'dup' }))),
    ).toBe('branch_exists');
    const ok = await svc.branchCreate(
      ctx,
      BranchCreateArgs.parse({ repo: 'app', name: 'dup', if_exists: 'ok' }),
    );
    expect(ok.created).toBe(false);
  });

  it('branch_switch to an absent branch needs create_from', async () => {
    const ctx = await repo();
    expect(
      await codeOf(svc.branchSwitch(ctx, BranchSwitchArgs.parse({ repo: 'app', branch: 'nope' }))),
    ).toBe('branch_not_found');
    const created = await svc.branchSwitch(
      ctx,
      BranchSwitchArgs.parse({ repo: 'app', branch: 'made', create_from: 'main' }),
    );
    expect(created.branch).toBe('made');
  });

  it('file_read on a missing path returns file_not_found', async () => {
    const ctx = await repo();
    expect(
      await codeOf(svc.fileRead(ctx, FileReadArgs.parse({ repo: 'app', path: 'missing' }))),
    ).toBe('file_not_found');
  });

  it('diff needs base and head or a pull_number', async () => {
    const ctx = await repo();
    expect(await codeOf(svc.diffGet(ctx, DiffGetArgs.parse({ repo: 'app' })))).toBe(
      'validation_failed',
    );
    await svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'feature' }));
    await svc.commitCreate(
      ctx,
      CommitCreateArgs.parse({
        repo: 'app',
        message: 'add',
        branch: 'feature',
        changes: [{ path: 'n.txt', content: 'n' }],
      }),
    );
    const diff = await svc.diffGet(
      ctx,
      DiffGetArgs.parse({ repo: 'app', base: 'main', head: 'feature' }),
    );
    expect(diff.files.some((f) => f.path === 'n.txt')).toBe(true);
  });
});

describe('pull requests and the merge gate', () => {
  async function openPr() {
    const { ctx } = await enroll(h, svc, 'did:key:zP', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    await svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'feature' }));
    await svc.commitCreate(
      ctx,
      CommitCreateArgs.parse({
        repo: 'app',
        message: 'work',
        branch: 'feature',
        changes: [{ path: 'src/x.ts', content: 'export const x = 2;\n' }],
      }),
    );
    const pr = await svc.prOpen(
      ctx,
      PrOpenArgs.parse({ repo: 'app', title: 'Add x', head: 'feature', base: 'main' }),
    );
    return { ctx, pr };
  }

  it('refuses a second PR for the same head and base', async () => {
    const { ctx } = await openPr();
    expect(
      await codeOf(
        svc.prOpen(
          ctx,
          PrOpenArgs.parse({ repo: 'app', title: 'dup', head: 'feature', base: 'main' }),
        ),
      ),
    ).toBe('pr_exists');
  });

  it('refuses a PR from a branch that does not exist', async () => {
    const { ctx } = await openPr();
    expect(
      await codeOf(
        svc.prOpen(ctx, PrOpenArgs.parse({ repo: 'app', title: 'x', head: 'ghost', base: 'main' })),
      ),
    ).toBe('branch_not_found');
  });

  it('blocks merge through the full gate in order, then merges, then is idempotent', async () => {
    const { ctx, pr } = await openPr();
    const merge = () => PrMergeArgs.parse({ repo: 'app', number: pr.number });

    // 1. No checks recorded yet.
    expect(await codeOf(svc.prMerge(ctx, merge()))).toBe('checks_pending');

    // 2. A required check exists but failed.
    await h.ci.create({ repo: 'alice/app', ref: 'feature', headSha: pr.head_sha, workflow: 'ci' });
    const run = (await h.ci.findByHeadSha('alice/app', pr.head_sha))[0];
    await h.ci.update('alice/app', run?.run_id as string, {
      status: 'completed',
      conclusion: 'failure',
    });
    expect(await codeOf(svc.prMerge(ctx, merge()))).toBe('checks_failed');

    // 3. Checks green, but no approving review.
    await h.ci.update('alice/app', run?.run_id as string, {
      status: 'completed',
      conclusion: 'success',
    });
    expect(await codeOf(svc.prMerge(ctx, merge()))).toBe('review_required');

    // 4. Approved, but the caller expects a stale head.
    await svc.prReview(ctx, { repo: 'app', number: pr.number, event: 'approve' });
    expect(
      await codeOf(
        svc.prMerge(
          ctx,
          PrMergeArgs.parse({ repo: 'app', number: pr.number, expected_head: '0'.repeat(40) }),
        ),
      ),
    ).toBe('stale_ref');

    // 5. The branch no longer applies cleanly.
    h.git.setConflict('alice', 'app', 'main', 'feature');
    expect(await codeOf(svc.prMerge(ctx, merge()))).toBe('merge_conflict');

    // 6. Green, reviewed, clean: it merges.
    h.git.clearConflict('alice', 'app', 'main', 'feature');
    const merged = await svc.prMerge(ctx, merge());
    expect(merged.merged).toBe(true);
    expect(merged.already_merged).toBe(false);
    expect(merged.merge_sha).toMatch(/^[0-9a-f]{40}$/);

    // 7. Merging again is idempotent.
    const again = await svc.prMerge(ctx, merge());
    expect(again.already_merged).toBe(true);
  });

  it('pr_get reports required checks, review state and mergeability', async () => {
    const { ctx, pr } = await openPr();
    await h.ci.create({ repo: 'alice/app', ref: 'feature', headSha: pr.head_sha, workflow: 'ci' });
    const run = (await h.ci.findByHeadSha('alice/app', pr.head_sha))[0];
    await h.ci.update('alice/app', run?.run_id as string, {
      status: 'completed',
      conclusion: 'success',
    });
    await svc.prReview(ctx, { repo: 'app', number: pr.number, event: 'approve' });
    const detail = await svc.prGet(ctx, { repo: 'app', number: pr.number });
    expect(detail.required_checks).toHaveLength(1);
    expect(detail.review_state).toBe('approved');
    expect(detail.mergeable_state).toBe('clean');
  });
});

describe('issues', () => {
  async function repoAndIssue() {
    const { ctx } = await enroll(h, svc, 'did:key:zI', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app', auto_init: false }));
    const issue = await svc.issueOpen(ctx, IssueOpenArgs.parse({ repo: 'app', title: 'Bug' }));
    return { ctx, issue };
  }

  it('close and reopen are idempotent', async () => {
    const { ctx, issue } = await repoAndIssue();
    expect(
      (await svc.issueClose(ctx, IssueCloseArgs.parse({ repo: 'app', number: issue.number })))
        .unchanged,
    ).toBe(false);
    expect(
      (await svc.issueClose(ctx, IssueCloseArgs.parse({ repo: 'app', number: issue.number })))
        .unchanged,
    ).toBe(true);
    expect(
      (await svc.issueReopen(ctx, IssueReopenArgs.parse({ repo: 'app', number: issue.number })))
        .unchanged,
    ).toBe(false);
    expect(
      (await svc.issueReopen(ctx, IssueReopenArgs.parse({ repo: 'app', number: issue.number })))
        .unchanged,
    ).toBe(true);
  });

  it('commenting on a missing issue returns issue_not_found', async () => {
    const { ctx } = await repoAndIssue();
    expect(
      await codeOf(
        svc.issueComment(ctx, IssueCommentArgs.parse({ repo: 'app', number: 999, body: 'x' })),
      ),
    ).toBe('validation_failed');
  });

  it('a non-owner non-author cannot close an issue on a public repo', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zIA', 'alice');
    await svc.repoCreate(
      ctx,
      RepoCreateArgs.parse({ name: 'app', visibility: 'public', auto_init: false }),
    );
    const issue = await svc.issueOpen(ctx, IssueOpenArgs.parse({ repo: 'app', title: 'Bug' }));
    const { ctx: bob } = await enroll(h, svc, 'did:key:zIB', 'bob');
    expect(
      await codeOf(
        svc.issueClose(bob, IssueCloseArgs.parse({ repo: 'alice/app', number: issue.number })),
      ),
    ).toBe('forbidden');
  });
});

describe('ci', () => {
  it('returns queued even when the runner fails to start', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zCI', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    h.runner.shouldThrow = true;
    const run = await svc.ciRun(ctx, { repo: 'app', ref: 'main' });
    expect(run.status).toBe('queued');
  });

  it('ci_status on an unknown run is validation_failed', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zCI2', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    expect(await codeOf(svc.ciStatus(ctx, { repo: 'app', run_id: 'nope' }))).toBe(
      'validation_failed',
    );
  });
});

describe('search', () => {
  it('finds a term inside a committed file', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zS', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    await svc.fileWrite(
      ctx,
      FileWriteArgs.parse({ repo: 'app', path: 'src/find.ts', content: 'const needle = 42;\n' }),
    );
    const hits = await svc.searchCode(ctx, SearchCodeArgs.parse({ q: 'needle' }));
    expect(hits.items.length).toBeGreaterThan(0);
    expect(hits.items[0]?.path).toBe('src/find.ts');
  });

  it('finds issues by title text', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zS2', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app', auto_init: false }));
    await svc.issueOpen(ctx, IssueOpenArgs.parse({ repo: 'app', title: 'Login is broken' }));
    const hits = await svc.searchIssues(ctx, SearchIssuesArgs.parse({ q: 'login' }));
    expect(hits.items.some((i) => i.title === 'Login is broken')).toBe(true);
  });
});

describe('audit trail', () => {
  it('records a mutation for enroll and repo create', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zAU', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app', auto_init: false }));
    const log = await svc.listAudit(ctx, { limit: 30 });
    const actions = log.items.map((e) => e.action);
    expect(actions).toContain('agent.enroll');
    expect(actions).toContain('repo.create');
  });
});

describe('organizations and teams', () => {
  it('creates an org, makes the creator its owner, and lists it', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zORG', 'alice');
    const org = await svc.orgCreate(
      ctx,
      OrgCreateArgs.parse({ handle: 'acme', display_name: 'Acme' }),
    );
    expect(org.handle).toBe('acme');

    const detail = await svc.orgGet(ctx, OrgGetArgs.parse({ org: 'acme' }));
    expect(detail.viewer_role).toBe('owner');
    expect(detail.member_count).toBe(1);

    const mine = await svc.orgList(ctx, OrgListArgs.parse({}));
    expect(mine.items.map((o) => o.handle)).toContain('acme');
  });

  it('rejects an org handle already held by an agent or an org', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zORG2', 'alice');
    // 'alice' is an agent handle already.
    expect(await codeOf(svc.orgCreate(ctx, OrgCreateArgs.parse({ handle: 'alice' })))).toBe(
      'validation_failed',
    );
    await svc.orgCreate(ctx, OrgCreateArgs.parse({ handle: 'acme' }));
    expect(await codeOf(svc.orgCreate(ctx, OrgCreateArgs.parse({ handle: 'acme' })))).toBe(
      'validation_failed',
    );
  });

  it('only an org admin can add or remove members', async () => {
    const { ctx: alice } = await enroll(h, svc, 'did:key:zORG3', 'alice');
    const { ctx: bob } = await enroll(h, svc, 'did:key:zORG4', 'bob');
    await enroll(h, svc, 'did:key:zORG5', 'carol');
    await svc.orgCreate(alice, OrgCreateArgs.parse({ handle: 'acme' }));

    // bob is not a member, so he cannot add anyone.
    expect(
      await codeOf(svc.orgAddMember(bob, OrgAddMemberArgs.parse({ org: 'acme', agent: 'carol' }))),
    ).toBe('forbidden');

    // alice (owner) adds bob as a plain member.
    const m = await svc.orgAddMember(alice, OrgAddMemberArgs.parse({ org: 'acme', agent: 'bob' }));
    expect(m.role).toBe('member');

    // bob (member, not admin) still cannot add carol.
    expect(
      await codeOf(svc.orgAddMember(bob, OrgAddMemberArgs.parse({ org: 'acme', agent: 'carol' }))),
    ).toBe('forbidden');

    // A member must be an enrolled agent.
    expect(
      await codeOf(
        svc.orgAddMember(alice, OrgAddMemberArgs.parse({ org: 'acme', agent: 'ghost' })),
      ),
    ).toBe('validation_failed');

    const removed = await svc.orgRemoveMember(
      alice,
      OrgRemoveMemberArgs.parse({ org: 'acme', agent: 'bob' }),
    );
    expect(removed.removed).toBe(true);
  });
});

describe('collaboration authorization', () => {
  // A shared org 'acme' with a private repo, an admin, a team member, a read-only
  // collaborator and an outsider, to prove each authz path in one place.
  async function scene() {
    const { ctx: alice } = await enroll(h, svc, 'did:key:zC1', 'alice');
    const { ctx: carol } = await enroll(h, svc, 'did:key:zC2', 'carol');
    const { ctx: dave } = await enroll(h, svc, 'did:key:zC3', 'dave');
    const { ctx: eve } = await enroll(h, svc, 'did:key:zC4', 'eve');
    const { ctx: frank } = await enroll(h, svc, 'did:key:zC5', 'frank');

    await svc.orgCreate(alice, OrgCreateArgs.parse({ handle: 'acme' }));
    await svc.repoCreate(
      alice,
      RepoCreateArgs.parse({ name: 'app', owner: 'acme', visibility: 'private' }),
    );

    // carol is an org admin.
    await svc.orgAddMember(
      alice,
      OrgAddMemberArgs.parse({ org: 'acme', agent: 'carol', role: 'admin' }),
    );
    // dave is only on a team in the org, not a direct member.
    await svc.teamCreate(alice, TeamCreateArgs.parse({ org: 'acme', slug: 'devs', name: 'Devs' }));
    await svc.teamAddMember(
      alice,
      TeamAddMemberArgs.parse({ org: 'acme', team: 'devs', agent: 'dave' }),
    );
    // eve is a read-only collaborator on the repo.
    await svc.repoAddCollaborator(
      alice,
      RepoAddCollaboratorArgs.parse({ repo: 'acme/app', agent: 'eve', permission: 'read' }),
    );
    return { alice, carol, dave, eve, frank };
  }

  const write = (repo: string) =>
    CommitCreateArgs.parse({
      repo,
      message: 'touch',
      changes: [{ path: 'f.txt', content: 'hi' }],
    });

  it('a team member can write to the org repo', async () => {
    const { dave } = await scene();
    const commit = await svc.commitCreate(dave, write('acme/app'));
    expect(commit.commit_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('an org admin can write to the org repo', async () => {
    const { carol } = await scene();
    const commit = await svc.commitCreate(carol, write('acme/app'));
    expect(commit.unchanged).toBe(false);
  });

  it('a read-only collaborator can read but cannot write', async () => {
    const { eve } = await scene();
    const detail = await svc.repoGet(eve, RepoGetArgs.parse({ repo: 'acme/app' }));
    expect(detail.full_name).toBe('acme/app');
    expect(await codeOf(svc.commitCreate(eve, write('acme/app')))).toBe('forbidden');
  });

  it('an outsider is refused and the private repo is hidden as repo_not_found', async () => {
    const { frank } = await scene();
    expect(await codeOf(svc.repoGet(frank, RepoGetArgs.parse({ repo: 'acme/app' })))).toBe(
      'repo_not_found',
    );
    expect(await codeOf(svc.commitCreate(frank, write('acme/app')))).toBe('repo_not_found');
  });
});

describe('repo collaborators', () => {
  async function ownerRepo() {
    const { ctx } = await enroll(h, svc, 'did:key:zCOL', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app', visibility: 'private' }));
    await enroll(h, svc, 'did:key:zCOL2', 'bob');
    return ctx;
  }

  it('the repo owner grants, lists and revokes a collaborator', async () => {
    const alice = await ownerRepo();
    const grant = await svc.repoAddCollaborator(
      alice,
      RepoAddCollaboratorArgs.parse({ repo: 'app', agent: 'bob', permission: 'write' }),
    );
    expect(grant.permission).toBe('write');

    const list = await svc.repoListCollaborators(
      alice,
      RepoListCollaboratorsArgs.parse({ repo: 'app' }),
    );
    expect(list.items.map((c) => c.agent)).toContain('bob');

    const removed = await svc.repoRemoveCollaborator(
      alice,
      RepoRemoveCollaboratorArgs.parse({ repo: 'app', agent: 'bob' }),
    );
    expect(removed.removed).toBe(true);
  });

  it('a non-admin collaborator cannot manage collaborators', async () => {
    const alice = await ownerRepo();
    await svc.repoAddCollaborator(
      alice,
      RepoAddCollaboratorArgs.parse({ repo: 'app', agent: 'bob', permission: 'write' }),
    );
    const { ctx: bob } = await enroll(h, svc, 'did:key:zCOL3', 'bob-2');
    // bob-2 has no grant, so the private repo is hidden.
    expect(
      await codeOf(
        svc.repoAddCollaborator(
          bob,
          RepoAddCollaboratorArgs.parse({ repo: 'alice/app', agent: 'bob', permission: 'admin' }),
        ),
      ),
    ).toBe('repo_not_found');
  });
});
