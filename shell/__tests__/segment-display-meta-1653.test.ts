/**
 * The META-lock for the segment-display checks (#1653, docs/28 §5c rule 5).
 *
 * Every builder's thin lock calls `segmentDisplayFaults`, so a check that silently stops checking turns
 * them all into tests that prove nothing. This runs the SAME function against deliberately broken builders
 * and asserts each fault is caught — including the two the issue's locks name: a hide that takes the
 * segment out of the figure (unmeasurable), and a dash that a save file forgets.
 */
import { describe, expect, it } from 'vitest';
import { hiddenWith, segInk, toggleSegFlag, type HideScene, type SegDisplayMap } from '../frame/segmentDisplay';
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

/**
 * #2852 — what a hidden segment takes with it: its value, its knee and its ticks, and an endpoint the tool named that
 * nothing else holds. Never a point the student named, never one another drawn segment, mark or value touches.
 */
describe('#2852 — hiddenWith: a hidden segment takes what exists only for it', () => {
  // the operator's rhombus: sides AB BC CD DA, the height DH with its «4.8» and the knee at H; H is the tool's letter
  const rhombus = (over: Partial<HideScene> = {}): HideScene => ({
    hidden: [['D', 'H']],
    drawn: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['A', 'D']],
    values: [['A', 'B'], ['H', 'D']],
    knees: [{ v: 'H', arms: ['D', 'A', 'B'] }],
    ticks: [],
    marked: [],
    lone: new Set(['H']),
    ...over,
  });

  it('the height hidden: its value, its knee and its foot H go; the side’s value stays', () => {
    const w = hiddenWith(rhombus());
    expect(w.values).toEqual([false, true]);
    expect(w.knees).toEqual([true]);
    expect([...w.points]).toEqual(['H']);
  });

  it('nothing hidden takes nothing', () => {
    const w = hiddenWith(rhombus({ hidden: [], drawn: [['A', 'B'], ['D', 'H']] }));
    expect(w).toEqual({ values: [false, false], knees: [false], ticks: [], points: new Set() });
  });

  it('a point the student named stays (H not lone)', () => {
    expect(hiddenWith(rhombus({ lone: new Set() })).points.size).toBe(0);
  });

  it('a lone point another drawn segment ends at stays', () => {
    expect(hiddenWith(rhombus({ drawn: [['A', 'B'], ['H', 'B']] })).points.size).toBe(0);
  });

  it('a lone point a kept mark or value touches stays — another knee, another length, an angle', () => {
    expect(hiddenWith(rhombus({ knees: [{ v: 'H', arms: ['D'] }, { v: 'H', arms: ['C', 'A'] }] })).points.size).toBe(0);
    expect(hiddenWith(rhombus({ values: [['H', 'C']] })).points.size).toBe(0);
    expect(hiddenWith(rhombus({ marked: ['H'] })).points.size).toBe(0);
  });

  it('hiding AB in triangle ABC takes AB’s value only — A and B stay', () => {
    const w = hiddenWith({ hidden: [['A', 'B']], drawn: [['B', 'C'], ['A', 'C']], values: [['B', 'A']], knees: [], ticks: [['A', 'B'], ['B', 'C']], marked: [], lone: new Set() });
    expect(w.values).toEqual([true]);
    expect(w.ticks).toEqual([true, false]);
    expect(w.points.size).toBe(0);
  });

  it('a knee whose arms run along other segments stays', () => {
    const w = hiddenWith({ hidden: [['A', 'B']], drawn: [['B', 'C'], ['A', 'C']], values: [], knees: [{ v: 'C', arms: ['A', 'B'] }], ticks: [], marked: [], lone: new Set() });
    expect(w.knees).toEqual([false]);
  });
});
