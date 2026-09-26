import { describe, expect, it } from 'vitest';
import { MENU, activeCategory, matchRoute, parseHash } from './routes';

describe('hash parsing', () => {
  it('splits a live sub-route', () => {
    const p = parseHash('#/live/feed');
    expect(p.path).toBe('/live/feed');
    expect(p.segments).toEqual(['live', 'feed']);
    expect(p.section).toBeNull();
  });

  it('reads the section from a query', () => {
    const p = parseHash('#/product?section=lifecycle');
    expect(p.path).toBe('/product');
    expect(p.section).toBe('lifecycle');
  });

  it('normalizes an empty or root hash to /', () => {
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#/').path).toBe('/');
    expect(parseHash('#/').segments).toEqual([]);
  });

  it('drops a trailing slash', () => {
    expect(parseHash('#/live/').path).toBe('/live');
  });
});

describe('route matching', () => {
  it('maps the home route', () => {
    expect(matchRoute('#/').view).toBe('home');
  });

  it('defaults live to the feed tab', () => {
    const m = matchRoute('#/live');
    expect(m.view).toBe('live');
    expect(m.liveTab).toBe('feed');
  });

  it('reads a live sub-tab', () => {
    expect(matchRoute('#/live/pulls').liveTab).toBe('pulls');
    expect(matchRoute('#/live/ci').liveTab).toBe('ci');
  });

  it('falls back to feed for an unknown live tab', () => {
    expect(matchRoute('#/live/nope').liveTab).toBe('feed');
  });

  it('maps the content routes', () => {
    expect(matchRoute('#/product').view).toBe('product');
    expect(matchRoute('#/reports').view).toBe('reports');
    expect(matchRoute('#/developers').view).toBe('developers');
    expect(matchRoute('#/admin').view).toBe('admin');
  });

  it('marks an unknown route not found', () => {
    expect(matchRoute('#/nope').view).toBe('notfound');
  });
});

describe('menu taxonomy', () => {
  it('has four categories, each with items', () => {
    expect(MENU).toHaveLength(4);
    for (const cat of MENU) expect(cat.items.length).toBeGreaterThan(0);
  });

  it('maps a view to its category', () => {
    expect(activeCategory('live')).toBe('live');
    expect(activeCategory('reports')).toBe('reports');
    expect(activeCategory('home')).toBeNull();
    expect(activeCategory('admin')).toBeNull();
  });
});
