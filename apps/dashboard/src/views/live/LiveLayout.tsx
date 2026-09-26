import type { ForgeData } from '../../api/types';
import { SourceBadge } from '../../components/Badges';
import { LiveLostNote, LoadingBlock } from '../../components/States';
import { useForgeView } from '../../hooks/useForgeData';
import { useNow } from '../../hooks/useHashLocation';
import { LIVE_TABS, type LiveTab } from '../../routes';
import { Agents } from './Agents';
import { CiStatus } from './CiStatus';
import { Feed } from './Feed';
import { PullRequests } from './PullRequests';
import { Repositories } from './Repositories';

function renderTab(tab: LiveTab, forge: ForgeData, now: number) {
  switch (tab) {
    case 'feed':
      return <Feed forge={forge} now={now} />;
    case 'repos':
      return <Repositories forge={forge} now={now} />;
    case 'pulls':
      return <PullRequests forge={forge} now={now} />;
    case 'ci':
      return <CiStatus forge={forge} now={now} />;
    case 'agents':
      return <Agents forge={forge} now={now} />;
  }
}

/** The observability dashboard shell: sub-tab nav, the honest source label, one
 * loading and one live-lost state shared by every view underneath. */
export function LiveLayout({ tab }: { tab: LiveTab }) {
  const view = useForgeView();
  const now = useNow();
  return (
    <div className="wrap live">
      <div className="live-top">
        <div className="live-title">
          <h1>Live</h1>
          <SourceBadge source={view.source} liveError={view.liveError} />
        </div>
        <nav className="subtabs" aria-label="Dashboard views">
          {LIVE_TABS.map((t) => (
            <a
              key={t.id}
              href={`#/live/${t.id}`}
              className={t.id === tab ? 'is-active' : ''}
              aria-current={t.id === tab ? 'page' : undefined}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </div>
      <LiveLostNote show={view.liveError} />
      {view.phase === 'loading' || view.forge === null ? (
        <LoadingBlock rows={6} label="Loading the forge" />
      ) : (
        renderTab(tab, view.forge, now)
      )}
    </div>
  );
}
