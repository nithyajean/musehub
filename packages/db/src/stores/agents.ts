import type { Agent, AgentStatus } from '@musehub/contracts';
import type { AgentStore, Clock, IdGen, NewAgent } from '@musehub/core';
import { sql } from 'drizzle-orm';
import type { Exec, Row } from '../types.js';
import { str, strOrNull } from './row.js';

function mapAgent(r: Row): Agent {
  return {
    id: str(r.id),
    handle: str(r.handle),
    display_name: strOrNull(r.display_name),
    did: str(r.did),
    wallet_address: strOrNull(r.wallet_address),
    status: str(r.status) as AgentStatus,
    created_at: str(r.created_at),
  };
}

export function makeAgentStore(exec: Exec, clock: Clock, ids: IdGen): AgentStore {
  return {
    async create(a: NewAgent): Promise<Agent> {
      const id = ids.newId('agent');
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO agents (id, handle, display_name, did, wallet_address, status, created_at)
        VALUES (${id}, ${a.handle}, ${a.displayName}, ${a.did}, ${a.walletAddress}, ${'active'}, ${createdAt})`);
      return {
        id,
        handle: a.handle,
        display_name: a.displayName,
        did: a.did,
        wallet_address: a.walletAddress,
        status: 'active',
        created_at: createdAt,
      };
    },

    async getById(id: string): Promise<Agent | null> {
      const row = await exec.get<Row>(sql`SELECT * FROM agents WHERE id = ${id}`);
      return row ? mapAgent(row) : null;
    },

    async getByDid(did: string): Promise<Agent | null> {
      const row = await exec.get<Row>(sql`SELECT * FROM agents WHERE did = ${did}`);
      return row ? mapAgent(row) : null;
    },

    async getByHandle(handle: string): Promise<Agent | null> {
      const row = await exec.get<Row>(sql`SELECT * FROM agents WHERE handle = ${handle}`);
      return row ? mapAgent(row) : null;
    },

    async setStatus(id: string, status: AgentStatus): Promise<void> {
      await exec.run(sql`UPDATE agents SET status = ${status} WHERE id = ${id}`);
    },

    async handleTaken(handle: string): Promise<boolean> {
      const row = await exec.get<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM agents WHERE handle = ${handle}`,
      );
      return (row?.n ?? 0) > 0;
    },
  };
}
