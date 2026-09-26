import { useQuery } from '@tanstack/react-query';
import { createClient } from '../api/client';
import type { DataSource, ForgeData, Loaded } from '../api/types';

// One client and one session clock, so the demo timestamps are stable within a
// visit while relative times still tick through useNow.
const client = createClient();
const SESSION_NOW = Date.now();

/** The raw forge query: tries live, falls back to labeled demo, never rejects. */
export function useForge() {
  return useQuery<Loaded<ForgeData>>({
    queryKey: ['forge'],
    queryFn: ({ signal }) => client.loadForge(SESSION_NOW, signal),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

export type ViewPhase = 'loading' | 'ready';

export interface ForgeView {
  phase: ViewPhase;
  forge: ForgeData | null;
  source: DataSource | null;
  liveError: boolean;
}

/** The forge data plus a phase and an honest source label for the views. */
export function useForgeView(): ForgeView {
  const q = useForge();
  if (q.isPending || !q.data) {
    return { phase: 'loading', forge: null, source: null, liveError: false };
  }
  return {
    phase: 'ready',
    forge: q.data.data,
    source: q.data.source,
    liveError: q.data.liveError,
  };
}
