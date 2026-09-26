import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from '@musehub/contracts';
import { type McpDeps, bearerFromHeaders, runTool } from './dispatch.js';
import { toMcpTool } from './json-schema.js';

const SERVER_INFO = { name: 'musehub', version: '0.1.0' } as const;
const SESSION_HEADER = 'mcp-session-id';
const DEFAULT_PATH = '/mcp';

/**
 * Build a configured MCP server: it advertises the tools capability, answers
 * tools/list with all 30 forge.* tools (each with its JSON Schema inputSchema) and
 * routes tools/call to the injected ForgeService. Auth is read from the request's
 * Authorization Bearer header and resolved by deps.resolveAuth. An unknown tool is a
 * JSON-RPC MethodNotFound; every business failure stays in-band as an isError result.
 */
export function buildMcpServer(deps: McpDeps): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(toMcpTool),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const token = bearerFromHeaders(extra.requestInfo?.headers);
    return runTool(deps, req.params.name, req.params.arguments, token);
  });
  return server;
}

/** A mounted MCP endpoint that manages Streamable HTTP sessions for the composition root. */
export interface McpHttpServer {
  /**
   * Handle one MCP HTTP request. For a POST, pass the parsed JSON body so an
   * initialize request can be detected and a session opened. GET and DELETE reuse an
   * existing session named by the mcp-session-id header.
   */
  handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
  /** Close every open session transport. Call on shutdown. */
  closeAll(): Promise<void>;
}

/**
 * Mount the MCP server over the SDK's Streamable HTTP transport with per-session
 * state. A new initialize POST opens a session (a fresh Server plus transport keyed
 * by the generated session id); later requests reuse it by the mcp-session-id header.
 *
 * Security posture: this is a network-exposed endpoint that carries untrusted agent
 * traffic. It has no auth of its own. deps.resolveAuth is the gate and MUST reject any
 * caller that is not a verified Muse agent (see the identity package). Run it behind
 * TLS with per-token rate limits. Set the transport's allowedHosts /
 * enableDnsRebindingProtection at the composition root before exposing it publicly.
 */
export function mountMcpServer(deps: McpDeps): McpHttpServer {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown,
  ): Promise<void> {
    const header = req.headers[SESSION_HEADER];
    const sessionId = Array.isArray(header) ? header[0] : header;
    const existing = sessionId ? transports.get(sessionId) : undefined;
    if (existing) {
      await existing.handleRequest(req, res, parsedBody);
      return;
    }
    if (req.method === 'POST' && isInitializeRequest(parsedBody)) {
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          transports.set(id, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };
      const server = buildMcpServer(deps);
      await server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
      return;
    }
    writeJsonRpcError(
      res,
      400,
      ErrorCode.InvalidRequest,
      sessionId ? 'Unknown or expired MCP session.' : 'Missing MCP session. Send initialize first.',
    );
  }

  async function closeAll(): Promise<void> {
    await Promise.all([...transports.values()].map((t) => t.close()));
    transports.clear();
  }

  return { handleRequest, closeAll };
}

/** Options for attaching to a dedicated Node HTTP server. */
export interface AttachOptions {
  /** Path the MCP endpoint answers on. Defaults to /mcp. */
  path?: string;
}

/**
 * Attach an MCP endpoint to a dedicated Node HTTP server. It buffers the request body,
 * routes the chosen path to the session manager and returns the manager for shutdown.
 * For a shared server or a framework like Fastify, call mountMcpServer and feed it the
 * already-parsed body (for example reply.raw with request.body) instead.
 */
export function attachMcpServer(
  httpServer: HttpServer,
  deps: McpDeps,
  opts: AttachOptions = {},
): McpHttpServer {
  const path = opts.path ?? DEFAULT_PATH;
  const manager = mountMcpServer(deps);
  httpServer.on('request', (req, res) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname !== path) return;
    void handleWithBody(manager, req, res);
  });
  return manager;
}

async function handleWithBody(
  manager: McpHttpServer,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let parsedBody: unknown;
  if (req.method === 'POST') {
    try {
      parsedBody = await readJsonBody(req);
    } catch {
      writeJsonRpcError(res, 400, ErrorCode.ParseError, 'Request body was not valid JSON.');
      return;
    }
  }
  try {
    await manager.handleRequest(req, res, parsedBody);
  } catch {
    if (!res.headersSent) {
      writeJsonRpcError(res, 500, ErrorCode.InternalError, 'Internal server error.');
    }
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function writeJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}
