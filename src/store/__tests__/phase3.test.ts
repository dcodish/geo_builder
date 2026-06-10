/**
 * Phase-3 acceptance gate (docs/09-implementation-plan.md §Phase 3).
 * Store pipeline (apply/evaluate/log), keep-prior-on-error, undo/redo, clear,
 * alternatives cycling, and i18n key-parity. The engine is exercised through
 * the store exactly as the UI will drive it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Command } from '@/engine';
import { evaluate } from '@/engine';
import { useGeoStore } from '../geoStore';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

const SQUARE: Command = { type: 'square', ids: ['A', 'B', 'C', 'D'] };
const G_ON_AD: Command = { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 };
const BAD_ANGLE: Command = { type: 'set-angle', vertex: 'A', ray1: 'G', ray2: 'B', value: 37 };

const s = () => useGeoStore.getState();
const ids = () => s().construction.objects.map((o) => o.id);

beforeEach(() => {
  s().clear();
});

describe('store — command pipeline', () => {
  it('applies a successful command and logs it', () => {
    s().execute(SQUARE, 'square ABCD');
    expect(ids()).toContain('A');
    expect(s().steps).toHaveLength(1);
    expect(s().steps[0].status).toBe('ok');
    expect(s().steps[0].utterance).toBe('square ABCD');
    expect(s().lastError).toBeNull();
    // construction is renderable
    const e = evaluate(s().construction);
    expect(e.ok).toBe(true);
  });

  it('accumulates facts without disturbing earlier objects (stability through the store)', () => {
    s().execute(SQUARE);
    const before = evaluate(s().construction);
    s().execute(G_ON_AD);
    const after = evaluate(s().construction);
    if (!before.ok || !after.ok) throw new Error('eval failed');
    for (const id of ['A', 'B', 'C', 'D']) {
      expect(after.positions.get(id)).toEqual(before.positions.get(id));
    }
    expect(ids()).toContain('G');
  });
});

describe('store — keep prior figure on contradiction (FR-EN-8/-10)', () => {
  it('records the rejection, keeps the construction, surfaces the error', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    const kept = s().construction;
    s().execute(BAD_ANGLE, 'angle GAB = 37');

    expect(s().construction).toBe(kept); // unchanged reference — figure preserved
    expect(s().lastError).toMatch(/over-constrained/i);
    expect(s().steps).toHaveLength(3);
    expect(s().steps[2].status).toMatch(/over-constrained/i);
  });

  it('clears the error on the next successful step', () => {
    s().execute(SQUARE);
    s().execute(BAD_ANGLE); // references G which doesn't exist yet → rejected
    expect(s().lastError).not.toBeNull();
    s().execute(G_ON_AD);
    expect(s().lastError).toBeNull();
  });
});

describe('store — undo / redo', () => {
  it('undoes and redoes a step', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    expect(ids()).toContain('G');

    useGeoStore.temporal.getState().undo();
    expect(ids()).not.toContain('G');
    expect(ids()).toContain('A');
    expect(s().steps).toHaveLength(1);

    useGeoStore.temporal.getState().redo();
    expect(ids()).toContain('G');
    expect(s().steps).toHaveLength(2);
  });

  it('does not track the transient error banner in history', () => {
    s().execute(SQUARE);
    const pastBefore = useGeoStore.temporal.getState().pastStates.length;
    s().execute(BAD_ANGLE); // rejected — changes steps + lastError
    // exactly one new history entry (the step log), not an extra one for the error
    const pastAfter = useGeoStore.temporal.getState().pastStates.length;
    expect(pastAfter).toBe(pastBefore + 1);
  });
});

describe('store — clear', () => {
  it('empties the construction and wipes history', () => {
    s().execute(SQUARE);
    s().execute(G_ON_AD);
    s().clear();
    expect(s().construction.objects).toHaveLength(0);
    expect(s().steps).toHaveLength(0);
    expect(s().lastError).toBeNull();
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
    const C0 = evaluate(s().construction);
    if (!C0.ok) throw new Error('eval failed');
    const y0 = C0.positions.get('C')!.y;

    s().cycleAlt('C');
    const C1 = evaluate(s().construction);
    if (!C1.ok) throw new Error('eval failed');
    expect(Math.sign(C1.positions.get('C')!.y)).toBe(-Math.sign(y0));

    // cycling is undoable like any step
    useGeoStore.temporal.getState().undo();
    const back = evaluate(s().construction);
    if (!back.ok) throw new Error('eval failed');
    expect(back.positions.get('C')!.y).toBeCloseTo(y0, 9);
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
    const hk = paths(he).sort();
    const ek = paths(en).sort();
    expect(hk).toEqual(ek);
  });
});
