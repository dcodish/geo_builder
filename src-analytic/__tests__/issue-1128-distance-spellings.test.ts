/**
 * #1128 (ADR-AG-119) — every way a student writes a distance reaches the SAME term.
 *
 * **Operator ruling, 2026-09-16:** *"`d_{AB}` should also work for questions. as well as `|AB|`"* —
 * and, on the spelling list, *"we need to support all of these"*. Plus, playing the round of
 * 2026-09-19: *"אורך הקטע BC = 10 is not recognized in analytics tool"*.
 *
 * Before this, a student had exactly ONE way to state a length — the bare symbolic `AB = 10`. Every
 * plain Hebrew word for it («אורך AB», «הקטע AB», «צלע AB») and every textbook notation (`d_{AB}`,
 * `d(A,B)`, `|AB|`) was refused.
 *
 * ## The lock is EQUALITY, not twelve geometry assertions
 *
 * Each spelling is a NOTATION for one question, so the claim under test is that they are the same
 * question — asserted as *this spelling produces the same term as `AB`*. Twelve independent
 * expectations would pass while two spellings quietly disagreed, and they would also re-state the
 * grammar inside the test ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 *
 * ## Two surfaces, proven on both
 *
 * `ask` and the `lengthEq` given rule call ONE function (`parseLengthExpr`), which is why "also
 * works for questions" cost nothing. That shared call is exactly the thing a later refactor could
 * break silently, so both surfaces are asserted rather than assumed from the shared call.
 */
import { describe, expect, it } from 'vitest';
import { parseLengthExpr } from '../engine/lengths';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
// #1129 moved the palette out of App.tsx into its own module; this import followed it.
import { SYMBOLS } from '../ui/symbols';
import { applySymbol } from '../../shell/symbols';

/** Every spelling of «the distance from A to B», which is what they all have to be. */
const POINT_PAIR = [
  'AB',
  'd_{AB}',
  'd_{A,B}',
  'd(A,B)',
  '|AB|',
  'המרחק בין A ל-B',
  'המרחק בין A לבין B',
  'המרחק מ-A ל-B',
  'המרחק AB',
  'אורך AB',
  'אורך הקטע AB',
  'הקטע AB',
  'צלע AB',
];

const REFERENCE = parseLengthExpr('AB');

describe('ADR-AG-119 — one term, every spelling (#1128)', () => {
  it.each(POINT_PAIR)('«%s» is the term «AB»', (spelling) => {
    const e = parseLengthExpr(spelling);
    expect(e, `${spelling} did not parse as a length`).not.toBeNull();
    expect(e!.terms).toEqual(REFERENCE!.terms);
  });

  it.each(POINT_PAIR)('«%s = 10» is accepted as a GIVEN', (spelling) => {
    const r = parseLine(`${spelling} = 10`);
    expect(r.ok, `${spelling} = 10 was refused`).toBe(true);
  });

  /**
   * And the same figure comes out, not merely a parse. Asserted against the spelling that already
   * worked, so this cannot pass by every spelling being wrong in the same way.
   */
  it.each(POINT_PAIR)('«%s = 10» builds the same figure as «AB = 10»', (spelling) => {
    const shape = (line: string) => {
      const d = derive(['A(0,0)', 'נקודה B', line]);
      return {
        faults: d.faults.map((f) => f.code),
        len: d.figure.points.length === 2 ? Math.hypot(d.figure.points[0].x - d.figure.points[1].x, d.figure.points[0].y - d.figure.points[1].y).toFixed(4) : 'n/a',
      };
    };
    expect(shape(`${spelling} = 10`)).toEqual(shape('AB = 10'));
  });

  it.each(POINT_PAIR)('«%s» is ASKABLE, and answers the same number', (spelling) => {
    const d = derive(['A(0,0)', 'B(6,8)']);
    const answer = (q: string) => ask(d, q, (v) => String(+v.toFixed(4)), (k) => k).value;
    expect(answer(spelling), `${spelling} was not askable`).toBe('10');
  });
});

/**
 * THE THREE ROWS THAT CAME FROM #1246's TABLE.
 *
 * `issue-1246-equation-claim.test.ts` asserted these were `not-handled` — correctly, at the time:
 * that issue's ruling was «never bad-equation», and `not-handled` was the best answer available to
 * it, not its goal. They are here with the opposite expectation, and a comment stands in their
 * place in the old table, because a lock that simply vanishes looks like coverage nobody wrote.
 */
describe('ADR-AG-119 — what #1246 could only refuse, this answers (#1128)', () => {
  it.each(['הקטע BC = 10', 'הצלע BC = 10', 'אורך הקטע BC = 10'])('«%s» is now a length', (line) => {
    const r = parseLine(line);
    expect(r.ok).toBe(true);
  });

  /**
   * AND THE BOUNDARY, which is the half that keeps this from being a noun free-for-all. Each of
   * these asserts something BESIDES a length — that BC is a median, a height, a leg, a base, a
   * hypotenuse — so reading it as |BC| = 10 would drop the student's claim silently. The noun list
   * admits only nouns that add NOTHING to the pair they precede.
   */
  it.each(['התיכון BC = 10', 'הגובה BC = 10', 'השוק BC = 10', 'הבסיס BC = 10', 'היתר BC = 10'])(
    '«%s» is still NOT silently reduced to a length',
    (line) => {
      const r = parseLine(line);
      expect(r.ok).toBe(false);
    },
  );

  /**
   * «הישר BC = 10» stays refused too, and for a different reason worth keeping separate: a LINE has
   * no length. That is ADR-AG-111's extent ruling, and reading it as a segment would overturn it
   * sideways from a distance fix.
   */
  it('«הישר BC = 10» is still refused — a line has no length', () => {
    expect(parseLine('הישר BC = 10').ok).toBe(false);
  });
});

/**
 * THE POINT-TO-LINE HALF, which this issue split off as (b) — and which has since landed from the
 * other direction (#1048). The symbolic spelling inherits it rather than being refused beside its
 * own worded synonym, and that is a PROPERTY of routing the notations through the worded frames
 * instead of giving them patterns of their own.
 */
describe('ADR-AG-119 — the symbolic form inherits point-to-line (#1128)', () => {
  it('d_{A,l1} is the same term as «המרחק בין A לישר l1»', () => {
    const sym = parseLengthExpr('d_{A,l1}');
    const worded = parseLengthExpr('המרחק בין A לישר l1');
    expect(sym).not.toBeNull();
    expect(sym!.terms).toEqual(worded!.terms);
  });
});

/**
 * The chip the operator asked for, proved against the grammar rather than assumed.
 *
 * A palette button whose output the parser refuses hands the student `not-handled` on their own
 * click, which is why this chip could not exist until `d_{AB}` parsed. The full totality guard over
 * every glyph is #1129; this proves the one button this issue adds.
 */
describe('ADR-AG-119 — the d_{} chip inserts something that parses (#1128)', () => {
  const chip = SYMBOLS.find((s) => s.label === 'd_{}');

  it('is in the palette, and wraps rather than inserts', () => {
    expect(chip, 'the d_{} chip is missing from the palette').toBeDefined();
    expect(chip!.after, 'the chip must WRAP the selection, like complex’s').toBe('}');
  });

  it('wrapping a selected pair produces a line the parser accepts', () => {
    // A student selects «AB» in «AB = 10» and presses the chip.
    const { value } = applySymbol('AB = 10', 0, 2, chip!);
    expect(value).toBe('d_{AB} = 10');
    expect(parseLine(value).ok).toBe(true);
  });

  it('pressing it on an empty caret leaves a form that parses once filled', () => {
    const { value, caret } = applySymbol('', 0, 0, chip!);
    expect(value).toBe('d_{}');
    // The caret sits between the wrap, so typing the pair completes it.
    const typed = value.slice(0, caret) + 'AB' + value.slice(caret);
    expect(typed).toBe('d_{AB}');
    expect(parseLengthExpr(typed)).not.toBeNull();
  });
});
