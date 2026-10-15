/**
 * #2054 + #2061 (3-D arms) ([ADR-3D-344](../../docs/06b-decisions-3d.md#adr-3d-344)) — AN ANGLE CARRIES ONE NAME.
 *
 * Measured on `fix/2023-second-symbol` (8d3cadfb, main b0ef3240 + 2-D's ADR-661) through the store's real `submit`:
 *   «משולש ABC» · «זווית ABC=α» · «זווית ABC=β» (also «∠ABC=α», «זווית CBA=β», «זווית ABC=2α», the pyramid's «∠SAB»)
 *                                                → recorded; the arc relabelled to β and α left the figure without a word
 *   «משולש ABC» · «∠ABC=2α» · «∠ABC=3α» (the box too, «∠CBA», «∠ABC=α» · «∠ABC=2α»)
 *                                                → recorded; the arc kept «2α» and 3α vanished
 *
 * Operator rulings: 2026-10-13 (#2023, cards d4-2023 / d5-2023-tools — all three builders, the same sentence) and
 * 2026-10-14 (#2061, cards d14b-2061-crosstool A / d14b-2061-wording A — 3-D's own conflict sentence). A 3-D «AB=a»
 * is a vector (X7, operator 2026-09-18, #1184): the length sentence has no 3-D target and is not changed here.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

const strip = (s: string | null | undefined) => (s ?? '').replace(/[⁦-⁩]/g, '');
const text = (err: Parameters<typeof errorText3>[1]) => strip(errorText3((k, o) => i18n3d.t(k, { ...o, lng: 'he' }) as string, err));
const en = (err: Parameters<typeof errorText3>[1]) => strip(errorText3((k, o) => i18n3d.t(k, { ...o, lng: 'en' }) as string, err));

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null } as never);
});

/** Submit every line; return the LAST line's error (null when it was recorded). */
function run(lines: string[]) {
  const errors: (string | null)[] = [];
  for (const l of lines) {
    useGeo3.getState().submit(l);
    const e = useGeo3.getState().lastError;
    errors.push(e ? (e as { code: string }).code : null);
  }
  expect(errors.slice(0, -1), 'the prefix records').toEqual(errors.slice(0, -1).map(() => null));
  return useGeo3.getState().lastError;
}
const nameTaken = (angle: string, sym: string, line: string) => `לזווית ${angle} כבר יש שם: ${sym} (בשורה «${line}»). לכל זווית שם אחד — המשיכו עם ${sym}.`;
const contradicts = (line: string, other: string) => `הנתונים סותרים זה את זה — אין גוף שמקיים את «${line}» יחד עם «${other}»`;

describe('#2054 — a second letter for an angle is refused naming the first line', () => {
  it.each([
    [['משולש ABC', 'זווית ABC=α', 'זווית ABC=β'], nameTaken('ABC', 'α', 'זווית ABC=α')],
    [['משולש ABC', '∠ABC=α', 'זווית ABC=β'], nameTaken('ABC', 'α', '∠ABC=α')],
    [['משולש ABC', 'זווית ABC=α', '∠ABC=β'], nameTaken('ABC', 'α', 'זווית ABC=α')],
    [['משולש ABC', 'זווית ABC=α', 'זווית CBA=β'], nameTaken('CBA', 'α', 'זווית ABC=α')],
    [['משולש ABC', 'זווית ABC=2α', 'זווית ABC=β'], nameTaken('ABC', '2α', 'זווית ABC=2α')],
    [['פירמידה SABCD שבסיסה ריבוע', '∠SAB=α', '∠SAB=β'], nameTaken('SAB', 'α', '∠SAB=α')],
  ])('%j', (lines, sentence) => {
    const err = run(lines as string[]);
    expect(err?.code).toBe('angle-name-taken');
    expect(text(err!)).toBe(sentence);
  });

  it('English', () => {
    const err = run(['משולש ABC', 'זווית ABC=α', 'זווית ABC=β']);
    expect(en(err!)).toBe('Angle ABC already has a name: α (in the line «זווית ABC=α»). An angle has one name — keep using α.');
  });
});

describe('#2061 (3-D arm) — the same letter with another coefficient is refused in 3-D\'s conflict sentence', () => {
  it.each([
    [['משולש ABC', '∠ABC=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α')], // the ruled case
    [["תיבה ABCDA'B'C'D'", '∠ABC=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α')], // a solid host
    [['משולש ABC', 'זווית ABC=2α', 'זווית CBA=3α'], contradicts('זווית CBA=3α', 'זווית ABC=2α')],
    [['משולש ABC', '∠ABC=α', '∠ABC=2α'], contradicts('∠ABC=2α', '∠ABC=α')], // coefficient 1 vs 2
    [['משולש ABC', 'angle ABC = 2α', 'angle ABC = 3α'], contradicts('angle ABC = 3α', 'angle ABC = 2α')],
  ])('%j', (lines, sentence) => {
    const err = run(lines as string[]);
    expect(err?.code).toBe('givens-contradict');
    expect(text(err!)).toBe(sentence);
  });
});

describe('unchanged', () => {
  it.each([
    [['משולש ABC', '∠ABC=2α', '∠ABC=2α']], // the same letter again: already stated
    [['משולש ABC', '∠ABC=2α', '∠ABC=50']], // a number pins α
    [['משולש ABC', '∠ABC', '∠ABC=β']], // an unlabelled mark takes its first name
    [['משולש ABC', 'זווית ABC=α', 'זווית BCA=α']], // one letter on two angles: the equality (ADR-3D-052)
    [['משולש ABC', '∠ABC=2α', '∠BCA=3α']], // a ratio between two angles (#977)
    [['משולש ABC', 'AB=a', 'AB=c']], // a vector (X7): the length sentence has no 3-D target
  ])('%j records', (lines) => {
    expect(run(lines as string[])).toBeNull();
  });

  it('the numeric twin keeps its refusal', () => {
    const err = run(['משולש ABC', 'זוית B=40', 'זוית ABC=50']);
    expect(text(err!)).toBe(contradicts('זוית ABC=50', 'זוית B=40'));
  });
});

describe('a saved list holding both lines opens with the second line refused', () => {
  const facts = (lines: string[]): Fact3[] =>
    lines.map((u, i) => {
      const r = parse3(u);
      if (!r.ok) throw new Error(u);
      return { id: `f${i}`, utterance: u, cmds: r.commands, enabled: true };
    });
  it.each([
    [['משולש ABC', 'זווית ABC=α', 'זווית ABC=β'], nameTaken('ABC', 'α', 'זווית ABC=α')],
    [['משולש ABC', '∠ABC=2α', '∠ABC=3α'], contradicts('∠ABC=3α', '∠ABC=2α')],
  ])('%j', (lines, sentence) => {
    const d = derive3(facts(lines as string[]), 0);
    expect(d.status.f1).toBe('ok');
    expect(text(d.status.f2 as Parameters<typeof errorText3>[1])).toBe(sentence);
  });
});
