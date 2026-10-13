/**
 * #1773 (ADR-AG-274): an uppercase axis letter in a subscripted coordinate token was never read.
 *
 * Prod session `ie0fwbaa`, 2026-09-29: after the kite lines below the student typed «X_B<X_D» and got
 * `not-handled` (the model then answered `none`). Retyped as «x_B<x_D», the same line got the honest
 * contradiction. Every reader of the token (the comparison atom, `x_A = 5`) matched a lowercase `x`/`y`
 * only. The case is now folded once, in `orthography`, where every rule reads. The lock: every uppercase
 * spelling gets the verdict of its lowercase spelling, through the real `decideSubmit`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { orthography } from '../parser/frameAnalytic';

/** The operator's exact sequence, up to the line he typed in uppercase. */
const KITE = [
  'דלתון ABCD',
  'A(1,7)',
  'BD מונח על הישר y=x',
  'C נמצא על הישר y=-2x+17',
  'AB=6',
  'שיעור ה- x של B גדול משיעור ה- x של D',
];

const verdict = (line: string, lines: readonly string[]) => {
  const v = decideSubmit(line, lines, 0) as { kind: string; error?: { key: string } };
  return `${v.kind}${v.error ? `:${v.error.key}` : ''}`;
};

describe('#1773 — the operator’s sequence', () => {
  it('«X_B<X_D» after the kite is the honest contradiction, as «x_B<x_D» is', () => {
    expect(verdict('x_B<x_D', KITE)).toBe('refused:unsatisfiable');
    expect(verdict('X_B<X_D', KITE)).toBe('refused:unsatisfiable');
  });
});

/** The grid: each uppercase spelling beside the lowercase spelling it must equal. */
const GRID: readonly [upper: string, lower: string][] = [
  ['X_B<X_D', 'x_B<x_D'],
  ['X_B>X_D', 'x_B>x_D'],
  ['X_{B}<X_{D}', 'x_{B}<x_{D}'],
  ['B_X<D_X', 'B_x<D_x'],
  ['B_{X}<D_{X}', 'B_{x}<D_{x}'],
  ['X_B<x_D', 'x_B<x_D'],
  ['Y_B>Y_D', 'y_B>y_D'],
  ['X_B=3', 'x_B=3'],
  ['X_A=4', 'x_A=4'],
  ['Y_A=2', 'y_A=2'],
  ['X_{A}=4', 'x_{A}=4'],
  ['Y_A>0', 'y_A>0'],
  ['X_A<5', 'x_A<5'],
];
const CONTEXTS: readonly [name: string, lines: readonly string[]][] = [
  ['the kite', KITE],
  ['three stated points', ['A(1,7)', 'B(3,3)', 'D(5,1)']],
  ['an empty canvas', []],
];

describe('#1773 — every uppercase spelling has its lowercase verdict', () => {
  for (const [name, lines] of CONTEXTS) {
    for (const [upper, lower] of GRID) {
      it(`${name}: «${upper}» ≡ «${lower}»`, () => {
        const v = verdict(upper, lines);
        expect(v).not.toBe('refused:not-handled');
        expect(v).toBe(verdict(lower, lines));
      });
    }
  }
});

describe('#1773 — the fold, at the one boundary every rule reads', () => {
  it('folds the axis letter of a subscripted coordinate token, in every position', () => {
    expect(orthography('X_B<X_D')).toBe('x_B<x_D');
    expect(orthography('X_{B} > X_{D}')).toBe('x_{B} > x_{D}');
    expect(orthography('B_X<D_{X}')).toBe('B_x<D_{x}');
    expect(orthography('Y_A2 = 5')).toBe('y_A2 = 5');
  });

  it('never touches a point label: its subscript is digits', () => {
    expect(orthography('X_1(2,3)')).toBe('X_1(2,3)');
    expect(orthography('X_{12} על הישר y=x')).toBe('X_{12} על הישר y=x');
    expect(orthography('A_1B_2 = 5')).toBe('A_1B_2 = 5');
  });

  it('never touches a bare run: «XB» is a segment, not a coordinate', () => {
    expect(orthography('XB<XD')).toBe('XB<XD');
    expect(orthography('XY = 5')).toBe('XY = 5');
  });

  it('records the line the student typed, not the folded one', () => {
    const v = decideSubmit('X_B=3', [], 0) as { kind: string; line?: string };
    expect(v).toEqual({ kind: 'record', line: 'X_B=3' });
  });

  it('a refusal quotes the student’s own spelling', () => {
    const v = decideSubmit('X_B<X_D', KITE, 0) as { kind: string; error?: { detail?: string } };
    expect(v.error?.detail ?? '').not.toContain('x_B');
  });
});
