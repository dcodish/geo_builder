/**
 * #1667 — a circle's centre letter can be renamed and swapped, and EVERY point letter of every 471 figure
 * that builds can be renamed with the figure unchanged up to the letter map (ADR-AG-205).
 *
 * The reported case: «נתון מעגל שמרכזו P», click P → Q answered `rename-unsafe`; the swap with A answered
 * `swap-unsafe`. A centre sentence lowers to `param r_P` + `circle-at { r: sym r_P }`, and the rename's
 * faithfulness check mapped the param's symbol string but not the expression's symbol node, so the
 * rewritten line never compared equal. The class: the check compared a shape that was NOT invariant under
 * the letter map — a symbol spelled from a letter (`r_<centre>`, `θ_<object>…`) mapped in one place and
 * not the other, and a symmetric relation whose operands the lowering orders by letter («∢BEC = 90°»,
 * a square's right angle) compared by its raw order rather than by the engine's own statement identity.
 *
 * Every lock calls the REAL decision, the real store actions and undo, the real typed submit path.
 * Session-edit sentences are plain strings, never inside an array literal (`analyticCorpus` harvests
 * string arrays as figures).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { decideRename, dispatchRename, dispatchSwap, letterRenameOf, nameInUse, type RenameState } from '../app/rename';
import { useAnalyticStore } from '../store/useAnalyticStore';
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
const renameActs = () => ({ applyRename: store().applyRename, setError: store().setError });
const swapActs = () => ({ applySwap: store().applySwap, setError: store().setError });

/** The three figures of the report: a centre-named circle, an equation circle with a named centre, a circumcircle's centre. */
const FIGURES: Array<[string, string[]]> = [
  ['a circle named by its centre', ['נתונה הנקודה A(9,1)', 'נתון מעגל שמרכזו P']],
  ['an equation circle with a named centre', ['נתון מעגל P שמשוואתו (x-2)^2+(y-3)^2=25', 'נתונה הנקודה A(9,1)']],
  ['a circumcircle whose centre is named afterwards', ['משולש ABC חסום במעגל', 'P מרכז המעגל']],
];

const pointsOf = () => new Map(current().figure.points.map((p) => [p.id, [p.x, p.y] as const]));

describe('#1667 — the centre letter is renamed and swapped; one undo restores', () => {
  it.each(FIGURES)('%s: rename P → Q through the store dispatch', (_n, lines) => {
    build(lines);
    const before = pointsOf();
    const v = dispatchRename('P', 'Q', state(), renameActs(), current());
    expect(v.kind, JSON.stringify(v)).toBe('apply');
    const after = pointsOf();
    expect(after.has('P')).toBe(false);
    expect(after.get('Q')?.[0]).toBeCloseTo(before.get('P')![0], 6);
    expect(after.get('Q')?.[1]).toBeCloseTo(before.get('P')![1], 6);
    expect(store().lines.join('|')).not.toMatch(/(?<![a-z'])P(?![a-z0-9₀-₉'])/);
    store().undo();
    expect(store().lines).toEqual(lines);
  });

  it.each(FIGURES)('%s: swap P ↔ A through the store dispatch', (_n, lines) => {
    build(lines);
    const before = pointsOf();
    const v = dispatchSwap('P', 'A', state(), swapActs(), current());
    expect(v.kind, JSON.stringify(v)).toBe('apply');
    const after = pointsOf();
    for (const [a, b] of [['P', 'A'], ['A', 'P']]) {
      expect(after.get(b)?.[0]).toBeCloseTo(before.get(a)![0], 6);
      expect(after.get(b)?.[1]).toBeCloseTo(before.get(a)![1], 6);
    }
    store().undo();
    expect(store().lines).toEqual(lines);
  });

  it.each(FIGURES)('%s: the TYPED rename and swap reach the same decisions', (_n, lines) => {
    const s: RenameState = { lines, disabled: [], queries: [], spokenFor: {}, seed: 0 };
    const r = decideSubmit('שנה שם P ל-Q', lines, 0);
    if (r.kind !== 'rename') throw new Error(r.kind);
    expect(decideRename(r.from, r.to, s).kind).toBe('apply');
    const w = decideSubmit('החלף בין P ל-A', lines, 0);
    expect(w.kind).toBe('swap');
  });

  it.each(FIGURES)('%s: the shared letter-swap rows (docs/28 §5c) hold on the centre', (_n, lines) => {
    const faults = letterSwapFaults({
      setup: () => build(lines),
      a: 'P',
      b: 'A',
      rename: (from, to) => letterRenameOf(dispatchRename(from, to, state(), renameActs(), current())),
      swap: (x, y) => ({ ok: dispatchSwap(x, y, state(), swapActs(), current()).kind === 'apply' }),
      undo: () => store().undo(),
      statements: () => [...store().lines],
      points: () => current().figure.points.map((p) => p.id),
    });
    expect(faults).toEqual([]);
  });
});

/**
 * The same class through an ANONYMOUS id: «דרך P עובר ישר …» hashes its anchor letter into the line's id
 * (`curve-anon…`, and the free direction `θ_curve-anon…`), which no letter map can follow — compared up to a
 * consistent renaming of anonymous ids, the rename is accepted and nothing moves.
 */
describe('#1667 — a line whose anonymous id is hashed from a letter can have that letter renamed', () => {
  it.each([
    [['נקודה A', 'נקודה B', 'P(1,5)', 'דרך P עובר ישר מקביל ל AB'], 'P'],
    [['נקודה A', 'נקודה B', 'P(1,5)', 'דרך P עובר ישר מקביל ל AB'], 'A'],
    [['נתון מעגל x^2+y^2=25', 'P(10,0)', 'דרך P עובר משיק למעגל'], 'P'],
    [['P(1,5)', 'דרך P עובר ישר'], 'P'],
  ] as Array<[string[], string]>)('%j: rename %s → Q', (lines, from) => {
    const s: RenameState = { lines, disabled: [], queries: [], spokenFor: {}, seed: 0 };
    const d = derive(lines, 0);
    const v = decideRename(from, 'Q', s, d);
    if (v.kind !== 'apply') throw new Error(JSON.stringify(v.error));
    const after = new Map(derive(v.lines, 0, v.seedNames).figure.points.map((p) => [p.id === 'Q' ? from : p.id, p]));
    for (const p of d.figure.points) {
      expect(after.get(p.id)?.x).toBeCloseTo(p.x, 6);
      expect(after.get(p.id)?.y).toBeCloseTo(p.y, 6);
    }
  });
});

/**
 * THE CLASS NET — every point letter of every 471 figure that builds is renamed to a free letter: the rename
 * is accepted, and every point sits where its old letter sat (nothing else moved, nothing appeared).
 */
describe('#1667 — every point letter of every 471 figure that builds can be renamed, figure unchanged', () => {
  const CORPUS: Array<{ id: string; lines: string[] }> = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));

  it('the sweep', () => {
    const faults: string[] = [];
    let swept = 0;
    for (const q of CORPUS) {
      const d = derive(q.lines, 0);
      if (d.faults.length > 0) continue;
      const s: RenameState = { lines: q.lines, disabled: [], queries: [], spokenFor: {}, seed: 0 };
      const before = new Map(d.figure.points.map((p) => [p.id, p]));
      for (const from of [...before.keys()]) {
        const to = [...'QWXYZUVKLNRSTJ'].find((c) => !nameInUse(s, d, c))!;
        swept++;
        const v = decideRename(from, to, s, d);
        if (v.kind !== 'apply') {
          faults.push(`${q.id} ${from}→${to}: ${JSON.stringify(v.error)}`);
          continue;
        }
        const after = derive(v.lines, 0, v.seedNames);
        const mapped = new Map(after.figure.points.map((p) => [p.id === to ? from : p.id, p]));
        if (mapped.size !== before.size) faults.push(`${q.id} ${from}→${to}: ${before.size} points became ${mapped.size}`);
        for (const [id, p] of before) {
          const m = mapped.get(id);
          if (!m || Math.abs(m.x - p.x) > 1e-6 || Math.abs(m.y - p.y) > 1e-6) faults.push(`${q.id} ${from}→${to}: ${id} moved`);
        }
      }
    }
    expect(swept).toBeGreaterThan(100);
    expect(faults).toEqual([]);
  });
});
