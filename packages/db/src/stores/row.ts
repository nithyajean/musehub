// Row coercion helpers. Rows come back with dialect quirks: SQLite hands back 0 or 1
// for booleans while Postgres hands back true or false, and JSON columns are stored
// as text in both. These turn a raw row value into the exact shape the contracts want.

export function str(v: unknown): string {
  return String(v);
}

export function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

export function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

/** SQLite returns 0 or 1, Postgres returns a real boolean. Both land as boolean. */
export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 't';
}

export function boolOrNull(v: unknown): boolean | null {
  return v === null || v === undefined ? null : bool(v);
}

/** JSON columns are stored as text. Parse to the expected shape with a fallback. */
export function jsonArray<T = string>(v: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string' && v.length > 0) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as T[]) : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function jsonObjectOrNull(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string' && v.length > 0) {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** 0 or 1 for a boolean going into an INTEGER column, the same in both dialects. */
export function boolInt(v: boolean): number {
  return v ? 1 : 0;
}
