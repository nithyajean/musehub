import type { Notification } from '@musehub/contracts';
import type { Clock, IdGen, NotificationStore, Page } from '@musehub/core';
import { type SQL, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { bool, num, str } from './row.js';

interface SeqCursor {
  s: number;
}

function mapNotification(r: Row): Notification {
  return {
    id: str(r.id),
    recipient: str(r.recipient),
    kind: str(r.kind),
    subject: str(r.subject),
    read: bool(r.read),
    created_at: str(r.created_at),
  };
}

export function makeNotificationStore(exec: Exec, clock: Clock, ids: IdGen): NotificationStore {
  return {
    async create(input): Promise<Notification> {
      const id = ids.newId('ntf');
      const createdAt = clock.now().toISOString();
      const seqRow = await exec.get<{ seq: number }>(
        sql`SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM notifications`,
      );
      const seq = Number(seqRow?.seq ?? 1);
      await exec.run(sql`
        INSERT INTO notifications (id, seq, recipient, kind, subject, read, created_at)
        VALUES (${id}, ${seq}, ${input.recipient}, ${input.kind}, ${input.subject}, 0, ${createdAt})`);
      return {
        id,
        recipient: input.recipient,
        kind: input.kind,
        subject: input.subject,
        read: false,
        created_at: createdAt,
      };
    },

    // Newest first, the cursor walking backward through the monotonic seq.
    async listByRecipient(recipient: string, q): Promise<Page<Notification>> {
      const base: SQL[] = [sql`recipient = ${recipient}`];
      if (q.unread) base.push(sql`read = 0`);
      const totalWhere = sql`WHERE ${sql.join(base, sql` AND `)}`;
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM notifications ${totalWhere}`,
      );
      const conds = [...base];
      const after = decodeCursor<SeqCursor>(q.cursor);
      if (after) conds.push(sql`seq < ${after.s}`);
      const where = sql`WHERE ${sql.join(conds, sql` AND `)}`;
      const rows = await exec.all<Row>(
        sql`SELECT * FROM notifications ${where} ORDER BY seq DESC LIMIT ${q.limit + 1}`,
      );
      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;
      const items = page.map(mapNotification);
      const lastRow = page[page.length - 1];
      const nextCursor =
        hasMore && lastRow ? encodeCursor({ s: num(lastRow.seq) } satisfies SeqCursor) : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },

    async markRead(recipient: string, idsToMark: string[]): Promise<number> {
      if (idsToMark.length === 0) {
        return 0;
      }
      const idList = sql.join(
        idsToMark.map((i) => sql`${i}`),
        sql`, `,
      );
      const countRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM notifications
            WHERE recipient = ${recipient} AND read = 0 AND id IN (${idList})`,
      );
      await exec.run(sql`
        UPDATE notifications SET read = 1
        WHERE recipient = ${recipient} AND read = 0 AND id IN (${idList})`);
      return Number(countRow?.n ?? 0);
    },

    async markAllRead(recipient: string): Promise<number> {
      const countRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM notifications WHERE recipient = ${recipient} AND read = 0`,
      );
      await exec.run(
        sql`UPDATE notifications SET read = 1 WHERE recipient = ${recipient} AND read = 0`,
      );
      return Number(countRow?.n ?? 0);
    },
  };
}
