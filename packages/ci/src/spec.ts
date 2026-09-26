// Container spec builder: the sandbox for one job.
//
// Every field here maps to a line in the R8 threat model. The author of the code
// this container runs is an untrusted, possibly adversarial agent and the step
// commands are attacker-controlled, so the hardening is mandatory and default-on,
// never opt-in. This first-mile boundary is hardened Docker on the shared host
// kernel (R8 section 4). It is the demo and local-dev boundary, not the
// multi-tenant production boundary; production moves the boundary off the host
// kernel with gVisor or a microVM (R8 section 2). The builder is a pure function
// so the isolation flags can be asserted in a unit test without a live daemon.
import type { ResolvedLimits } from './workflow.js';

/** The subset of dockerode's ContainerCreateOptions this runner sets. */
export interface ContainerSpec {
  Image: string;
  Cmd: string[];
  Env: string[];
  WorkingDir: string;
  Tty: false;
  AttachStdout: true;
  AttachStderr: true;
  NetworkDisabled: true;
  Labels: Record<string, string>;
  HostConfig: {
    NetworkMode: 'none';
    CapDrop: string[];
    SecurityOpt: string[];
    ReadonlyRootfs: true;
    Memory: number;
    MemorySwap: number;
    NanoCpus: number;
    PidsLimit: number;
    Tmpfs: Record<string, string>;
    Binds: string[];
  };
}

/** Where the read-only checkout is mounted inside the sandbox. */
export const WORK_DIR = '/work';
/** The single writable area, a size-capped tmpfs, discarded at teardown. */
export const SCRATCH_DIR = '/tmp';

// Runner-owned step markers. The record-separator prefix (ASCII 0x1e) keeps them
// out of band from ordinary job output so they can be filtered from the logs and
// parsed for per-step exit codes. They are advisory only: the container exit code
// from the daemon is authoritative for pass or fail, so a job that prints a fake
// marker cannot forge a green step. See parseStepMarkers.
export const STEP_MARKER = '\x1e';
/** The full marker prefix a step line starts with, before "<index>:<exit>". */
const STEP_PREFIX = `${STEP_MARKER}musehub:step:`;
const STEP_TAIL_RE = /^(\d+):(-?\d+)$/;

/** Match one captured line against the step marker, returning [index, exit] or null. */
function matchStepLine(line: string): [number, number] | null {
  if (!line.startsWith(STEP_PREFIX)) return null;
  const m = STEP_TAIL_RE.exec(line.slice(STEP_PREFIX.length));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Build the shell script for one job. Steps run in order in a single container so
 * state carries between them. Each step's real exit code is captured, a marker is
 * printed, and the job stops at the first failure (the container then exits with
 * that code). The step command is the agent's own shell and is run verbatim.
 */
export function buildJobScript(steps: string[]): string {
  const lines: string[] = [];
  steps.forEach((run, i) => {
    lines.push(run);
    const marker = `printf '${STEP_MARKER}musehub:step:${i}:%d\\n' "$__muse_rc"`;
    lines.push(`__muse_rc=$?; ${marker}; [ "$__muse_rc" -eq 0 ] || exit "$__muse_rc"`);
  });
  return lines.join('\n');
}

/** Parse the runner step markers out of captured output into per-step exit codes. */
export function parseStepMarkers(output: string): Map<number, number> {
  const found = new Map<number, number>();
  for (const line of output.split('\n')) {
    const hit = matchStepLine(line);
    if (hit) found.set(hit[0], hit[1]);
  }
  return found;
}

/** Strip the runner's step markers from output before it is shown as logs. */
export function stripStepMarkers(output: string): string {
  return output
    .split('\n')
    .filter((line) => matchStepLine(line) === null)
    .join('\n');
}

export interface BuildSpecInput {
  runId: string;
  jobName: string;
  image: string;
  script: string;
  checkoutDir: string;
  limits: ResolvedLimits;
}

/**
 * Build the locked-down container spec for a job. Isolation is not configurable:
 * network is denied, every capability is dropped, privilege escalation is off,
 * the root filesystem is read-only, the checkout is read-only and the caps come
 * from the resolved limits. Egress allowlist is intentionally NOT honored by this
 * first-mile runner; anything other than a denied network fails closed here and
 * the runner logs why (R8 section 2.5).
 */
export function buildContainerSpec(input: BuildSpecInput): ContainerSpec {
  const { limits } = input;
  return {
    Image: input.image,
    Cmd: ['sh', '-c', input.script],
    // Point HOME and TMPDIR at the one writable area so tools that need a home
    // do not fault against the read-only root filesystem.
    Env: [`HOME=${SCRATCH_DIR}`, `TMPDIR=${SCRATCH_DIR}`],
    WorkingDir: WORK_DIR,
    Tty: false,
    AttachStdout: true,
    AttachStderr: true,
    // NetworkDisabled plus NetworkMode none is belt and braces: no interface, no route.
    NetworkDisabled: true,
    Labels: {
      'chat.musehub.ci': 'true',
      'chat.musehub.run': input.runId,
      'chat.musehub.job': input.jobName,
    },
    HostConfig: {
      NetworkMode: 'none',
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      ReadonlyRootfs: true,
      Memory: limits.memoryBytes,
      // Equal Memory and MemorySwap disables swap, so a job cannot dodge the cap.
      MemorySwap: limits.memoryBytes,
      NanoCpus: limits.nanoCpus,
      PidsLimit: limits.pidsLimit,
      Tmpfs: { [SCRATCH_DIR]: `rw,size=${limits.diskBytes},nosuid,nodev,noexec` },
      Binds: [`${input.checkoutDir}:${WORK_DIR}:ro`],
    },
  };
}
