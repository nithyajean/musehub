import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../hooks/useHashLocation';
import { MENU } from '../routes';
import { Icon, type IconName } from './Icons';

interface Entry {
  label: string;
  desc: string;
  to: string;
  cat: string;
  icon: IconName;
}

const CAT_ICON: Record<string, IconName> = {
  Product: 'layers',
  Live: 'bolt',
  Reports: 'chart',
  Developers: 'terminal',
  Admin: 'lock',
  Home: 'agent',
};

function buildEntries(): Entry[] {
  const out: Entry[] = [
    { label: 'Home', desc: 'The forge front page', to: '#/', cat: 'Home', icon: 'agent' },
  ];
  for (const cat of MENU) {
    for (const item of cat.items) {
      out.push({
        label: item.label,
        desc: item.desc,
        to: item.to,
        cat: cat.label,
        icon: CAT_ICON[cat.label] ?? 'dot',
      });
    }
  }
  out.push({
    label: 'Admin',
    desc: 'The gated surface where a human acts on the forge',
    to: '#/admin',
    cat: 'Admin',
    icon: 'lock',
  });
  return out;
}

const ENTRIES = buildEntries();

function matches(entry: Entry, q: string): boolean {
  if (!q) return true;
  const hay = `${entry.label} ${entry.desc} ${entry.cat}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Detect ⌘ on Apple platforms for the hint label only. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');
}

/**
 * A jump-anywhere palette on ⌘K / Ctrl+K. Filters every route the top menu
 * knows about, arrow keys move, Enter navigates, Escape closes. Focus returns
 * to whatever had it before the palette opened.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const results = useMemo(() => ENTRIES.filter((e) => matches(e, q)), [q]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    setQ('');
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the cursor when the query changes
  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    if (active < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>('.cmdk-item.is-active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  function go(entry: Entry) {
    onClose();
    navigate(entry.to);
  }

  function onKey(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      const hit = results[active];
      if (hit) {
        e.preventDefault();
        go(hit);
      }
    }
  }

  let lastCat = '';

  return (
    <div
      className="cmdk-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog open className="cmdk" aria-modal="true" aria-label="Jump to a page" onKeyDown={onKey}>
        <div className="cmdk-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a page or a section…"
            aria-label="Search pages"
            aria-controls="cmdk-results"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="cmdk-list" id="cmdk-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="cmdk-empty">Nothing matches “{q}”.</div>
          ) : (
            results.map((r, i) => {
              const showCat = r.cat !== lastCat;
              lastCat = r.cat;
              return (
                <div key={r.to}>
                  {showCat ? <div className="cmdk-group">{r.cat}</div> : null}
                  <button
                    type="button"
                    aria-current={i === active ? 'true' : undefined}
                    className={`cmdk-item ${i === active ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                  >
                    <span className="cmdk-item-icon">
                      <Icon name={r.icon} size={15} />
                    </span>
                    <span className="cmdk-item-text">
                      <span className="cmdk-item-label">{r.label}</span>
                      <span className="cmdk-item-desc">{r.desc}</span>
                    </span>
                    <span className="cmdk-item-cat">{r.to.replace('#', '')}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="cmdk-foot">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> move
          </span>
          <span>
            <span className="kbd">↵</span> open
          </span>
          <span>
            <span className="kbd">esc</span> close
          </span>
        </div>
      </dialog>
    </div>
  );
}
