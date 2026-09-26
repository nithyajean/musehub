import { forgeError } from '@musehub/contracts';
import { execa } from 'execa';

/**
 * Thin wrappers over the system git binary. Every call passes arguments as an
 * argv array, never a shell string, so user-supplied values cannot be
 * interpolated into a command line. The binary is the write and transport path
 * (R4): highest fidelity, real canonical object ids, atomic ref CAS via
 * `git update-ref`.
 */
export interface GitRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  input?: Buffer | string;
}

export interface GitTextResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runGit(
  gitBin: string,
  args: string[],
  opts: GitRunOptions = {},
): Promise<GitTextResult> {
  const res = await execa(gitBin, args, {
    cwd: opts.cwd,
    env: opts.env,
    input: opts.input,
    reject: false,
    stripFinalNewline: false,
  });
  return {
    stdout: typeof res.stdout === 'string' ? res.stdout : '',
    stderr: typeof res.stderr === 'string' ? res.stderr : '',
    exitCode: res.exitCode ?? 0,
  };
}

/** Run git and throw an internal_error ForgeError on any non-zero exit. */
export async function runGitOrThrow(
  gitBin: string,
  args: string[],
  opts: GitRunOptions = {},
): Promise<string> {
  const res = await runGit(gitBin, args, opts);
  if (res.exitCode !== 0) {
    throw forgeError(
      'internal_error',
      `git ${args[0]} failed: ${res.stderr.trim() || res.stdout.trim()}`,
      {
        details: { args, exitCode: res.exitCode },
      },
    );
  }
  return res.stdout;
}

export interface GitBufferResult {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
}

/** Run git capturing stdout as raw bytes (for git-http-backend and packfiles). */
export async function runGitBuffer(
  gitBin: string,
  args: string[],
  opts: GitRunOptions = {},
): Promise<GitBufferResult> {
  const res = await execa(gitBin, args, {
    cwd: opts.cwd,
    env: opts.env,
    input: opts.input,
    reject: false,
    encoding: 'buffer',
  });
  const out = res.stdout instanceof Uint8Array ? Buffer.from(res.stdout) : Buffer.alloc(0);
  const err = res.stderr instanceof Uint8Array ? Buffer.from(res.stderr).toString('utf8') : '';
  return { stdout: out, stderr: err, exitCode: res.exitCode ?? 0 };
}
