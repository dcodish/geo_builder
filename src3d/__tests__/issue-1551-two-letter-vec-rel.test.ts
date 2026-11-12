/**
 * #1551 ([ADR-3D-472](../../docs/06b-decisions-3d.md#adr-3d-472)) — a vector relation with SEVERAL letters.
 *
 * pipeline-lock: the outcomes are the store's — the fold's «already-stated» rule a new letter must pass, the
 * contradiction register a relation no shape satisfies reaches, the reshaped box the pivot returns and the params
 * rows the panel prints — so no single module call can make these checks; the exam itself is the fixture
 * `fixtures3/bagrut-03572-q2-1551.geo3.json`.
 *
 * Bagrut 2026 summer, 03572 Q2 (operator, 2026-09-29: *"this is the bagrut exam this comes from so its not something
 * we can ignore"*): «EM = a·EA + b·EC» was not understood. Over placed points the letters are solved per drawing by
 * least squares, the relation lowered to the same `vec-eq` given its numeric twin is; over a new point each letter is
 * a free number.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { resolve3 } from '../engine/evaluate';
import type { Construction3 } from '../engine/types';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submitAll = (lines: string[]) => {
  reset();
  for (const l of lines) {
    useGeo3.getState().submit(l);
    expect(useGeo3.getState().lastError, l).toBeNull();
  }
  const st = useGeo3.getState();
  return derive3(st.facts, st.seed).construction;
};
const params = (c: Construction3) => Object.fromEntries(dataView(c, 0).params.map((p) => [p.sym, p.value]));
const len = (c: Construction3, s: number, a: string, b: string) => {
  const p = resolve3(c, s).positions;
  const P = p.get(a)!, Q = p.get(b)!;
  return Math.hypot(Q.x - P.x, Q.y - P.y, Q.z - P.z);
};

const BOX = ["תיבה ABCDA'B'C'D'", 'AD=u', 'AB=v', "AA'=w", "E אמצע BB'"];
const EXAM = [...BOX, 'BM=u/6-2v/3+w/12'];

beforeEach(reset);

describe('#1551 — the exam: letters over placed points are solved', () => {
  it('(a) the exam builds; a = 2/3, b = 1/6; EM lies in plane AEC; the box is 2/1/4 after the last two lines', () => {
    const c = submitAll([...EXAM, 'EM = a·EA + b·EC', 'מישור AEC', '|w| = 4', 'BM ⊥ AEC']);
    for (const s of [0, 1, 2]) expect(dataView(c, s).params.filter((p) => !p.open).map((p) => p.text)).toEqual(['a = 2/3', 'b = 1/6']);
    const mutual = dataView(c, 0).mutual.map((m) => `${m.a} ${m.rel} ${m.b}`);
    expect(mutual).toContain('EM contained AEC');
    for (const s of [0, 1, 2]) {
      expect(len(c, s, 'A', 'D')).toBeCloseTo(2, 6);
      expect(len(c, s, 'A', 'B')).toBeCloseTo(1, 6);
      expect(len(c, s, 'A', "A'")).toBeCloseTo(4, 6);
    }
    expect(answerQuery(c, 'a', 0).answer).toBe('2/3');
    expect(dataView(c, 0).stated).toContain('EM⃗ = aEA⃗ + bEC⃗');
  });

  it.each(['EM=a*EA+b*EC', 'EM = a·EA + b·EC', 'EM=aEA+bEC'])('(b) «%s» gives the same letters', (line) => {
    expect(params(submitAll([...EXAM, line]))).toEqual({ a: '2/3', b: '1/6' });
  });

  it('(b) Greek letters take the same path', () => {
    expect(params(submitAll([...EXAM, 'EM = αEA + βEC']))).toEqual({ α: '2/3', β: '1/6' });
  });

  it('(c) one letter beside a number: «EM = aEA + 1/6EC» gives a = 2/3 (was «no position of M»)', () => {
    expect(params(submitAll([...EXAM, 'EM = aEA + 1/6EC']))).toEqual({ a: '2/3' });
  });

  it('(i) stability: adding the relation moves no point', () => {
    const before = resolve3(submitAll(EXAM), 0).positions;
    const after = resolve3(submitAll([...EXAM, 'EM = a·EA + b·EC']), 0).positions;
    for (const [id, p] of before) {
      const q = after.get(id)!;
      expect(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z), id).toBeLessThan(1e-9);
    }
  });
});

describe('#1551 — a relation that holds only for some shapes reshapes the box (ruling 2026-10-13)', () => {
  it('(d) «M על BD\'» · «AM ⊥ BD\'»: AD² + AA\'² = 3·AB² at every seed, one dim still free; a = b = 1/4', () => {
    const c = submitAll([...BOX, "M על BD'", "AM ⊥ BD'", 'EM = a·EA + b·EC']);
    const ads = new Set<string>();
    for (let s = 0; s < 24; s++) {
      const ad = len(c, s, 'A', 'D'), aa = len(c, s, 'A', "A'"), ab = len(c, s, 'A', 'B');
      expect((ad * ad + aa * aa) / (3 * ab * ab), `seed ${s}`).toBeCloseTo(1, 5);
      ads.add((ad / ab).toFixed(4));
    }
    expect(ads.size, 'the box is not one shape').toBeGreaterThan(1);
    expect(params(c)).toEqual({ a: '1/4', b: '1/4' });
  });

  it('(j) the numeric twin and the symbolic spelling give the same box', () => {
    const sym = submitAll([...BOX, "M על BD'", "AM ⊥ BD'", 'EM = a·EA + b·EC']);
    const num = submitAll([...BOX, "M על BD'", "AM ⊥ BD'", 'EM = 1/4EA + 1/4EC']);
    for (const s of [0, 1, 2]) for (const [a, b] of [['A', 'D'], ['A', 'B'], ['A', "A'"]] as const) expect(len(sym, s, a, b)).toBeCloseTo(len(num, s, a, b), 5);
  });

  it('(e) a rider: «M על BD\'» · «EM = aEA + bEC» puts M at BM:MD\' = 1:3', () => {
    const c = submitAll([...BOX, "M על BD'", 'EM = aEA + bEC']);
    for (const s of [0, 1, 2]) expect(len(c, s, 'B', 'M') / len(c, s, 'B', "D'")).toBeCloseTo(1 / 4, 6);
  });

  it('(f) a relation no shape satisfies is refused, naming the sentence', () => {
    submitAll(BOX);
    useGeo3.getState().submit("EB' = a·EA + b·EC");
    expect(useGeo3.getState().lastError).toEqual({ code: 'givens-contradict', stated: "EB' = a·EA + b·EC", others: [] });
  });

  it('(f) one letter between two placed vertices no shape aligns: refused naming the sentence (#932: never the apex)', () => {
    submitAll(['פירמידה SABCD שבסיסה ריבוע']);
    useGeo3.getState().submit('SB = t·SA');
    expect(useGeo3.getState().lastError).toEqual({ code: 'givens-contradict', stated: 'SB = t·SA', others: [] });
  });
});

describe('#1551 — a new point: each letter a free number', () => {
  it('(g) «EN = a*EA + b*EC» puts N in plane EAC, a and b open; another configuration moves N inside the plane', () => {
    const c = submitAll([...BOX, 'EN = a*EA + b*EC']);
    expect(dataView(c, 0).params.map((p) => p.text)).toEqual(['a = ?', 'b = ?']);
    const rel = new Set<string>();
    for (const s of [0, 1, 2, 3]) {
      const p = resolve3(c, s).positions;
      const [E, A, C, N] = ['E', 'A', 'C', 'N'].map((id) => p.get(id)!);
      const u = { x: A.x - E.x, y: A.y - E.y, z: A.z - E.z };
      const v = { x: C.x - E.x, y: C.y - E.y, z: C.z - E.z };
      const w = { x: N.x - E.x, y: N.y - E.y, z: N.z - E.z };
      const triple = w.x * (u.y * v.z - u.z * v.y) - w.y * (u.x * v.z - u.z * v.x) + w.z * (u.x * v.y - u.y * v.x);
      expect(Math.abs(triple), `seed ${s}`).toBeLessThan(1e-9);
      rel.add(`${w.x.toFixed(4)},${w.y.toFixed(4)}`);
    }
    expect(rel.size).toBeGreaterThan(1);
    // the panel and the ask write EN in its letters (#1829's read-off)
    expect(answerQuery(c, 'EN', 0).answer).toContain('a');
    expect(answerQuery(c, 'EN', 0).answer).toContain('b');
  });

  it('(h) degree 2 stays refused: «EM = ab·EA», «EM = a²EA»', () => {
    for (const line of ['EM = ab·EA', 'EM = a²EA']) {
      submitAll(EXAM);
      useGeo3.getState().submit(line);
      expect(useGeo3.getState().lastError, line).not.toBeNull();
    }
  });
});
