/**
 * Issue #1986 (ADR-3D-418, amending ADR-3D-322's "Not fixed, reported") — a declared ring that a configuration or a
 * coordinate letter can make simple is DRAWN simple, never crossed and green.
 *
 * Operator rulings: #1927, 2026-10-09 — *"Search first, refuse last … When a letter in the sentence can move the
 * shape, hunt for a value that makes it valid and DRAW it. Refuse only when nothing the student wrote can save it"*;
 * #1986 / #1987, 2026-10-10 — P2, the 3-D plan in `firstSatisfyingSeed3`.
 *
 * Measured before (main @ ebacadd1, `decideSubmit3` → `derive3`): «דלתון ABCD · מרובע ABDC», «מרובע ABCD · מרובע ABDC»
 * and «A(k,0,0) · B(4,0,0) · C(1,3,0) · D(3,3,0) · טרפז ABCD» (and its «מרובע ABCD») all recorded with the ring crossed
 * at seeds 0–3 — k drawn at −0.01, −2.12, −0.98, −0.20.
 *
 * Three roots, three mechanisms: the flat quadrilateral's seat was always convex (the concave seat,
 * `polygon4ConcaveDims`, registered by `concaveSeatVertices3`); the display-seed search never asked whether a ring is
 * simple (the ring preference in `meetsShapePreferences3`); and an unpinned coordinate letter was drawn only inside
 * [−3, 3] (the reach, `ringReachValue3`).
 */

import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, useGeo3, type Fact3 } from '../store/store3';
import { ringSelfCrossing3, type Vec3 } from '../engine/vec3';
import { solidDims } from '../engine/evaluate';
import { concaveSeatVertices3 } from '../engine/baseShapes';

type St = { facts: Fact3[]; seed: number };
function play(lines: readonly string[], seed = 0) {
  let n = 0;
  let st: St = { facts: [], seed };
  const kinds: string[] = [];
  let error: unknown = null;
  for (const line of lines) {
    const v = decideSubmit3(st, line, () => `f${++n}`);
    kinds.push(v.kind);
    if (v.kind === 'refused') error = v.error;
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return { st, kinds, error };
}
const at = (st: St, s = st.seed) => {
  const d = derive3(st.facts, s);
  return { d, p: (id: string) => d.positions.get(id) as Vec3 };
};
const ring = (p: (id: string) => Vec3, ids: string) => [...ids].map((id) => p(id));
const simple = (p: (id: string) => Vec3, ids: string) => !ringSelfCrossing3(ring(p, ids));
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const allGreen = (st: St) => Object.values(derive3(st.facts, st.seed).status).every((s) => s === 'ok');
/** convex: every corner turns the same way (the ring is simple and has no reflex vertex) */
const convex = (pts: Vec3[]) => {
  const sg = pts.map((q, i) => {
    const a = pts[(i + 3) % 4];
    const b = pts[(i + 1) % 4];
    return Math.sign((q.x - a.x) * (b.y - q.y) - (q.y - a.y) * (b.x - q.x));
  });
  return sg.every((s) => s === sg[0]);
};
const SEEDS = [0, 1, 2, 3, 4, 5];

const KITE = ['דלתון ABCD', 'מרובע ABDC'];
const QUADS = ['מרובע ABCD', 'מרובע ABDC'];
const TRAP = ['A(k,0,0)', 'B(4,0,0)', 'C(1,3,0)', 'D(3,3,0)', 'טרפז ABCD'];
const TRAP_QUAD = ['A(k,0,0)', 'B(4,0,0)', 'C(1,3,0)', 'D(3,3,0)', 'מרובע ABCD'];

describe('#1986 the reported rows record green and draw every declared ring simple, at every starting seed', () => {
  it.each([
    [KITE, ['ABCD', 'ABDC']],
    [QUADS, ['ABCD', 'ABDC']],
    [TRAP, ['ABCD']],
    [TRAP_QUAD, ['ABCD']],
  ])('%j', (lines, rings) => {
    for (const s of SEEDS) {
      const r = play(lines, s);
      expect(r.kinds).toEqual(lines.map(() => 'record'));
      expect(allGreen(r.st)).toBe(true);
      const { p } = at(r.st);
      for (const ids of rings) expect(simple(p, ids), `seed ${s}: ${ids}`).toBe(true);
    }
  });
});

describe('#1986 the drawings are the shapes the sentence names', () => {
  it('the kite pair is a DART that is still a kite (|AB| = |AD|, |CB| = |CD|)', () => {
    for (const s of SEEDS) {
      const { p } = at(play(KITE, s).st);
      expect(dist(p('A'), p('B'))).toBeCloseTo(dist(p('A'), p('D')), 6);
      expect(dist(p('C'), p('B'))).toBeCloseTo(dist(p('C'), p('D')), 6);
      expect(convex(ring(p, 'ABCD'))).toBe(false);
    }
  });

  it('the quadrilateral pair is non-convex with both rings simple', () => {
    for (const s of SEEDS) {
      const { p } = at(play(QUADS, s).st);
      expect(convex(ring(p, 'ABCD'))).toBe(false);
      expect(simple(p, 'ABCD') && simple(p, 'ABDC')).toBe(true);
    }
  });

  it('the coordinate letter is drawn past its default window: k > 4, never the parallelogram k = 6, and it varies', () => {
    const ks = new Set<string>();
    for (const s of SEEDS) {
      const { p } = at(play(TRAP, s).st);
      const k = p('A').x;
      expect(k).toBeGreaterThan(4);
      expect(Math.abs(k - 6)).toBeGreaterThan(1e-3);
      ks.add(k.toFixed(6));
    }
    expect(ks.size).toBeGreaterThan(1);
  });

  it('the widened draw is pure over (facts, seed): the same configuration re-derives the same figure', () => {
    const r = play(TRAP);
    expect(at(r.st).p('A')).toEqual(at({ facts: r.st.facts.map((f) => ({ ...f })), seed: r.st.seed }).p('A'));
  });
});

describe('#1986 «הציגו תצורה אחרת» keeps every declared ring simple and changes the drawing', () => {
  it.each([
    [KITE, ['ABCD', 'ABDC']],
    [QUADS, ['ABCD', 'ABDC']],
    [TRAP, ['ABCD']],
  ])('%j', (lines, rings) => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    for (const l of lines) useGeo3.getState().submit(l);
    expect(useGeo3.getState().lastError).toBeNull();
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const { facts, seed } = useGeo3.getState();
      const { p } = at({ facts, seed });
      for (const ids of rings) expect(simple(p, ids), `press ${i}: ${ids}`).toBe(true);
      seen.add(['A', 'B', 'C', 'D'].map((id) => `${p(id).x.toFixed(4)},${p(id).y.toFixed(4)}`).join(';'));
      useGeo3.getState().resample();
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('#1986 the axis is inert on a single ring (bit-identical to before)', () => {
  it('a lone «מרובע ABCD» keeps the convex seat exactly', () => {
    for (const s of SEEDS) {
      const r = play(['מרובע ABCD'], s);
      expect(concaveSeatVertices3(derive3(r.st.facts, r.st.seed).construction, ['A', 'B', 'C', 'D'])).toBeNull();
      const { p } = at(r.st);
      const [x2, y2, x3, y3] = solidDims('polygon4', 'solid-polygon4-ABCD', r.st.seed);
      expect(r.st.seed).toBe(s);
      expect([p('C').x, p('C').y, p('D').x, p('D').y]).toEqual([x2, y2, x3, y3]);
    }
  });

  // its seed is the kite's own #615 preference (a VISIBLE kite: seeds 1–3 move on to 4, as before this fix)
  it('a lone «דלתון ABCD» is a convex kite with no concave seat registered', () => {
    for (const s of SEEDS) {
      const r = play(['דלתון ABCD'], s);
      expect(concaveSeatVertices3(derive3(r.st.facts, r.st.seed).construction, ['A', 'B', 'C', 'D'])).toBeNull();
      expect(convex(ring(at(r.st).p, 'ABCD'))).toBe(true);
    }
  });

  it('deleting the second ring puts the convex seat back', () => {
    const r = play(QUADS);
    const one = r.st.facts.slice(0, 1);
    const { p } = at({ facts: one, seed: r.st.seed });
    expect(convex(ring(p, 'ABCD'))).toBe(true);
  });
});

describe('#1986 refuse last — the rings nothing can save are still refused in ADR-3D-322’s words', () => {
  it.each([
    [['ריבוע ABCD', 'מרובע ABDC']],
    [['מלבן ABCD', 'מרובע ABDC']],
    [['טרפז ABCD', 'מרובע ABDC']],
  ])('%j', (lines) => {
    for (const s of [0, 1, 2, 3]) {
      const r = play(lines, s);
      expect(r.kinds).toEqual(['record', 'refused']);
      expect(r.error).toEqual({ code: 'ring-crossed', stated: lines[1] });
    }
  });

  it('a ring over a coordinate letter whose fixed sides cross for every value is refused on the line that completed it', () => {
    // BC and DE cross at (1,1,0) whatever k is: no draw of the letter can save the pentagon
    const lines = ['A(k,5,0)', 'B(0,0,0)', 'C(2,2,0)', 'D(0,2,0)', 'E(2,0,0)', 'מחומש ABCDE'];
    const r = play(lines);
    expect(r.kinds).toEqual([...lines.slice(0, -1).map(() => 'record'), 'refused']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: 'מחומש ABCDE' });
  });
});
