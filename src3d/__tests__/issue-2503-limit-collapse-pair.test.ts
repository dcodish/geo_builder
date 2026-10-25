/**
 * #2503 ([ADR-3D-378](../../docs/06b-decisions-3d.md#adr-3d-378), the 3-D twin of 2-D's #2443 / ADR-764) — GIVENS THAT
 * HOLD ONLY WHERE TWO NAMED POINTS MEET ARE REFUSED WHETHER OR NOT THOSE POINTS ARE A DECLARED RING.
 *
 * «מרובע ABCD · |AB| = |BC| · AC ⟂ BC» recorded green with C 1.6e-3 – 2.5e-3 of the extent from A (measured at 045a8546):
 * ADR-3D-372 asked the tightened re-solve only of a THIN declared ring or solid, and D keeps the quadrilateral open. The
 * trigger now also reads every driving relation's operand pairs (`pinOperandPairs3`); a limit root on such a pair, or an
 * angle whose arm the re-solve empties, makes the candidate inadmissible, and with no ring or solid to name the store
 * refuses the line as the statements' contradiction (`givens-contradict`). Everything runs through `decideSubmit3`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { pinOperandPairs3 } from '../engine/solve3';
import type { Construction3, ScalarPin } from '../engine/types';

type St = { facts: Fact3[]; seed: number };

function run(lines: readonly string[], seed: number) {
  let st: St = { facts: [], seed };
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit3(st, lines[i]);
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? v.error : null, kind: v.kind };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, error: null, kind: 'record' as const };
}

const he = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('he')(k, o) as string;
const en = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('en')(k, o) as string;
const plain = (s: string | null): string => (s ?? '').replace(/[⁦-⁩]/g, '');
const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);
const SEEDS_8 = SEEDS_24.slice(0, 8);

/** Refused on the LAST line as the statements' contradiction naming `others`, never a flat polygon; keep-prior. */
function refusedContradiction(lines: readonly string[], seed: number, others: readonly string[]): void {
  const r = run(lines, seed);
  const last = lines.length - 1;
  expect(r.refusedAt, `seed ${seed}: refused at «${lines[last]}» (got ${r.kind} at ${r.refusedAt})`).toBe(last);
  expect((r.error as { code?: string } | null)?.code, `seed ${seed}: the contradiction, never polygon-collapsed`).toBe('givens-contradict');
  const msg = plain(errorText3(he, r.error));
  expect(msg, `seed ${seed}`).toContain(`«${lines[last]}»`);
  for (const o of others) expect(msg, `seed ${seed}`).toContain(`«${o}»`);
  expect(msg, `seed ${seed}: no polygon is called flat`).not.toMatch(/שטוח/);
  expect(r.st.facts.length, 'keep-prior: the refused line is not a fact').toBe(last);
}

/** Every line records, and every row is ok. */
function builds(lines: readonly string[], seed: number): void {
  const r = run(lines, seed);
  expect(r.refusedAt, `seed ${seed}: ${r.kind} at ${r.refusedAt} ${JSON.stringify(r.error)}`).toBe(-1);
  const d = derive3(r.st.facts, r.st.seed);
  const bad = Object.entries(d.status).filter(([, s]) => s !== 'ok' && s !== 'disabled');
  expect(bad, `seed ${seed}`).toEqual([]);
}

const MEMBERS: [string, string[], string[]][] = [
  ['the reported sequence', ['מרובע ABCD', '|AB| = |BC|', 'AC ⟂ BC'], ['|AB| = |BC|']],
  ['the ⊥ spelling', ['מרובע ABCD', '|AB| = |BC|', 'AC ⊥ BC'], ['|AB| = |BC|']],
  ['«מאונך ל-»', ['מרובע ABCD', '|AB| = |BC|', 'AC מאונך ל-BC'], ['|AB| = |BC|']],
  ['English head', ['quadrilateral ABCD', '|AB| = |BC|', 'AC ⊥ BC'], ['|AB| = |BC|']],
  ['the reversed order', ['מרובע ABCD', 'AC ⊥ BC', '|AB| = |BC|'], ['AC ⊥ BC']],
  ['the reversed order, BC ⊥ AC', ['מרובע ABCD', 'BC ⊥ AC', '|AB| = |BC|'], ['BC ⊥ AC']],
  ['the angle form', ['מרובע ABCD', '|AB| = |BC|', '∠ACB = 90'], ['|AB| = |BC|']],
  ['the angle form, reversed', ['מרובע ABCD', '∠ACB = 90', '|AB| = |BC|'], ['∠ACB = 90']],
  ['ADR-537 in a quadrilateral', ['מרובע ABCD', '|AB| = |AC|', '∠ABC = 90'], ['|AB| = |AC|']],
  ['|AB| = |AC| · AB ⊥ BC', ['מרובע ABCD', '|AB| = |AC|', 'AB ⊥ BC'], ['|AB| = |AC|']],
  ['a diagonal triangle', ['מרובע ABCD', '|AB| = |AD|', 'AB ⊥ BD'], ['|AB| = |AD|']],
  ['a pentagon', ['מחומש ABCDE', '|AB| = |BC|', 'AC ⊥ BC'], ['|AB| = |BC|']],
  ['a triangle declared inside the quadrilateral', ['מרובע ABCD', 'משולש ABC', '|AB| = |BC|', 'AC ⊥ BC'], ['|AB| = |BC|']],
  ['an exact coincidence that empties the ⊥', ['ריבוע ABCD', 'E על AB', '|DE| = |DA|', 'DE ⊥ AE'], ['|DE| = |DA|']],
];

/** Controls: real figures that keep building (`skip`: seeds that record a ring-crossed row at 045a8546 too, before this change: #2549). */
const CONTROLS: [string, string[], number[]?][] = [
  ['the right angle at the apex', ['מרובע ABCD', '|AB| = |BC|', 'AB ⊥ BC']],
  ['a real right triangle', ['מרובע ABCD', '|AB| = 2', '|BC| = 1', 'AC ⊥ BC']],
  ['a thin real triangle, 9.99', ['מרובע ABCD', '|AB| = 10', '|BC| = 9.99', 'AC ⊥ BC']],
  ['a thin real triangle inside the band, 9.9999', ['מרובע ABCD', '|AB| = 10', '|BC| = 9.9999', 'AC ⊥ BC'], [4, 17]],
  ['a base angle of 60°', ['מרובע ABCD', '|AB| = |BC|', '∠ACB = 60']],
  ['a base angle of 89°', ['מרובע ABCD', '|AB| = |BC|', '∠ACB = 89']],
  ['∠ACB = 90° · |BA| = 1.0001|BC| in a quadrilateral', ['מרובע ABCD', '∠ACB = 90°', '|BA| = 1.0001|BC|'], [4, 17]],
  ['a 2° triangle', ['משולש ABC', '∠ABC = 2°']],
  ['5 · 3 · 7.9999', ['משולש ABC', '|AB| = 5', '|BC| = 3', '|AC| = 7.9999']],
  ['a square\'s diagonal', ['ריבוע ABCD', '|AC| = 5']],
  ['FR-EN-20: D on C', ['משולש ABC', 'D על BC', '|BD| = |BC|']],
  ['FR-EN-20: E at A, no emptied angle', ['ריבוע ABCD', 'E על AB', '|DE| = |DA|']],
];

describe('#2503 — the class: refused as the statements\' contradiction at the last line', () => {
  it.each(MEMBERS)('%s', (_name, lines, others) => {
    for (const seed of SEEDS_8) refusedContradiction(lines, seed, others);
  }, 120_000);

  it('the reported sequence at all 24 seeds, with the exact Hebrew and English sentences', () => {
    const lines = ['מרובע ABCD', '|AB| = |BC|', 'AC ⟂ BC'];
    for (const seed of SEEDS_24) refusedContradiction(lines, seed, ['|AB| = |BC|']);
    const r = run(lines, 0);
    expect(plain(errorText3(he, r.error))).toBe('הנתונים סותרים זה את זה — אין גוף שמקיים את «AC ⟂ BC» יחד עם «|AB| = |BC|»');
    expect(plain(errorText3(en, r.error))).toContain('«AC ⟂ BC»');
    expect(plain(errorText3(en, r.error))).toContain('«|AB| = |BC|»');
  }, 120_000);

  it('the numeric twin is refused at its line at all 24 seeds, never recorded with a red row', () => {
    const lines = ['מרובע ABCD', '|AB| = 5', '|BC| = 5', 'AC ⊥ BC'];
    for (const seed of SEEDS_24) refusedContradiction(lines, seed, ['|AB| = 5', '|BC| = 5']);
  }, 300_000);

  it('the triangle twin keeps ADR-3D-372\'s flat-triangle refusal naming ABC', () => {
    const r = run(['משולש ABC', '|AB| = |BC|', 'AC ⊥ BC'], 0);
    expect(r.error).toMatchObject({ code: 'polygon-collapsed', ring: 'ABC', forced: true });
  });

  it('a solid keeps its own refusal (a tetrahedron is still a flat pyramid)', () => {
    const r = run(['טטראדר ABCD', '|AB| = |BC|', 'AC ⊥ BC'], 0);
    expect((r.error as { code?: string } | null)?.code).toBe('polygon-collapsed');
  });
});

describe('#2503 — the controls keep building at 24 seeds', () => {
  it.each(CONTROLS)('%s', (_name, lines, skip) => {
    for (const seed of SEEDS_24.filter((x) => !skip?.includes(x))) builds(lines, seed);
  }, 300_000);

  it('«פירמידה SABCD · ∠ASB = 2°» keeps today\'s verdict (claim-refuted, #1859 / #2301)', () => {
    const r = run(['פירמידה SABCD', '∠ASB = 2°'], 0);
    expect((r.error as { code?: string } | null)?.code).toBe('claim-refuted');
  });
});

describe('#2503 — pinOperandPairs3, the one reader of a driving relation\'s operand pairs', () => {
  const c = { vectors: new Map([['u', { from: 'A', to: 'B' }]]) } as unknown as Construction3;
  it.each<[ScalarPin, { a: string; b: string; arm: boolean }[]]>([
    [{ kind: 'length', a: 'A', b: 'B', value: 4 }, [{ a: 'A', b: 'B', arm: false }]],
    [{ kind: 'length-rel', a1: 'A', b1: 'B', a2: 'B', b2: 'C', c: 1 }, [{ a: 'A', b: 'B', arm: false }, { a: 'B', b: 'C', arm: false }]],
    [{ kind: 'vangle', vertex: 'C', p: 'A', q: 'B', deg: 90 }, [{ a: 'C', b: 'A', arm: true }, { a: 'C', b: 'B', arm: true }]],
    [{ kind: 'seg-angle', a1: 'A', b1: 'C', a2: 'B', b2: 'C', deg: 90 }, [{ a: 'A', b: 'C', arm: true }, { a: 'B', b: 'C', arm: true }]],
    [{ kind: 'cos-angle', u: { kind: 'named', name: 'u' }, v: { kind: 'pair', from: 'C', to: 'D' }, cos: 0 }, [{ a: 'A', b: 'B', arm: true }, { a: 'C', b: 'D', arm: true }]],
    [{ kind: 'dot', v1: 'u', v2: 'w', value: 3 }, [{ a: 'A', b: 'B', arm: false }]],
    [{ kind: 'volume3', noun: 'pyramid', ids: ['A', 'B', 'C', 'D'], value: 3 } as unknown as ScalarPin, []],
  ])('%j', (pin, want) => {
    expect(pinOperandPairs3(c, pin)).toEqual(want);
  });
});
