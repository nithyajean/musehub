import { readFile as fsReadFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isForgeError } from '@musehub/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE, createGitBackend, gitHttpBackend, repoDir } from './index.js';

const HEX40 = /^[0-9a-f]{40}$/;
const FIXED = () => new Date('2026-09-26T00:00:00.000Z');

// Build once: a bare repo with an initial commit on main, a feature branch and
// a commit ahead on feature. Read-only tests share it; mutating cases use their
// own repo so ordering never matters.
let root: string;
let backend: ReturnType<typeof createGitBackend>;
let c1Sha: string;
let c2Sha: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'musehub-git-test-'));
  backend = createGitBackend({ root, now: FIXED });
  await backend.initRepo('alice', 'proj', { defaultBranch: 'main' });
  const c1 = await backend.createCommit({
    owner: 'alice',
    name: 'proj',
    branch: 'main',
    message: 'init',
    author: 'alice',
    changes: [
      { path: 'README.md', op: 'write', content: '# Proj\n', encoding: 'text' },
      { path: 'src/app.ts', op: 'write', content: 'export const x = 1;\n', encoding: 'text' },
    ],
  });
  if (c1 === null) throw new Error('initial commit returned null');
  c1Sha = c1.sha;
  await backend.createBranch('alice', 'proj', 'feature', c1Sha);
  const c2 = await backend.createCommit({
    owner: 'alice',
    name: 'proj',
    branch: 'feature',
    message: 'add feature',
    author: 'alice',
    expectedHead: c1Sha,
    changes: [
      { path: 'src/feature.ts', op: 'write', content: 'export const y = 2;\n', encoding: 'text' },
    ],
  });
  if (c2 === null) throw new Error('feature commit returned null');
  c2Sha = c2.sha;
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
describe('@musehub/git', () => {
  it('exports the package tag', () => {
    expect(PACKAGE).toBe('@musehub/git');
  });

  it('produces real 40-hex git SHAs', () => {
    expect(c1Sha).toMatch(HEX40);
    expect(c2Sha).toMatch(HEX40);
    expect(c1Sha).not.toBe(c2Sha);
  });

  it('reads files back through readFile', async () => {
    const readme = await backend.readFile('alice', 'proj', 'main', 'README.md', 1_000_000);
    expect(readme).not.toBeNull();
    expect(readme?.content).toBe('# Proj\n');
    expect(readme?.sha).toMatch(HEX40);
    expect(readme?.truncated).toBe(false);
    const app = await backend.readFile('alice', 'proj', 'main', 'src/app.ts', 1_000_000);
    expect(app?.content).toBe('export const x = 1;\n');
    const missing = await backend.readFile('alice', 'proj', 'main', 'nope.txt', 1000);
    expect(missing).toBeNull();
  });

  it('truncates readFile at maxBytes', async () => {
    const partial = await backend.readFile('alice', 'proj', 'main', 'README.md', 3);
    expect(partial?.truncated).toBe(true);
    expect(partial?.content.length).toBeLessThanOrEqual(3);
    expect(partial?.size).toBe('# Proj\n'.length);
  });

  it('lists a tree with paths, types and modes', async () => {
    const tree = await backend.readTree('alice', 'proj', 'main', '', false);
    const paths = tree.entries.map((e) => e.path).sort();
    expect(paths).toContain('README.md');
    expect(paths).toContain('src');
    const readme = tree.entries.find((e) => e.path === 'README.md');
    expect(readme?.type).toBe('file');
    expect(readme?.mode).toBe('100644');
    expect(readme?.sha).toMatch(HEX40);
    const srcDir = tree.entries.find((e) => e.path === 'src');
    expect(srcDir?.type).toBe('dir');
    const recursive = await backend.readTree('alice', 'proj', 'main', '', true);
    expect(recursive.entries.map((e) => e.path)).toContain('src/app.ts');
  });

  it('reports branch heads and the protected default branch', async () => {
    const head = await backend.getBranchHead('alice', 'proj', 'main');
    expect(head).toBe(c1Sha);
    const feature = await backend.getBranchHead('alice', 'proj', 'feature');
    expect(feature).toBe(c2Sha);
    const branches = await backend.listBranches('alice', 'proj');
    const main = branches.find((b) => b.name === 'main');
    expect(main?.protected).toBe(true);
    expect(main?.head_sha).toMatch(HEX40);
    const feat = branches.find((b) => b.name === 'feature');
    expect(feat?.protected).toBe(false);
  });

  it('returns commit metadata', async () => {
    const commit = await backend.getCommit('alice', 'proj', c1Sha);
    expect(commit).not.toBeNull();
    expect(commit?.sha).toBe(c1Sha);
    expect(commit?.author).toBe('alice');
    expect(commit?.message).toBe('init');
    expect(commit?.parents).toEqual([]);
    expect(commit?.tree_sha).toMatch(HEX40);
    const child = await backend.getCommit('alice', 'proj', c2Sha);
    expect(child?.parents).toEqual([c1Sha]);
    expect(await backend.getCommit('alice', 'proj', 'f'.repeat(40))).toBeNull();
  });

  it('diffs two refs as summary and patch', async () => {
    const summary = await backend.diff('alice', 'proj', 'main', 'feature', 'summary', 1_000_000);
    expect(summary.baseSha).toBe(c1Sha);
    expect(summary.headSha).toBe(c2Sha);
    const added = summary.files.find((f) => f.path === 'src/feature.ts');
    expect(added?.status).toBe('added');
    expect(added?.additions).toBe(1);
    const patch = await backend.diff('alice', 'proj', 'main', 'feature', 'patch', 1_000_000);
    expect(patch.patch).toContain('src/feature.ts');
    expect(patch.patch).toContain('+export const y = 2;');
  });

  it('canMerge reports a clean fast-forward', async () => {
    expect(await backend.canMerge('alice', 'proj', 'main', 'feature')).toBe(true);
  });
  it('merges a fast-forward by advancing the base', async () => {
    await backend.initRepo('bob', 'ff', { defaultBranch: 'main' });
    const base = await backend.createCommit({
      owner: 'bob',
      name: 'ff',
      branch: 'main',
      message: 'base',
      author: 'bob',
      changes: [{ path: 'a.txt', op: 'write', content: 'a\n', encoding: 'text' }],
    });
    await backend.createBranch('bob', 'ff', 'topic', base?.sha ?? '');
    const ahead = await backend.createCommit({
      owner: 'bob',
      name: 'ff',
      branch: 'topic',
      message: 'ahead',
      author: 'bob',
      changes: [{ path: 'b.txt', op: 'write', content: 'b\n', encoding: 'text' }],
    });
    const res = await backend.merge({
      owner: 'bob',
      name: 'ff',
      base: 'main',
      head: 'topic',
      method: 'merge',
      message: 'merge topic',
      author: 'bob',
    });
    expect(res.mergeSha).toBe(ahead?.sha);
    expect(await backend.getBranchHead('bob', 'ff', 'main')).toBe(ahead?.sha);
  });

  it('merges diverging branches into a two-parent commit', async () => {
    await backend.initRepo('bob', 'div', { defaultBranch: 'main' });
    const base = await backend.createCommit({
      owner: 'bob',
      name: 'div',
      branch: 'main',
      message: 'base',
      author: 'bob',
      changes: [{ path: 'root.txt', op: 'write', content: 'root\n', encoding: 'text' }],
    });
    const baseSha = base?.sha ?? '';
    await backend.createBranch('bob', 'div', 'topic', baseSha);
    await backend.createCommit({
      owner: 'bob',
      name: 'div',
      branch: 'main',
      message: 'on main',
      author: 'bob',
      expectedHead: baseSha,
      changes: [{ path: 'on-main.txt', op: 'write', content: 'm\n', encoding: 'text' }],
    });
    await backend.createCommit({
      owner: 'bob',
      name: 'div',
      branch: 'topic',
      message: 'on topic',
      author: 'bob',
      expectedHead: baseSha,
      changes: [{ path: 'on-topic.txt', op: 'write', content: 't\n', encoding: 'text' }],
    });
    expect(await backend.canMerge('bob', 'div', 'main', 'topic')).toBe(true);
    const res = await backend.merge({
      owner: 'bob',
      name: 'div',
      base: 'main',
      head: 'topic',
      method: 'merge',
      message: 'merge topic into main',
      author: 'bob',
    });
    expect(res.mergeSha).toMatch(HEX40);
    const mergeCommit = await backend.getCommit('bob', 'div', res.mergeSha);
    expect(mergeCommit?.parents).toHaveLength(2);
    // Both files are present after the merge.
    const tree = await backend.readTree('bob', 'div', 'main', '', true);
    const paths = tree.entries.map((e) => e.path);
    expect(paths).toContain('on-main.txt');
    expect(paths).toContain('on-topic.txt');
  });

  it('returns unchanged when the tree is identical', async () => {
    await backend.initRepo('carol', 'same', { defaultBranch: 'main' });
    const first = await backend.createCommit({
      owner: 'carol',
      name: 'same',
      branch: 'main',
      message: 'first',
      author: 'carol',
      changes: [{ path: 'f.txt', op: 'write', content: 'same\n', encoding: 'text' }],
    });
    const again = await backend.createCommit({
      owner: 'carol',
      name: 'same',
      branch: 'main',
      message: 'no change',
      author: 'carol',
      changes: [{ path: 'f.txt', op: 'write', content: 'same\n', encoding: 'text' }],
    });
    expect(again?.unchanged).toBe(true);
    expect(again?.sha).toBe(first?.sha);
  });

  it('rejects a commit with a stale expectedHead', async () => {
    await backend.initRepo('carol', 'cas', { defaultBranch: 'main' });
    await backend.createCommit({
      owner: 'carol',
      name: 'cas',
      branch: 'main',
      message: 'first',
      author: 'carol',
      changes: [{ path: 'f.txt', op: 'write', content: 'one\n', encoding: 'text' }],
    });
    try {
      await backend.createCommit({
        owner: 'carol',
        name: 'cas',
        branch: 'main',
        message: 'racy',
        author: 'carol',
        expectedHead: '0'.repeat(40),
        changes: [{ path: 'f.txt', op: 'write', content: 'two\n', encoding: 'text' }],
      });
      throw new Error('expected stale_ref');
    } catch (e) {
      expect(isForgeError(e) && e.code).toBe('stale_ref');
    }
  });

  it('validates owner and repo names against path traversal', async () => {
    await expect(backend.getBranchHead('..', 'x', 'main')).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('reports repo_not_found for a missing repo', async () => {
    await expect(backend.readTree('ghost', 'none', 'main', '', false)).rejects.toMatchObject({
      code: 'repo_not_found',
    });
  });

  it('installs an executable pre-receive gate hook', async () => {
    const hook = join(repoDir(root, 'alice', 'proj'), 'hooks', 'pre-receive');
    const info = await stat(hook);
    expect(info.mode & 0o111).not.toBe(0);
    const body = await fsReadFile(hook, 'utf8');
    expect(body).toContain('MuseHub pre-receive gate');
  });

  it('serves the smart-HTTP upload-pack advertisement', async () => {
    const handle = gitHttpBackend({ root });
    const res = await handle({
      method: 'GET',
      url: '/alice/proj.git/info/refs?service=git-upload-pack',
      headers: {},
    });
    expect(res.status).toBe(200);
    const contentType = Object.entries(res.headers).find(
      ([k]) => k.toLowerCase() === 'content-type',
    )?.[1];
    expect(contentType).toContain('x-git-upload-pack-advertisement');
    const head = res.body.subarray(0, 5).toString('utf8');
    expect(head).toMatch(/^[0-9a-f]{4}#/);
    expect(res.body.toString('utf8')).toContain('service=git-upload-pack');
  });
});
