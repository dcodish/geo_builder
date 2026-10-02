/**
 * The META-lock for the segment-display checks (#1653, docs/28 §5c rule 5).
 *
 * Every builder's thin lock calls `segmentDisplayFaults`, so a check that silently stops checking turns
 * them all into tests that prove nothing. This runs the SAME function against deliberately broken builders
 * and asserts each fault is caught — including the two the issue's locks name: a hide that takes the
 * segment out of the figure (unmeasurable), and a dash that a save file forgets.
 */
import { describe, expect, it } from 'vitest';
import { segInk, toggleSegFlag, type SegDisplayMap } from '../frame/segmentDisplay';
import { segmentDisplayFaults, type InkSeen, type SegmentDisplaySubject } from './fixtures/segment-display-rows';

type Bug = 'hide-inks' | 'hide-drops' | 'hide-unmeasurable' | 'undo-misses' | 'dash-not-saved' | 'hidden-not-saved' | 'unhide-forgets-dash' | 'show-stuck' | 'dash-no-op';

/** A miniature builder: one segment AB, a statement list, a display map, a history of display maps. */
function stub(bug?: Bug, undoable = true): SegmentDisplaySubject {
  let facts: string[] = [];
  let style: SegDisplayMap = {};
  const past: SegDisplayMap[] = [];
  const set = (next: SegDisplayMap) => {
    past.push(style);
    style = next;
  };
  return {
    setup: () => {
      facts = ['A(0,0)', 'B(4,0)', 'segment AB'];
      style = {};
      past.length = 0;
    },
    toggleHidden: () => {
      if (bug === 'show-stuck' && style.AB?.hidden) return;
      let next = toggleSegFlag(style, 'AB', 'hidden');
      if (bug === 'unhide-forgets-dash' && !next.AB?.hidden) next = {};
      set(next);
      if (bug === 'hide-drops') facts = next.AB?.hidden ? facts.slice(0, 2) : ['A(0,0)', 'B(4,0)', 'segment AB'];
    },
    toggleDashed: () => {
      if (bug !== 'dash-no-op') set(toggleSegFlag(style, 'AB', 'dashed'));
    },
    ink: (): InkSeen => {
      const ink = segInk(style.AB);
      return bug === 'hide-inks' && ink === 'ghost' ? 'solid' : ink;
    },
    measurable: () => !(bug === 'hide-unmeasurable' && style.AB?.hidden),
    statements: () => [...facts],
    ...(undoable
      ? {
          undo: () => {
            if (bug === 'undo-misses') return;
            const prev = past.pop();
            if (prev) style = prev;
          },
        }
      : {}),
    saveLoad: () => {
      const saved = JSON.parse(JSON.stringify(style)) as SegDisplayMap;
      if (bug === 'dash-not-saved') for (const k of Object.keys(saved)) delete saved[k].dashed;
      if (bug === 'hidden-not-saved') for (const k of Object.keys(saved)) delete saved[k].hidden;
      style = saved;
      past.length = 0;
    },
  };
}

describe('#1653 — the shared segment-display checks really check', () => {
  it('a conforming builder reports no faults — with an undoable display choice and without one', () => {
    expect(segmentDisplayFaults(stub())).toEqual([]);
    expect(segmentDisplayFaults(stub(undefined, false))).toEqual([]);
  });

  it.each([
    ['hide-inks', /a hidden segment is still inked/],
    ['hide-drops', /hiding a segment changed the statements/],
    ['hide-unmeasurable', /no longer measurable/],
    ['undo-misses', /one undo after a hide did not draw the segment again/],
    ['dash-not-saved', /a dashed segment came back «solid» after save → load/],
    ['hidden-not-saved', /a hidden segment came back inked/],
    ['unhide-forgets-dash', /lost its dash|came back «solid»/],
    ['show-stuck', /«show» after a hide did not draw/],
    ['dash-no-op', /«dashed» did not dash/],
  ] as const)('CATCHES a builder whose bug is %s', (bug, fault) => {
    expect(segmentDisplayFaults(stub(bug)).join(' | ')).toMatch(fault);
  });
});
