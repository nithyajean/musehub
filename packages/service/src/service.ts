// @musehub/service - the ForgeService implementation over the @musehub/core
// ports. The brain of the forge: the agent-only gate at enroll, the read/write
// authorization model, the "green and reviewed before merge" gate, idempotent
// creates and deletes, optimistic concurrency, the audit trail, and the wire
// response shapes. Both the REST API and the MCP server call this one class, so
// every policy decision happens here exactly once. See R6 for the operation
// semantics and the error catalog.

import type {
  ActivityListArgs,
  Agent,
  AuditEvent,
  Branch,
  BranchCreateArgs,
  BranchSwitchArgs,
  CiLogsArgs,
  CiRun,
  CiRunArgs,
  CiStatusArgs,
  Collaborator,
  CommitCreateArgs,
  DiffGetArgs,
  EnrollArgs,
  FileReadArgs,
  FileWriteArgs,
  Issue,
  IssueCloseArgs,
  IssueCommentArgs,
  IssueListArgs,
  IssueOpenArgs,
  IssueReopenArgs,
  Membership,
  Notification,
  NotificationsListArgs,
  NotificationsMarkReadArgs,
  Org,
  OrgAddMemberArgs,
  OrgCreateArgs,
  OrgGetArgs,
  OrgListArgs,
  OrgRemoveMemberArgs,
  PrCommentArgs,
  PrGetArgs,
  PrListArgs,
  PrMergeArgs,
  PrOpenArgs,
  PrReviewArgs,
  PullRequest,
  Release,
  ReleaseCreateArgs,
  ReleaseDeleteArgs,
  ReleaseGetArgs,
  ReleaseListArgs,
  Repo,
  RepoAddCollaboratorArgs,
  RepoCreateArgs,
  RepoDeleteArgs,
  RepoGetArgs,
  RepoListArgs,
  RepoListCollaboratorsArgs,
  RepoRemoveCollaboratorArgs,
  Review,
  SearchCodeArgs,
  SearchIssuesArgs,
  SearchReposArgs,
  Team,
  TeamAddMemberArgs,
  TeamCreateArgs,
  TeamMember,
  TreeReadArgs,
  Webhook,
  WebhookCreateArgs,
  WebhookDeleteArgs,
  WebhookDeliveryStatus,
  WebhookListArgs,
} from '@musehub/contracts';
import { normalizeRepoSpec } from '@musehub/core';
import type {
  AuthContext,
  BranchResult,
  CodeHit,
  CommitChange,
  CommitResult,
  DiffResult,
  EnrollResult,
  FileResult,
  ForgeEvent,
  ForgeService,
  IssueHit,
  MergeResult,
  OrgDetail,
  Ports,
  PrDetail,
  RepoDetail,
  TreeResult,
  WebhookSender,
  WirePage,
} from '@musehub/core';
import {
  type RepoRef,
  loadRepoForAdmin,
  loadRepoForRead,
  loadRepoForWrite,
  toWireRepo,
} from './authz.js';
import {
  branchExists,
  branchNotFound,
  checksFailed,
  checksPending,
  ciRunNotFound,
  collaborationUnavailable,
  confirmationMismatch,
  eventsUnavailable,
  fileNotFound,
  forbiddenHuman,
  forbiddenOrg,
  forbiddenRepo,
  handleTaken,
  issueNotFound,
  mergeConflict,
  orgNotFound,
  prExists,
  prNotFound,
  releaseExists,
  releaseNotFound,
  releasesUnavailable,
  repoExists,
  repoNotFound,
  reviewRequired,
  staleBlob,
  staleRef,
  teamNotFound,
  validationFailed,
} from './errors.js';
import {
  createFetchSender,
  generateSecret,
  recipientsFor,
  signBody,
  targetInRepo,
} from './events.js';
import { mergeableState, reviewState, summarizeChecks } from './merge-gate.js';
import { decodeCursor, pageSlice, toWirePage } from './pagination.js';
import { searchCode, searchIssues, searchRepos } from './search.js';

class ForgeServiceImpl implements ForgeService {
  private readonly sender: WebhookSender;
  /** Runs that already emitted ci.completed, so a repeated ciStatus poll fires once. */
  private readonly ciCompletedEmitted = new Set<string>();

  constructor(private readonly ports: Ports) {
    this.sender = ports.webhookSender ?? createFetchSender();
  }

  // --- helpers ------------------------------------------------------------

  private async audit(
    actor: string,
    action: string,
    target: string,
    metadata: Record<string, unknown> | null,
  ): Promise<void> {
    await this.ports.audit.append({ actor, action, target, metadata });
  }

  /**
   * Fan an emitted domain event out to webhooks and notifications. Best-effort by
   * contract: any failure here is swallowed so the mutation that fired the event
   * always succeeds. Does nothing when the events layer is not wired.
   */
  private async emit(event: ForgeEvent): Promise<void> {
    try {
      await this.deliverWebhooks(event);
    } catch {
      // A webhook fan-out failure never breaks the operation that fired the event.
    }
    try {
      await this.createNotifications(event);
    } catch {
      // A notification failure never breaks the operation that fired the event.
    }
  }

  /** POST the event to every active, matching webhook and record each attempt. */
  private async deliverWebhooks(event: ForgeEvent): Promise<void> {
    const { webhooks, webhookDeliveries } = this.ports;
    if (!webhooks || !webhookDeliveries) {
      return;
    }
    const hooks = await webhooks.listActiveForEvent(event.repo, event.type);
    if (hooks.length === 0) {
      return;
    }
    const at = this.ports.clock.now().toISOString();
    const body = JSON.stringify({
      event: event.type,
      repo: event.repo,
      actor: event.actor,
      target: event.target,
      payload: event.payload,
      delivered_at: at,
    });
    for (const hook of hooks) {
      const signature = signBody(hook.secret ?? '', body);
      const deliveryId = this.ports.ids.newId('whd');
      let status: WebhookDeliveryStatus = 'failed';
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const res = await this.sender.send({
          url: hook.url,
          body,
          signature,
          event: event.type,
          deliveryId,
        });
        statusCode = res.statusCode;
        status = res.statusCode >= 200 && res.statusCode < 300 ? 'delivered' : 'failed';
        if (status === 'failed') {
          error = `endpoint responded ${res.statusCode}`;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await webhookDeliveries.record({
        webhookId: hook.id,
        repo: event.repo,
        event: event.type,
        status,
        statusCode,
        error,
      });
    }
  }

  /** Create one notification per recipient the event concerns, minus the actor. */
  private async createNotifications(event: ForgeEvent): Promise<void> {
    const { notifications } = this.ports;
    if (!notifications) {
      return;
    }
    const seen = new Set<string>();
    for (const recipient of recipientsFor(event)) {
      if (recipient === event.actor || seen.has(recipient)) {
        continue;
      }
      seen.add(recipient);
      await notifications.create({
        recipient,
        kind: event.type,
        subject: event.target,
      });
    }
  }

  /** The webhook store, or a clear error when the events layer was not wired. */
  private requireWebhooks() {
    if (!this.ports.webhooks) {
      throw eventsUnavailable();
    }
    return this.ports.webhooks;
  }

  /** The notification store, or a clear error when the events layer was not wired. */
  private requireNotifications() {
    if (!this.ports.notifications) {
      throw eventsUnavailable();
    }
    return this.ports.notifications;
  }

  /** The release store, or a clear error when the server was built without it. */
  private requireReleases() {
    if (!this.ports.releases) {
      throw releasesUnavailable();
    }
    return this.ports.releases;
  }

  /** The branch a write targets: explicit arg, else the session working branch, else the repo default. */
  private async resolveWriteBranch(
    ctx: AuthContext,
    ref: RepoRef,
    explicit: string | undefined,
  ): Promise<string> {
    if (explicit) {
      return explicit;
    }
    const working = await this.ports.sessions.getWorkingBranch(ctx.agent.id, ref.fullName);
    return working ?? ref.repo.default_branch;
  }

  /** Resolve a ref to a SHA: a 40-char SHA passes through, a branch name is looked up. */
  private async resolveSha(ref: RepoRef, refName: string): Promise<string | null> {
    if (/^[0-9a-f]{40}$/.test(refName)) {
      return refName;
    }
    return this.ports.git.getBranchHead(ref.owner, ref.name, refName);
  }

  /** Derive a free handle from the agent did when the caller did not pick one. */
  private async uniqueHandle(did: string): Promise<string> {
    const tail = did.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const base = `muse-${tail.slice(-8) || 'agent'}`;
    let candidate = base;
    let n = 1;
    while (await this.isHandleTaken(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    return candidate;
  }

  /** A handle is taken when either an agent or an org already holds it (one namespace). */
  private async isHandleTaken(handle: string): Promise<boolean> {
    if (await this.ports.agents.handleTaken(handle)) {
      return true;
    }
    if (this.ports.orgs && (await this.ports.orgs.handleTaken(handle))) {
      return true;
    }
    return false;
  }

  /** The collaboration stores, or a clear error when the server was built without them. */
  private collab() {
    const { orgs, orgMembers, teams, teamMembers, collaborators } = this.ports;
    if (!orgs || !orgMembers || !teams || !teamMembers || !collaborators) {
      throw collaborationUnavailable();
    }
    return { orgs, orgMembers, teams, teamMembers, collaborators };
  }

  /** Load an org by handle or raise org-not-found. */
  private async requireOrg(handle: string): Promise<Org> {
    const org = await this.collab().orgs.getByHandle(handle);
    if (!org) {
      throw orgNotFound(handle);
    }
    return org;
  }

  /** Require the caller to be an owner or admin of the org. */
  private async requireOrgAdmin(ctx: AuthContext, org: string): Promise<void> {
    const membership = await this.collab().orgMembers.get(org, ctx.agent.handle);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw forbiddenOrg(org);
    }
  }

  // --- onboarding ---------------------------------------------------------

  async enroll(args: EnrollArgs): Promise<EnrollResult> {
    // THE GATE. Only a verified Muse agent is admitted. A human or an unverifiable
    // caller is refused here, before any account exists. The verifier is pluggable
    // (R2): the default is MuseHub-owned because Meta ships no third-party agent
    // attestation today. It does NOT stop a human puppeteering a genuinely enrolled
    // agent; that is stated plainly in the product.
    const attestation = await this.ports.attestation.verify(args.muse_attestation);
    if (!attestation.ok || !attestation.did) {
      throw forbiddenHuman(attestation.reason);
    }
    const did = attestation.did;

    const existing = await this.ports.agents.getByDid(did);
    if (existing) {
      // Idempotent per identity. Always mint a token so the caller has a usable
      // Bearer. rotate_token asks to revoke the prior token, but no port enumerates
      // an agent's live tokens, so the prior one is not revoked here. Flagged: a
      // real rotation needs a token registry (or a SessionStore token list).
      const minted = await this.ports.identity.mintToken(existing.id);
      await this.audit(existing.handle, 'agent.reenroll', existing.handle, {
        did,
        rotate_requested: args.rotate_token,
      });
      return {
        agent: existing,
        token: minted.token,
        token_expires_at: minted.expiresAt,
        is_new: false,
      };
    }

    let handle: string;
    if (args.handle) {
      if (await this.isHandleTaken(args.handle)) {
        throw validationFailed(
          `Handle '${args.handle}' is already taken.`,
          'Choose another handle, or omit it to get a generated one.',
          { field: 'handle' },
        );
      }
      handle = args.handle;
    } else {
      handle = await this.uniqueHandle(did);
    }

    const agent = await this.ports.agents.create({
      handle,
      displayName: args.display_name ?? null,
      did,
      walletAddress: attestation.walletAddress ?? null,
    });
    const minted = await this.ports.identity.mintToken(agent.id);
    await this.audit(agent.handle, 'agent.enroll', agent.handle, {
      did,
      is_new: true,
      wallet_bound: attestation.walletAddress !== undefined,
    });
    return { agent, token: minted.token, token_expires_at: minted.expiresAt, is_new: true };
  }

  async whoami(ctx: AuthContext): Promise<{ agent: Agent; token_expires_at: string | null }> {
    // The service has ctx from the verified token but no port to look up its
    // expiry, so token_expires_at is null here. Flagged if an expiry read is wanted.
    return { agent: ctx.agent, token_expires_at: null };
  }

  // --- repositories -------------------------------------------------------

  async repoCreate(
    ctx: AuthContext,
    args: RepoCreateArgs,
  ): Promise<Repo & { unchanged?: boolean }> {
    const owner = args.owner ?? ctx.agent.handle;
    // Creating under an org: the org must exist and the caller must administer it.
    // Creating under one's own handle is the default and needs no org lookup.
    if (owner !== ctx.agent.handle) {
      await this.requireOrg(owner);
      await this.requireOrgAdmin(ctx, owner);
    }
    const fullName = `${owner}/${args.name}`;
    const existing = await this.ports.repos.get(owner, args.name);
    if (existing) {
      if (args.if_exists === 'ok') {
        return { ...toWireRepo(this.ports.config, existing), unchanged: true };
      }
      throw repoExists(fullName);
    }
    const stored = await this.ports.repos.create({
      owner,
      name: args.name,
      visibility: args.visibility,
      description: args.description,
      defaultBranch: args.default_branch,
    });
    await this.ports.git.initRepo(owner, args.name, { defaultBranch: args.default_branch });
    let empty = true;
    if (args.auto_init) {
      const changes: CommitChange[] = [
        {
          path: 'README.md',
          op: 'write',
          encoding: 'text',
          content: `# ${args.name}\n\n${args.description}\n`,
        },
      ];
      if (args.license !== undefined) {
        changes.push({
          path: 'LICENSE',
          op: 'write',
          encoding: 'text',
          content: `SPDX-License-Identifier: ${args.license}\n`,
        });
      }
      await this.ports.git.createCommit({
        owner,
        name: args.name,
        branch: args.default_branch,
        message: 'Initial commit',
        author: ctx.agent.handle,
        changes,
      });
      await this.ports.repos.setEmpty(owner, args.name, false);
      empty = false;
    }
    await this.audit(ctx.agent.handle, 'repo.create', fullName, {
      owner,
      visibility: args.visibility,
      auto_init: args.auto_init,
    });
    await this.emit({
      type: 'repo.created',
      repo: fullName,
      actor: ctx.agent.handle,
      target: fullName,
      payload: { owner, visibility: args.visibility },
    });
    return toWireRepo(this.ports.config, { ...stored, empty });
  }

  async repoList(ctx: AuthContext, args: RepoListArgs): Promise<WirePage<Repo>> {
    const targetOwner = args.owner ?? ctx.agent.handle;
    const isSelf = targetOwner === ctx.agent.handle;
    // A caller listing another agent's repos sees public ones only.
    const visibility = isSelf ? args.visibility : 'public';
    const page = await this.ports.repos.list({
      owner: targetOwner,
      visibility,
      cursor: args.cursor,
      limit: args.limit,
    });
    return {
      items: page.items.map((repo) => toWireRepo(this.ports.config, repo)),
      next_cursor: page.nextCursor,
      ...(page.total !== undefined ? { total: page.total } : {}),
    };
  }

  async repoGet(ctx: AuthContext, args: RepoGetArgs): Promise<RepoDetail> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const headSha = await this.ports.git.getBranchHead(
      ref.owner,
      ref.name,
      ref.repo.default_branch,
    );
    const prs = await this.ports.pulls.list({ repo: ref.fullName, state: 'open', limit: 100 });
    const issues = await this.ports.issues.list({ repo: ref.fullName, state: 'open', limit: 100 });
    return {
      ...toWireRepo(this.ports.config, ref.repo),
      head_sha: headSha,
      open_pr_count: prs.total ?? prs.items.length,
      open_issue_count: issues.total ?? issues.items.length,
    };
  }

  async repoDelete(ctx: AuthContext, args: RepoDeleteArgs): Promise<{ unchanged: boolean }> {
    const { owner, name, fullName } = normalizeRepoSpec(ctx.agent.handle, args.repo);
    const stored = await this.ports.repos.get(owner, name);
    // Idempotent: deleting an absent repo is a no-op, so a retry after a partial
    // failure is safe.
    if (!stored) {
      return { unchanged: true };
    }
    if (stored.owner !== ctx.agent.handle) {
      if (stored.visibility === 'private') {
        throw repoNotFound(fullName);
      }
      throw forbiddenRepo(fullName);
    }
    if (args.confirm !== fullName) {
      throw confirmationMismatch(fullName);
    }
    await this.ports.git.deleteRepo(owner, name);
    await this.ports.repos.delete(owner, name);
    await this.audit(ctx.agent.handle, 'repo.delete', fullName, null);
    await this.emit({
      type: 'repo.deleted',
      repo: fullName,
      actor: ctx.agent.handle,
      target: fullName,
      payload: { owner },
    });
    return { unchanged: false };
  }

  // --- files and commits --------------------------------------------------

  async treeRead(ctx: AuthContext, args: TreeReadArgs): Promise<TreeResult> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const refName = args.ref ?? ref.repo.default_branch;
    const tree = await this.ports.git.readTree(
      ref.owner,
      ref.name,
      refName,
      args.path,
      args.recursive,
    );
    return { ref: refName, sha: tree.sha, entries: tree.entries, truncated: tree.truncated };
  }

  async fileRead(ctx: AuthContext, args: FileReadArgs): Promise<FileResult> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const refName = args.ref ?? ref.repo.default_branch;
    const file = await this.ports.git.readFile(
      ref.owner,
      ref.name,
      refName,
      args.path,
      args.max_bytes,
    );
    if (file === null) {
      throw fileNotFound(ref.fullName, args.path, refName);
    }
    // The git port returns text content, so a base64 request re-encodes that text.
    // A binary-safe read needs a byte-returning port. Flagged, not blocking.
    const content =
      args.encoding === 'base64'
        ? Buffer.from(file.content, 'utf8').toString('base64')
        : file.content;
    return {
      path: args.path,
      ref: refName,
      sha: file.sha,
      size: file.size,
      encoding: args.encoding,
      content,
      truncated: file.truncated,
    };
  }

  /** The atomic write. A moved tip is stale_ref, a no-op tree returns unchanged. */
  private async performCommit(
    ctx: AuthContext,
    ref: RepoRef,
    opts: {
      branch: string;
      message: string;
      changes: CommitChange[];
      expectedHead: string | undefined;
      createBranchFrom: string | undefined;
    },
  ): Promise<CommitResult> {
    const result = await this.ports.git.createCommit({
      owner: ref.owner,
      name: ref.name,
      branch: opts.branch,
      message: opts.message,
      author: ctx.agent.handle,
      changes: opts.changes,
      expectedHead: opts.expectedHead,
      createBranchFrom: opts.createBranchFrom,
    });
    if (result === null) {
      const current = await this.ports.git.getBranchHead(ref.owner, ref.name, opts.branch);
      throw staleRef(opts.branch, current);
    }
    if (!result.unchanged) {
      await this.audit(ctx.agent.handle, 'commit.create', `${ref.fullName}@${opts.branch}`, {
        commit_sha: result.sha,
        files_changed: result.filesChanged,
      });
      await this.emit({
        type: 'commit.created',
        repo: ref.fullName,
        actor: ctx.agent.handle,
        target: `${ref.fullName}@${opts.branch}`,
        payload: {
          commit_sha: result.sha,
          branch: opts.branch,
          files_changed: result.filesChanged,
        },
      });
    }
    return {
      commit_sha: result.sha,
      branch: opts.branch,
      parents: result.parents,
      tree_sha: result.treeSha,
      files_changed: result.filesChanged,
      unchanged: result.unchanged,
    };
  }

  async commitCreate(ctx: AuthContext, args: CommitCreateArgs): Promise<CommitResult> {
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const branch = await this.resolveWriteBranch(ctx, ref, args.branch);
    const changes: CommitChange[] = args.changes.map((change) => {
      if (change.op === 'write' && change.content === undefined) {
        throw validationFailed(
          `Change for '${change.path}' is a write but carries no content.`,
          'Set content for every write change, or use op delete.',
          { path: change.path },
        );
      }
      return {
        path: change.path,
        op: change.op,
        encoding: change.encoding,
        ...(change.content !== undefined ? { content: change.content } : {}),
      };
    });
    return this.performCommit(ctx, ref, {
      branch,
      message: args.message,
      changes,
      expectedHead: args.expected_head,
      createBranchFrom: args.create_branch_from,
    });
  }

  async fileWrite(ctx: AuthContext, args: FileWriteArgs): Promise<CommitResult> {
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const branch = await this.resolveWriteBranch(ctx, ref, args.branch);
    if (args.expected_blob_sha !== undefined) {
      // Blob-level optimistic concurrency: refuse if the file has moved since read.
      const current = await this.ports.git.readFile(ref.owner, ref.name, branch, args.path, 1);
      const currentSha = current?.sha ?? null;
      if (currentSha !== args.expected_blob_sha) {
        throw staleBlob(args.path, currentSha);
      }
    }
    const change: CommitChange = {
      path: args.path,
      op: 'write',
      content: args.content,
      encoding: args.encoding,
    };
    return this.performCommit(ctx, ref, {
      branch,
      message: args.message ?? `Update ${args.path}`,
      changes: [change],
      expectedHead: undefined,
      createBranchFrom: undefined,
    });
  }

  async branchCreate(ctx: AuthContext, args: BranchCreateArgs): Promise<BranchResult> {
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const existing = await this.ports.git.getBranchHead(ref.owner, ref.name, args.name);
    if (existing !== null) {
      if (args.if_exists === 'ok') {
        return { branch: args.name, head_sha: existing, created: false };
      }
      throw branchExists(ref.fullName, args.name, existing);
    }
    const fromRef = args.from_ref ?? ref.repo.default_branch;
    const fromSha = await this.resolveSha(ref, fromRef);
    if (fromSha === null) {
      throw branchNotFound(ref.fullName, fromRef);
    }
    const head = await this.ports.git.createBranch(ref.owner, ref.name, args.name, fromSha);
    await this.audit(ctx.agent.handle, 'branch.create', `${ref.fullName}@${args.name}`, {
      from: fromRef,
      head_sha: head,
    });
    await this.emit({
      type: 'branch.created',
      repo: ref.fullName,
      actor: ctx.agent.handle,
      target: `${ref.fullName}@${args.name}`,
      payload: { branch: args.name, from: fromRef, head_sha: head },
    });
    return { branch: args.name, head_sha: head, created: true };
  }

  async branchSwitch(
    ctx: AuthContext,
    args: BranchSwitchArgs,
  ): Promise<{ repo: string; branch: string }> {
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const head = await this.ports.git.getBranchHead(ref.owner, ref.name, args.branch);
    if (head === null) {
      if (args.create_from !== undefined) {
        const fromSha = await this.resolveSha(ref, args.create_from);
        if (fromSha === null) {
          throw branchNotFound(ref.fullName, args.create_from);
        }
        await this.ports.git.createBranch(ref.owner, ref.name, args.branch, fromSha);
        await this.audit(ctx.agent.handle, 'branch.create', `${ref.fullName}@${args.branch}`, {
          from: args.create_from,
        });
      } else {
        throw branchNotFound(ref.fullName, args.branch);
      }
    }
    await this.ports.sessions.setWorkingBranch(ctx.agent.id, ref.fullName, args.branch);
    await this.audit(ctx.agent.handle, 'branch.switch', `${ref.fullName}@${args.branch}`, null);
    return { repo: ref.fullName, branch: args.branch };
  }

  async diffGet(ctx: AuthContext, args: DiffGetArgs): Promise<DiffResult> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    let base: string;
    let head: string;
    if (args.pull_number !== undefined) {
      const pr = await this.ports.pulls.get(ref.fullName, args.pull_number);
      if (!pr) {
        throw prNotFound(ref.fullName, args.pull_number);
      }
      base = pr.base;
      head = pr.head;
    } else if (args.base !== undefined && args.head !== undefined) {
      base = args.base;
      head = args.head;
    } else {
      throw validationFailed(
        'Provide base and head, or a pull_number.',
        'Set base and head to two refs, or set pull_number to a pull request.',
        { fields: ['base', 'head', 'pull_number'] },
      );
    }
    const diff = await this.ports.git.diff(
      ref.owner,
      ref.name,
      base,
      head,
      args.format,
      args.max_bytes,
    );
    return {
      base_sha: diff.baseSha,
      head_sha: diff.headSha,
      files: diff.files,
      truncated: diff.truncated,
      ...(diff.patch !== undefined ? { patch: diff.patch } : {}),
    };
  }

  // --- pull requests ------------------------------------------------------

  async prOpen(ctx: AuthContext, args: PrOpenArgs): Promise<PullRequest> {
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const base = args.base ?? ref.repo.default_branch;
    const headSha = await this.ports.git.getBranchHead(ref.owner, ref.name, args.head);
    if (headSha === null) {
      throw branchNotFound(ref.fullName, args.head);
    }
    const baseSha = await this.ports.git.getBranchHead(ref.owner, ref.name, base);
    if (baseSha === null) {
      throw branchNotFound(ref.fullName, base);
    }
    if (args.head === base) {
      throw validationFailed(
        'Head and base must be different branches.',
        'Open the pull request from a branch other than the base.',
        { head: args.head, base },
      );
    }
    const existing = await this.ports.pulls.findOpenByHeadBase(ref.fullName, args.head, base);
    if (existing) {
      throw prExists(existing.number);
    }
    const pr = await this.ports.pulls.create({
      repo: ref.fullName,
      author: ctx.agent.handle,
      title: args.title,
      body: args.body ?? null,
      head: args.head,
      base,
      draft: args.draft,
      headSha,
    });
    await this.audit(ctx.agent.handle, 'pr.open', `${ref.fullName}#${pr.number}`, {
      head: args.head,
      base,
    });
    await this.emit({
      type: 'pr.opened',
      repo: ref.fullName,
      actor: ctx.agent.handle,
      target: `${ref.fullName}#${pr.number}`,
      payload: {
        number: pr.number,
        head: args.head,
        base,
        author: pr.author,
        owner: ref.repo.owner,
      },
    });
    return pr;
  }

  async prList(ctx: AuthContext, args: PrListArgs): Promise<WirePage<PullRequest>> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const page = await this.ports.pulls.list({
      repo: ref.fullName,
      state: args.state,
      base: args.base,
      head: args.head,
      cursor: args.cursor,
      limit: args.limit,
    });
    return toWirePage(page);
  }

  async prGet(ctx: AuthContext, args: PrGetArgs): Promise<PrDetail> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const pr = await this.ports.pulls.get(ref.fullName, args.number);
    if (!pr) {
      throw prNotFound(ref.fullName, args.number);
    }
    const canMerge = await this.ports.git.canMerge(ref.owner, ref.name, pr.base, pr.head);
    const runs = await this.ports.ci.findByHeadSha(ref.fullName, pr.head_sha);
    const checks = summarizeChecks(runs);
    const approved = await this.ports.reviews.hasApproval(ref.fullName, pr.number);
    return {
      ...pr,
      mergeable: canMerge,
      mergeable_state: mergeableState(canMerge, checks.state, approved),
      required_checks: checks.checks,
      review_state: reviewState(approved),
      // No port exposes ahead/behind, so behind_by is reported as 0. Flagged.
      behind_by: 0,
    };
  }

  async prComment(ctx: AuthContext, args: PrCommentArgs): Promise<{ ok: true }> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const pr = await this.ports.pulls.get(ref.fullName, args.number);
    if (!pr) {
      throw prNotFound(ref.fullName, args.number);
    }
    await this.ports.reviews.addComment({
      repo: ref.fullName,
      prNumber: args.number,
      author: ctx.agent.handle,
      body: args.body,
      ...(args.path !== undefined ? { path: args.path } : {}),
      ...(args.line !== undefined ? { line: args.line } : {}),
    });
    await this.audit(ctx.agent.handle, 'pr.comment', `${ref.fullName}#${args.number}`, null);
    return { ok: true };
  }

  async prReview(ctx: AuthContext, args: PrReviewArgs): Promise<Review> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const pr = await this.ports.pulls.get(ref.fullName, args.number);
    if (!pr) {
      throw prNotFound(ref.fullName, args.number);
    }
    // Self-approval is possible in this build (an agent can approve its own PR).
    // The stated guardrail is required CI plus branch protection, not a human. A
    // no-self-approval policy is a future gate on top of this.
    const review = await this.ports.reviews.create({
      repo: ref.fullName,
      prNumber: args.number,
      reviewer: ctx.agent.handle,
      event: args.event,
      body: args.body ?? null,
    });
    if (args.comments) {
      for (const comment of args.comments) {
        await this.ports.reviews.addComment({
          repo: ref.fullName,
          prNumber: args.number,
          author: ctx.agent.handle,
          body: comment.body,
          path: comment.path,
          line: comment.line,
        });
      }
    }
    await this.audit(ctx.agent.handle, 'pr.review', `${ref.fullName}#${args.number}`, {
      event: args.event,
    });
    await this.emit({
      type: 'pr.reviewed',
      repo: ref.fullName,
      actor: ctx.agent.handle,
      target: `${ref.fullName}#${args.number}`,
      payload: {
        number: pr.number,
        event: args.event,
        author: pr.author,
        reviewer: ctx.agent.handle,
      },
    });
    return review;
  }

  async prMerge(ctx: AuthContext, args: PrMergeArgs): Promise<MergeResult> {
    // THE CORE RULE: green and reviewed before merge. The gate runs in this order,
    // each with its matching error, so a blocked merge tells the agent exactly what
    // to fix next. Merge is exposed to agents; the guardrail is required CI plus an
    // approving review, not a human.
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const pr = await this.ports.pulls.get(ref.fullName, args.number);
    if (!pr) {
      throw prNotFound(ref.fullName, args.number);
    }

    // 1. Already merged: idempotent. The merge commit is not stored on the PR, so
    //    report the base tip, which is the merge commit for merge and squash.
    if (pr.state === 'merged') {
      const baseHead = await this.ports.git.getBranchHead(ref.owner, ref.name, pr.base);
      return { merged: true, merge_sha: baseHead ?? '', already_merged: true };
    }
    if (pr.state === 'closed') {
      throw validationFailed(
        `Pull request #${pr.number} is closed.`,
        'Open a new pull request for these changes.',
        { number: pr.number },
      );
    }

    // 2. Required checks must exist, have finished and be green.
    const runs = await this.ports.ci.findByHeadSha(ref.fullName, pr.head_sha);
    const checks = summarizeChecks(runs);
    if (checks.state === 'none' || checks.state === 'pending') {
      throw checksPending(pr.head_sha);
    }
    if (checks.state === 'failed') {
      throw checksFailed(pr.head_sha);
    }

    // 3. An approving review is required.
    const approved = await this.ports.reviews.hasApproval(ref.fullName, pr.number);
    if (!approved) {
      throw reviewRequired(pr.number);
    }

    // 4. The tip must be the SHA the caller expects.
    if (args.expected_head !== undefined && args.expected_head !== pr.head_sha) {
      throw staleRef(pr.head, pr.head_sha);
    }

    // 5. The branch must still apply cleanly.
    const clean = await this.ports.git.canMerge(ref.owner, ref.name, pr.base, pr.head);
    if (!clean) {
      throw mergeConflict(pr.number);
    }

    // 6. Merge.
    const message =
      args.commit_message ??
      args.commit_title ??
      `Merge pull request #${pr.number} from ${pr.head}`;
    const merged = await this.ports.git.merge({
      owner: ref.owner,
      name: ref.name,
      base: pr.base,
      head: pr.head,
      method: args.method,
      message,
      author: ctx.agent.handle,
    });
    await this.ports.pulls.setState(ref.fullName, pr.number, 'merged');
    if (args.delete_branch) {
      await this.ports.git.deleteBranch(ref.owner, ref.name, pr.head);
    }
    await this.audit(ctx.agent.handle, 'pr.merge', `${ref.fullName}#${pr.number}`, {
      method: args.method,
      merge_sha: merged.mergeSha,
    });
    await this.emit({
      type: 'pr.merged',
      repo: ref.fullName,
      actor: ctx.agent.handle,
      target: `${ref.fullName}#${pr.number}`,
      payload: {
        number: pr.number,
        method: args.method,
        merge_sha: merged.mergeSha,
        author: pr.author,
      },
    });
    return { merged: true, merge_sha: merged.mergeSha, already_merged: false };
  }

  // --- issues -------------------------------------------------------------

  async issueOpen(ctx: AuthContext, args: IssueOpenArgs): Promise<Issue> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const issue = await this.ports.issues.create({
      repo: ref.fullName,
      author: ctx.agent.handle,
      title: args.title,
      body: args.body ?? null,
      labels: args.labels ?? [],
      assignees: args.assignees ?? [],
    });
    await this.audit(ctx.agent.handle, 'issue.open', `${ref.fullName}#${issue.number}`, null);
    await this.emit({
      type: 'issue.opened',
      repo: ref.fullName,
      actor: ctx.agent.handle,
      target: `${ref.fullName}#${issue.number}`,
      payload: { number: issue.number, author: issue.author, assignees: issue.assignees },
    });
    return issue;
  }

  async issueList(ctx: AuthContext, args: IssueListArgs): Promise<WirePage<Issue>> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const page = await this.ports.issues.list({
      repo: ref.fullName,
      state: args.state,
      labels: args.labels,
      assignee: args.assignee,
      cursor: args.cursor,
      limit: args.limit,
    });
    return toWirePage(page);
  }

  async issueComment(ctx: AuthContext, args: IssueCommentArgs): Promise<{ ok: true }> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const issue = await this.ports.issues.get(ref.fullName, args.number);
    if (!issue) {
      throw issueNotFound(ref.fullName, args.number);
    }
    await this.ports.issues.addComment(ref.fullName, args.number, ctx.agent.handle, args.body);
    await this.audit(ctx.agent.handle, 'issue.comment', `${ref.fullName}#${args.number}`, null);
    return { ok: true };
  }

  async issueClose(ctx: AuthContext, args: IssueCloseArgs): Promise<{ unchanged: boolean }> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const issue = await this.ports.issues.get(ref.fullName, args.number);
    if (!issue) {
      throw issueNotFound(ref.fullName, args.number);
    }
    // The repo owner or the issue author may change its state.
    if (ctx.agent.handle !== ref.repo.owner && ctx.agent.handle !== issue.author) {
      throw forbiddenRepo(ref.fullName);
    }
    if (issue.state === 'closed') {
      return { unchanged: true };
    }
    if (args.comment !== undefined) {
      await this.ports.issues.addComment(ref.fullName, args.number, ctx.agent.handle, args.comment);
    }
    await this.ports.issues.setState(ref.fullName, args.number, 'closed');
    await this.audit(ctx.agent.handle, 'issue.close', `${ref.fullName}#${args.number}`, {
      state_reason: args.state_reason,
    });
    await this.emit({
      type: 'issue.closed',
      repo: ref.fullName,
      actor: ctx.agent.handle,
      target: `${ref.fullName}#${args.number}`,
      payload: {
        number: issue.number,
        author: issue.author,
        assignees: issue.assignees,
        state_reason: args.state_reason,
      },
    });
    return { unchanged: false };
  }

  async issueReopen(ctx: AuthContext, args: IssueReopenArgs): Promise<{ unchanged: boolean }> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const issue = await this.ports.issues.get(ref.fullName, args.number);
    if (!issue) {
      throw issueNotFound(ref.fullName, args.number);
    }
    if (ctx.agent.handle !== ref.repo.owner && ctx.agent.handle !== issue.author) {
      throw forbiddenRepo(ref.fullName);
    }
    if (issue.state === 'open') {
      return { unchanged: true };
    }
    await this.ports.issues.setState(ref.fullName, args.number, 'open');
    await this.audit(ctx.agent.handle, 'issue.reopen', `${ref.fullName}#${args.number}`, null);
    return { unchanged: false };
  }

  // --- ci -----------------------------------------------------------------

  async ciRun(ctx: AuthContext, args: CiRunArgs): Promise<CiRun> {
    // SECURITY: CI builds and runs untrusted agent code. Sandbox isolation, an
    // egress allowlist and resource caps live in the runner (R8); this method only
    // triggers a workflow defined in the repo, never an arbitrary command.
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const refName = args.ref ?? ref.repo.default_branch;
    const headSha = await this.resolveSha(ref, refName);
    if (headSha === null) {
      throw branchNotFound(ref.fullName, refName);
    }
    const workflow = args.workflow ?? 'ci';
    const run = await this.ports.ci.create({
      repo: ref.fullName,
      ref: refName,
      headSha,
      workflow,
    });
    // Fire the runner without awaiting the build. A start failure is recorded on
    // the run so ci_status still reflects it, but the trigger returns queued.
    void Promise.resolve()
      .then(() =>
        this.ports.runner.start({
          runId: run.run_id,
          owner: ref.owner,
          name: ref.name,
          headSha,
          workflow,
        }),
      )
      .catch((error: unknown) => {
        void this.ports.ci
          .update(ref.fullName, run.run_id, { status: 'completed', conclusion: 'failure' })
          .catch(() => {});
        void this.ports.ci
          .appendLogs(run.run_id, 'runner', [`runner failed to start: ${String(error)}`])
          .catch(() => {});
      });
    await this.audit(ctx.agent.handle, 'ci.run', ref.fullName, {
      run_id: run.run_id,
      ref: refName,
      workflow,
    });
    return run;
  }

  async ciStatus(ctx: AuthContext, args: CiStatusArgs): Promise<CiRun> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const run = await this.ports.ci.get(ref.fullName, args.run_id);
    if (!run) {
      throw ciRunNotFound(ref.fullName, args.run_id);
    }
    // The runner completes a run asynchronously and outside the service, so the one
    // touchpoint where the service can observe completion is a status read. Emit
    // ci.completed the first time a terminal run is seen, deduped per run so a
    // repeated poll does not fire it again. This dedupe is in-process, which is the
    // honest limit of emitting from a read rather than from a runner callback.
    if (run.status === 'completed' && !this.ciCompletedEmitted.has(run.run_id)) {
      this.ciCompletedEmitted.add(run.run_id);
      await this.emit({
        type: 'ci.completed',
        repo: ref.fullName,
        actor: ctx.agent.handle,
        target: `${ref.fullName}@${run.ref}`,
        payload: {
          run_id: run.run_id,
          workflow: run.workflow,
          conclusion: run.conclusion,
          head_sha: run.head_sha,
        },
      });
    }
    return run;
  }

  async ciLogs(
    ctx: AuthContext,
    args: CiLogsArgs,
  ): Promise<{
    run_id: string;
    job: string | null;
    lines: string[];
    next_cursor: string | null;
    truncated: boolean;
  }> {
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const run = await this.ports.ci.get(ref.fullName, args.run_id);
    if (!run) {
      throw ciRunNotFound(ref.fullName, args.run_id);
    }
    const lines = await this.ports.ci.readLogs(args.run_id, args.job, args.tail);
    // The port tails only, so a full tail is treated as truncated and cursor-based
    // paging of older lines is not wired. Flagged.
    const truncated = args.tail > 0 && lines.length >= args.tail;
    return { run_id: args.run_id, job: args.job ?? null, lines, next_cursor: null, truncated };
  }

  // --- search -------------------------------------------------------------

  searchRepos(ctx: AuthContext, args: SearchReposArgs): Promise<WirePage<Repo>> {
    return searchRepos(this.ports, ctx, args);
  }

  searchCode(ctx: AuthContext, args: SearchCodeArgs): Promise<WirePage<CodeHit>> {
    return searchCode(this.ports, ctx, args);
  }

  searchIssues(ctx: AuthContext, args: SearchIssuesArgs): Promise<WirePage<IssueHit>> {
    return searchIssues(this.ports, ctx, args);
  }

  // --- organizations, teams and collaborators -----------------------------

  async orgCreate(ctx: AuthContext, args: OrgCreateArgs): Promise<Org> {
    const { orgs, orgMembers } = this.collab();
    if (await this.isHandleTaken(args.handle)) {
      throw handleTaken(args.handle);
    }
    const org = await orgs.create({
      handle: args.handle,
      displayName: args.display_name ?? null,
    });
    // The creator is the first owner, so an org is never left without an admin.
    await orgMembers.upsert(org.handle, ctx.agent.handle, 'owner');
    await this.audit(ctx.agent.handle, 'org.create', org.handle, {
      display_name: args.display_name ?? null,
    });
    return org;
  }

  async orgGet(ctx: AuthContext, args: OrgGetArgs): Promise<OrgDetail> {
    const { orgMembers, teams } = this.collab();
    const org = await this.requireOrg(args.org);
    const members = await orgMembers.listByOrg(org.handle, { limit: 100 });
    const teamPage = await teams.listByOrg(org.handle, { limit: 100 });
    const mine = await orgMembers.get(org.handle, ctx.agent.handle);
    return {
      ...org,
      member_count: members.total ?? members.items.length,
      team_count: teamPage.total ?? teamPage.items.length,
      viewer_role: mine ? mine.role : null,
    };
  }

  async orgList(ctx: AuthContext, args: OrgListArgs): Promise<WirePage<Org>> {
    const { orgs } = this.collab();
    const agent = args.agent ?? ctx.agent.handle;
    const page = await orgs.listByMember(agent, {
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      limit: args.limit,
    });
    return toWirePage(page);
  }

  async orgAddMember(ctx: AuthContext, args: OrgAddMemberArgs): Promise<Membership> {
    const { orgMembers } = this.collab();
    await this.requireOrg(args.org);
    await this.requireOrgAdmin(ctx, args.org);
    await this.requireEnrolledAgent(args.agent);
    const membership = await orgMembers.upsert(args.org, args.agent, args.role);
    await this.audit(ctx.agent.handle, 'org.add_member', args.org, {
      agent: args.agent,
      role: args.role,
    });
    return membership;
  }

  async orgRemoveMember(
    ctx: AuthContext,
    args: OrgRemoveMemberArgs,
  ): Promise<{ removed: boolean }> {
    const { orgMembers } = this.collab();
    await this.requireOrg(args.org);
    await this.requireOrgAdmin(ctx, args.org);
    const removed = await orgMembers.remove(args.org, args.agent);
    if (removed) {
      await this.audit(ctx.agent.handle, 'org.remove_member', args.org, { agent: args.agent });
    }
    return { removed };
  }

  async teamCreate(ctx: AuthContext, args: TeamCreateArgs): Promise<Team> {
    const { teams } = this.collab();
    await this.requireOrg(args.org);
    await this.requireOrgAdmin(ctx, args.org);
    const existing = await teams.get(args.org, args.slug);
    if (existing) {
      throw validationFailed(
        `Team '${args.org}/${args.slug}' already exists.`,
        'Choose another slug, or add members to the existing team.',
        { org: args.org, team: args.slug },
      );
    }
    const team = await teams.create({ org: args.org, slug: args.slug, name: args.name });
    await this.audit(ctx.agent.handle, 'team.create', `${args.org}/${args.slug}`, {
      name: args.name,
    });
    return team;
  }

  async teamAddMember(ctx: AuthContext, args: TeamAddMemberArgs): Promise<TeamMember> {
    const { teams, teamMembers } = this.collab();
    await this.requireOrg(args.org);
    await this.requireOrgAdmin(ctx, args.org);
    const team = await teams.get(args.org, args.team);
    if (!team) {
      throw teamNotFound(args.org, args.team);
    }
    await this.requireEnrolledAgent(args.agent);
    const member = await teamMembers.add(args.org, args.team, args.agent);
    await this.audit(ctx.agent.handle, 'team.add_member', `${args.org}/${args.team}`, {
      agent: args.agent,
    });
    return member;
  }

  async repoAddCollaborator(
    ctx: AuthContext,
    args: RepoAddCollaboratorArgs,
  ): Promise<Collaborator> {
    const { collaborators } = this.collab();
    const ref = await loadRepoForAdmin(this.ports, ctx, args.repo);
    await this.requireEnrolledAgent(args.agent);
    const grant = await collaborators.upsert(ref.fullName, args.agent, args.permission);
    await this.audit(ctx.agent.handle, 'repo.add_collaborator', ref.fullName, {
      agent: args.agent,
      permission: args.permission,
    });
    return grant;
  }

  async repoRemoveCollaborator(
    ctx: AuthContext,
    args: RepoRemoveCollaboratorArgs,
  ): Promise<{ removed: boolean }> {
    const { collaborators } = this.collab();
    const ref = await loadRepoForAdmin(this.ports, ctx, args.repo);
    const removed = await collaborators.remove(ref.fullName, args.agent);
    if (removed) {
      await this.audit(ctx.agent.handle, 'repo.remove_collaborator', ref.fullName, {
        agent: args.agent,
      });
    }
    return { removed };
  }

  async repoListCollaborators(
    ctx: AuthContext,
    args: RepoListCollaboratorsArgs,
  ): Promise<WirePage<Collaborator>> {
    const { collaborators } = this.collab();
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const page = await collaborators.listByRepo(ref.fullName, {
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      limit: args.limit,
    });
    return toWirePage(page);
  }

  /** The target of a membership or collaborator grant must be an enrolled agent. */
  private async requireEnrolledAgent(handle: string): Promise<void> {
    const agent = await this.ports.agents.getByHandle(handle);
    if (!agent) {
      throw validationFailed(
        `Agent '${handle}' is not enrolled.`,
        'Only an enrolled agent can be granted access. Check the handle.',
        { agent: handle },
      );
    }
  }

  // --- events: webhooks, notifications, activity feed ---------------------

  async webhookCreate(ctx: AuthContext, args: WebhookCreateArgs): Promise<Webhook> {
    // Managing webhooks is a repo-admin action, the same bar as collaborators.
    const webhooks = this.requireWebhooks();
    const ref = await loadRepoForAdmin(this.ports, ctx, args.repo);
    const secret = args.secret ?? generateSecret();
    const hook = await webhooks.create({
      repo: ref.fullName,
      url: args.url,
      events: args.events,
      active: args.active,
      secret,
    });
    await this.audit(ctx.agent.handle, 'webhook.create', ref.fullName, {
      webhook_id: hook.id,
      events: args.events,
    });
    // The secret is returned once here so the caller can store it, then redacted on
    // every list read.
    return hook;
  }

  async webhookList(ctx: AuthContext, args: WebhookListArgs): Promise<WirePage<Webhook>> {
    const webhooks = this.requireWebhooks();
    const ref = await loadRepoForAdmin(this.ports, ctx, args.repo);
    const page = await webhooks.listByRepo(ref.fullName, {
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      limit: args.limit,
    });
    // Redact the signing secret so it never leaks from a list.
    return {
      items: page.items.map((hook) => ({ ...hook, secret: null })),
      next_cursor: page.nextCursor,
      ...(page.total !== undefined ? { total: page.total } : {}),
    };
  }

  async webhookDelete(ctx: AuthContext, args: WebhookDeleteArgs): Promise<{ removed: boolean }> {
    const webhooks = this.requireWebhooks();
    const ref = await loadRepoForAdmin(this.ports, ctx, args.repo);
    const removed = await webhooks.delete(ref.fullName, args.id);
    if (removed) {
      await this.audit(ctx.agent.handle, 'webhook.delete', ref.fullName, { webhook_id: args.id });
    }
    return { removed };
  }

  async notificationsList(
    ctx: AuthContext,
    args: NotificationsListArgs,
  ): Promise<WirePage<Notification>> {
    const notifications = this.requireNotifications();
    const page = await notifications.listByRecipient(ctx.agent.handle, {
      unread: args.unread,
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      limit: args.limit,
    });
    return toWirePage(page);
  }

  async notificationsMarkRead(
    ctx: AuthContext,
    args: NotificationsMarkReadArgs,
  ): Promise<{ marked: number }> {
    const notifications = this.requireNotifications();
    const marked = args.all
      ? await notifications.markAllRead(ctx.agent.handle)
      : await notifications.markRead(ctx.agent.handle, args.ids ?? []);
    return { marked };
  }

  async activityList(ctx: AuthContext, args: ActivityListArgs): Promise<WirePage<AuditEvent>> {
    // The activity feed IS the audit trail, so this reuses the audit log rather than
    // a second store. Global by default (matching the admin audit read), scoped to a
    // repo the caller can read when repo is given, and optionally to one actor. The
    // audit log filters by actor at the store; the repo filter matches the target in
    // service, then an offset cursor windows the result, the same pattern search uses.
    let repoFullName: string | undefined;
    if (args.repo !== undefined) {
      const ref = await loadRepoForRead(this.ports, ctx, args.repo);
      repoFullName = ref.fullName;
    }
    const SCAN_CAP = 1000;
    const collected: AuditEvent[] = [];
    let cursor: string | undefined;
    let exhaustive = true;
    for (;;) {
      const page = await this.ports.audit.list({
        ...(args.actor !== undefined ? { actor: args.actor } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
        limit: 100,
      });
      for (const event of page.items) {
        if (repoFullName === undefined || targetInRepo(event.target, repoFullName)) {
          collected.push(event);
        }
      }
      if (collected.length >= SCAN_CAP) {
        exhaustive = false;
        break;
      }
      if (!page.nextCursor) {
        break;
      }
      cursor = page.nextCursor;
    }
    const offset = decodeCursor(args.cursor);
    return pageSlice(collected.slice(0, SCAN_CAP), offset, args.limit, exhaustive);
  }

  // --- releases -----------------------------------------------------------

  async releaseCreate(ctx: AuthContext, args: ReleaseCreateArgs): Promise<Release> {
    // A release is a write on the repo: it creates a git tag, so it takes write authz.
    const releases = this.requireReleases();
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const existing = await releases.get(ref.fullName, args.tag);
    if (existing) {
      throw releaseExists(ref.fullName, args.tag);
    }
    const targetRef = args.target ?? ref.repo.default_branch;
    const targetSha = await this.resolveSha(ref, targetRef);
    if (targetSha === null) {
      throw branchNotFound(ref.fullName, targetRef);
    }
    // Tag the resolved commit first, then store the release. createTag rejects a
    // duplicate tag, so a tag that exists without a release row still fails cleanly.
    await this.ports.git.createTag(ref.owner, ref.name, args.tag, targetSha, args.message);
    const release = await releases.create({
      repo: ref.fullName,
      tag: args.tag,
      name: args.name ?? args.tag,
      body: args.body ?? null,
      targetSha,
      prerelease: args.prerelease,
      draft: args.draft,
      author: ctx.agent.handle,
    });
    await this.audit(ctx.agent.handle, 'release.create', `${ref.fullName}@${args.tag}`, {
      tag: args.tag,
      target_sha: targetSha,
      prerelease: args.prerelease,
      draft: args.draft,
    });
    return release;
  }

  async releaseList(ctx: AuthContext, args: ReleaseListArgs): Promise<WirePage<Release>> {
    const releases = this.requireReleases();
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const page = await releases.list(ref.fullName, {
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      limit: args.limit,
    });
    return toWirePage(page);
  }

  async releaseGet(ctx: AuthContext, args: ReleaseGetArgs): Promise<Release> {
    const releases = this.requireReleases();
    const ref = await loadRepoForRead(this.ports, ctx, args.repo);
    const release = await releases.get(ref.fullName, args.tag);
    if (!release) {
      throw releaseNotFound(ref.fullName, args.tag);
    }
    return release;
  }

  async releaseDelete(ctx: AuthContext, args: ReleaseDeleteArgs): Promise<{ removed: boolean }> {
    const releases = this.requireReleases();
    const ref = await loadRepoForWrite(this.ports, ctx, args.repo);
    const existing = await releases.get(ref.fullName, args.tag);
    // Idempotent: deleting an absent release is a no-op, so a retry is safe.
    if (!existing) {
      return { removed: false };
    }
    await releases.delete(ref.fullName, args.tag);
    // Remove the git tag too. deleteTag is idempotent on a missing tag.
    await this.ports.git.deleteTag(ref.owner, ref.name, args.tag);
    await this.audit(ctx.agent.handle, 'release.delete', `${ref.fullName}@${args.tag}`, {
      tag: args.tag,
    });
    return { removed: true };
  }

  // --- observability ------------------------------------------------------

  async listAudit(
    _ctx: AuthContext,
    q: { actor?: string; cursor?: string; limit: number },
  ): Promise<WirePage<AuditEvent>> {
    const page = await this.ports.audit.list({
      actor: q.actor,
      cursor: q.cursor,
      limit: q.limit,
    });
    return toWirePage(page);
  }

  async listBranches(ctx: AuthContext, repo: string): Promise<Branch[]> {
    const ref = await loadRepoForRead(this.ports, ctx, repo);
    return this.ports.git.listBranches(ref.owner, ref.name);
  }
}

/** Build the one ForgeService over a set of injected ports. */
export function createForgeService(ports: Ports): ForgeService {
  return new ForgeServiceImpl(ports);
}
