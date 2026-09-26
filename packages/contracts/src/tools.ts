import { z } from 'zod';
import { Cursor, Encoding, Handle, RepoSpec, Visibility } from './common.js';

/**
 * The forge.* tool argument schemas. One zod schema per tool, authored once and
 * emitted to both the Meta Model API function-tool `parameters` and the MCP
 * `inputSchema` by downstream packages. Names carry exactly one dot so a single
 * string is legal on every transport. Design and shapes from R6.
 *
 * Every schema is `.strict()` so a hallucinated field fails loudly (the zod
 * equivalent of `additionalProperties: false`).
 */

// --- Onboarding -----------------------------------------------------------

export const EnrollArgs = z
  .object({
    muse_attestation: z
      .string()
      .describe('Signed Muse agent identity proof. Format defined by the identity gate.'),
    handle: Handle.optional().describe('Desired account handle. Server assigns one if omitted.'),
    display_name: z.string().max(80).optional(),
    rotate_token: z
      .boolean()
      .default(false)
      .describe('Mint a fresh token and revoke the previous one.'),
  })
  .strict();
export type EnrollArgs = z.infer<typeof EnrollArgs>;

export const WhoamiArgs = z.object({}).strict();
export type WhoamiArgs = z.infer<typeof WhoamiArgs>;

// --- Repositories ---------------------------------------------------------

export const RepoCreateArgs = z
  .object({
    name: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,100}$/)
      .describe('Repository name, unique within the owner.'),
    visibility: Visibility.default('private'),
    description: z.string().max(350).default(''),
    default_branch: z.string().default('main'),
    auto_init: z
      .boolean()
      .default(true)
      .describe('Seed an initial commit so the repo is clonable at once.'),
    license: z.string().optional().describe('SPDX id or LicenseRef for the seeded LICENSE file.'),
    if_exists: z.enum(['error', 'ok']).default('error'),
  })
  .strict();
export type RepoCreateArgs = z.infer<typeof RepoCreateArgs>;

export const RepoListArgs = z
  .object({
    owner: Handle.optional().describe('Account handle. Defaults to the caller.'),
    visibility: z.enum(['all', 'public', 'private']).default('all'),
    cursor: Cursor.optional(),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export type RepoListArgs = z.infer<typeof RepoListArgs>;

export const RepoGetArgs = z.object({ repo: RepoSpec }).strict();
export type RepoGetArgs = z.infer<typeof RepoGetArgs>;

export const RepoDeleteArgs = z
  .object({
    repo: RepoSpec,
    confirm: z.string().describe('Repeat the exact owner/name to confirm deletion.'),
  })
  .strict();
export type RepoDeleteArgs = z.infer<typeof RepoDeleteArgs>;

// --- Files and commits ----------------------------------------------------

export const TreeReadArgs = z
  .object({
    repo: RepoSpec,
    ref: z.string().optional().describe('Branch or SHA. Defaults to the repo default branch.'),
    path: z.string().default('').describe('Subdirectory to list. Empty is the root.'),
    recursive: z.boolean().default(false),
  })
  .strict();
export type TreeReadArgs = z.infer<typeof TreeReadArgs>;

export const FileReadArgs = z
  .object({
    repo: RepoSpec,
    path: z.string().describe('File path from the repo root.'),
    ref: z.string().optional(),
    encoding: Encoding.default('text'),
    max_bytes: z.number().int().positive().default(262144),
  })
  .strict();
export type FileReadArgs = z.infer<typeof FileReadArgs>;

const ChangeItem = z
  .object({
    path: z.string(),
    op: z.enum(['write', 'delete']).default('write'),
    content: z.string().optional().describe('Required when op is write.'),
    encoding: Encoding.default('text'),
  })
  .strict();

export const CommitCreateArgs = z
  .object({
    repo: RepoSpec,
    message: z.string(),
    changes: z.array(ChangeItem).min(1),
    branch: z.string().optional(),
    expected_head: z
      .string()
      .optional()
      .describe('SHA the branch tip must currently be at; fails stale_ref if moved.'),
    create_branch_from: z.string().optional(),
    idempotency_key: z.string().optional(),
  })
  .strict();
export type CommitCreateArgs = z.infer<typeof CommitCreateArgs>;

export const FileWriteArgs = z
  .object({
    repo: RepoSpec,
    path: z.string(),
    content: z.string(),
    message: z.string().optional(),
    branch: z.string().optional(),
    encoding: Encoding.default('text'),
    expected_blob_sha: z.string().optional(),
  })
  .strict();
export type FileWriteArgs = z.infer<typeof FileWriteArgs>;

export const BranchCreateArgs = z
  .object({
    repo: RepoSpec,
    name: z.string(),
    from_ref: z.string().optional(),
    if_exists: z.enum(['error', 'ok']).default('error'),
  })
  .strict();
export type BranchCreateArgs = z.infer<typeof BranchCreateArgs>;

export const BranchSwitchArgs = z
  .object({
    repo: RepoSpec,
    branch: z.string(),
    create_from: z.string().optional(),
  })
  .strict();
export type BranchSwitchArgs = z.infer<typeof BranchSwitchArgs>;

export const DiffGetArgs = z
  .object({
    repo: RepoSpec,
    base: z.string().optional(),
    head: z.string().optional(),
    pull_number: z.number().int().positive().optional(),
    format: z.enum(['patch', 'summary']).default('summary'),
    max_bytes: z.number().int().positive().default(262144),
  })
  .strict();
export type DiffGetArgs = z.infer<typeof DiffGetArgs>;

// --- Pull requests --------------------------------------------------------

export const PrOpenArgs = z
  .object({
    repo: RepoSpec,
    title: z.string(),
    head: z.string().describe('Branch with the changes.'),
    base: z
      .string()
      .optional()
      .describe('Branch to merge into. Defaults to the repo default branch.'),
    body: z
      .string()
      .optional()
      .describe('PR description. Include the AI disclosure where a program reads it.'),
    draft: z.boolean().default(false),
  })
  .strict();
export type PrOpenArgs = z.infer<typeof PrOpenArgs>;

export const PrListArgs = z
  .object({
    repo: RepoSpec,
    state: z.enum(['open', 'closed', 'merged', 'all']).default('open'),
    base: z.string().optional(),
    head: z.string().optional(),
    cursor: Cursor.optional(),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export type PrListArgs = z.infer<typeof PrListArgs>;

export const PrGetArgs = z.object({ repo: RepoSpec, number: z.number().int().positive() }).strict();
export type PrGetArgs = z.infer<typeof PrGetArgs>;

export const PrCommentArgs = z
  .object({
    repo: RepoSpec,
    number: z.number().int().positive(),
    body: z.string(),
    path: z
      .string()
      .optional()
      .describe('File path for an inline comment. Omit for a general comment.'),
    line: z.number().int().positive().optional(),
  })
  .strict();
export type PrCommentArgs = z.infer<typeof PrCommentArgs>;

const InlineComment = z
  .object({ path: z.string(), line: z.number().int().positive(), body: z.string() })
  .strict();

export const PrReviewArgs = z
  .object({
    repo: RepoSpec,
    number: z.number().int().positive(),
    event: z.enum(['approve', 'request_changes', 'comment']),
    body: z.string().optional(),
    comments: z.array(InlineComment).optional(),
  })
  .strict();
export type PrReviewArgs = z.infer<typeof PrReviewArgs>;

export const PrMergeArgs = z
  .object({
    repo: RepoSpec,
    number: z.number().int().positive(),
    method: z.enum(['merge', 'squash', 'rebase']).default('squash'),
    commit_title: z.string().optional(),
    commit_message: z.string().optional(),
    expected_head: z.string().optional(),
    delete_branch: z.boolean().default(true),
  })
  .strict();
export type PrMergeArgs = z.infer<typeof PrMergeArgs>;

// --- Issues ---------------------------------------------------------------

export const IssueOpenArgs = z
  .object({
    repo: RepoSpec,
    title: z.string(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(Handle).optional(),
  })
  .strict();
export type IssueOpenArgs = z.infer<typeof IssueOpenArgs>;

export const IssueListArgs = z
  .object({
    repo: RepoSpec,
    state: z.enum(['open', 'closed', 'all']).default('open'),
    labels: z.array(z.string()).optional(),
    assignee: Handle.optional(),
    cursor: Cursor.optional(),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export type IssueListArgs = z.infer<typeof IssueListArgs>;

export const IssueCommentArgs = z
  .object({ repo: RepoSpec, number: z.number().int().positive(), body: z.string() })
  .strict();
export type IssueCommentArgs = z.infer<typeof IssueCommentArgs>;

export const IssueCloseArgs = z
  .object({
    repo: RepoSpec,
    number: z.number().int().positive(),
    state_reason: z.enum(['completed', 'not_planned']).default('completed'),
    comment: z.string().optional(),
  })
  .strict();
export type IssueCloseArgs = z.infer<typeof IssueCloseArgs>;

export const IssueReopenArgs = z
  .object({ repo: RepoSpec, number: z.number().int().positive() })
  .strict();
export type IssueReopenArgs = z.infer<typeof IssueReopenArgs>;

// --- CI -------------------------------------------------------------------

export const CiRunArgs = z
  .object({
    repo: RepoSpec,
    ref: z.string().optional(),
    workflow: z.string().optional(),
    inputs: z.record(z.unknown()).optional(),
    idempotency_key: z.string().optional(),
  })
  .strict();
export type CiRunArgs = z.infer<typeof CiRunArgs>;

export const CiStatusArgs = z.object({ repo: RepoSpec, run_id: z.string() }).strict();
export type CiStatusArgs = z.infer<typeof CiStatusArgs>;

export const CiLogsArgs = z
  .object({
    repo: RepoSpec,
    run_id: z.string(),
    job: z.string().optional(),
    tail: z.number().int().positive().default(200),
    cursor: Cursor.optional(),
  })
  .strict();
export type CiLogsArgs = z.infer<typeof CiLogsArgs>;

// --- Search ---------------------------------------------------------------

export const SearchReposArgs = z
  .object({
    q: z.string(),
    owner: Handle.optional(),
    visibility: z.enum(['all', 'public', 'private']).default('all'),
    language: z.string().optional(),
    cursor: Cursor.optional(),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export type SearchReposArgs = z.infer<typeof SearchReposArgs>;

export const SearchCodeArgs = z
  .object({
    q: z.string(),
    repo: RepoSpec.optional(),
    owner: Handle.optional(),
    path: z.string().optional().describe('Glob to restrict the path, e.g. src/**/*.ts'),
    language: z.string().optional(),
    cursor: Cursor.optional(),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export type SearchCodeArgs = z.infer<typeof SearchCodeArgs>;

export const SearchIssuesArgs = z
  .object({
    q: z.string(),
    repo: RepoSpec.optional(),
    owner: Handle.optional(),
    state: z.enum(['open', 'closed', 'merged', 'all']).default('all'),
    type: z.enum(['issue', 'pr', 'any']).default('any'),
    cursor: Cursor.optional(),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export type SearchIssuesArgs = z.infer<typeof SearchIssuesArgs>;

// --- Registry -------------------------------------------------------------

/** One agent-facing tool: a stable name, a model-read description, its arg schema. */
export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
}

/**
 * The canonical MuseHub tool catalog. Downstream packages emit each schema as a
 * Meta Model API function tool (`parameters`) and an MCP tool (`inputSchema`),
 * and the REST layer validates request bodies with the same schema.
 */
export const TOOLS = [
  {
    name: 'forge.enroll',
    description:
      'Register this Muse agent on MuseHub and get an API token. Call once before any other action.',
    schema: EnrollArgs,
  },
  {
    name: 'forge.whoami',
    description: "Return the calling agent's account and token status.",
    schema: WhoamiArgs,
  },
  {
    name: 'forge.repo_create',
    description: 'Create a repository owned by the calling agent. Defaults to private.',
    schema: RepoCreateArgs,
  },
  {
    name: 'forge.repo_list',
    description: "List repositories, by default the calling agent's.",
    schema: RepoListArgs,
  },
  { name: 'forge.repo_get', description: "Get one repository's metadata.", schema: RepoGetArgs },
  {
    name: 'forge.repo_delete',
    description: 'Permanently delete a repository. Requires the full name as confirmation.',
    schema: RepoDeleteArgs,
  },
  {
    name: 'forge.tree_read',
    description: 'List files and directories at a path in a repo.',
    schema: TreeReadArgs,
  },
  {
    name: 'forge.file_read',
    description: "Read one file's contents at a ref.",
    schema: FileReadArgs,
  },
  {
    name: 'forge.commit_create',
    description: 'Write, edit or delete one or more files and commit them in one atomic commit.',
    schema: CommitCreateArgs,
  },
  {
    name: 'forge.file_write',
    description: 'Create or overwrite a single file and commit it.',
    schema: FileWriteArgs,
  },
  {
    name: 'forge.branch_create',
    description: 'Create a branch from a base ref.',
    schema: BranchCreateArgs,
  },
  {
    name: 'forge.branch_switch',
    description:
      'Set the branch later file and commit calls default to for a repo. Does not change the repo default branch.',
    schema: BranchSwitchArgs,
  },
  {
    name: 'forge.diff_get',
    description: 'Get the diff between two refs or for a pull request.',
    schema: DiffGetArgs,
  },
  {
    name: 'forge.pr_open',
    description: 'Open a pull request from a head branch into a base branch.',
    schema: PrOpenArgs,
  },
  {
    name: 'forge.pr_list',
    description: 'List pull requests in a repo, filtered by state.',
    schema: PrListArgs,
  },
  {
    name: 'forge.pr_get',
    description: 'Get one pull request including its mergeability and check status.',
    schema: PrGetArgs,
  },
  {
    name: 'forge.pr_comment',
    description: 'Add a comment to a pull request, optionally on a specific file and line.',
    schema: PrCommentArgs,
  },
  {
    name: 'forge.pr_review',
    description: 'Submit a review on a pull request: approve, request changes or comment.',
    schema: PrReviewArgs,
  },
  {
    name: 'forge.pr_merge',
    description: 'Merge a pull request once its required checks and reviews pass.',
    schema: PrMergeArgs,
  },
  { name: 'forge.issue_open', description: 'Open an issue in a repo.', schema: IssueOpenArgs },
  {
    name: 'forge.issue_list',
    description: 'List issues in a repo, filtered by state, label or assignee.',
    schema: IssueListArgs,
  },
  {
    name: 'forge.issue_comment',
    description: 'Add a comment to an issue.',
    schema: IssueCommentArgs,
  },
  {
    name: 'forge.issue_close',
    description: 'Close an issue, optionally with a reason and a closing comment.',
    schema: IssueCloseArgs,
  },
  { name: 'forge.issue_reopen', description: 'Reopen a closed issue.', schema: IssueReopenArgs },
  { name: 'forge.ci_run', description: 'Trigger a CI run for a ref.', schema: CiRunArgs },
  {
    name: 'forge.ci_status',
    description: "Get a CI run's status, conclusion and per-job results.",
    schema: CiStatusArgs,
  },
  {
    name: 'forge.ci_logs',
    description: "Read a CI run's logs, by job, tailing the most recent output.",
    schema: CiLogsArgs,
  },
  {
    name: 'forge.search_repos',
    description: 'Search repositories by name, description or topic.',
    schema: SearchReposArgs,
  },
  {
    name: 'forge.search_code',
    description: 'Search file contents across repos the agent can read.',
    schema: SearchCodeArgs,
  },
  {
    name: 'forge.search_issues',
    description: 'Search issues and pull requests by text and state.',
    schema: SearchIssuesArgs,
  },
] as const satisfies readonly ToolDef[];

export type ToolName = (typeof TOOLS)[number]['name'];

/** Lookup a tool definition by name. */
export const TOOLS_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);
