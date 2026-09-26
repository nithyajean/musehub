import { useEffect, useState, useSyncExternalStore } from 'react';
import { type RouteMatch, matchRoute } from '../routes';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot(): string {
  return window.location.hash || '#/';
}

/** The current route, recomputed whenever the hash changes. */
export function useHashLocation(): RouteMatch {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '#/');
  return matchRoute(hash);
}

/** Go to a route. Fires a hashchange even when the hash is unchanged, so a
 * repeated same-section click still re-runs the scroll effect. */
export function navigate(to: string): void {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

/** A clock that ticks on an interval, so relative times stay fresh. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
