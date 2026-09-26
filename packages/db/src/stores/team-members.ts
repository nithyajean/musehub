import type { TeamMember } from '@musehub/contracts';
import type { Clock, IdGen, TeamMemberStore } from '@musehub/core';
import { sql } from 'drizzle-orm';
import type { Exec, Row } from '../types.js';
import { str } from './row.js';

/** Resolve a team id from its (org, slug). Null when the team does not exist. */
async function teamId(exec: Exec, org: string, slug: string): Promise<string | null> {
  const row = await exec.get<{ id: string }>(
    sql`SELECT id FROM teams WHERE org = ${org} AND slug = ${slug}`,
  );
  return row ? str(row.id) : null;
}

export function makeTeamMemberStore(exec: Exec, clock: Clock, _ids: IdGen): TeamMemberStore {
  return {
    async add(org: string, slug: string, agent: string): Promise<TeamMember> {
      const createdAt = clock.now().toISOString();
      const id = await teamId(exec, org, slug);
      if (id === null) {
        throw new Error(`team ${org}/${slug} does not exist`);
      }
      await exec.run(sql`
        INSERT INTO team_members (team_id, org, agent, created_at)
        VALUES (${id}, ${org}, ${agent}, ${createdAt})
        ON CONFLICT(team_id, agent) DO NOTHING`);
      const row = await exec.get<Row>(
        sql`SELECT created_at FROM team_members WHERE team_id = ${id} AND agent = ${agent}`,
      );
      return { org, team: slug, agent, created_at: row ? str(row.created_at) : createdAt };
    },

    async remove(org: string, slug: string, agent: string): Promise<boolean> {
      const id = await teamId(exec, org, slug);
      if (id === null) return false;
      const existing = await exec.get<{ agent: string }>(
        sql`SELECT agent FROM team_members WHERE team_id = ${id} AND agent = ${agent}`,
      );
      if (!existing) return false;
      await exec.run(sql`DELETE FROM team_members WHERE team_id = ${id} AND agent = ${agent}`);
      return true;
    },

    async isMemberOfAnyTeam(org: string, agent: string): Promise<boolean> {
      const row = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM team_members WHERE org = ${org} AND agent = ${agent}`,
      );
      return (row?.n ?? 0) > 0;
    },

    async listByTeam(org: string, slug: string): Promise<TeamMember[]> {
      const id = await teamId(exec, org, slug);
      if (id === null) return [];
      const rows = await exec.all<Row>(
        sql`SELECT * FROM team_members WHERE team_id = ${id} ORDER BY agent ASC`,
      );
      return rows.map((r) => ({
        org,
        team: slug,
        agent: str(r.agent),
        created_at: str(r.created_at),
      }));
    },
  };
}
