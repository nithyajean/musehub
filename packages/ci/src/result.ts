// The machine-readable result.json envelope (R8 section 3.2).
//
// A Muse agent cannot skim a log the way a human does, so the runner emits a
// stable, versioned envelope an agent parses to find which job and which step
// failed and to drive its fix loop. Keep it additive-only: an agent's parser
// breaks on a renamed or removed field, so the contract matters more than for a
// human reader.
import type { CiJob } from '@musehub/contracts';

/**
 * The four run outcomes, tied to the contract so the two cannot drift. `@musehub/
 * contracts` exports CiConclusion only as a zod value, so we derive the type from
 * CiJob.conclusion rather than restating the literals.
 */
export type CiConclusion = NonNullable<CiJob['conclusion']>;

/** How the run executed. `docker` is the real sandbox, `stub` ran nothing. */
export type RunnerMode = 'docker' | 'stub';

export interface StepResult {
  index: number;
  run: string;
  exit_code: number | null;
  conclusion: CiConclusion;
}

export interface JobResult {
  name: string;
  conclusion: CiConclusion;
  exit_code: number | null;
  duration_ms: number;
  steps: StepResult[];
  log_tail: string;
}

export interface ResultEnvelope {
  version: 1;
  run_id: string;
  commit: string;
  mode: RunnerMode;
  conclusion: CiConclusion;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  jobs: JobResult[];
}

export interface BuildEnvelopeInput {
  runId: string;
  commit: string;
  mode: RunnerMode;
  startedAt: Date;
  finishedAt: Date;
  jobs: JobResult[];
}

/**
 * Roll per-job results into the run envelope. The overall conclusion is success
 * only when every job succeeded (R8, task rule). Otherwise the most serious
 * outcome wins: a real failure over a timeout over a job cancelled because an
 * upstream job it needed did not pass.
 */
export function overallConclusion(jobs: JobResult[]): CiConclusion {
  if (jobs.length === 0) return 'success';
  if (jobs.every((j) => j.conclusion === 'success')) return 'success';
  if (jobs.some((j) => j.conclusion === 'failure')) return 'failure';
  if (jobs.some((j) => j.conclusion === 'timed_out')) return 'timed_out';
  return 'cancelled';
}

export function buildResultEnvelope(input: BuildEnvelopeInput): ResultEnvelope {
  return {
    version: 1,
    run_id: input.runId,
    commit: input.commit,
    mode: input.mode,
    conclusion: overallConclusion(input.jobs),
    started_at: input.startedAt.toISOString(),
    finished_at: input.finishedAt.toISOString(),
    duration_ms: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
    jobs: input.jobs,
  };
}
