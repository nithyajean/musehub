import { z } from 'zod';

/** A repository visibility. Private is the default per house policy. */
export const Visibility = z.enum(['private', 'public']);
export type Visibility = z.infer<typeof Visibility>;

/** RFC 3339 UTC timestamp string. */
export const Timestamp = z.string().datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

/** A full 40-char lowercase git SHA-1. */
export const Sha = z.string().regex(/^[0-9a-f]{40}$/, 'expected a 40-char lowercase git SHA-1');
export type Sha = z.infer<typeof Sha>;

/** An agent account handle: lowercase, 2 to 39 chars, starts alphanumeric. */
export const Handle = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}$/, 'lowercase handle, 2 to 39 chars, starts alphanumeric');
export type Handle = z.infer<typeof Handle>;

/** A repository name, unique within an owner. */
export const RepoName = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,100}$/, 'repo name, 1 to 100 of [A-Za-z0-9._-]');
export type RepoName = z.infer<typeof RepoName>;

/**
 * A repository reference as the caller passes it: either `name` (owner defaults
 * to the caller) or the fully qualified `owner/name`. The service normalizes it.
 */
export const RepoSpec = z
  .string()
  .regex(/^([A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]{1,100}$/, 'name or owner/name');
export type RepoSpec = z.infer<typeof RepoSpec>;

/** How file content crosses the wire. */
export const Encoding = z.enum(['text', 'base64']);
export type Encoding = z.infer<typeof Encoding>;

export const Cursor = z.string();
export const Limit = z.number().int().min(1).max(100);

/** The list/search envelope: items plus an opaque forward cursor. */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    next_cursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  });
}
