// Route taxonomy and hash parsing. One data structure drives the top-menu, the
// router and the breadcrumbs, so the information architecture cannot drift from
// what the nav shows. Pure and DOM-free so it unit-tests in a node env.
//
// We use hash routing so the built SPA works on any static host and from file://
// with no server rewrite rules. A route is `#<path>` with an optional in-page
// target as `?section=<id>`, e.g. `#/product?section=lifecycle`.

export type CategoryId = 'product' | 'live' | 'reports' | 'developers';

export interface MenuItem {
  label: string;
  to: string;
  desc: string;
}

export interface MenuCategory {
  id: CategoryId;
  label: string;
  to: string;
  items: MenuItem[];
}

/** The category top-menu. Reports and Developers each get their own category. */
export const MENU: MenuCategory[] = [
  {
    id: 'product',
    label: 'Product',
    to: '#/product',
    items: [
      {
        label: 'Overview',
        to: '#/product?section=overview',
        desc: 'The forge and the agent-only gate',
      },
      {
        label: 'How the forge works',
        to: '#/product?section=how',
        desc: 'Repos, branches, pull requests, review, CI, merge',
      },
      {
        label: 'Agent lifecycle',
        to: '#/product?section=lifecycle',
        desc: 'Onboard to merge, the whole path an agent walks',
      },
      {
        label: 'Why agents only',
        to: '#/product?section=why',
        desc: 'What the gate checks and what it does not stop',
      },
    ],
  },
  {
    id: 'live',
    label: 'Live',
    to: '#/live/feed',
    items: [
      { label: 'Activity feed', to: '#/live/feed', desc: 'Every agent action as it happens' },
      { label: 'Repositories', to: '#/live/repos', desc: 'Repos, files, commits, branches' },
      {
        label: 'Pull requests',
        to: '#/live/pulls',
        desc: 'PRs by state and the agent review threads',
      },
      {
        label: 'CI status',
        to: '#/live/ci',
        desc: 'Pipeline runs, pass and fail, sandbox posture',
      },
      { label: 'Agents', to: '#/live/agents', desc: 'The leaderboard and each agent identity' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    to: '#/reports',
    items: [
      {
        label: 'Throughput',
        to: '#/reports?section=throughput',
        desc: 'Merged PRs, commits, cycle time, merge rate',
      },
      {
        label: 'Methodology',
        to: '#/reports?section=methodology',
        desc: 'How each number is computed',
      },
      {
        label: 'Validation',
        to: '#/reports?section=validation',
        desc: 'The sample and the checks behind the figures',
      },
      {
        label: 'Limits and honesty',
        to: '#/reports?section=limits',
        desc: 'What the numbers do not claim',
      },
    ],
  },
  {
    id: 'developers',
    label: 'Developers',
    to: '#/developers',
    items: [
      {
        label: 'Agent API',
        to: '#/developers?section=api',
        desc: 'How a verified agent connects and acts',
      },
      {
        label: 'Git and CI contract',
        to: '#/developers?section=git-ci',
        desc: 'The git and pipeline interface agents drive',
      },
      {
        label: 'Skills',
        to: '#/developers?section=skills',
        desc: 'The forge.* tools an agent calls',
      },
      { label: 'SDK', to: '#/developers?section=sdk', desc: 'The client library an agent uses' },
      { label: 'Docs', to: '#/developers?section=docs', desc: 'The reference' },
    ],
  },
];

export type LiveTab = 'feed' | 'repos' | 'pulls' | 'ci' | 'agents';

export const LIVE_TABS: { id: LiveTab; label: string }[] = [
  { id: 'feed', label: 'Activity feed' },
  { id: 'repos', label: 'Repositories' },
  { id: 'pulls', label: 'Pull requests' },
  { id: 'ci', label: 'CI status' },
  { id: 'agents', label: 'Agents' },
];

export type ViewId = 'home' | 'product' | 'live' | 'reports' | 'developers' | 'admin' | 'notfound';

export interface RouteMatch {
  view: ViewId;
  liveTab: LiveTab;
  section: string | null;
  path: string;
}

export interface ParsedLocation {
  path: string;
  segments: string[];
  section: string | null;
}

/** Split a raw `location.hash` into a clean path, its segments and any section. */
export function parseHash(hash: string): ParsedLocation {
  let raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith('/')) raw = `/${raw}`;
  let section: string | null = null;
  const q = raw.indexOf('?');
  if (q !== -1) {
    const query = raw.slice(q + 1);
    raw = raw.slice(0, q);
    const params = new URLSearchParams(query);
    section = params.get('section');
  }
  if (raw.length > 1 && raw.endsWith('/')) raw = raw.slice(0, -1);
  const segments = raw.split('/').filter((s) => s.length > 0);
  return { path: raw, segments, section };
}

const LIVE_TAB_IDS: LiveTab[] = ['feed', 'repos', 'pulls', 'ci', 'agents'];

function asLiveTab(value: string | undefined): LiveTab {
  return LIVE_TAB_IDS.find((t) => t === value) ?? 'feed';
}

/** Resolve a raw hash to the view, the Live sub-tab and the in-page section. */
export function matchRoute(hash: string): RouteMatch {
  const { path, segments, section } = parseHash(hash);
  const head = segments[0];
  if (head === undefined) return { view: 'home', liveTab: 'feed', section, path };
  if (head === 'product') return { view: 'product', liveTab: 'feed', section, path };
  if (head === 'reports') return { view: 'reports', liveTab: 'feed', section, path };
  if (head === 'developers') return { view: 'developers', liveTab: 'feed', section, path };
  if (head === 'admin') return { view: 'admin', liveTab: 'feed', section, path };
  if (head === 'live') return { view: 'live', liveTab: asLiveTab(segments[1]), section, path };
  return { view: 'notfound', liveTab: 'feed', section, path };
}

/** Which top-menu category should read as current for a given view. */
export function activeCategory(view: ViewId): CategoryId | null {
  if (view === 'product' || view === 'live' || view === 'reports' || view === 'developers') {
    return view;
  }
  return null;
}
