import type { CiJob, CiRun } from '@musehub/contracts';
import type { CiRunStore, Clock, IdGen } from '@musehub/core';
import { type SQL, sql } from 'drizzle-orm';
import type { Exec, Row } from '../types.js';
import { jsonArray, str, strOrNull } from './row.js';

function mapCiRun(r: Row): CiRun {
  return {
    run_id: str(r.run_id),
    repo: str(r.repo),
    ref: str(r.ref),
    head_sha: str(r.head_sha),
    workflow: str(r.workflow),
    status: str(r.status) as CiRun['status'],
    conclusion: (strOrNull(r.conclusion) as CiRun['conclusion']) ?? null,
    started_at: strOrNull(r.started_at),
    finished_at: strOrNull(r.finished_at),
    jobs: jsonArray<CiJob>(r.jobs),
  };
}

export function makeCiRunStore(exec: Exec, clock: Clock, ids: IdGen): CiRunStore {
  return {
    async create(input): Promise<CiRun> {
      const runId = ids.newId('run');
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO ci_runs
          (run_id, repo, ref, head_sha, workflow, status, conclusion, started_at, finished_at, jobs, created_at)
        VALUES
          (${runId}, ${input.repo}, ${input.ref}, ${input.headSha}, ${input.workflow}, ${'queued'},
           ${null}, ${null}, ${null}, ${'[]'}, ${createdAt})`);
      return {
        run_id: runId,
        repo: input.repo,
        ref: input.ref,
        head_sha: input.headSha,
        workflow: input.workflow,
        status: 'queued',
        conclusion: null,
        started_at: null,
        finished_at: null,
        jobs: [],
      };
    },

    async get(repo: string, runId: string): Promise<CiRun | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM ci_runs WHERE repo = ${repo} AND run_id = ${runId}`,
      );
      return row ? mapCiRun(row) : null;
    },

    async update(repo, runId, patch): Promise<void> {
      const sets: SQL[] = [];
      if ('status' in patch && patch.status !== undefined) sets.push(sql`status = ${patch.status}`);
      if ('conclusion' in patch) sets.push(sql`conclusion = ${patch.conclusion ?? null}`);
      if ('started_at' in patch) sets.push(sql`started_at = ${patch.started_at ?? null}`);
      if ('finished_at' in patch) sets.push(sql`finished_at = ${patch.finished_at ?? null}`);
      if ('jobs' in patch && patch.jobs !== undefined) {
        sets.push(sql`jobs = ${JSON.stringify(patch.jobs)}`);
      }
      if (sets.length === 0) return;
      await exec.run(sql`
        UPDATE ci_runs SET ${sql.join(sets, sql`, `)}
        WHERE repo = ${repo} AND run_id = ${runId}`);
    },

    async findByHeadSha(repo: string, headSha: string): Promise<CiRun[]> {
      const rows = await exec.all<Row>(sql`
        SELECT * FROM ci_runs
        WHERE repo = ${repo} AND head_sha = ${headSha}
        ORDER BY created_at ASC, run_id ASC`);
      return rows.map(mapCiRun);
    },

    async appendLogs(runId: string, job: string, lines: string[]): Promise<void> {
      if (lines.length === 0) return;
      const startRow = await exec.get<{ seq: number }>(
        sql`SELECT COALESCE(MAX(seq), 0) AS seq FROM ci_logs WHERE run_id = ${runId}`,
      );
      let seq = Number(startRow?.seq ?? 0);
      for (const line of lines) {
        seq += 1;
        await exec.run(sql`
          INSERT INTO ci_logs (id, run_id, job, seq, line)
          VALUES (${ids.newId('log')}, ${runId}, ${job}, ${seq}, ${line})`);
      }
    },

    async readLogs(runId: string, job: string | undefined, tail: number): Promise<string[]> {
      const conds: SQL[] = [sql`run_id = ${runId}`];
      if (job !== undefined) conds.push(sql`job = ${job}`);
      const where = sql`WHERE ${sql.join(conds, sql` AND `)}`;
      const rows = await exec.all<{ line: string }>(
        sql`SELECT line FROM ci_logs ${where} ORDER BY seq ASC`,
      );
      const all = rows.map((r) => str(r.line));
      return tail > 0 && all.length > tail ? all.slice(all.length - tail) : all;
    },
  };
}
