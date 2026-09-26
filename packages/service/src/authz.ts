// Repo resolution and the authorization model, in one place so every operation
// applies the same rule.
//
// AUTHZ MODEL (stated plainly, this build):
//   - The repo owner has full admin (read, write, admin).
//   - A public repo is readable by any authenticated agent.
//   - When the owner is an org, an org member's role sets the base permission
//     (owner/admin -> admin, member -> write) and a member of any team in that org
//     gets write. A repo is only owned by an org when the owner handle resolves to
//     an org.
//   - A per-repo collaborator grant (read, write or admin) applies to any repo,
//     agent-owned or org-owned.
//   - The caller's effective permission is the strongest path that applies.
//   - Writes require write or better; managing collaborators requires admin.
//
// Leak posture: a private repo the caller cannot read is reported as
// repo_not_found, never forbidden, so its existence is not disclosed. A repo the
// caller can read but not write is forbidden (revealing the repo but refusing the
// write). The collaboration stores are optional: when absent, only the owner path
// applies, which is exactly the pre-collaboration behavior.

import type { Repo } from '@musehub/contracts';
import {
  type AuthContext,
  type Ports,
  type Repo_,
  cloneUrl,
  normalizeRepoSpec,
} from '@musehub/core';
import { forbiddenRepo, forbiddenRepoAdmin, repoNotFound } from './errors.js';

export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
  repo: Repo_;
}

export type Permission = 'none' | 'read' | 'write' | 'admin';

const RANK: Record<Permission, number> = { none: 0, read: 1, write: 2, admin: 3 };

/** True when `have` meets or exceeds `need`. */
export function permits(have: Permission, need: Exclude<Permission, 'none'>): boolean {
  return RANK[have] >= RANK[need];
}

function stronger(a: Permission, b: Permission): Permission {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Add the git-derived fields to a stored repo row to make the wire Repo. */
export function toWireRepo(config: Ports['config'], stored: Repo_): Repo {
  const url = cloneUrl(config.gitBaseUrl, stored.owner, stored.name);
  return {
    ...stored,
    full_name: `${stored.owner}/${stored.name}`,
    clone_url: url,
    git_url: url,
  };
}

/**
 * The caller's effective permission on a repo, resolved across every path: direct
 * owner, org membership and role, team grant, and per-repo collaborator. Public
 * visibility is handled by the callers, not here, so this reports the identity's
 * own standing.
 */
export async function resolvePermission(
  ports: Ports,
  ctx: AuthContext,
  repo: Repo_,
): Promise<Permission> {
  const me = ctx.agent.handle;
  const fullName = `${repo.owner}/${repo.name}`;

  // The direct owner (an agent that owns the repo) has full access.
  if (repo.owner === me) {
    return 'admin';
  }

  let perm: Permission = 'none';

  // Org-owned repo: the owner handle resolves to an org.
  if (ports.orgs && ports.orgMembers) {
    const org = await ports.orgs.getByHandle(repo.owner);
    if (org) {
      const membership = await ports.orgMembers.get(repo.owner, me);
      if (membership) {
        perm = stronger(perm, membership.role === 'member' ? 'write' : 'admin');
      }
      if (ports.teamMembers && (await ports.teamMembers.isMemberOfAnyTeam(repo.owner, me))) {
        perm = stronger(perm, 'write');
      }
    }
  }

  // A direct per-repo collaborator grant.
  if (ports.collaborators) {
    const grant = await ports.collaborators.get(fullName, me);
    if (grant) {
      perm = stronger(perm, grant.permission);
    }
  }

  return perm;
}

/** Resolve a repo spec and check the caller may read it. */
export async function loadRepoForRead(
  ports: Ports,
  ctx: AuthContext,
  spec: string,
): Promise<RepoRef> {
  const { owner, name, fullName } = normalizeRepoSpec(ctx.agent.handle, spec);
  const repo = await ports.repos.get(owner, name);
  if (!repo) {
    throw repoNotFound(fullName);
  }
  if (repo.visibility === 'public') {
    return { owner, name, fullName, repo };
  }
  const perm = await resolvePermission(ports, ctx, repo);
  if (!permits(perm, 'read')) {
    // Do not disclose a private repo the caller cannot read.
    throw repoNotFound(fullName);
  }
  return { owner, name, fullName, repo };
}

/** Resolve a repo spec and check the caller may write it. */
export async function loadRepoForWrite(
  ports: Ports,
  ctx: AuthContext,
  spec: string,
): Promise<RepoRef> {
  const { owner, name, fullName } = normalizeRepoSpec(ctx.agent.handle, spec);
  const repo = await ports.repos.get(owner, name);
  if (!repo) {
    throw repoNotFound(fullName);
  }
  const perm = await resolvePermission(ports, ctx, repo);
  if (permits(perm, 'write')) {
    return { owner, name, fullName, repo };
  }
  // Not enough for a write. If the caller cannot even read a private repo, hide it.
  if (!permits(perm, 'read') && repo.visibility === 'private') {
    throw repoNotFound(fullName);
  }
  throw forbiddenRepo(fullName);
}

/** Resolve a repo spec and check the caller has admin on it (owner, org admin or admin grant). */
export async function loadRepoForAdmin(
  ports: Ports,
  ctx: AuthContext,
  spec: string,
): Promise<RepoRef> {
  const { owner, name, fullName } = normalizeRepoSpec(ctx.agent.handle, spec);
  const repo = await ports.repos.get(owner, name);
  if (!repo) {
    throw repoNotFound(fullName);
  }
  const perm = await resolvePermission(ports, ctx, repo);
  if (permits(perm, 'admin')) {
    return { owner, name, fullName, repo };
  }
  if (!permits(perm, 'read') && repo.visibility === 'private') {
    throw repoNotFound(fullName);
  }
  throw forbiddenRepoAdmin(fullName);
}
