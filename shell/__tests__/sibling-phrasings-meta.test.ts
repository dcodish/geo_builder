/**
 * #2654 idea 3 (ADR-W-171) — the meta-lock on the sibling-phrasing generator and its ratchet: each operator
 * writes the spelling it claims (and nothing else), the renaming is consistent and order-keeping, the
 * comparison sees through a renaming, and the ratchet fails both ways.
 */
import { describe, expect, it } from 'vitest';
import {
  OPERATORS,
  anonymise,
  basesFrom,
  difference,
  fingerprint,
  ratchetFaults,
  renameSteps,
  sweep,
  variantsOf,
  type FailingVariant,
  type OperatorId,
} from './fixtures/sibling-phrasings';

const op = (id: OperatorId) => OPERATORS.find((o) => o.id === id)!.apply;

describe('#2654 — the sibling-phrasing operators write real spellings, and only those', () => {
  it.each<[OperatorId, string, string | null]>([
    ['prefix-space', 'BC מקביל ל-AD', 'BC מקביל ל AD'],
    ['prefix-space', 'משולש ישר-זווית ABC', null], // a compound's hyphen is not a prefix
    ['prefix-hyphen-space', 'C ו-D בצדדים שונים של AB', 'C ו- D בצדדים שונים של AB'],
    ['prefix-maqaf', 'D על AB במרחק 3 מ-A', 'D על AB במרחק 3 מ־A'],
    ['compound-hyphen-space', 'משולש ישר-זווית ABC', 'משולש ישר זווית ABC'],
    ['compound-hyphen-space', 'משולש שווה שוקיים ABC', 'משולש שווה-שוקיים ABC'],
    ['ktiv-haser', 'זווית B ישרה', 'זוית B ישרה'],
    ['symbol-spacing', 'AB = 6', 'AB=6'],
    ['symbol-spacing', 'AB⊥CD', 'AB ⊥ CD'],
    ['symbol-spacing', 'AB <= 6', null], // only a bare =
    ['perp-glyph', 'AB ⊥ CD', 'AB ⟂ CD'],
    ['degree-sign', 'זווית ABC = 40', 'זווית ABC = 40°'],
    ['degree-sign', '∠ABC = 40°', '∠ABC = 40'],
    ['degree-sign', 'זווית ABC = 2α', null], // a coefficient is not a measure
    ['trailing-period', 'משולש ABC', 'משולש ABC.'],
    ['trailing-period', 'משולש ABC.', null],
    ['given-lead', 'משולש ABC', 'נתון משולש ABC'],
    ['given-lead', 'מקבילית ABCD', 'נתונה מקבילית ABCD'],
    ['given-lead', 'הנקודות A, B', 'נתונות הנקודות A, B'],
    ['given-lead', 'מעגל I שמשוואתו x^2+y^2=9', 'נתון מעגל I שמשוואתו x^2+y^2=9'],
    ['given-lead', 'הישר l1 מקביל לישר l2', null], // a relation takes «נתון כי», not a lead-in
    ['given-lead', 'AB = 6', null],
    ['definite-article', 'משולש ABC', 'המשולש ABC'],
    ['definite-article', 'משולש קהה זווית ABC', null], // only the opening noun
    ['bidi-marks', 'הקטע AB', 'הקטע ‎AB‎'],
    ['double-space', 'משולש ABC', 'משולש  ABC'],
    ['geresh-prime', "AA' = 5", 'AA׳ = 5'],
    ['conj-relation', 'ישר דרך P מאונך ל-AB', 'ישר דרך P ומאונך ל-AB'],
    ['conj-relation', 'דרך A עובר ישר l1 המקביל לציר ה-x', null], // no through-point clause before it
    ['conj-relation', 'ישר l1 עובר דרך הנקודה A המקביל לציר ה-x', 'ישר l1 עובר דרך הנקודה A והמקביל לציר ה-x'],
    ['conj-relation', 'ישר l1 עובר דרך A ומאונך לציר x', null], // already joined
  ])('%s: «%s» → «%s»', (id, line, want) => {
    expect(op(id)(line)).toBe(want);
  });

  it('every operator says which prod spelling justifies it', () => {
    for (const o of OPERATORS) expect(o.why, o.id).toMatch(/\(\d+/);
  });
});

describe('#2654 — the renaming is consistent, order-keeping and seeded', () => {
  it('renames every point letter of the context and the sentence with one map', () => {
    const r = renameSteps(['ריבוע ABCD', 'נקודה G על AD', "AA' = kDC'"])!;
    expect(r.steps[0]).toMatch(/^ריבוע [A-Z]{4}$/);
    const [a, b, c, d] = r.steps[0].slice(-4);
    expect([a, b, c, d]).toEqual([...[a, b, c, d]].sort()); // the vertex order is kept
    expect(r.steps[1]).toBe(`נקודה ${r.map.G} על ${a}${d}`);
    expect(r.steps[2]).toBe(`${a}${a}' = k${d}${c}'`);
    expect(renameSteps(['ריבוע ABCD'])).toEqual(renameSteps(['ריבוע ABCD'])); // deterministic
  });

  it('never renames the reserved capitals (roman numerals, R, S) or a kept letter', () => {
    const r = renameSteps(['מעגל I שרדיוסו R', 'נסמן את שטח ABC ב-S', 'O ראשית'], new Set(['I', 'R', 'S', 'O']))!;
    expect(r.steps[0]).toBe('מעגל I שרדיוסו R');
    expect(r.steps[1]).toMatch(/ב-S$/);
    expect(r.steps[2]).toBe('O ראשית');
  });

  it('a renamed construction compares equal to its base, letters it chose itself included', () => {
    const base = { verdict: 'builds', shape: fingerprint([{ type: 'segment', id: 'seg-CO', a: 'C', b: 'O' }, { type: 'point', id: 'D' }]) };
    const renamed = { verdict: 'builds', shape: fingerprint([{ type: 'segment', id: 'seg-OU', a: 'U', b: 'O' }, { type: 'point', id: 'A' }]) };
    expect(difference(base, renamed, { C: 'U' })).toBeNull();
    expect(anonymise('"seg-CO"')).toBe(anonymise('"seg-OC"'));
  });

  it('spacing inside a stored string and a text-derived id are spelling, not structure', () => {
    expect(fingerprint({ eq: 'y = x', id: 'curve-anon12ab' })).toBe(fingerprint({ eq: 'y=x', id: 'curve-anonzz99' }));
    expect(fingerprint({ src: 'AB = 6', a: 'A' })).toBe(fingerprint({ src: 'AB=6.', a: 'A' }));
  });
});

describe('#2654 — the sweep and the ratchet', () => {
  const stub = (bad: (line: string) => boolean) => (_ctx: readonly string[], lines: readonly string[]) =>
    lines.map((l) => (bad(l) ? { verdict: 'not-handled' } : { verdict: 'builds' }));

  it('a variant the stub reads differently is a failing variant, named by operator', async () => {
    const bases = basesFrom('2d', ['משולש ABC'], []);
    const report = await sweep('2d', bases, stub((l) => l.endsWith('.')));
    expect(report.failing.map((f) => f.operator)).toEqual(['trailing-period']);
    expect(report.variants['trailing-period']).toBe(1);
  });

  it('a base whose context does not build is reported as skipped, never as a pass', async () => {
    const report = await sweep('2d', [{ builder: '2d', context: ['x'], sentence: 'משולש ABC' }], () => null);
    expect(report.skipped).toEqual(['משולש ABC']);
  });

  it('fails on a NEW failing variant and on a listed one that agrees now', () => {
    const row = (base: string): FailingVariant => ({ builder: '2d', base, variant: `${base}.`, operator: 'trailing-period', differs: 'x' });
    expect(ratchetFaults([row('a')], [row('a')])).toEqual([]);
    expect(ratchetFaults([row('a'), row('b')], [row('a')])[0]).toMatch(/^NEW failing sibling/);
    expect(ratchetFaults([], [row('a')])[0]).toMatch(/remove it from known-2d\.json/);
  });

  it('the complex builder is never renamed (z, w, u name kinds of number)', () => {
    expect(variantsOf({ builder: 'complex', context: [], sentence: 'A = 5+i' }).some((v) => v.operator === 'rename-letters')).toBe(false);
  });
});
