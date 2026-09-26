// Challenge nonce storage for the signed challenge-response gate.
//
// A nonce is issued on challenge, then consumed exactly once on verify. Single
// use plus a short TTL is what defeats naive replay: a captured request cannot
// be resent because the nonce is already spent. In production inject a shared
// store (Redis, Postgres) so a challenge issued by one API instance can be
// verified by another. The in-memory store is for demo mode and tests.

/** What we remember about an outstanding challenge. */
export interface NonceRecord {
  /** The did the challenge was issued to. Verify must present the same did. */
  did: string;
  /** Epoch milliseconds after which the nonce is dead. */
  expiresAt: number;
}

export interface NonceStore {
  /** Record a freshly issued nonce. */
  put(nonce: string, record: NonceRecord): Promise<void>;
  /** Atomically fetch and delete a nonce. Returns null if absent or expired.
   *  The delete happens whether or not it was expired, so a nonce is single use. */
  take(nonce: string): Promise<NonceRecord | null>;
}

/** In-process TTL map. Not durable and not shared across instances. */
export class InMemoryNonceStore implements NonceStore {
  private readonly map = new Map<string, NonceRecord>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async put(nonce: string, record: NonceRecord): Promise<void> {
    this.map.set(nonce, record);
  }

  async take(nonce: string): Promise<NonceRecord | null> {
    const record = this.map.get(nonce);
    if (record === undefined) {
      return null;
    }
    // Consume it regardless of expiry so it can never be presented twice.
    this.map.delete(nonce);
    if (record.expiresAt <= this.now()) {
      return null;
    }
    return record;
  }

  /** Drop every expired entry. Prod stores lean on their own TTL instead. */
  sweep(): void {
    const cutoff = this.now();
    for (const [nonce, record] of this.map) {
      if (record.expiresAt <= cutoff) {
        this.map.delete(nonce);
      }
    }
  }
}
