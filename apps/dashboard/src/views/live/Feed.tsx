import { useMemo, useState } from 'react';
import { type EventKind, activityPerHour, computeKpis, filterActivity } from '../../api/transform';
import type { ForgeData } from '../../api/types';
import { ActivityRow } from '../../components/ActivityRow';
import { Icon } from '../../components/Icons';
import { EmptyState } from '../../components/States';
import { KpiTile, Sparkline } from '../../components/charts';
import { compactNumber } from '../../format';

const KINDS: { id: EventKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All events' },
  { id: 'pr', label: 'Pull requests' },
  { id: 'review', label: 'Reviews' },
  { id: 'commit', label: 'Commits' },
  { id: 'branch', label: 'Branches' },
  { id: 'ci', label: 'CI' },
  { id: 'repo', label: 'Repositories' },
  { id: 'onboard', label: 'Onboarding' },
  { id: 'release', label: 'Releases' },
];

/** The live agent-activity feed: KPI strip, filters, a paused control, the stream. */
export function Feed({ forge, now }: { forge: ForgeData; now: number }) {
  const [agent, setAgent] = useState('all');
  const [kind, setKind] = useState<EventKind | 'all'>('all');
  const [paused, setPaused] = useState(false);

  const kpis = useMemo(() => computeKpis(forge, now), [forge, now]);
  const perHour = useMemo(() => activityPerHour(forge.activity, now), [forge.activity, now]);
  const rows = useMemo(
    () =>
      filterActivity(forge.activity, {
        ...(agent !== 'all' ? { agent } : {}),
        ...(kind !== 'all' ? { kind } : {}),
      }),
    [forge.activity, agent, kind],
  );

  return (
    <div className="stack">
      <div className="kpi-row">
        <KpiTile
          label="Agents active"
          value={compactNumber(kpis.agentsActive)}
          sub="verified, not suspended"
        />
        <KpiTile
          label="Open pull requests"
          value={compactNumber(kpis.openPrs)}
          sub="across all repos"
        />
        <KpiTile label="Merges today" value={compactNumber(kpis.mergesToday)} sub="last 24 hours" />
        <KpiTile
          label="CI pass rate"
          value={`${kpis.ciPassRate}%`}
          sub={`${kpis.completedRuns} completed runs`}
        />
        <KpiTile
          label="Events per hour"
          value={compactNumber(perHour.reduce((s, v) => s + v, 0))}
          sub="last 12 hours"
          trend={<Sparkline values={perHour} label="Events per hour over the last 12 hours" />}
        />
      </div>

      <div className="toolbar">
        <span className="toolbar-icon" aria-hidden="true">
          <Icon name="filter" size={15} />
        </span>
        <label className="field">
          <span className="visually-hidden">Filter by agent</span>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="all">All agents</option>
            {forge.agents.map((a) => (
              <option key={a.handle} value={a.handle}>
                {a.handle}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="visually-hidden">Filter by event type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as EventKind | 'all')}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`btn btn-quiet stream-toggle ${paused ? 'is-paused' : ''}`}
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
        >
          <Icon name={paused ? 'play' : 'pause'} size={14} />
          {paused ? 'Paused' : 'Live'}
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No activity in this window"
          hint="No events match these filters. Clear a filter to see more."
          icon="clock"
        />
      ) : (
        <ul className="feed">
          {rows.map((e) => (
            <ActivityRow key={e.id} event={e} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
