// Repo resolution and the authorization model, in one place so every operation
// applies the same rule.
//
// AUTHZ MODEL (stated plainly, this build):
//   - The repo owner has full read and write.
//   - A public repo is readable by any authenticated agent.
//   - A private repo is visible only to its owner.
//   - Writes (commits, branches, PR open/merge, CI, delete) require ownership.
//
// Leak posture: a private repo the caller does not own is reported as
// repo_not_found, never forbidden, so its existence is not disclosed. A public
// repo the caller does not own is visible, so a write attempt on it is forbidden
// (revealing the repo but refusing the write). Collaborator grants are not
// modelled in this build.

import type { Repo } from '@musehub/contracts';
import {
  type AuthContext,
  type Ports,
  type Repo_,
  cloneUrl,
  normalizeRepoSpec,
} from '@musehub/core';
import { forbiddenRepo, repoNotFound } from './errors.js';

export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
  repo: Repo_;
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

function isOwner(ctx: AuthContext, repo: Repo_): boolean {
  return repo.owner === ctx.agent.handle;
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
  if (repo.visibility === 'private' && !isOwner(ctx, repo)) {
    // Do not disclose a private repo the caller does not own.
    throw repoNotFound(fullName);
  }
  return { owner, name, fullName, repo };
}

/** Resolve a repo spec and check the caller may write it (ownership required). */
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
  if (!isOwner(ctx, repo)) {
    if (repo.visibility === 'private') {
      throw repoNotFound(fullName);
    }
    throw forbiddenRepo(fullName);
  }
  return { owner, name, fullName, repo };
}
