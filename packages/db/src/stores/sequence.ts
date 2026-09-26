// Per-repo number allocator. Pull requests and issues share one sequence per repo,
// the way GitHub numbers them, so a repo's PRs and issues never collide and each new
// one takes the next integer. The upsert with RETURNING is atomic on both dialects.

import { sql } from 'drizzle-orm';
import type { Exec } from '../types.js';

/** Allocate and return the next number for a repo. First call returns 1. */
export async function nextRepoNumber(exec: Exec, repo: string): Promise<number> {
  const row = await exec.get<{ last_number: number }>(sql`
    INSERT INTO repo_sequences (repo, last_number) VALUES (${repo}, 1)
    ON CONFLICT(repo) DO UPDATE SET last_number = repo_sequences.last_number + 1
    RETURNING last_number`);
  if (!row) throw new Error(`failed to allocate a number for repo ${repo}`);
  return Number(row.last_number);
}
