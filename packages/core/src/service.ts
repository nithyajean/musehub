import type {
  Agent,
  AuditEvent,
  Branch,
  // arg types
  BranchCreateArgs,
  BranchSwitchArgs,
  CiLogsArgs,
  CiRun,
  CiRunArgs,
  CiStatusArgs,
  Collaborator,
  CommitCreateArgs,
  DiffFile,
  DiffGetArgs,
  EnrollArgs,
  FileReadArgs,
  FileWriteArgs,
  Issue,
  IssueCloseArgs,
  IssueCommentArgs,
  IssueListArgs,
  IssueOpenArgs,
  IssueReopenArgs,
  Membership,
  Org,
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
  PullRequest,
  Repo,
  RepoAddCollaboratorArgs,
  RepoCreateArgs,
  RepoDeleteArgs,
  RepoGetArgs,
  RepoListArgs,
  RepoListCollaboratorsArgs,
  RepoRemoveCollaboratorArgs,
  Review,
  SearchCodeArgs,
  SearchIssuesArgs,
  SearchReposArgs,
  Team,
  TeamAddMemberArgs,
  TeamCreateArgs,
  TeamMember,
  TreeEntry,
  TreeReadArgs,
} from '@musehub/contracts';
/** The agent-facing paginated wire shape. Snake_case `next_cursor` per R6, so
 * the REST API and the MCP server (which forward the service result verbatim)
 * expose one consistent shape. The service maps the store's internal Page<T>
 * (camelCase nextCursor) to this at the boundary. */
export interface WirePage<T> {
  items: T[];
  next_cursor: string | null;
  total?: number;
}

/** The authenticated caller, resolved from the Bearer token before any operation. */
export interface AuthContext {
  agent: Agent;
  tokenId: string;
}

export interface EnrollResult {
  agent: Agent;
  token: string;
  token_expires_at: string;
  is_new: boolean;
}

export interface RepoDetail extends Repo {
  head_sha: string | null;
  open_pr_count: number;
  open_issue_count: number;
}

export interface TreeResult {
  ref: string;
  sha: string;
  entries: TreeEntry[];
  truncated: boolean;
}

export interface FileResult {
  path: string;
  ref: string;
  sha: string;
  size: number;
  encoding: 'text' | 'base64';
  content: string;
  truncated: boolean;
}

export interface CommitResult {
  commit_sha: string;
  branch: string;
  parents: string[];
  tree_sha: string;
  files_changed: number;
  unchanged: boolean;
}

export interface BranchResult {
  branch: string;
  head_sha: string;
  created: boolean;
}

export interface DiffResult {
  base_sha: string;
  head_sha: string;
  files: DiffFile[];
  patch?: string;
  truncated: boolean;
}

export interface PrDetail extends PullRequest {
  mergeable_state: string;
  required_checks: { name: string; status: string; conclusion: string | null }[];
  review_state: string;
  behind_by: number;
}

export interface MergeResult {
  merged: boolean;
  merge_sha: string;
  already_merged: boolean;
}

export interface CodeHit {
  repo: string;
  path: string;
  ref: string;
  line: number;
  snippet: string;
  url: string;
}

export interface IssueHit {
  repo: string;
  number: number;
  type: 'issue' | 'pr';
  title: string;
  state: string;
  url: string;
}

/** An org plus a light rollup for the dashboard and the caller's own role in it. */
export interface OrgDetail extends Org {
  member_count: number;
  team_count: number;
  viewer_role: 'owner' | 'admin' | 'member' | null;
}

/**
 * The one implementation of every forge operation. Both the REST API and the MCP
 * server adapt their transport to this interface, so validation, authorization
 * and audit happen in exactly one place. Implemented in @musehub/service over the
 * ports; consumed by @musehub/api and @musehub/mcp against this interface.
 */
export interface ForgeService {
  // onboarding
  enroll(args: EnrollArgs): Promise<EnrollResult>;
  whoami(ctx: AuthContext): Promise<{ agent: Agent; token_expires_at: string | null }>;

  // repositories
  repoCreate(ctx: AuthContext, args: RepoCreateArgs): Promise<Repo & { unchanged?: boolean }>;
  repoList(ctx: AuthContext, args: RepoListArgs): Promise<WirePage<Repo>>;
  repoGet(ctx: AuthContext, args: RepoGetArgs): Promise<RepoDetail>;
  repoDelete(ctx: AuthContext, args: RepoDeleteArgs): Promise<{ unchanged: boolean }>;

  // files and commits
  treeRead(ctx: AuthContext, args: TreeReadArgs): Promise<TreeResult>;
  fileRead(ctx: AuthContext, args: FileReadArgs): Promise<FileResult>;
  commitCreate(ctx: AuthContext, args: CommitCreateArgs): Promise<CommitResult>;
  fileWrite(ctx: AuthContext, args: FileWriteArgs): Promise<CommitResult>;
  branchCreate(ctx: AuthContext, args: BranchCreateArgs): Promise<BranchResult>;
  branchSwitch(ctx: AuthContext, args: BranchSwitchArgs): Promise<{ repo: string; branch: string }>;
  diffGet(ctx: AuthContext, args: DiffGetArgs): Promise<DiffResult>;

  // pull requests
  prOpen(ctx: AuthContext, args: PrOpenArgs): Promise<PullRequest>;
  prList(ctx: AuthContext, args: PrListArgs): Promise<WirePage<PullRequest>>;
  prGet(ctx: AuthContext, args: PrGetArgs): Promise<PrDetail>;
  prComment(ctx: AuthContext, args: PrCommentArgs): Promise<{ ok: true }>;
  prReview(ctx: AuthContext, args: PrReviewArgs): Promise<Review>;
  prMerge(ctx: AuthContext, args: PrMergeArgs): Promise<MergeResult>;

  // issues
  issueOpen(ctx: AuthContext, args: IssueOpenArgs): Promise<Issue>;
  issueList(ctx: AuthContext, args: IssueListArgs): Promise<WirePage<Issue>>;
  issueComment(ctx: AuthContext, args: IssueCommentArgs): Promise<{ ok: true }>;
  issueClose(ctx: AuthContext, args: IssueCloseArgs): Promise<{ unchanged: boolean }>;
  issueReopen(ctx: AuthContext, args: IssueReopenArgs): Promise<{ unchanged: boolean }>;

  // ci
  ciRun(ctx: AuthContext, args: CiRunArgs): Promise<CiRun>;
  ciStatus(ctx: AuthContext, args: CiStatusArgs): Promise<CiRun>;
  ciLogs(
    ctx: AuthContext,
    args: CiLogsArgs,
  ): Promise<{
    run_id: string;
    job: string | null;
    lines: string[];
    next_cursor: string | null;
    truncated: boolean;
  }>;

  // search
  searchRepos(ctx: AuthContext, args: SearchReposArgs): Promise<WirePage<Repo>>;
  searchCode(ctx: AuthContext, args: SearchCodeArgs): Promise<WirePage<CodeHit>>;
  searchIssues(ctx: AuthContext, args: SearchIssuesArgs): Promise<WirePage<IssueHit>>;

  // organizations, teams and collaborators
  orgCreate(ctx: AuthContext, args: OrgCreateArgs): Promise<Org>;
  orgGet(ctx: AuthContext, args: OrgGetArgs): Promise<OrgDetail>;
  orgList(ctx: AuthContext, args: OrgListArgs): Promise<WirePage<Org>>;
  orgAddMember(ctx: AuthContext, args: OrgAddMemberArgs): Promise<Membership>;
  orgRemoveMember(ctx: AuthContext, args: OrgRemoveMemberArgs): Promise<{ removed: boolean }>;
  teamCreate(ctx: AuthContext, args: TeamCreateArgs): Promise<Team>;
  teamAddMember(ctx: AuthContext, args: TeamAddMemberArgs): Promise<TeamMember>;
  repoAddCollaborator(ctx: AuthContext, args: RepoAddCollaboratorArgs): Promise<Collaborator>;
  repoRemoveCollaborator(
    ctx: AuthContext,
    args: RepoRemoveCollaboratorArgs,
  ): Promise<{ removed: boolean }>;
  repoListCollaborators(
    ctx: AuthContext,
    args: RepoListCollaboratorsArgs,
  ): Promise<WirePage<Collaborator>>;

  // observability (dashboard/admin read side)
  listAudit(
    ctx: AuthContext,
    q: { actor?: string; cursor?: string; limit: number },
  ): Promise<WirePage<AuditEvent>>;
  listBranches(ctx: AuthContext, repo: string): Promise<Branch[]>;
}
