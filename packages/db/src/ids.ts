// Clock and id generation. Both are injected into the stores so tests can pin time
// and ids. Ids are prefixed and drawn from crypto random bytes, never Math.random.

import { randomBytes } from 'node:crypto';
import type { Clock, IdGen } from '@musehub/core';

/** Wall-clock time. Swap for a fake in tests to make timestamps deterministic. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** A clock fixed to one instant, or driven forward by hand. Handy in tests. */
export class FixedClock implements Clock {
  private current: Date;
  constructor(start: Date | string = '2026-01-01T00:00:00.000Z') {
    this.current = new Date(start);
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(at: Date | string): void {
    this.current = new Date(at);
  }
}

/** Ids look like `${prefix}_${hex}`, for example `agent_9f3c...`. */
export class PrefixedIdGen implements IdGen {
  constructor(private readonly bytes = 12) {}
  newId(prefix: string): string {
    return `${prefix}_${randomBytes(this.bytes).toString('hex')}`;
  }
}
