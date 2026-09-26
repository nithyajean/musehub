import { describe, expect, it } from 'vitest';
import { type JobResult, buildResultEnvelope, overallConclusion } from './result.js';
import { buildStepResults } from './runner.js';

function job(name: string, conclusion: JobResult['conclusion']): JobResult {
  return {
    name,
    conclusion,
    exit_code: conclusion === 'success' ? 0 : 1,
    duration_ms: 10,
    steps: [],
    log_tail: '',
  };
}

describe('overallConclusion', () => {
  it('is success only when every job succeeds', () => {
    expect(overallConclusion([job('a', 'success'), job('b', 'success')])).toBe('success');
  });
  it('surfaces the most serious outcome otherwise', () => {
    expect(overallConclusion([job('a', 'success'), job('b', 'failure')])).toBe('failure');
    expect(overallConclusion([job('a', 'success'), job('b', 'timed_out')])).toBe('timed_out');
    expect(overallConclusion([job('a', 'cancelled')])).toBe('cancelled');
  });
  it('treats an empty run as success', () => {
    expect(overallConclusion([])).toBe('success');
  });
});

describe('buildResultEnvelope', () => {
  it('is a stable, versioned, machine-readable shape', () => {
    const started = new Date('2026-09-26T10:00:00.000Z');
    const finished = new Date('2026-09-26T10:00:48.210Z');
    const env = buildResultEnvelope({
      runId: 'r_01',
      commit: '9af3c21',
      mode: 'docker',
      startedAt: started,
      finishedAt: finished,
      jobs: [
        {
          name: 'test',
          conclusion: 'failure',
          exit_code: 1,
          duration_ms: 42130,
          steps: [
            { index: 0, run: 'pip install', exit_code: 0, conclusion: 'success' },
            { index: 1, run: 'pytest', exit_code: 1, conclusion: 'failure' },
          ],
          log_tail: 'AssertionError',
        },
      ],
    });
    expect(env.version).toBe(1);
    expect(env.run_id).toBe('r_01');
    expect(env.mode).toBe('docker');
    expect(env.conclusion).toBe('failure');
    expect(env.started_at).toBe('2026-09-26T10:00:00.000Z');
    expect(env.duration_ms).toBe(48210);
    expect(env.jobs[0]?.steps[1]?.conclusion).toBe('failure');
    // round-trips as JSON without loss
    expect(JSON.parse(JSON.stringify(env))).toEqual(env);
  });
});

describe('buildStepResults', () => {
  it('marks every step success when the job succeeds', () => {
    const steps = buildStepResults(['a', 'b'], new Map(), 'success');
    expect(steps.every((s) => s.conclusion === 'success' && s.exit_code === 0)).toBe(true);
  });

  it('fails the failing step and cancels the rest', () => {
    const steps = buildStepResults(['a', 'b', 'c'], new Map([[0, 0]]), 'failure');
    expect(steps[0]?.conclusion).toBe('success');
    // step 1 has no marker (it was the one that broke), step 2 never ran
    expect(steps[1]?.conclusion).toBe('cancelled');
    expect(steps[2]?.conclusion).toBe('cancelled');
  });

  it('uses the failing exit code when a marker records it', () => {
    const steps = buildStepResults(['a', 'b'], new Map([[0, 2]]), 'failure');
    expect(steps[0]).toEqual({ index: 0, run: 'a', exit_code: 2, conclusion: 'failure' });
    expect(steps[1]?.conclusion).toBe('cancelled');
  });
});
