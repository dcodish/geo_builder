/**
 * THE WORKBENCH — one three-zone layout for every builder (#734; the operator, comparing the three
 * opening pages: *"I want them to really look the same... the fact that they look different tells
 * me that maybe they are different code, and maybe that's wrong."* It was: each product laid out
 * its own columns with its own widths and its own empty-state placement. This component owns the
 * GEOMETRY; the products pass zone CONTENT only.)
 *
 * The three zones, in the D1 semantics: **input** (things I said — the input area + the fact
 * list), **canvas** (the figure: name, drawing surface, figure actions), **data** (the נתונים
 * panel). Under RTL the input column sits at the reading start (right), the data column at the
 * end (left) — order is logical, so LTR mirrors by itself.
 *
 * One page, no scrolling (the B2 acceptance criterion): the workbench is a viewport-height row
 * under the frame's bars; the columns scroll INTERNALLY; the canvas card takes the remaining
 * width and height. `emptyOverlay` is the ONE empty-state slot — rendered centered over the
 * canvas area (the products pass their QuickChips), so the inviting first click sits in the same
 * place in every tool.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { color } from '../theme';

/** The one breakpoint every builder shares: below it the workbench STACKS (canvas → input →
 *  data) and the page scrolls natively — three fixed columns on a phone collapse into slivers
 *  (operator: "on mobile the sites look crap"). The desktop no-scroll ruling applies to
 *  desktops; a stacked phone page scrolls by nature. */
const NARROW_QUERY = '(max-width: 900px)';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export interface WorkbenchProps {
  /** Content of the input column (input card, fact list card, …). */
  inputZone: ReactNode;
  /** Content of the canvas CARD (name field, toolbar, the drawing surface, figure actions). */
  canvasZone: ReactNode;
  /** Content of the data column (the נתונים panel card). */
  dataZone: ReactNode;
  /** The empty-state (QuickChips), centered OVER the canvas area; null/undefined = none. */
  emptyOverlay?: ReactNode;
  /** Height taken by the frame's bars, so the workbench fills the rest of the viewport. */
  barsHeight?: number;
}

export function Workbench({ inputZone, canvasZone, dataZone, emptyOverlay, barsHeight = 126 }: WorkbenchProps) {
  const narrow = useNarrow();

  if (narrow) {
    // STACKED (phone/tablet-portrait): the figure first, then what-I-said, then the data —
    // full-width cards, native page scroll.
    return (
      <div style={stackPage}>
        <section style={{ ...canvasCard, minHeight: '58vh', flex: 'none' }}>
          {canvasZone}
          {emptyOverlay != null && (
            <div style={overlay}>
              <div style={{ pointerEvents: 'auto' }}>{emptyOverlay}</div>
            </div>
          )}
        </section>
        <div style={stackZone}>{inputZone}</div>
        <div style={stackZone}>{dataZone}</div>
      </div>
    );
  }

  return (
    <div style={{ ...page, height: `calc(100vh - ${barsHeight}px)` }}>
      <div style={row}>
        <aside style={inputCol}>{inputZone}</aside>
        <section style={canvasCard}>
          {canvasZone}
          {emptyOverlay != null && (
            <div style={overlay}>
              <div style={{ pointerEvents: 'auto' }}>{emptyOverlay}</div>
            </div>
          )}
        </section>
        <aside style={dataCol}>{dataZone}</aside>
      </div>
    </div>
  );
}

/** The SHARED zone geometry — the numbers every tool renders with. Exported for the parity lock. */
export const WORKBENCH_GEOMETRY = {
  inputWidth: 'min(380px, 30%)',
  dataWidth: 'min(340px, 26%)',
  gap: 18,
  pagePadding: '14px 20px 16px',
} as const;

const page: CSSProperties = {
  overflow: 'hidden',
  padding: WORKBENCH_GEOMETRY.pagePadding,
  color: color.ink,
  display: 'flex',
  flexDirection: 'column',
};
const stackPage: CSSProperties = {
  padding: '10px 12px 24px',
  color: color.ink,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};
const stackZone: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const row: CSSProperties = { display: 'flex', gap: WORKBENCH_GEOMETRY.gap, alignItems: 'stretch', flex: 1, minHeight: 0 };
const cardBase: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};
const inputCol: CSSProperties = {
  width: WORKBENCH_GEOMETRY.inputWidth,
  flexShrink: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  paddingInlineEnd: 4,
};
const dataCol: CSSProperties = {
  width: WORKBENCH_GEOMETRY.dataWidth,
  flexShrink: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const canvasCard: CSSProperties = {
  ...cardBase,
  flex: 1,
  minWidth: 320,
  minHeight: 0,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  position: 'relative',
};
const overlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  padding: 24,
  zIndex: 3,
};
