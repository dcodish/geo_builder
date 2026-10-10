/**
 * #1926 — A PARALLELOGRAM IS NOT "ALREADY" A TRAPEZOID (ADR-AG-260).
 *
 * «מקבילית ABCD» · «טרפז ABCD» answered «כבר ידוע»: M1 saw the same ring id and absorbed the second noun as a
 * restatement, so the trapezoid's assumed pair — already held by the parallelogram — read as known. Under the
 * builders' definition a trapezoid has EXACTLY one pair of parallel sides (ADR-AG-189), so no quadrilateral is both.
 * The reverse order recorded and drew a parallelogram with ADR-AG-189 Am. 1's warning (a path ruled for forcing
 * GIVENS, not for a second noun), or refused `polygon-collapsed` by seed.
 *
 * Now the second declaration is refused (`shape-excluded`) in either order, every spelling, at every seed, with
 * 3-D's sentence (operator ruling 2026-10-08: "3-D's sentence"). The exclusion is `nounsExclude`, derived from the
 * `SHAPES` rows — the guard below holds it to the table.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { shapeWarningsOf } from '../app/shapeWarnings';
import { analyticI18n } from '../i18n';
import { SHAPES, nounsExclude } from '../engine/shapes';
import type { InputError } from '../store/useAnalyticStore';

const SEEDS = [0, 1, 2, 3, 4, 5];
const he = analyticI18n.getFixedT('he') as unknown as Parameters<typeof errorText>[1];
const en = analyticI18n.getFixedT('en') as unknown as Parameters<typeof errorText>[1];

/** Submit every line but the last through the real gate; return the gate's verdict on the last. */
function last(lines: readonly string[], seed: number) {
  const recorded: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, recorded, seed);
    expect(v.kind, `context line «${line}» at seed ${seed}`).toBe('record');
    recorded.push(line);
  }
  return decideSubmit(lines[lines.length - 1], recorded, seed);
}

const PARALLELOGRAMS = ['מקבילית', 'מלבן', 'ריבוע', 'מעוין'];
const TRAPEZOIDS = ['טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית'];

describe('#1926 — the operator\'s sequence', () => {
  it.each(SEEDS)('«מקבילית ABCD» · «טרפז ABCD» is refused naming both nouns (seed %i)', (seed) => {
    const v = last(['מקבילית ABCD', 'טרפז ABCD'], seed);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error).toMatchObject({ key: 'shape-excluded', detail: 'טרפז ABCD', actual: 'מקבילית', stated: 'טרפז' });
    expect(errorText(v.error as InputError, he)).toBe(
      'הצורה כבר ידועה כ־מקבילית — ולכן אינה נקראת טרפז. מחקו את הנתון הקודם אם התכוונתם טרפז.',
    );
    expect(errorText(v.error as InputError, en)).toBe(
      'The figure is already known to be a parallelogram, so it is not called a trapezoid. Remove the earlier given if you meant trapezoid.',
    );
  });

  it('the reverse names the trapezoid as what the figure is', () => {
    const v = last(['טרפז ABCD', 'מקבילית ABCD'], 0);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(errorText(v.error as InputError, he)).toBe(
      'הצורה כבר ידועה כ־טרפז — ולכן אינה נקראת מקבילית. מחקו את הנתון הקודם אם התכוונתם מקבילית.',
    );
  });
});

describe('#1926 — every parallelogram-family noun against every trapezoid noun, both orders, every seed', () => {
  const rows = PARALLELOGRAMS.flatMap((p) => TRAPEZOIDS.flatMap((t) => [[p, t], [t, p]]));
  it.each(rows)('«%s ABCD» · «%s ABCD» is refused', (first, second) => {
    for (const seed of SEEDS) {
      const v = last([`${first} ABCD`, `${second} ABCD`], seed);
      expect(v.kind, `seed ${seed}`).toBe('refused');
      if (v.kind === 'refused') expect(v.error, `seed ${seed}`).toMatchObject({ key: 'shape-excluded', actual: first, stated: second });
    }
  });

  it.each([
    [['ABCD מקבילית', 'ABCD טרפז']],
    [['המרובע ABCD הוא מקבילית', 'המרובע ABCD הוא טרפז']],
    [['parallelogram ABCD', 'trapezoid ABCD']],
    [['trapezoid ABCD', 'parallelogram ABCD']],
    [['rectangle ABCD', 'trapezoid ABCD']],
    [['A(0,0)', 'B(4,0)', 'C(5,3)', 'D(1,3)', 'מקבילית ABCD', 'טרפז ABCD']],
  ])('another spelling or the corners first: %j is refused', (lines) => {
    for (const seed of [0, 3]) {
      const v = last(lines, seed);
      expect(v.kind, `seed ${seed}`).toBe('refused');
      if (v.kind === 'refused') expect(v.error.key).toBe('shape-excluded');
    }
  });
});

describe('#1926 — what stays as it was', () => {
  it.each([
    [['מרובע ABCD', 'טרפז ABCD'], 'record'],
    [['טרפז ABCD', 'טרפז שווה שוקיים ABCD'], 'record'],
    [['מקבילית ABCD', 'מלבן ABCD'], 'record'],
    [['מקבילית ABCD', 'AB ∥ CD'], 'already-known'],
    [['מקבילית ABCD', 'מקבילית ABCD'], 'already-known'],
  ])('%j → %s', (lines, kind) => {
    expect(last(lines, 0).kind).toBe(kind);
  });

  it('givens that force a trapezoid into a parallelogram still record, with ADR-AG-189 Am. 1\'s warning', () => {
    const lines = ['טרפז ABCD', 'AD ∥ BC', 'AB ∥ DC'];
    expect(last(lines, 0).kind).toBe('record');
    expect(shapeWarningsOf(lines, derive(lines, 0)).length).toBeGreaterThan(0);
  });
});

describe('#1926 — `nounsExclude` is derived from the table, and the table says exactly this', () => {
  it('over every pair of quadrilateral nouns, it is the parallelogram family × the trapezoids, symmetric', () => {
    const quads = Object.keys(SHAPES).filter((k) => SHAPES[k].arity === 4);
    const got = quads.flatMap((a) => quads.filter((b) => nounsExclude(a, b)).map((b) => `${a}|${b}`)).sort();
    const want = PARALLELOGRAMS.flatMap((p) => TRAPEZOIDS.flatMap((t) => [`${p}|${t}`, `${t}|${p}`])).sort();
    expect(got).toEqual(want);
  });
});
