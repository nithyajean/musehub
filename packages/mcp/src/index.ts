// @musehub/mcp - the MCP server over Streamable HTTP. Emits each forge.* tool's
// zod schema as an MCP inputSchema and as a Meta Model API function-tool
// parameters block, routes tools/call to the @musehub/core ForgeService, and
// returns the structured result plus a text mirror, with ForgeError surfaced as
// isError. Filled in by the mcp build agent (Wave 1). See R6-agent-api-design.md.
export const PACKAGE = '@musehub/mcp';
