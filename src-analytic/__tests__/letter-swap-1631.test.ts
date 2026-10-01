/**
 * #1631 — the analytic builder conforms to the shared letter-swap contract (docs/28 §5c rule 3).
 *
 * This tree's thin lock on `shell/__tests__/fixtures/letter-swap-rows.ts`: the REAL `dispatchRename` →
 * `letterRenameOf` (exactly what App hands the shared `LetterPopover`), the REAL `dispatchSwap` (what the
 * popover's «החליפו בין A ל-B» and the typed «החלף בין A ל-B» both reach), the store's own undo, and the
 * figure's points as the engine derives them — never a re-implementation of any of them.
 */
import { describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { dispatchRename, dispatchSwap, letterRenameOf, type RenameState } from '../app/rename';
import { letterSwapFaults } from '../../shell/__tests__/fixtures/letter-swap-rows';

const store = () => useAnalyticStore.getState();

function build(lines: string[]) {
  store().clearAll();
  for (const l of lines) store().recordLine(l);
  useAnalyticStore.temporal.getState().clear();
}

const state = (): RenameState => {
  const s = store();
  return { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames };
};
const current = () => derive(store().lines, store().seed, store().seedNames);

describe('#1631 — the analytic builder conforms to the shared letter-swap contract', () => {
  it.each([
    ['two vertices of a triangle', ['נתונה הנקודה A(2,6)', 'נתונה הנקודה B(8,2)', 'נתונה הנקודה C(4,10)', 'משולש ABC'], 'A', 'B'],
    ['a vertex and a derived point', ['נתונה הנקודה A(2,6)', 'נתונה הנקודה B(8,2)', 'M אמצע AB'], 'A', 'M'],
    ['two points on an equation line (x and y stay)', ['נתונה הנקודה A(2,6)', 'נתונה הנקודה B(8,2)', 'משוואת הישר AB היא 2x+3y-22=0'], 'A', 'B'],
  ])('%s', (_name, setup, a, b) => {
    const faults = letterSwapFaults({
      setup: () => build(setup),
      a,
      b,
      rename: (from, to) => letterRenameOf(dispatchRename(from, to, state(), { applyRename: store().applyRename, setError: store().setError }, current())),
      swap: (x, y) => ({ ok: dispatchSwap(x, y, state(), { applySwap: store().applySwap, setError: store().setError }, current()).kind === 'apply' }),
      undo: () => store().undo(),
      statements: () => [...store().lines],
      points: () => current().figure.points.map((p) => p.id),
    });
    expect(faults).toEqual([]);
  });

  it('a refusal other than a taken letter carries its own key — the error line says why', () => {
    build(['נתונה הנקודה A(2,6)']);
    const r = letterRenameOf(dispatchRename('A', 'AB', state(), { applyRename: store().applyRename, setError: store().setError }, current()));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).not.toBe('taken');
  });
});
