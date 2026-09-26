// @musehub/mcp - the MCP server over Streamable HTTP for the 30 forge.* tools.
//
// It emits each tool's zod schema (from @musehub/contracts) as an MCP inputSchema and
// as a Meta Model API function-tool parameters block, validates tools/call arguments
// with the same schema, resolves the Bearer token via an injected resolveAuth then
// dispatches to the injected @musehub/core ForgeService. A ForgeError comes back as an
// in-band isError result carrying the structured envelope plus a text mirror. Design in
// .hq/research/R6-agent-api-design.md. Built against @modelcontextprotocol/sdk 1.30.1.

export const PACKAGE = '@musehub/mcp';

export { toJsonSchema, toMcpTool, type JsonObjectSchema } from './json-schema.js';
export { metaFunctionTools, type MetaFunctionTool } from './meta.js';
export {
  runTool,
  bearerFromHeaders,
  TOOL_OPS,
  type McpDeps,
  type ResolveAuth,
  type ToolOp,
} from './dispatch.js';
export {
  buildMcpServer,
  mountMcpServer,
  attachMcpServer,
  type McpHttpServer,
  type AttachOptions,
} from './server.js';
