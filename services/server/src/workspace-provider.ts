// The CI WorkspaceProvider: bridges the CI runner (which is handed only
// owner/name/headSha) to the git backend it has no direct reference to.
//
// readFile goes straight through the git backend, so the stub CI path (the default
// when no Docker daemon is wired) reads .musehub/ci.yml with no external tool. The
// read-only checkout directory the Docker sandbox mounts is materialized best
// effort with `git archive` piped to `tar`, so a demo without tar still runs the
// stub path rather than failing the whole run.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Workspace, WorkspaceProvider } from '@musehub/ci';
import type { GitBackend } from '@musehub/core';
import { repoDir } from '@musehub/git';

const MAX_CONFIG_BYTES = 1024 * 1024;

/** Extract the tree at a commit into destDir by piping `git archive` through `tar`. */
function archiveInto(
  gitBin: string,
  gitdir: string,
  headSha: string,
  destDir: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const archive = spawn(gitBin, ['--git-dir', gitdir, 'archive', '--format=tar', headSha], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tar = spawn('tar', ['-x', '-C', destDir], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    let closed = 0;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };
    const done = (code: number | null, which: string) => {
      if (settled) return;
      if (code !== 0) {
        fail(`${which} exited ${code}: ${stderr.trim()}`);
        return;
      }
      closed += 1;
      if (closed === 2) {
        settled = true;
        resolve();
      }
    };
    archive.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    tar.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    archive.on('error', (e) => fail(`git archive: ${e.message}`));
    tar.on('error', (e) => fail(`tar: ${e.message}`));
    archive.stdout.pipe(tar.stdin);
    archive.on('close', (code) => done(code, 'git archive'));
    tar.on('close', (code) => done(code, 'tar'));
  });
}

/** A WorkspaceProvider that reads the checkout through the git backend. */
export function createGitWorkspaceProvider(
  gitBackend: GitBackend,
  gitRoot: string,
  gitBin = 'git',
): WorkspaceProvider {
  return {
    async checkout(owner: string, name: string, headSha: string): Promise<Workspace> {
      const dir = await mkdtemp(join(tmpdir(), 'musehub-ci-'));
      try {
        await archiveInto(gitBin, repoDir(gitRoot, owner, name), headSha, dir);
      } catch {
        // The checkout dir stays empty; the stub path reads config through the git
        // backend below, and Docker CI over an empty tree fails honestly.
      }
      return {
        dir,
        async readFile(relPath: string): Promise<string | null> {
          const file = await gitBackend.readFile(owner, name, headSha, relPath, MAX_CONFIG_BYTES);
          return file ? file.content : null;
        },
        async dispose(): Promise<void> {
          await rm(dir, { recursive: true, force: true }).catch(() => {});
        },
      };
    },
  };
}
