/**
 * #1119 — a line's constant term keeps its number when it is ±1.
 *
 * ```
 * נתון הישר l1: 3x-4y+1=0
 * ```
 * printed **`l1: 3x - 4y + = 0`** — the constant simply gone, and the equation malformed.
 *
 * **Root cause: a coefficient rule applied to a term that has no symbol.** `lineText` suppresses the
 * magnitude when `|k| = 1`, which is correct notation *for a coefficient* — `1x` must print as `x`. The
 * constant term is formatted by the same helper with `sym = ''`, so the rule erased the number itself.
 * The magnitude rule belongs to the SYMBOL, not to the term.
 *
 * It fired for **any** line whose constant is ±1, not only the #1093-built lines the DEPLOY-LOG entry for
 * `prod/2026-09-16-2` described.
 *
 * ## A bookkeeping note this issue exists because of
 *
 * That DEPLOY-LOG entry said of this defect: *"Cosmetic, the figure itself is correct; **filed** and fixed
 * next."* **No issue was ever filed.** It shipped, stayed live through three deploys, and the claim that
 * it had been filed is what stopped anyone looking — a claimed filing that did not happen is worse than an
 * unfiled defect.
 *
 * `lineText` was module-private, so a lock could only have REPRODUCED it — and a reproduction would have
 * carried the same bug in the same shape and agreed with it ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)).
 * It is exported now, and these cases call it.
 */
import { describe, expect, it } from 'vitest';
import { lineText } from '../app/curveText';

describe('#1119 — the constant term is a number, not a coefficient', () => {
  it('the operator’s own line', () => {
    expect(lineText(3, -4, 1)).toBe('3x - 4y + 1 = 0');
  });

  it('every line whose constant is ±1 — the class, not the one reported input', () => {
    expect(lineText(0, -1, 1)).toBe('-y + 1 = 0');
    expect(lineText(1, 1, 1)).toBe('x + y + 1 = 0');
    expect(lineText(3, -4, -1)).toBe('3x - 4y - 1 = 0');
    expect(lineText(2, 5, -1)).toBe('2x + 5y - 1 = 0');
  });

  it('a ±1 COEFFICIENT still drops its 1 — the rule it was borrowed from is intact', () => {
    /**
     * The other direction, and the reason this is a scoping fix rather than a deletion: `1x` printing as
     * `1x` would be just as wrong as `+ 1` printing as `+ `.
     */
    expect(lineText(1, 0, 5)).toBe('x + 5 = 0');
    expect(lineText(-1, 1, 3)).toBe('-x + y + 3 = 0');
    expect(lineText(1, -1, 0)).toBe('x - y = 0');
  });

  it('a zero constant is still omitted entirely', () => {
    expect(lineText(1, -1, 0)).toBe('x - y = 0');
    expect(lineText(3, -4, 0)).toBe('3x - 4y = 0');
  });

  it('constants that were never affected keep printing as they did', () => {
    expect(lineText(3, -4, 7)).toBe('3x - 4y + 7 = 0');
    expect(lineText(2, 3, -12)).toBe('2x + 3y - 12 = 0');
  });

  it('a leading + is dropped and a leading − stays attached', () => {
    expect(lineText(1, 0, 1)).toBe('x + 1 = 0');
    expect(lineText(-1, 0, 1)).toBe('-x + 1 = 0');
  });
});
