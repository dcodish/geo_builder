/**
 * #1627 — A TRAPEZOID IS NEVER DRAWN AS A RECTANGLE OR A PARALLELOGRAM WITHOUT SAYING SO (ADR-AG-189).
 *
 * Operator, 2026-10-01, playing PR #1625 T1: *"when i wrote c=90 it accepted but then i got a
 * rectangle."* «טרפז ABCD» with A(0,0) B(4,0) C(4,3) D(0,3) recorded green too — a rectangle under the
 * noun «טרפז».
 *
 * A trapezoid has EXACTLY one pair of parallel sides. This tree's `SHAPES` rows asserted only the
 * parallel pair and nothing asserted the OTHER pair is not parallel. The noun's exclusive condition is
 * now part of its ring promise (`engine/rings.ts`), so a configuration that lands on a parallelogram is a
 * wrong draw while a true trapezoid exists.
 *
 * **RULING CHANGE — ADR-AG-189 Amendment 1 (operator, 2026-10-01, on #1627):** givens that FORCE a
 * trapezoid into a rectangle or a parallelogram are *"drawn with warning"*, matching the 2-D sibling's
 * ADR-165 (allow, flag amber). The rows here that asserted a REFUSAL (the pinned corners) were FLIPPED on
 * that ruling — not relaxed to pass: they now assert that the line is RECORDED, the rectangle is drawn,
 * and a warning names the trapezoid and the student's line that forced it. The movable rows
 * («∠C = 90» · «∠O = 90», «BC = AO»), unlocked before the ruling, are locked the same way. The exclusion
 * stays a PREFERENCE of the configuration search: the 24-seed sweep and the genuine-trapezoid rows are
 * unchanged, and a real trapezoid never shows the warning.
 *
 * The locks CALL the product's own decisions (`ringViolation`, `derive`, `decideSubmit`,
 * `shapeWarningsOf`) rather than re-deciding what a trapezoid is — except the independent "is this drawn
 * ring a parallelogram" reading below, which is the observation the operator made with his eyes and is
 * deliberately not the engine's code.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { activeOf } from '../app/active';
import { shapeWarningsOf, shapeWarningText } from '../app/shapeWarnings';
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

/** The warnings the page shows for these (active) lines at this seed — the page's own call. */
const warningsOf = (lines: readonly string[], seed = 0) => shapeWarningsOf(lines, derive(lines, seed));

const he = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('he')(k, o) as string;
const en = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('en')(k, o) as string;

describe('#1627 — the predicate: a trapezoid-family ring with both pairs parallel breaks its noun', () => {
  const rectangle: P[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  const slanted: P[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 3 }, { x: 1, y: 3 }];
  const trapezoid: P[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];

  it('every trapezoid noun flags a rectangle and a slanted parallelogram', () => {
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

describe('#1627 Am. 1 — givens that FORCE the parallelogram are recorded, drawn, and warned about', () => {
  /** Refused on D(0,3) before the ruling; the ruling names this row (T20) explicitly. */
  it('«טרפז ABCD» then four pinned rectangle corners: every line records, the rectangle is drawn, the warning names D(0,3)', () => {
    const lines = ['טרפז ABCD', 'A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)'];
    const { recorded, refusals } = play(lines);
    expect(refusals).toEqual([]);
    expect(recorded).toEqual(lines);
    expect(derive(recorded).faults).toEqual([]);
    expect(isParallelogram(drawnQuad(recorded, 0))).toBe(true);
    expect(warningsOf(recorded)).toEqual([{ code: 'trapezoid-is-parallelogram', shape: 'ABCD', forcedBy: 4, line: 'D(0,3)' }]);
  });

  it('«טרפז ישר זווית ABCD» on the same four corners: recorded, with the warning', () => {
    const { recorded, refusals } = play(['טרפז ישר זווית ABCD', 'A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)']);
    expect(refusals).toEqual([]);
    expect(recorded).toHaveLength(5);
    expect(warningsOf(recorded)).toMatchObject([{ shape: 'ABCD', line: 'D(0,3)' }]);
  });

  it('the corners first and the noun last: recorded, and the warning names the noun line', () => {
    const { recorded, refusals } = play(['A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)', 'טרפז ABCD']);
    expect(refusals).toEqual([]);
    expect(warningsOf(recorded)).toMatchObject([{ shape: 'ABCD', forcedBy: 4, line: 'טרפז ABCD' }]);
  });

  it('the English noun is the same row and the same warning', () => {
    const { recorded, refusals } = play(['trapezoid ABCD', 'A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)']);
    expect(refusals).toEqual([]);
    expect(warningsOf(recorded)).toMatchObject([{ shape: 'ABCD', line: 'D(0,3)' }]);
  });

  /** The movable rows — the figure keeps freedom, yet every configuration is a rectangle. */
  it('«טרפז ישר זווית ABCO» · «∠C = 90» · «∠O = 90»: recorded, drawn as a rectangle, the warning names «∠O = 90»', () => {
    const lines = ['טרפז ישר זווית ABCO', '∠C = 90', '∠O = 90'];
    const { recorded, refusals } = play(lines);
    expect(refusals).toEqual([]);
    expect(recorded).toEqual(lines);
    expect(isParallelogram(drawnQuad(recorded, 0))).toBe(true);
    expect(warningsOf(recorded)).toEqual([{ code: 'trapezoid-is-parallelogram', shape: 'ABCO', forcedBy: 2, line: '∠O = 90' }]);
    // one right angle at C is still a real right trapezoid — no warning before the line that forced it
    expect(warningsOf(lines.slice(0, 2))).toEqual([]);
  });

  /** The double-root case a rank test misses (ADR-AG-189 "Not built"): the warning reads the drawing. */
  it('«טרפז ישר זווית ABCO» · «BC = AO»: recorded, the warning names «BC = AO»', () => {
    const lines = ['טרפז ישר זווית ABCO', 'BC = AO'];
    const { recorded, refusals } = play(lines);
    expect(refusals).toEqual([]);
    expect(recorded).toEqual(lines);
    expect(warningsOf(recorded)).toMatchObject([{ shape: 'ABCO', forcedBy: 1, line: 'BC = AO' }]);
  });

  it('the warning clears when the forcing line is deleted or muted', () => {
    const lines = ['טרפז ישר זווית ABCO', '∠C = 90', '∠O = 90'];
    expect(warningsOf(lines)).toHaveLength(1);
    expect(warningsOf(lines.slice(0, 2))).toEqual([]); // deleted
    expect(warningsOf(activeOf(lines, [2]))).toEqual([]); // muted (#1548: the figure folds the active lines)
    const pinned = ['טרפז ABCD', 'A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)'];
    expect(warningsOf(activeOf(pinned, [4]))).toEqual([]);
    expect(warningsOf(activeOf(pinned, [0]))).toEqual([]); // no trapezoid declared, nothing to warn about
  });

  it('the warning is a sentence naming the trapezoid and the student’s line, in both languages', () => {
    const [w] = warningsOf(['טרפז ישר זווית ABCO', '∠C = 90', '∠O = 90']);
    const h = shapeWarningText(w, he);
    const e = shapeWarningText(w, en);
    for (const text of [h, e]) {
      expect(text).toContain('ABCO');
      expect(text).toContain('∠O = 90');
    }
    expect(h).toContain('טרפז');
    expect(e.toLowerCase()).toContain('trapezoid');
    expect(h).not.toBe('warnTrapezoidIsParallelogram');
    expect(e).not.toBe('warnTrapezoidIsParallelogram');
  });
});

describe('#1627 — genuine trapezoids still build, with no warning', () => {
  it('a pinned trapezoid records every line', () => {
    const { refusals, recorded } = play(['טרפז ABCD', 'A(0,0)', 'B(4,0)', 'C(3,3)', 'D(0,3)']);
    expect(refusals).toEqual([]);
    expect(derive(recorded).faults).toEqual([]);
    expect(warningsOf(recorded)).toEqual([]);
  });

  it('a pinned right trapezoid records every line', () => {
    const { refusals, recorded } = play(['טרפז ישר זווית ABCD', 'A(0,0)', 'B(4,0)', 'C(2,3)', 'D(0,3)']);
    expect(refusals).toEqual([]);
    expect(derive(recorded).faults).toEqual([]);
    expect(warningsOf(recorded)).toEqual([]);
  });

  it('a trapezoid whose student-named pair displaces the assumed one still builds', () => {
    const { refusals, recorded } = play(['טרפז ABCD', 'AD ∥ BC']);
    expect(refusals).toEqual([]);
    expect(isParallelogram(drawnQuad(recorded, 0))).toBe(false);
    expect(warningsOf(recorded)).toEqual([]);
  });
});

/** Memory: solver changes need a seed sweep — the whole pool, not two seeds. */
describe('#1627 — a seed sweep never draws a trapezoid noun as a parallelogram', () => {
  for (const noun of ['טרפז ABCD', 'טרפז ישר זווית ABCD', 'טרפז שווה שוקיים ABCD']) {
    it(`${noun}: all ${POOL_SIZE} seeds draw a whole, non-parallelogram ring, and none warns`, () => {
      for (let seed = 0; seed < POOL_SIZE; seed += 1) {
        expect(derive([noun], seed).faults, `seed ${seed}`).toEqual([]);
        expect(isParallelogram(drawnQuad([noun], seed)), `seed ${seed}`).toBe(false);
        expect(warningsOf([noun], seed), `seed ${seed}`).toEqual([]);
      }
    });
  }
});
