/**
 * Phase-3 acceptance gate (docs/09-implementation-plan.md §Phase 3).
 * Fact-list store: replay pipeline, keep-prior-on-error, undo/redo, clear,
 * alternatives, and per-fact select/deselect/delete (ADR-010). Plus i18n
 * key-parity. The engine is exercised through the store exactly as the UI drives it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Command } from '@/engine';
import { evaluate } from '@/engine';
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
