import type { Clock, IdGen, SessionStore } from '@musehub/core';
import { sql } from 'drizzle-orm';
import type { Exec } from '../types.js';
import { str } from './row.js';

/** The working branch an agent's commit calls default to, one per agent per repo. */
export function makeSessionStore(exec: Exec, clock: Clock, _ids: IdGen): SessionStore {
  return {
    async getWorkingBranch(agentId: string, repo: string): Promise<string | null> {
      const row = await exec.get<{ branch: string }>(
        sql`SELECT branch FROM sessions WHERE agent_id = ${agentId} AND repo = ${repo}`,
      );
      return row ? str(row.branch) : null;
    },

    async setWorkingBranch(agentId: string, repo: string, branch: string): Promise<void> {
      const updatedAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO sessions (agent_id, repo, branch, updated_at)
        VALUES (${agentId}, ${repo}, ${branch}, ${updatedAt})
        ON CONFLICT(agent_id, repo) DO UPDATE SET branch = ${branch}, updated_at = ${updatedAt}`);
    },
  };
}
