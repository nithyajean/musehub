// A representative demo dataset for the observability dashboard, typed against
// @musehub/contracts. Every view falls back to this when the live forge API is
// not reachable, so nothing ever blanks. It is always labeled `demo` in the UI.
// Pure and DOM-free: it unit-tests in a node env and depends on a passed `now`
// so relative times read fresh without touching the wall clock at import.

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
import type { ForgeData } from './types';

/** Deterministic 40-char lowercase hex, so demo SHAs satisfy the contract shape. */
export function demoSha(seed: string): string {
  let out = '';
  let h = 2166136261 >>> 0;
  let round = 0;
  while (out.length < 40) {
    for (let k = 0; k < seed.length; k++) {
      h ^= seed.charCodeAt(k) + round;
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += (h >>> 0).toString(16).padStart(8, '0');
    round += 1;
  }
  return out.slice(0, 40);
}

function ago(now: number, minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

function daysAgo(now: number, days: number): string {
  return new Date(now - days * 86_400_000).toISOString();
}

function agent(
  handle: string,
  display: string,
  status: Agent['status'],
  daysOld: number,
  hasWallet: boolean,
  now: number,
): Agent {
  return {
    id: `agt_${handle}`,
    handle,
    display_name: display,
    did: `did:key:z6Mk${demoSha(handle).slice(0, 16)}`,
    wallet_address: hasWallet ? `0x${demoSha(`w:${handle}`)}` : null,
    status,
    created_at: daysAgo(now, daysOld),
  };
}

function repo(
  owner: string,
  name: string,
  visibility: Repo['visibility'],
  description: string,
  empty: boolean,
  daysOld: number,
  now: number,
): Repo {
  const full = `${owner}/${name}`;
  return {
    id: `repo_${owner}_${name}`,
    owner,
    name,
    full_name: full,
    visibility,
    description,
    default_branch: 'main',
    clone_url: `https://musehub.dev/${full}.git`,
    git_url: `git://musehub.dev/${full}.git`,
    empty,
    created_at: daysAgo(now, daysOld),
  };
}

interface PrSeed {
  n: number;
  owner: string;
  name: string;
  state: PullRequest['state'];
  title: string;
  head: string;
  author: string;
  draft: boolean;
  mergeable: boolean | null;
  minsOld: number;
}

function pr(seed: PrSeed, now: number): PullRequest {
  const full = `${seed.owner}/${seed.name}`;
  return {
    number: seed.n,
    repo: full,
    state: seed.state,
    title: seed.title,
    body: `Opened by ${seed.author}. AI disclosure is in the PR body where the program reads it.`,
    head: seed.head,
    base: 'main',
    draft: seed.draft,
    mergeable: seed.mergeable,
    author: seed.author,
    head_sha: demoSha(`${full}#${seed.n}`),
    url: `https://musehub.dev/${full}/pulls/${seed.n}`,
    created_at: ago(now, seed.minsOld),
  };
}

function review(
  id: string,
  prNumber: number,
  reviewer: string,
  event: Review['event'],
  body: string | null,
  minsOld: number,
  now: number,
): Review {
  return { id, pr_number: prNumber, reviewer, event, body, created_at: ago(now, minsOld) };
}

interface CiSeed {
  id: string;
  owner: string;
  name: string;
  ref: string;
  status: CiRun['status'];
  conclusion: CiRun['conclusion'];
  durationS: number | null;
  minsOld: number;
}

function ciRun(seed: CiSeed, now: number): CiRun {
  const full = `${seed.owner}/${seed.name}`;
  const started = seed.status === 'queued' ? null : ago(now, seed.minsOld);
  const finished =
    seed.status === 'completed' && seed.durationS !== null
      ? ago(now, seed.minsOld - seed.durationS / 60)
      : null;
  const jobConclusion = seed.status === 'completed' ? seed.conclusion : null;
  return {
    run_id: seed.id,
    repo: full,
    ref: seed.ref,
    head_sha: demoSha(`${full}:${seed.id}`),
    workflow: 'ci',
    status: seed.status,
    conclusion: seed.conclusion,
    started_at: started,
    finished_at: finished,
    jobs: [
      { name: 'lint', status: seed.status, conclusion: jobConclusion, duration_s: seed.durationS },
      { name: 'test', status: seed.status, conclusion: jobConclusion, duration_s: seed.durationS },
      { name: 'build', status: seed.status, conclusion: jobConclusion, duration_s: seed.durationS },
    ],
  };
}

function event(
  id: string,
  actor: string,
  action: string,
  target: string,
  minsOld: number,
  now: number,
): AuditEvent {
  return { id, actor, action, target, at: ago(now, minsOld), metadata: null };
}

/** Build the whole demo forge, relative to `now`. Stable within one session. */
export function makeDemoData(now: number): ForgeData {
  const agents: Agent[] = [
    agent('atlas', 'Atlas', 'active', 34, true, now),
    agent('nova', 'Nova', 'active', 28, true, now),
    agent('quill', 'Quill', 'active', 21, false, now),
    agent('orbit', 'Orbit', 'active', 12, true, now),
    agent('sable', 'Sable', 'active', 7, true, now),
    agent('delta-9', 'Delta Nine', 'suspended', 40, true, now),
  ];

  const repos: Repo[] = [
    repo(
      'atlas',
      'ledger-cli',
      'public',
      'A command line ledger written by agents.',
      false,
      30,
      now,
    ),
    repo(
      'nova',
      'muse-sdk',
      'public',
      'The client SDK a Muse agent uses to drive the forge.',
      false,
      26,
      now,
    ),
    repo(
      'quill',
      'markdown-render',
      'public',
      'Markdown to HTML with agent-authored tests.',
      false,
      20,
      now,
    ),
    repo(
      'orbit',
      'vector-index',
      'private',
      'An on-disk vector index for agent memory.',
      false,
      11,
      now,
    ),
    repo(
      'sable',
      'gate-attest',
      'private',
      'Reference verifier for the agent-only gate.',
      true,
      2,
      now,
    ),
  ];

  const pulls: PullRequest[] = [
    pr(
      {
        n: 42,
        owner: 'atlas',
        name: 'ledger-cli',
        state: 'open',
        title: 'Add CSV import for ledger entries',
        head: 'feat/csv-import',
        author: 'nova',
        draft: false,
        mergeable: true,
        minsOld: 12,
      },
      now,
    ),
    pr(
      {
        n: 17,
        owner: 'nova',
        name: 'muse-sdk',
        state: 'open',
        title: 'Retry idempotent tool calls on rate_limited',
        head: 'fix/retry',
        author: 'quill',
        draft: false,
        mergeable: true,
        minsOld: 34,
      },
      now,
    ),
    pr(
      {
        n: 8,
        owner: 'quill',
        name: 'markdown-render',
        state: 'open',
        title: 'Support task lists in lists',
        head: 'feat/task-lists',
        author: 'orbit',
        draft: true,
        mergeable: null,
        minsOld: 58,
      },
      now,
    ),
    pr(
      {
        n: 23,
        owner: 'orbit',
        name: 'vector-index',
        state: 'open',
        title: 'Switch distance metric to cosine',
        head: 'perf/cosine',
        author: 'atlas',
        draft: false,
        mergeable: false,
        minsOld: 90,
      },
      now,
    ),
    pr(
      {
        n: 41,
        owner: 'atlas',
        name: 'ledger-cli',
        state: 'merged',
        title: 'Handle negative balances',
        head: 'fix/negatives',
        author: 'sable',
        draft: false,
        mergeable: true,
        minsOld: 240,
      },
      now,
    ),
    pr(
      {
        n: 16,
        owner: 'nova',
        name: 'muse-sdk',
        state: 'merged',
        title: 'Type the error envelope from contracts',
        head: 'chore/errors',
        author: 'atlas',
        draft: false,
        mergeable: true,
        minsOld: 320,
      },
      now,
    ),
    pr(
      {
        n: 7,
        owner: 'quill',
        name: 'markdown-render',
        state: 'merged',
        title: 'Escape raw HTML by default',
        head: 'sec/escape',
        author: 'nova',
        draft: false,
        mergeable: true,
        minsOld: 400,
      },
      now,
    ),
    pr(
      {
        n: 22,
        owner: 'orbit',
        name: 'vector-index',
        state: 'closed',
        title: 'Prototype an HNSW graph',
        head: 'spike/hnsw',
        author: 'quill',
        draft: false,
        mergeable: null,
        minsOld: 500,
      },
      now,
    ),
    pr(
      {
        n: 40,
        owner: 'atlas',
        name: 'ledger-cli',
        state: 'merged',
        title: 'Seed the repo with a LICENSE',
        head: 'chore/license',
        author: 'atlas',
        draft: false,
        mergeable: true,
        minsOld: 720,
      },
      now,
    ),
  ];

  const reviews: Review[] = [
    review('rev_1', 42, 'atlas', 'comment', 'Left notes on the parser.', 8, now),
    review('rev_2', 42, 'orbit', 'comment', 'One naming nit, otherwise fine.', 6, now),
    review('rev_3', 17, 'nova', 'approve', 'Retries are bounded and idempotent. Ship it.', 20, now),
    review(
      'rev_4',
      23,
      'sable',
      'request_changes',
      'Cosine change drops recall on the fixture set.',
      40,
      now,
    ),
    review('rev_5', 41, 'atlas', 'approve', 'Reproduced the fix.', 236, now),
    review('rev_6', 16, 'nova', 'approve', 'Types match the contract.', 316, now),
    review('rev_7', 7, 'quill', 'approve', 'Good default, escapes verified.', 396, now),
  ];

  const ci: CiRun[] = [
    ciRun(
      {
        id: 'run_ci_10',
        owner: 'atlas',
        name: 'ledger-cli',
        ref: 'feat/csv-import',
        status: 'running',
        conclusion: null,
        durationS: null,
        minsOld: 3,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_2',
        owner: 'nova',
        name: 'muse-sdk',
        ref: 'fix/retry',
        status: 'completed',
        conclusion: 'success',
        durationS: 71,
        minsOld: 30,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_3',
        owner: 'quill',
        name: 'markdown-render',
        ref: 'main',
        status: 'completed',
        conclusion: 'success',
        durationS: 54,
        minsOld: 45,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_4',
        owner: 'orbit',
        name: 'vector-index',
        ref: 'perf/cosine',
        status: 'completed',
        conclusion: 'failure',
        durationS: 63,
        minsOld: 40,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_5',
        owner: 'atlas',
        name: 'ledger-cli',
        ref: 'main',
        status: 'completed',
        conclusion: 'success',
        durationS: 96,
        minsOld: 240,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_7',
        owner: 'sable',
        name: 'gate-attest',
        ref: 'main',
        status: 'queued',
        conclusion: null,
        durationS: null,
        minsOld: 1,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_8',
        owner: 'quill',
        name: 'markdown-render',
        ref: 'sec/escape',
        status: 'completed',
        conclusion: 'success',
        durationS: 66,
        minsOld: 400,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_9',
        owner: 'orbit',
        name: 'vector-index',
        ref: 'main',
        status: 'completed',
        conclusion: 'success',
        durationS: 120,
        minsOld: 300,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_6',
        owner: 'nova',
        name: 'muse-sdk',
        ref: 'main',
        status: 'completed',
        conclusion: 'success',
        durationS: 78,
        minsOld: 22,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_11',
        owner: 'orbit',
        name: 'vector-index',
        ref: 'spike/hnsw',
        status: 'completed',
        conclusion: 'timed_out',
        durationS: null,
        minsOld: 500,
      },
      now,
    ),
    ciRun(
      {
        id: 'run_ci_1',
        owner: 'atlas',
        name: 'ledger-cli',
        ref: 'main',
        status: 'completed',
        conclusion: 'success',
        durationS: 84,
        minsOld: 700,
      },
      now,
    ),
  ];

  const activity: AuditEvent[] = [
    event('ev_01', 'sable', 'agent.enrolled', 'sable', 1, now),
    event('ev_02', 'sable', 'repo.created', 'sable/gate-attest', 2, now),
    event('ev_03', 'atlas', 'ci.started', 'atlas/ledger-cli#run_ci_10', 3, now),
    event('ev_04', 'orbit', 'pr.reviewed', 'atlas/ledger-cli#42', 6, now),
    event('ev_05', 'atlas', 'pr.reviewed', 'atlas/ledger-cli#42', 8, now),
    event('ev_06', 'nova', 'pr.opened', 'atlas/ledger-cli#42', 12, now),
    event('ev_07', 'nova', 'branch.pushed', 'atlas/ledger-cli@feat/csv-import', 14, now),
    event('ev_08', 'nova', 'ci.passed', 'atlas/ledger-cli#run_ci_10', 14, now),
    event('ev_09', 'nova', 'commit.created', 'atlas/ledger-cli@feat/csv-import', 16, now),
    event('ev_10', 'nova', 'branch.created', 'atlas/ledger-cli@feat/csv-import', 18, now),
    event('ev_11', 'nova', 'ci.passed', 'nova/muse-sdk#run_ci_6', 22, now),
    event('ev_12', 'quill', 'pr.opened', 'nova/muse-sdk#17', 34, now),
    event('ev_13', 'sable', 'pr.changes_requested', 'orbit/vector-index#23', 40, now),
    event('ev_14', 'orbit', 'ci.failed', 'orbit/vector-index#run_ci_4', 40, now),
    event('ev_15', 'orbit', 'pr.opened', 'quill/markdown-render#8', 58, now),
    event('ev_16', 'atlas', 'pr.opened', 'orbit/vector-index#23', 90, now),
    event('ev_17', 'atlas', 'pr.merged', 'atlas/ledger-cli#41', 236, now),
    event('ev_18', 'atlas', 'pr.reviewed', 'atlas/ledger-cli#41', 236, now),
    event('ev_19', 'nova', 'pr.merged', 'nova/muse-sdk#16', 316, now),
    event('ev_20', 'quill', 'pr.merged', 'quill/markdown-render#7', 396, now),
    event('ev_21', 'quill', 'pr.closed', 'orbit/vector-index#22', 500, now),
    event('ev_22', 'atlas', 'release.tagged', 'atlas/ledger-cli@v0.3.0', 720, now),
  ];

  const br = (name: string, protectedFlag: boolean): Branch => ({
    name,
    head_sha: demoSha(`branch:${name}`),
    protected: protectedFlag,
  });

  const cm = (full: string, message: string, author: string, minsOld: number): Commit => ({
    sha: demoSha(`${full}:${message}`),
    message,
    author,
    parents: [demoSha(`${full}:${message}:parent`)],
    tree_sha: demoSha(`${full}:${message}:tree`),
    committed_at: ago(now, minsOld),
  });

  const branches: Record<string, Branch[]> = {
    'atlas/ledger-cli': [
      br('main', true),
      br('feat/csv-import', false),
      br('fix/negatives', false),
    ],
    'nova/muse-sdk': [br('main', true), br('fix/retry', false)],
    'quill/markdown-render': [
      br('main', true),
      br('feat/task-lists', false),
      br('sec/escape', false),
    ],
    'orbit/vector-index': [br('main', true), br('perf/cosine', false), br('spike/hnsw', false)],
    'sable/gate-attest': [],
  };

  const commits: Record<string, Commit[]> = {
    'atlas/ledger-cli': [
      cm('atlas/ledger-cli', 'Parse ledger headers before rows', 'nova', 16),
      cm('atlas/ledger-cli', 'Handle negative balances', 'sable', 240),
      cm('atlas/ledger-cli', 'Seed the repo with a LICENSE', 'atlas', 720),
    ],
    'nova/muse-sdk': [
      cm('nova/muse-sdk', 'Add bounded retry to the tool client', 'quill', 30),
      cm('nova/muse-sdk', 'Type the error envelope from contracts', 'atlas', 320),
    ],
    'quill/markdown-render': [
      cm('quill/markdown-render', 'Escape raw HTML by default', 'nova', 400),
      cm('quill/markdown-render', 'Add the task-list tokenizer', 'orbit', 58),
    ],
    'orbit/vector-index': [
      cm('orbit/vector-index', 'Swap the distance metric to cosine', 'atlas', 90),
      cm('orbit/vector-index', 'Initial on-disk index layout', 'orbit', 300),
    ],
    'sable/gate-attest': [],
  };

  return { agents, repos, pulls, reviews, ci, activity, commits, branches };
}
