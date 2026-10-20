/**
 * #2418 ([ADR-AG-321](../../docs/06c-decisions-analytic.md#adr-ag-321)) — A COMMON TANGENT READS EVERY LINE THAT PINS IT
 * TO THE TOUCH POINT, IN ANY ORDER; THE PAIR'S POSITION DECIDES THE ONLY TANGENT.
 *
 * Operator ruling, 2026-10-20 (#2418, «2418 - accept recommendations»): «AB משיק משותף…» first, then «T על AB»: AB is
 * redrawn as the common tangent at T, the same figure as the other order.
 *
 * The class: whether a common tangent touches at the circles' stated touch point was decided from the lines typed BEFORE
 * it (ADR-AG-312's pre-pass), so a line pinning it to T was read when it came first and was a contradiction when it came
 * later. Three repairs: the pre-pass reads every admitted line (R1); a later line that re-decided the tangent records
 * (`narrowed`), never «already known» (R2); a pair whose only common tangent of the stated kind is the touch tangent is
 * lowered there in any order (R3: inside-touching circles; the internal tangent of outside-touching circles).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import saved from './fixtures/issue-2418-reverse-order.analytic.json';

type Pt = { id: string; x: number; y: number };
type Verdict = { kind: string; line?: string; error?: { key?: string; detail?: string } };

/** Submit line by line; every verdict, and the accepted lines. */
function submit(lines: readonly string[], seed = 0): { verdicts: Verdict[]; acc: string[] } {
  const acc: string[] = [];
  const verdicts: Verdict[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as Verdict;
    verdicts.push(v);
    if (v.kind === 'record') acc.push(v.line ?? line);
  }
  return { verdicts, acc };
}

/** Every line records; the derived points. */
function built(lines: readonly string[], seed = 0): Pt[] {
  const { verdicts, acc } = submit(lines, seed);
  verdicts.forEach((v, i) => expect(v.kind, `«${lines[i]}» → ${v.kind} ${v.error?.key ?? ''}`).toBe('record'));
  const d = derive(acc, seed);
  expect(d.faults).toEqual([]);
  return d.figure.points as Pt[];
}

const at = (pts: Pt[], id: string): Pt => {
  const p = pts.find((q) => q.id === id);
  expect(p, `${id} missing`).toBeDefined();
  return p!;
};
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
const toLine = (p: Pt, a: Pt, b: Pt) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / dist(a, b);

/** AB passes through T and is tangent to both circles (centre o radius ro, centre k radius rk) — from the centres and radii. */
function expectTangentAtT(pts: Pt[], o: string, ro: number, k: string, rk: number) {
  const [A, B, T, O, K] = [at(pts, 'A'), at(pts, 'B'), at(pts, 'T'), at(pts, o), at(pts, k)];
  expect(dist(A, B)).toBeGreaterThan(1e-3);
  expect(toLine(T, A, B)).toBeLessThan(1e-6);
  expect(toLine(O, A, B)).toBeCloseTo(ro, 5);
  expect(toLine(K, A, B)).toBeCloseTo(rk, 5);
}
/** AB is the vertical line x = c. */
function expectVertical(pts: Pt[], c: number) {
  expect(at(pts, 'A').x).toBeCloseTo(c, 5);
  expect(at(pts, 'B').x).toBeCloseTo(c, 5);
}

const Q2 = ['a הוא פרמטר חיובי', 'נתון מעגל שמרכזו M(a,0) ורדיוסו r', 'נתון מעגל שמרכזו N(13,0) ורדיוסו 2r', 'המעגלים משיקים מבחוץ', 'MN = 9', 'a < 13'];
const FX = ['נתון מעגל שמרכזו M(4,0) ורדיוסו 3', 'נתון מעגל שמרכזו N(13,0) ורדיוסו 6', 'המעגלים משיקים בנקודה T'];
const INT = ['נתון מעגל שמרכזו O(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו K(3,0) ורדיוסו 2', 'מעגל O ומעגל K משיקים בנקודה T'];
const TANGENT = 'AB משיק משותף למעגלים M ו-N';
const SEEDS = [0, 1, 2, 3];

/** The later lines that pin AB to T — each builds the tangent at T in the forward order. */
const LATER = [
  'T על AB',
  'T על הישר AB',
  'T נמצאת על AB',
  'הישר AB עובר דרך הנקודה T',
  'AB עובר דרך T',
  'AB משיק למעגל M בנקודה T',
  'AB משיק משותף למעגלים M ו-N בנקודה T',
];

describe('#2418 — the saved question (the operator’s exact sequence) builds green and verifies', () => {
  it('(a) the fixture records line by line at seeds 0–3; AB is x = 7, the tangent at T, as in the other order', () => {
    for (const seed of SEEDS) {
      const pts = built(saved.lines, seed);
      expectVertical(pts, 7);
      expectTangentAtT(pts, 'M', 3, 'N', 6);
      // The forward order (#2385's fixture) draws the same line.
      const forward = built([...saved.lines.slice(0, 7), saved.lines[8], saved.lines[7]], seed);
      expectVertical(forward, 7);
    }
  });
});

describe('#2418 — stability: only the not-yet-pinned touches move', () => {
  const check = (prefix: readonly string[], eps: number) => {
    for (const seed of [0, 1]) {
      const before = built([...prefix, 'המעגלים משיקים בנקודה T', TANGENT].filter((l, i, a) => a.indexOf(l) === i), seed);
      const after = built([...prefix, 'המעגלים משיקים בנקודה T', TANGENT, 'T על AB'].filter((l, i, a) => a.indexOf(l) === i), seed);
      for (const id of ['M', 'N', 'T']) {
        expect(Math.abs(at(after, id).x - at(before, id).x), id).toBeLessThan(eps);
        expect(Math.abs(at(after, id).y - at(before, id).y), id).toBeLessThan(eps);
      }
      // Both radii (T lies on both circles).
      expect(Math.abs(dist(at(after, 'M'), at(after, 'T')) - dist(at(before, 'M'), at(before, 'T')))).toBeLessThan(eps);
      expect(Math.abs(dist(at(after, 'N'), at(after, 'T')) - dist(at(before, 'N'), at(before, 'T')))).toBeLessThan(eps);
    }
  };
  it('(b) fixed circles: M, N, T and both radii within 1e-9', () => check(FX.slice(0, 2), 1e-9));
  it('(b) Q2: M, N, T and both radii within 1e-6', () => check(Q2, 1e-6));
});

describe('#2418 — every later spelling records and draws the tangent at T', () => {
  for (const later of LATER) {
    it(`(c) «${later}» after the tangent records (never «already known») and draws x = 7`, () => {
      const { verdicts } = submit([...FX, TANGENT, later]);
      expect(verdicts.map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record', 'record']);
      const pts = built([...FX, TANGENT, later]);
      expectVertical(pts, 7);
      expectTangentAtT(pts, 'M', 3, 'N', 6);
    });
  }
  it('(c) on Q2 at seeds 0–2', () => {
    for (const seed of [0, 1, 2]) expectVertical(built([...Q2, 'המעגלים משיקים בנקודה T', TANGENT, 'T על הישר AB'], seed), 7);
  });
  it('(c) «לשני המעגלים»', () => expectVertical(built([...FX, 'AB משיק משותף לשני המעגלים', 'T על AB']), 7));
  it('(c) an unrelated line in between', () => expectVertical(built([...FX, TANGENT, 'נקודה Q', 'T על AB']), 7));
  it('(c) existing free A and B', () => {
    const pts = built([...FX, 'נקודה A', 'נקודה B', TANGENT, 'T על AB']);
    expectVertical(pts, 7);
    expectTangentAtT(pts, 'M', 3, 'N', 6);
  });
  it('(c) free circles: the same figure in either order, AB tangent at T', () => {
    const FREE = ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T'];
    const rev = built([...FREE, TANGENT, 'T על AB']);
    const fwd = built([...FREE, 'T על AB', TANGENT]);
    for (const id of ['A', 'B', 'T', 'M', 'N']) {
      expect(at(rev, id).x).toBeCloseTo(at(fwd, id).x, 6);
      expect(at(rev, id).y).toBeCloseTo(at(fwd, id).y, 6);
    }
    const [A, B, T, M, N] = ['A', 'B', 'T', 'M', 'N'].map((id) => at(rev, id));
    expect(toLine(T, A, B)).toBeLessThan(1e-6);
    // Tangent at T to both circles: AB ⟂ MT and ⟂ NT.
    expect(Math.abs((B.x - A.x) * (T.x - M.x) + (B.y - A.y) * (T.y - M.y)) / dist(A, B)).toBeLessThan(1e-5);
    expect(Math.abs((B.x - A.x) * (T.x - N.x) + (B.y - A.y) * (T.y - N.y)) / dist(A, B)).toBeLessThan(1e-5);
  });
});

describe('#2418 — the pair whose only tangent is the touch tangent', () => {
  it('(d) circles touching from inside: fresh letters draw x = 5', () => {
    const pts = built([...INT, 'AB משיק משותף למעגלים O ו-K']);
    expectVertical(pts, 5);
    expectTangentAtT(pts, 'O', 5, 'K', 2);
  });
  it('(d) existing free A and B are distinct points on x = 5', () => {
    const pts = built([...INT, 'נקודה A', 'נקודה B', 'AB משיק משותף למעגלים O ו-K']);
    expectVertical(pts, 5);
    expect(dist(at(pts, 'A'), at(pts, 'B'))).toBeGreaterThan(1e-3);
  });
  it('(d) a later «T על AB» records (it draws the segment and orders T between)', () => {
    expect(submit([...INT, 'AB משיק משותף למעגלים O ו-K', 'T על AB']).verdicts.map((v) => v.kind).at(-1)).toBe('record');
  });
  it('(d) a later «T על הישר AB» genuinely follows: «already known» (ADR-AG-020)', () => {
    expect(submit([...INT, 'AB משיק משותף למעגלים O ו-K', 'T על הישר AB']).verdicts.map((v) => v.kind).at(-1)).toBe('already-known');
  });
  it('(e) «פנימי» on its own on circles touching from outside draws the tangent at T', () => {
    const pts = built([...FX, 'AB משיק משותף פנימי למעגלים M ו-N']);
    expectVertical(pts, 7);
    expectTangentAtT(pts, 'M', 3, 'N', 6);
  });
});

describe('#2418 — refusals kept', () => {
  it('(f) «חיצוני» first, then «T על AB»: refused, naming that line; the earlier line stays', () => {
    const lines = [...FX, 'AB משיק משותף חיצוני למעגלים M ו-N', 'T על AB'];
    const { verdicts, acc } = submit(lines);
    expect(verdicts.slice(0, 4).map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    expect(verdicts[4].kind).toBe('refused');
    expect(verdicts[4].error?.key).toBe('unsatisfiable');
    expect(verdicts[4].error?.detail).toBe('T על AB');
    const d = derive(acc, 0);
    expect(d.faults).toEqual([]);
    expect(at(d.figure.points as Pt[], 'A').x).toBeCloseTo(3, 5); // still the two-touch external tangent
  });
  it('(f) circles touching from inside with no stated touch point stay refused', () => {
    const { verdicts } = submit(['מעגל O', 'מעגל K', 'מעגל O ומעגל K משיקים מבפנים', 'AB משיק משותף למעגלים O ו-K']);
    expect(verdicts.at(-1)!.kind).toBe('refused');
  });
  it('(f) «T אמצע AB» stays refused in both orders', () => {
    expect(submit([...FX, TANGENT, 'T אמצע AB']).verdicts.at(-1)!.kind).toBe('refused');
    expect(submit([...FX, 'T אמצע AB', TANGENT]).verdicts.at(-1)!.kind).toBe('refused');
  });
});

describe('#2418 — controls', () => {
  it('(g) Q2 + T + «AB משיק משותף …» alone keeps the two touches A(3, −2.83), B(11, −5.66)', () => {
    const pts = built([...Q2, 'המעגלים משיקים בנקודה T', TANGENT]);
    expect(at(pts, 'A').x).toBeCloseTo(3, 5);
    expect(at(pts, 'A').y).toBeCloseTo(-2 * Math.SQRT2, 5);
    expect(at(pts, 'B').x).toBeCloseTo(11, 5);
    expect(at(pts, 'B').y).toBeCloseTo(-4 * Math.SQRT2, 5);
  });
});
