/**
 * THE SEGMENT MENU (#1653) — click a segment: hide or show it, make it dashed or solid.
 *
 * Operator, 2026-10-02: *"in the analytic tool we dont have an option to click on a segment and hide it
 * like we have in 2d"*. This is 2-D's on-canvas segment menu (FR-RN-10), moved here unchanged in
 * behaviour and look so every builder renders the same one — the third-copy rule that put the letter
 * popover in `shell/` (#1631, ADR-W-105) — [ADR-W-106](../../docs/06w-decisions-workspace.md#adr-w-106).
 *
 * Parameterized by the caller (ADR-W-016 rule 2): the position, the title (the segment's name), its
 * current display state, the two toggles as callbacks, every string, and `children` for the product's own
 * items (2-D: «החליפו קצוות»; analytic: the #1048 measure entries). It imports no product tree and no
 * i18n, and never asks which product it is in. What it offers is {@link segmentMenuItems}, the function
 * the locks call.
 *
 * Every toggle CLOSES the menu (2-D's behaviour): the student sees the result on the canvas at once.
 * A click outside closes it too, through the transparent backdrop.
 */
import type { ReactNode } from 'react';
import { color } from '../theme';
import { letterPopoverBtn } from './LetterPopover';
import { segmentMenuItems, type SegDisplay } from './segmentDisplay';

export interface SegmentMenuStrings {
  /** «הסתירו קטע» */
  hide: string;
  /** «הציגו קטע» */
  show: string;
  /** «מקווקו» */
  dashed: string;
  /** «רציף» */
  solid: string;
}

export interface SegmentMenuProps {
  /** the anchor, in px of the positioned container the menu is drawn in (the click point) */
  x: number;
  y: number;
  /** that container's size — the menu is clamped inside it */
  bounds: { width: number; height: number };
  /** the header line — the segment's name («AB») */
  title: ReactNode;
  /** the segment's display state as the product stores it */
  state: SegDisplay;
  /** absent = no hide/show entry */
  onToggleHidden?: () => void;
  /** absent = no dashed/solid entry */
  onToggleDashed?: () => void;
  strings: SegmentMenuStrings;
  onClose: () => void;
  /** the product's own extra items, below the display entries */
  children?: ReactNode;
  testId?: string;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function SegmentMenu({ x, y, bounds, title, state, onToggleHidden, onToggleDashed, strings, onClose, children, testId }: SegmentMenuProps) {
  const items = segmentMenuItems(state, { hide: !!onToggleHidden, dash: !!onToggleDashed });
  return (
    <>
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
      <div
        data-testid={testId}
        role="menu"
        style={{
          position: 'absolute',
          // PHYSICAL `left`, not `insetInlineStart` (2-D F1/REN-1): `x` is a left-based canvas pixel, and
          // under the Hebrew-default `dir=rtl` a logical inset resolves to `right` — the menu would open
          // MIRRORED, far from the clicked segment.
          left: clamp(x + 8, 0, Math.max(0, bounds.width - 150)),
          top: clamp(y + 8, 0, Math.max(0, bounds.height - 80)),
          background: color.surface,
          border: `1px solid ${color.borderStrong}`,
          borderRadius: 8,
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 10,
          minWidth: 132,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{title}</div>
        {items.map((it) => (
          <button
            key={it.flag}
            type="button"
            role="menuitem"
            data-testid={testId ? `${testId}-${it.flag}` : undefined}
            style={{ ...letterPopoverBtn, textAlign: 'start' }}
            onClick={() => {
              (it.flag === 'hidden' ? onToggleHidden : onToggleDashed)?.();
              onClose();
            }}
          >
            {strings[it.label]}
          </button>
        ))}
        {children}
      </div>
    </>
  );
}
