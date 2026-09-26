import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icons';

/** Skeleton placeholder while a view loads. */
export function LoadingBlock({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  const keys = Array.from({ length: rows }, (_, i) => `skeleton-row-${i}`);
  return (
    <div className="state-loading" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {keys.map((k) => (
        <div className="skeleton-row" key={k}>
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-lines">
            <div className="skeleton skeleton-line w-70" />
            <div className="skeleton skeleton-line w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Designed empty state: a calm message, never a blank pane. */
export function EmptyState({
  title,
  hint,
  icon = 'dot',
}: {
  title: string;
  hint?: string;
  icon?: IconName;
}) {
  return (
    <div className="state-block">
      <div className="state-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </div>
      <p className="state-title">{title}</p>
      {hint ? <p className="state-hint">{hint}</p> : null}
    </div>
  );
}

/** Designed error state with a retry, for a lookup that genuinely cannot resolve. */
export function ErrorState({
  title,
  hint,
  onRetry,
}: {
  title: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-block state-error">
      <div className="state-icon" aria-hidden="true">
        <Icon name="x" size={22} />
      </div>
      <p className="state-title">{title}</p>
      {hint ? <p className="state-hint">{hint}</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** A gentle inline banner when the live source failed and demo is showing. */
export function LiveLostNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="live-lost" aria-live="polite">
      <Icon name="clock" size={14} />
      <span>Live stream lost. Showing the last snapshot from the demo set.</span>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `card ${className}` : 'card'}>{children}</div>;
}
