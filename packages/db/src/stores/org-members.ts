import type { Membership, OrgRole } from '@musehub/contracts';
import type { Clock, IdGen, OrgMemberStore, Page } from '@musehub/core';
import { sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { str } from './row.js';

interface MemberCursor {
  a: string;
}

function mapMembership(r: Row): Membership {
  return {
    org: str(r.org),
    agent: str(r.agent),
    role: str(r.role) as OrgRole,
    created_at: str(r.created_at),
  };
}

export function makeOrgMemberStore(exec: Exec, clock: Clock, _ids: IdGen): OrgMemberStore {
  return {
    async upsert(org: string, agent: string, role: OrgRole): Promise<Membership> {
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO org_members (org, agent, role, created_at)
        VALUES (${org}, ${agent}, ${role}, ${createdAt})
        ON CONFLICT(org, agent) DO UPDATE SET role = ${role}`);
      const row = await exec.get<Row>(
        sql`SELECT * FROM org_members WHERE org = ${org} AND agent = ${agent}`,
      );
      return row ? mapMembership(row) : { org, agent, role, created_at: createdAt };
    },

    async remove(org: string, agent: string): Promise<boolean> {
      const existing = await exec.get<{ agent: string }>(
        sql`SELECT agent FROM org_members WHERE org = ${org} AND agent = ${agent}`,
      );
      if (!existing) return false;
      await exec.run(sql`DELETE FROM org_members WHERE org = ${org} AND agent = ${agent}`);
      return true;
    },

    async get(org: string, agent: string): Promise<Membership | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM org_members WHERE org = ${org} AND agent = ${agent}`,
      );
      return row ? mapMembership(row) : null;
    },

    async listByOrg(org: string, q): Promise<Page<Membership>> {
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM org_members WHERE org = ${org}`,
      );
      const after = decodeCursor<MemberCursor>(q.cursor);
      const cursorCond = after ? sql` AND agent > ${after.a}` : sql``;
      const rows = await exec.all<Row>(sql`
        SELECT * FROM org_members WHERE org = ${org}${cursorCond}
        ORDER BY agent ASC LIMIT ${q.limit + 1}`);
      const hasMore = rows.length > q.limit;
      const items = (hasMore ? rows.slice(0, q.limit) : rows).map(mapMembership);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last ? encodeCursor({ a: last.agent } satisfies MemberCursor) : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },
  };
}
