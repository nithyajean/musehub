import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { navigate, useHashLocation } from '../hooks/useHashLocation';
import { useScrolled } from '../hooks/useScrolled';
import { useTheme } from '../hooks/useTheme';
import { MENU, activeCategory } from '../routes';
import { toggleLabel } from '../theme';
import { CommandPalette, isApplePlatform } from './CommandPalette';
import { Icon } from './Icons';

function focusItem(container: HTMLElement | null, index: number): void {
  const items = container?.querySelectorAll<HTMLAnchorElement>('a.submenu-item');
  items?.[index]?.focus();
}

/** The category top-menu: hover, focus and tap open the submenus, Escape and
 * arrow keys work, outside click and route change close. ⌘K opens the palette. */
export function Header() {
  const route = useHashLocation();
  const { theme, toggle } = useTheme();
  const scrolled = useScrolled(8);
  const [openIndex, setOpenIndex] = useState(-1);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const active = activeCategory(route.view);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the menus on any route change, not on a value the effect reads
  useEffect(() => {
    setOpenIndex(-1);
    setMobileOpen(false);
  }, [route.view, route.liveTab, route.section]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenIndex(-1);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === 'k';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    if (mobileOpen) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function onTriggerKey(e: ReactKeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpenIndex(idx);
      const li = (e.currentTarget as HTMLElement).closest('li');
      const submenu = li?.querySelector<HTMLElement>('.submenu') ?? null;
      requestAnimationFrame(() => focusItem(submenu, 0));
    } else if (e.key === 'Escape') {
      setOpenIndex(-1);
    }
  }

  function onItemKey(e: ReactKeyboardEvent<HTMLAnchorElement>) {
    const anchor = e.currentTarget;
    const catLi = anchor.closest('li.nav-cat');
    const submenu = catLi?.querySelector<HTMLElement>('.submenu') ?? null;
    const items = Array.from(submenu?.querySelectorAll<HTMLAnchorElement>('a.submenu-item') ?? []);
    const trigger = catLi?.querySelector<HTMLButtonElement>('button.nav-trigger') ?? null;
    const cur = items.indexOf(anchor);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[Math.min(items.length - 1, cur + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cur <= 0) trigger?.focus();
      else items[cur - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpenIndex(-1);
      trigger?.focus();
    }
  }

  const modKey = isApplePlatform() ? '⌘' : 'Ctrl';

  return (
    <header className={`site-header ${scrolled || mobileOpen ? 'is-scrolled' : ''}`} ref={navRef}>
      <button
        type="button"
        className="skip-link"
        onClick={() => document.getElementById('main-content')?.focus()}
      >
        Skip to content
      </button>
      <div className="header-inner">
        <a className="brand" href="#/" aria-label="MuseHub home">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="agent" size={18} />
          </span>
          <span className="brand-name">MuseHub</span>
        </a>

        <nav className="nav-cats" aria-label="Primary">
          <ul>
            {MENU.map((cat, idx) => (
              <li
                className={`nav-cat ${openIndex === idx ? 'is-open' : ''}`}
                key={cat.id}
                onMouseEnter={() => setOpenIndex(idx)}
                onMouseLeave={() => setOpenIndex(-1)}
                onFocus={() => setOpenIndex(idx)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenIndex(-1);
                }}
              >
                <button
                  type="button"
                  className={`nav-trigger ${active === cat.id ? 'is-active' : ''}`}
                  aria-haspopup="true"
                  aria-expanded={openIndex === idx}
                  onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
                  onKeyDown={(e) => onTriggerKey(e, idx)}
                >
                  {cat.label}
                  <Icon name="chevron" size={14} className="nav-caret" />
                </button>
                <div className="submenu">
                  <ul aria-label={cat.label}>
                    {cat.items.map((item) => (
                      <li key={item.to}>
                        <a
                          className="submenu-item"
                          href={item.to}
                          onClick={() => setOpenIndex(-1)}
                          onKeyDown={onItemKey}
                        >
                          <span className="submenu-label">{item.label}</span>
                          <span className="submenu-desc">{item.desc}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="cmd-hint"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open the jump palette"
          >
            <Icon name="search" size={14} />
            <span>Jump to</span>
            <span className="kbd">{modKey} K</span>
          </button>
          <button
            type="button"
            className="icon-btn theme-toggle"
            onClick={(e) => toggle({ clientX: e.clientX, clientY: e.clientY })}
            aria-pressed={theme === 'dark'}
            aria-label={toggleLabel(theme)}
            title={toggleLabel(theme)}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          <a className="btn btn-primary watch-cta" href="#/live/feed">
            <span className="pulse-dot" aria-hidden="true" />
            Watch live
          </a>
          <a className="btn btn-ghost admin-link" href="#/admin">
            <Icon name="lock" size={14} />
            Admin
          </a>
          <button
            type="button"
            className="icon-btn nav-burger"
            aria-label="Menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? (
              <Icon name="x" size={18} />
            ) : (
              <span className="burger" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </button>
        </div>

        {mobileOpen ? (
          <div className="mobile-panel" id="mobile-menu">
            <nav aria-label="Mobile navigation">
              {MENU.map((cat) => (
                <div className="m-group" key={cat.id}>
                  <p className="m-title">{cat.label}</p>
                  <ul>
                    {cat.items.map((item) => (
                      <li key={item.to}>
                        <a href={item.to} onClick={() => setMobileOpen(false)}>
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="m-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setMobileOpen(false);
                    navigate('#/live/feed');
                  }}
                >
                  <span className="pulse-dot" aria-hidden="true" />
                  Watch live
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setMobileOpen(false);
                    navigate('#/admin');
                  }}
                >
                  <Icon name="lock" size={14} />
                  Admin
                </button>
              </div>
            </nav>
          </div>
        ) : null}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
