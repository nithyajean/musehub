import type { Repo } from '@musehub/contracts';
import { useState } from 'react';
import { derivePrStatus, repoStats } from '../../api/transform';
import type { ForgeData } from '../../api/types';
import { AgentChip } from '../../components/AgentChip';
import { CiBadge, Pill, PrStatusBadge } from '../../components/Badges';
import { Icon } from '../../components/Icons';
import { EmptyState } from '../../components/States';
import { shortSha, timeAgo } from '../../format';

function RepoCard({
  repo,
  forge,
  now,
  onOpen,
  active,
}: {
  repo: Repo;
  forge: ForgeData;
  now: number;
  onOpen: () => void;
  active: boolean;
}) {
  const stat = repoStats(repo.full_name, forge);
  return (
    <button type="button" className={`repo-card ${active ? 'is-active' : ''}`} onClick={onOpen}>
      <div className="repo-card-top">
        <span className="repo-name">
          <Icon name="repo" size={15} /> {repo.full_name}
        </span>
        <Pill
          tone="neutral"
          label={repo.visibility}
          icon={repo.visibility === 'private' ? 'lock' : 'external'}
        />
      </div>
      <p className="repo-desc">{repo.description || 'No description yet.'}</p>
      <div className="repo-meta">
        <span>{stat.openPrs} open PRs</span>
        <span>{stat.contributors} agents</span>
        {stat.lastActivity ? (
          <span>updated {timeAgo(stat.lastActivity, now)}</span>
        ) : (
          <span>fresh</span>
        )}
        {stat.latestCi ? <CiBadge run={stat.latestCi} /> : null}
      </div>
    </button>
  );
}

function RepoDetail({ repo, forge, now }: { repo: Repo; forge: ForgeData; now: number }) {
  const branches = forge.branches[repo.full_name] ?? [];
  const commits = forge.commits[repo.full_name] ?? [];
  const prs = forge.pulls.filter((p) => p.repo === repo.full_name);
  return (
    <div className="detail">
      <div className="detail-head">
        <h2>{repo.full_name}</h2>
        <Pill
          tone="neutral"
          label={repo.visibility}
          icon={repo.visibility === 'private' ? 'lock' : 'external'}
        />
      </div>
      <p className="detail-lead">{repo.description || 'No description yet.'}</p>
      {repo.empty || commits.length === 0 ? (
        <EmptyState
          title="No commits yet"
          hint="This repository is waiting for its first agent commit."
          icon="commit"
        />
      ) : (
        <>
          <div className="detail-block">
            <p className="detail-title">Branches</p>
            <ul className="line-list">
              {branches.map((b) => (
                <li key={b.name}>
                  <Icon name="branch" size={14} />
                  <span className="mono">{b.name}</span>
                  {b.protected ? <Pill tone="info" label="protected" icon="shield" /> : null}
                  <span className="mono muted">{shortSha(b.head_sha)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="detail-block">
            <p className="detail-title">Recent commits</p>
            <ul className="line-list">
              {commits.map((c) => (
                <li key={c.sha}>
                  <Icon name="commit" size={14} />
                  <span className="commit-msg">{c.message}</span>
                  <AgentChip
                    agent={{
                      id: c.author,
                      handle: c.author,
                      display_name: null,
                      did: '',
                      wallet_address: null,
                      status: 'active',
                      created_at: c.committed_at,
                    }}
                    size={20}
                  />
                  <span className="mono muted">{shortSha(c.sha)}</span>
                  <span className="muted">{timeAgo(c.committed_at, now)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="detail-block">
            <p className="detail-title">Pull requests</p>
            <ul className="line-list">
              {prs.map((p) => (
                <li key={p.number}>
                  <a className="pr-link" href="#/live/pulls">
                    #{p.number} {p.title}
                  </a>
                  <PrStatusBadge status={derivePrStatus(p, forge.reviews)} />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/** Repository grid with a read-only detail panel. */
export function Repositories({ forge, now }: { forge: ForgeData; now: number }) {
  const [selected, setSelected] = useState<string | null>(forge.repos[0]?.full_name ?? null);
  const repo = forge.repos.find((r) => r.full_name === selected) ?? null;
  if (forge.repos.length === 0) {
    return (
      <EmptyState
        title="No repositories yet"
        hint="Agents have not created any repos."
        icon="repo"
      />
    );
  }
  return (
    <div className="master-detail">
      <div className="repo-grid">
        {forge.repos.map((r) => (
          <RepoCard
            key={r.full_name}
            repo={r}
            forge={forge}
            now={now}
            active={r.full_name === selected}
            onOpen={() => setSelected(r.full_name)}
          />
        ))}
      </div>
      {repo ? <RepoDetail repo={repo} forge={forge} now={now} /> : null}
    </div>
  );
}
