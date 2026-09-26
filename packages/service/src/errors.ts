// The forge error catalog, centralised so every operation raises the same code
// with the same `next` hint the model reads to self-correct. Codes, statuses and
// retryability come from @musehub/contracts; the messages and hints are from the
// R6 error catalog. One factory per situation keeps the wording consistent.

import { type ErrorCode, ForgeError } from '@musehub/contracts';

type Details = Record<string, unknown>;

function err(code: ErrorCode, message: string, next: string, details?: Details): ForgeError {
  return new ForgeError(code, message, details !== undefined ? { next, details } : { next });
}

export function forbiddenHuman(reason?: string): ForgeError {
  const suffix = reason ? ` (${reason})` : '';
  return err(
    'forbidden_human',
    `Caller is not a verified Muse agent${suffix}.`,
    'Onboarding is Muse-agents only. Enroll through the Muse agent identity flow.',
    reason ? { reason } : undefined,
  );
}

export function repoNotFound(fullName: string): ForgeError {
  return err(
    'repo_not_found',
    `Repository '${fullName}' not found.`,
    'Check owner/name with forge.repo_list. Otherwise create it with forge.repo_create.',
    { repo: fullName },
  );
}

export function forbiddenRepo(fullName: string): ForgeError {
  return err(
    'forbidden',
    `You do not have write access to '${fullName}'.`,
    'You lack access to this repo. Check the owner or ask for a collaborator grant.',
    { repo: fullName },
  );
}

export function repoExists(fullName: string): ForgeError {
  return err(
    'repo_exists',
    `Repository '${fullName}' already exists.`,
    "Pass if_exists 'ok' to reuse it. Otherwise choose another name.",
    { repo: fullName },
  );
}

export function fileNotFound(fullName: string, path: string, ref: string): ForgeError {
  return err(
    'file_not_found',
    `File '${path}' not found at ${ref} in ${fullName}.`,
    'List the tree with forge.tree_read to find the correct path.',
    { repo: fullName, path, ref },
  );
}

export function branchExists(fullName: string, branch: string, headSha: string): ForgeError {
  return err(
    'branch_exists',
    `Branch '${branch}' already exists in ${fullName}.`,
    'Use forge.branch_switch to work on it. Otherwise pick another name.',
    { branch, head_sha: headSha },
  );
}

export function branchNotFound(fullName: string, branch: string): ForgeError {
  return err(
    'branch_not_found',
    `Branch or ref '${branch}' does not exist in ${fullName}.`,
    'Create it with forge.branch_create. Otherwise pass a base ref that exists.',
    { branch },
  );
}

export function staleRef(branch: string, currentHead: string | null): ForgeError {
  return err(
    'stale_ref',
    `The tip of '${branch}' moved from the expected SHA.`,
    'Re-read the current SHA in details, then retry with expected_head set to it.',
    { branch, head_sha: currentHead },
  );
}

export function staleBlob(path: string, currentBlob: string | null): ForgeError {
  return err(
    'stale_ref',
    `The current contents of '${path}' differ from the expected blob.`,
    'Re-read the file, then retry with expected_blob_sha set to the current blob SHA.',
    { path, blob_sha: currentBlob },
  );
}

export function mergeConflict(number: number): ForgeError {
  return err(
    'merge_conflict',
    `Pull request #${number} does not apply cleanly to its base.`,
    'Rebase the head branch on base and push, then retry the merge.',
    { number },
  );
}

export function checksPending(headSha: string): ForgeError {
  return err(
    'checks_pending',
    'Required CI checks have not finished.',
    'Wait for CI, poll forge.ci_status on the head_sha, then retry the merge.',
    { head_sha: headSha },
  );
}

export function checksFailed(headSha: string): ForgeError {
  return err(
    'checks_failed',
    'Required CI checks failed on the head commit.',
    'Read forge.ci_logs, fix the head branch, push, then retry.',
    { head_sha: headSha },
  );
}

export function reviewRequired(number: number): ForgeError {
  return err(
    'review_required',
    `Pull request #${number} has no approving review.`,
    'Get an approving forge.pr_review, then retry the merge.',
    { number },
  );
}

export function prExists(number: number): ForgeError {
  return err(
    'pr_exists',
    `An open pull request for this head and base already exists (#${number}).`,
    'Reuse the PR number in details instead of opening a new one.',
    { number },
  );
}

export function confirmationMismatch(fullName: string): ForgeError {
  return err(
    'confirmation_mismatch',
    'The confirmation string did not match the repository name.',
    'Set confirm to the exact owner/name string.',
    { repo: fullName },
  );
}

export function validationFailed(message: string, next: string, details?: Details): ForgeError {
  return err('validation_failed', message, next, details);
}

// The frozen error catalog has no pr_not_found / issue_not_found / run_not_found
// code, so a missing number resolves to validation_failed (422). Flagged to the
// orchestrator: the argument named a target that does not resolve.
export function prNotFound(fullName: string, number: number): ForgeError {
  return validationFailed(
    `Pull request #${number} was not found in ${fullName}.`,
    'Check the number with forge.pr_list.',
    { repo: fullName, number },
  );
}

export function issueNotFound(fullName: string, number: number): ForgeError {
  return validationFailed(
    `Issue #${number} was not found in ${fullName}.`,
    'Check the number with forge.issue_list.',
    { repo: fullName, number },
  );
}

export function ciRunNotFound(fullName: string, runId: string): ForgeError {
  return validationFailed(
    `CI run '${runId}' was not found in ${fullName}.`,
    'Check the run_id returned by forge.ci_run, or list recent runs.',
    { repo: fullName, run_id: runId },
  );
}
