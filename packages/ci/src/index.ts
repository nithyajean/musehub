// @musehub/ci - the CI runner. Parses .musehub/ci.yml, runs each job in an
// ephemeral, locked-down Docker container (network none, dropped caps,
// no-new-privileges, read-only rootfs, cpu/memory/pids caps), captures logs and
// emits the result.json envelope. Implements the @musehub/core CiRunner port.
// Untrusted agent code runs here: isolation and default-deny egress are not
// optional. Filled in by the ci build agent (Wave 1). See R8-ci-sandbox.md.
export const PACKAGE = '@musehub/ci';
