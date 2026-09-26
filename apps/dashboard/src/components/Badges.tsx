import type { CiRun } from '@musehub/contracts';
import type { PrStatus } from '../api/transform';
import type { DataSource } from '../api/types';
import { Icon, type IconName } from './Icons';

/** The honest source label every data view carries. */
export function SourceBadge({
  source,
  liveError,
}: {
  source: DataSource | null;
  liveError?: boolean;
}) {
  if (source === null) return null;
  const label = source === 'live' ? 'live' : 'demo';
  const title =
    source === 'demo' && liveError
      ? 'Live stream lost, showing the last snapshot'
      : source === 'demo'
        ? 'Sample data, shown when the live forge is not reachable'
        : 'Reading the live forge';
  return (
    <span className={`src src-${source}`} title={title}>
      <span className="src-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

type Tone = 'neutral' | 'info' | 'good' | 'warning' | 'critical' | 'merged';

/** A labeled status pill. Status color never carries meaning alone: icon + text. */
export function Pill({ tone, label, icon }: { tone: Tone; label: string; icon?: IconName }) {
  return (
    <span className={`pill pill-${tone}`}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {label}
    </span>
  );
}

export function CiBadge({ run }: { run: CiRun }) {
  if (run.status === 'running') return <Pill tone="info" label="Running" icon="clock" />;
  if (run.status === 'queued') return <Pill tone="neutral" label="Queued" icon="clock" />;
  if (run.conclusion === 'success') return <Pill tone="good" label="Passed" icon="check" />;
  if (run.conclusion === 'failure') return <Pill tone="critical" label="Failed" icon="x" />;
  if (run.conclusion === 'timed_out') return <Pill tone="warning" label="Timed out" icon="clock" />;
  return <Pill tone="neutral" label="Cancelled" icon="x" />;
}

const PR_BADGE: Record<PrStatus, { tone: Tone; label: string; icon: IconName }> = {
  draft: { tone: 'neutral', label: 'Draft', icon: 'pr' },
  open: { tone: 'info', label: 'Open', icon: 'pr' },
  in_review: { tone: 'info', label: 'In review', icon: 'search' },
  changes_requested: { tone: 'warning', label: 'Changes requested', icon: 'x' },
  approved: { tone: 'good', label: 'Approved', icon: 'check' },
  merged: { tone: 'merged', label: 'Merged', icon: 'merge' },
  closed: { tone: 'neutral', label: 'Closed', icon: 'x' },
};

export function PrStatusBadge({ status }: { status: PrStatus }) {
  const b = PR_BADGE[status];
  return <Pill tone={b.tone} label={b.label} icon={b.icon} />;
}
