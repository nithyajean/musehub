import type { Webhook } from '@musehub/contracts';
import type { Clock, IdGen, NewWebhook, Page, WebhookStore } from '@musehub/core';
import { sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { bool, boolInt, jsonArray, str } from './row.js';

interface PosCursor {
  t: string;
  i: string;
}

function mapWebhook(r: Row): Webhook {
  return {
    id: str(r.id),
    repo: str(r.repo),
    url: str(r.url),
    events: jsonArray<string>(r.events),
    active: bool(r.active),
    secret: str(r.secret),
    created_at: str(r.created_at),
  };
}

/** Whether a webhook subscribed to `subscribed` should fire for `event`. */
function subscribes(subscribed: string[], event: string): boolean {
  return subscribed.includes('*') || subscribed.includes(event);
}

export function makeWebhookStore(exec: Exec, clock: Clock, ids: IdGen): WebhookStore {
  return {
    async create(w: NewWebhook): Promise<Webhook> {
      const id = ids.newId('whk');
      const createdAt = clock.now().toISOString();
      const events = JSON.stringify(w.events);
      await exec.run(sql`
        INSERT INTO webhooks (id, repo, url, events, active, secret, created_at)
        VALUES (${id}, ${w.repo}, ${w.url}, ${events}, ${boolInt(w.active)}, ${w.secret}, ${createdAt})`);
      return {
        id,
        repo: w.repo,
        url: w.url,
        events: w.events,
        active: w.active,
        secret: w.secret,
        created_at: createdAt,
      };
    },

    async get(repo: string, id: string): Promise<Webhook | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM webhooks WHERE repo = ${repo} AND id = ${id}`,
      );
      return row ? mapWebhook(row) : null;
    },

    async listByRepo(repo: string, q): Promise<Page<Webhook>> {
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM webhooks WHERE repo = ${repo}`,
      );
      const after = decodeCursor<PosCursor>(q.cursor);
      const cursorCond = after ? sql` AND (created_at, id) > (${after.t}, ${after.i})` : sql``;
      const rows = await exec.all<Row>(sql`
        SELECT * FROM webhooks WHERE repo = ${repo}${cursorCond}
        ORDER BY created_at ASC, id ASC
        LIMIT ${q.limit + 1}`);
      const hasMore = rows.length > q.limit;
      const items = (hasMore ? rows.slice(0, q.limit) : rows).map(mapWebhook);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({ t: last.created_at, i: last.id } satisfies PosCursor)
          : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },

    async listActiveForEvent(repo: string, event: string): Promise<Webhook[]> {
      const rows = await exec.all<Row>(
        sql`SELECT * FROM webhooks WHERE repo = ${repo} AND active = 1`,
      );
      return rows.map(mapWebhook).filter((w) => subscribes(w.events, event));
    },

    async delete(repo: string, id: string): Promise<boolean> {
      const existing = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM webhooks WHERE repo = ${repo} AND id = ${id}`,
      );
      if ((existing?.n ?? 0) === 0) {
        return false;
      }
      await exec.run(sql`DELETE FROM webhooks WHERE repo = ${repo} AND id = ${id}`);
      return true;
    },
  };
}
