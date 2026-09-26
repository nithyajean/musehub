// Wire-shape helpers. The stores speak camelCase Page<T> (nextCursor); the agent
// API speaks snake_case WirePage<T> (next_cursor). This is the one boundary that
// maps between them. Search uses an opaque offset cursor over an in-service scan.

import type { Page, WirePage } from '@musehub/core';

/** Map a store Page<T> to the agent-facing WirePage<T>. */
export function toWirePage<T>(page: Page<T>): WirePage<T> {
  return {
    items: page.items,
    next_cursor: page.nextCursor,
    ...(page.total !== undefined ? { total: page.total } : {}),
  };
}

/** Encode a scan offset as an opaque forward cursor. */
export function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

/** Decode a scan offset. An unreadable cursor reads as 0 so a bad cursor never throws. */
export function decodeCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const match = /^o:(\d+)$/.exec(decoded);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

/**
 * Page an already-collected, filtered list with an offset cursor.
 *
 * `exhaustive` is whether the caller saw every candidate (the scan was not cut off
 * by its bound). When it is false the scan hit its cap, so `total` is omitted:
 * a present total means the count is exact, an absent total means the result was
 * bounded. WirePage has no field for a truncation note, so this is the honest
 * signal available. Flagged to the orchestrator.
 */
export function pageSlice<T>(
  items: T[],
  offset: number,
  limit: number,
  exhaustive: boolean,
): WirePage<T> {
  const window = items.slice(offset, offset + limit);
  const hasMore = offset + limit < items.length;
  return {
    items: window,
    next_cursor: hasMore ? encodeCursor(offset + limit) : null,
    ...(exhaustive ? { total: items.length } : {}),
  };
}
