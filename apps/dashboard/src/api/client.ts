// The typed read client for the forge observability API, plus the demo fallback
// wrapper. The live API may not be running in dev, so every load tries live and
// falls back to the labeled demo dataset. loadWithFallback never throws, so a
// view always has data and never blanks. Pure logic (no DOM), unit-tested.

import { makeDemoData } from './demo';
import type { ForgeData, Loaded } from './types';

/** The slice of the global fetch we depend on, so tests can inject a fake. */
export type Fetcher = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface ClientConfig {
  baseUrl: string;
  fetcher: Fetcher;
}

/**
 * Run a live loader and fall back to demo on any failure. The returned source is
 * `live` on success and `demo` on failure, with `liveError` telling the two demo
 * cases apart: a genuine live failure versus running in demo mode by config.
 */
export async function loadWithFallback<T>(
  live: () => Promise<T>,
  demo: () => T,
): Promise<Loaded<T>> {
  try {
    const data = await live();
    return { data, source: 'live', liveError: false };
  } catch {
    return { data: demo(), source: 'demo', liveError: true };
  }
}

/** Read-only endpoints the dashboard consumes. Names match the api package plan. */
export const ENDPOINTS = {
  agents: '/agents',
  repos: '/repos',
  pulls: '/pulls',
  reviews: '/reviews',
  ci: '/ci/runs',
  activity: '/activity',
} as const;

export class ForgeClient {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.fetcher = config.fetcher;
  }

  private async getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await this.fetcher(`${this.baseUrl}${path}`, signal ? { signal } : undefined);
    if (!res.ok) {
      throw new Error(`forge api ${path} returned ${res.status}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Fetch every collection the dashboard renders. A single failing collection
   * fails the whole load, which is what we want: the caller then shows one
   * coherent demo snapshot rather than a half-live, half-demo view.
   */
  async fetchAll(signal?: AbortSignal): Promise<ForgeData> {
    const [agents, repos, pulls, reviews, ci, activity] = await Promise.all([
      this.getJson<ForgeData['agents']>(ENDPOINTS.agents, signal),
      this.getJson<ForgeData['repos']>(ENDPOINTS.repos, signal),
      this.getJson<ForgeData['pulls']>(ENDPOINTS.pulls, signal),
      this.getJson<ForgeData['reviews']>(ENDPOINTS.reviews, signal),
      this.getJson<ForgeData['ci']>(ENDPOINTS.ci, signal),
      this.getJson<ForgeData['activity']>(ENDPOINTS.activity, signal),
    ]);
    // Files, commits and branches are read on demand per repo; the demo set
    // seeds them so repo detail renders offline.
    return { agents, repos, pulls, reviews, ci, activity, commits: {}, branches: {} };
  }

  loadForge(now: number, signal?: AbortSignal): Promise<Loaded<ForgeData>> {
    return loadWithFallback(
      () => this.fetchAll(signal),
      () => makeDemoData(now),
    );
  }
}

function readBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_FORGE_API ?? '/api';
  } catch {
    return '/api';
  }
}

/** The client the app uses, pointed at the configured API base or `/api`. */
export function createClient(): ForgeClient {
  return new ForgeClient({
    baseUrl: readBaseUrl(),
    fetcher: (input, init) => fetch(input, init),
  });
}
