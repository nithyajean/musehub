import { describe, expect, it } from 'vitest';
import {
  SCRATCH_DIR,
  STEP_MARKER,
  WORK_DIR,
  buildContainerSpec,
  buildJobScript,
  parseStepMarkers,
  stripStepMarkers,
} from './spec.js';
import type { ResolvedLimits } from './workflow.js';

const LIMITS: ResolvedLimits = {
  memoryBytes: 512 * 1024 * 1024,
  nanoCpus: 2e9,
  pidsLimit: 256,
  diskBytes: 256 * 1024 * 1024,
  timeoutMs: 600_000,
};

function spec() {
  return buildContainerSpec({
    runId: 'r_1',
    jobName: 'test',
    image: 'python:3.12-slim',
    script: 'pytest -q',
    checkoutDir: '/var/lib/musehub/checkouts/r_1',
    limits: LIMITS,
  });
}

describe('buildContainerSpec (isolation is mandatory and default-on)', () => {
  it('denies the network', () => {
    const s = spec();
    expect(s.HostConfig.NetworkMode).toBe('none');
    expect(s.NetworkDisabled).toBe(true);
  });

  it('drops every capability and blocks privilege escalation', () => {
    const s = spec();
    expect(s.HostConfig.CapDrop).toEqual(['ALL']);
    expect(s.HostConfig.SecurityOpt).toContain('no-new-privileges');
  });

  it('makes the root filesystem read-only with only a capped tmpfs writable', () => {
    const s = spec();
    expect(s.HostConfig.ReadonlyRootfs).toBe(true);
    expect(s.HostConfig.Tmpfs[SCRATCH_DIR]).toMatch(/size=268435456/);
    expect(s.HostConfig.Tmpfs[SCRATCH_DIR]).toMatch(/nosuid,nodev,noexec/);
  });

  it('mounts the checkout read-only', () => {
    const s = spec();
    expect(s.HostConfig.Binds).toEqual([`/var/lib/musehub/checkouts/r_1:${WORK_DIR}:ro`]);
  });

  it('maps the limits to Memory, NanoCpus and PidsLimit and disables swap', () => {
    const s = spec();
    expect(s.HostConfig.Memory).toBe(512 * 1024 * 1024);
    expect(s.HostConfig.MemorySwap).toBe(s.HostConfig.Memory);
    expect(s.HostConfig.NanoCpus).toBe(2e9);
    expect(s.HostConfig.PidsLimit).toBe(256);
  });

  it('runs the script through sh -c with no tty', () => {
    const s = spec();
    expect(s.Cmd).toEqual(['sh', '-c', 'pytest -q']);
    expect(s.Tty).toBe(false);
    expect(s.WorkingDir).toBe(WORK_DIR);
  });
});

describe('buildJobScript and step markers', () => {
  it('runs steps in order, prints a marker and stops at the first failure', () => {
    const script = buildJobScript(['step-one', 'step-two']);
    expect(script).toContain('step-one');
    expect(script).toContain('step-two');
    expect(script).toContain(`${STEP_MARKER}musehub:step:0:%d`);
    expect(script).toContain(`${STEP_MARKER}musehub:step:1:%d`);
    expect(script).toContain('exit "$__muse_rc"');
  });

  it('parses markers into per-step exit codes and strips them from logs', () => {
    const raw = `building\n${STEP_MARKER}musehub:step:0:0\nrunning tests\n${STEP_MARKER}musehub:step:1:1\n`;
    const markers = parseStepMarkers(raw);
    expect(markers.get(0)).toBe(0);
    expect(markers.get(1)).toBe(1);
    const clean = stripStepMarkers(raw);
    expect(clean).not.toContain('musehub:step');
    expect(clean).toContain('building');
    expect(clean).toContain('running tests');
  });
});
