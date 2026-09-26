import { describe, expect, it } from 'vitest';
import { type Fetcher, ForgeClient, loadWithFallback } from './client';

const NOW = Date.parse('2026-09-26T12:00:00Z');

function okFetcher(payload: unknown): Fetcher {
  return () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
}

const failFetcher: Fetcher = () =>
  Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) });

describe('loadWithFallback', () => {
  it('returns the live value and labels it live', async () => {
    const r = await loadWithFallback(
      () => Promise.resolve('live-value'),
      () => 'demo-value',
    );
    expect(r).toEqual({ data: 'live-value', source: 'live', liveError: false });
  });

  it('falls back to demo and flags the live error', async () => {
    const r = await loadWithFallback(
      () => Promise.reject(new Error('down')),
      () => 'demo-value',
    );
    expect(r).toEqual({ data: 'demo-value', source: 'demo', liveError: true });
  });
});

describe('ForgeClient', () => {
  it('reads every collection when the API answers', async () => {
    const client = new ForgeClient({ baseUrl: '/api', fetcher: okFetcher([]) });
    const data = await client.fetchAll();
    expect(data.agents).toEqual([]);
    expect(data.pulls).toEqual([]);
    expect(data.ci).toEqual([]);
  });

  it('rejects when the API returns a non-ok status', async () => {
    const client = new ForgeClient({ baseUrl: '/api', fetcher: failFetcher });
    await expect(client.fetchAll()).rejects.toThrow();
  });

  it('loadForge falls back to the demo set when the API is down', async () => {
    const client = new ForgeClient({ baseUrl: '/api', fetcher: failFetcher });
    const loaded = await client.loadForge(NOW);
    expect(loaded.source).toBe('demo');
    expect(loaded.liveError).toBe(true);
    expect(loaded.data.agents.length).toBeGreaterThan(0);
  });

  it('loadForge reports live when the API answers', async () => {
    const empty = { agents: [], repos: [], pulls: [], reviews: [], ci: [], activity: [] };
    const client = new ForgeClient({ baseUrl: '/api', fetcher: okFetcher([]) });
    const loaded = await client.loadForge(NOW);
    expect(loaded.source).toBe('live');
    expect(loaded.data.agents).toEqual(empty.agents);
  });
});
