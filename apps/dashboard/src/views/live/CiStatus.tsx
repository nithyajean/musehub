import { useMemo } from 'react';
import { summarizeCi } from '../../api/transform';
import type { ForgeData } from '../../api/types';
import { CiBadge } from '../../components/Badges';
import { Icon } from '../../components/Icons';
import { EmptyState } from '../../components/States';
import { KpiTile, Meter, SegmentBar } from '../../components/charts';
import { formatDuration, timeAgo } from '../../format';

/** CI health: pass rate, the run mix, the sandbox posture and recent runs. */
export function CiStatus({ forge, now }: { forge: ForgeData; now: number }) {
  const s = useMemo(() => summarizeCi(forge.ci), [forge.ci]);
  if (forge.ci.length === 0) {
    return (
      <EmptyState title="No CI runs yet" hint="Nothing has triggered a pipeline." icon="check" />
    );
  }
  const segments = [
    { label: 'Passed', value: s.passed, tone: 'good' },
    { label: 'Failed', value: s.failed, tone: 'critical' },
    { label: 'Timed out or cancelled', value: s.other, tone: 'warning' },
    { label: 'Running', value: s.running, tone: 'info' },
    { label: 'Queued', value: s.queued, tone: 'neutral' },
  ];
  const runs = [...forge.ci].sort((a, b) => {
    const ta = a.started_at ? Date.parse(a.started_at) : 0;
    const tb = b.started_at ? Date.parse(b.started_at) : 0;
    return tb - ta;
  });

  return (
    <div className="stack">
      <div className="ci-summary">
        <div className="ci-meter card">
          <Meter
            label="CI pass rate"
            value={s.passRate}
            tone={s.passRate >= 80 ? 'good' : s.passRate >= 50 ? 'warning' : 'critical'}
            valueText={`${s.passRate}%`}
          />
          <p className="muted small">
            {s.completed} completed of {s.total} runs
          </p>
        </div>
        <KpiTile
          label="Average duration"
          value={formatDuration(s.avgDurationS)}
          sub="completed runs"
        />
        <KpiTile label="In flight" value={String(s.running + s.queued)} sub="running or queued" />
        <div className="card seg-card">
          <p className="detail-title">Runs by outcome</p>
          <SegmentBar segments={segments} label="CI runs by outcome" />
        </div>
      </div>

      <div className="posture card">
        <div className="posture-head">
          <Icon name="shield" size={16} />
          <span>Sandbox and egress posture</span>
        </div>
        <p>
          Agents push code that CI builds and runs, so every job runs in an ephemeral container with
          no host mount, dropped Linux capabilities and network egress denied by default, then
          allowed only to an explicit list. A run is killed at its time and memory cap.
        </p>
        <p className="muted small">
          What it does not stop: a job can still burn its allowed CPU. A compromised allowed host is
          still reachable. The sandbox contains the blast radius, it does not make untrusted code
          safe.
        </p>
      </div>

      <div className="stack">
        <p className="detail-title">Recent runs</p>
        <ul className="run-list">
          {runs.map((r) => {
            const dur = r.jobs.reduce((sum, j) => sum + (j.duration_s ?? 0), 0);
            return (
              <li className="run-row" key={r.run_id}>
                <span className="run-repo">
                  <Icon name="repo" size={14} /> {r.repo}
                </span>
                <span className="mono muted">{r.ref}</span>
                <CiBadge run={r} />
                <span className="muted">
                  {r.status === 'completed' ? formatDuration(dur) : 'n/a'}
                </span>
                <span className="muted push-right">
                  {r.started_at ? timeAgo(r.started_at, now) : 'queued'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
