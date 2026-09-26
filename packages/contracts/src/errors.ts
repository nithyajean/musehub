import { z } from 'zod';

/**
 * Stable machine error codes. One envelope for every failure, REST or tool, so a
 * model can self-correct from the `code` and the `next` hint. Catalog from R6.
 */
export const ERROR_CODES = [
  'unauthenticated',
  'forbidden_human',
  'token_expired',
  'forbidden',
  'repo_not_found',
  'repo_exists',
  'file_not_found',
  'branch_exists',
  'branch_not_found',
  'stale_ref',
  'merge_conflict',
  'checks_pending',
  'checks_failed',
  'review_required',
  'pr_exists',
  'already_merged',
  'confirmation_mismatch',
  'validation_failed',
  'rate_limited',
  'ci_pending',
  'unchanged',
  'internal_error',
] as const;

export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Default HTTP status and retryability per code. The 200 markers are success flags. */
export const ERROR_META: Record<ErrorCode, { http: number; retryable: boolean }> = {
  unauthenticated: { http: 401, retryable: false },
  forbidden_human: { http: 403, retryable: false },
  token_expired: { http: 401, retryable: false },
  forbidden: { http: 403, retryable: false },
  repo_not_found: { http: 404, retryable: false },
  repo_exists: { http: 409, retryable: false },
  file_not_found: { http: 404, retryable: false },
  branch_exists: { http: 409, retryable: false },
  branch_not_found: { http: 404, retryable: false },
  stale_ref: { http: 409, retryable: true },
  merge_conflict: { http: 409, retryable: false },
  checks_pending: { http: 409, retryable: true },
  checks_failed: { http: 409, retryable: false },
  review_required: { http: 409, retryable: false },
  pr_exists: { http: 409, retryable: false },
  already_merged: { http: 200, retryable: false },
  confirmation_mismatch: { http: 422, retryable: false },
  validation_failed: { http: 422, retryable: false },
  rate_limited: { http: 429, retryable: true },
  ci_pending: { http: 200, retryable: true },
  unchanged: { http: 200, retryable: false },
  internal_error: { http: 500, retryable: true },
};

export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    next: z.string().optional(),
    retryable: z.boolean(),
    http_status: z.number().int(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export interface ForgeErrorOptions {
  next?: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  cause?: unknown;
}

/** The single error type the whole forge raises. Carries its wire envelope. */
export class ForgeError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly next: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, opts: ForgeErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'ForgeError';
    this.code = code;
    this.httpStatus = ERROR_META[code].http;
    this.retryable = opts.retryable ?? ERROR_META[code].retryable;
    this.next = opts.next;
    this.details = opts.details;
  }

  toEnvelope(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.next !== undefined ? { next: this.next } : {}),
        retryable: this.retryable,
        http_status: this.httpStatus,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export function forgeError(code: ErrorCode, message: string, opts?: ForgeErrorOptions): ForgeError {
  return new ForgeError(code, message, opts);
}

export function isForgeError(e: unknown): e is ForgeError {
  return e instanceof ForgeError;
}
