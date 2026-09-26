import { describe, expect, it } from 'vitest';
import { makeDemoData } from './demo';
import {
  activityPerHour,
  computeKpis,
  derivePrStatus,
  eventKind,
  filterActivity,
  groupPullsByStatus,
  leaderboard,
  repoStats,
  summarizeCi,
} from './transform';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const data = makeDemoData(NOW);

function pr(n: number) {
  const found = data.pulls.find((p) => p.number === n);
  if (!found) throw new Error(`no demo PR ${n}`);
  return found;
}

describe('computeKpis', () => {
  it('counts active agents, open PRs and recent merges', () => {
    const k = computeKpis(data, NOW);
    expect(k.agentsActive).toBe(5);
    expect(k.openPrs).toBe(4);
    expect(k.mergesToday).toBe(3);
  });

  it('computes CI pass rate over completed runs only', () => {
    const k = computeKpis(data, NOW);
    expect(k.completedRuns).toBe(9);
    expect(k.ciPassRate).toBe(78);
  });
});

describe('derivePrStatus', () => {
  it('refines an open PR by its latest review', () => {
    expect(derivePrStatus(pr(17), data.reviews)).toBe('approved');
    expect(derivePrStatus(pr(23), data.reviews)).toBe('changes_requested');
    expect(derivePrStatus(pr(42), data.reviews)).toBe('in_review');
    expect(derivePrStatus(pr(8), data.reviews)).toBe('draft');
  });

  it('reads a terminal state straight off the PR', () => {
    expect(derivePrStatus(pr(41), data.reviews)).toBe('merged');
    expect(derivePrStatus(pr(22), data.reviews)).toBe('closed');
  });
});

describe('groupPullsByStatus', () => {
  it('places every PR in exactly one column', () => {
    const g = groupPullsByStatus(data.pulls, data.reviews);
    const total = Object.values(g).reduce((s, list) => s + list.length, 0);
    expect(total).toBe(data.pulls.length);
    expect(g.merged.length).toBe(4);
  });
});

describe('summarizeCi', () => {
  it('rolls up outcomes and pass rate', () => {
    const s = summarizeCi(data.ci);
    expect(s.passed).toBe(7);
    expect(s.failed).toBe(1);
    expect(s.running).toBe(1);
    expect(s.queued).toBe(1);
    expect(s.passRate).toBe(78);
  });
});

describe('leaderboard', () => {
  it('ranks by the composite score', () => {
    const board = leaderboard(data);
    expect(board[0]?.handle).toBe('atlas');
    for (let i = 1; i < board.length; i += 1) {
      expect(board[i - 1]?.score).toBeGreaterThanOrEqual(board[i]?.score ?? 0);
    }
  });
});

describe('activity helpers', () => {
  it('buckets events into 12 hourly slots', () => {
    const buckets = activityPerHour(data.activity, NOW);
    expect(buckets).toHaveLength(12);
    expect(buckets.reduce((s, v) => s + v, 0)).toBeGreaterThan(0);
  });

  it('classifies actions into kinds', () => {
    expect(eventKind('pr.merged')).toBe('pr');
    expect(eventKind('pr.reviewed')).toBe('review');
    expect(eventKind('ci.passed')).toBe('ci');
    expect(eventKind('agent.enrolled')).toBe('onboard');
  });

  it('filters the feed by actor', () => {
    const only = filterActivity(data.activity, { agent: 'atlas' });
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((e) => e.actor === 'atlas')).toBe(true);
  });
});

describe('repoStats', () => {
  it('reads stats for the empty repo without throwing', () => {
    const s = repoStats('sable/gate-attest', data);
    expect(s.openPrs).toBe(0);
    expect(s.latestCi).not.toBeNull();
  });
});
