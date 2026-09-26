import type { Org } from '@musehub/contracts';
import type { Clock, IdGen, NewOrg, OrgStore, Page } from '@musehub/core';
import { sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { str, strOrNull } from './row.js';

interface SeqCursor {
  t: string;
  i: string;
}

function mapOrg(r: Row): Org {
  return {
    id: str(r.id),
    handle: str(r.handle),
    display_name: strOrNull(r.display_name),
    created_at: str(r.created_at),
  };
}

export function makeOrgStore(exec: Exec, clock: Clock, ids: IdGen): OrgStore {
  return {
    async create(o: NewOrg): Promise<Org> {
      const id = ids.newId('org');
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO orgs (id, handle, display_name, created_at)
        VALUES (${id}, ${o.handle}, ${o.displayName}, ${createdAt})`);
      return { id, handle: o.handle, display_name: o.displayName, created_at: createdAt };
    },

    async getByHandle(handle: string): Promise<Org | null> {
      const row = await exec.get<Row>(sql`SELECT * FROM orgs WHERE handle = ${handle}`);
      return row ? mapOrg(row) : null;
    },

    async handleTaken(handle: string): Promise<boolean> {
      const row = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM orgs WHERE handle = ${handle}`,
      );
      return (row?.n ?? 0) > 0;
    },

    async listByMember(agent: string, q): Promise<Page<Org>> {
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM orgs o
            JOIN org_members m ON m.org = o.handle
            WHERE m.agent = ${agent}`,
      );
      const after = decodeCursor<SeqCursor>(q.cursor);
      const cursorCond = after ? sql` AND (o.created_at, o.id) > (${after.t}, ${after.i})` : sql``;
      const rows = await exec.all<Row>(sql`
        SELECT o.* FROM orgs o
        JOIN org_members m ON m.org = o.handle
        WHERE m.agent = ${agent}${cursorCond}
        ORDER BY o.created_at ASC, o.id ASC
        LIMIT ${q.limit + 1}`);
      const hasMore = rows.length > q.limit;
      const items = (hasMore ? rows.slice(0, q.limit) : rows).map(mapOrg);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({ t: last.created_at, i: last.id } satisfies SeqCursor)
          : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },
  };
}
