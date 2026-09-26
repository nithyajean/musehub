// Transport-shaped schemas built ON TOP of the frozen contract schemas. The forge.*
// tool schemas assume every argument arrives in one JSON object. REST splits that
// object across the path (owner, repo, number, run_id, the file path) and, for GET
// routes, the query string (where every value is a string until coerced). So:
//   - path fields are validated by small params schemas here,
//   - request bodies are validated by the contract schema with the path fields
//     omitted (still .strict(), so a hallucinated field still fails),
//   - query strings are validated by the same contract fields with numeric, boolean
//     and array values coerced from their string form.
// Each handler reassembles the full contract argument object before calling forge.
import {
  ActivityListArgs,
  BranchCreateArgs,
  CiLogsArgs,
  CiRunArgs,
  CommitCreateArgs,
  DiffGetArgs,
  FileReadArgs,
  FileWriteArgs,
  Handle,
  IssueCloseArgs,
  IssueCommentArgs,
  IssueListArgs,
  IssueOpenArgs,
  NotificationsListArgs,
  NotificationsMarkReadArgs,
  OrgAddMemberArgs,
  OrgCreateArgs,
  OrgListArgs,
  PrCommentArgs,
  PrListArgs,
  PrMergeArgs,
  PrOpenArgs,
  PrReviewArgs,
  RepoAddCollaboratorArgs,
  RepoDeleteArgs,
  RepoListArgs,
  RepoListCollaboratorsArgs,
  RepoName,
  SearchCodeArgs,
  SearchIssuesArgs,
  SearchReposArgs,
  Slug,
  TeamAddMemberArgs,
  TeamCreateArgs,
  TreeReadArgs,
  WebhookCreateArgs,
  WebhookListArgs,
} from '@musehub/contracts';
import { ReleaseCreateArgs, ReleaseListArgs } from '@musehub/contracts';
import { z } from 'zod';

// --- Query coercion helpers ------------------------------------------------
const limitQuery = z.coerce.number().int().min(1).max(100).default(30);
const positiveIntQuery = (def: number) => z.coerce.number().int().positive().default(def);
const boolQuery = (def: boolean) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === true || v === 'true' || v === '1'),
    z.boolean().default(def),
  );
const stringArrayQuery = z.preprocess(
  (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
  z.array(z.string()).optional(),
);

// --- Path params -----------------------------------------------------------
export const RepoParams = z.object({ owner: Handle, repo: RepoName });
export const RepoNumberParams = z.object({
  owner: Handle,
  repo: RepoName,
  number: z.coerce.number().int().positive(),
});
export const RepoRunParams = z.object({ owner: Handle, repo: RepoName, run_id: z.string().min(1) });
// The file path is a wildcard segment. Passthrough keeps request.params['*'] intact
// after validation strips unknown keys; the handler reads it and builds the path.
export const RepoFileParams = z.object({ owner: Handle, repo: RepoName }).passthrough();

// --- Query strings (contract fields, numeric/boolean/array values coerced) -
export const RepoListQuery = RepoListArgs.extend({ limit: limitQuery });
export const TreeReadQuery = TreeReadArgs.omit({ repo: true }).extend({
  recursive: boolQuery(false),
});
export const FileReadQuery = FileReadArgs.omit({ repo: true, path: true }).extend({
  max_bytes: positiveIntQuery(262144),
});
export const DiffCompareQuery = DiffGetArgs.omit({ repo: true, pull_number: true }).extend({
  max_bytes: positiveIntQuery(262144),
});
export const DiffPullQuery = DiffGetArgs.omit({
  repo: true,
  base: true,
  head: true,
  pull_number: true,
}).extend({ max_bytes: positiveIntQuery(262144) });
export const PrListQuery = PrListArgs.omit({ repo: true }).extend({ limit: limitQuery });
export const IssueListQuery = IssueListArgs.omit({ repo: true }).extend({
  labels: stringArrayQuery,
  limit: limitQuery,
});
export const CiLogsQuery = CiLogsArgs.omit({ repo: true, run_id: true }).extend({
  tail: positiveIntQuery(200),
});
export const SearchReposQuery = SearchReposArgs.extend({ limit: limitQuery });
export const SearchCodeQuery = SearchCodeArgs.extend({ limit: limitQuery });
export const SearchIssuesQuery = SearchIssuesArgs.extend({ limit: limitQuery });

// --- Request bodies (contract schema with path fields omitted, still strict) -
export const RepoDeleteBody = RepoDeleteArgs.omit({ repo: true });
export const CommitCreateBody = CommitCreateArgs.omit({ repo: true });
export const FileWriteBody = FileWriteArgs.omit({ repo: true, path: true });
export const BranchCreateBody = BranchCreateArgs.omit({ repo: true });
export const PrOpenBody = PrOpenArgs.omit({ repo: true });
export const PrCommentBody = PrCommentArgs.omit({ repo: true, number: true });
export const PrReviewBody = PrReviewArgs.omit({ repo: true, number: true });
export const PrMergeBody = PrMergeArgs.omit({ repo: true, number: true });
export const IssueOpenBody = IssueOpenArgs.omit({ repo: true });
export const IssueCommentBody = IssueCommentArgs.omit({ repo: true, number: true });
export const IssueCloseBody = IssueCloseArgs.omit({ repo: true, number: true });
export const CiRunBody = CiRunArgs.omit({ repo: true });

// --- Organizations, teams and collaborators --------------------------------
export const OrgParams = z.object({ org: Handle });
export const OrgMemberParams = z.object({ org: Handle, agent: Handle });
export const OrgTeamParams = z.object({ org: Handle, team: Slug });
export const RepoCollabParams = z.object({ owner: Handle, repo: RepoName, agent: Handle });

export const OrgCreateBody = OrgCreateArgs;
export const OrgListQuery = OrgListArgs.extend({ limit: limitQuery });
export const OrgAddMemberBody = OrgAddMemberArgs.omit({ org: true });
export const TeamCreateBody = TeamCreateArgs.omit({ org: true });
export const TeamAddMemberBody = TeamAddMemberArgs.omit({ org: true, team: true });
export const RepoAddCollaboratorBody = RepoAddCollaboratorArgs.omit({ repo: true });
export const RepoListCollaboratorsQuery = RepoListCollaboratorsArgs.omit({ repo: true }).extend({
  limit: limitQuery,
});

// --- Webhooks, notifications and the activity feed -------------------------
export const RepoWebhookParams = z.object({
  owner: Handle,
  repo: RepoName,
  id: z.string().min(1),
});
export const WebhookCreateBody = WebhookCreateArgs.omit({ repo: true });
export const WebhookListQuery = WebhookListArgs.omit({ repo: true }).extend({ limit: limitQuery });
export const NotificationsListQuery = NotificationsListArgs.extend({
  unread: boolQuery(false),
  limit: limitQuery,
});
export const NotificationsMarkReadBody = NotificationsMarkReadArgs;
export const ActivityListQuery = ActivityListArgs.extend({ limit: limitQuery });

// --- Releases --------------------------------------------------------------
export const RepoTagParams = z.object({
  owner: Handle,
  repo: RepoName,
  tag: z.string().min(1),
});
export const ReleaseCreateBody = ReleaseCreateArgs.omit({ repo: true });
export const ReleaseListQuery = ReleaseListArgs.omit({ repo: true }).extend({ limit: limitQuery });
