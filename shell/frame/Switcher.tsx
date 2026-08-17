/**
 * The product switcher — a dropdown of builders, rendered from DATA handed in by the caller
 * (docs/28 §4: "the roster of builders is configuration — handed in by the caller"; `shell/` may
 * not import a product tree, a forbidden edge in BOUNDARIES.json). A dropdown, not a tab strip —
 * "4 or maybe even more builders" is exactly what a tab strip fails at (D4).
 *
 * With fewer than two entries there is nothing to switch to and the control renders nothing —
 * which is also its A1 state: the component ships here, and A2's machine-readable registry
 * (#661) is what lights it, so the roster is never a hand-rolled list that drifts.
 */
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { color, fs, radius } from '../theme';

export interface RosterEntry {
  id: string;
  /** Translated display name — the caller resolves its own labelKey. */
  label: string;
  url: string;
}

export function ProductSwitcher({ roster, activeId }: { roster: RosterEntry[]; activeId: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (roster.length < 2) return null;
  const active = roster.find((r) => r.id === activeId);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={trigger}
      >
        {active?.label ?? activeId} ▾
      </button>
      {open && (
        <div role="menu" style={popup}>
          {roster.map((entry) => (
            <a
              key={entry.id}
              role="menuitem"
              href={entry.url}
              aria-current={entry.id === activeId ? 'page' : undefined}
              style={entry.id === activeId ? { ...itemLink, ...activeLink } : itemLink}
            >
              {entry.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const trigger: CSSProperties = {
  fontSize: fs.body,
  padding: '6px 10px',
  border: `1px solid ${color.borderStrong}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const popup: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  insetInlineEnd: 0,
  minWidth: 170,
  display: 'flex',
  flexDirection: 'column',
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
  padding: 4,
  zIndex: 50,
};
const itemLink: CSSProperties = {
  fontSize: fs.body,
  padding: '7px 10px',
  borderRadius: radius.control,
  color: color.ink,
  textDecoration: 'none',
};
const activeLink: CSSProperties = {
  color: color.primaryInk,
  background: color.primarySoft,
  fontWeight: 600,
};
