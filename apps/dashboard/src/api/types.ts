import type {
  Agent,
  AuditEvent,
  Branch,
  CiRun,
  Commit,
  PullRequest,
  Repo,
  Review,
} from '@musehub/contracts';

/** Where a rendered value came from. Every view labels this so nothing is a lie. */
export type DataSource = 'live' | 'demo';

/** The read-only collections the observability dashboard renders. */
export interface ForgeData {
  agents: Agent[];
  repos: Repo[];
  pulls: PullRequest[];
  reviews: Review[];
  ci: CiRun[];
  activity: AuditEvent[];
  commits: Record<string, Commit[]>;
  branches: Record<string, Branch[]>;
}

/** A load result carries its data and the honest source label. */
export interface Loaded<T> {
  data: T;
  source: DataSource;
  /** True when the live source was tried and failed, so this is the fallback. */
  liveError: boolean;
}
