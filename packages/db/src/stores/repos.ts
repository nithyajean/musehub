import type { NewRepo, Page, RepoQuery, RepoStore, Repo_ } from '@musehub/core';
import type { Clock, IdGen } from '@musehub/core';
import { type SQL, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { bool, boolInt, str } from './row.js';

interface RepoCursor {
  t: string;
  i: string;
}

function mapRepo(r: Row): Repo_ {
  return {
    id: str(r.id),
    owner: str(r.owner),
    name: str(r.name),
    visibility: str(r.visibility) as Repo_['visibility'],
    description: str(r.description),
    default_branch: str(r.default_branch),
    empty: bool(r.empty),
    created_at: str(r.created_at),
  };
}

export function makeRepoStore(exec: Exec, clock: Clock, ids: IdGen): RepoStore {
  return {
    async create(r: NewRepo): Promise<Repo_> {
      const id = ids.newId('repo');
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO repos (id, owner, name, visibility, description, default_branch, empty, created_at)
        VALUES (${id}, ${r.owner}, ${r.name}, ${r.visibility}, ${r.description}, ${r.defaultBranch}, ${boolInt(true)}, ${createdAt})`);
      return {
        id,
        owner: r.owner,
        name: r.name,
        visibility: r.visibility,
        description: r.description,
        default_branch: r.defaultBranch,
        empty: true,
        created_at: createdAt,
      };
    },

    async get(owner: string, name: string): Promise<Repo_ | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM repos WHERE owner = ${owner} AND name = ${name}`,
      );
      return row ? mapRepo(row) : null;
    },

    async list(q: RepoQuery): Promise<Page<Repo_>> {
      const conds: SQL[] = [];
      if (q.owner !== undefined) conds.push(sql`owner = ${q.owner}`);
      if (q.visibility && q.visibility !== 'all') conds.push(sql`visibility = ${q.visibility}`);
      const after = decodeCursor<RepoCursor>(q.cursor);
      if (after) conds.push(sql`(created_at, id) > (${after.t}, ${after.i})`);
      const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

      const rows = await exec.all<Row>(
        sql`SELECT * FROM repos ${where} ORDER BY created_at ASC, id ASC LIMIT ${q.limit + 1}`,
      );

      const filterConds: SQL[] = [];
      if (q.owner !== undefined) filterConds.push(sql`owner = ${q.owner}`);
      if (q.visibility && q.visibility !== 'all')
        filterConds.push(sql`visibility = ${q.visibility}`);
      const totalWhere = filterConds.length
        ? sql`WHERE ${sql.join(filterConds, sql` AND `)}`
        : sql``;
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM repos ${totalWhere}`,
      );

      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;
      const items = page.map(mapRepo);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({ t: last.created_at, i: last.id } satisfies RepoCursor)
          : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },

    async delete(owner: string, name: string): Promise<boolean> {
      const existing = await exec.get<{ id: string }>(
        sql`SELECT id FROM repos WHERE owner = ${owner} AND name = ${name}`,
      );
      if (!existing) return false;
      await exec.run(sql`DELETE FROM repos WHERE owner = ${owner} AND name = ${name}`);
      return true;
    },

    async setEmpty(owner: string, name: string, empty: boolean): Promise<void> {
      await exec.run(
        sql`UPDATE repos SET empty = ${boolInt(empty)} WHERE owner = ${owner} AND name = ${name}`,
      );
    },
  };
}
