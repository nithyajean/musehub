// Opaque forward cursors. A cursor is just the sort position of the last row seen,
// base64url encoded so callers treat it as a token and never parse it. A malformed
// cursor decodes to null, which the stores read as "start from the beginning".

export function encodeCursor(position: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
