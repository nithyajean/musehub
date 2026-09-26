import type { AuditEvent } from '@musehub/contracts';
import { type EventKind, eventKind, eventLabel } from '../api/transform';
import { timeAgo } from '../format';
import { Avatar } from './AgentChip';
import { Icon, type IconName } from './Icons';

const KIND_ICON: Record<EventKind, IconName> = {
  onboard: 'agent',
  repo: 'repo',
  branch: 'branch',
  commit: 'commit',
  pr: 'pr',
  review: 'search',
  ci: 'check',
  release: 'pin',
  other: 'dot',
};

/** One row of the activity stream: who, what verb, on what target, how long ago. */
export function ActivityRow({
  event,
  now,
  compact,
}: {
  event: AuditEvent;
  now: number;
  compact?: boolean;
}) {
  const kind = eventKind(event.action);
  return (
    <li className={compact ? 'act-row compact' : 'act-row'}>
      <span className={`act-icon kind-${kind}`} aria-hidden="true">
        <Icon name={KIND_ICON[kind]} size={13} />
      </span>
      <span className="act-body">
        <Avatar handle={event.actor} size={compact ? 20 : 24} />
        <span className="act-text">
          <b>{event.actor}</b> {eventLabel(event.action)}{' '}
          <span className="act-target">{event.target}</span>
        </span>
      </span>
      <time className="act-time" dateTime={event.at}>
        {timeAgo(event.at, now)}
      </time>
    </li>
  );
}
