import type { PullRequest } from '@musehub/contracts';
import { useMemo, useState } from 'react';
import { PR_COLUMNS, type PrStatus, derivePrStatus, groupPullsByStatus } from '../../api/transform';
import type { ForgeData } from '../../api/types';
import { AgentChip, Avatar } from '../../components/AgentChip';
import { CiBadge, Pill, PrStatusBadge } from '../../components/Badges';
import { Icon } from '../../components/Icons';
import { EmptyState, ErrorState } from '../../components/States';
import { SegmentBar } from '../../components/charts';
import { shortSha, timeAgo } from '../../format';

const SEG_TONE: Record<PrStatus, string> = {
  draft: 'neutral',
  open: 'info',
  in_review: 'aqua',
  changes_requested: 'warning',
  approved: 'good',
  merged: 'merged',
  closed: 'neutral',
};

interface Sel {
  repo: string;
  number: number;
}

function PrMini({
  pr,
  status,
  now,
  active,
  onOpen,
}: {
  pr: PullRequest;
  status: PrStatus;
  now: number;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={`pr-mini ${active ? 'is-active' : ''}`} onClick={onOpen}>
      <span className="pr-mini-title">
        <span className="mono muted">#{pr.number}</span> {pr.title}
      </span>
      <span className="pr-mini-meta">
        <Avatar handle={pr.author} size={18} />
        <span className="muted">{pr.repo}</span>
        {pr.draft && status !== 'merged' ? <Pill tone="neutral" label="draft" /> : null}
        <span className="muted push-right">{timeAgo(pr.created_at, now)}</span>
      </span>
    </button>
  );
}

function reviewPill(event: string) {
  if (event === 'approve') return <Pill tone="good" label="approved" icon="check" />;
  if (event === 'request_changes')
    return <Pill tone="warning" label="requested changes" icon="x" />;
  return <Pill tone="neutral" label="commented" icon="search" />;
}

function PrDetail({ pr, forge, now }: { pr: PullRequest; forge: ForgeData; now: number }) {
  const status = derivePrStatus(pr, forge.reviews);
  const reviews = forge.reviews
    .filter((r) => r.pr_number === pr.number)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const author = forge.agents.find((a) => a.handle === pr.author) ?? null;
  const checks = forge.ci.filter(
    (r) => r.repo === pr.repo && (r.ref === pr.head || r.head_sha === pr.head_sha),
  );
  return (
    <div className="detail">
      <div className="detail-head">
        <h2>
          <span className="mono muted">#{pr.number}</span> {pr.title}
        </h2>
        <PrStatusBadge status={status} />
      </div>
      <div className="pr-branches">
        {author ? <AgentChip agent={author} size={22} /> : <span>{pr.author}</span>}
        <span className="mono">{pr.head}</span>
        <Icon name="arrow" size={14} />
        <span className="mono">{pr.base}</span>
        <span className="mono muted">{shortSha(pr.head_sha)}</span>
        {pr.state === 'open' ? (
          pr.mergeable === false ? (
            <Pill tone="critical" label="conflicts" icon="x" />
          ) : pr.mergeable === true ? (
            <Pill tone="good" label="mergeable" icon="check" />
          ) : (
            <Pill tone="neutral" label="checking" icon="clock" />
          )
        ) : null}
      </div>
      {pr.body ? <p className="detail-lead">{pr.body}</p> : null}
      <div className="detail-block">
        <p className="detail-title">Checks</p>
        {checks.length === 0 ? (
          <p className="muted">No checks reported yet.</p>
        ) : (
          <ul className="line-list">
            {checks.map((c) => (
              <li key={c.run_id}>
                <span className="mono">{c.workflow}</span>
                <span className="muted">{c.ref}</span>
                <CiBadge run={c} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="detail-block">
        <p className="detail-title">Review thread</p>
        {reviews.length === 0 ? (
          <p className="muted">No reviews yet. Agents review each other before a merge.</p>
        ) : (
          <ul className="review-thread">
            {reviews.map((r) => {
              const rev = forge.agents.find((a) => a.handle === r.reviewer) ?? null;
              return (
                <li key={r.id}>
                  <div className="review-head">
                    {rev ? <AgentChip agent={rev} size={20} /> : <span>{r.reviewer}</span>}
                    {reviewPill(r.event)}
                    <span className="muted push-right">{timeAgo(r.created_at, now)}</span>
                  </div>
                  {r.body ? <p className="review-body">{r.body}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The PR board in state columns, with a read-only detail panel. */
export function PullRequests({ forge, now }: { forge: ForgeData; now: number }) {
  const grouped = useMemo(
    () => groupPullsByStatus(forge.pulls, forge.reviews),
    [forge.pulls, forge.reviews],
  );
  const [sel, setSel] = useState<Sel | null>(null);
  const selectedPr = sel
    ? (forge.pulls.find((p) => p.repo === sel.repo && p.number === sel.number) ?? null)
    : null;

  if (forge.pulls.length === 0) {
    return (
      <EmptyState title="No open pull requests" hint="Agents have not opened any PRs." icon="pr" />
    );
  }

  const segments = PR_COLUMNS.map((c) => ({
    label: c.label,
    value: c.id === 'open' ? grouped.open.length + grouped.draft.length : grouped[c.id].length,
    tone: SEG_TONE[c.id],
  }));

  return (
    <div className="stack">
      <SegmentBar segments={segments} label="Pull requests by state" />
      <div className="master-detail">
        <div className="pr-board">
          {PR_COLUMNS.map((col) => {
            const items = col.id === 'open' ? [...grouped.open, ...grouped.draft] : grouped[col.id];
            return (
              <div className="pr-col" key={col.id}>
                <div className="pr-col-head">
                  <span>{col.label}</span>
                  <span className="count">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="col-empty">None</p>
                ) : (
                  items.map((pr) => (
                    <PrMini
                      key={`${pr.repo}#${pr.number}`}
                      pr={pr}
                      status={derivePrStatus(pr, forge.reviews)}
                      now={now}
                      active={sel?.repo === pr.repo && sel?.number === pr.number}
                      onOpen={() => setSel({ repo: pr.repo, number: pr.number })}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
        {sel && !selectedPr ? (
          <ErrorState
            title="Pull request not found"
            hint="It may have moved. Pick another from the board."
            onRetry={() => setSel(null)}
          />
        ) : selectedPr ? (
          <PrDetail pr={selectedPr} forge={forge} now={now} />
        ) : (
          <div className="detail detail-empty">
            <EmptyState
              title="Select a pull request"
              hint="Pick a PR to see its checks, reviews and merge state."
              icon="pr"
            />
          </div>
        )}
      </div>
    </div>
  );
}
