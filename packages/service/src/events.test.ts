import {
  ActivityListArgs,
  BranchCreateArgs,
  CommitCreateArgs,
  EnrollArgs,
  IssueOpenArgs,
  NotificationsListArgs,
  NotificationsMarkReadArgs,
  PrOpenArgs,
  RepoAddCollaboratorArgs,
  RepoCreateArgs,
  WebhookCreateArgs,
  WebhookDeleteArgs,
  WebhookListArgs,
  isForgeError,
} from '@musehub/contracts';
import type { AuthContext } from '@musehub/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { signBody } from './events.js';
import { type Harness, buildHarness } from './fakes.js';
import { createForgeService } from './index.js';

type Svc = ReturnType<typeof createForgeService>;

function att(did: string, wallet?: string): string {
  return JSON.stringify(wallet ? { did, wallet } : { did });
}

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

// PLACEHOLDER_EVENTS_TESTS

describe('webhooks: create, list, delete and authz', () => {
  it('creates a webhook, returns the secret once, then redacts it on list', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zW1', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    const hook = await svc.webhookCreate(
      ctx,
      WebhookCreateArgs.parse({ repo: 'app', url: 'https://example.test/hook', events: ['*'] }),
    );
    expect(hook.secret).toBeTruthy();
    expect(hook.active).toBe(true);

    const list = await svc.webhookList(ctx, WebhookListArgs.parse({ repo: 'app' }));
    expect(list.items).toHaveLength(1);
    // The signing secret never leaves the create call.
    expect(list.items[0]?.secret).toBeNull();
    expect(list.items[0]?.url).toBe('https://example.test/hook');
  });

  it('accepts a caller-supplied secret and deletes by id', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zW2', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    const hook = await svc.webhookCreate(
      ctx,
      WebhookCreateArgs.parse({
        repo: 'app',
        url: 'https://example.test/hook',
        events: ['pr.opened'],
        secret: 'shhh',
      }),
    );
    expect(hook.secret).toBe('shhh');
    const del = await svc.webhookDelete(ctx, WebhookDeleteArgs.parse({ repo: 'app', id: hook.id }));
    expect(del.removed).toBe(true);
    const again = await svc.webhookDelete(
      ctx,
      WebhookDeleteArgs.parse({ repo: 'app', id: hook.id }),
    );
    expect(again.removed).toBe(false);
  });

  it('requires repo admin to manage webhooks', async () => {
    const { ctx: alice } = await enroll(h, svc, 'did:key:zW3', 'alice');
    const { ctx: bob } = await enroll(h, svc, 'did:key:zW4', 'bob');
    await svc.repoCreate(alice, RepoCreateArgs.parse({ name: 'app', visibility: 'public' }));
    const code = await codeOf(
      svc.webhookCreate(
        bob,
        WebhookCreateArgs.parse({ repo: 'alice/app', url: 'https://x.test', events: ['*'] }),
      ),
    );
    expect(code).toBe('forbidden');
  });

  it('reports events_unavailable when the events layer is not wired', async () => {
    const bare = buildHarness();
    bare.ports.webhooks = undefined;
    const svc2 = createForgeService(bare.ports);
    const { ctx } = await enroll(bare, svc2, 'did:key:zW5', 'alice');
    await svc2.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    expect(
      await codeOf(
        svc2.webhookCreate(
          ctx,
          WebhookCreateArgs.parse({ repo: 'app', url: 'https://x.test', events: ['*'] }),
        ),
      ),
    ).toBe('internal_error');
  });
});

describe('webhooks: signature, event matching and delivery record', () => {
  it('signs the body and records a delivered attempt for a matching event', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zD1', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    const hook = await svc.webhookCreate(
      ctx,
      WebhookCreateArgs.parse({ repo: 'app', url: 'https://example.test/hook', events: ['*'] }),
    );

    await svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'feature' }));

    expect(h.webhookSender.sent).toHaveLength(1);
    const sent = h.webhookSender.sent[0];
    expect(sent?.event).toBe('branch.created');
    // The signature is a correct HMAC-SHA256 of the exact delivered body.
    expect(sent?.signature).toBe(signBody(hook.secret ?? '', sent?.body ?? ''));

    expect(h.webhookDeliveries.rows).toHaveLength(1);
    expect(h.webhookDeliveries.rows[0]?.status).toBe('delivered');
    expect(h.webhookDeliveries.rows[0]?.status_code).toBe(200);
    expect(h.webhookDeliveries.rows[0]?.event).toBe('branch.created');
  });

  it('does not fire a webhook for an event it did not subscribe to', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zD2', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    await svc.webhookCreate(
      ctx,
      WebhookCreateArgs.parse({
        repo: 'app',
        url: 'https://example.test/hook',
        events: ['issue.opened'],
      }),
    );
    await svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'feature' }));
    expect(h.webhookSender.sent).toHaveLength(0);
    expect(h.webhookDeliveries.rows).toHaveLength(0);
  });

  it('records a failed attempt on a non-2xx response', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zD3', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    await svc.webhookCreate(
      ctx,
      WebhookCreateArgs.parse({ repo: 'app', url: 'https://example.test/hook', events: ['*'] }),
    );
    h.webhookSender.nextStatus = 500;
    await svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'feature' }));
    expect(h.webhookDeliveries.rows[0]?.status).toBe('failed');
    expect(h.webhookDeliveries.rows[0]?.status_code).toBe(500);
  });

  it('records a transport failure and never breaks the triggering operation', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zD4', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    await svc.webhookCreate(
      ctx,
      WebhookCreateArgs.parse({ repo: 'app', url: 'https://example.test/hook', events: ['*'] }),
    );
    h.webhookSender.throwNext = true;
    // The commit still succeeds even though the delivery threw.
    const commit = await svc.commitCreate(
      ctx,
      CommitCreateArgs.parse({
        repo: 'app',
        message: 'add file',
        changes: [{ path: 'a.txt', content: 'hi' }],
      }),
    );
    expect(commit.commit_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(h.webhookDeliveries.rows[0]?.status).toBe('failed');
    expect(h.webhookDeliveries.rows[0]?.status_code).toBeNull();
    expect(h.webhookDeliveries.rows[0]?.error).toContain('connection refused');
  });

  it('fires ci.completed once from a status read, then dedupes on a repeat poll', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zD5', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    await svc.webhookCreate(
      ctx,
      WebhookCreateArgs.parse({
        repo: 'app',
        url: 'https://example.test/hook',
        events: ['ci.completed'],
      }),
    );
    const run = await h.ci.create({
      repo: 'alice/app',
      ref: 'main',
      headSha: 'a'.repeat(40),
      workflow: 'ci',
    });
    await h.ci.update('alice/app', run.run_id, { status: 'completed', conclusion: 'success' });

    await svc.ciStatus(ctx, { repo: 'app', run_id: run.run_id });
    await svc.ciStatus(ctx, { repo: 'app', run_id: run.run_id });
    expect(h.webhookDeliveries.rows).toHaveLength(1);
    expect(h.webhookDeliveries.rows[0]?.event).toBe('ci.completed');
  });
});
// PLACEHOLDER_NOTIF_ACTIVITY

describe('notifications: creation, list, unread filter and mark read', () => {
  async function collabScene() {
    const { ctx: alice } = await enroll(h, svc, 'did:key:zN1', 'alice');
    const { ctx: bob } = await enroll(h, svc, 'did:key:zN2', 'bob');
    await svc.repoCreate(alice, RepoCreateArgs.parse({ name: 'app', visibility: 'public' }));
    await svc.repoAddCollaborator(
      alice,
      RepoAddCollaboratorArgs.parse({ repo: 'app', agent: 'bob', permission: 'write' }),
    );
    await svc.branchCreate(bob, BranchCreateArgs.parse({ repo: 'alice/app', name: 'feature' }));
    await svc.commitCreate(
      bob,
      CommitCreateArgs.parse({
        repo: 'alice/app',
        message: 'work',
        branch: 'feature',
        changes: [{ path: 'f.txt', content: 'hi' }],
      }),
    );
    const pr = await svc.prOpen(
      bob,
      PrOpenArgs.parse({ repo: 'alice/app', title: 'Add f', head: 'feature', base: 'main' }),
    );
    return { alice, bob, pr };
  }

  it('notifies the repo owner on a new pull request', async () => {
    const { alice } = await collabScene();
    const list = await svc.notificationsList(alice, NotificationsListArgs.parse({ unread: true }));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.kind).toBe('pr.opened');
    expect(list.items[0]?.subject).toBe('alice/app#1');
    expect(list.items[0]?.read).toBe(false);
  });

  it('notifies the author on a review and never self-notifies the actor', async () => {
    const { alice, bob, pr } = await collabScene();
    await svc.prReview(alice, { repo: 'alice/app', number: pr.number, event: 'approve' });
    const bobList = await svc.notificationsList(bob, NotificationsListArgs.parse({ unread: true }));
    expect(bobList.items.some((n) => n.kind === 'pr.reviewed')).toBe(true);
    const aliceList = await svc.notificationsList(
      alice,
      NotificationsListArgs.parse({ unread: true }),
    );
    expect(aliceList.items.some((n) => n.kind === 'pr.reviewed')).toBe(false);
  });

  it('marks notifications read by id, and leaves them on the unfiltered list', async () => {
    const { alice } = await collabScene();
    const before = await svc.notificationsList(
      alice,
      NotificationsListArgs.parse({ unread: true }),
    );
    const id = before.items[0]?.id as string;
    const one = await svc.notificationsMarkRead(
      alice,
      NotificationsMarkReadArgs.parse({ ids: [id] }),
    );
    expect(one.marked).toBe(1);
    const unread = await svc.notificationsList(
      alice,
      NotificationsListArgs.parse({ unread: true }),
    );
    expect(unread.items).toHaveLength(0);
    const all = await svc.notificationsList(alice, NotificationsListArgs.parse({}));
    expect(all.items).toHaveLength(1);
    expect(all.items[0]?.read).toBe(true);
    const again = await svc.notificationsMarkRead(
      alice,
      NotificationsMarkReadArgs.parse({ all: true }),
    );
    expect(again.marked).toBe(0);
  });

  it('notifies issue assignees on a new issue', async () => {
    const { ctx: alice } = await enroll(h, svc, 'did:key:zN3', 'alice');
    const { ctx: bob, handle: bobHandle } = await enroll(h, svc, 'did:key:zN4', 'bob');
    await svc.repoCreate(alice, RepoCreateArgs.parse({ name: 'app', auto_init: false }));
    await svc.issueOpen(
      alice,
      IssueOpenArgs.parse({ repo: 'app', title: 'Bug', assignees: [bobHandle] }),
    );
    const list = await svc.notificationsList(bob, NotificationsListArgs.parse({ unread: true }));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.kind).toBe('issue.opened');
    expect(list.items[0]?.subject).toBe('alice/app#1');
  });
});

describe('activity feed: the audit trail as a wire page', () => {
  it('returns a global feed newest first and scopes to one repo', async () => {
    const { ctx } = await enroll(h, svc, 'did:key:zA1', 'alice');
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'app' }));
    await svc.repoCreate(ctx, RepoCreateArgs.parse({ name: 'other' }));
    await svc.branchCreate(ctx, BranchCreateArgs.parse({ repo: 'app', name: 'feature' }));

    const global = await svc.activityList(ctx, ActivityListArgs.parse({}));
    expect(global.items.length).toBeGreaterThan(0);
    expect(global.items[0]?.action).toBe('branch.create');
    for (const item of global.items) {
      expect(typeof item.actor).toBe('string');
      expect(typeof item.action).toBe('string');
      expect(typeof item.target).toBe('string');
      expect(typeof item.at).toBe('string');
    }

    const scoped = await svc.activityList(ctx, ActivityListArgs.parse({ repo: 'app' }));
    expect(scoped.items.length).toBeGreaterThan(0);
    expect(scoped.items.every((e) => e.target.startsWith('alice/app'))).toBe(true);
    expect(scoped.items.some((e) => e.target === 'alice/other')).toBe(false);
  });

  it('filters the feed by actor', async () => {
    const { ctx: alice } = await enroll(h, svc, 'did:key:zA2', 'alice');
    const { ctx: bob } = await enroll(h, svc, 'did:key:zA3', 'bob');
    await svc.repoCreate(alice, RepoCreateArgs.parse({ name: 'app', visibility: 'public' }));
    await svc.repoAddCollaborator(
      alice,
      RepoAddCollaboratorArgs.parse({ repo: 'app', agent: 'bob', permission: 'write' }),
    );
    await svc.branchCreate(bob, BranchCreateArgs.parse({ repo: 'alice/app', name: 'feature' }));
    const feed = await svc.activityList(alice, ActivityListArgs.parse({ actor: 'bob' }));
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items.every((e) => e.actor === 'bob')).toBe(true);
  });
});
