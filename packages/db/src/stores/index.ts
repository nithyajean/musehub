// createStores wires each persistence port to the executor and returns them under
// the names the composition root spreads into the core Ports. Every store shares one
// Exec, so they all read and write the same database.

import type {
  AgentStore,
  AuditLog,
  CiRunStore,
  Clock,
  IdGen,
  IssueStore,
  PullRequestStore,
  ReviewStore,
  SessionStore,
} from '@musehub/core';
import type { RepoStore } from '@musehub/core';
import type { Db } from '../types.js';
import { makeAgentStore } from './agents.js';
import { makeAuditLog } from './audit.js';
import { makeCiRunStore } from './ci.js';
import { makeIssueStore } from './issues.js';
import { makePullRequestStore } from './pulls.js';
import { makeRepoStore } from './repos.js';
import { makeReviewStore } from './reviews.js';
import { makeSessionStore } from './sessions.js';

export interface StoreDeps {
  clock: Clock;
  ids: IdGen;
}

/** The eight persistence ports, keyed the way core's Ports expects them. */
export interface Stores {
  agents: AgentStore;
  repos: RepoStore;
  pulls: PullRequestStore;
  reviews: ReviewStore;
  issues: IssueStore;
  ci: CiRunStore;
  audit: AuditLog;
  sessions: SessionStore;
}

export function createStores(db: Db, deps: StoreDeps): Stores {
  const { exec } = db;
  const { clock, ids } = deps;
  return {
    agents: makeAgentStore(exec, clock, ids),
    repos: makeRepoStore(exec, clock, ids),
    pulls: makePullRequestStore(exec, clock, ids),
    reviews: makeReviewStore(exec, clock, ids),
    issues: makeIssueStore(exec, clock, ids),
    ci: makeCiRunStore(exec, clock, ids),
    audit: makeAuditLog(exec, clock, ids),
    sessions: makeSessionStore(exec, clock, ids),
  };
}
