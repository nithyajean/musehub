import { useEffect } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { EmptyState } from './components/States';
import { useHashLocation } from './hooks/useHashLocation';
import type { RouteMatch } from './routes';
import { Admin } from './views/Admin';
import { Developers } from './views/Developers';
import { Home } from './views/Home';
import { Product } from './views/Product';
import { Reports } from './views/Reports';
import { LiveLayout } from './views/live/LiveLayout';

function NotFound() {
  return (
    <div className="wrap page">
      <EmptyState
        title="Page not found"
        hint="That route does not exist. Head back to the forge."
        icon="search"
      />
      <p className="center">
        <a className="btn btn-primary" href="#/">
          Go home
        </a>
      </p>
    </div>
  );
}

function View({ route }: { route: RouteMatch }) {
  switch (route.view) {
    case 'home':
      return <Home />;
    case 'product':
      return <Product />;
    case 'live':
      return <LiveLayout tab={route.liveTab} />;
    case 'reports':
      return <Reports />;
    case 'developers':
      return <Developers />;
    case 'admin':
      return <Admin />;
    default:
      return <NotFound />;
  }
}

/** Scroll to the top on a route change or to the deep-linked section below the
 * opaque header (the section carries scroll-margin-top in CSS). */
function useScrollBehavior(route: RouteMatch) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on any view or tab change, not only when the section is read
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
    if (route.section) {
      const el = document.getElementById(`sec-${route.section}`);
      if (el) {
        el.scrollIntoView({ behavior, block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior });
  }, [route.view, route.liveTab, route.section]);
}

export function App() {
  const route = useHashLocation();
  useScrollBehavior(route);
  return (
    <>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <View route={route} />
      </main>
      <Footer />
    </>
  );
}
