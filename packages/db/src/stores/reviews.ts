import type { Review, ReviewEvent } from '@musehub/contracts';
import type { Clock, IdGen, ReviewStore } from '@musehub/core';
import { sql } from 'drizzle-orm';
import type { Exec, Row } from '../types.js';
import { num, str, strOrNull } from './row.js';

function mapReview(r: Row): Review {
  return {
    id: str(r.id),
    pr_number: num(r.pr_number),
    reviewer: str(r.reviewer),
    event: str(r.event) as ReviewEvent,
    body: strOrNull(r.body),
    created_at: str(r.created_at),
  };
}

/** Keep only the most recent review from each reviewer, in submission order. */
function latestPerReviewer(reviews: Review[]): Review[] {
  const latest = new Map<string, Review>();
  for (const rv of reviews) latest.set(rv.reviewer, rv);
  return [...latest.values()];
}

export function makeReviewStore(exec: Exec, clock: Clock, ids: IdGen): ReviewStore {
  async function allForPr(repo: string, prNumber: number): Promise<Review[]> {
    const rows = await exec.all<Row>(sql`
      SELECT * FROM reviews
      WHERE repo = ${repo} AND pr_number = ${prNumber}
      ORDER BY created_at ASC, id ASC`);
    return rows.map(mapReview);
  }

  return {
    async create(input): Promise<Review> {
      const id = ids.newId('review');
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO reviews (id, repo, pr_number, reviewer, event, body, created_at)
        VALUES (${id}, ${input.repo}, ${input.prNumber}, ${input.reviewer}, ${input.event}, ${input.body}, ${createdAt})`);
      return {
        id,
        pr_number: input.prNumber,
        reviewer: input.reviewer,
        event: input.event,
        body: input.body,
        created_at: createdAt,
      };
    },

    async latestByReviewer(repo: string, prNumber: number): Promise<Review[]> {
      return latestPerReviewer(await allForPr(repo, prNumber));
    },

    // Approved when at least one reviewer's latest review approves and none of the
    // latest reviews request changes. A later request_changes cancels an approval.
    async hasApproval(repo: string, prNumber: number): Promise<boolean> {
      const latest = latestPerReviewer(await allForPr(repo, prNumber));
      const approved = latest.some((rv) => rv.event === 'approve');
      const blocked = latest.some((rv) => rv.event === 'request_changes');
      return approved && !blocked;
    },

    async addComment(input): Promise<void> {
      const id = ids.newId('rc');
      const createdAt = clock.now().toISOString();
      await exec.run(sql`
        INSERT INTO review_comments (id, repo, pr_number, author, body, path, line, created_at)
        VALUES (${id}, ${input.repo}, ${input.prNumber}, ${input.author}, ${input.body},
                ${input.path ?? null}, ${input.line ?? null}, ${createdAt})`);
    },
  };
}
