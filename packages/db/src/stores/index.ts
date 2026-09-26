// createStores wires each persistence port to the executor and returns them under
// the names the composition root spreads into the core Ports. Every store shares one
// Exec, so they all read and write the same database.

import type {
  AgentStore,
  AuditLog,
  CiRunStore,
  Clock,
  CollaboratorStore,
  IdGen,
  IssueStore,
  NotificationStore,
  OrgMemberStore,
  OrgStore,
  PullRequestStore,
  ReviewStore,
  SessionStore,
  TeamMemberStore,
  TeamStore,
  WebhookDeliveryStore,
  WebhookStore,
} from '@musehub/core';
import type { RepoStore } from '@musehub/core';
import type { Db } from '../types.js';
import { makeAgentStore } from './agents.js';
import { makeAuditLog } from './audit.js';
import { makeCiRunStore } from './ci.js';
import { makeCollaboratorStore } from './collaborators.js';
import { makeIssueStore } from './issues.js';
import { makeNotificationStore } from './notifications.js';
import { makeOrgMemberStore } from './org-members.js';
import { makeOrgStore } from './orgs.js';
import { makePullRequestStore } from './pulls.js';
import { makeRepoStore } from './repos.js';
import { makeReviewStore } from './reviews.js';
import { makeSessionStore } from './sessions.js';
import { makeTeamMemberStore } from './team-members.js';
import { makeTeamStore } from './teams.js';
import { makeWebhookDeliveryStore } from './webhook-deliveries.js';
import { makeWebhookStore } from './webhooks.js';

export interface StoreDeps {
  clock: Clock;
  ids: IdGen;
}

/** The persistence ports, keyed the way core's Ports expects them. */
export interface Stores {
  agents: AgentStore;
  repos: RepoStore;
  pulls: PullRequestStore;
  reviews: ReviewStore;
  issues: IssueStore;
  ci: CiRunStore;
  audit: AuditLog;
  sessions: SessionStore;
  orgs: OrgStore;
  orgMembers: OrgMemberStore;
  teams: TeamStore;
  teamMembers: TeamMemberStore;
  collaborators: CollaboratorStore;
  webhooks: WebhookStore;
  webhookDeliveries: WebhookDeliveryStore;
  notifications: NotificationStore;
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
    orgs: makeOrgStore(exec, clock, ids),
    orgMembers: makeOrgMemberStore(exec, clock, ids),
    teams: makeTeamStore(exec, clock, ids),
    teamMembers: makeTeamMemberStore(exec, clock, ids),
    collaborators: makeCollaboratorStore(exec, clock, ids),
    webhooks: makeWebhookStore(exec, clock, ids),
    webhookDeliveries: makeWebhookDeliveryStore(exec, clock, ids),
    notifications: makeNotificationStore(exec, clock, ids),
  };
}
