import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ForgeError, TOOLS_BY_NAME, isForgeError } from '@musehub/contracts';
import type {
  BranchCreateArgs,
  BranchSwitchArgs,
  CiLogsArgs,
  CiRunArgs,
  CiStatusArgs,
  CommitCreateArgs,
  DiffGetArgs,
  EnrollArgs,
  FileReadArgs,
  FileWriteArgs,
  IssueCloseArgs,
  IssueCommentArgs,
  IssueListArgs,
  IssueOpenArgs,
  IssueReopenArgs,
  OrgAddMemberArgs,
  OrgCreateArgs,
  OrgGetArgs,
  OrgListArgs,
  OrgRemoveMemberArgs,
  PrCommentArgs,
  PrGetArgs,
  PrListArgs,
  PrMergeArgs,
  PrOpenArgs,
  PrReviewArgs,
  RepoAddCollaboratorArgs,
  RepoCreateArgs,
  RepoDeleteArgs,
  RepoGetArgs,
  RepoListArgs,
  RepoListCollaboratorsArgs,
  RepoRemoveCollaboratorArgs,
  SearchCodeArgs,
  SearchIssuesArgs,
  SearchReposArgs,
  TeamAddMemberArgs,
  TeamCreateArgs,
  ToolName,
  TreeReadArgs,
} from '@musehub/contracts';
import type { AuthContext, ForgeService } from '@musehub/core';

/** Resolve an agent identity from the Bearer token. Injected by the composition root. */
export type ResolveAuth = (token: string | undefined) => AuthContext | Promise<AuthContext>;

/** Everything the MCP server needs. The service is injected against its interface. */
export interface McpDeps {
  forge: ForgeService;
  resolveAuth: ResolveAuth;
}

/** One tool's binding: whether it needs auth and how it calls the service. */
export interface ToolOp {
  auth: boolean;
  invoke(forge: ForgeService, ctx: AuthContext | null, args: unknown): Promise<unknown>;
}

/**
 * The tool -> ForgeService method map, one entry per forge.* tool. Args are already
 * validated against the tool's zod schema before invoke runs, so the cast is safe.
 * `forge.enroll` is the only unauthenticated op (it mints the first token). `ctx` is
 * non-null for every authed op because the dispatcher resolves auth first.
 */
export const TOOL_OPS: Record<ToolName, ToolOp> = {
  'forge.enroll': { auth: false, invoke: (f, _c, a) => f.enroll(a as EnrollArgs) },
  'forge.whoami': { auth: true, invoke: (f, ctx) => f.whoami(ctx!) },
  'forge.repo_create': {
    auth: true,
    invoke: (f, ctx, a) => f.repoCreate(ctx!, a as RepoCreateArgs),
  },
  'forge.repo_list': { auth: true, invoke: (f, ctx, a) => f.repoList(ctx!, a as RepoListArgs) },
  'forge.repo_get': { auth: true, invoke: (f, ctx, a) => f.repoGet(ctx!, a as RepoGetArgs) },
  'forge.repo_delete': {
    auth: true,
    invoke: (f, ctx, a) => f.repoDelete(ctx!, a as RepoDeleteArgs),
  },
  'forge.tree_read': { auth: true, invoke: (f, ctx, a) => f.treeRead(ctx!, a as TreeReadArgs) },
  'forge.file_read': { auth: true, invoke: (f, ctx, a) => f.fileRead(ctx!, a as FileReadArgs) },
  'forge.commit_create': {
    auth: true,
    invoke: (f, ctx, a) => f.commitCreate(ctx!, a as CommitCreateArgs),
  },
  'forge.file_write': { auth: true, invoke: (f, ctx, a) => f.fileWrite(ctx!, a as FileWriteArgs) },
  'forge.branch_create': {
    auth: true,
    invoke: (f, ctx, a) => f.branchCreate(ctx!, a as BranchCreateArgs),
  },
  'forge.branch_switch': {
    auth: true,
    invoke: (f, ctx, a) => f.branchSwitch(ctx!, a as BranchSwitchArgs),
  },
  'forge.diff_get': { auth: true, invoke: (f, ctx, a) => f.diffGet(ctx!, a as DiffGetArgs) },
  'forge.pr_open': { auth: true, invoke: (f, ctx, a) => f.prOpen(ctx!, a as PrOpenArgs) },
  'forge.pr_list': { auth: true, invoke: (f, ctx, a) => f.prList(ctx!, a as PrListArgs) },
  'forge.pr_get': { auth: true, invoke: (f, ctx, a) => f.prGet(ctx!, a as PrGetArgs) },
  'forge.pr_comment': { auth: true, invoke: (f, ctx, a) => f.prComment(ctx!, a as PrCommentArgs) },
  'forge.pr_review': { auth: true, invoke: (f, ctx, a) => f.prReview(ctx!, a as PrReviewArgs) },
  'forge.pr_merge': { auth: true, invoke: (f, ctx, a) => f.prMerge(ctx!, a as PrMergeArgs) },
  'forge.issue_open': { auth: true, invoke: (f, ctx, a) => f.issueOpen(ctx!, a as IssueOpenArgs) },
  'forge.issue_list': { auth: true, invoke: (f, ctx, a) => f.issueList(ctx!, a as IssueListArgs) },
  'forge.issue_comment': {
    auth: true,
    invoke: (f, ctx, a) => f.issueComment(ctx!, a as IssueCommentArgs),
  },
  'forge.issue_close': {
    auth: true,
    invoke: (f, ctx, a) => f.issueClose(ctx!, a as IssueCloseArgs),
  },
  'forge.issue_reopen': {
    auth: true,
    invoke: (f, ctx, a) => f.issueReopen(ctx!, a as IssueReopenArgs),
  },
  'forge.ci_run': { auth: true, invoke: (f, ctx, a) => f.ciRun(ctx!, a as CiRunArgs) },
  'forge.ci_status': { auth: true, invoke: (f, ctx, a) => f.ciStatus(ctx!, a as CiStatusArgs) },
  'forge.ci_logs': { auth: true, invoke: (f, ctx, a) => f.ciLogs(ctx!, a as CiLogsArgs) },
  'forge.search_repos': {
    auth: true,
    invoke: (f, ctx, a) => f.searchRepos(ctx!, a as SearchReposArgs),
  },
  'forge.search_code': {
    auth: true,
    invoke: (f, ctx, a) => f.searchCode(ctx!, a as SearchCodeArgs),
  },
  'forge.search_issues': {
    auth: true,
    invoke: (f, ctx, a) => f.searchIssues(ctx!, a as SearchIssuesArgs),
  },
  'forge.org_create': { auth: true, invoke: (f, ctx, a) => f.orgCreate(ctx!, a as OrgCreateArgs) },
  'forge.org_get': { auth: true, invoke: (f, ctx, a) => f.orgGet(ctx!, a as OrgGetArgs) },
  'forge.org_list': { auth: true, invoke: (f, ctx, a) => f.orgList(ctx!, a as OrgListArgs) },
  'forge.org_add_member': {
    auth: true,
    invoke: (f, ctx, a) => f.orgAddMember(ctx!, a as OrgAddMemberArgs),
  },
  'forge.org_remove_member': {
    auth: true,
    invoke: (f, ctx, a) => f.orgRemoveMember(ctx!, a as OrgRemoveMemberArgs),
  },
  'forge.team_create': {
    auth: true,
    invoke: (f, ctx, a) => f.teamCreate(ctx!, a as TeamCreateArgs),
  },
  'forge.team_add_member': {
    auth: true,
    invoke: (f, ctx, a) => f.teamAddMember(ctx!, a as TeamAddMemberArgs),
  },
  'forge.repo_add_collaborator': {
    auth: true,
    invoke: (f, ctx, a) => f.repoAddCollaborator(ctx!, a as RepoAddCollaboratorArgs),
  },
  'forge.repo_remove_collaborator': {
    auth: true,
    invoke: (f, ctx, a) => f.repoRemoveCollaborator(ctx!, a as RepoRemoveCollaboratorArgs),
  },
  'forge.repo_list_collaborators': {
    auth: true,
    invoke: (f, ctx, a) => f.repoListCollaborators(ctx!, a as RepoListCollaboratorsArgs),
  },
};

/** Pull the Bearer token out of an Authorization header. Node lowercases header keys. */
export function bearerFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined;
  const raw = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1]?.trim() : undefined;
}

/** A successful call: the result object as structuredContent plus a JSON text mirror. */
function successResult(data: unknown): CallToolResult {
  return {
    structuredContent: (data ?? {}) as Record<string, unknown>,
    content: [{ type: 'text', text: JSON.stringify(data ?? {}, null, 2) }],
  };
}

/**
 * A ForgeError as an in-band tool result: the envelope in structuredContent and its
 * message plus next in a text block so a text-only model still gets the recovery hint.
 * `isError` is true for real failures; the 200-status markers come back as successes.
 */
function errorResult(err: ForgeError): CallToolResult {
  const envelope = err.toEnvelope();
  const nextLine = err.next ? `\nNext: ${err.next}` : '';
  return {
    isError: err.httpStatus >= 400,
    structuredContent: envelope as unknown as Record<string, unknown>,
    content: [{ type: 'text', text: `${err.code}: ${err.message}${nextLine}` }],
  };
}

/**
 * Handle one tools/call. Validates args against the tool schema, resolves auth from
 * the Bearer token for every op except enroll, dispatches to the service then mirrors
 * the result. A ForgeError (or an unexpected throw) becomes an in-band error result so
 * the model can self-correct. An unknown tool is the only JSON-RPC protocol error here.
 */
export async function runTool(
  deps: McpDeps,
  name: string,
  rawArgs: unknown,
  token: string | undefined,
): Promise<CallToolResult> {
  const op = (TOOL_OPS as Record<string, ToolOp | undefined>)[name];
  const def = TOOLS_BY_NAME[name];
  if (!op || !def) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return errorResult(
      new ForgeError('validation_failed', `Arguments for ${name} failed validation.`, {
        next: 'Fix the fields listed in details and call again.',
        details: { issues: parsed.error.issues },
      }),
    );
  }
  try {
    const ctx = op.auth ? await deps.resolveAuth(token) : null;
    return successResult(await op.invoke(deps.forge, ctx, parsed.data));
  } catch (e) {
    if (isForgeError(e)) return errorResult(e);
    return errorResult(
      new ForgeError('internal_error', 'The forge hit an unexpected error.', {
        details: { reason: e instanceof Error ? e.message : String(e) },
      }),
    );
  }
}
