import type { AuditEvent } from '@musehub/contracts';
import type { AuditLog, Clock, IdGen, Page } from '@musehub/core';
import { type SQL, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { jsonObjectOrNull, num, str } from './row.js';

interface SeqCursor {
  s: number;
}

function mapAudit(r: Row): AuditEvent {
  return {
    id: str(r.id),
    actor: str(r.actor),
    action: str(r.action),
    target: str(r.target),
    at: str(r.at),
    metadata: jsonObjectOrNull(r.metadata),
  };
}

export function makeAuditLog(exec: Exec, clock: Clock, ids: IdGen): AuditLog {
  return {
    // Append only. There is no update or delete path, by design.
    async append(e: Omit<AuditEvent, 'id' | 'at'>): Promise<AuditEvent> {
      const id = ids.newId('evt');
      const at = clock.now().toISOString();
      const seqRow = await exec.get<{ seq: number }>(
        sql`SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM audit_events`,
      );
      const seq = Number(seqRow?.seq ?? 1);
      const metadata =
        e.metadata === null || e.metadata === undefined ? null : JSON.stringify(e.metadata);
      await exec.run(sql`
        INSERT INTO audit_events (id, seq, actor, action, target, at, metadata)
        VALUES (${id}, ${seq}, ${e.actor}, ${e.action}, ${e.target}, ${at}, ${metadata})`);
      return {
        id,
        actor: e.actor,
        action: e.action,
        target: e.target,
        at,
        metadata: e.metadata ?? null,
      };
    },

    // Newest first. The cursor walks backward through the monotonic seq.
    async list(q): Promise<Page<AuditEvent>> {
      const filter: SQL[] = [];
      if (q.actor !== undefined) filter.push(sql`actor = ${q.actor}`);
      const totalWhere = filter.length ? sql`WHERE ${sql.join(filter, sql` AND `)}` : sql``;
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM audit_events ${totalWhere}`,
      );

      const conds = [...filter];
      const after = decodeCursor<SeqCursor>(q.cursor);
      if (after) conds.push(sql`seq < ${after.s}`);
      const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
      const rows = await exec.all<Row>(
        sql`SELECT * FROM audit_events ${where} ORDER BY seq DESC LIMIT ${q.limit + 1}`,
      );

      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;
      const items = page.map(mapAudit);
      const lastRow = page[page.length - 1];
      const nextCursor =
        hasMore && lastRow ? encodeCursor({ s: num(lastRow.seq) } satisfies SeqCursor) : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },
  };
}
