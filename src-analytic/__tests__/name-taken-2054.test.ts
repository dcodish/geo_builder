/**
 * #2054 + #2061 (analytic arms) ([ADR-AG-277](../../docs/06c-decisions-analytic.md#adr-ag-277)) — AN ANGLE OR A SEGMENT
 * CARRIES ONE LETTER; THE SAME LETTER WITH ANOTHER COEFFICIENT CONTRADICTS THE EARLIER LINE. 2-D's verdict (ADR-661).
 *
 * Measured on `fix/2023-second-symbol` (8d3cadfb) through `decideSubmit` + `errorText`, seed 0:
 *   «משולש ABC» · «זוית B=α» · «זוית ABC=β» (and «זווית ABC=α» · «זווית ABC=β» / «זווית CBA=β», «AB=a» · «AB=c» / «BA=c»,
 *   «AB=2a» · «AB=c»)                          → recorded, both letters kept (the canvas showed the later one)
 *   «משולש ABC» · «∠ABC=2α» · «∠ABC=3α»          → refused with the flat-triangle sentence (`polygon-collapsed`)
 *   «∠ABC=2α» · «∠ABC=3α» (no triangle)          → recorded silently (α = 0)
 *   «A(0,0)» · «B(4,0)» · «C(1,3)» · … · «∠ABC=3α» → refused «לא נמצאה תצורה שבה מתקיים: …»
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
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
const angleTaken = (name: string, sym: string, line: string) => `לזווית ${name} כבר יש שם: ${sym} (בשורה «${line}»). לכל זווית שם אחד — המשיכו עם ${sym}.`;
const lengthTaken = (name: string, sym: string, line: string) => `לקטע ${name} כבר יש שם: ${sym} (בשורה «${line}»). לכל קטע שם אחד — המשיכו עם ${sym}.`;
const contradicts = (line: string, other: string, what: string) => `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: ${what}.`;

describe('#2054 — a second letter is refused with 2-D\'s sentence, naming the first line', () => {
  it.each([
    [['משולש ABC', 'זוית B=α', 'זוית ABC=β'], angleTaken('ABC', 'α', 'זוית B=α')], // the operator's card
    [['משולש ABC', 'זווית ABC=α', 'זווית ABC=β'], angleTaken('ABC', 'α', 'זווית ABC=α')],
    [['משולש ABC', '∠ABC=α', 'זווית ABC=β'], angleTaken('ABC', 'α', '∠ABC=α')],
    [['משולש ABC', 'זווית ABC=α', 'זווית CBA=β'], angleTaken('CBA', 'α', 'זווית ABC=α')],
    [['משולש ABC', 'זוית ABC=α', 'זוית B=β'], angleTaken('ABC', 'α', 'זוית ABC=α')],
    [['משולש ABC', 'זווית ABC=2α', 'זווית ABC=β'], angleTaken('ABC', '2α', 'זווית ABC=2α')],
    [['משולש ABC', 'AB=a', 'AB=c'], lengthTaken('AB', 'a', 'AB=a')], // the operator's length card
    [['משולש ABC', 'AB=a', 'BA=c'], lengthTaken('BA', 'a', 'AB=a')],
    [['משולש ABC', 'AB=2a', 'AB=c'], lengthTaken('AB', '2a', 'AB=2a')],
  ])('%j', (lines, sentence) => {
    expect(said(lines as string[])).toBe(sentence);
  });

  it('English', () => {
    expect(said(['משולש ABC', 'AB=a', 'AB=c'], en)).toBe('Segment AB already has a name: a (in the line «AB=a»). A segment has one name — keep using a.');
  });
});

describe('#2061 (analytic arm) — the same letter with another coefficient contradicts the first line, in 2-D\'s frame', () => {
  it.each([
    [['משולש ABC', '∠ABC=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 3α')], // was the flat triangle
    [['משולש ABC', 'זווית ABC=2α', 'זווית ABC=3α'], contradicts('זווית ABC=3α', 'זווית ABC=2α', '∠ABC = 3α')],
    [['משולש ABC', '∠ABC=2α', '∠CBA=3α'], contradicts('∠CBA=3α', '∠ABC=2α', '∠CBA = 3α')],
    [['משולש ABC', '∠ABC=α', '∠ABC=2α'], contradicts('∠ABC=2α', '∠ABC=α', '∠ABC = 2α')],
    [['משולש ABC', '∠ABC=2α', '∠ACB=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 3α')],
    [['∠ABC=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 3α')], // was recorded silently
    [['A(0,0)', 'B(4,0)', 'C(1,3)', '∠ABC=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 3α')], // was «לא נמצאה תצורה»
    [['משולש ABC', 'AB=2a', 'AB=3a'], contradicts('AB=3a', 'AB=2a', '|AB| = 3a')], // the length twin, as 2-D
  ])('%j', (lines, sentence) => {
    expect(said(lines as string[])).toBe(sentence);
  });

  it('English: 2-D\'s frame', () => {
    expect(said(['משולש ABC', '∠ABC=2α', '∠ABC=3α'], en)).toBe("Can't do that: «∠ABC=3α» contradicts «∠ABC=2α» — they can't both hold. The reason: ∠ABC = 3α.");
  });
});

describe('unchanged', () => {
  it.each([
    [['משולש ABC', 'AB=a', 'AB=a'], 'already-known'],
    [['משולש ABC', 'זווית ABC=α', 'זווית ABC=α'], 'already-known'],
    [['משולש ABC', '∠ABC=2α', '∠ABC=2α'], 'already-known'],
    [['משולש ABC', 'AB=a', 'BC=a'], 'record'], // one letter on two segments: AB = BC
    [['משולש ABC', 'CB=c', 'AB=a', 'AB=c'], 'record'], // c names CB: the relation, never a second name
    [['משולש ABC', 'AB=a', 'AB=5'], 'record'], // a number pins the letter
    [['משולש ABC', '∠ABC=2α', '∠ABC=50'], 'record'],
    [['משולש ABC', 'AB=2a', 'AB=a+3'], 'record'], // a shared letter: an equation (a = 3)
    [['משולש ABC', 'tan∢ABC = k', 'זוית ABC=β'], 'record'], // a trig measure is another quantity
    [['משולש ABC', 'נסמן זוית ABC כ-A1', 'זוית ABC=β'], 'record'], // a label is not a value (2-D: unchanged)
    [['משולש ABC', '∠ABC=2α', '∠BCA=3α'], 'record'], // two angles: a ratio
  ])('%j → %s', (lines, kind) => {
    expect(last(lines as string[]).kind).toBe(kind);
  });

  it('the numeric twin and «3α+10» are judged by the solve, as before', () => {
    expect(said(['משולש ABC', 'זוית B=40', 'זוית ABC=50'])).toMatch(/^לא נמצאה תצורה/);
    expect(said(['משולש ABC', '∠ABC=2α', '∠ABC=3α+10'])).toMatch(/^לא נמצאה תצורה/);
  });
});

describe('a saved list holding both lines refuses the second, in the same sentence', () => {
  it.each([
    [['משולש ABC', 'זוית B=α', 'זוית ABC=β'], angleTaken('ABC', 'α', 'זוית B=α')],
    [['משולש ABC', 'AB=a', 'AB=c'], lengthTaken('AB', 'a', 'AB=a')],
    [['משולש ABC', '∠ABC=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α', '∠ABC = 3α')],
  ])('%j', (lines, sentence) => {
    const d = derive(lines as string[], 0);
    const f = d.faults.find((x) => x.index === 2);
    expect(f, 'the second line is refused').toBeDefined();
    expect(d.faults.some((x) => x.index === 1), 'the first line stands').toBe(false);
    const v = last(lines as string[]);
    expect(plain(errorText((v as { error: InputError }).error, he))).toBe(sentence);
    expect(f!.declared).toBe(lines[1]);
  });
});
