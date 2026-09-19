/**
 * #1221 — THE WORKING STATES ITS INTERMEDIATE, AND EACH STATEMENT GETS A ROW.
 *
 * **Operator, 2026-09-19, playing T25:** *"never include more than 2 equations in a line. the m=
 * should have a final answer there."* — on the trace for «משוואת הישר AB», `A(0,0)`, `B(3,4)`:
 *
 * ```
 * m = (4 - 0) / (3 - 0),  y - 0 = m(x - 0)
 * ```
 *
 * ## The `m` half is not a formatting nit — the working was unfollowable
 *
 * Every trace this tree can produce, measured:
 *
 * | question | trace | its result was… |
 * | --- | --- | --- |
 * | «משוואת הישר AB» | `m = (4 - 0) / (3 - 0),  y - 0 = m(x - 0)` | **nowhere** |
 * | «AB» | `d = √((3 - 0)² + (4 - 0)²)` | the answer row: `5` |
 * | «המרחק מ-C לישר AB» | `d(C, AB) = …` | the answer row: `5` |
 *
 * The line trace is the only one with an INTERMEDIATE, and it was never evaluated on any surface.
 * `d` needs no result printed because the answer row above says `5`. `m` is different: it is not the
 * answer — the answer is `4x - 3y = 0` — and the second step consumed it symbolically, so the student
 * was shown `y - 0 = m(x - 0)` and never told what `m` was. The trace handed them the last step,
 * which is the one thing #1053 built it not to do.
 *
 * **The rule, which gives "show more working" a stopping point:** an intermediate the next step
 * consumes is evaluated; a final value already in the answer row is not repeated. Under it the two
 * distance traces are already correct and stay byte-identical.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { fmtAnalytic } from '../format';

const rows = (lines: string[], q: string) => (ask(derive(lines, 0), q, fmtAnalytic).trace ?? '').split('\n');

describe('#1221 — the line trace is complete and one statement per row', () => {
  it("the operator's own case states m, then uses its value", () => {
    const r = rows(['A(0,0)', 'B(3,4)'], 'משוואת הישר AB');
    expect(r).toHaveLength(2);
    expect(r[0]).toBe('m = (4 - 0) / (3 - 0) = 4/3');
    expect(r[1]).toBe('y - 0 = (4/3)(x - 0)');
  });

  it('no row carries more than two equals — his limit, asserted', () => {
    for (const lines of [['A(0,0)', 'B(3,4)'], ['A(1,2)', 'B(4,2)'], ['A(-2,-5)', 'B(2,3)']]) {
      for (const r of rows(lines, 'משוואת הישר AB')) {
        expect((r.match(/=/g) ?? []).length, r).toBeLessThanOrEqual(2);
      }
    }
  });

  it('the slope stays EXACT — 4/3, never 1.33 (#1120)', () => {
    expect(rows(['A(0,0)', 'B(3,4)'], 'משוואת הישר AB')[0]).toContain('4/3');
  });

  it('a substituted slope is bracketed when it would otherwise be ambiguous (#1180)', () => {
    /**
     * `4/3(x - 0)` reads as `4/(3(x - 0))` at least as readily as `(4/3)(x - 0)` — the ambiguity this
     * codebase already ruled on for the panel's line rows.
     */
    expect(rows(['A(0,0)', 'B(3,4)'], 'משוואת הישר AB')[1]).toContain('(4/3)(x');
    expect(rows(['A(0,0)', 'B(3,-6)'], 'משוואת הישר AB')[1]).toContain('(-2)(x');
    // An integer slope needs none of that.
    expect(rows(['A(-2,-5)', 'B(2,3)'], 'משוואת הישר AB')[1]).toContain('= 2(x');
  });

  it('a horizontal line substitutes 0 — a value, not an absence', () => {
    const r = rows(['A(1,2)', 'B(4,2)'], 'משוואת הישר AB');
    expect(r[0]).toBe('m = (2 - 2) / (4 - 1) = 0');
  });

  it('«y - (0)» is gone — the bracket asked the WRONG point', () => {
    /**
     * Pre-existing, surfaced by this work: the bracket around `a.y` was chosen by `b.y`'s sign, so
     * `A(0,0)`, `B(3,-6)` printed `y - (0)`. A zero is never bracketed; a genuine negative still is.
     */
    expect(rows(['A(0,0)', 'B(3,-6)'], 'משוואת הישר AB')[1]).toContain('y - 0 =');
    expect(rows(['A(-2,-5)', 'B(2,3)'], 'משוואת הישר AB')[1]).toContain('y - (-5) =');
  });

  it('a VERTICAL line is unchanged — one row, no slope, and it says so', () => {
    const r = rows(['A(1,2)', 'B(1,7)'], 'משוואת הישר AB');
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('אנכי');
  });

  it('THE DISTANCE TRACES ARE BYTE-IDENTICAL — their result is already in the answer row', () => {
    // The stopping rule, asserted rather than assumed. These must not grow a «= 5».
    expect(rows(['A(0,0)', 'B(3,4)'], 'AB')).toEqual(['d = √((3 - 0)² + (4 - 0)²)']);
    expect(rows(['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC'], 'המרחק מ-C לישר AB')).toEqual([
      'd(C, AB) = |0·3 + 1·5 + 0| / √(0² + 1²)',
    ]);
  });
});
