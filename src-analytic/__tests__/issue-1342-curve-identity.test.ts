/**
 * #1342 ([ADR-AG-147](../../docs/06c-decisions-analytic.md#adr-ag-147)) — ONE LINE, ONE ROW.
 *
 * Operator, 2026-09-21, playing PR #1341: *"second line should have said this already exists"* —
 * «נתון הישר 1: 2x-y+8=0» accepted, then «נתון הישר 2x-y+8=0» accepted as a SECOND given, «2 נתונים»,
 * two stacked lines on the canvas.
 *
 * `priorOf` compares ids only, and an anonymous curve's id is content-derived from its equation TEXT
 * while a named one's is its name — so one equation stated under two identities was two objects. This
 * is the #1153 «one position, one name» rule, which #1113/#1126 measured on crossings and #1153 closed
 * for derived points; the curve arm never got it.
 *
 * The table below is the issue's own measured table, asserted as behaviour.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';

const curvesOf = (lines: string[]) =>
  derive(lines, 0).construction.objects.filter((o) => o.kind === 'curve');
const verdict = (first: string, second: string) => decideSubmit(second, [first], 0).kind;

describe('#1342 — one equation under two identities is ONE object', () => {
  it.each([
    ['a name, then no name', 'נתון הישר 1: 2x-y+8=0', 'נתון הישר 2x-y+8=0'],
    ['a NAMED line, then no name', 'נתון הישר l1: 2x-y+8=0', 'נתון הישר 2x-y+8=0'],
    ['the same line in SLOPE form', 'נתון הישר 1: 2x-y+8=0', 'y=2x+8'],
  ])('%s — the second says «כבר ידוע» and mints nothing', (_why, first, second) => {
    expect(verdict(first, second)).toBe('already-known');
    expect(curvesOf([first, second])).toHaveLength(1);
  });

  /**
   * The reverse order is NOT «already known»: the second line gives the line a NAME it did not have,
   * and the panel now calls it «ישר 1». A name does not "already follow" from anything.
   */
  it('no name, then a name — the existing line is NARROWED and the row records', () => {
    const lines = ['נתון הישר 2x-y+8=0', 'נתון הישר 1: 2x-y+8=0'];
    expect(verdict(lines[0], lines[1])).toBe('record');

    const curves = curvesOf(lines);
    expect(curves).toHaveLength(1);
    expect(curves[0].kind === 'curve' && curves[0].label.name).toBe('ישר 1');
  });

  it('a SECOND name for a named line is refused, naming the holder — a line has one name', () => {
    const v = decideSubmit('נתון הישר l2: 2x-y+8=0', ['נתון הישר l1: 2x-y+8=0'], 0);
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error.key).toBe('already-named');
    expect(curvesOf(['נתון הישר l1: 2x-y+8=0', 'נתון הישר l2: 2x-y+8=0'])).toHaveLength(1);
  });

  it('the two rows the id already caught are unchanged', () => {
    expect(verdict('נתון הישר 2x-y+8=0', 'נתון הישר 2x-y+8=0')).toBe('already-known');
    expect(verdict('נתון הישר l1: 2x-y+8=0', 'נתון הישר l1: 2x-y+8=0')).toBe('already-known');
  });

  it('two GENUINELY different lines are still two lines', () => {
    expect(verdict('נתון הישר l1: 2x-y+8=0', 'נתון הישר l2: x+y=1')).toBe('record');
    expect(curvesOf(['נתון הישר l1: 2x-y+8=0', 'נתון הישר l2: x+y=1'])).toHaveLength(2);
  });
});

describe('#1342 — the boundaries the identity test has to respect', () => {
  /**
   * #1235 RULED that lines this close are DISTINCT and must offer a crossing ring. `sameCurve`'s
   * `|cos|` test cannot tell them apart (it is quadratic near 1, so a 1e-5 difference reads as 5e-11),
   * which is why the twin scan compares normalized coefficients component-wise instead. This row is
   * what makes that a lock rather than a comment.
   */
  it('near-parallel lines are NOT merged — #1235 stands', () => {
    expect(curvesOf(['נתון הישר l1: y=0', 'נתון הישר l2: y=0.00001x'])).toHaveLength(2);
    expect(curvesOf(['נתון הישר l1: y=x', 'נתון הישר l2: y=1.000001x'])).toHaveLength(2);
  });

  /**
   * A CARRIER is not an object the student asked for, and the next fact of its own line references it
   * by id — absorbing it deleted the id the membership was about, and P stopped existing (#1048's
   * honesty-gate row, measured red before this boundary was drawn).
   */
  it('a carrier is never absorbed — the point that rides it still exists', () => {
    const lines = ['נתון הישר l1: 3x-4y+1=0', 'נתון הישר l2: y=x', 'נקודה P על הישר y=x'];
    const d = derive(lines, 0);

    expect(d.faults).toEqual([]);
    expect(d.figure.points.some((q) => q.id === 'P')).toBe(true);
  });

  it('a stated line absorbed INTO a carrier is the #1076 promotion, and still draws', () => {
    const lines = ['נקודה P על הישר y=x', 'נתון הישר l2: y=x'];
    const curves = curvesOf(lines);

    expect(curves).toHaveLength(1);
    expect(curves[0].kind === 'curve' && curves[0].stated).toBe(true);
    expect(derive(lines, 0).faults).toEqual([]);
  });
});
