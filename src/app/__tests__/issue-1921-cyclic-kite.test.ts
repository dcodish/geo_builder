/**
 * #1921 ([ADR-657](../../../docs/06-decisions.md#adr-657)) — A KITE WHOSE FOUR VERTICES ARE ALREADY ON ONE CIRCLE IS
 * THE RIGHT KITE, DRAWN — never a false over-constrained refusal.
 *
 * Measured on `main` @ b0ef3240 through `runSubmit` (the model mocked): «מעגל O · A, B, C ו-D על המעגל · AB = 3 ·
 * BC = 4 · דלתון ABCD» was refused «…סותר נתון קודם… הסיבה: |AB| = |AD|.» after 21 s, although the right kite fits.
 * Root cause: ADR-628's class for the one noun it did not reach — the kite lowers through `shape-variant`, so its
 * two equal pairs (the family's general relations) went to the solver, which on four circle riders must move the
 * radius and did not find it. The fold now binds a kite over a ring already on one circle to the right kite's
 * definition (`cyclicKiteCommands`).
 *
 * Plan lock (2026-10-08): the right kite, in under 1 s. The wall clock is the machine's; the lock holds the kite
 * line's solve WORK against the ruled parallelogram row's (ADR-628) on the same figure, and the stopwatch only
 * against a generous ceiling.
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { narrowingText } from '../narrowingText';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import { ringSimple, type Command, type Vec } from '@/engine';
import { cyclicKiteCommands } from '@/engine/inscribe';
import { work } from '@/engine/solveBudget';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { stripFormatControls } from '../../../shell/bidi';

const he = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;

async function play(lines: readonly string[]): Promise<{ committed: boolean; notes: string[]; lastWork: number }> {
  useGeoStore.getState().clear();
  let committed = false;
  let notes: string[] = [];
  let lastWork = 0;
  for (const line of lines) {
    notes = [];
    const before = new Set(useGeoStore.getState().facts.map(groupKey)).size;
    const deps: SubmitDeps = {
      t: (key, opts) => he(key, opts),
      locale: 'he',
      ui: { setInputNote: (m) => m && notes.push(stripFormatControls(m)), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const r = replay(st.facts, st.seed);
        return { construction: r.construction, positions: r.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {},
      llmAbortRef: { current: null },
      explainError: (raw, said) => humanizeError(raw, he, said),
    };
    const w0 = work.done;
    await runSubmit(line, deps);
    lastWork = work.done - w0;
    committed = new Set(useGeoStore.getState().facts.map(groupKey)).size > before;
  }
  return { committed, notes, lastWork };
}

const angle = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI;
};
const len = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** The ring ABCD is a right kite at all 24 seeds: simple, two equal adjacent pairs, the two off-axis angles right. */
function rightKiteAt24(sides?: [number, number]): void {
  const st = useGeoStore.getState();
  for (let s = 0; s < 24; s++) {
    const fig = replay(st.facts, s);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => fig.positions.get(id)!);
    expect(fig.lastError, `seed ${s}`).toBeNull();
    expect(fig.violations, `seed ${s}`).toEqual([]);
    expect(ringSimple([A, B, C, D]), `seed ${s}`).toBe(true);
    const axisAC = Math.abs(len(A, B) - len(A, D)) < 1e-4 * len(A, C) && Math.abs(len(C, B) - len(C, D)) < 1e-4 * len(A, C);
    const axisBD = Math.abs(len(B, A) - len(B, C)) < 1e-4 * len(A, C) && Math.abs(len(D, A) - len(D, C)) < 1e-4 * len(A, C);
    expect(axisAC || axisBD, `seed ${s}: a kite`).toBe(true);
    const [p, q] = axisAC ? [angle(A, B, C), angle(C, D, A)] : [angle(D, A, B), angle(B, C, D)];
    expect(p, `seed ${s}`).toBeCloseTo(90, 2);
    expect(q, `seed ${s}`).toBeCloseTo(90, 2);
    if (sides) {
      expect(len(A, B), `seed ${s}`).toBeCloseTo(sides[0], 6);
      expect(len(B, C), `seed ${s}`).toBeCloseTo(sides[1], 6);
    }
  }
}

describe('#1921 — the right kite on four points of a circle', () => {
  const POINTS = ['מעגל O', 'A, B, C ו-D על המעגל'];

  it('the ruled row: «… · AB = 3 · BC = 4 · דלתון ABCD» draws the right kite 3/4/4/3, at every seed', async () => {
    const r = await play([...POINTS, 'AB = 3', 'BC = 4', 'דלתון ABCD']);
    expect(r.committed).toBe(true);
    expect(r.notes).toEqual([]);
    rightKiteAt24([3, 4]);
    // the narrowing note (#1996, ADR-655) names the circle
    await useGeoStore.getState().detectCrossings();
    const st = useGeoStore.getState();
    expect(narrowingText(st.narrowed!.list, he).map(stripFormatControls)).toEqual([
      'כדי שהמעגל יעבור דרך כל הקודקודים, ABCD הוגבל מדלתון לדלתון ישר־זווית — דלתון ישר־זווית הוא סוג של דלתון.',
    ]);
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 180_000);

  it('promptly: the kite line costs no more than 3× the ruled parallelogram row (ADR-628) on the same figure', async () => {
    const t0 = Date.now();
    const kite = await play([...POINTS, 'AB = 3', 'BC = 4', 'דלתון ABCD']);
    const kiteMs = Date.now() - t0;
    const para = await play([...POINTS, 'AB = 3', 'BC = 4', 'מקבילית ABCD']);
    expect(kite.lastWork).toBeLessThanOrEqual(3 * Math.max(para.lastWork, 1));
    expect(kiteMs, 'a generous wall-clock ceiling (was 21 s, refused)').toBeLessThan(10_000);
  }, 180_000);

  it('the sides the other way round: the mirror kite', async () => {
    const r = await play([...POINTS, 'AB = 4', 'BC = 3', 'דלתון ABCD']);
    expect(r.committed).toBe(true);
    rightKiteAt24([4, 3]);
  }, 180_000);

  it('no sides; the circle stated after; the noun after a noun-less inscription', async () => {
    for (const lines of [[...POINTS, 'דלתון ABCD'], ['דלתון ABCD', 'ABCD חסום במעגל'], ['ABCD חסום במעגל', 'דלתון ABCD']]) {
      const r = await play(lines);
      expect(r.committed, lines.join(' · ')).toBe(true);
      rightKiteAt24();
    }
  }, 180_000);

  it("the right kite's definition replaces the two pairs; a pair the student stated leaves the expansion alone", () => {
    const exp = cyclicKiteCommands([
      { type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'], declaredAs: 'kite' },
      { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'D' },
      { type: 'set-equal', a: 'C', b: 'B', c: 'C', d: 'D' },
    ]);
    expect(exp).toEqual([
      { type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'], declaredAs: 'kite' },
      { type: 'set-perpendicular', a: 'A', b: 'B', c: 'B', d: 'C' }, // ∠ABC = 90: the axis AC is a diameter
      { type: 'set-perpendicular', a: 'A', b: 'C', c: 'B', d: 'D' }, // AC ⟂ BD: symmetric about the axis
    ]);
    // a pair the student stated is a given of its own: the expansion is left as it is
    const one: Command[] = [{ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'], declaredAs: 'kite' }, { type: 'set-equal', a: 'C', b: 'B', c: 'C', d: 'D' }];
    expect(cyclicKiteCommands(one)).toEqual(one);
  });
});
