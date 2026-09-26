import type { Team } from '@musehub/contracts';
import type { Clock, IdGen, NewTeam, Page, TeamStore } from '@musehub/core';
import { sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { str } from './row.js';

interface SlugCursor {
  s: string;
}

function mapTeam(r: Row): Team {
  return {
    id: str(r.id),
    org: str(r.org),
    slug: str(r.slug),
    name: str(r.name),
    created_at: str(r.created_at),
  };
}

export function makeTeamStore(exec: Exec, clock: Clock, ids: IdGen): TeamStore {
  return {
    async create(t: NewTeam): Promise<Team> {
      const id = ids.newId('team');
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO teams (id, org, slug, name, created_at)
        VALUES (${id}, ${t.org}, ${t.slug}, ${t.name}, ${createdAt})`);
      return { id, org: t.org, slug: t.slug, name: t.name, created_at: createdAt };
    },

    async get(org: string, slug: string): Promise<Team | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM teams WHERE org = ${org} AND slug = ${slug}`,
      );
      return row ? mapTeam(row) : null;
    },

    async listByOrg(org: string, q): Promise<Page<Team>> {
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM teams WHERE org = ${org}`,
      );
      const after = decodeCursor<SlugCursor>(q.cursor);
      const cursorCond = after ? sql` AND slug > ${after.s}` : sql``;
      const rows = await exec.all<Row>(sql`
        SELECT * FROM teams WHERE org = ${org}${cursorCond}
        ORDER BY slug ASC LIMIT ${q.limit + 1}`);
      const hasMore = rows.length > q.limit;
      const items = (hasMore ? rows.slice(0, q.limit) : rows).map(mapTeam);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last ? encodeCursor({ s: last.slug } satisfies SlugCursor) : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },
  };
}
