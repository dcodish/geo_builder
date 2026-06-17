/**
 * Phase-3 acceptance gate (docs/09-implementation-plan.md §Phase 3).
 * Fact-list store: replay pipeline, keep-prior-on-error, undo/redo, clear,
 * alternatives, and per-fact select/deselect/delete (ADR-010). Plus i18n
 * key-parity. The engine is exercised through the store exactly as the UI drives it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Command } from '@/engine';
import { evaluate, branchCount, dist } from '@/engine';
import { replay, useGeoStore } from '../geoStore';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

const SQUARE: Command = { type: 'square', ids: ['A', 'B', 'C', 'D'] };
const G_ON_AD: Command = { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 };
// All referenced points are determined square corners → a pure check: 90 ≠ 37.
const BAD_ANGLE: Command = { type: 'set-angle', vertex: 'A', ray1: 'D', ray2: 'B', value: 37 };

const s = () => useGeoStore.getState();
const derived = () => replay(s().facts);
const ids = () => derived().construction.objects.map((o) => o.id);

beforeEach(() => {
  s().clear();
});

describe('store — replay pipeline', () => {
  it('applies a fact and reflects it in the derived figure', () => {
    s().execute(SQUARE, 'square ABCD');
    expect(ids()).toContain('A');
    expect(s().facts).toHaveLength(1);
    expect(derived().status[s().facts[0].id]).toBe('ok');
    expect(evaluate(derived().construction).ok).toBe(true);
  });

  it('re-issuing an identical command adds no duplicate fact (idempotent)', () => {
    s().execute(SQUARE, 'square ABCD');
    s().execute(SQUARE, 'square ABCD');
    expect(s().facts).toHaveLength(1);
  });

  it('re-issuing a deselected fact turns it back on instead of duplicating', () => {
    s().execute(SQUARE);
    s().toggle(s().facts[0].id);
    expect(s().facts[0].enabled).toBe(false);
    s().execute(SQUARE);
    expect(s().facts).toHaveLength(1);
    expect(s().facts[0].enabled).toBe(true);
  });

  it('accumulates facts without disturbing earlier objects (stability)', () => {
    s().execute(SQUARE);
    const before = replay(s().facts).positions;
    s().execute(G_ON_AD);
    const after = replay(s().facts).positions;
    for (const id of ['A', 'B', 'C', 'D']) {
      expect(after.get(id)).toEqual(before.get(id));
    }
    expect(ids()).toContain('G');
  });
});

describe('store — repositioning a free point is a move (ADR-011)', () => {
  it('re-placing an existing free point updates its fact in place (no new row) and moves it', () => {
    s().execute({ type: 'free-point', id: 'A', x: 0, y: 0 });
    s().execute({ type: 'free-point', id: 'A', x: 4, y: 1 }); // move A
    expect(s().facts).toHaveLength(1); // updated in place, not stacked
    expect(replay(s().facts).positions.get('A')).toEqual({ x: 4, y: 1 });
  });

  it('deleting the move reverts a square vertex placed by the square fact', () => {
    s().execute(SQUARE); // B at (5,0)
    s().execute({ type: 'free-point', id: 'B', x: 6, y: 0 }); // separate move fact
    expect(s().facts).toHaveLength(2);
    expect(replay(s().facts).positions.get('B')).toEqual({ x: 6, y: 0 });
    s().remove(s().facts[1].id); // delete the move
    expect(replay(s().facts).positions.get('B')).toEqual({ x: 5, y: 0 }); // back to the square's B
  });
});

describe('store — edit a fact in place (ADR-015)', () => {
  it('changing a point-on-segment ratio re-derives without a redefinition conflict', () => {
    s().execute(SQUARE);
    s().execute({ type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.2 });
    const gFactId = s().facts[1].id;
    const before = replay(s().facts).positions.get('G')!;

    s().update(gFactId, { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 }, 'point G on AD at 40%');

    expect(s().facts).toHaveLength(2); // edited in place, not appended
    const d = replay(s().facts);
    expect(d.status[gFactId]).toBe('ok'); // not an "already defined" conflict
    const after = d.positions.get('G')!;
    // G moved further along AD (its distance from A grew from 0.2 to 0.4 of |AD|)
    const A = d.positions.get('A')!;
    expect(Math.hypot(after.x - A.x, after.y - A.y)).toBeGreaterThan(Math.hypot(before.x - A.x, before.y - A.y));
  });

  it('a dependent of the edited fact follows the edit', () => {
    s().execute(SQUARE);
    s().execute({ type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.2 });
    s().execute({ type: 'segment', a: 'B', b: 'G' }); // depends on G
    const gFactId = s().facts[1].id;

    s().update(gFactId, { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.6 });
    const d = replay(s().facts);
    expect(d.status[gFactId]).toBe('ok');
    expect(d.construction.objects.some((o) => o.id === 'seg-BG')).toBe(true); // dependent still present
  });

  it('the edit is undoable', () => {
    s().execute(SQUARE);
    s().execute({ type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.2 });
    const gFactId = s().facts[1].id;
    s().update(gFactId, { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 });

    useGeoStore.temporal.getState().undo();
    const g = s().facts.find((f) => f.id === gFactId)!;
    expect(g.cmd).toMatchObject({ type: 'point-on-segment', t: 0.2 }); // reverted to the original ratio
  });
});

describe('store — keep prior figure on contradiction (FR-EN-8/-10)', () => {
  it('flags the bad fact, keeps the figure, surfaces the error', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    const kept = replay(s().facts).construction;
    s().execute(BAD_ANGLE, 'angle DAB = 37');

    const d = derived();
    expect(d.construction.objects.map((o) => o.id).sort()).toEqual(kept.objects.map((o) => o.id).sort());
    expect(d.lastError).toMatch(/over-constrained/i);
    expect(d.status[s().facts[2].id]).toMatch(/over-constrained/i);
  });
});

describe('store — select / deselect / delete (ADR-010)', () => {
  it('deselecting a fact drops it from the figure but keeps it in the list (reversible)', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    const gFactId = s().facts[1].id;

    s().toggle(gFactId);
    expect(s().facts).toHaveLength(2); // still listed
    expect(s().facts[1].enabled).toBe(false);
    expect(ids()).not.toContain('G'); // gone from the figure
    expect(derived().status[gFactId]).toBe('disabled');

    s().toggle(gFactId); // re-select
    expect(ids()).toContain('G'); // back
  });

  it('deselecting a depended-on fact auto-drops its dependents, reversibly', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    const squareFactId = s().facts[0].id;

    s().toggle(squareFactId); // turn the square off
    expect(ids()).not.toContain('A');
    expect(ids()).not.toContain('G'); // G can't resolve without A/D
    expect(derived().status[s().facts[1].id]).toMatch(/unresolved|already|construct/i);

    s().toggle(squareFactId); // turn it back on
    expect(ids()).toContain('A');
    expect(ids()).toContain('G'); // dependent restored
  });

  it('deletes a fact permanently', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    s().remove(s().facts[1].id);
    expect(s().facts).toHaveLength(1);
    expect(ids()).not.toContain('G');
  });

  it('select highlights a fact and clears when re-selected; deleting clears selection', () => {
    s().execute(SQUARE);
    const id = s().facts[0].id;
    s().select(id);
    expect(s().selectedId).toBe(id);
    s().select(id);
    expect(s().selectedId).toBeNull();
    s().select(id);
    s().remove(id);
    expect(s().selectedId).toBeNull();
  });
});

describe('store — undo / redo', () => {
  it('undoes and redoes adding a fact', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    expect(ids()).toContain('G');

    useGeoStore.temporal.getState().undo();
    expect(ids()).not.toContain('G');
    expect(s().facts).toHaveLength(1);

    useGeoStore.temporal.getState().redo();
    expect(ids()).toContain('G');
  });

  it('undoes a deselect (toggle is tracked in history)', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    s().toggle(s().facts[1].id);
    expect(ids()).not.toContain('G');
    useGeoStore.temporal.getState().undo();
    expect(ids()).toContain('G');
  });

  it('does not track the transient selection in history', () => {
    s().execute(SQUARE);
    const past = useGeoStore.temporal.getState().pastStates.length;
    s().select(s().facts[0].id);
    expect(useGeoStore.temporal.getState().pastStates.length).toBe(past);
  });
});

describe('store — clear', () => {
  it('empties facts and wipes history', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    s().clear();
    expect(s().facts).toHaveLength(0);
    expect(s().selectedId).toBeNull();
    expect(useGeoStore.temporal.getState().pastStates).toHaveLength(0);
  });
});

describe('store — alternatives', () => {
  it('cycles an intersection point to another configuration and back', () => {
    const base: Command[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 6, y: 0 },
      { type: 'point-by-distances', id: 'C', from1: 'A', dist1: 5, from2: 'B', dist2: 5, branch: 0 },
    ];
    base.forEach((c) => s().execute(c));
    const y0 = replay(s().facts).positions.get('C')!.y;

    s().cycleAlt('C');
    expect(Math.sign(replay(s().facts).positions.get('C')!.y)).toBe(-Math.sign(y0));

    s().cycleAlt('C'); // two branches → back to the first
    expect(replay(s().facts).positions.get('C')!.y).toBeCloseTo(y0, 9);
  });

  it('cycles a CONSTRAINT-DRIVEN on-segment point to its other root, and the choice survives replay (ADR-043/R2)', () => {
    // G slides on AB; |CG| = 4 has TWO solutions on the segment (C sits 3 above the midpoint),
    // so the driven on-segment point is genuinely branchable — and the branch lives on the
    // point-on-segment command, so cycling it survives `replay` (it used to reset to branch 0).
    const base: Command[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 10, y: 0 },
      { type: 'free-point', id: 'C', x: 5, y: 3 },
      { type: 'point-on-segment', id: 'G', a: 'A', b: 'B', t: 0.5 },
      { type: 'set-distance', a: 'C', b: 'G', value: 4 },
    ];
    base.forEach((c) => s().execute(c));
    expect(branchCount(replay(s().facts).construction, 'G')).toBe(2);
    const g0 = replay(s().facts).positions.get('G')!;
    expect(dist(replay(s().facts).positions.get('C')!, g0)).toBeCloseTo(4, 6); // constraint holds at root 0

    s().cycleAlt('G');
    const g1 = replay(s().facts).positions.get('G')!; // re-derived from facts: the branch must survive replay
    expect(evaluate(replay(s().facts).construction).ok).toBe(true);
    expect(dist(g0, g1)).toBeGreaterThan(0.5); // flipped to the OTHER root
    expect(dist(replay(s().facts).positions.get('C')!, g1)).toBeCloseTo(4, 6); // and |CG| = 4 still holds

    s().cycleAlt('G'); // two roots → wraps back to the first
    expect(dist(replay(s().facts).positions.get('G')!, g0)).toBeCloseTo(0, 6);
  });
});

describe('removing an early step cascades — dependents fail honestly, no phantom rescue', () => {
  const CIRCLE: Command = { type: 'circle', id: 'circle-O', center: 'O', radius: 5 };
  const A_ON: Command = { type: 'point-on-circle', id: 'A', circle: 'circle-O' };
  const B_ON: Command = { type: 'point-on-circle', id: 'B', circle: 'circle-O' };
  const SEG_AB: Command = { type: 'segment', a: 'A', b: 'B' };

  it('a segment on circle points fails when the circle is removed (not silently re-created)', () => {
    [CIRCLE, A_ON, B_ON, SEG_AB].forEach((c) => s().execute(c));
    s().remove(s().facts[0].id); // remove the circle
    const d = replay(s().facts);
    expect(d.status[s().facts[0].id]).toMatch(/unresolved|circle/i); // A can't resolve
    expect(d.status[s().facts[2].id]).toMatch(/no longer available/i); // the segment cascades, doesn't rescue A,B
    expect(d.construction.objects.filter((o) => o.kind === 'segment')).toHaveLength(0); // no phantom segment
  });

  it('is reversible — re-enabling the dependency brings the dependents back', () => {
    [CIRCLE, A_ON, B_ON, SEG_AB].forEach((c) => s().execute(c));
    s().toggle(s().facts[0].id); // disable the circle → cascade
    expect(replay(s().facts).status[s().facts[3].id]).toMatch(/no longer available/i);
    s().toggle(s().facts[0].id); // re-enable
    expect(replay(s().facts).status[s().facts[3].id]).toBe('ok'); // segment AB builds again
  });

  it('a standalone segment still auto-creates its endpoints (no owner to defer to)', () => {
    s().execute({ type: 'segment', a: 'X', b: 'Y' });
    expect(replay(s().facts).status[s().facts[0].id]).toBe('ok');
  });
});

describe('step grouping — one submission, one row (even if it expands to many commands)', () => {
  // An inscribed shape is many commands from ONE utterance: they share a group.
  const INSCRIBED: Command[] = [
    { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
    { type: 'point-on-circle', id: 'A', circle: 'circle-O', theta: 0 },
    { type: 'point-on-circle', id: 'B', circle: 'circle-O', theta: 2 },
    { type: 'point-on-circle', id: 'C', circle: 'circle-O', theta: 4 },
    { type: 'triangle', ids: ['A', 'B', 'C'] },
  ];
  const groupKeys = () => [...new Set(s().facts.map((f) => f.group ?? f.id))];

  it('commands sharing a group collapse to a single step key', () => {
    const g = 'sub-1';
    INSCRIBED.forEach((c) => s().execute(c, 'triangle ABC inscribed in a circle', g));
    expect(s().facts).toHaveLength(5); // five facts…
    expect(groupKeys()).toEqual([g]); // …but one step row
  });

  it('setGroupEnabled toggles every command in the step together', () => {
    const g = 'sub-1';
    INSCRIBED.forEach((c) => s().execute(c, 'inscribed', g));
    s().setGroupEnabled(g, false);
    expect(s().facts.every((f) => !f.enabled)).toBe(true);
    expect(replay(s().facts).construction.objects).toHaveLength(0); // nothing drawn
    s().setGroupEnabled(g, true);
    expect(s().facts.every((f) => f.enabled)).toBe(true);
  });

  it('removeGroup deletes the whole step', () => {
    const g = 'sub-1';
    INSCRIBED.forEach((c) => s().execute(c, 'inscribed', g));
    s().removeGroup(g);
    expect(s().facts).toHaveLength(0);
  });

  it('replaceGroup swaps the step in place, preserving position', () => {
    s().execute({ type: 'triangle', ids: ['X', 'Y', 'Z'] }, 'triangle XYZ', 'g0');
    const g = 'sub-1';
    INSCRIBED.forEach((c) => s().execute(c, 'inscribed', g));
    s().execute({ type: 'segment', a: 'A', b: 'B' }, 'segment AB', 'g2');
    s().replaceGroup(g, [{ type: 'square', ids: ['A', 'B', 'C', 'D'] }], 'square ABCD');
    expect(s().facts[0].cmd.type).toBe('triangle'); // first step stays first
    expect(s().facts[1].cmd.type).toBe('square'); // the middle step is now a square
    expect(s().facts[2].cmd.type).toBe('segment'); // last step stays last
  });
});

describe('circle resize — re-stating a circle overrides its radius (not a conflict)', () => {
  const CIRCLE = (r: number): Command => ({ type: 'circle', id: 'circle-O', center: 'O', radius: r });

  it('a standalone circle re-stated with a new radius resizes in place (one step)', () => {
    s().execute(CIRCLE(5), 'circle O radius 5', 'g1');
    s().execute(CIRCLE(8), 'circle O radius 8', 'g2');
    expect(s().facts).toHaveLength(1); // collapsed like a free-point move
    const circle = replay(s().facts).construction.objects.find((o) => o.id === 'circle-O');
    expect(circle).toMatchObject({ radius: { via: 'length', value: 8 } });
  });

  it('resizing the circle of an inscribed shape grows its vertices (override step, no conflict)', () => {
    // inscribed-triangle group (circle-O r5 + 3 on-circle + triangle), all one step
    const inscribed: Command[] = [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O', theta: 0 },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O', theta: 2 },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O', theta: 4 },
      { type: 'triangle', ids: ['A', 'B', 'C'] },
    ];
    inscribed.forEach((c) => s().execute(c, 'triangle inscribed', 'g1'));
    expect(replay(s().facts).positions.get('A')!.x).toBeCloseTo(5, 6); // on r=5

    s().execute(CIRCLE(8), 'circle O radius 8', 'g2'); // override step — must NOT conflict
    const d = replay(s().facts);
    expect(d.lastError).toBeNull();
    expect(d.positions.get('A')!.x).toBeCloseTo(8, 6); // the vertex moved out to r=8
    const facts = s().facts;
    expect(d.status[facts[facts.length - 1].id]).toBe('ok'); // the resize step applied
  });
});

describe('i18n — key parity (he ⇄ en)', () => {
  const paths = (obj: unknown, prefix = ''): string[] => {
    if (obj === null || typeof obj !== 'object') return [prefix];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      paths(v, prefix ? `${prefix}.${k}` : k),
    );
  };

  it('has identical key sets in both locales', () => {
    expect(paths(he).sort()).toEqual(paths(en).sort());
  });
});
