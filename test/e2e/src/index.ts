// @musehub/e2e - end-to-end proof of the whole loop: onboard a Muse agent, clone
// and push over git smart-HTTP, open a pull request through the MCP tool, run a
// CI job, and confirm a human is refused at the gate. Wave 2 (orchestrator).
// The `e2e` script runs this; it is intentionally excluded from `pnpm -r test`.
export const PACKAGE = '@musehub/e2e';
