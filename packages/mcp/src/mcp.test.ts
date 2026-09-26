import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { ForgeError, TOOLS } from '@musehub/contracts';
import type { AuthContext, ForgeService } from '@musehub/core';
import { describe, expect, it } from 'vitest';
import {
  type McpDeps,
  TOOL_OPS,
  bearerFromHeaders,
  buildMcpServer,
  metaFunctionTools,
  runTool,
  toMcpTool,
} from './index.js';

const AUTH = { agent: {}, tokenId: 'tk1' } as unknown as AuthContext;
const TOOL_NAMES = TOOLS.map((t) => t.name).sort();

/** A fake ForgeService: only the methods a test drives are implemented, rest are absent. */
function makeForge(overrides: Record<string, unknown> = {}): ForgeService {
  const base: Record<string, unknown> = {
    enroll: async () => ({
      agent: { id: 'a1', handle: 'checkout-bot' },
      token: 'minted',
      token_expires_at: '2026-10-01T00:00:00Z',
      is_new: true,
    }),
    whoami: async (ctx: AuthContext) => ({ agent: ctx.agent, token_expires_at: null }),
    repoGet: async () => ({
      id: 'r1',
      owner: 'muse-7a2',
      name: 'checkout',
      full_name: 'muse-7a2/checkout',
      visibility: 'private',
      head_sha: null,
      open_pr_count: 0,
      open_issue_count: 0,
    }),
  };
  return { ...base, ...overrides } as unknown as ForgeService;
}

function makeDeps(
  forge: ForgeService,
  tokenSink: (t: string | undefined) => void = () => {},
): McpDeps {
  return {
    forge,
    resolveAuth: async (token) => {
      tokenSink(token);
      return AUTH;
    },
  };
}

describe('metaFunctionTools', () => {
  const tools = metaFunctionTools();

  it('emits all 50 forge tools', () => {
    expect(tools).toHaveLength(50);
  });

  it('every name is a legal Meta function name with exactly one dot', () => {
    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(tool.name).toMatch(/^[a-zA-Z0-9_.-]+$/);
      expect(tool.name.split('.').length - 1).toBe(1);
    }
  });

  it('every tool has an object JSON-schema parameters block', () => {
    for (const tool of tools) {
      expect(tool.parameters.type).toBe('object');
      expect(typeof tool.parameters).toBe('object');
    }
  });

  it('parameters match the MCP inputSchema for the same tool', () => {
    const meta = new Map(tools.map((t) => [t.name, t.parameters]));
    for (const def of TOOLS) {
      expect(toMcpTool(def).inputSchema).toEqual(meta.get(def.name));
    }
  });
});

describe('tool -> method map', () => {
  it('covers exactly the 50 tool names', () => {
    expect(Object.keys(TOOL_OPS).sort()).toEqual(TOOL_NAMES);
  });

  it('marks only forge.enroll as unauthenticated', () => {
    const unauth = Object.entries(TOOL_OPS)
      .filter(([, op]) => !op.auth)
      .map(([name]) => name);
    expect(unauth).toEqual(['forge.enroll']);
  });
});

describe('runTool dispatch', () => {
  it('returns structuredContent and a text mirror on success', async () => {
    let seen: string | undefined = 'unset';
    const res = await runTool(
      makeDeps(makeForge(), (t) => {
        seen = t;
      }),
      'forge.repo_get',
      { repo: 'muse-7a2/checkout' },
      'tok-123',
    );

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toMatchObject({ name: 'checkout' });
    expect(seen).toBe('tok-123');
    const block = res.content[0];
    expect(block?.type).toBe('text');
    if (block?.type === 'text') {
      expect(JSON.parse(block.text)).toMatchObject({ name: 'checkout' });
    }
  });

  it('returns isError with the envelope when the service throws a ForgeError', async () => {
    const forge = makeForge({
      repoGet: async () => {
        throw new ForgeError('repo_not_found', 'No such repo.', { next: 'Check owner/name.' });
      },
    });
    const res = await runTool(makeDeps(forge), 'forge.repo_get', { repo: 'muse-7a2/ghost' }, 'tok');

    expect(res.isError).toBe(true);
    expect(res.structuredContent).toMatchObject({ error: { code: 'repo_not_found' } });
    const block = res.content[0];
    expect(block?.type === 'text' && block.text.includes('Next: Check owner/name.')).toBe(true);
  });

  it('does not resolve auth for forge.enroll', async () => {
    let resolved = 0;
    const deps: McpDeps = {
      forge: makeForge(),
      resolveAuth: async () => {
        resolved += 1;
        return AUTH;
      },
    };
    const res = await runTool(deps, 'forge.enroll', { muse_attestation: 'proof' }, undefined);

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toMatchObject({ token: 'minted' });
    expect(resolved).toBe(0);
  });

  it('returns a validation_failed envelope for bad args, without throwing', async () => {
    const res = await runTool(makeDeps(makeForge()), 'forge.repo_get', {}, 'tok');
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('throws a JSON-RPC MethodNotFound for an unknown tool', async () => {
    await expect(runTool(makeDeps(makeForge()), 'forge.nope', {}, 'tok')).rejects.toBeInstanceOf(
      McpError,
    );
  });
});

describe('buildMcpServer and helpers', () => {
  it('builds a Server and 50 MCP tools with object input schemas', () => {
    const server = buildMcpServer(makeDeps(makeForge()));
    expect(server).toBeInstanceOf(Server);

    const tools = TOOLS.map(toMcpTool);
    expect(tools).toHaveLength(50);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('parses a Bearer token from the Authorization header case-insensitively', () => {
    expect(bearerFromHeaders({ authorization: 'Bearer abc' })).toBe('abc');
    expect(bearerFromHeaders({ Authorization: 'bearer xyz' })).toBe('xyz');
    expect(bearerFromHeaders({ authorization: ['Bearer first'] })).toBe('first');
    expect(bearerFromHeaders({ authorization: 'Basic nope' })).toBeUndefined();
    expect(bearerFromHeaders(undefined)).toBeUndefined();
  });
});
