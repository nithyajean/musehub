// The events fan-out helpers: HMAC signing, secret minting, the default fetch
// sender, and the pure functions that decide who an event notifies and whether an
// audit target belongs to a repo. The service owns the orchestration; this file
// holds the parts worth testing on their own and the one place egress happens.

import { createHmac, randomBytes } from 'node:crypto';
import type { ForgeEvent, WebhookSender } from '@musehub/core';

/** The signature header carried on every delivery. */
export const SIGNATURE_HEADER = 'x-musehub-signature-256';
/** The event name header. */
export const EVENT_HEADER = 'x-musehub-event';
/** A per-attempt correlation id header. */
export const DELIVERY_HEADER = 'x-musehub-delivery';

/**
 * The signature for a delivery body: HMAC-SHA256 of the exact bytes, hex, prefixed
 * `sha256=` so a receiver knows the algorithm. The receiver recomputes it with the
 * shared secret and compares, which is what proves the POST came from the forge.
 */
export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Mint a high-entropy signing secret for a webhook created without one. */
export function generateSecret(): string {
  return randomBytes(24).toString('hex');
}

/**
 * The default sender, used when the composition wires none. SECURITY: this POSTs to
 * an agent-controlled url, so webhook egress is an outbound-request surface. A
 * hardened deployment puts an allowlist, DNS-rebinding guard and private-range block
 * in front of this. The timeout keeps a slow endpoint from holding a request open.
 */
export function createFetchSender(timeoutMs = 5000): WebhookSender {
  return {
    async send({ url, body, signature, event, deliveryId }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [SIGNATURE_HEADER]: signature,
            [EVENT_HEADER]: event,
            [DELIVERY_HEADER]: deliveryId,
          },
          body,
          signal: controller.signal,
        });
        return { statusCode: res.status };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
}

/**
 * The agents an event notifies, read from its payload so no extra store reads are
 * needed. The caller filters out the actor so an agent is never notified about its
 * own action, and dedupes. Events with no natural recipient return an empty list.
 */
export function recipientsFor(event: ForgeEvent): string[] {
  const p = event.payload;
  switch (event.type) {
    case 'pr.opened': {
      const owner = asString(p.owner);
      return owner ? [owner] : [];
    }
    case 'pr.reviewed':
    case 'pr.merged': {
      const author = asString(p.author);
      return author ? [author] : [];
    }
    case 'issue.opened':
      return asStringArray(p.assignees);
    case 'issue.closed': {
      const author = asString(p.author);
      return author ? [author, ...asStringArray(p.assignees)] : asStringArray(p.assignees);
    }
    default:
      return [];
  }
}

/**
 * Whether an audit target belongs to a repo. Repo-scoped targets are the full name
 * itself (owner/name) or the full name followed by '#' (a pull request or issue) or
 * '@' (a branch or ref), which is exactly the shape the service writes.
 */
export function targetInRepo(target: string, repo: string): boolean {
  return target === repo || target.startsWith(`${repo}#`) || target.startsWith(`${repo}@`);
}
