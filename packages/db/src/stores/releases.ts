import type { Release } from '@musehub/contracts';
import type { Clock, IdGen, NewRelease, Page, ReleaseStore } from '@musehub/core';
import { sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { bool, boolInt, str, strOrNull } from './row.js';

// The keyset walks (created_at, tag) descending, so a list reads newest first and
// ties on created_at break on the tag, which is unique within a repo.
interface ReleaseCursor {
  t: string;
  g: string;
}

function mapRelease(r: Row): Release {
  return {
    repo: str(r.repo),
    tag: str(r.tag),
    name: str(r.name),
    body: strOrNull(r.body),
    target_sha: str(r.target_sha),
    prerelease: bool(r.prerelease),
    draft: bool(r.draft),
    author: str(r.author),
    created_at: str(r.created_at),
  };
}

export function makeReleaseStore(exec: Exec, clock: Clock, _ids: IdGen): ReleaseStore {
  return {
    async create(r: NewRelease): Promise<Release> {
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO releases (repo, tag, name, body, target_sha, prerelease, draft, author, created_at)
        VALUES (${r.repo}, ${r.tag}, ${r.name}, ${r.body}, ${r.targetSha}, ${boolInt(r.prerelease)}, ${boolInt(r.draft)}, ${r.author}, ${createdAt})`);
      return {
        repo: r.repo,
        tag: r.tag,
        name: r.name,
        body: r.body,
        target_sha: r.targetSha,
        prerelease: r.prerelease,
        draft: r.draft,
        author: r.author,
        created_at: createdAt,
      };
    },

    async get(repo: string, tag: string): Promise<Release | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM releases WHERE repo = ${repo} AND tag = ${tag}`,
      );
      return row ? mapRelease(row) : null;
    },

    async list(repo: string, q): Promise<Page<Release>> {
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM releases WHERE repo = ${repo}`,
      );
      const after = decodeCursor<ReleaseCursor>(q.cursor);
      const cursorCond = after ? sql` AND (created_at, tag) < (${after.t}, ${after.g})` : sql``;
      const rows = await exec.all<Row>(sql`
        SELECT * FROM releases WHERE repo = ${repo}${cursorCond}
        ORDER BY created_at DESC, tag DESC
        LIMIT ${q.limit + 1}`);
      const hasMore = rows.length > q.limit;
      const items = (hasMore ? rows.slice(0, q.limit) : rows).map(mapRelease);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({ t: last.created_at, g: last.tag } satisfies ReleaseCursor)
          : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },

    async delete(repo: string, tag: string): Promise<boolean> {
      const existing = await exec.get<{ tag: string }>(
        sql`SELECT tag FROM releases WHERE repo = ${repo} AND tag = ${tag}`,
      );
      if (!existing) return false;
      await exec.run(sql`DELETE FROM releases WHERE repo = ${repo} AND tag = ${tag}`);
      return true;
    },
  };
}
