// The merge gate: "green and reviewed before merge". The ordered enforcement
// lives in the service (prMerge) so the sequence is obvious; this module holds the
// shared read-side summaries so pr_get and pr_merge agree on what green means.

import type { CiRun } from '@musehub/contracts';

export interface RequiredCheck {
  name: string;
  status: string;
  conclusion: string | null;
}

export type ChecksState = 'none' | 'pending' | 'failed' | 'success';

export interface ChecksSummary {
  checks: RequiredCheck[];
  state: ChecksState;
}

/**
 * Collapse the CI runs recorded against a head SHA into one gate state.
 *  none    - no run has been recorded for this commit yet
 *  pending - at least one run is still queued or running
 *  failed  - every run finished but one did not conclude success
 *  success - every run finished and concluded success
 */
export function summarizeChecks(runs: CiRun[]): ChecksSummary {
  const checks: RequiredCheck[] = runs.map((run) => ({
    name: run.workflow,
    status: run.status,
    conclusion: run.conclusion,
  }));
  if (runs.length === 0) {
    return { checks, state: 'none' };
  }
  if (runs.some((run) => run.status !== 'completed')) {
    return { checks, state: 'pending' };
  }
  if (runs.some((run) => run.conclusion !== 'success')) {
    return { checks, state: 'failed' };
  }
  return { checks, state: 'success' };
}

export function reviewState(approved: boolean): string {
  return approved ? 'approved' : 'review_required';
}

/** A one-word mergeability summary for pr_get, in GitHub's vocabulary. */
export function mergeableState(canMerge: boolean, checks: ChecksState, approved: boolean): string {
  if (!canMerge) {
    return 'dirty';
  }
  if (checks === 'none' || checks === 'pending') {
    return 'blocked';
  }
  if (checks === 'failed') {
    return 'unstable';
  }
  if (!approved) {
    return 'blocked';
  }
  return 'clean';
}
