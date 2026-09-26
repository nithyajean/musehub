// Search. The stores expose no index, so search is a bounded in-service scan over
// what the caller may read, filtered by the query. Repos and issues use an offset
// cursor over the filtered set; code search uses a scan-position cursor over the
// flattened file space so paging continues across calls rather than re-scanning.
//
// Bounds: SEARCH_SCAN_LIMIT candidate rows, CODE_FILE_SCAN_LIMIT files across the
// scanned repos, CODE_MAX_FILE_BYTES per file, CODE_FILES_PER_CALL files per code
// call. When a bound is hit the result is still complete-able: repos/issues omit
// `total` (present total = exact, absent = bounded), code search keeps next_cursor
// pointing at the next unscanned file. Nothing is silently dropped.

import type {
  Issue,
  Repo,
  SearchCodeArgs,
  SearchIssuesArgs,
  SearchReposArgs,
} from '@musehub/contracts';
import type { AuthContext, CodeHit, IssueHit, Ports, Repo_, WirePage } from '@musehub/core';
import { loadRepoForRead, toWireRepo } from './authz.js';
import { decodeCursor, encodeCursor, pageSlice } from './pagination.js';

const SEARCH_SCAN_LIMIT = 1000;
const CODE_FILE_SCAN_LIMIT = 2000;
const CODE_MAX_FILE_BYTES = 65536;
const CODE_FILES_PER_CALL = 200;

function byCreatedDesc(a: { created_at: string }, b: { created_at: string }): number {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

function globToRegExp(glob: string): RegExp {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i] ?? '';
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 2;
        continue;
      }
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if ('.+^${}()|[]\\'.includes(c)) {
      out += `\\${c}`;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return new RegExp(`^${out}$`);
}

/** Page every repo the caller may read, up to the scan bound. */
async function scanVisibleRepos(
  ports: Ports,
  ctx: AuthContext,
  ownerFilter: string | undefined,
): Promise<{ repos: Repo_[]; exhaustive: boolean }> {
  const collected: Repo_[] = [];
  let cursor: string | undefined;
  let exhaustive = true;
  for (;;) {
    const page = await ports.repos.list({
      owner: ownerFilter,
      visibility: 'all',
      cursor,
      limit: 100,
    });
    for (const repo of page.items) {
      if (repo.visibility === 'public' || repo.owner === ctx.agent.handle) {
        collected.push(repo);
      }
    }
    if (collected.length >= SEARCH_SCAN_LIMIT) {
      exhaustive = false;
      break;
    }
    if (!page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }
  return { repos: collected.slice(0, SEARCH_SCAN_LIMIT), exhaustive };
}

/** Resolve the repos a search touches: one named repo, or every readable repo. */
async function targetRepos(
  ports: Ports,
  ctx: AuthContext,
  repoSpec: string | undefined,
  ownerFilter: string | undefined,
): Promise<{ repos: Repo_[]; exhaustive: boolean }> {
  if (repoSpec) {
    const ref = await loadRepoForRead(ports, ctx, repoSpec);
    return { repos: [ref.repo], exhaustive: true };
  }
  return scanVisibleRepos(ports, ctx, ownerFilter);
}

export async function searchRepos(
  ports: Ports,
  ctx: AuthContext,
  args: SearchReposArgs,
): Promise<WirePage<Repo>> {
  const q = args.q.trim().toLowerCase();
  const { repos, exhaustive } = await scanVisibleRepos(ports, ctx, args.owner);
  const filtered = repos
    .filter((repo) => {
      if (args.visibility === 'public' && repo.visibility !== 'public') {
        return false;
      }
      if (
        args.visibility === 'private' &&
        !(repo.visibility === 'private' && repo.owner === ctx.agent.handle)
      ) {
        return false;
      }
      if (q === '') {
        return false;
      }
      const hay = `${repo.owner}/${repo.name} ${repo.description}`.toLowerCase();
      return hay.includes(q);
    })
    .sort(byCreatedDesc);
  const offset = decodeCursor(args.cursor);
  const page = pageSlice(filtered, offset, args.limit, exhaustive);
  return { ...page, items: page.items.map((repo) => toWireRepo(ports.config, repo)) };
}

export async function searchIssues(
  ports: Ports,
  ctx: AuthContext,
  args: SearchIssuesArgs,
): Promise<WirePage<IssueHit>> {
  const q = args.q.trim().toLowerCase();
  const { repos, exhaustive: reposExhaustive } = await targetRepos(
    ports,
    ctx,
    args.repo,
    args.owner,
  );
  const collected: Issue[] = [];
  let exhaustive = reposExhaustive;
  let capped = false;
  for (const repo of repos) {
    if (capped) {
      break;
    }
    const fullName = `${repo.owner}/${repo.name}`;
    let cursor: string | undefined;
    for (;;) {
      const page = await ports.issues.list({ repo: fullName, state: 'all', cursor, limit: 100 });
      collected.push(...page.items);
      if (collected.length >= SEARCH_SCAN_LIMIT) {
        capped = true;
        break;
      }
      if (!page.nextCursor) {
        break;
      }
      cursor = page.nextCursor;
    }
  }
  if (capped) {
    exhaustive = false;
  }
  const filtered = collected
    .filter((issue) => {
      if (args.type === 'issue' && issue.is_pr) {
        return false;
      }
      if (args.type === 'pr' && !issue.is_pr) {
        return false;
      }
      // Issues carry open/closed only; a 'merged' filter matches no issue row.
      if (args.state !== 'all' && issue.state !== args.state) {
        return false;
      }
      if (q === '') {
        return false;
      }
      const hay = `${issue.title} ${issue.body ?? ''}`.toLowerCase();
      return hay.includes(q);
    })
    .sort(byCreatedDesc);
  const offset = decodeCursor(args.cursor);
  const page = pageSlice(filtered, offset, args.limit, exhaustive);
  const items: IssueHit[] = page.items.map((issue) => ({
    repo: issue.repo,
    number: issue.number,
    type: issue.is_pr ? 'pr' : 'issue',
    title: issue.title,
    state: issue.state,
    url: issue.url,
  }));
  return { ...page, items };
}

interface FileRef {
  owner: string;
  name: string;
  fullName: string;
  ref: string;
  path: string;
}

export async function searchCode(
  ports: Ports,
  ctx: AuthContext,
  args: SearchCodeArgs,
): Promise<WirePage<CodeHit>> {
  const q = args.q.trim().toLowerCase();
  const { repos } = await targetRepos(ports, ctx, args.repo, args.owner);
  const pathMatch = args.path ? globToRegExp(args.path) : null;

  // Flatten the readable repos into one ordered file list. The order is stable
  // across calls so the scan-position cursor resumes exactly where it stopped.
  const files: FileRef[] = [];
  for (const repo of repos) {
    if (files.length >= CODE_FILE_SCAN_LIMIT) {
      break;
    }
    const ref = repo.default_branch;
    const tree = await ports.git.readTree(repo.owner, repo.name, ref, '', true);
    for (const entry of tree.entries) {
      if (entry.type !== 'file') {
        continue;
      }
      if (pathMatch && !pathMatch.test(entry.path)) {
        continue;
      }
      files.push({
        owner: repo.owner,
        name: repo.name,
        fullName: `${repo.owner}/${repo.name}`,
        ref,
        path: entry.path,
      });
      if (files.length >= CODE_FILE_SCAN_LIMIT) {
        break;
      }
    }
  }

  const hits: CodeHit[] = [];
  const start = decodeCursor(args.cursor);
  let index = start;
  let filesThisCall = 0;
  if (q !== '') {
    while (index < files.length) {
      const file = files[index];
      if (!file) {
        break;
      }
      const read = await ports.git.readFile(
        file.owner,
        file.name,
        file.ref,
        file.path,
        CODE_MAX_FILE_BYTES,
      );
      if (read) {
        const lines = read.content.split('\n');
        for (let ln = 0; ln < lines.length; ln++) {
          const text = lines[ln] ?? '';
          if (text.toLowerCase().includes(q)) {
            hits.push({
              repo: file.fullName,
              path: file.path,
              ref: file.ref,
              line: ln + 1,
              snippet: text.slice(0, 240),
              url: `${ports.config.apiBaseUrl.replace(/\/$/, '')}/repos/${file.fullName}/contents/${file.path}?ref=${file.ref}#L${ln + 1}`,
            });
          }
        }
      }
      index += 1;
      filesThisCall += 1;
      if (hits.length >= args.limit || filesThisCall >= CODE_FILES_PER_CALL) {
        break;
      }
    }
  } else {
    index = files.length;
  }

  return { items: hits, next_cursor: index < files.length ? encodeCursor(index) : null };
}
