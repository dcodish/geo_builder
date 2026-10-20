/**
 * #2385 ([ADR-AG-312](../../docs/06c-decisions-analytic.md#adr-ag-312)) — A COMMON TANGENT THROUGH THE CIRCLES' TOUCH
 * POINT IS THE TANGENT AT IT.
 *
 * Operator ruling, 2026-10-20: *"build it. it qualifies for what was asked for"* — «T על AB» · «AB משיק משותף למעגלים M
 * ו-N», with T the circles' touch point, builds: AB is the common tangent at T. Its scope ruling, the same day: only the
 * touch point builds the tangent at T; existing points that are NOT the touch point keep today's behaviour (they are
 * pulled onto the circles as touches, as 2-D does).
 *
 * The class: the common tangent was lowered at parse time as "a touches the first circle, b the second, a ≠ b", so a
 * line the figure already puts through the circles' common point — whose only common tangent there is the tangent AT
 * that point, both touches coinciding — had no configuration. M1 now decides (`common-tangent`), and it reads the
 * prefix the student stated even though the fold lands «T על AB» after the tangent's line (the deferral fixpoint).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import saved from './fixtures/issue-2385-tangent-at-touch.analytic.json';

type Pt = { id: string; x: number; y: number };
type Built = { ok: true; pts: Pt[]; faults: unknown[] } | { ok: false; line: string; key?: string };

function build(lines: readonly string[], seed = 0): Built {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as { kind: string; line?: string; error?: { key?: string } };
    if (v.kind !== 'record') return { ok: false, line, key: v.error?.key };
    acc.push(v.line ?? line);
  }
  const d = derive(acc, seed);
  return { ok: true, pts: d.figure.points as Pt[], faults: d.faults };
}

function built(lines: readonly string[], seed = 0): Extract<Built, { ok: true }> {
  const b = build(lines, seed);
  if (!b.ok) throw new Error(`refused at «${b.line}» (${b.key})`);
  expect(b.faults).toEqual([]);
  return b;
}

const at = (b: { pts: Pt[] }, id: string): Pt => {
  const p = b.pts.find((q) => q.id === id);
  expect(p, `${id} missing`).toBeDefined();
  return p!;
};
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
/** Distance from `p` to the line through `a` and `b`. */
const toLine = (p: Pt, a: Pt, b: Pt) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / dist(a, b);

/** Q2 of the exam (#2379): M(4,0) r=3 and N(13,0) r=6, touching at (7,0). */
const Q2 = ['a הוא פרמטר חיובי', 'נתון מעגל שמרכזו M(a,0) ורדיוסו r', 'נתון מעגל שמרכזו N(13,0) ורדיוסו 2r', 'המעגלים משיקים מבחוץ', 'MN = 9', 'a < 13'];
const T = 'המעגלים משיקים בנקודה T';
const SEEDS = [0, 1, 2, 3];

/** The line through `a` and `b` is tangent to both circles AT T: through T, at distance r from each centre. */
function expectTangentAtT(b: { pts: Pt[] }, a: string, c: string, o: string, ro: number, k: string, rk: number) {
  const [A, B, Tt, O, K] = [at(b, a), at(b, c), at(b, 'T'), at(b, o), at(b, k)];
  expect(dist(A, B)).toBeGreaterThan(1e-3);
  expect(toLine(Tt, A, B)).toBeLessThan(1e-6);
  expect(toLine(O, A, B)).toBeCloseTo(ro, 6);
  expect(toLine(K, A, B)).toBeCloseTo(rk, 6);
}

describe('#2385 — the saved question (the operator’s exact sequence) builds green and verifies', () => {
  it('the fixture records line by line; AB is x = 7, the tangent at T(7,0)', () => {
    const b = built(saved.lines, saved.seed);
    // Q2's M(a, 0) is a solved parameter (a = 4 from «MN = 9» and «a < 13»), so these are numeric: since #2380 seeds the
    // pin from its enumerated root the solve lands within ~1e-6 (solver tolerance), not 5e-7. Fixed centres keep 1e-9 below.
    expect(at(b, 'T').x).toBeCloseTo(7, 5);
    expect(at(b, 'T').y).toBeCloseTo(0, 5);
    expect(at(b, 'A').x).toBeCloseTo(7, 5);
    expect(at(b, 'B').x).toBeCloseTo(7, 5);
    expectTangentAtT(b, 'A', 'B', 'M', 3, 'N', 6);
  });
});

describe('#2385 — every spelling of the common tangent through T builds the tangent at T', () => {
  const spellings = [
    'AB משיק משותף למעגלים M ו-N',
    'AB משיק משותף לשני המעגלים',
    'AB משיק משותף פנימי למעגלים M ו-N',
    'AB is a common tangent to circles M and N',
  ];
  for (const s of spellings) {
    it.each(SEEDS)(`«${s}» at seed %i`, (seed) => {
      const b = built([...Q2, T, 'T על AB', s], seed);
      expectTangentAtT(b, 'A', 'B', 'M', 3, 'N', 6);
    });
  }

  it('the touch point AS ONE OF THE LETTERS — «TB …» and «BT …» — is the tangent at T', () => {
    for (const s of ['TB משיק משותף למעגלים M ו-N', 'BT משיק משותף למעגלים M ו-N']) {
      const b = built([...Q2, T, s]);
      expect(at(b, 'B').x).toBeCloseTo(7, 6);
      expect(Math.abs(at(b, 'B').y)).toBeGreaterThan(1e-3);
    }
  });

  it('fixed centres (no parameter) build it too', () => {
    const b = built(['נתון מעגל שמרכזו M(4,0) ורדיוסו 3', 'נתון מעגל שמרכזו N(13,0) ורדיוסו 6', T, 'T על AB', 'AB משיק משותף למעגלים M ו-N']);
    expectTangentAtT(b, 'A', 'B', 'M', 3, 'N', 6);
  });

  it('an INTERNALLY tangent pair: its one common tangent, at T(5,0)', () => {
    const b = built(['נתון מעגל שמרכזו O(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו K(3,0) ורדיוסו 2', 'מעגל O ומעגל K משיקים בנקודה T', 'T על AB', 'AB משיק משותף למעגלים O ו-K']);
    expect(at(b, 'T').x).toBeCloseTo(5, 9);
    expectTangentAtT(b, 'A', 'B', 'O', 5, 'K', 2);
  });

  it.each(SEEDS)('free circles, 2-D’s spelling of the sequence (the operator’s screenshot) at seed %i', (seed) => {
    const b = built(['מעגל M', 'מעגל N', T, 'T על AB', 'AB משיק משותף למעגלים M ו-N'], seed);
    const [M, N, A, B, Tt] = ['M', 'N', 'A', 'B', 'T'].map((id) => at(b, id));
    expect(toLine(Tt, A, B)).toBeLessThan(1e-6);
    // AB ⟂ MN at T: the line of centres passes through T, and the tangent is perpendicular to it.
    const dot = (B.x - A.x) * (N.x - M.x) + (B.y - A.y) * (N.y - M.y);
    expect(Math.abs(dot) / (dist(A, B) * dist(M, N))).toBeLessThan(1e-6);
  });
});

describe('#2385 — the refusal that stays: no EXTERNAL common tangent passes through T', () => {
  it('«AB משיק משותף חיצוני …» through T is refused «לא נמצאה תצורה…»', () => {
    const b = build([...Q2, T, 'T על AB', 'AB משיק משותף חיצוני למעגלים M ו-N']);
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.line).toBe('AB משיק משותף חיצוני למעגלים M ו-N');
      expect(b.key).toBe('unsatisfiable');
    }
  });
});

describe('#2385 — unchanged: letters that are not the touch point are still the two touches (the scope ruling)', () => {
  /** A on circle M and B on circle N, and AB tangent to each AT its letter. */
  function expectTouches(b: { pts: Pt[] }) {
    const [M, N, A, B] = ['M', 'N', 'A', 'B'].map((id) => at(b, id));
    expect(dist(M, A)).toBeCloseTo(3, 6);
    expect(dist(N, B)).toBeCloseTo(6, 6);
    expect(toLine(M, A, B)).toBeCloseTo(3, 6);
    expect(toLine(N, A, B)).toBeCloseTo(6, 6);
  }

  it('existing FREE letters are pulled onto the circles as touches', () => {
    expectTouches(built([...Q2, 'נקודה A', 'נקודה B', 'AB משיק משותף למעגלים M ו-N']));
  });

  it('existing letters already on the circles are the touches', () => {
    expectTouches(built([...Q2, 'A על מעגל M', 'B על מעגל N', 'AB משיק משותף למעגלים M ו-N']));
  });

  it('fresh letters beside a stated touch point that is NOT on AB are the touches', () => {
    expectTouches(built([...Q2, T, 'AB משיק משותף למעגלים M ו-N']));
  });

  it.each(SEEDS)('fresh letters on fixed circles: P(−10,−4) and Q(6,8) or the other external tangent, at seed %i', (seed) => {
    const b = built(['נתון מעגל שמרכזו N1(-4,-12) ורדיוסו 10', 'נתון מעגל שמרכזו N2(12,0) ורדיוסו 10', 'PQ משיק משותף למעגלים N1 ו-N2'], seed);
    const [N1, N2, P, Q] = ['N1', 'N2', 'P', 'Q'].map((id) => at(b, id));
    expect(dist(N1, P)).toBeCloseTo(10, 6);
    expect(dist(N2, Q)).toBeCloseTo(10, 6);
    expect(toLine(N1, P, Q)).toBeCloseTo(10, 6);
    expect(toLine(N2, P, Q)).toBeCloseTo(10, 6);
  });

  it('seed 0 of the fixed pair is the measured P(−10,−4), Q(6,8)', () => {
    const b = built(['נתון מעגל שמרכזו N1(-4,-12) ורדיוסו 10', 'נתון מעגל שמרכזו N2(12,0) ורדיוסו 10', 'PQ משיק משותף למעגלים N1 ו-N2']);
    expect([at(b, 'P').x, at(b, 'P').y, at(b, 'Q').x, at(b, 'Q').y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-10, -4, 6, 8]);
  });
});

describe('#2385 — stability: the circles and T do not move when the tangent is added', () => {
  const FIXED = ['נתון מעגל שמרכזו M(4,0) ורדיוסו 3', 'נתון מעגל שמרכזו N(13,0) ורדיוסו 6', T, 'T על AB'];
  it.each(SEEDS)('fixed circles, seed %i: M, N and T exactly where they were', (seed) => {
    const before = built(FIXED, seed);
    const after = built([...FIXED, 'AB משיק משותף למעגלים M ו-N'], seed);
    for (const id of ['M', 'N', 'T']) expect(dist(at(before, id), at(after, id))).toBeLessThan(1e-9);
  });
  // Q2's centre M(a,0) is a solved parameter (a = 4 by a root-find), so it holds to the solver's tolerance.
  it.each(SEEDS)('Q2, seed %i: M, N and T within the solve tolerance', (seed) => {
    const before = built([...Q2, T, 'T על AB'], seed);
    const after = built([...Q2, T, 'T על AB', 'AB משיק משותף למעגלים M ו-N'], seed);
    for (const id of ['M', 'N', 'T']) expect(dist(at(before, id), at(after, id))).toBeLessThan(1e-6);
  });
});
