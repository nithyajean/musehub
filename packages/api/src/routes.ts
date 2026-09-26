// REST routes for all 30 forge.* operations, at the exact paths in R6 section 4.
// Every route: validate input with the matching contract schema, resolve the Bearer
// token to an AuthContext (via the shared requireAuth preHandler), call the one
// ForgeService method, return its result. The service owns business rules and audit;
// this layer only maps HTTP to the interface.
import { BranchSwitchArgs, EnrollArgs, RepoCreateArgs } from '@musehub/contracts';
import { authOf, makeRequireAuth } from './auth.js';
import type { BuildApiDeps, ZodApp } from './deps.js';
import {
  BranchCreateBody,
  CiLogsQuery,
  CiRunBody,
  CommitCreateBody,
  DiffCompareQuery,
  DiffPullQuery,
  FileReadQuery,
  FileWriteBody,
  IssueCloseBody,
  IssueCommentBody,
  IssueListQuery,
  IssueOpenBody,
  PrCommentBody,
  PrListQuery,
  PrMergeBody,
  PrOpenBody,
  PrReviewBody,
  RepoDeleteBody,
  RepoFileParams,
  RepoListQuery,
  RepoNumberParams,
  RepoParams,
  RepoRunParams,
  SearchCodeQuery,
  SearchIssuesQuery,
  SearchReposQuery,
  TreeReadQuery,
} from './http-schemas.js';

const TAGS = ['forge'];

export function registerRestRoutes(app: ZodApp, deps: BuildApiDeps): void {
  const requireAuth = makeRequireAuth(deps);
  const forge = deps.forge;
  const spec = (p: { owner: string; repo: string }) => `${p.owner}/${p.repo}`;
  const wildcard = (p: object) => (p as Record<string, string>)['*'] ?? '';

  // --- Onboarding ---------------------------------------------------------
  app.post('/v1/enroll', { schema: { body: EnrollArgs, tags: TAGS } }, async (request, reply) => {
    const result = await forge.enroll(request.body);
    reply.code(201);
    return result;
  });

  app.get('/v1/me', { preHandler: requireAuth, schema: { tags: TAGS } }, async (request) =>
    forge.whoami(authOf(request)),
  );

  // --- Repositories -------------------------------------------------------
  app.post(
    '/v1/repos',
    { preHandler: requireAuth, schema: { body: RepoCreateArgs, tags: TAGS } },
    async (request, reply) => {
      const result = await forge.repoCreate(authOf(request), request.body);
      reply.code(201);
      return result;
    },
  );

  app.get(
    '/v1/repos',
    { preHandler: requireAuth, schema: { querystring: RepoListQuery, tags: TAGS } },
    async (request) => forge.repoList(authOf(request), request.query),
  );

  app.get(
    '/v1/repos/:owner/:repo',
    { preHandler: requireAuth, schema: { params: RepoParams, tags: TAGS } },
    async (request) => forge.repoGet(authOf(request), { repo: spec(request.params) }),
  );

  app.delete(
    '/v1/repos/:owner/:repo',
    { preHandler: requireAuth, schema: { params: RepoParams, body: RepoDeleteBody, tags: TAGS } },
    async (request) =>
      forge.repoDelete(authOf(request), { repo: spec(request.params), ...request.body }),
  );

  // --- Files and commits --------------------------------------------------
  app.get(
    '/v1/repos/:owner/:repo/tree',
    {
      preHandler: requireAuth,
      schema: { params: RepoParams, querystring: TreeReadQuery, tags: TAGS },
    },
    async (request) =>
      forge.treeRead(authOf(request), { repo: spec(request.params), ...request.query }),
  );

  app.get(
    '/v1/repos/:owner/:repo/contents/*',
    {
      preHandler: requireAuth,
      schema: { params: RepoFileParams, querystring: FileReadQuery, tags: TAGS },
    },
    async (request) =>
      forge.fileRead(authOf(request), {
        repo: spec(request.params),
        path: wildcard(request.params),
        ...request.query,
      }),
  );

  app.post(
    '/v1/repos/:owner/:repo/commits',
    { preHandler: requireAuth, schema: { params: RepoParams, body: CommitCreateBody, tags: TAGS } },
    async (request, reply) => {
      const result = await forge.commitCreate(authOf(request), {
        repo: spec(request.params),
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.put(
    '/v1/repos/:owner/:repo/contents/*',
    {
      preHandler: requireAuth,
      schema: { params: RepoFileParams, body: FileWriteBody, tags: TAGS },
    },
    async (request, reply) => {
      const result = await forge.fileWrite(authOf(request), {
        repo: spec(request.params),
        path: wildcard(request.params),
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.post(
    '/v1/repos/:owner/:repo/branches',
    { preHandler: requireAuth, schema: { params: RepoParams, body: BranchCreateBody, tags: TAGS } },
    async (request, reply) => {
      const result = await forge.branchCreate(authOf(request), {
        repo: spec(request.params),
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.put(
    '/v1/session/working-branch',
    { preHandler: requireAuth, schema: { body: BranchSwitchArgs, tags: TAGS } },
    async (request) => forge.branchSwitch(authOf(request), request.body),
  );

  app.get(
    '/v1/repos/:owner/:repo/compare',
    {
      preHandler: requireAuth,
      schema: { params: RepoParams, querystring: DiffCompareQuery, tags: TAGS },
    },
    async (request) =>
      forge.diffGet(authOf(request), { repo: spec(request.params), ...request.query }),
  );

  // --- Pull requests ------------------------------------------------------
  app.post(
    '/v1/repos/:owner/:repo/pulls',
    { preHandler: requireAuth, schema: { params: RepoParams, body: PrOpenBody, tags: TAGS } },
    async (request, reply) => {
      const result = await forge.prOpen(authOf(request), {
        repo: spec(request.params),
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.get(
    '/v1/repos/:owner/:repo/pulls',
    {
      preHandler: requireAuth,
      schema: { params: RepoParams, querystring: PrListQuery, tags: TAGS },
    },
    async (request) =>
      forge.prList(authOf(request), { repo: spec(request.params), ...request.query }),
  );

  app.get(
    '/v1/repos/:owner/:repo/pulls/:number',
    { preHandler: requireAuth, schema: { params: RepoNumberParams, tags: TAGS } },
    async (request) =>
      forge.prGet(authOf(request), {
        repo: spec(request.params),
        number: request.params.number,
      }),
  );

  app.get(
    '/v1/repos/:owner/:repo/pulls/:number/diff',
    {
      preHandler: requireAuth,
      schema: { params: RepoNumberParams, querystring: DiffPullQuery, tags: TAGS },
    },
    async (request) =>
      forge.diffGet(authOf(request), {
        repo: spec(request.params),
        pull_number: request.params.number,
        ...request.query,
      }),
  );

  app.post(
    '/v1/repos/:owner/:repo/pulls/:number/comments',
    {
      preHandler: requireAuth,
      schema: { params: RepoNumberParams, body: PrCommentBody, tags: TAGS },
    },
    async (request, reply) => {
      const result = await forge.prComment(authOf(request), {
        repo: spec(request.params),
        number: request.params.number,
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.post(
    '/v1/repos/:owner/:repo/pulls/:number/reviews',
    {
      preHandler: requireAuth,
      schema: { params: RepoNumberParams, body: PrReviewBody, tags: TAGS },
    },
    async (request, reply) => {
      const result = await forge.prReview(authOf(request), {
        repo: spec(request.params),
        number: request.params.number,
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.post(
    '/v1/repos/:owner/:repo/pulls/:number/merge',
    {
      preHandler: requireAuth,
      schema: { params: RepoNumberParams, body: PrMergeBody, tags: TAGS },
    },
    async (request) =>
      forge.prMerge(authOf(request), {
        repo: spec(request.params),
        number: request.params.number,
        ...request.body,
      }),
  );

  // --- Issues -------------------------------------------------------------
  app.post(
    '/v1/repos/:owner/:repo/issues',
    { preHandler: requireAuth, schema: { params: RepoParams, body: IssueOpenBody, tags: TAGS } },
    async (request, reply) => {
      const result = await forge.issueOpen(authOf(request), {
        repo: spec(request.params),
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.get(
    '/v1/repos/:owner/:repo/issues',
    {
      preHandler: requireAuth,
      schema: { params: RepoParams, querystring: IssueListQuery, tags: TAGS },
    },
    async (request) =>
      forge.issueList(authOf(request), { repo: spec(request.params), ...request.query }),
  );

  app.post(
    '/v1/repos/:owner/:repo/issues/:number/comments',
    {
      preHandler: requireAuth,
      schema: { params: RepoNumberParams, body: IssueCommentBody, tags: TAGS },
    },
    async (request, reply) => {
      const result = await forge.issueComment(authOf(request), {
        repo: spec(request.params),
        number: request.params.number,
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.post(
    '/v1/repos/:owner/:repo/issues/:number/close',
    {
      preHandler: requireAuth,
      schema: { params: RepoNumberParams, body: IssueCloseBody, tags: TAGS },
    },
    async (request) =>
      forge.issueClose(authOf(request), {
        repo: spec(request.params),
        number: request.params.number,
        ...request.body,
      }),
  );

  app.post(
    '/v1/repos/:owner/:repo/issues/:number/reopen',
    { preHandler: requireAuth, schema: { params: RepoNumberParams, tags: TAGS } },
    async (request) =>
      forge.issueReopen(authOf(request), {
        repo: spec(request.params),
        number: request.params.number,
      }),
  );

  // --- CI -----------------------------------------------------------------
  app.post(
    '/v1/repos/:owner/:repo/ci/runs',
    { preHandler: requireAuth, schema: { params: RepoParams, body: CiRunBody, tags: TAGS } },
    async (request, reply) => {
      const result = await forge.ciRun(authOf(request), {
        repo: spec(request.params),
        ...request.body,
      });
      reply.code(201);
      return result;
    },
  );

  app.get(
    '/v1/repos/:owner/:repo/ci/runs/:run_id',
    { preHandler: requireAuth, schema: { params: RepoRunParams, tags: TAGS } },
    async (request) =>
      forge.ciStatus(authOf(request), {
        repo: spec(request.params),
        run_id: request.params.run_id,
      }),
  );

  app.get(
    '/v1/repos/:owner/:repo/ci/runs/:run_id/logs',
    {
      preHandler: requireAuth,
      schema: { params: RepoRunParams, querystring: CiLogsQuery, tags: TAGS },
    },
    async (request) =>
      forge.ciLogs(authOf(request), {
        repo: spec(request.params),
        run_id: request.params.run_id,
        ...request.query,
      }),
  );

  // --- Search -------------------------------------------------------------
  app.get(
    '/v1/search/repos',
    { preHandler: requireAuth, schema: { querystring: SearchReposQuery, tags: TAGS } },
    async (request) => forge.searchRepos(authOf(request), request.query),
  );

  app.get(
    '/v1/search/code',
    { preHandler: requireAuth, schema: { querystring: SearchCodeQuery, tags: TAGS } },
    async (request) => forge.searchCode(authOf(request), request.query),
  );

  app.get(
    '/v1/search/issues',
    { preHandler: requireAuth, schema: { querystring: SearchIssuesQuery, tags: TAGS } },
    async (request) => forge.searchIssues(authOf(request), request.query),
  );
}
