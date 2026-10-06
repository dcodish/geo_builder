/**
 * #1691 (ADR-AG-239) — «AB ו- BC משיקים למעגל»: the spaced conjunction reads as «ו-BC».
 *
 * Prod, 2026-10-01: a student typed «מעגל O», then «AB ו- BC משיקים למעגל»; the second line was not
 * understood and cost a paid escalation, while «AB ו-BC» built. Measured at pickup: analytic's tangency target
 * reader split «ו-?(?=\S)» and left the piece «- BC»; and every builder (2-D and 3-D too) missed «ו -X» / «ו - X»
 * in its other list readers. The fix is one shared fold at each builder's parser boundary (`shell/conjunction`).
 *
 * These locks CALL the shipped path (`decideSubmit`); the cross-builder rows are `conj-space-*-1691-*` in the
 * shared parity fixture.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

/** Submit each line in order through the app's real decision, carrying the recorded lines forward. */
function run(steps: readonly string[]): string[] {
  const lines: string[] = [];
  const kinds: string[] = [];
  for (const s of steps) {
    const v = decideSubmit(s, lines, 0, derive(lines, 0));
    kinds.push(v.kind);
    if (v.kind === 'record') lines.push(v.line);
  }
  return kinds;
}

describe('ADR-AG-239 — the spaced «ו-» conjunction (#1691)', () => {
  it('the student’s exact prod sequence records both lines', () => {
    expect(run(['מעגל O', 'AB ו- BC משיקים למעגל'])).toEqual(['record', 'record']);
  });

  it.each([
    [['משולש ABC', 'מעגל O'], 'AB ו- BC משיקים למעגל'],
    [['משולש ABC', 'מעגל O'], 'AB ו -BC משיקים למעגל'],
    [['משולש ABC', 'מעגל O'], 'AB ו - BC משיקים למעגל'],
    [['l1: y = 2x + 1', 'l2: y = -x + 4'], 'מעגל M משיק לישרים l1 ו- l2'],
    [['l1: y = 2x + 1', 'l2: y = -x + 4'], 'מעגל M משיק לישרים l1 ו - l2'],
    [['l1: y = 2x + 1', 'l2: y = -x + 4'], 'l1 ו- l2 משיקים למעגל M'],
    [['A(1,2)'], 'מעגל O עובר דרך A ו- משיק לציר x'],
    [['A(1,2)'], 'מעגל O עובר דרך A ו - משיק לציר x'],
    [['משולש ABC'], 'הנקודות D ו -E על AB'],
    [['משולש ABC'], 'הנקודות D ו - E על AB'],
    [['מרובע ABCD'], 'הישרים AB ו - CD מאונכים'],
  ])('after %j, «%s» records — as its «ו-X» spelling does', (context, line) => {
    const glued = line.replace(/ו\s*-\s*/, 'ו-');
    expect(run([...context, glued]).at(-1), `control «${glued}»`).toBe('record');
    expect(run([...context, line])).toEqual([...context.map(() => 'record'), 'record']);
  });

  it('the minus sign of a coordinate beside the conjunction survives the fold', () => {
    const lines: string[] = [];
    const v = decideSubmit('הנקודות A(2,-3) ו - B(-1,4)', lines, 0, derive(lines, 0));
    expect(v.kind).toBe('record');
    const d = derive(v.kind === 'record' ? [v.line] : [], 0);
    const pt = (id: string) => d.figure.points.find((p) => p.id === id);
    expect([pt('A')?.x, pt('A')?.y, pt('B')?.x, pt('B')?.y]).toEqual([2, -3, -1, 4]);
  });
});
