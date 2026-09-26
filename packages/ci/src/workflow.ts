// Workflow parsing and validation for .musehub/ci.yml.
//
// The config is authored by an untrusted agent, so every field is validated and
// a malformed config is rejected with a clear message rather than trusted. We
// parse with js-yaml load (safe schema, no code execution or arbitrary object
// construction), then validate the shape by hand so the error messages name the
// exact problem an agent can fix. No dynamic type is trusted.
import { forgeError } from '@musehub/contracts';
import { type YAMLException, load as loadYaml } from 'js-yaml';

/** Events that can start a run. Modeled on the GitHub Actions set (R8 section 1.1). */
export type WorkflowEvent = 'push' | 'pull_request';
export const WORKFLOW_EVENTS: readonly WorkflowEvent[] = ['push', 'pull_request'];

/** Egress posture. Default deny. Allowlist needs an out-of-sandbox proxy (R8 section 2.5). */
export type NetworkMode = 'none' | 'allowlist';

export interface WorkflowStep {
  run: string;
}

export interface WorkflowJob {
  name: string;
  steps: WorkflowStep[];
  needs: string[];
}

export interface WorkflowRuntime {
  image: string;
  network: NetworkMode;
  allowEgress: string[];
}

export interface WorkflowLimits {
  cpu: string;
  memory: string;
  disk: string;
  timeout: string;
  pids: number;
}

export interface Workflow {
  version: number;
  on: WorkflowEvent[];
  runtime: WorkflowRuntime;
  limits: WorkflowLimits;
  jobs: WorkflowJob[];
}

/** The one config path the runner reads. Fixed here, never taken from the caller. */
export const CONFIG_PATH = '.musehub/ci.yml';
export const DEFAULT_NETWORK: NetworkMode = 'none';
export const DEFAULT_LIMITS: WorkflowLimits = {
  cpu: '1',
  memory: '512m',
  disk: '512m',
  timeout: '600s',
  pids: 512,
};

/** Numeric limits resolved for the container runtime. */
export interface ResolvedLimits {
  memoryBytes: number;
  nanoCpus: number;
  pidsLimit: number;
  diskBytes: number;
  timeoutMs: number;
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw forgeError('validation_failed', `${CONFIG_PATH}: ${message}`, details ? { details } : {});
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// --- scalar limit parsers (Docker-style, 1024-based memory suffixes) ---------

const MEM_FACTOR: Record<string, number> = { k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 };

/** Parse a memory or disk size to bytes. Accepts a byte count or a k/m/g/t suffix. */
export function parseBytes(input: string | number, field: string): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) fail(`${field} must be a positive size`);
    return Math.floor(input);
  }
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kmgt])?i?b?\s*$/i.exec(input);
  if (!m) fail(`${field} is not a valid size: ${JSON.stringify(input)}`);
  const value = Number.parseFloat((m as RegExpExecArray)[1] as string);
  const suffix = (m as RegExpExecArray)[2]?.toLowerCase();
  const bytes = suffix ? value * (MEM_FACTOR[suffix] as number) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) fail(`${field} must be a positive size`);
  return Math.floor(bytes);
}

/** Parse a CPU quota to whole cores (fractional allowed). */
export function parseCpu(input: string | number, field: string): number {
  const value = typeof input === 'number' ? input : Number.parseFloat(input);
  if (!Number.isFinite(value) || value <= 0) fail(`${field} must be a positive number of cores`);
  return value;
}

const DUR_FACTOR: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** Parse a wall-clock duration to milliseconds. Bare numbers are seconds. */
export function parseDuration(input: string | number, field: string): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) fail(`${field} must be a positive duration`);
    return Math.floor(input * 1000);
  }
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)?\s*$/i.exec(input);
  if (!m) fail(`${field} is not a valid duration: ${JSON.stringify(input)}`);
  const value = Number.parseFloat((m as RegExpExecArray)[1] as string);
  const unit = ((m as RegExpExecArray)[2]?.toLowerCase() ?? 's') as keyof typeof DUR_FACTOR;
  const ms = value * (DUR_FACTOR[unit] ?? 1000);
  if (!Number.isFinite(ms) || ms <= 0) fail(`${field} must be a positive duration`);
  return Math.floor(ms);
}

function parsePids(input: number, field: string): number {
  if (!Number.isInteger(input) || input <= 0) fail(`${field} must be a positive integer`);
  return input;
}

/** Turn the raw limit strings into the numbers the container runtime wants. */
export function resolveLimits(limits: WorkflowLimits): ResolvedLimits {
  return {
    memoryBytes: parseBytes(limits.memory, 'limits.memory'),
    nanoCpus: Math.round(parseCpu(limits.cpu, 'limits.cpu') * 1e9),
    pidsLimit: parsePids(limits.pids, 'limits.pids'),
    diskBytes: parseBytes(limits.disk, 'limits.disk'),
    timeoutMs: parseDuration(limits.timeout, 'limits.timeout'),
  };
}

// --- shape validation --------------------------------------------------------

function normalizeOn(raw: unknown): WorkflowEvent[] {
  if (raw === undefined) return ['push', 'pull_request'];
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) fail('on must name at least one event');
  return list.map((e) => {
    if (!WORKFLOW_EVENTS.includes(e as WorkflowEvent)) {
      fail(
        `on has an unknown event ${JSON.stringify(e)}, expected one of ${WORKFLOW_EVENTS.join(', ')}`,
      );
    }
    return e as WorkflowEvent;
  });
}

function normalizeRuntime(raw: unknown): WorkflowRuntime {
  if (!isRecord(raw)) fail('runtime is required and must be a mapping');
  const image = (raw as Record<string, unknown>).image;
  if (typeof image !== 'string' || image.trim() === '' || /\s/.test(image)) {
    fail('runtime.image is required and must be a non-empty image reference with no spaces');
  }
  const network = (raw as Record<string, unknown>).network ?? DEFAULT_NETWORK;
  if (network !== 'none' && network !== 'allowlist') {
    fail(`runtime.network must be "none" or "allowlist", got ${JSON.stringify(network)}`);
  }
  const rawEgress = (raw as Record<string, unknown>).allow_egress ?? [];
  if (!Array.isArray(rawEgress) || rawEgress.some((h) => typeof h !== 'string')) {
    fail('runtime.allow_egress must be a list of host:port strings');
  }
  return { image, network, allowEgress: rawEgress as string[] };
}

function normalizeLimits(raw: unknown): WorkflowLimits {
  if (raw === undefined) return { ...DEFAULT_LIMITS };
  if (!isRecord(raw)) fail('limits must be a mapping');
  const r = raw as Record<string, unknown>;
  const asScalar = (v: unknown, d: string): string =>
    v === undefined
      ? d
      : typeof v === 'number'
        ? String(v)
        : typeof v === 'string'
          ? v
          : fail('limits values must be scalars');
  const pidsRaw = r.pids ?? DEFAULT_LIMITS.pids;
  if (typeof pidsRaw !== 'number') fail('limits.pids must be a number');
  const limits: WorkflowLimits = {
    cpu: asScalar(r.cpu, DEFAULT_LIMITS.cpu),
    memory: asScalar(r.memory, DEFAULT_LIMITS.memory),
    disk: asScalar(r.disk, DEFAULT_LIMITS.disk),
    timeout: asScalar(r.timeout, DEFAULT_LIMITS.timeout),
    pids: pidsRaw,
  };
  resolveLimits(limits); // validates every scalar, throws with the offending field
  return limits;
}

function normalizeStep(raw: unknown, jobName: string, i: number): WorkflowStep {
  if (!isRecord(raw)) fail(`jobs.${jobName}.steps[${i}] must be a mapping with a run command`);
  const run = (raw as Record<string, unknown>).run;
  if (typeof run !== 'string' || run.trim() === '') {
    fail(`jobs.${jobName}.steps[${i}].run must be a non-empty command`);
  }
  return { run };
}

function normalizeJob(name: string, raw: unknown): WorkflowJob {
  if (!isRecord(raw)) fail(`job ${name} must be a mapping`);
  const r = raw as Record<string, unknown>;
  const rawSteps = r.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    fail(`job ${name} must have a non-empty steps list`);
  }
  const steps = rawSteps.map((s, i) => normalizeStep(s, name, i));
  const rawNeeds = r.needs ?? [];
  const needsList = Array.isArray(rawNeeds) ? rawNeeds : [rawNeeds];
  if (needsList.some((n) => typeof n !== 'string')) fail(`job ${name} needs must be job names`);
  return { name, steps, needs: needsList as string[] };
}

function normalizeJobs(raw: unknown): WorkflowJob[] {
  // Accept both the array form ([{ name, steps, needs }]) and the map form
  // ({ name: { steps, needs } }); both normalize to the array shape.
  if (Array.isArray(raw)) {
    const jobs = raw.map((j) => {
      if (!isRecord(j) || typeof (j as Record<string, unknown>).name !== 'string') {
        fail('each job in the list needs a string name');
      }
      const name = (j as Record<string, unknown>).name as string;
      return normalizeJob(name, j);
    });
    if (jobs.length === 0) fail('jobs must define at least one job');
    return jobs;
  }
  if (isRecord(raw)) {
    const names = Object.keys(raw);
    if (names.length === 0) fail('jobs must define at least one job');
    return names.map((name) => normalizeJob(name, (raw as Record<string, unknown>)[name]));
  }
  fail('jobs is required and must be a list or a mapping');
}

/**
 * Resolve execution order from needs. Kahn topological sort, so a job runs only
 * after everything it needs. Rejects a cycle or a dependency on an unknown job.
 */
export function jobOrder(jobs: WorkflowJob[]): string[] {
  const names = new Set(jobs.map((j) => j.name));
  if (names.size !== jobs.length) fail('two jobs share a name');
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const j of jobs) {
    indeg.set(j.name, j.needs.length);
    for (const need of j.needs) {
      if (!names.has(need)) fail(`job ${j.name} needs unknown job ${JSON.stringify(need)}`);
      const list = dependents.get(need) ?? [];
      list.push(j.name);
      dependents.set(need, list);
    }
  }
  const ready = jobs.filter((j) => (indeg.get(j.name) ?? 0) === 0).map((j) => j.name);
  const order: string[] = [];
  while (ready.length > 0) {
    const name = ready.shift() as string;
    order.push(name);
    for (const dep of dependents.get(name) ?? []) {
      const left = (indeg.get(dep) ?? 0) - 1;
      indeg.set(dep, left);
      if (left === 0) ready.push(dep);
    }
  }
  if (order.length !== jobs.length) fail('jobs have a cyclic needs dependency');
  return order;
}

/** Parse and fully validate a .musehub/ci.yml source. Throws validation_failed on any problem. */
export function parseWorkflow(source: string): Workflow {
  let doc: unknown;
  try {
    doc = loadYaml(source, { filename: CONFIG_PATH });
  } catch (e) {
    const msg = (e as YAMLException)?.message ?? String(e);
    fail(`invalid YAML: ${msg}`);
  }
  if (!isRecord(doc)) fail('the config must be a top-level mapping');
  const r = doc as Record<string, unknown>;
  const version = r.version ?? 1;
  if (version !== 1)
    fail(`unsupported version ${JSON.stringify(version)}, this runner speaks version 1`);
  const workflow: Workflow = {
    version: 1,
    on: normalizeOn(r.on),
    runtime: normalizeRuntime(r.runtime),
    limits: normalizeLimits(r.limits),
    jobs: normalizeJobs(r.jobs),
  };
  jobOrder(workflow.jobs); // reject cycles and unknown needs before returning
  return workflow;
}
