/**
 * #1860 (ADR-3D-358, operator ruling 2026-10-07, ADR-W-115 Am. 1) — A DECLARED SOLID THE GIVENS FORCE FLAT IS
 * REFUSED, never drawn with a notice: *"we should refuse this as well since it contradicts the pyramid statement"*,
 * *"a flat figure is not a pyramid / prism / …"*.
 *
 * Before (b0e9dbea, `decideDeterministic3` ×24): «פירמידה SABCD · ∠BAS = 40 · ∠DAS = 50» built at 24/24 with the
 * #936 `solid-degenerate` notice (either order), and «פירמידה ישרה SABCD שבסיסה מלבן · AB = 6 · BC = 8 · SA = 5»
 * (SA is half the diagonal, so the apex lies in the base) was refused with the generic «הנתונים סותרים זה את זה …»,
 * which does not say why. Two predicates — the #872 hard gate and the #936 notice band — split one class by how
 * exactly the solver landed. Now one judgement, the declared-polygon one (ADR-3D-310), reaches every solid kind.
 * Everything runs through the App's real pre-LLM decision.
 */
import type { Seed3 } from '../engine/components3';
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { nounOfKind } from '../engine/solidSubject';
import { leastSquaresStats } from '../engine/solve3';
import type { Positions3 } from '../engine/types';

const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);
const he = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('he')(k, o) as string;
const en = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('en')(k, o) as string;
const plain = (s: string | null): string => (s ?? '').replace(/[⁦-⁩]/g, '');

function run(lines: readonly string[], seed: Seed3) {
  let st: { facts: Fact3[]; seed: Seed3 } = { facts: [], seed };
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const v = decideDeterministic3(st, lines[i], () => `f${++n}`);
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? v.error : null, kind: v.kind };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, error: null, kind: 'record' as const };
}

/** Refused on the LAST line as the named solid, forced, naming `others`; the line is not a fact. */
function refused(lines: readonly string[], seed: Seed3, solid: string, ring: string, others: readonly string[]): void {
  const r = run(lines, seed);
  const last = lines.length - 1;
  expect(r.refusedAt, `seed ${seed}: refused at «${lines[last]}» (got ${r.kind} at ${r.refusedAt})`).toBe(last);
  expect(r.error, `seed ${seed}`).toMatchObject({ code: 'polygon-collapsed', stated: lines[last], forced: true, solid, ring });
  const msg = plain(errorText3(he, r.error));
  for (const o of others) expect(msg, `seed ${seed}`).toContain(`«${o}»`);
  expect(r.st.facts.length, 'keep-prior: the refused line is not a fact').toBe(last);
}

/** Builds: every line records, every fact ok, and no flat-solid notice exists. */
function builds(lines: readonly string[], seed: Seed3): void {
  const r = run(lines, seed);
  expect(r.refusedAt, `seed ${seed}: «${lines[r.refusedAt]}» → ${JSON.stringify(r.error ?? r.kind)}`).toBe(-1);
  const d = derive3(r.st.facts, r.st.seed);
  for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
  expect(d.notices.map((x) => x.kind as string)).not.toContain('solid-degenerate');
}

describe('#1860 — the reported pyramid is refused at its third line, never drawn flat', () => {
  it('«פירמידה SABCD · ∠BAS = 40 · ∠DAS = 50» at all 24 seeds', () => {
    for (const seed of SEEDS_24) refused(['פירמידה SABCD', '∠BAS = 40', '∠DAS = 50'], seed, 'pyramid', 'SABCD', ['∠BAS = 40']);
  }, 120_000);

  it('the angles in the other order, at all 24 seeds', () => {
    for (const seed of SEEDS_24) refused(['פירמידה SABCD', '∠DAS = 50', '∠BAS = 40'], seed, 'pyramid', 'SABCD', ['∠DAS = 50']);
  }, 120_000);

  it('the exact wording, Hebrew and English (the shipped polygonForced frame with the solid noun)', () => {
    const r = run(['פירמידה SABCD', '∠BAS = 40', '∠DAS = 50'], 0);
    expect(plain(errorText3(he, r.error))).toBe('לא ניתן: «∠DAS = 50» יחד עם «∠BAS = 40» מתקיימים רק אם הפירמידה SABCD שטוחה — וגוף שטוח אינו פירמידה.');
    expect(plain(errorText3(en, r.error))).toBe("Can't do that: «∠DAS = 50» together with «∠BAS = 40» hold only if pyramid SABCD is flat — and a flat solid is not a pyramid.");
  });

  it('the solid is named the way the student wrote it («ABCDS» stays «ABCDS»)', () => {
    refused(['פירמידה ABCDS', '∠BAS = 40', '∠DAS = 50'], 0, 'pyramid', 'ABCDS', ['∠BAS = 40']);
  });
});

describe('#1860 — every declared solid the givens force flat is refused the same way, with its own noun', () => {
  it('a right pyramid whose LENGTHS put the apex in its base (was the generic «הנתונים סותרים…»), 24 seeds', () => {
    for (const seed of SEEDS_24)
      refused(['פירמידה ישרה SABCD שבסיסה מלבן', 'AB = 6', 'BC = 8', 'SA = 5'], seed, 'pyramid', 'SABCD', ['AB = 6', 'BC = 8']);
  }, 120_000);

  it.each<[string, string[], string, string, string[]]>([
    ['a tetrahedron flattened by its angles at A', ['פירמידה SABC', '∠BAS = 30', '∠CAS = 20', '∠BAC = 50'], 'pyramid', 'SABC', ['∠BAS = 30', '∠CAS = 20']],
    ['a tetrahedron flattened by lengths (S on AB)', ['פירמידה SABC', 'SA = 1', 'SB = 2', 'AB = 3'], 'pyramid', 'SABC', ['SA = 1', 'SB = 2']],
    ['a box driven to zero height (the space diagonal equals the base diagonal)', ["תיבה ABCDA'B'C'D'", 'AB = 3', 'BC = 4', "A'C = 5"], 'box', "ABCDA'B'C'D'", ['AB = 3', 'BC = 4']],
    ["a right prism driven to zero height (A'B = AB)",["מנסרה ישרה משולשת ABCA'B'C'", 'AB = 3', "A'B = 3"], 'prism', "ABCA'B'C'", ['AB = 3']],
  ])('%s', (_n, lines, solid, ring, others) => {
    for (const seed of [0, 5, 11, 23]) refused(lines, seed, solid, ring, others);
  }, 120_000);

  it('…while a statement whose claim is its own ARBITER keeps the claim register (the ADR-3D-030 pin-and-claim pattern)', () => {
    // a relation recorded as a claim with no `given` — a wrong answer that only a flat box would satisfy — is
    // refuted as an answer, exactly as before; the solid refusal is for the GIVENS that force the flatness
    for (const seed of [0, 5, 11, 23]) {
      const r = run(["תיבה ABCDA'B'C'D'", "המישור ABC מתלכד עם המישור A'B'C'"], seed);
      expect(r.refusedAt).toBe(1);
      expect(r.error).toEqual({ code: 'claim-refuted' });
    }
  });

  it('every non-flat kind has a noun, and a flat polygon kind has none', () => {
    expect(nounOfKind('tetra')).toBe('pyramid');
    expect(nounOfKind('pyramidTrapR')).toBe('pyramid');
    expect(nounOfKind('prismReg6')).toBe('prism');
    expect(nounOfKind('parallelepiped')).toBe('prism');
    expect(nounOfKind('cube')).toBe('cube');
    expect(nounOfKind('box')).toBe('box');
    expect(nounOfKind('polygon4')).toBeNull();
  });
});

describe('#1860 — a thin but real solid builds, with no notice and no refusal', () => {
  it.each<[string, string[]]>([
    ['41 / 50, one degree off complementary', ['פירמידה SABCD', '∠BAS = 41', '∠DAS = 50']],
    ['50 / 60', ['פירמידה SABCD', '∠BAS = 50', '∠DAS = 60']],
    ['«SA = 5.1», just above half the diagonal', ['פירמידה ישרה SABCD שבסיסה מלבן', 'AB = 6', 'BC = 8', 'SA = 5.1']],
    ["a box just above flat («A'C = 5.1»)", ["תיבה ABCDA'B'C'D'", 'AB = 3', 'BC = 4', "A'C = 5.1"]],
    ["a right prism just above flat («A'B = 3.1»)", ["מנסרה ישרה משולשת ABCA'B'C'", 'AB = 3', "A'B = 3.1"]],
    ['a tetrahedron one degree off flat', ['פירמידה SABC', '∠BAS = 30', '∠CAS = 20', '∠BAC = 49']],
  ])('%s, at all 24 seeds', (_n, lines) => {
    for (const seed of SEEDS_24) builds(lines, seed);
  }, 120_000);
});

/**
 * #2799 (ADR-3D-464) — A SOLID THE GIVENS HOLD ONLY AT ONE POINT IS REFUSED THE SAME WAY. «קובייה» · A, B, C on the
 * x-axis (three corners of a square are never collinear) was all green with the whole cube drawn at one point: the
 * collapse judge read the canonical figure and never the gauge's scale, so a solve that drove the scale to 0 passed.
 * The judge reads the drawn size now; the line that completes the set is refused in the flat-solid words, and quickly
 * (the cold sweeps stop on a candidate already exact at a point, docs/17 §7), where it took 8–176 s.
 */
describe('#2799 — vertices stated on one axis that hold only at a point are refused, naming the statements', () => {
  const CUBE = "קובייה ABCDA'B'C'D'";
  const ax = (v: string, a = 'x') => `הקודקוד ${v} נמצא על ציר ה-${a}`;
  const SEEDS_8 = [0, 1, 2, 3, 4, 5, 6, 7];

  it('the report «A, B, C on the x-axis», at seeds 0–7', () => {
    for (const seed of SEEDS_8) refused([CUBE, ax('A'), ax('B'), ax('C')], seed, 'cube', "ABCDA'B'C'D'", [ax('A'), ax('B')]);
  }, 120_000);

  it('every order of the three axis lines refuses the line that completes the set', () => {
    const three = [ax('A'), ax('B'), ax('C')];
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      refused([CUBE, three[i], three[j], three[k]], 3, 'cube', "ABCDA'B'C'D'", [three[i], three[j]]);
    }
  }, 120_000);

  it.each<[string, string[], string, string, string[]]>([
    ['the z-axis', [CUBE, ax('A', 'z'), ax('B', 'z'), ax('C', 'z')], 'cube', "ABCDA'B'C'D'", [ax('A', 'z'), ax('B', 'z')]],
    ["A, B and A'", [CUBE, ax('A'), ax('B'), ax("A'")], 'cube', "ABCDA'B'C'D'", [ax('A'), ax('B')]],
    ['A at the origin, then B and C', [CUBE, 'A בראשית הצירים', ax('B'), ax('C')], 'cube', "ABCDA'B'C'D'", ['A בראשית הצירים', ax('B')]],
    ['a box', ["תיבה ABCDA'B'C'D'", ax('A'), ax('B'), ax('C')], 'box', "ABCDA'B'C'D'", [ax('A'), ax('B')]],
    ['a square pyramid, A, B, C', ['פירמידה SABCD שבסיסה ריבוע', ax('A'), ax('B'), ax('C')], 'pyramid', 'SABCD', [ax('A'), ax('B')]],
    ['a square pyramid, the apex on a base edge’s line', ['פירמידה SABCD שבסיסה ריבוע', ax('S'), ax('A'), ax('B')], 'pyramid', 'SABCD', [ax('S'), ax('A')]],
    ['a triangular pyramid', ['פירמידה משולשת SABC', ax('A'), ax('B'), ax('C')], 'pyramid', 'SABC', [ax('A'), ax('B')]],
    ['a prism', ["מנסרה ABCA'B'C'", ax('A'), ax('B'), ax('C')], 'prism', "ABCA'B'C'", [ax('A'), ax('B')]],
    ['a right triangular prism', ['מנסרה ישרה משולשת ABC', ax('A'), ax('B'), ax('C')], 'prism', "ABCA'B'C'", [ax('A'), ax('B')]],
  ])('%s', (_n, lines, solid, ring, others) => {
    for (const seed of [0, 5]) refused(lines, seed, solid, ring, others);
  }, 120_000);

  it('the refused line is cheap: a bounded number of residual evaluations (was 144k–751k, 8–176 s)', () => {
    for (const lines of [[CUBE, ax('A'), ax('B'), ax('C')], ['פירמידה SABCD שבסיסה ריבוע', ax('A'), ax('B'), ax('C')]]) {
      let st: { facts: Fact3[]; seed: Seed3 } = { facts: [], seed: 0 };
      let n = 0;
      for (const l of lines.slice(0, -1)) {
        const v = decideDeterministic3(st, l, () => `f${++n}`);
        if (v.kind !== 'record') throw new Error(l);
        st = { facts: v.facts, seed: v.seed };
      }
      const evals0 = leastSquaresStats.evals;
      const v = decideDeterministic3(st, lines[lines.length - 1], () => `f${++n}`);
      expect(v.kind).toBe('refused');
      expect(leastSquaresStats.evals - evals0, lines[0]).toBeLessThan(80_000);
    }
  }, 120_000);

  /** Every line ok, and every declared solid drawn at its normal size (|AB| ≥ 0.5). */
  const fullSize = (lines: readonly string[], seed: Seed3): Positions3 => {
    builds(lines, seed);
    const r = run(lines, seed);
    const pos = derive3(r.st.facts, r.st.seed).positions;
    expect(Math.hypot(pos.get('A')!.x - pos.get('B')!.x, pos.get('A')!.y - pos.get('B')!.y, pos.get('A')!.z - pos.get('B')!.z), `|AB| @${seed}`).toBeGreaterThan(0.5);
    return pos;
  };

  it('controls that hold: B, D on the x-axis; A, C; A, C′; A, B on x with C on z; B on +x with D on −x', () => {
    for (const lines of [
      [CUBE, ax('B'), ax('D')],
      [CUBE, ax('A'), ax('C')],
      [CUBE, ax('A'), ax("C'")],
      [CUBE, ax('A'), ax('B'), ax('C', 'z')],
      [CUBE, 'הקודקוד B נמצא על החלק החיובי של ציר ה-x', 'הקודקוד D נמצא על החלק השלילי של ציר ה-x'],
    ]) for (const seed of [0, 1, 2, 3]) fullSize(lines, seed);
  }, 120_000);

  it('a figure the student placed at a small stated size is not a point («A(0,0,0)» · «B(0.01,0,0)»)', () => {
    for (const seed of [0, 1, 2, 3]) {
      builds([CUBE, 'A(0,0,0)', 'B(0.01,0,0)'], seed);
      const r = run([CUBE, 'A(0,0,0)', 'B(0.01,0,0)'], seed);
      const pos = derive3(r.st.facts, r.st.seed).positions;
      expect(pos.get('B')!.x - pos.get('A')!.x).toBeCloseTo(0.01, 9);
    }
  });

  it('a figure that exists is drawn at its normal size: «B, D on +x» (was a point at five seeds of eight), and in English', () => {
    for (const lines of [
      [CUBE, 'הקודקוד B נמצא על החלק החיובי של ציר ה-x', 'הקודקוד D נמצא על החלק החיובי של ציר ה-x'],
      [CUBE, 'B is on the positive x-axis', 'D is on the positive x-axis'],
    ]) {
      for (const seed of SEEDS_24) {
        const pos = fullSize(lines, seed);
        for (const v of ['B', 'D']) {
          expect(pos.get(v)!.x, `${v}.x @${seed}`).toBeGreaterThan(0);
          expect(Math.abs(pos.get(v)!.y) + Math.abs(pos.get(v)!.z)).toBeLessThan(1e-9);
        }
      }
    }
  }, 240_000);
});
