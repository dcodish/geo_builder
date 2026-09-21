/**
 * #1299 ([ADR-AG-148](../../docs/06c-decisions-analytic.md#adr-ag-148)) — NOTATION HAS ONE OWNER.
 *
 * Found in the operator's 2026-09-20 screenshot: he typed `(k+1)x+2y-12+5k=0` and the panel showed
 * `(k + 1)·x + 2·y - 12 + 5·k - 0 = 0` — a trailing `- 0` he never wrote. The `- 0` is the equation's
 * own right-hand side: a stated `LHS = RHS` is held as `LHS - RHS`, and the ALGEBRAIC printer
 * (`exprText`) emits the subtraction literally. A fixed line escaped it only because it took a
 * different printer.
 *
 * The lock that makes the fix structural rather than a second copy of the rules: **on a line whose
 * coefficients are numbers, the symbolic path and `lineText` produce the same string.** They cannot
 * drift, because the symbolic path DELEGATES ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 */
import { describe, expect, it } from 'vitest';
import { curveEquationText, lineText } from '../app/curveText';
import { derive } from '../engine/derive';
import { parseExpr, type Expr } from '../engine/expr';

/** The equation of the one curve a line declares, printed the way the panel prints it. */
const panelRow = (line: string): string => {
  const d = derive(['k הוא פרמטר', line], 0);
  const o = d.construction.objects.find((q) => q.kind === 'curve');
  expect(o, line).toBeDefined();
  return curveEquationText((o as { curve: { eq: Expr } }).curve.eq);
};

/** `ax + by + c` as a stated `… = 0`, i.e. exactly what the parser hands the printer. */
const statedZero = (a: number, b: number, c: number): Expr => ({
  kind: 'sub',
  a: {
    kind: 'add',
    a: {
      kind: 'add',
      a: { kind: 'mul', a: { kind: 'num', value: a }, b: { kind: 'sym', name: 'x' } },
      b: { kind: 'mul', a: { kind: 'num', value: b }, b: { kind: 'sym', name: 'y' } },
    },
    b: { kind: 'num', value: c },
  },
  b: { kind: 'num', value: 0 },
});

describe('#1299 — the reported row, and the rules it was missing', () => {
  it("the operator's own parametric line: no «- 0», and k still visible in both coefficients", () => {
    const row = panelRow('נתון הישר l3: (k+1)x+2y-12+5k=0');

    expect(row).not.toContain('- 0');
    expect(row).toContain('(k + 1)x');
    expect(row).toContain('5');
    expect(row.endsWith('= 0')).toBe(true);
  });

  /**
   * The negative control, and the row that proves the fix is about ZERO and not about subtraction: a
   * parametric line whose right-hand side is genuinely non-zero must still print its `- 3`.
   */
  it('a genuinely non-zero right-hand side keeps its constant', () => {
    expect(panelRow('נתון הישר l5: kx+y=3')).toBe('kx + y - 3 = 0');
  });

  it('a zero-coefficient term drops, matching lineText’s own rule', () => {
    expect(panelRow('נתון הישר l6: 0x+y-3=0')).toBe('y - 3 = 0');
  });

  it('a unit coefficient is suppressed', () => {
    expect(panelRow('נתון הישר l7: x=15')).toBe('x - 15 = 0');
  });

  it('the sign is folded into the connective — never «+ -12»', () => {
    const row = panelRow('נתון הישר l3: (k+1)x+2y-12+5k=0');
    expect(row).not.toContain('+ -');
  });
});

describe('#1299 — the two printers agree, by delegation', () => {
  it.each([
    [2, -1, 8],
    [1, 0, -15],
    [0, 1, -3],
    [-4 / 3, 1, 0],
    [1, 1, 0],
    [3, 2, -2],
    [0, 0, 5],
  ])('a(%d) b(%d) c(%d): the symbolic path returns exactly lineText’s string', (a, b, c) => {
    expect(curveEquationText(statedZero(a, b, c))).toBe(lineText(a, b, c));
  });

  /**
   * Not a nicety: #1180's fraction clearing lives in `lineText`, so a symbolic path that re-decided
   * notation for numeric lines would quietly lose it. Delegation is what keeps it.
   */
  it('#1180’s fraction clearing survives the new entry point', () => {
    expect(curveEquationText(statedZero(-4 / 3, 1, 0))).toBe('-4x + 3y = 0');
  });
});

describe('#1299 — what the printer declines to guess', () => {
  /**
   * A conic is not linear in x and y, so there is nothing for the notation rules to decide. Falling
   * back to the algebraic printer is honest — the same equation, without the polish — and the `- 0`
   * normalisation still applies, because that one is about how the equation was STATED.
   */
  it('a non-linear equation falls back, but never with a trailing «- 0»', () => {
    const eq = parseExpr('x^2+y^2-9')!;
    const stated: Expr = { kind: 'sub', a: eq, b: { kind: 'num', value: 0 } };

    expect(curveEquationText(stated)).toBe(curveEquationText(eq));
    expect(curveEquationText(stated)).not.toContain('- 0');
  });
});
