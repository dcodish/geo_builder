/**
 * #984 (ADR-3D-243) — a construction's SCAFFOLDING must not appear on the canvas as visible work.
 *
 * Operator, playing round #974 T16: *"On the parallelogram, BD is drawn and no one asked for it so
 * that is wrong implementation"*.
 *
 * «משולש ABC» then «מקבילית ABCD» drew three segments — `DC` and `AD`, the ring's own missing sides
 * (correct: a stated shape leaves a visible trace, ADR-3D-035), and **`BD`, a diagonal of the quad
 * the student never mentioned**. It was every member of the parallelogram family, and it was there
 * from #587/ADR-3D-152 onwards.
 *
 * The cause was the mechanism, not the drawing code: the one-unknown arm derived the corner with a
 * `vec-rel` command, and `vec-rel` emits a carrier `segment3` for the vector it relates — right when
 * the student pointed at that vector («נסמן: AB = u»), wrong when the vec-rel is pure machinery for
 * "where D goes". ADR-3D-243 gives the corner its own `PointDef` kind, exactly as #601/ADR-3D-240's
 * kite does, so the closed form draws nothing at all and the two one-unknown arms converge.
 *
 * The whole family is asserted, not the reported noun: a per-noun fix would be the patch this class
 * of defect invites.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const build = (lines: string[], seed = 0) => {
  reset();
  useGeo3.setState({ seed });
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  return { st, d: derive3(st.facts, st.seed) };
};
/** Every segment the figure carries, as unordered letter pairs — the ink a student actually sees. */
const inkOf = (d: ReturnType<typeof derive3>) =>
  new Set(d.construction.segments.map((s) => [...s].sort().join('')));
const dist = (a?: { x: number; y: number; z: number }, b?: { x: number; y: number; z: number }) =>
  a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : NaN;

const PARALLELOGRAM_NOUNS = ['מקבילית', 'ריבוע', 'מלבן', 'מעוין'] as const;

beforeEach(reset);

describe('#984 — completing the fourth corner draws no diagonal', () => {
  it.each(PARALLELOGRAM_NOUNS)('«משולש ABC» · «%s ABCD» — BD is NOT drawn', (noun) => {
    const { st, d } = build(['משולש ABC', `${noun} ABCD`]);
    expect(st.lastError).toBeNull();
    const ink = inkOf(d);
    expect(ink.has('BD'), `${noun}: the diagonal BD is ink nobody asked for`).toBe(false);
    expect(ink.has('AC'), `${noun}: the other diagonal is not drawn either`).toBe(false);
  });

  it.each(PARALLELOGRAM_NOUNS)('«%s ABCD» still draws the ring\'s own missing sides', (noun) => {
    // The other half of the rule: scaffolding is invisible, but a STATED shape leaves its trace.
    // A–B and B–C are the triangle's own edges (they live on the solid); what the quad must ADD is
    // the pair reaching the new corner.
    const { d } = build(['משולש ABC', `${noun} ABCD`]);
    const ink = inkOf(d);
    expect(ink.has('CD'), 'C–D').toBe(true);
    expect(ink.has('AD'), 'D–A').toBe(true);
  });

  it.each([0, 1, 2, 3])('seed %i — the corner is still the PARALLELOGRAM POINT, exactly', (seed) => {
    // Removing the carrier must not move the corner: D = A + C − B in every configuration, which is
    // what makes the four nouns' relations hold. A derived corner that merely looked right at seed 0
    // is the failure this asserts against.
    for (const noun of PARALLELOGRAM_NOUNS) {
      const { st, d } = build(['משולש ABC', `${noun} ABCD`], seed);
      expect(st.lastError, noun).toBeNull();
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => d.resolved.positions.get(id)!);
      expect(D, `${noun}: the corner is placed`).toBeDefined();
      expect(dist(D, { x: A.x + C.x - B.x, y: A.y + C.y - B.y, z: A.z + C.z - B.z }), noun).toBeLessThan(1e-9);
      expect(dist(A, B), `${noun}: |AB| = |DC|`).toBeCloseTo(dist(D, C), 6);
      expect(dist(B, C), `${noun}: |BC| = |AD|`).toBeCloseTo(dist(A, D), 6);
    }
  });

  it('the corner is a `parallelogram-point` — a point KIND, so no command emits a carrier', () => {
    // The mechanism lock. The behaviour above can be got back by filtering the drawing, which is the
    // patch this issue's diagnosis rejected: the vec-rel was scaffolding, so it is gone, not hidden.
    const { d } = build(['משולש ABC', 'מקבילית ABCD']);
    const def = d.construction.points.get('D') as { kind: string; opp: string; n1: string; n2: string };
    expect(def.kind).toBe('parallelogram-point');
    expect(def.opp, 'mirrors the OPPOSITE corner through the other two').toBe('B');
    expect([def.n1, def.n2].sort()).toEqual(['A', 'C']);
    expect(d.construction.vecDefs.length, 'no vector relation is recorded at all').toBe(0);
  });

  it('#601\'s kite is untouched — it already derived its corner without a carrier', () => {
    const { st, d } = build(['משולש ABC', 'דלתון ABCD']);
    expect(st.lastError).toBeNull();
    const ink = inkOf(d);
    expect(ink.has('BD')).toBe(false);
    expect(d.construction.points.get('D')!.kind).toBe('reflect-line');
  });
});
