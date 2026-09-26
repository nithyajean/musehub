// @musehub/git - the git backend. Spawns the system git binary for writes and
// transport (clone/fetch/push over smart-HTTP via git-http-backend), uses
// isomorphic-git on the read path (tree/blob/log/diff), and installs the
// pre-receive/post-receive hooks that enforce the identity gate. Implements the
// @musehub/core GitBackend port. Filled in by the git build agent (Wave 1).
// See .hq/research/R4-forge-architecture.md.
export const PACKAGE = '@musehub/git';
