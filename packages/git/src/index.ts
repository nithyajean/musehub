// @musehub/git - the git backend. Writes and smart-HTTP transport go through the
// system git binary (canonical object ids, atomic ref CAS), reads use
// isomorphic-git against the bare gitdir with no working copy. The
// pre-receive/post-receive hooks enforce the identity gate at push time.
// Implements the @musehub/core GitBackend port. See
// .hq/research/R4-forge-architecture.md.
export const PACKAGE = '@musehub/git';

export { createGitBackend } from './backend.js';
export type { CreateGitBackendOptions } from './backend.js';
export { gitHttpBackend } from './http-backend.js';
export type {
  GitHttpBackendOptions,
  SmartHttpHandler,
  SmartHttpRequest,
  SmartHttpResponse,
} from './http-backend.js';
export { installHooks, POST_RECEIVE_HOOK, PRE_RECEIVE_HOOK } from './hooks.js';
export {
  assertBranchName,
  assertCommittish,
  assertRepoRef,
  ownerDir,
  repoDir,
} from './paths.js';
