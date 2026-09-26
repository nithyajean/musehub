import type { WebhookDelivery, WebhookDeliveryStatus } from '@musehub/contracts';
import type { Clock, IdGen, NewDelivery, Page, WebhookDeliveryStore } from '@musehub/core';
import { sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { num, str, strOrNull } from './row.js';

interface SeqCursor {
  s: number;
}

function mapDelivery(r: Row): WebhookDelivery {
  return {
    id: str(r.id),
    webhook_id: str(r.webhook_id),
    repo: str(r.repo),
    event: str(r.event),
    status: str(r.status) as WebhookDeliveryStatus,
    status_code: r.status_code === null || r.status_code === undefined ? null : num(r.status_code),
    error: strOrNull(r.error),
    created_at: str(r.created_at),
  };
}

export function makeWebhookDeliveryStore(
  exec: Exec,
  clock: Clock,
  ids: IdGen,
): WebhookDeliveryStore {
  return {
    async record(d: NewDelivery): Promise<WebhookDelivery> {
      const id = ids.newId('whd');
      const createdAt = clock.now().toISOString();
      const seqRow = await exec.get<{ seq: number }>(
        sql`SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM webhook_deliveries`,
      );
      const seq = Number(seqRow?.seq ?? 1);
      await exec.run(sql`
        INSERT INTO webhook_deliveries (id, seq, webhook_id, repo, event, status, status_code, error, created_at)
        VALUES (${id}, ${seq}, ${d.webhookId}, ${d.repo}, ${d.event}, ${d.status}, ${d.statusCode}, ${d.error}, ${createdAt})`);
      return {
        id,
        webhook_id: d.webhookId,
        repo: d.repo,
        event: d.event,
        status: d.status,
        status_code: d.statusCode,
        error: d.error,
        created_at: createdAt,
      };
    },

    // Newest first, the cursor walking backward through the monotonic seq.
    async listByWebhook(webhookId: string, q): Promise<Page<WebhookDelivery>> {
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM webhook_deliveries WHERE webhook_id = ${webhookId}`,
      );
      const conds = [sql`webhook_id = ${webhookId}`];
      const after = decodeCursor<SeqCursor>(q.cursor);
      if (after) conds.push(sql`seq < ${after.s}`);
      const where = sql`WHERE ${sql.join(conds, sql` AND `)}`;
      const rows = await exec.all<Row>(
        sql`SELECT * FROM webhook_deliveries ${where} ORDER BY seq DESC LIMIT ${q.limit + 1}`,
      );
      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;
      const items = page.map(mapDelivery);
      const lastRow = page[page.length - 1];
      const nextCursor =
        hasMore && lastRow ? encodeCursor({ s: num(lastRow.seq) } satisfies SeqCursor) : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },
  };
}
