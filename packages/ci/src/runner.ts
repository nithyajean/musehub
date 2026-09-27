// The CI runner. Implements the @musehub/core CiRunner port.
//
// THREAT MODEL (read before changing anything here). The author of the code this
// runner builds and runs is an autonomous, possibly adversarial agent. The step
// commands in .musehub/ci.yml are attacker-controlled code: running a job is
// executing untrusted code. The forge is network-exposed by design, so this
// runner is remote-code-execution-as-a-service. Isolation and default-deny egress
// are therefore the product, not hardening extras. Every job runs in a fresh,
// throwaway, network-denied, capability-stripped, read-only, resource-capped
// container and is torn down after. The wall-clock timeout is enforced by this
// parent process and force-kills the container, never trusted to the job. The
// container exit code from the daemon is the authoritative verdict for a job, so
// output an agent prints cannot forge a pass. This first-mile boundary is
// hardened Docker on the shared host kernel (R8 section 4): good enough to prove
// the pipeline and the limits, not the multi-tenant production boundary, which
// moves off the host kernel (gVisor or a microVM, R8 section 2).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { CiJob } from '@musehub/contracts';
import type { CiRunStore, CiRunner, Clock } from '@musehub/core';
import {
  type CiConclusion,
  type JobResult,
  type ResultEnvelope,
  type RunnerMode,
  type StepResult,
  buildResultEnvelope,
} from './result.js';
import {
  type ContainerSpec,
  buildContainerSpec,
  buildJobScript,
  parseStepMarkers,
  stripStepMarkers,
} from './spec.js';
import {
  CONFIG_PATH,
  type ResolvedLimits,
  type Workflow,
  type WorkflowJob,
  jobOrder,
  parseWorkflow,
  resolveLimits,
} from './workflow.js';

// --- injected collaborators (structural, so a fake needs no daemon) ----------

/** The docker-modem method used to split a container's multiplexed log stream. */
export interface DockerModemLike {
  demuxStream(
    stream: NodeJS.ReadableStream,
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ): void;
  followProgress?(stream: NodeJS.ReadableStream, onFinished: (err: unknown) => void): void;
}

/** One ephemeral container. The subset of dockerode's Container the runner uses. */
export interface ContainerHandle {
  start(): Promise<unknown>;
  wait(): Promise<{ StatusCode: number }>;
  kill(opts?: { signal?: string }): Promise<unknown>;
  remove(opts?: { force?: boolean }): Promise<unknown>;
  attach(opts: { stream: true; stdout: true; stderr: true }): Promise<NodeJS.ReadableStream>;
  modem: DockerModemLike;
}

/** The subset of a dockerode connection the runner uses. */
export interface DockerEngine {
  createContainer(spec: ContainerSpec): Promise<ContainerHandle>;
  listImages(opts?: { filters?: string }): Promise<Array<{ RepoTags?: string[] | null }>>;
  pull(repoTag: string, opts?: object): Promise<NodeJS.ReadableStream>;
  modem: DockerModemLike;
}

/** A read-only checkout of a repo at a commit. Discarded after the run. */
export interface Workspace {
  /** Absolute host path mounted read-only into the sandbox. */
  readonly dir: string;
  /** Read a repo-relative file as utf8, or null if it does not exist. */
  readFile(relPath: string): Promise<string | null>;
  /** Release the checkout. Always called in a finally. */
  dispose(): Promise<void>;
}

/**
 * Materializes a read-only checkout for a run. The CiRunner port passes only
 * { runId, owner, name, headSha, workflow } with no way to reach the git backend
 * or the config file, so this collaborator is injected. Composition (services/
 * server) wires it to the GitBackend. See the interface-friction note in the
 * package summary.
 */
export interface WorkspaceProvider {
  checkout(owner: string, name: string, headSha: string): Promise<Workspace>;
}

export interface CiRunnerOptions {
  /** The one config path read from the checkout. Fixed, never the caller's input. */
  configPath: string;
  /** Pull the base image if it is not present locally (real path only). */
  autoPull: boolean;
  /** Cap on captured output per job, so a chatty or malicious job cannot OOM the host. */
  maxLogBytes: number;
  /** Bytes of trailing output kept in the result envelope per job. */
  logTailBytes: number;
  /** When set, write <resultsDir>/<runId>/result.json to disk as well as to the log store. */
  resultsDir: string | null;
}

export interface CiRunnerDeps {
  store: CiRunStore;
  clock: Clock;
  workspace: WorkspaceProvider;
  /** A dockerode-shaped engine. Absent or null selects stub mode. */
  docker?: DockerEngine | null;
  /** Force stub mode (no container is ever created) even if a docker is supplied. */
  stub?: boolean;
  options?: Partial<CiRunnerOptions>;
}

const DEFAULT_OPTIONS: CiRunnerOptions = {
  configPath: CONFIG_PATH,
  autoPull: true,
  maxLogBytes: 1024 * 1024,
  logTailBytes: 4096,
  resultsDir: null,
};

/** The reserved log channel the result envelope is mirrored to. */
export const RESULT_LOG_JOB = '_result';
/** The reserved log channel runner-level notices are written to. */
const RUNNER_LOG_JOB = '_runner';

/** Cast a dockerode connection to the engine interface the runner expects. */
export function fromDockerode(docker: unknown): DockerEngine {
  return docker as DockerEngine;
}

// --- output capture (bounded so a chatty or malicious job cannot OOM the host) --

class BoundedBuffer {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  constructor(private readonly limit: number) {}
  write(chunk: Buffer): void {
    if (this.size >= this.limit) {
      this.truncated = true;
      return;
    }
    const room = this.limit - this.size;
    if (chunk.length > room) {
      this.chunks.push(chunk.subarray(0, room));
      this.size = this.limit;
      this.truncated = true;
    } else {
      this.chunks.push(chunk);
      this.size += chunk.length;
    }
  }
  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

function collector(limit: number): { sink: Writable; buffer: BoundedBuffer } {
  const buffer = new BoundedBuffer(limit);
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      buffer.write(Buffer.from(chunk));
      cb();
    },
  });
  return { sink, buffer };
}

/** Split raw output into log lines, dropping a single trailing empty line. */
function toLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Turn the captured step markers into per-step results. The job conclusion, which
 * comes from the authoritative container exit code, decides the shape: on success
 * every step passed; otherwise steps run until the first that did not complete,
 * and everything after it is cancelled.
 */
export function buildStepResults(
  steps: string[],
  markers: Map<number, number>,
  jobConclusion: CiConclusion,
): StepResult[] {
  const out: StepResult[] = [];
  let stopped = false;
  steps.forEach((run, index) => {
    if (jobConclusion === 'success') {
      out.push({ index, run, exit_code: 0, conclusion: 'success' });
      return;
    }
    if (stopped) {
      out.push({ index, run, exit_code: null, conclusion: 'cancelled' });
      return;
    }
    const exit = markers.get(index);
    if (exit === undefined) {
      out.push({
        index,
        run,
        exit_code: null,
        conclusion: jobConclusion === 'timed_out' ? 'timed_out' : 'cancelled',
      });
      stopped = true;
    } else if (exit === 0) {
      out.push({ index, run, exit_code: 0, conclusion: 'success' });
    } else {
      out.push({ index, run, exit_code: exit, conclusion: 'failure' });
      stopped = true;
    }
  });
  return out;
}

/** A synthetic failed job used when the runner itself, not a step, is the cause. */
function failedRunnerJob(name: string, message: string, from: Date, to: Date): JobResult {
  return {
    name,
    conclusion: 'failure',
    exit_code: null,
    duration_ms: Math.max(0, to.getTime() - from.getTime()),
    steps: [],
    log_tail: message,
  };
}

class CiRunnerImpl implements CiRunner {
  private readonly store: CiRunStore;
  private readonly clock: Clock;
  private readonly workspace: WorkspaceProvider;
  private readonly docker: DockerEngine | null;
  private readonly options: CiRunnerOptions;
  private readonly mode: RunnerMode;

  constructor(deps: CiRunnerDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
    this.workspace = deps.workspace;
    this.docker = deps.docker ?? null;
    this.options = { ...DEFAULT_OPTIONS, ...(deps.options ?? {}) };
    // Stub mode when forced or when there is no daemon to talk to. It never
    // creates a container, so the system degrades safely with Docker absent.
    this.mode = this.docker && !deps.stub ? 'docker' : 'stub';
  }

  async start(input: Parameters<CiRunner['start']>[0]): Promise<void> {
    const repo = `${input.owner}/${input.name}`;
    const startedAt = this.clock.now();
    await this.store.update(repo, input.runId, {
      status: 'running',
      started_at: startedAt.toISOString(),
    });

    let workspace: Workspace | null = null;
    const results = new Map<string, JobResult>();
    try {
      workspace = await this.workspace.checkout(input.owner, input.name, input.headSha);
      const source = await workspace.readFile(this.options.configPath);
      if (source === null) {
        const msg = `no ${this.options.configPath} at ${input.headSha}, nothing to run`;
        await this.note(input.runId, msg);
        await this.finish(repo, input, startedAt, [
          failedRunnerJob('config', msg, startedAt, this.clock.now()),
        ]);
        return;
      }

      let workflow: Workflow;
      try {
        workflow = parseWorkflow(source);
      } catch (e) {
        const msg = `config rejected: ${(e as Error).message}`;
        await this.note(input.runId, msg);
        await this.finish(repo, input, startedAt, [
          failedRunnerJob('config', msg, startedAt, this.clock.now()),
        ]);
        return;
      }

      const limits = resolveLimits(workflow.limits);
      if (workflow.runtime.network !== 'none') {
        await this.note(
          input.runId,
          `runtime.network "${workflow.runtime.network}" is not honored by the Docker first-mile runner. Jobs run with no network (fail closed). Egress allowlist needs an out-of-sandbox proxy.`,
        );
      }
      if (this.mode === 'stub') {
        await this.note(
          input.runId,
          'STUB MODE: no Docker daemon. No container is created, no code runs and no isolation is applied. Job results are simulated for a demo, not a real build.',
        );
      }

      const order = jobOrder(workflow.jobs);
      const byName = new Map(workflow.jobs.map((j) => [j.name, j] as const));
      const conclusionByName = new Map<string, CiConclusion>();
      for (const name of order) {
        const job = byName.get(name);
        if (!job) continue;
        const failedNeed = job.needs.find((n) => conclusionByName.get(n) !== 'success');
        let result: JobResult;
        if (failedNeed) {
          const reason = `skipped: upstream job ${failedNeed} did not pass`;
          await this.store.appendLogs(input.runId, job.name, [reason]);
          result = this.cancelledJob(job, reason);
        } else if (this.mode === 'stub') {
          result = await this.runJobStub(input.runId, job);
        } else {
          result = await this.runJobDocker(
            input.runId,
            job,
            workflow.runtime.image,
            limits,
            workspace.dir,
          );
        }
        conclusionByName.set(name, result.conclusion);
        results.set(name, result);
      }

      // Emit jobs in the workflow's declared order for a stable read.
      const ordered = workflow.jobs
        .map((j) => results.get(j.name))
        .filter((r): r is JobResult => r !== undefined);
      await this.finish(repo, input, startedAt, ordered);
    } catch (e) {
      const msg = `run failed: ${(e as Error).message}`;
      await this.note(input.runId, msg);
      const existing = [...results.values()];
      await this.finish(
        repo,
        input,
        startedAt,
        existing.length > 0
          ? existing
          : [failedRunnerJob('runner', msg, startedAt, this.clock.now())],
      );
    } finally {
      if (workspace) {
        try {
          await workspace.dispose();
        } catch {
          // teardown best-effort; the checkout is throwaway
        }
      }
    }
  }

  private cancelledJob(job: WorkflowJob, reason: string): JobResult {
    return {
      name: job.name,
      conclusion: 'cancelled',
      exit_code: null,
      duration_ms: 0,
      steps: job.steps.map((s, index) => ({
        index,
        run: s.run,
        exit_code: null,
        conclusion: 'cancelled' as const,
      })),
      log_tail: reason,
    };
  }

  private async runJobStub(runId: string, job: WorkflowJob): Promise<JobResult> {
    const lines = [
      `[stub] job ${job.name}: ${job.steps.length} step(s) NOT executed, no Docker daemon. Simulated for demo.`,
      ...job.steps.map((s) => `[stub] would run: ${s.run}`),
    ];
    await this.store.appendLogs(runId, job.name, lines);
    return {
      name: job.name,
      conclusion: 'success',
      exit_code: 0,
      duration_ms: 0,
      steps: job.steps.map((s, index) => ({
        index,
        run: s.run,
        exit_code: 0,
        conclusion: 'success' as const,
      })),
      log_tail: lines.join('\n'),
    };
  }

  private async runJobDocker(
    runId: string,
    job: WorkflowJob,
    image: string,
    limits: ResolvedLimits,
    checkoutDir: string,
  ): Promise<JobResult> {
    const t0 = this.clock.now();
    const script = buildJobScript(job.steps.map((s) => s.run));
    const spec = buildContainerSpec({
      runId,
      jobName: job.name,
      image,
      script,
      checkoutDir,
      limits,
    });

    let exitCode: number | null = null;
    let output = '';
    let timedOut = false;
    let truncated = false;
    let error: string | null = null;
    try {
      if (this.options.autoPull) await this.ensureImage(image);
      const r = await this.runContainer(spec, limits.timeoutMs);
      exitCode = r.exitCode;
      output = r.output;
      timedOut = r.timedOut;
      truncated = r.truncated;
    } catch (e) {
      error = (e as Error).message;
    }
    const finishedAt = this.clock.now();

    const stripped = stripStepMarkers(output);
    const markers = parseStepMarkers(output);
    const logLines = toLines(stripped);
    if (truncated) logLines.push(`[runner] output truncated at ${this.options.maxLogBytes} bytes`);
    if (timedOut) {
      logLines.push(
        `[runner] job exceeded ${limits.timeoutMs} ms wall clock, container force-killed`,
      );
    }
    if (error) logLines.push(`[runner] docker error: ${error}`);
    await this.store.appendLogs(runId, job.name, logLines);

    const conclusion: CiConclusion = error
      ? 'failure'
      : timedOut
        ? 'timed_out'
        : exitCode === 0
          ? 'success'
          : 'failure';
    const steps = buildStepResults(
      job.steps.map((s) => s.run),
      markers,
      conclusion,
    );
    const tail = stripped.slice(-this.options.logTailBytes);
    return {
      name: job.name,
      conclusion,
      exit_code: exitCode,
      duration_ms: Math.max(0, finishedAt.getTime() - t0.getTime()),
      steps,
      log_tail: error ? `${tail}${tail ? '\n' : ''}[runner] ${error}` : tail,
    };
  }

  /** Create, run and tear down one ephemeral container. Teardown is guaranteed. */
  private async runContainer(
    spec: ContainerSpec,
    timeoutMs: number,
  ): Promise<{ exitCode: number | null; output: string; timedOut: boolean; truncated: boolean }> {
    const docker = this.docker;
    if (!docker) throw new Error('no docker engine');
    const { sink, buffer } = collector(this.options.maxLogBytes);
    let container: ContainerHandle | null = null;
    let timedOut = false;
    try {
      container = await docker.createContainer(spec);
      const stream = await container.attach({ stream: true, stdout: true, stderr: true });
      const streamDone = new Promise<void>((resolve) => {
        stream.on('end', () => resolve());
        stream.on('close', () => resolve());
      });
      container.modem.demuxStream(stream, sink, sink);
      await container.start();

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutP = new Promise<{ StatusCode: number }>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve({ StatusCode: 137 });
        }, timeoutMs);
      });
      const status = await Promise.race([container.wait(), timeoutP]);
      if (timer) clearTimeout(timer);
      if (timedOut) {
        try {
          await container.kill({ signal: 'SIGKILL' });
        } catch {
          // already gone
        }
      } else {
        // Let the attach stream flush before reading, but never hang on it.
        await Promise.race([streamDone, new Promise((r) => setTimeout(r, 500))]);
      }
      return {
        exitCode: timedOut ? null : status.StatusCode,
        output: buffer.text(),
        timedOut,
        truncated: buffer.truncated,
      };
    } finally {
      if (container) {
        try {
          await container.remove({ force: true });
        } catch {
          // ephemeral container, teardown best-effort
        }
      }
    }
  }

  /** Pull the base image if it is not present locally. Host-side, not job egress. */
  private async ensureImage(image: string): Promise<void> {
    const docker = this.docker;
    if (!docker) return;
    const tag = image.includes(':') ? image : `${image}:latest`;
    const images = await docker.listImages();
    const present = images.some((i) => {
      const tags = i.RepoTags ?? [];
      return tags.includes(tag) || tags.includes(image);
    });
    if (present) return;
    const stream = await docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      const follow = docker.modem.followProgress;
      if (follow) {
        follow.call(docker.modem, stream, (err) => (err ? reject(err) : resolve()));
      } else {
        stream.on('end', () => resolve());
        stream.on('error', reject);
        stream.resume();
      }
    });
  }

  private async finish(
    repo: string,
    input: { runId: string; headSha: string },
    startedAt: Date,
    jobs: JobResult[],
  ): Promise<void> {
    const finishedAt = this.clock.now();
    const envelope = buildResultEnvelope({
      runId: input.runId,
      commit: input.headSha,
      mode: this.mode,
      startedAt,
      finishedAt,
      jobs,
    });
    await this.writeResult(input.runId, envelope);
    const ciJobs: CiJob[] = jobs.map((j) => ({
      name: j.name,
      status: 'completed',
      conclusion: j.conclusion,
      duration_s: j.duration_ms / 1000,
    }));
    await this.store.update(repo, input.runId, {
      status: 'completed',
      conclusion: envelope.conclusion,
      finished_at: finishedAt.toISOString(),
      jobs: ciJobs,
    });
  }

  private async writeResult(runId: string, envelope: ResultEnvelope): Promise<void> {
    const json = JSON.stringify(envelope, null, 2);
    await this.store.appendLogs(runId, RESULT_LOG_JOB, json.split('\n'));
    if (this.options.resultsDir) {
      const dir = join(this.options.resultsDir, runId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'result.json'), json, 'utf8');
    }
  }

  private async note(runId: string, message: string): Promise<void> {
    await this.store.appendLogs(runId, RUNNER_LOG_JOB, [message]);
  }
}

/**
 * Build a CI runner. With a docker engine it runs each job in a locked-down
 * ephemeral container (the real path). With none, or with stub: true, it runs the
 * stub path that parses and orders the workflow but never creates a container, so
 * demos and tests work with no daemon. The two paths are labeled in every log
 * line and in the result envelope's `mode`, so a stub result is never mistaken
 * for a real build.
 */
export function createCiRunner(deps: CiRunnerDeps): CiRunner {
  return new CiRunnerImpl(deps);
}
