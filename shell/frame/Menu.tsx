/**
 * The `⋯` overflow menu — docs/28 §4a D4: title, figure name and the switcher stay visible;
 * save / load / export / language / guide / about collapse into this menu. One extra click for
 * save/load is the ruled, accepted cost.
 *
 * Item labels arrive translated from the caller; the menu owns only the mechanics (open state,
 * outside-click and Escape close, menu roles).
 */
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { color, fs, radius } from '../theme';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
}

export function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }) {
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

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        style={trigger}
      >
        ⋯
      </button>
      {open && (
        <div role="menu" style={popup}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              style={itemBtn}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const trigger: CSSProperties = {
  fontSize: fs.control,
  fontWeight: 700,
  lineHeight: 1.2,
  padding: '6px 10px',
  border: `1px solid ${color.borderStrong}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  cursor: 'pointer',
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
const itemBtn: CSSProperties = {
  textAlign: 'start',
  fontSize: fs.body,
  padding: '7px 10px',
  border: 'none',
  borderRadius: radius.control,
  background: 'transparent',
  color: color.ink,
  cursor: 'pointer',
};
