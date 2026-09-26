import type { Collaborator, RepoPermission } from '@musehub/contracts';
import type { Clock, CollaboratorStore, IdGen, Page } from '@musehub/core';
import { sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { str } from './row.js';

interface CollabCursor {
  t: string;
  a: string;
}

function mapCollaborator(r: Row): Collaborator {
  return {
    repo: str(r.repo),
    agent: str(r.agent),
    permission: str(r.permission) as RepoPermission,
    created_at: str(r.created_at),
  };
}

export function makeCollaboratorStore(exec: Exec, clock: Clock, _ids: IdGen): CollaboratorStore {
  return {
    async upsert(repo: string, agent: string, permission: RepoPermission): Promise<Collaborator> {
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO repo_collaborators (repo, agent, permission, created_at)
        VALUES (${repo}, ${agent}, ${permission}, ${createdAt})
        ON CONFLICT(repo, agent) DO UPDATE SET permission = ${permission}`);
      const row = await exec.get<Row>(
        sql`SELECT * FROM repo_collaborators WHERE repo = ${repo} AND agent = ${agent}`,
      );
      return row ? mapCollaborator(row) : { repo, agent, permission, created_at: createdAt };
    },

    async remove(repo: string, agent: string): Promise<boolean> {
      const existing = await exec.get<{ agent: string }>(
        sql`SELECT agent FROM repo_collaborators WHERE repo = ${repo} AND agent = ${agent}`,
      );
      if (!existing) return false;
      await exec.run(sql`DELETE FROM repo_collaborators WHERE repo = ${repo} AND agent = ${agent}`);
      return true;
    },

    async get(repo: string, agent: string): Promise<Collaborator | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM repo_collaborators WHERE repo = ${repo} AND agent = ${agent}`,
      );
      return row ? mapCollaborator(row) : null;
    },

    async listByRepo(repo: string, q): Promise<Page<Collaborator>> {
      const totalRow = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM repo_collaborators WHERE repo = ${repo}`,
      );
      const after = decodeCursor<CollabCursor>(q.cursor);
      const cursorCond = after ? sql` AND (created_at, agent) > (${after.t}, ${after.a})` : sql``;
      const rows = await exec.all<Row>(sql`
        SELECT * FROM repo_collaborators WHERE repo = ${repo}${cursorCond}
        ORDER BY created_at ASC, agent ASC LIMIT ${q.limit + 1}`);
      const hasMore = rows.length > q.limit;
      const items = (hasMore ? rows.slice(0, q.limit) : rows).map(mapCollaborator);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({ t: last.created_at, a: last.agent } satisfies CollabCursor)
          : null;
      return { items, nextCursor, total: Number(totalRow?.n ?? 0) };
    },
  };
}
