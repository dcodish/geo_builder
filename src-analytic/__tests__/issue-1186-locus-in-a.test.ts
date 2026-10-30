/**
 * #1186 — THE LOCUS EQUATION KEEPS ITS LETTERS. #2608 — AND ITS KIND IS NEVER LOST AT SOME CONFIGURATIONS.
 *
 * **Operator, round #1181 T26 (2026-09-18):** *"the shape still doesnt have the a shown"* — חורף 25 with `A(−9a,0)`,
 * `B(41a,0)` answered «מעגל» and no equation. **PR #1341 T16 (2026-09-21):** *"it would be nice if the locus would
 * show x-4a=0"*. **Ruling 11A (2026-10-30):** two letters, so the ellipse book's p10-9 answers
 * `x²/(4a²) + y²/b² = 1` (which also needs #2613 — the two-letter case is locked here on figures that do not).
 *
 * The determinacy gate had two verdicts — the set is invariant (the equation) or it differs (the kind). The third
 * (ADR-AG-351): it VARIES as a monomial per canonical parameter in the student's letters, stated from the gate's own
 * configurations and VERIFIED against every one of their traces. Anything it cannot state and verify keeps the kind.
 *
 * #2608 — `A(a,0)` · `נקודה M` · `MA = 3` answered NOTHING at seeds 2 and 4: the kind was read off a rational snap,
 * and an irrational `a` broke it. The kind is now read at the same tolerance without the rationality demand.
 *
 * Asserted as TEXT through the real `derive` → `ask` path.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { fmtAnalytic } from '../format';
import { locusOf } from '../engine/locus';
import { verifySymbolic, type LocusSample, type SymbolicCurve } from '../engine/locusFit';
import { drawableAt } from '../engine/evaluate';
import { decideSubmit } from '../app/submit';
import winter25InA from './fixtures/issue-1186-winter25-in-a.analytic.json';

const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל', ellipse: 'אליפסה', parabola: 'פרבולה' };
const kind = ((k: string) => HE[k] ?? k) as never;
const locusAt = (lines: string[], name: string, seed: number) =>
  ask(derive(lines, seed), `המקום הגיאומטרי של ${name}`, fmtAnalytic, kind).value;

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

/** חורף 25, the operator's T26. */
const WINTER25 = ['A(-9a,0)', 'B(41a,0)', 'נקודה P', 'PA מאונך ל-PB'];
/** The operator's T16. */
const BISECTOR_A = ['A(0,0)', 'B(8a,0)', 'נקודה M', 'MA = MB'];
/** #2608's sequence. */
const CENTRE_A = ['A(a,0)', 'נקודה M', 'MA = 3'];

describe('#1186 — one letter: the equation is written in it, at every configuration', () => {
  it('חורף 25 → «מעגל · (x − 16a)² + y² = (25a)²» (T26; the right side a square, #1187)', () => {
    for (const s of SEEDS) expect(locusAt(WINTER25, 'P', s), `seed ${s}`).toBe('מעגל · (x − 16a)² + y² = (25a)²');
  });

  it('the parameterised bisector → «ישר · x - 4a = 0» (T16)', () => {
    for (const s of SEEDS) expect(locusAt(BISECTOR_A, 'M', s), `seed ${s}`).toBe('ישר · x - 4a = 0');
  });

  it('a slanted parameterised bisector clears its fractions as every line row does (#1180)', () => {
    expect(locusAt(['A(0,0)', 'B(8a,6a)', 'נקודה M', 'MA = MB'], 'M', 0)).toBe('ישר · 4x + 3y - 25a = 0');
  });

  it('a parabola from a point on a parameterised parabola → «y² = 2ax»', () => {
    const lines = ['נתונה פרבולה שמשוואתה y^2=4ax', 'P נקודה על הפרבולה', 'O ראשית הצירים', 'M אמצע OP'];
    for (const s of [0, 1, 2]) expect(locusAt(lines, 'M', s), `seed ${s}`).toBe('פרבולה · y² = 2ax');
  });

  it('the numeric figures are untouched — degree 0 is the gate’s own business', () => {
    expect(locusAt(['A(0,0)', 'B(4,0)', 'נקודה M', 'MA = MB'], 'M', 0)).toBe('ישר · x - 2 = 0');
    expect(locusAt(['A(-9,0)', 'B(41,0)', 'נקודה P', 'PA מאונך ל-PB'], 'P', 0)).toBe('מעגל · (x − 16)² + y² = 25²');
  });
});

describe('#1186 — the regression fixture (rule 4)', () => {
  it('the fixture records line by line through the real submit path and answers in a', () => {
    const fx = winter25InA as { lines: string[]; seed: number };
    for (let i = 0; i < fx.lines.length; i += 1) {
      expect(decideSubmit(fx.lines[i], fx.lines.slice(0, i), fx.seed).kind, fx.lines[i]).toBe('record');
    }
    expect(derive(fx.lines, fx.seed).faults).toEqual([]);
    expect(locusAt(fx.lines, 'P', fx.seed)).toBe('מעגל · (x − 16a)² + y² = (25a)²');
  });
});

describe('#2608 — a centre that moves with a letter never answers nothing', () => {
  it('«A(a,0) · נקודה M · MA = 3» → «מעגל · (x − a)² + y² = 3²» at seeds 0–4 (2 and 4 answered null)', () => {
    for (const s of [0, 1, 2, 3, 4]) expect(locusAt(CENTRE_A, 'M', s), `seed ${s}`).toBe('מעגל · (x − a)² + y² = 3²');
  });
});

describe('#1186 ruling 11A — two letters', () => {
  it('«A(a,b) · נקודה M · MA = 3» → «מעגל · (x − a)² + (y − b)² = 3²»', () => {
    for (const s of [0, 1, 2, 3]) expect(locusAt(['A(a,b)', 'נקודה M', 'MA = 3'], 'M', s), `seed ${s}`).toBe('מעגל · (x − a)² + (y − b)² = 3²');
  });

  it('an ellipse in a and b: the midpoint of P and its foot on the x-axis → «x²/a² + y²/(b²/4) = 1»', () => {
    const lines = [
      'נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1',
      'P נקודה על האליפסה',
      'האנך מ-P לציר ה-x חותך אותו בנקודה N',
      'M אמצע PN',
    ];
    for (const s of [0, 1, 2, 3]) expect(locusAt(lines, 'M', s), `seed ${s}`).toBe('אליפסה · x²/a² + y²/(b²/4) = 1');
  });
});

describe('#1186 — what cannot be stated and verified keeps the kind alone', () => {
  it('a centre at (a + 1, 0) is not a monomial → «מעגל»', () => {
    for (const s of [0, 1, 2]) expect(locusAt(['A(a+1,0)', 'נקודה M', 'MA = 3'], 'M', s), `seed ${s}`).toBe('מעגל');
  });

  it('three letters → «מעגל»', () => {
    for (const s of [0, 1, 2]) expect(locusAt(['A(a,b)', 'נקודה M', 'MA = c'], 'M', s), `seed ${s}`).toBe('מעגל');
  });
});

describe('#1186 — the self-check runs, and refuses a wrong form against real traces', () => {
  /** The samples the gate would hand `parametricShape`: real traces of חורף 25 at four configurations. */
  const samples = (): LocusSample[] => {
    const c = derive(WINTER25, 0).construction;
    return [0, 1, 2, 3].map((seed) => {
      const res = locusOf(c, 'P', [seed, seed + 1]);
      expect(res, `seed ${seed}`).not.toBeNull();
      return { env: drawableAt(c, seed).env, points: res!.components[0].trace.points };
    });
  };
  const right: SymbolicCurve = { kind: 'circle', cx: { c: 16, pow: { a: 1 } }, cy: { c: 0, pow: {} }, r2: { c: 625, pow: { a: 2 } } };

  it('the true form passes', () => {
    expect(verifySymbolic(right, samples())).toBe(true);
  });

  it('the right shape with the wrong ratio is rejected (centre 15a)', () => {
    expect(verifySymbolic({ ...right, cx: { c: 15, pow: { a: 1 } } }, samples())).toBe(false);
  });

  it('the right shape with the wrong degree is rejected (r² = 625a)', () => {
    expect(verifySymbolic({ ...right, r2: { c: 625, pow: { a: 1 } } }, samples())).toBe(false);
  });
});
