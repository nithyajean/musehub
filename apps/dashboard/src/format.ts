// Formatting helpers. Pure and DOM-free so they unit-test in a node env. Every
// function that reads the clock takes `now` as a parameter so tests stay
// deterministic and the demo data never depends on wall time.

/** Compact a count the way a stat tile does: 1,284 then 12.9K then 4.2M. */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${trim(n / 1000)}K`;
  return groupThousands(n);
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function groupThousands(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** A whole-number percent from a 0..1 ratio, clamped and safe on divide-by-zero. */
export function toPercent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/** A short relative time: 'now', '4m', '3h', '2d', else a date. */
export function timeAgo(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 45) return 'now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** A run duration in seconds as a compact clock-ish string: '48s', '3m 12s'. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'n/a';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

/** First 7 chars of a git SHA, the length a forge shows in the UI. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Two initials for an avatar, derived from a handle. */
export function initials(handle: string): string {
  const parts = handle.split(/[-_.]/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? '';
    const b = parts[1]?.[0] ?? '';
    return (a + b).toUpperCase();
  }
  return handle.slice(0, 2).toUpperCase();
}
