/**
 * #2105 ([ADR-AG-295](../../docs/06c-decisions-analytic.md#adr-ag-295)) — A SECOND, DIFFERENT VALUE FOR ONE SEGMENT OR ONE
 * ANGLE IS REFUSED NAMING THE FIRST LINE, IN 2-D'S WORDING.
 *
 * Measured on `main` @ b0e9dbea through `decideSubmit` + `errorText`, seed 0 (2-D through `decideDeterministic2D`):
 *   «משולש ABC» · «AB=4» · «AB=5»             analytic «לא נמצאה תצורה שבה מתקיים: "AB=5"» · 2-D «לא ניתן: «AB=5» סותר את «AB=4» — …»
 *   «משולש ABC» · «∠ABC=40» · «∠ABC=50»       analytic «לא נמצאה תצורה …»                 · 2-D the same frame, «הסיבה: ∠ABC = 50°.»
 *   «משולש ABC» · «∠ABC = α» · «∠ABC = α + 40» analytic «לא נמצאה תצורה …»                 · 2-D the frame (ADR-662's member)
 *   «משולש ABC» · «AB=2a» · «AB=3a»            already 2-D's sentence in both (ADR-661 / ADR-AG-277) — locked here as the
 *                                              operator's exact sequence.
 *
 * Operator ruling 2026-10-15 (#2105, decisions ballot card 4): a second, different size for the same thing is a
 * contradiction, everywhere, in 2-D's wording; analytic's numeric-contradiction sentence takes 2-D's frame (ADR-W-118 B1).
 * One predicate, `measureRestatement` (engine/statedMeasures.ts).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';

const he = analyticI18n.getFixedT('he') as unknown as Parameters<typeof errorText>[1];
const en = analyticI18n.getFixedT('en') as unknown as Parameters<typeof errorText>[1];
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** Record every line but the last through the real gate, and return the last line's verdict. */
function last(lines: string[]) {
  const recorded: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, recorded, 0);
    expect(v.kind, `${line} is recorded`).toBe('record');
    recorded.push(line);
  }
  return decideSubmit(lines[lines.length - 1], recorded, 0);
}
const said = (lines: string[], t = he) => {
  const v = last(lines);
  expect(v.kind, lines.join(' · ')).toBe('refused');
  return plain(errorText((v as { error: InputError }).error, t));
};
const contradicts = (line: string, other: string, what: string) => `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: ${what}.`;

describe('#2105 — two different numbers for one segment or angle: 2-D\'s sentence, naming the first line', () => {
  it.each([
    [['משולש ABC', 'AB=4', 'AB=5'], contradicts('AB=5', 'AB=4', '|AB| = 5')], // the issue's numeric row
    [['משולש ABC', 'BA=4', 'AB=5'], contradicts('AB=5', 'BA=4', '|AB| = 5')], // either letter order
    [['משולש ABC', 'AB=√2', 'AB=1.5'], contradicts('AB=1.5', 'AB=√2', '|AB| = 1.5')],
    [['משולש ABC', '∠ABC=40', '∠ABC=50'], contradicts('∠ABC=50', '∠ABC=40', '∠ABC = 50°')],
    [['משולש ABC', '∠ABC=40', '∠CBA=50'], contradicts('∠CBA=50', '∠ABC=40', '∠CBA = 50°')], // the rays in either order
    [['משולש ABC', 'זווית B=40', 'זווית ABC=50'], contradicts('זווית ABC=50', 'זווית B=40', '∠ABC = 50°')],
  ])('%j', (lines, sentence) => {
    expect(said(lines as string[])).toBe(sentence);
  });

  it('English: 2-D\'s frame', () => {
    expect(said(['משולש ABC', 'AB=4', 'AB=5'], en)).toBe("Can't do that: «AB=5» contradicts «AB=4» — they can't both hold. The reason: |AB| = 5.");
  });
});

describe('#2105 — the same letter with another coefficient or constant: 2-D\'s sentence (ADR-661 / ADR-662 members)', () => {
  it.each([
    [['משולש ABC', 'AB=2a', 'AB=3a'], contradicts('AB=3a', 'AB=2a', '|AB| = 3a')], // the operator's exact sequence
    [['משולש ABC', 'AB=2a', 'BA=3a'], contradicts('BA=3a', 'AB=2a', '|BA| = 3a')],
    [['משולש ABC', '∠ABC = α', '∠ABC = α + 40'], contradicts('∠ABC = α + 40', '∠ABC = α', '∠ABC = α + 40')],
    [['משולש ABC', 'AB=a', 'AB=a+3'], contradicts('AB=a+3', 'AB=a', '|AB| = a + 3')],
    [['משולש ABC', 'AB=a+3', 'AB=a+5'], contradicts('AB=a+5', 'AB=a+3', '|AB| = a + 5')],
  ])('%j', (lines, sentence) => {
    expect(said(lines as string[])).toBe(sentence);
  });
});

describe('#2105 — controls: agreeing values and solvable equations are unchanged', () => {
  it.each([
    [['משולש ABC', 'AB=4', 'AB=4'], 'already-known'],
    [['משולש ABC', 'AB=4', 'AB=4.0'], 'already-known'],
    [['משולש ABC', '∠ABC=40', '∠ABC=40'], 'already-known'],
    [['משולש ABC', 'AB=2a', 'AB=2a'], 'already-known'],
    [['משולש ABC', 'AB=2a', 'AB=6'], 'record'], // a number after a letter pins it (a = 3)
    [['משולש ABC', 'AB=2a', 'AB=a+3'], 'record'], // coefficient AND constant changed: an equation that fixes a
    [['משולש ABC', 'AB=a+3', 'AB=3+a'], 'already-follows'], // the same affine value in another spelling
  ])('%j → %s', (lines, kind) => {
    expect(last(lines as string[]).kind).toBe(kind);
  });
});
