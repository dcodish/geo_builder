/**
 * #370 ([ADR-3D-247](../../docs/06b-decisions-3d.md#adr-3d-247)) + #990 ([ADR-3D-248](../../docs/06b-decisions-3d.md#adr-3d-248))
 * — the DOF cue READS the resolution instead of inferring it, twice.
 *
 * Measured on `d440f01` through the real `submit → derive3 → freeDofCount3` path:
 *
 *   «משולש ABC» · «מקבילית ABCD»   cue 0, truth 2   (D is the parallelogram point; both ∥ pins hold by construction)
 *   «משולש ABC» · «דלתון ABCD»     cue 0, truth 2   (D is B's reflection; both equal-side pins hold by construction)
 *   «משולש ABC» · «מלבן ABCD»      cue 0, truth 1   (one right angle drives C; the other two follow)
 *   «משולש ABC» · «מעוין ABCD»     cue 0, truth 1
 *   «משולש ABC» · «טרפז ABCD»      cue 2, truth 3   (the ratio IS counted; the ∥ pin was wrongly subtracted)
 *   … · «|DC| = 0.5|AB|»           cue 0, truth 2   (the given consumed the RATIO, not a dim)
 *   «פירמידה משולשת ABCD» · «l1:x=t(0,m,2m-2)»   cue 6 — the 6 sampled placement DOFs uncounted (#370)
 *
 * #990: `− scalarPins.length` subtracted one dim per pin unconditionally. Now the pivot records what the
 * pins CONSUME — the numeric rank of the scalar residuals' response to the dims (`pivot.scalarConsumed`,
 * lazy, display-path only) — and the cue reads it. #370: when the placement is SAMPLED (`placementSampled3`,
 * the sampler's own predicate) its 6 DOFs are counted and the gauge allowance is the scale alone.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { freeDofCount3, placementSampled3 } from '../engine/evaluate';
import { verifyClaim } from '../engine/claims';
import { scalarPinOrigin3 } from '../engine/types';
import { numericRank } from '../engine/solve3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const cueAt = (seed: number) => {
  const s = useGeo3.getState();
  const d = derive3(s.facts, seed);
  return freeDofCount3(d.construction, d.resolved);
};
const build = (seq: string[]) => {
  reset();
  for (const u of seq) submit(u);
  expect(useGeo3.getState().facts, seq.join(' · ')).toHaveLength(seq.length);
};

describe('#990 — the one-unknown quad completion: the cue counts what the pins CONSUME, at two seeds', () => {
  it.each([
    [['משולש ABC'], 2],
    [['משולש ABC', 'מקבילית ABCD'], 2],
    [['משולש ABC', 'דלתון ABCD'], 2],
    [['משולש ABC', 'מלבן ABCD'], 1],
    [['משולש ABC', 'מעוין ABCD'], 1],
    [['משולש ABC', 'ריבוע ABCD'], 0],
    [['משולש ABC', 'טרפז ABCD'], 3],
    [['משולש ABC', 'טרפז ABCD', '|DC| = 0.5|AB|'], 2],
    [['משולש ABC', 'מרובע ABCD'], 4],
  ])('%j → %d', (seq, truth) => {
    build(seq);
    for (const seed of [0, 1]) expect(cueAt(seed), `${seq.join(' · ')} @${seed}`).toBe(truth);
  });

  it('the kite reads 2 at every seed (the rank probe is above round-off: a reflection holds to ~1e-16)', () => {
    build(['משולש ABC', 'דלתון ABCD']);
    for (const seed of [0, 1, 2, 3]) expect(cueAt(seed), `@${seed}`).toBe(2);
  });

  it('ARM 1 (the declaration alone) is unchanged: parallelogram 2, rectangle 1, square 0', () => {
    build(['מקבילית ABCD']);
    expect(cueAt(0)).toBe(2);
    build(['מלבן ABCD']);
    expect(cueAt(0)).toBe(1);
    build(['ריבוע ABCD']);
    expect(cueAt(0)).toBe(0);
  });

  it('a genuinely consuming drive still consumes (#292 rows byte-identical)', () => {
    build(['פירמידה שבבסיסה מקבילית', 'AB=u', 'AD=v', 'u ⊥ v']);
    expect(cueAt(0)).toBe(4);
    build(['מנסרה ישרה משולשת ABC', 'AB ⊥ AC']);
    expect(cueAt(0)).toBe(2);
  });
});

describe('#370 — the 6 sampled placement DOFs are counted', () => {
  beforeEach(reset);

  it('the #367 figure reads exactly 6 higher than its floating self once an absolute object is on the canvas', () => {
    build(['פירמידה משולשת ABCD']);
    const floating = cueAt(0);
    expect(floating).toBe(5);
    build(['פירמידה משולשת ABCD', 'l1:x=t(0,m,2m-2)']);
    const s = useGeo3.getState();
    expect(placementSampled3(derive3(s.facts, 0).construction)).toBe(true);
    expect(cueAt(0)).toBe(floating + 6 + 1); // +6 placement, +1 the line's open parameter m
    expect(cueAt(1)).toBe(floating + 6 + 1);
  });

  it('a plane pin LOWERS it (ADR-3D-060 monotonicity, now across the placement term)', () => {
    build(['פירמידה משולשת ABCD', 'l1:x=t(0,m,2m-2)']);
    const before = cueAt(0);
    build(['פירמידה משולשת ABCD', 'l1:x=t(0,m,2m-2)', 'מישור π: x+y+z-6=0', 'A על המישור π']);
    expect(cueAt(0)).toBeLessThan(before);
  });

  it('a figure without an absolute object reads byte-identical (no placement term)', () => {
    build(['פירמידה משולשת ABCD']);
    expect(cueAt(0)).toBe(5);
    build(['משולש ABC', 'מרובע ABCD']);
    expect(cueAt(0)).toBe(4);
  });

  it('the #803 exam prism (eight plane pins) still reads 0', () => {
    build([
      "מנסרה ישרה משולשת ABCA'B'C'",
      "AA'=(k-1,k-7,k+1)",
      'AC=(k+1,0,k-3)',
      'AB=(k-1,k,3)',
      'משוואת הישר AC היא x=(8,-1,-1)+t(3,0,-1)',
      'משוואת הישר BC היא x=(4,0,2)+m(2,-2,-4)',
    ]);
    expect(cueAt(0)).toBe(0);
  });

  // #2378 / #2504 (ADR-3D-379) re-base: the cube is still free to turn about A (3) and to resize (1) — the
  // operator's rulings: 2026-10-23 (#2378 d04 A) "Each press turns the cube … to a new angle", 2026-10-24
  // (#2504 d03a A) "three for turning, one for size". Its slide within π is not counted (#2505 e23 A).
  it('a cube with a plane membership reads 4: the turn about A and the size, never the slide in π', () => {
    build(["קובייה ABCDA'B'C'D'", 'מישור π: x+y+z-6=0', 'A על המישור π']);
    expect(cueAt(0)).toBe(4);
  });
});

describe('#990 — numericRank', () => {
  it('counts independent columns/rows under a relative tolerance with a round-off floor', () => {
    expect(numericRank([])).toBe(0);
    expect(numericRank([[0, 0], [0, 0]])).toBe(0);
    expect(numericRank([[1, 0], [0, 1]])).toBe(2);
    expect(numericRank([[1, 2], [2, 4]])).toBe(1); // dependent columns
    expect(numericRank([[1, 2, 3]])).toBe(1); // one column, three rows
    expect(numericRank([[1e-12, 2e-12], [3e-12, 1e-12]])).toBe(0); // all noise
    expect(numericRank([[1, 1e-12], [0, 1e-12]])).toBe(1); // a real column beside a noise column
    expect(numericRank([[1, 0, 0], [0, 1, 0], [1, 1, 0]])).toBe(2); // third = first + second
  });
});

/**
 * #2795 ([ADR-3D-483](../../docs/06b-decisions-3d.md#adr-3d-483)) — a restatement never moves the drawing. «זווית ABC =
 * זווית ACB» after «AB = AC» added a cos-eq pin whose rows lie in the length pin's span; the redundant row changed the
 * Levenberg–Marquardt path and the free triangle moved 1.3e-3 / 3.9e-3 / 1.3e-3 at seeds 1–3 (measured at 13f710fe).
 * The pivot now measures which pins it holds without driving them (newest stating fact first) and solves the figure
 * without them, keeping that solution only where their claims hold.
 */
describe('#2795 — a held pin is left out of the solve, and still checked', () => {
  const at = (seed: number) => derive3(useGeo3.getState().facts, seed);
  const moveOf = (a: ReturnType<typeof at>, b: ReturnType<typeof at>): number => {
    let m = 0;
    for (const [id, p] of a.resolved.positions) {
      const q = b.resolved.positions.get(id);
      if (q) m = Math.max(m, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
    }
    return m;
  };
  it.each([
    [['משולש ABC', 'AB = AC', 'זווית ABC = זווית ACB']],
    [['משולש שווה שוקיים ABC', 'זווית ABC = זווית ACB']],
    [['טרפז שווה שוקיים ABCD', 'זווית DAB = זווית ABC']],
  ])('%j: nothing moves at seeds 0–3 and the cue is unchanged', (seq) => {
    build(seq.slice(0, -1));
    const before = [0, 1, 2, 3].map(at);
    const cue = [0, 1, 2, 3].map(cueAt);
    submit(seq.at(-1)!);
    expect(useGeo3.getState().facts).toHaveLength(seq.length);
    [0, 1, 2, 3].forEach((seed) => {
      expect(moveOf(before[seed], at(seed)), `@${seed}`).toBeLessThanOrEqual(1e-9);
      expect(cueAt(seed), `cue @${seed}`).toBe(cue[seed]);
    });
  });

  it('the left-out pin is the newest fact’s, it is listed, and its claim is checked (it holds)', () => {
    build(['משולש ABC', 'AB = AC', 'זווית ABC = זווית ACB']);
    const d = at(1);
    const c = d.construction;
    const angle = c.scalarPins.find((p) => scalarPinOrigin3.get(p)?.fact === 2)!;
    expect(angle.kind).toBe('cos-eq');
    expect(scalarPinOrigin3.get(angle)?.claim?.type).toBe('cos-eq');
    expect(verifyClaim(scalarPinOrigin3.get(angle)!.claim!, c, 0)).toBe(true);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
  });

  it('untick, then delete, «AB = AC»: the angle equality drives on its own and the triangle stays isosceles', () => {
    for (const drop of ['toggle', 'remove'] as const) {
      build(['משולש ABC', 'AB = AC', 'זווית ABC = זווית ACB']);
      useGeo3.getState()[drop](useGeo3.getState().facts[1].id);
      for (const seed of [0, 1, 2, 3]) {
        const p = at(seed).resolved.positions;
        const len = (a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y, p.get(a)!.z - p.get(b)!.z);
        expect(Math.abs(len('A', 'B') - len('A', 'C')), `${drop} @${seed}`).toBeLessThan(1e-6);
      }
    }
  });

  it('a pin that drives is never left out: «AB = AC» alone still makes the triangle isosceles', () => {
    build(['משולש ABC', 'AB = AC']);
    for (const seed of [0, 1, 2, 3]) {
      const p = at(seed).resolved.positions;
      const len = (a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y, p.get(a)!.z - p.get(b)!.z);
      expect(Math.abs(len('A', 'B') - len('A', 'C')), `@${seed}`).toBeLessThan(1e-6);
    }
  });
});
