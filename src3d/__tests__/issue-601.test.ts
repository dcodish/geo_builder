/**
 * #601 (ADR-3D-240) — the KITE's fourth corner is DETERMINED, by a different closed form.
 *
 * #587/ADR-3D-152 gave `quad-shape` a one-unknown arm that completes the fourth corner for the
 * **parallelogram family** — square, rectangle, rhombus, parallelogram — where the corner IS the
 * parallelogram point. For the other three families it refused honestly, naming the corner. Two of
 * those refusals were believed CORRECT at the time — a trapezoid's and a general quad's fourth corner is
 * genuinely undetermined. #985 (ADR-3D-244) later showed the conclusion did not follow: minting the corner
 * FREE where the shape leaves it free asserts nothing (FR-SP-2), so those two now build as well.
 *
 * The kite is the exception the refusal was hiding. «דלתון ABCD» constrains |AB|=|AD| and |CB|=|CD|,
 * which makes D the **reflection of B across the axis AC** — determined, but not the parallelogram
 * point, so the existing arm could not serve it.
 *
 * **Operator ruling (2026-08-16), on the open question the issue carried:** *"doesn't need my inputs."*
 * — delegated, and the decision recorded on the issue was a new `PointDef` kind, `reflect-line`, rather
 * than an auto-minted internal foot point: a helper point on the canvas is visible work the student
 * never asked for. `foot-seg` + `vec-rel` can express the same closed form at the cost of that ink.
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
  return { st, pos: derive3(st.facts, st.seed).resolved.positions };
};
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

beforeEach(reset);

describe('#601 — «משולש ABC» then «דלתון ABCD» completes the corner', () => {
  // Several seeds, because the corner is DERIVED and must be right in every configuration — a single
  // seed would pass on a lucky placement (the ADR-3D-030 seed-invariance rule).
  it.each([0, 1, 2, 3])('seed %i — both kite relations hold exactly', (seed) => {
    const { st, pos } = build(['משולש ABC', 'דלתון ABCD'], seed);
    expect(st.lastError).toBeNull();
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => pos.get(id)!);
    expect(D, 'the fourth corner is placed').toBeDefined();
    expect(dist(A, B), '|AB| = |AD|').toBeCloseTo(dist(A, D), 6);
    expect(dist(C, B), '|CB| = |CD|').toBeCloseTo(dist(C, D), 6);
  });

  it('D is the REFLECTION, not the parallelogram point — asserted to DIFFER on a scalene ABC', () => {
    // The lock the issue asked for by name. If the kite were ever routed through the parallelogram arm
    // this passes numerically for |AB|=|AD| by accident on a symmetric figure, so the discriminator has
    // to be the parallelogram point itself.
    const { pos } = build(['משולש ABC', 'דלתון ABCD']);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => pos.get(id)!);
    const parallelogramPoint = { x: A.x + C.x - B.x, y: A.y + C.y - B.y, z: A.z + C.z - B.z };
    expect(dist(D, parallelogramPoint)).toBeGreaterThan(1e-3);
  });

  it('the corner is a `reflect-line` point, mirroring the OPPOSITE corner across the other diagonal', () => {
    const { st } = build(['משולש ABC', 'דלתון ABCD']);
    const c = derive3(st.facts, st.seed).construction;
    // D is missing, so it mirrors B (opposite) across the axis through its two neighbours, A and C.
    // The axis is a LINE, so which neighbour lands in `a` and which in `b` carries no meaning — the
    // assertion is on the mirror source and the axis as a SET, not on the letters' order.
    const def = c.points.get('D') as { kind: string; from: string; a: string; b: string };
    expect(def.kind).toBe('reflect-line');
    expect(def.from, 'mirrors the OPPOSITE corner').toBe('B');
    expect([def.a, def.b].sort(), 'across the other diagonal').toEqual(['A', 'C']);
  });

  it('the two NEW ring edges are drawn — a stated shape leaves a visible trace', () => {
    // A–B and B–C are already the triangle's own edges (they live on the solid, not in `segments`), and
    // `drawRing` is idempotent, so what the kite must ADD is the pair that reaches the new corner.
    const { st } = build(['משולש ABC', 'דלתון ABCD']);
    const c = derive3(st.facts, st.seed).construction;
    for (const [a, b] of [['C', 'D'], ['D', 'A']]) {
      expect(c.segments.some((s) => (s[0] === a && s[1] === b) || (s[0] === b && s[1] === a)), `${a}${b}`).toBe(true);
    }
  });
});

describe('#601 — the sibling arms, re-asserted', () => {
  it('a TRAPEZOID’s fourth corner now BUILDS — free where the shape leaves it free (#985, ADR-3D-244)', () => {
    // Locked here as a refusal until #985: "genuinely undetermined, so completing it would be ADR-052's
    // cardinal sin". Half right — inventing a SPECIFIC corner would be. Minting one that stays free asserts
    // nothing, which is FR-SP-2's whole point; the full lock lives in issue-985.test.ts.
    const { st, pos } = build(['משולש ABC', 'טרפז ABCD']);
    expect(st.lastError).toBeNull();
    expect(pos.has('D')).toBe(true);
  });

  it('the four PARALLELOGRAM-family completions are unchanged', () => {
    for (const shape of ['ריבוע', 'מלבן', 'מעוין', 'מקבילית']) {
      const { st, pos } = build(['משולש ABC', `${shape} ABCD`]);
      expect(st.lastError, shape).toBeNull();
      expect(pos.has('D'), shape).toBe(true);
      // and they still complete to the PARALLELOGRAM point, which is what distinguishes them
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => pos.get(id)!);
      const par = { x: A.x + C.x - B.x, y: A.y + C.y - B.y, z: A.z + C.z - B.z };
      expect(dist(D, par), shape).toBeLessThan(1e-6);
    }
  });

  it('a kite with TWO unknown corners is a declaration, not a completion', () => {
    // Arm 1's business: the flat quad carries the free dims and the constraint set takes some away.
    // Reaching the completion arm with two unknowns would invent a point.
    const { st } = build(['קטע AB', 'דלתון ABCD']);
    expect(st.lastError === null || (st.lastError as { code?: string }).code !== 'unknown-point').toBe(true);
  });

  it('a kite whose DERIVING points are missing refuses by name rather than inventing them', () => {
    // The corner is derived from three points; if one of them is absent this is not a completion at all.
    const { st } = build(['משולש ABC', 'דלתון ABXD']);
    expect(st.lastError).not.toBeNull();
  });
});
