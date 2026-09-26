import type { PrState, PullRequest } from '@musehub/contracts';
import type { Clock, IdGen, Page, PullRequestStore } from '@musehub/core';
import { type SQL, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { bool, boolInt, boolOrNull, num, str, strOrNull } from './row.js';
import { nextRepoNumber } from './sequence.js';

interface NumberCursor {
  n: number;
}

function mapPr(r: Row): PullRequest {
  return {
    number: num(r.number),
    repo: str(r.repo),
    state: str(r.state) as PrState,
    title: str(r.title),
    body: strOrNull(r.body),
    head: str(r.head),
    base: str(r.base),
    draft: bool(r.draft),
    mergeable: boolOrNull(r.mergeable),
    author: str(r.author),
    head_sha: str(r.head_sha),
    url: str(r.url),
    created_at: str(r.created_at),
  };
}

export function makePullRequestStore(exec: Exec, clock: Clock, _ids: IdGen): PullRequestStore {
  return {
    async create(input): Promise<PullRequest> {
      const number = await nextRepoNumber(exec, input.repo);
      const createdAt = clock.now().toISOString();
      const url = `/${input.repo}/pull/${number}`;
      await exec.run(sql`
        INSERT INTO pull_requests
          (repo, number, state, title, body, head, base, draft, mergeable, author, head_sha, url, created_at)
        VALUES
          (${input.repo}, ${number}, ${'open'}, ${input.title}, ${input.body}, ${input.head},
           ${input.base}, ${boolInt(input.draft)}, ${null}, ${input.author}, ${input.headSha},
           ${url}, ${createdAt})`);
      return {
        number,
        repo: input.repo,
        state: 'open',
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: input.draft,
        mergeable: null,
        author: input.author,
        head_sha: input.headSha,
        url,
        created_at: createdAt,
      };
    },

    async get(repo: string, number: number): Promise<PullRequest | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM pull_requests WHERE repo = ${repo} AND number = ${number}`,
      );
      return row ? mapPr(row) : null;
    },

    async list(q): Promise<Page<PullRequest>> {
      const base: SQL[] = [sql`repo = ${q.repo}`];
      if (q.state !== 'all') base.push(sql`state = ${q.state}`);
      if (q.base !== undefined) base.push(sql`base = ${q.base}`);
      if (q.head !== undefined) base.push(sql`head = ${q.head}`);

      const totalWhere = sql`WHERE ${sql.join(base, sql` AND `)}`;
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM pull_requests ${totalWhere}`,
      );

      const conds = [...base];
      const after = decodeCursor<NumberCursor>(q.cursor);
      if (after) conds.push(sql`number > ${after.n}`);
      const where = sql`WHERE ${sql.join(conds, sql` AND `)}`;
      const rows = await exec.all<Row>(
        sql`SELECT * FROM pull_requests ${where} ORDER BY number ASC LIMIT ${q.limit + 1}`,
      );

      const hasMore = rows.length > q.limit;
      const items = (hasMore ? rows.slice(0, q.limit) : rows).map(mapPr);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last ? encodeCursor({ n: last.number } satisfies NumberCursor) : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },

    async findOpenByHeadBase(
      repo: string,
      head: string,
      base: string,
    ): Promise<PullRequest | null> {
      const row = await exec.get<Row>(sql`
        SELECT * FROM pull_requests
        WHERE repo = ${repo} AND head = ${head} AND base = ${base} AND state = ${'open'}
        ORDER BY number ASC LIMIT 1`);
      return row ? mapPr(row) : null;
    },

    async setState(repo: string, number: number, state: PrState): Promise<void> {
      await exec.run(
        sql`UPDATE pull_requests SET state = ${state} WHERE repo = ${repo} AND number = ${number}`,
      );
    },

    async setMergeable(repo: string, number: number, mergeable: boolean | null): Promise<void> {
      const value = mergeable === null ? null : boolInt(mergeable);
      await exec.run(
        sql`UPDATE pull_requests SET mergeable = ${value} WHERE repo = ${repo} AND number = ${number}`,
      );
    },
  };
}
