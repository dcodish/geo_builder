/**
 * #1627 — A TRAPEZOID IS NEVER DRAWN AS A RECTANGLE OR A PARALLELOGRAM (ADR-AG-189).
 *
 * Operator, 2026-10-01, playing PR #1625 T1: *"when i wrote c=90 it accepted but then i got a
 * rectangle."* «טרפז ABCD» with A(0,0) B(4,0) C(4,3) D(0,3) recorded green too — a rectangle under the
 * noun «טרפז».
 *
 * A trapezoid has EXACTLY one pair of parallel sides. The 2-D tree holds that as an operator ruling,
 * ADR-157 (*"you cannot turn a trapezoid into a square or a rectangle, even if the user asks … give
 * them the error message"*); this tree's `SHAPES` rows asserted only the parallel pair and nothing
 * asserted the OTHER pair is not parallel. The noun's exclusive condition is now part of its ring
 * promise (`engine/rings.ts`), so a configuration that lands on a parallelogram is a wrong draw and a
 * figure whose givens FORCE one is refused on the line that forced it.
 *
 * The locks CALL the engine's own predicates (`ringViolation`, `derive`, `decideSubmit`) rather than
 * re-deciding what a trapezoid is — except the independent "is this drawn ring a parallelogram"
 * reading below, which is the observation the operator made with his eyes and is deliberately not the
 * engine's code.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { POOL_SIZE } from '../engine/evaluate';
import { ringViolation } from '../engine/rings';
import { analyticI18n } from '../i18n';
import { ONE_PARALLEL_PAIR_NOUNS, SHAPES } from '../engine/shapes';

type P = { x: number; y: number };

/** |sin| of the angle between two directions — 0 when parallel. Independent of the engine on purpose. */
const sinBetween = (p: P, q: P, r: P, s: P): number => {
  const ux = q.x - p.x;
  const uy = q.y - p.y;
  const vx = s.x - r.x;
  const vy = s.y - r.y;
  return Math.abs(ux * vy - uy * vx) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
};

/** The drawn ring of the figure's (only) quadrilateral, in declared order. */
function drawnQuad(lines: readonly string[], seed: number): P[] {
  const d = derive(lines, seed);
  const poly = d.construction.objects.find((o) => o.kind === 'polygon' && o.vertices.length === 4);
  if (!poly || poly.kind !== 'polygon') throw new Error('no quadrilateral in the figure');
  return poly.vertices.map((id) => {
    const p = d.figure.points.find((q) => q.id === id);
    if (!p) throw new Error(`vertex ${id} not drawn`);
    return { x: p.x, y: p.y };
  });
}

/** Both pairs of opposite sides parallel — what the operator SAW (a rectangle is one). */
const isParallelogram = ([a, b, c, d]: P[]): boolean =>
  sinBetween(a, b, d, c) < 1e-3 && sinBetween(a, d, b, c) < 1e-3;

/** Submit lines one at a time through the real gate, recording what it records. */
function play(lines: readonly string[]): { recorded: string[]; refusals: { line: string; key: string }[] } {
  const recorded: string[] = [];
  const refusals: { line: string; key: string }[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, recorded, 0);
    if (v.kind === 'record') recorded.push(line);
    else if (v.kind === 'refused') refusals.push({ line, key: v.error.key });
  }
  return { recorded, refusals };
}

const he = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('he')(k, o) as string;
const en = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('en')(k, o) as string;

describe('#1627 — the predicate: a trapezoid-family ring with both pairs parallel breaks its noun', () => {
  const rectangle: P[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  const slanted: P[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 3 }, { x: 1, y: 3 }];
  const trapezoid: P[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];

  it('every trapezoid noun refuses a rectangle and a slanted parallelogram', () => {
    for (const noun of ['טרפז', 'טרפז ישר זווית', 'טרפז שווה שוקיים']) {
      expect(ringViolation(rectangle, noun), noun).toBe('trapezoid-is-parallelogram');
      expect(ringViolation(slanted, noun), noun).toBe('trapezoid-is-parallelogram');
      expect(ringViolation(trapezoid, noun), noun).toBeNull();
    }
  });

  it('every noun that declares the exclusion is a row of the table — a typo would silently disarm it', () => {
    expect(ONE_PARALLEL_PAIR_NOUNS.size).toBe(3);
    for (const noun of ONE_PARALLEL_PAIR_NOUNS) expect(SHAPES[noun], noun).toBeDefined();
  });

  it('nouns that do not exclude a parallelogram are untouched', () => {
    for (const noun of ['מרובע', 'מקבילית', 'מלבן', undefined]) {
      expect(ringViolation(rectangle, noun), String(noun)).toBeNull();
    }
  });
});

describe('#1627 — the issue’s rows are refused, or never drawn as a parallelogram', () => {
  it('«טרפז ABCD» then four pinned rectangle corners: the LAST corner is refused, by name', () => {
    const lines = ['טרפז ABCD', 'A(0,0)', 'B(4,0)', 'C(4,3)'];
    const v = decideSubmit('D(0,3)', lines, 0);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'trapezoid-is-parallelogram', detail: 'D(0,3)' } });
  });

  /**
   * The right trapezoid's seat makes the THIRD corner the one that forces the rectangle: with A and B
   * pinned and the right angle at A, C(4,3) already fixes D at (0,3). The refusal lands on the line that
   * completed the contradiction, so «D(0,3)» afterwards merely restates a point that is not there.
   */
  it('«טרפז ישר זווית ABCD» on the same four corners: the corner that forces the rectangle is refused', () => {
    const { recorded, refusals } = play(['טרפז ישר זווית ABCD', 'A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)']);
    expect(refusals.map((r) => r.key)).toContain('trapezoid-is-parallelogram');
    expect(derive(recorded).faults).toEqual([]);
    expect(isParallelogram(drawnQuad(recorded, 0))).toBe(false);
  });

  it('the corners first and the noun last: the noun line is refused', () => {
    const v = decideSubmit('טרפז ABCD', ['A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)'], 0);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'trapezoid-is-parallelogram', detail: 'טרפז ABCD' } });
  });

  it('the English noun is the same row and the same refusal', () => {
    const v = decideSubmit('D(0,3)', ['trapezoid ABCD', 'A(0,0)', 'B(4,0)', 'C(4,3)'], 0);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'trapezoid-is-parallelogram' } });
  });

  /**
   * NOT LOCKED HERE, on purpose: the operator's own report — «טרפז ישר זווית ABCO» · «זווית C ישרה» — is a
   * rectangle reached by a CONSTRAINT on a figure that still has freedom (a rectangle's five degrees).
   * Refuse it, or draw it with a notice as the 2-D sibling's ADR-165 ruled? That is an open ruling on
   * #1627, and the refusal arm stays on its `reportedDof = 0` gate until it is given.
   */

  it('the refusal reads as a sentence about the student’s statement, in both languages', () => {
    const err = { key: 'trapezoid-is-parallelogram', detail: 'D(0,3)' } as const;
    const h = errorText(err, he).replace(/[⁦-⁩]/g, '');
    const e = errorText(err, en).replace(/[⁦-⁩]/g, '');
    expect(h).toContain('D(0,3)');
    expect(h).toContain('טרפז');
    expect(e).toContain('D(0,3)');
    expect(e.toLowerCase()).toContain('trapezoid');
    expect(h).not.toBe('errTrapezoidIsParallelogram');
    expect(e).not.toBe('errTrapezoidIsParallelogram');
  });
});

describe('#1627 — genuine trapezoids still build', () => {
  it('a pinned trapezoid records every line', () => {
    const { refusals, recorded } = play(['טרפז ABCD', 'A(0,0)', 'B(4,0)', 'C(3,3)', 'D(0,3)']);
    expect(refusals).toEqual([]);
    expect(derive(recorded).faults).toEqual([]);
  });

  it('a pinned right trapezoid records every line', () => {
    const { refusals, recorded } = play(['טרפז ישר זווית ABCD', 'A(0,0)', 'B(4,0)', 'C(2,3)', 'D(0,3)']);
    expect(refusals).toEqual([]);
    expect(derive(recorded).faults).toEqual([]);
  });

  it('a trapezoid whose student-named pair displaces the assumed one still builds', () => {
    const { refusals, recorded } = play(['טרפז ABCD', 'AD ∥ BC']);
    expect(refusals).toEqual([]);
    expect(isParallelogram(drawnQuad(recorded, 0))).toBe(false);
  });
});

/** Memory: solver changes need a seed sweep — the whole pool, not two seeds. */
describe('#1627 — a seed sweep never draws a trapezoid noun as a parallelogram', () => {
  for (const noun of ['טרפז ABCD', 'טרפז ישר זווית ABCD', 'טרפז שווה שוקיים ABCD']) {
    it(`${noun}: all ${POOL_SIZE} seeds draw a whole, non-parallelogram ring`, () => {
      for (let seed = 0; seed < POOL_SIZE; seed += 1) {
        expect(derive([noun], seed).faults, `seed ${seed}`).toEqual([]);
        expect(isParallelogram(drawnQuad([noun], seed)), `seed ${seed}`).toBe(false);
      }
    });
  }
});
