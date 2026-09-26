// Pure derivations the views render: KPIs, PR board grouping, the leaderboard,
// CI summary and activity buckets. No DOM, no clock of its own (callers pass
// `now`), so every function unit-tests deterministically in a node env.

import type { AuditEvent, CiRun, PullRequest, Review } from '@musehub/contracts';
import type { ForgeData } from './types';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface Kpis {
  agentsActive: number;
  openPrs: number;
  mergesToday: number;
  ciPassRate: number;
  completedRuns: number;
}

function within(iso: string, now: number, windowMs: number): boolean {
  const t = Date.parse(iso);
  return !Number.isNaN(t) && now - t <= windowMs && now - t >= 0;
}

/** The top-strip counters. mergesToday counts merge events in the last 24h. */
export function computeKpis(data: ForgeData, now: number): Kpis {
  const agentsActive = data.agents.filter((a) => a.status === 'active').length;
  const openPrs = data.pulls.filter((p) => p.state === 'open').length;
  const mergesToday = data.activity.filter(
    (e) => e.action === 'pr.merged' && within(e.at, now, DAY_MS),
  ).length;
  const summary = summarizeCi(data.ci);
  return {
    agentsActive,
    openPrs,
    mergesToday,
    ciPassRate: summary.passRate,
    completedRuns: summary.completed,
  };
}

/** Events per hour over the last `hours`, oldest bucket first, for a sparkline. */
export function activityPerHour(activity: AuditEvent[], now: number, hours = 12): number[] {
  const buckets = new Array<number>(hours).fill(0);
  for (const e of activity) {
    const t = Date.parse(e.at);
    if (Number.isNaN(t)) continue;
    const hAgo = Math.floor((now - t) / HOUR_MS);
    if (hAgo >= 0 && hAgo < hours) {
      const idx = hours - 1 - hAgo;
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
  }
  return buckets;
}

export type PrStatus =
  | 'draft'
  | 'open'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'merged'
  | 'closed';

/** The board columns, in the order R9 lays them out. */
export const PR_COLUMNS: { id: PrStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_review', label: 'In review' },
  { id: 'changes_requested', label: 'Changes requested' },
  { id: 'approved', label: 'Approved' },
  { id: 'merged', label: 'Merged' },
  { id: 'closed', label: 'Closed' },
];

function latestReview(prNumber: number, reviews: Review[]): Review | null {
  let best: Review | null = null;
  for (const r of reviews) {
    if (r.pr_number !== prNumber) continue;
    if (best === null || Date.parse(r.created_at) > Date.parse(best.created_at)) best = r;
  }
  return best;
}

/** A PR's display status: its state, refined by the latest review for open PRs. */
export function derivePrStatus(pr: PullRequest, reviews: Review[]): PrStatus {
  if (pr.state === 'merged') return 'merged';
  if (pr.state === 'closed') return 'closed';
  const anyReview = reviews.some((r) => r.pr_number === pr.number);
  if (!anyReview) return pr.draft ? 'draft' : 'open';
  const last = latestReview(pr.number, reviews);
  if (last?.event === 'request_changes') return 'changes_requested';
  if (reviews.some((r) => r.pr_number === pr.number && r.event === 'approve')) return 'approved';
  return 'in_review';
}

/** Group PRs into the board columns, each column newest first. */
export function groupPullsByStatus(
  pulls: PullRequest[],
  reviews: Review[],
): Record<PrStatus, PullRequest[]> {
  const out: Record<PrStatus, PullRequest[]> = {
    draft: [],
    open: [],
    in_review: [],
    changes_requested: [],
    approved: [],
    merged: [],
    closed: [],
  };
  for (const pr of pulls) out[derivePrStatus(pr, reviews)].push(pr);
  return out;
}

export interface CiSummary {
  passed: number;
  failed: number;
  running: number;
  queued: number;
  other: number;
  completed: number;
  total: number;
  passRate: number;
  avgDurationS: number | null;
}

/** Roll up CI runs. passRate is over completed runs only. */
export function summarizeCi(runs: CiRun[]): CiSummary {
  let passed = 0;
  let failed = 0;
  let running = 0;
  let queued = 0;
  let other = 0;
  let durSum = 0;
  let durCount = 0;
  for (const r of runs) {
    if (r.status === 'running') running += 1;
    else if (r.status === 'queued') queued += 1;
    else if (r.conclusion === 'success') passed += 1;
    else if (r.conclusion === 'failure') failed += 1;
    else other += 1;
    const jobDur = r.jobs.reduce((s, j) => s + (j.duration_s ?? 0), 0);
    if (r.status === 'completed' && jobDur > 0) {
      durSum += jobDur;
      durCount += 1;
    }
  }
  const completed = passed + failed + other;
  const passRate = completed === 0 ? 0 : Math.round((passed / completed) * 100);
  return {
    passed,
    failed,
    running,
    queued,
    other,
    completed,
    total: runs.length,
    passRate,
    avgDurationS: durCount === 0 ? null : Math.round(durSum / durCount),
  };
}

export interface LeaderRow {
  handle: string;
  opened: number;
  merged: number;
  reviews: number;
  score: number;
}

/**
 * The composite leaderboard. Score weights a merge over a review over an open PR
 * (merged * 3 + reviews * 2 + opened). The weighting is stated in Reports so the
 * ranking is never a black box.
 */
export function leaderboard(data: ForgeData): LeaderRow[] {
  const rows = data.agents.map((agent) => {
    const opened = data.pulls.filter((p) => p.author === agent.handle).length;
    const merged = data.pulls.filter(
      (p) => p.author === agent.handle && p.state === 'merged',
    ).length;
    const reviews = data.reviews.filter((r) => r.reviewer === agent.handle).length;
    return {
      handle: agent.handle,
      opened,
      merged,
      reviews,
      score: merged * 3 + reviews * 2 + opened,
    };
  });
  return rows.sort(
    (a, b) => b.score - a.score || b.merged - a.merged || a.handle.localeCompare(b.handle),
  );
}

export interface RepoStat {
  openPrs: number;
  contributors: number;
  lastActivity: string | null;
  latestCi: CiRun | null;
}

function maxIso(a: string | null, b: string): string {
  if (a === null) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/** Card stats for one repo, all derived from the contract collections. */
export function repoStats(fullName: string, data: ForgeData): RepoStat {
  const openPrs = data.pulls.filter((p) => p.repo === fullName && p.state === 'open').length;
  const authors = new Set<string>();
  for (const p of data.pulls) if (p.repo === fullName) authors.add(p.author);
  for (const c of data.commits[fullName] ?? []) authors.add(c.author);
  let lastActivity: string | null = null;
  for (const e of data.activity)
    if (e.target.startsWith(fullName)) lastActivity = maxIso(lastActivity, e.at);
  for (const c of data.commits[fullName] ?? []) lastActivity = maxIso(lastActivity, c.committed_at);
  const runs = data.ci.filter((r) => r.repo === fullName);
  const latestCi = runs.length === 0 ? null : (runs[0] ?? null);
  return { openPrs, contributors: authors.size, lastActivity, latestCi };
}

export interface AgentStat {
  opened: number;
  merged: number;
  reviews: number;
  reposContributed: number;
  lastActivity: string | null;
}

/** Profile stats for one agent. */
export function agentStats(handle: string, data: ForgeData): AgentStat {
  const opened = data.pulls.filter((p) => p.author === handle).length;
  const merged = data.pulls.filter((p) => p.author === handle && p.state === 'merged').length;
  const reviews = data.reviews.filter((r) => r.reviewer === handle).length;
  const repos = new Set<string>();
  for (const p of data.pulls) if (p.author === handle) repos.add(p.repo);
  let lastActivity: string | null = null;
  for (const e of data.activity) if (e.actor === handle) lastActivity = maxIso(lastActivity, e.at);
  return { opened, merged, reviews, reposContributed: repos.size, lastActivity };
}

export type EventKind =
  | 'onboard'
  | 'repo'
  | 'branch'
  | 'commit'
  | 'pr'
  | 'review'
  | 'ci'
  | 'release'
  | 'other';

/** Classify an audit action into a kind, for the feed icon and filter. */
export function eventKind(action: string): EventKind {
  if (action === 'pr.reviewed' || action === 'pr.changes_requested' || action === 'pr.approved') {
    return 'review';
  }
  const head = action.split('.')[0];
  if (head === 'agent') return 'onboard';
  if (head === 'repo') return 'repo';
  if (head === 'branch') return 'branch';
  if (head === 'commit') return 'commit';
  if (head === 'pr') return 'pr';
  if (head === 'ci') return 'ci';
  if (head === 'release') return 'release';
  return 'other';
}

const EVENT_LABELS: Record<string, string> = {
  'agent.enrolled': 'enrolled',
  'repo.created': 'created a repository',
  'branch.created': 'created a branch',
  'branch.pushed': 'pushed to',
  'commit.created': 'committed to',
  'pr.opened': 'opened a pull request',
  'pr.reviewed': 'reviewed',
  'pr.changes_requested': 'requested changes on',
  'pr.approved': 'approved',
  'pr.merged': 'merged',
  'pr.closed': 'closed',
  'ci.started': 'started CI on',
  'ci.passed': 'CI passed on',
  'ci.failed': 'CI failed on',
  'release.tagged': 'tagged a release',
};

/** A human phrase for an audit action. */
export function eventLabel(action: string): string {
  return EVENT_LABELS[action] ?? action.replace(/[._]/g, ' ');
}

export interface ActivityFilter {
  agent?: string;
  kind?: EventKind;
}

/** Filter the feed by actor and event kind. Missing filters match everything. */
export function filterActivity(activity: AuditEvent[], f: ActivityFilter): AuditEvent[] {
  return activity.filter((e) => {
    if (f.agent && e.actor !== f.agent) return false;
    if (f.kind && eventKind(e.action) !== f.kind) return false;
    return true;
  });
}
