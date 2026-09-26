import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMITS,
  jobOrder,
  parseBytes,
  parseCpu,
  parseDuration,
  parseWorkflow,
  resolveLimits,
} from './workflow.js';

const VALID = `
version: 1
on: [push, pull_request]
runtime:
  image: python:3.12-slim
  network: none
limits:
  cpu: "2"
  memory: 2Gi
  disk: 1Gi
  timeout: 600s
  pids: 512
jobs:
  test:
    steps:
      - run: pip install --no-index -e .
      - run: pytest -q
  lint:
    needs: [test]
    steps:
      - run: ruff check .
`;

describe('parseWorkflow (valid)', () => {
  it('parses the map form and normalizes jobs to an array', () => {
    const wf = parseWorkflow(VALID);
    expect(wf.version).toBe(1);
    expect(wf.on).toEqual(['push', 'pull_request']);
    expect(wf.runtime.image).toBe('python:3.12-slim');
    expect(wf.runtime.network).toBe('none');
    expect(wf.jobs.map((j) => j.name)).toEqual(['test', 'lint']);
    const test = wf.jobs.find((j) => j.name === 'test');
    expect(test?.steps.map((s) => s.run)).toEqual(['pip install --no-index -e .', 'pytest -q']);
    expect(wf.jobs.find((j) => j.name === 'lint')?.needs).toEqual(['test']);
  });

  it('parses the array form of jobs', () => {
    const wf = parseWorkflow(`
version: 1
runtime: { image: node:22-slim }
jobs:
  - name: build
    steps:
      - run: pnpm build
`);
    expect(wf.jobs).toHaveLength(1);
    expect(wf.jobs[0]?.name).toBe('build');
    // defaults applied
    expect(wf.on).toEqual(['push', 'pull_request']);
    expect(wf.runtime.network).toBe('none');
    expect(wf.limits).toEqual(DEFAULT_LIMITS);
  });

  it('accepts a single event as a string', () => {
    const wf = parseWorkflow(
      'runtime: { image: alpine }\non: push\njobs: { a: { steps: [{ run: "true" }] } }',
    );
    expect(wf.on).toEqual(['push']);
  });
});

describe('parseWorkflow (invalid, rejected with a clear message)', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['not a mapping', 'just a string', /top-level mapping/],
    ['bad yaml', 'runtime: [oops\n  : :', /invalid YAML/],
    ['missing runtime', 'jobs: { a: { steps: [{ run: x }] } }', /runtime is required/],
    [
      'missing image',
      'runtime: {}\njobs: { a: { steps: [{ run: x }] } }',
      /runtime.image is required/,
    ],
    [
      'image with spaces',
      'runtime: { image: "a b" }\njobs: { a: { steps: [{ run: x }] } }',
      /image reference/,
    ],
    ['no jobs', 'runtime: { image: alpine }\njobs: {}', /at least one job/],
    ['empty steps', 'runtime: { image: alpine }\njobs: { a: { steps: [] } }', /non-empty steps/],
    [
      'blank run',
      'runtime: { image: alpine }\njobs: { a: { steps: [{ run: "  " }] } }',
      /run must be a non-empty/,
    ],
    [
      'unknown event',
      'runtime: { image: alpine }\non: [deploy]\njobs: { a: { steps: [{ run: x }] } }',
      /unknown event/,
    ],
    [
      'bad memory',
      'runtime: { image: alpine }\nlimits: { memory: "lots" }\njobs: { a: { steps: [{ run: x }] } }',
      /memory is not a valid size/,
    ],
    [
      'bad version',
      'version: 2\nruntime: { image: alpine }\njobs: { a: { steps: [{ run: x }] } }',
      /unsupported version/,
    ],
    [
      'unknown need',
      'runtime: { image: alpine }\njobs: { a: { needs: [ghost], steps: [{ run: x }] } }',
      /needs unknown job/,
    ],
  ];
  for (const [label, src, re] of cases) {
    it(`rejects: ${label}`, () => {
      expect(() => parseWorkflow(src)).toThrowError(re);
    });
  }

  it('rejects a cyclic needs graph', () => {
    const src = `
runtime: { image: alpine }
jobs:
  a: { needs: [b], steps: [{ run: x }] }
  b: { needs: [a], steps: [{ run: y }] }
`;
    expect(() => parseWorkflow(src)).toThrowError(/cyclic/);
  });
});

describe('scalar limit parsers', () => {
  it('parses memory sizes to bytes', () => {
    expect(parseBytes('512m', 'm')).toBe(512 * 1024 * 1024);
    expect(parseBytes('2Gi', 'm')).toBe(2 * 1024 ** 3);
    expect(parseBytes('1024', 'm')).toBe(1024);
    expect(parseBytes(4096, 'm')).toBe(4096);
  });

  it('parses cpu cores and durations', () => {
    expect(parseCpu('2', 'c')).toBe(2);
    expect(parseCpu(1.5, 'c')).toBe(1.5);
    expect(parseDuration('600s', 't')).toBe(600_000);
    expect(parseDuration('10m', 't')).toBe(600_000);
    expect(parseDuration('500ms', 't')).toBe(500);
    expect(parseDuration(30, 't')).toBe(30_000);
  });

  it('resolves the limit block into runtime numbers', () => {
    const r = resolveLimits({ cpu: '2', memory: '512m', disk: '256m', timeout: '5m', pids: 256 });
    expect(r.nanoCpus).toBe(2e9);
    expect(r.memoryBytes).toBe(512 * 1024 * 1024);
    expect(r.diskBytes).toBe(256 * 1024 * 1024);
    expect(r.timeoutMs).toBe(300_000);
    expect(r.pidsLimit).toBe(256);
  });
});

describe('jobOrder', () => {
  it('orders dependents after their needs', () => {
    const order = jobOrder([
      { name: 'lint', steps: [{ run: 'x' }], needs: ['test'] },
      { name: 'test', steps: [{ run: 'y' }], needs: [] },
    ]);
    expect(order.indexOf('test')).toBeLessThan(order.indexOf('lint'));
  });
});
