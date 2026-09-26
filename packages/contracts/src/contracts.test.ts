import { describe, expect, it } from 'vitest';
import {
  CommitCreateArgs,
  EnrollArgs,
  ErrorEnvelope,
  ForgeError,
  RepoCreateArgs,
  TOOLS,
  TOOLS_BY_NAME,
} from './index.js';

describe('tool catalog', () => {
  it('has 50 tools', () => {
    expect(TOOLS.length).toBe(50);
  });

  it('every name is forge.<action> with exactly one dot and valid characters', () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^forge\.[a-z][a-z_]*$/);
      expect(t.name.split('.').length).toBe(2);
      expect(t.name).toMatch(/^[a-zA-Z0-9_.-]+$/); // legal Meta Model API function name
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('names are unique and indexed', () => {
    const names = new Set(TOOLS.map((t) => t.name));
    expect(names.size).toBe(TOOLS.length);
    expect(TOOLS_BY_NAME['forge.pr_merge']?.name).toBe('forge.pr_merge');
  });
});

describe('argument schemas', () => {
  it('enroll requires attestation and defaults rotate_token', () => {
    const parsed = EnrollArgs.parse({ muse_attestation: 'proof' });
    expect(parsed.rotate_token).toBe(false);
    expect(() => EnrollArgs.parse({})).toThrow();
  });

  it('enroll rejects unknown fields (strict)', () => {
    expect(() => EnrollArgs.parse({ muse_attestation: 'x', human: true })).toThrow();
  });

  it('repo_create applies safe defaults', () => {
    const parsed = RepoCreateArgs.parse({ name: 'checkout' });
    expect(parsed.visibility).toBe('private');
    expect(parsed.auto_init).toBe(true);
    expect(parsed.default_branch).toBe('main');
  });

  it('commit_create needs at least one change', () => {
    expect(() => CommitCreateArgs.parse({ repo: 'a/b', message: 'm', changes: [] })).toThrow();
    const ok = CommitCreateArgs.parse({
      repo: 'a/b',
      message: 'm',
      changes: [{ path: 'f.txt', content: 'hi' }],
    });
    expect(ok.changes[0]?.op).toBe('write');
  });
});

describe('error envelope', () => {
  it('ForgeError carries the right status and validates as an envelope', () => {
    const e = new ForgeError('repo_not_found', 'no repo', { next: 'create it' });
    const env = e.toEnvelope();
    expect(env.error.http_status).toBe(404);
    expect(env.error.retryable).toBe(false);
    expect(env.error.next).toBe('create it');
    expect(() => ErrorEnvelope.parse(env)).not.toThrow();
  });

  it('stale_ref is retryable by default', () => {
    expect(new ForgeError('stale_ref', 'moved').retryable).toBe(true);
  });
});
