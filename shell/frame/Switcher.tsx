/**
 * The product switcher — a VISIBLE segmented builder strip (docs/28 §4a D4 as amended by #706,
 * operator ruling 2026-08-17 on full-page mockups): every builder inline with its icon, the active
 * one filled. The original D4 dropdown was ruled *"something a user will easily miss"* — and the
 * dropdown's own scale argument ("4 or maybe even more builders") is answered by DEGRADATION, not
 * by hiding: past `MAX_INLINE`, the tail folds into one overflow segment («עוד ▾», label supplied
 * by the caller — shell/ holds no strings).
 *
 * Still data-driven, never import-driven (docs/28 §4): the roster arrives from the caller, who
 * renders A2's registry (`products.json`, ADR-W-021). `shell/` may not import a product tree.
 */
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { color, fs } from '../theme';

export interface RosterEntry {
  id: string;
  /** Translated display name — the caller resolves its own labelKey. */
  label: string;
  url: string;
  /** Optional glyph shown before the label (the registry's `icon`; curated later by admin config). */
  icon?: string;
}

/** How many builders render inline before the tail folds. */
export const MAX_INLINE = 4;

/**
 * The fold rule, pure and testable: with ≤ max entries everything is inline and nothing folds;
 * past that, the strip keeps registry ORDER (A3 curates it later), shows the first `max − 1`
 * entries, and folds the rest — except that the ACTIVE builder is always visible: when it lives in
 * the tail it takes the last inline slot and the displaced entry folds instead.
 */
export function stripSlices(
  roster: RosterEntry[],
  activeId: string,
  max: number = MAX_INLINE,
): { inline: RosterEntry[]; folded: RosterEntry[] } {
  if (roster.length <= max) return { inline: roster, folded: [] };
  const inline = roster.slice(0, max - 1);
  const folded = roster.slice(max - 1);
  const activeInTail = folded.findIndex((e) => e.id === activeId);
  if (activeInTail >= 0) {
    const displaced = inline.pop();
    const [active] = folded.splice(activeInTail, 1);
    inline.push(active);
    if (displaced) folded.unshift(displaced);
  }
  return { inline, folded };
}

const display = (entry: RosterEntry) => (entry.icon ? `${entry.icon} ${entry.label}` : entry.label);

export function ProductSwitcher({
  roster,
  activeId,
  ariaLabel,
  moreLabel,
}: {
  roster: RosterEntry[];
  activeId: string;
  /** Accessible name for the strip (e.g. «מעבר בין הבונים») — the caller's string. */
  ariaLabel?: string;
  /** The fold segment's label (e.g. «עוד») — needed only once the roster outgrows MAX_INLINE. */
  moreLabel?: string;
}) {
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
  const { inline, folded } = stripSlices(roster, activeId);

  return (
    <nav ref={rootRef} aria-label={ariaLabel} style={strip}>
      {inline.map((entry) =>
        entry.id === activeId ? (
          <span key={entry.id} aria-current="page" style={{ ...seg, ...segActive }}>
            {display(entry)}
          </span>
        ) : (
          <a key={entry.id} href={entry.url} style={seg}>
            {display(entry)}
          </a>
        ),
      )}
      {folded.length > 0 && (
        <span style={{ position: 'relative' }}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            style={{ ...seg, border: 'none', cursor: 'pointer', background: 'transparent' }}
          >
            {moreLabel ?? '…'} ▾
          </button>
          {open && (
            <span role="menu" style={popup}>
              {folded.map((entry) => (
                <a key={entry.id} role="menuitem" href={entry.url} style={itemLink}>
                  {display(entry)}
                </a>
              ))}
            </span>
          )}
        </span>
      )}
    </nav>
  );
}

const strip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  background: color.surface,
  border: `1px solid ${color.borderStrong}`,
  borderRadius: 999,
  padding: 4,
};
const seg: CSSProperties = {
  fontSize: fs.body,
  padding: '7px 14px',
  borderRadius: 999,
  color: color.muted,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  lineHeight: 1.2,
};
const segActive: CSSProperties = {
  background: color.primary,
  color: '#fff',
  fontWeight: 600,
};
const popup: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  insetInlineEnd: 0,
  minWidth: 170,
  display: 'flex',
  flexDirection: 'column',
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
  padding: 4,
  zIndex: 50,
};
const itemLink: CSSProperties = {
  fontSize: fs.body,
  padding: '7px 10px',
  borderRadius: 8,
  color: color.ink,
  textDecoration: 'none',
};
