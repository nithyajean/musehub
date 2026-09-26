import { existsSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forgeError } from '@musehub/contracts';
import type { Branch, Commit, DiffFile, TreeEntry } from '@musehub/contracts';
import type { GitBackend } from '@musehub/core';
import git from 'isomorphic-git';
import { runGit, runGitOrThrow } from './git-cli.js';
import { installHooks } from './hooks.js';
import {
  FULL_OID,
  ZERO_OID,
  assertBranchName,
  assertCommittish,
  ownerDir,
  repoDir,
} from './paths.js';

const fs = nodeFs;

/** The canonical empty tree object id (git computes the same for any empty repo). */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface CreateGitBackendOptions {
  /** Repo store root. Repos live at <root>/<owner>/<name>.git */
  root: string;
  /** git binary, default "git" (must be 2.38+ for merge-tree --write-tree). */
  gitBin?: string;
  /** Injected clock so commit times are deterministic in tests. */
  now?: () => Date;
  /** Author/committer email domain for the synthetic git identity. */
  authorEmailDomain?: string;
}

/**
 * The git backend over a bare-repo store. Writes and transport go through the
 * system git binary for canonical object ids and atomic ref CAS; reads use
 * isomorphic-git against the bare gitdir with no working copy (R4). Every commit
 * id this returns is a real git SHA-1 a client `git` would compute, because
 * every write goes through real git objects.
 */
export function createGitBackend(opts: CreateGitBackendOptions): GitBackend {
  const root = opts.root;
  const gitBin = opts.gitBin ?? 'git';
  const now = opts.now ?? (() => new Date());
  const domain = opts.authorEmailDomain ?? 'agents.musehub';

  function ensureRepo(owner: string, name: string): string {
    const gitdir = repoDir(root, owner, name);
    if (!existsSync(gitdir)) {
      throw forgeError('repo_not_found', `repo not found: ${owner}/${name}`, {
        details: { owner, name },
      });
    }
    return gitdir;
  }

  function repoEnv(gitdir: string, extra?: Record<string, string>): Record<string, string> {
    return { GIT_DIR: gitdir, ...(extra ?? {}) };
  }

  function authorEnv(author: string, when: Date): Record<string, string> {
    const secs = Math.floor(when.getTime() / 1000);
    const date = `${secs} +0000`;
    const email = `${author}@${domain}`;
    return {
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: email,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: author,
      GIT_COMMITTER_EMAIL: email,
      GIT_COMMITTER_DATE: date,
    };
  }

  function normalizePath(p: string): string {
    return p.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  function normalizeChangePath(p: string): string {
    const clean = normalizePath(p);
    const segs = clean.split('/');
    if (clean === '' || segs.some((s) => s === '' || s === '.' || s === '..')) {
      throw forgeError('validation_failed', `invalid file path: ${p}`, { details: { path: p } });
    }
    return clean;
  }

  async function resolveHead(gitdir: string, branch: string): Promise<string | null> {
    try {
      return await git.resolveRef({ fs, gitdir, ref: `refs/heads/${branch}` });
    } catch {
      return null;
    }
  }

  async function resolveCommitOid(gitdir: string, ref: string): Promise<string> {
    if (FULL_OID.test(ref)) return ref;
    try {
      return await git.resolveRef({ fs, gitdir, ref, depth: 10 });
    } catch {
      throw forgeError('branch_not_found', `ref not found: ${ref}`, { details: { ref } });
    }
  }

  async function rootTreeOf(gitdir: string, commitOid: string): Promise<string> {
    const { commit } = await git.readCommit({ fs, gitdir, oid: commitOid });
    return commit.tree;
  }

  /** Resolve any committish to a real commit sha via the git binary. */
  async function resolveShaCli(gitdir: string, ref: string): Promise<string> {
    const res = await runGit(gitBin, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      env: repoEnv(gitdir),
    });
    if (res.exitCode !== 0) {
      throw forgeError('branch_not_found', `ref not found: ${ref}`, { details: { ref } });
    }
    return res.stdout.trim();
  }

  /** 3-way merge two commits, returning the merged tree oid or throwing on conflict. */
  async function mergeTree(
    gitdir: string,
    a: string,
    b: string,
    mergeBase?: string,
  ): Promise<string> {
    const args = ['merge-tree', '--write-tree'];
    if (mergeBase !== undefined) args.push(`--merge-base=${mergeBase}`);
    args.push(a, b);
    const res = await runGit(gitBin, args, { env: repoEnv(gitdir) });
    if (res.exitCode === 1) {
      throw forgeError('merge_conflict', 'merge produced conflicts', {
        details: { conflicts: res.stdout.trim().split('\n').slice(1) },
      });
    }
    if (res.exitCode !== 0) {
      throw forgeError('internal_error', `git merge-tree failed: ${res.stderr.trim()}`);
    }
    const line = res.stdout.trim().split('\n')[0] ?? '';
    return line.trim();
  }

  return {
    async initRepo(owner, name, initOpts) {
      const gitdir = repoDir(root, owner, name);
      if (existsSync(gitdir)) {
        throw forgeError('repo_exists', `repo already exists: ${owner}/${name}`, {
          details: { owner, name },
        });
      }
      assertBranchName(initOpts.defaultBranch);
      await mkdir(ownerDir(root, owner), { recursive: true });
      await runGitOrThrow(gitBin, ['init', '--bare', '-b', initOpts.defaultBranch, gitdir]);
      // Serve push over smart-HTTP; the api layer authenticates in front of it.
      await runGitOrThrow(gitBin, ['config', 'http.receivepack', 'true'], {
        env: repoEnv(gitdir),
      });
      await installHooks(gitdir);
    },

    async deleteRepo(owner, name) {
      const gitdir = repoDir(root, owner, name);
      await rm(gitdir, { recursive: true, force: true });
    },

    async getBranchHead(owner, name, branch) {
      const gitdir = ensureRepo(owner, name);
      assertBranchName(branch);
      return resolveHead(gitdir, branch);
    },

    async listBranches(owner, name) {
      const gitdir = ensureRepo(owner, name);
      const names = await git.listBranches({ fs, gitdir });
      let def: string | undefined;
      try {
        const cb = await git.currentBranch({ fs, gitdir, fullname: false });
        def = typeof cb === 'string' ? cb : undefined;
      } catch {
        def = undefined;
      }
      const branches: Branch[] = [];
      for (const n of names) {
        const sha = await git.resolveRef({ fs, gitdir, ref: `refs/heads/${n}` });
        branches.push({ name: n, head_sha: sha, protected: n === def });
      }
      return branches;
    },
    async readTree(owner, name, ref, path, recursive) {
      const gitdir = ensureRepo(owner, name);
      assertCommittish(ref);
      const commitOid = await resolveCommitOid(gitdir, ref);
      const rootTree = await rootTreeOf(gitdir, commitOid);
      const clean = normalizePath(path);
      let listing: {
        oid: string;
        tree: { mode: string; path: string; oid: string; type: string }[];
      };
      try {
        listing =
          clean === ''
            ? await git.readTree({ fs, gitdir, oid: rootTree })
            : await git.readTree({ fs, gitdir, oid: rootTree, filepath: clean });
      } catch {
        throw forgeError('file_not_found', `path not found: ${path}`, { details: { path } });
      }
      const MAX = 10_000;
      const entries: TreeEntry[] = [];
      let truncated = false;
      const walk = async (
        nodes: { mode: string; path: string; oid: string; type: string }[],
        prefix: string,
      ): Promise<void> => {
        for (const e of nodes) {
          if (entries.length >= MAX) {
            truncated = true;
            return;
          }
          const full = prefix ? `${prefix}/${e.path}` : e.path;
          const isDir = e.type === 'tree';
          let size: number | null = null;
          if (e.type === 'blob') {
            const blob = await git.readBlob({ fs, gitdir, oid: e.oid });
            size = blob.blob.length;
          }
          entries.push({
            path: full,
            type: isDir ? 'dir' : 'file',
            size,
            sha: e.oid,
            mode: e.mode,
          });
          if (recursive && isDir) {
            const sub = await git.readTree({ fs, gitdir, oid: e.oid });
            await walk(sub.tree, full);
          }
        }
      };
      await walk(listing.tree, clean);
      return { sha: listing.oid, entries, truncated };
    },

    async readFile(owner, name, ref, path, maxBytes) {
      const gitdir = ensureRepo(owner, name);
      assertCommittish(ref);
      const commitOid = await resolveCommitOid(gitdir, ref);
      const rootTree = await rootTreeOf(gitdir, commitOid);
      const clean = normalizePath(path);
      if (clean === '') return null;
      let blob: Uint8Array;
      let oid: string;
      try {
        const r = await git.readBlob({ fs, gitdir, oid: rootTree, filepath: clean });
        blob = r.blob;
        oid = r.oid;
      } catch {
        return null;
      }
      const size = blob.length;
      const truncated = size > maxBytes;
      const slice = truncated ? blob.subarray(0, maxBytes) : blob;
      const content = new TextDecoder('utf-8').decode(slice);
      return { sha: oid, size, content, truncated };
    },
    async createBranch(owner, name, branch, fromSha) {
      const gitdir = ensureRepo(owner, name);
      assertBranchName(branch);
      assertCommittish(fromSha);
      if ((await resolveHead(gitdir, branch)) !== null) {
        throw forgeError('branch_exists', `branch already exists: ${branch}`, {
          details: { branch },
        });
      }
      const oid = await resolveCommitOid(gitdir, fromSha);
      // old-value of all-zeros means "create only if it does not already exist".
      await runGitOrThrow(gitBin, ['update-ref', `refs/heads/${branch}`, oid, ZERO_OID], {
        env: repoEnv(gitdir),
      });
      return oid;
    },

    async deleteBranch(owner, name, branch) {
      const gitdir = ensureRepo(owner, name);
      assertBranchName(branch);
      if ((await resolveHead(gitdir, branch)) === null) {
        throw forgeError('branch_not_found', `branch not found: ${branch}`, {
          details: { branch },
        });
      }
      await runGitOrThrow(gitBin, ['update-ref', '-d', `refs/heads/${branch}`], {
        env: repoEnv(gitdir),
      });
    },
    async createCommit(input) {
      const gitdir = ensureRepo(input.owner, input.name);
      assertBranchName(input.branch);

      let parents: string[] = [];
      let baseTree: string;
      let oldRefValue: string;
      let creating = false;

      if (input.createBranchFrom !== undefined) {
        assertCommittish(input.createBranchFrom);
        if ((await resolveHead(gitdir, input.branch)) !== null) {
          throw forgeError('branch_exists', `branch already exists: ${input.branch}`, {
            details: { branch: input.branch },
          });
        }
        const fromOid = await resolveCommitOid(gitdir, input.createBranchFrom);
        parents = [fromOid];
        baseTree = await rootTreeOf(gitdir, fromOid);
        oldRefValue = ZERO_OID;
        creating = true;
      } else {
        const head = await resolveHead(gitdir, input.branch);
        if (head === null) {
          const hasRefs = (await git.listBranches({ fs, gitdir })).length > 0;
          if (hasRefs) {
            throw forgeError('branch_not_found', `branch not found: ${input.branch}`, {
              details: { branch: input.branch },
            });
          }
          parents = [];
          baseTree = EMPTY_TREE;
          oldRefValue = ZERO_OID;
          creating = true;
        } else {
          if (input.expectedHead !== undefined && input.expectedHead !== head) {
            throw forgeError('stale_ref', 'branch moved since expectedHead was read', {
              details: { expected: input.expectedHead, actual: head },
            });
          }
          parents = [head];
          baseTree = await rootTreeOf(gitdir, head);
          oldRefValue = head;
        }
      }

      const tmp = await mkdtemp(join(tmpdir(), 'musehub-idx-'));
      const indexFile = join(tmp, 'index');
      const idxEnv = repoEnv(gitdir, { GIT_INDEX_FILE: indexFile });
      try {
        if (baseTree !== EMPTY_TREE) {
          await runGitOrThrow(gitBin, ['read-tree', baseTree], { env: idxEnv });
        }
        const touched = new Set<string>();
        for (const c of input.changes) {
          const p = normalizeChangePath(c.path);
          if (c.op === 'write') {
            const buf =
              c.encoding === 'base64'
                ? Buffer.from(c.content ?? '', 'base64')
                : Buffer.from(c.content ?? '', 'utf8');
            const oid = (
              await runGitOrThrow(gitBin, ['hash-object', '-w', '--stdin'], {
                env: repoEnv(gitdir),
                input: buf,
              })
            ).trim();
            await runGitOrThrow(
              gitBin,
              ['update-index', '--add', '--cacheinfo', '100644', oid, p],
              { env: idxEnv },
            );
          } else {
            await runGitOrThrow(gitBin, ['update-index', '--force-remove', p], { env: idxEnv });
          }
          touched.add(p);
        }
        const newTree = (await runGitOrThrow(gitBin, ['write-tree'], { env: idxEnv })).trim();

        if (newTree === baseTree) {
          // The changes did not alter the tree. Do not write a commit.
          if (creating && input.createBranchFrom !== undefined) {
            const from = parents[0] ?? EMPTY_TREE;
            await runGitOrThrow(
              gitBin,
              ['update-ref', `refs/heads/${input.branch}`, from, ZERO_OID],
              {
                env: repoEnv(gitdir),
              },
            );
            return { sha: from, parents: [], treeSha: newTree, filesChanged: 0, unchanged: true };
          }
          const cur = parents[0] ?? '';
          return {
            sha: cur,
            parents: [...parents],
            treeSha: newTree,
            filesChanged: 0,
            unchanged: true,
          };
        }

        const commitArgs = ['commit-tree', newTree];
        for (const p of parents) commitArgs.push('-p', p);
        commitArgs.push('-m', input.message);
        const commitOid = (
          await runGitOrThrow(gitBin, commitArgs, {
            env: repoEnv(gitdir, authorEnv(input.author, now())),
          })
        ).trim();

        const upd = await runGit(
          gitBin,
          ['update-ref', `refs/heads/${input.branch}`, commitOid, oldRefValue],
          { env: repoEnv(gitdir) },
        );
        if (upd.exitCode !== 0) {
          if (creating) {
            throw forgeError('branch_exists', `branch already exists: ${input.branch}`, {
              details: { branch: input.branch },
            });
          }
          throw forgeError('stale_ref', 'branch moved during commit', {
            details: { branch: input.branch, expected: oldRefValue },
          });
        }
        return {
          sha: commitOid,
          parents: [...parents],
          treeSha: newTree,
          filesChanged: touched.size,
          unchanged: false,
        };
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    },
    async diff(owner, name, base, head, format, maxBytes) {
      const gitdir = ensureRepo(owner, name);
      assertCommittish(base);
      assertCommittish(head);
      const baseSha = await resolveShaCli(gitdir, base);
      const headSha = await resolveShaCli(gitdir, head);
      const env = repoEnv(gitdir);

      const nameStatus = await runGitOrThrow(
        gitBin,
        ['diff', '--name-status', '-M', baseSha, headSha],
        { env },
      );
      const numstat = await runGitOrThrow(gitBin, ['diff', '--numstat', '-M', baseSha, headSha], {
        env,
      });
      // Both diffs list the same entries in the same order, so zip by index and
      // never parse a rename path out of numstat (its arrow forms are ambiguous).
      const nsLines = nameStatus.split('\n').filter((l) => l.length > 0);
      const nnLines = numstat.split('\n').filter((l) => l.length > 0);
      const files: DiffFile[] = [];
      for (let i = 0; i < nsLines.length; i++) {
        const nsCols = (nsLines[i] ?? '').split('\t');
        const letter = (nsCols[0] ?? 'M')[0] ?? 'M';
        const path =
          letter === 'R' || letter === 'C' ? (nsCols[2] ?? nsCols[1] ?? '') : (nsCols[1] ?? '');
        const nnCols = (nnLines[i] ?? '').split('\t');
        const additions = nnCols[0] === '-' ? 0 : Number.parseInt(nnCols[0] ?? '0', 10) || 0;
        const deletions = nnCols[1] === '-' ? 0 : Number.parseInt(nnCols[1] ?? '0', 10) || 0;
        const status: DiffFile['status'] =
          letter === 'A' || letter === 'C'
            ? 'added'
            : letter === 'D'
              ? 'removed'
              : letter === 'R'
                ? 'renamed'
                : 'modified';
        files.push({ path, status, additions, deletions });
      }

      if (format === 'summary') {
        return { baseSha, headSha, files, truncated: false };
      }
      const full = await runGitOrThrow(gitBin, ['diff', '-M', baseSha, headSha], { env });
      const bytes = Buffer.from(full, 'utf8');
      const truncated = bytes.length > maxBytes;
      const patch = truncated ? bytes.subarray(0, maxBytes).toString('utf8') : full;
      return { baseSha, headSha, files, patch, truncated };
    },

    async getCommit(owner, name, sha) {
      const gitdir = ensureRepo(owner, name);
      assertCommittish(sha);
      let oid: string;
      try {
        oid = FULL_OID.test(sha) ? sha : await resolveCommitOid(gitdir, sha);
      } catch {
        return null;
      }
      let res: Awaited<ReturnType<typeof git.readCommit>>;
      try {
        res = await git.readCommit({ fs, gitdir, oid });
      } catch {
        return null;
      }
      const c = res.commit;
      const commit: Commit = {
        sha: res.oid,
        message: c.message.replace(/\n+$/, ''),
        author: c.author.name,
        parents: c.parent,
        tree_sha: c.tree,
        committed_at: new Date(c.committer.timestamp * 1000).toISOString(),
      };
      return commit;
    },
    async canMerge(owner, name, base, head) {
      const gitdir = ensureRepo(owner, name);
      assertCommittish(base);
      assertCommittish(head);
      const baseSha = await resolveShaCli(gitdir, base);
      const headSha = await resolveShaCli(gitdir, head);
      const env = repoEnv(gitdir);
      // A fast-forward (base is an ancestor of head) always merges cleanly.
      const ff = await runGit(gitBin, ['merge-base', '--is-ancestor', baseSha, headSha], { env });
      if (ff.exitCode === 0) return true;
      const mt = await runGit(gitBin, ['merge-tree', '--write-tree', baseSha, headSha], { env });
      if (mt.exitCode === 0) return true;
      if (mt.exitCode === 1) return false;
      throw forgeError('internal_error', `git merge-tree failed: ${mt.stderr.trim()}`);
    },

    async merge(input) {
      const gitdir = ensureRepo(input.owner, input.name);
      assertCommittish(input.base);
      assertCommittish(input.head);
      const baseSha = await resolveShaCli(gitdir, input.base);
      const headSha = await resolveShaCli(gitdir, input.head);
      const env = repoEnv(gitdir);
      const cEnv = repoEnv(gitdir, authorEnv(input.author, now()));
      const ff =
        (await runGit(gitBin, ['merge-base', '--is-ancestor', baseSha, headSha], { env }))
          .exitCode === 0;

      let mergeSha: string;
      if (input.method === 'merge') {
        if (ff) {
          mergeSha = headSha;
        } else {
          const tree = await mergeTree(gitdir, baseSha, headSha);
          mergeSha = (
            await runGitOrThrow(
              gitBin,
              ['commit-tree', tree, '-p', baseSha, '-p', headSha, '-m', input.message],
              { env: cEnv },
            )
          ).trim();
        }
      } else if (input.method === 'squash') {
        const tree = ff
          ? await rootTreeOf(gitdir, headSha)
          : await mergeTree(gitdir, baseSha, headSha);
        mergeSha = (
          await runGitOrThrow(gitBin, ['commit-tree', tree, '-p', baseSha, '-m', input.message], {
            env: cEnv,
          })
        ).trim();
      } else {
        // rebase: replay each commit in base..head onto base, keeping real ids.
        if (ff) {
          mergeSha = headSha;
        } else {
          const listOut = await runGitOrThrow(
            gitBin,
            ['rev-list', '--reverse', `${baseSha}..${headSha}`],
            { env },
          );
          const commits = listOut
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          let newBase = baseSha;
          for (const c of commits) {
            const parent = (await runGitOrThrow(gitBin, ['rev-parse', `${c}^`], { env })).trim();
            const tree = await mergeTree(gitdir, newBase, c, parent);
            const msg = (
              await runGitOrThrow(gitBin, ['log', '-1', '--format=%B', c], { env })
            ).replace(/\n+$/, '');
            newBase = (
              await runGitOrThrow(gitBin, ['commit-tree', tree, '-p', newBase, '-m', msg], {
                env: cEnv,
              })
            ).trim();
          }
          mergeSha = newBase;
        }
      }

      // Advance the base branch when base names a real branch.
      let baseIsBranch = false;
      try {
        assertBranchName(input.base);
        baseIsBranch = (await resolveHead(gitdir, input.base)) !== null;
      } catch {
        baseIsBranch = false;
      }
      if (baseIsBranch && mergeSha !== baseSha) {
        const upd = await runGit(
          gitBin,
          ['update-ref', `refs/heads/${input.base}`, mergeSha, baseSha],
          { env },
        );
        if (upd.exitCode !== 0) {
          throw forgeError('stale_ref', 'base branch moved during merge', {
            details: { base: input.base },
          });
        }
      }
      return { mergeSha };
    },
  };
}
