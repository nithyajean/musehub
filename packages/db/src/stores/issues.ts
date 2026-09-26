import type { Issue, IssueState } from '@musehub/contracts';
import type { Clock, IdGen, IssueStore, Page } from '@musehub/core';
import { type SQL, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { Exec, Row } from '../types.js';
import { bool, boolInt, jsonArray, num, str, strOrNull } from './row.js';
import { nextRepoNumber } from './sequence.js';

interface NumberCursor {
  n: number;
}

function mapIssue(r: Row): Issue {
  return {
    number: num(r.number),
    repo: str(r.repo),
    state: str(r.state) as IssueState,
    title: str(r.title),
    body: strOrNull(r.body),
    author: str(r.author),
    labels: jsonArray<string>(r.labels),
    assignees: jsonArray<string>(r.assignees),
    is_pr: bool(r.is_pr),
    url: str(r.url),
    created_at: str(r.created_at),
  };
}

export function makeIssueStore(exec: Exec, clock: Clock, ids: IdGen): IssueStore {
  return {
    async create(input): Promise<Issue> {
      const number = await nextRepoNumber(exec, input.repo);
      const createdAt = clock.now().toISOString();
      const url = `/${input.repo}/issues/${number}`;
      await exec.run(sql`
        INSERT INTO issues (repo, number, state, title, body, author, labels, assignees, is_pr, url, created_at)
        VALUES (${input.repo}, ${number}, ${'open'}, ${input.title}, ${input.body}, ${input.author},
                ${JSON.stringify(input.labels)}, ${JSON.stringify(input.assignees)}, ${boolInt(false)},
                ${url}, ${createdAt})`);
      return {
        number,
        repo: input.repo,
        state: 'open',
        title: input.title,
        body: input.body,
        author: input.author,
        labels: input.labels,
        assignees: input.assignees,
        is_pr: false,
        url,
        created_at: createdAt,
      };
    },

    async get(repo: string, number: number): Promise<Issue | null> {
      const row = await exec.get<Row>(
        sql`SELECT * FROM issues WHERE repo = ${repo} AND number = ${number}`,
      );
      return row ? mapIssue(row) : null;
    },

    // Label and assignee filters run in memory: they read JSON columns and stay one
    // code path across dialects. The result set per repo is small, so the scan is fine.
    async list(q): Promise<Page<Issue>> {
      const conds: SQL[] = [sql`repo = ${q.repo}`];
      if (q.state !== 'all') conds.push(sql`state = ${q.state}`);
      const where = sql`WHERE ${sql.join(conds, sql` AND `)}`;
      const rows = await exec.all<Row>(sql`SELECT * FROM issues ${where} ORDER BY number ASC`);

      let issues = rows.map(mapIssue);
      if (q.labels && q.labels.length > 0) {
        const wanted = q.labels;
        issues = issues.filter((i) => wanted.every((l) => i.labels.includes(l)));
      }
      if (q.assignee !== undefined) {
        const who = q.assignee;
        issues = issues.filter((i) => i.assignees.includes(who));
      }

      const total = issues.length;
      const after = decodeCursor<NumberCursor>(q.cursor);
      if (after) issues = issues.filter((i) => i.number > after.n);
      const hasMore = issues.length > q.limit;
      const items = hasMore ? issues.slice(0, q.limit) : issues;
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last ? encodeCursor({ n: last.number } satisfies NumberCursor) : null;
      return { items, nextCursor, total };
    },

    async setState(repo: string, number: number, state: IssueState): Promise<void> {
      await exec.run(
        sql`UPDATE issues SET state = ${state} WHERE repo = ${repo} AND number = ${number}`,
      );
    },

    async addComment(repo: string, number: number, author: string, body: string): Promise<void> {
      const id = ids.newId('ic');
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO issue_comments (id, repo, issue_number, author, body, created_at)
        VALUES (${id}, ${repo}, ${number}, ${author}, ${body}, ${createdAt})`);
    },
  };
}
