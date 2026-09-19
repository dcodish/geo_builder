/**
 * #1226 — A COORDINATE THE STUDENT WROTE IS SHOWN, EVEN WHEN IT IS NOT A NUMBER.
 *
 * **Operator, 2026-09-19, playing T32** on «A(-9a,0)» / «B(41a,0)»: *"9a and 41a are still not shown
 * on the canvas or data panel which is wrong."*
 *
 * ## The tool held the expression and printed its own symbol instead
 *
 * ```
 * A.x                 mul(neg(num 9), sym 'a')     his own -9a, exactly
 * exprText(A.x)       "-9·a"                       renderable all along
 * the panel row       A = (x_A, 0)                 the TOOL's symbol, not the student's
 * ```
 *
 * That is worse than the dash it would otherwise print: `x_A` looks like an answer, and it silently
 * replaces something the student stated. *"Everything the student stated is visible on the figure"* is
 * the invariant, and `-9a` was stated.
 *
 * This is #1023's fix for the other object kind, in that issue's own words:
 *
 * > A curve the givens have not FIXED still has an equation, and the student wrote it. Printing a dash
 * > threw it away… It states no VALUE, so ADR-AG-003 §2 is untouched — it names the dependency, which
 * > is more than the dash said and less than a number.
 *
 * ## The guard was measured, not assumed
 *
 * ```
 * A(-9a,0)          kind = 'point'    x = mul(…)     ← this branch
 * A(2,5)            kind = 'point'    x = num        ← numbers still win
 * «A על הישר y=x»   kind = 'free'                    ← the (x_B, x_B) reading, untouched
 * «P אמצע AB»       kind = 'derived'                 ← derived rows, untouched
 * ```
 *
 * Only a STATED point with a non-numeric coordinate is reached, so neither neighbouring reading can be
 * disturbed by it.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { exprText } from '../engine/expr';

/** What the panel's point row decides, mirrored at the two branches this issue is about. */
const pointRow = (lines: string[], id: string): string => {
  const d = derive(lines, 0);
  const o = d.construction.objects.find((q) => q.id === id);
  if (o?.kind === 'point' && (o.x.kind !== 'num' || o.y.kind !== 'num')) {
    return `(${exprText(o.x)}, ${exprText(o.y)})`;
  }
  return `kind:${o?.kind ?? 'none'}`;
};

describe('#1226 — a stated parameter reaches the panel', () => {
  it("the operator's own points state what he wrote", () => {
    const FIG = ['A(-9a,0)', 'B(41a,0)', 'נקודה P', 'PA מאונך ל-PB'];
    expect(pointRow(FIG, 'A')).toBe('(-9·a, 0)');
    expect(pointRow(FIG, 'B')).toBe('(41·a, 0)');
  });

  it('the expression really is the student’s, held exactly', () => {
    /**
     * Guards the claim the fix rests on: nothing is inferred or recomputed, the parser already stored
     * `-9a` and this only prints it.
     */
    const o = derive(['A(-9a,0)'], 0).construction.objects.find((q) => q.id === 'A');
    expect(o?.kind).toBe('point');
    if (o?.kind !== 'point') throw new Error('unreachable — asserted above');
    expect(exprText(o.x)).toBe('-9·a');
  });

  it('a fully numeric point is unchanged — numbers still win', () => {
    // The determined case is answered before this branch is reached; it must not regress to symbols.
    expect(pointRow(['A(2,5)'], 'A')).toBe('kind:point');
  });

  it('A CARRIER POINT IS NOT TOUCHED — the (x_B, x_B) reading survives', () => {
    /**
     * The anti-lock. #1078's reading is a different branch for a different object kind, and a fix that
     * swallowed it would replace one honest row with another issue.
     */
    expect(pointRow(['A על הישר y=x'], 'A')).toBe('kind:free');
  });

  it('a DERIVED point is not touched either', () => {
    expect(pointRow(['A(0,0)', 'B(6,4)', 'P אמצע AB'], 'P')).toBe('kind:derived');
  });

  it('nothing is invented where the student gave nothing', () => {
    // A point with no stated expression must not acquire one.
    expect(pointRow(['נקודה P', 'A(0,0)', 'B(8,0)'], 'P')).not.toContain('·');
  });
});
