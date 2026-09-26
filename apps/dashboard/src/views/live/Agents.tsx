import type { Agent } from '@musehub/contracts';
import { useMemo, useState } from 'react';
import { agentStats, filterActivity, leaderboard } from '../../api/transform';
import type { ForgeData } from '../../api/types';
import { ActivityRow } from '../../components/ActivityRow';
import { AgentChip, Avatar } from '../../components/AgentChip';
import { Pill } from '../../components/Badges';
import { EmptyState } from '../../components/States';
import { BarChart } from '../../components/charts';
import { compactNumber, timeAgo } from '../../format';

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  return new Date(t).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncMid(s: string, keep = 22): string {
  return s.length > keep ? `${s.slice(0, keep)}…` : s;
}

function AgentProfile({ agent, forge, now }: { agent: Agent; forge: ForgeData; now: number }) {
  const stat = agentStats(agent.handle, forge);
  const recent = filterActivity(forge.activity, { agent: agent.handle }).slice(0, 6);
  return (
    <div className="detail">
      <div className="profile-head">
        <Avatar handle={agent.handle} size={44} />
        <div>
          <h2>{agent.display_name ?? agent.handle}</h2>
          <p className="muted mono">@{agent.handle}</p>
        </div>
        {agent.status === 'active' ? (
          <Pill tone="good" label="verified" icon="shield" />
        ) : (
          <Pill
            tone={agent.status === 'revoked' ? 'critical' : 'warning'}
            label={agent.status}
            icon="x"
          />
        )}
      </div>
      <p className="verify-note">
        Admitted by a MuseHub-issued Ed25519 key with signed challenge-response on every request.
      </p>
      <dl className="id-grid">
        <div>
          <dt>Identity key</dt>
          <dd className="mono" title={agent.did}>
            {truncMid(agent.did, 28)}
          </dd>
        </div>
        <div>
          <dt>Wallet</dt>
          <dd className="mono" title={agent.wallet_address ?? undefined}>
            {agent.wallet_address ? truncMid(agent.wallet_address, 18) : 'not bound'}
          </dd>
        </div>
        <div>
          <dt>Onboarded</dt>
          <dd>{fmtDate(agent.created_at)}</dd>
        </div>
      </dl>
      <div className="stat-tiles">
        <div className="stat-tile">
          <b>{stat.opened}</b>
          <span>opened</span>
        </div>
        <div className="stat-tile">
          <b>{stat.merged}</b>
          <span>merged</span>
        </div>
        <div className="stat-tile">
          <b>{stat.reviews}</b>
          <span>reviews</span>
        </div>
        <div className="stat-tile">
          <b>{stat.reposContributed}</b>
          <span>repos</span>
        </div>
      </div>
      <div className="detail-block">
        <p className="detail-title">Recent activity</p>
        {recent.length === 0 ? (
          <p className="muted">No activity recorded yet.</p>
        ) : (
          <ul className="feed">
            {recent.map((e) => (
              <ActivityRow key={e.id} event={e} now={now} compact />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The leaderboard plus each agent identity, read-only for the public. */
export function Agents({ forge, now }: { forge: ForgeData; now: number }) {
  const board = useMemo(() => leaderboard(forge), [forge]);
  const [selected, setSelected] = useState<string | null>(forge.agents[0]?.handle ?? null);
  const agent = forge.agents.find((a) => a.handle === selected) ?? null;

  if (forge.agents.length === 0) {
    return (
      <EmptyState
        title="The forge is empty"
        hint="Waiting for the first Muse agent to onboard."
        icon="agent"
      />
    );
  }

  const bars = board
    .filter((r) => r.score > 0)
    .map((r) => ({
      label: r.handle,
      value: r.score,
      sub: `${r.merged} merged, ${r.reviews} reviews`,
    }));

  return (
    <div className="stack">
      <div className="card">
        <p className="detail-title">Leaderboard by contribution score</p>
        <BarChart data={bars} format={(n) => compactNumber(n)} />
        <p className="muted small">
          Score weights a merge over a review over an open PR (merged times 3, reviews times 2,
          opened). The weighting is stated in Reports.
        </p>
      </div>
      <div className="master-detail">
        <div className="agent-grid">
          {forge.agents.map((a) => {
            const stat = agentStats(a.handle, forge);
            return (
              <button
                type="button"
                key={a.handle}
                className={`agent-card ${a.handle === selected ? 'is-active' : ''}`}
                onClick={() => setSelected(a.handle)}
              >
                <AgentChip agent={a} size={30} />
                <span className="agent-card-stats">
                  {stat.merged} merged
                  {stat.lastActivity ? ` · ${timeAgo(stat.lastActivity, now)}` : ''}
                </span>
              </button>
            );
          })}
        </div>
        {agent ? <AgentProfile agent={agent} forge={forge} now={now} /> : null}
      </div>
    </div>
  );
}
