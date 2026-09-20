/**
 * #1260 — A LENGTH GIVEN TAKES THE HEBREW WORD FOR «=», AND STILL REFUSES A BOUND.
 *
 * **Measured before the fix.** «אורך הקטע AB = 10» built; «אורך הקטע AB הוא 10» — the same student
 * finishing the same sentence in ordinary Hebrew — was `not-handled`. The asymmetry got worse with
 * #1128, because the worded spellings that issue added are exactly the ones a copula finishes.
 *
 * ## What is actually under test, and why it is shaped like this
 *
 * The connective is an **allowlist of copulas**, never "anything that is not `=`". 2-D shipped the
 * denylist version of this widening and it produced a P1 (#1248, ADR-524 Am. 1): «אורך הקטע BC > 10»
 * — a stated RANGE — committed an EQUALITY at its own bound, invisible to the honesty gates because
 * the `10` *was* accounted for, by the wrong constraint. So the bound rows below are not decoration;
 * they are the regression, one tree over.
 *
 * Each claim is asserted as an **equality against the spelling that already worked**, never as a
 * spelled-out expectation ([ADR-W-053](../../docs/06w-decisions-workspace.md)) — twelve independent
 * expectations pass happily while two spellings quietly disagree.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';

/** The copulas the allowlist admits. Every one must mean exactly what `=` means. */
const COPULAS = ['הוא', 'היא', 'הם', 'הן', 'שווה', 'שווה ל-'];

/**
 * A comparable shape of the parse: the facts and the constraint kinds, with the student's own
 * source text dropped — that differs by construction between two spellings of one given.
 */
const shapeOf = (line: string) => {
  const r = parseLine(line) as {
    ok: boolean;
    code?: string;
    facts?: { t: string; k?: { t: string } }[];
  };
  if (!r.ok) return `REFUSED:${r.code}`;
  return (r.facts ?? []).map((f) => (f.k ? `${f.t}:${f.k.t}` : f.t)).join(' + ');
};

/** The figure itself, so a lock cannot pass on a parse that builds differently. */
const figureOf = (line: string) => {
  const d = derive(['A(0,0)', 'נקודה B', line]);
  return {
    faults: d.faults.map((f) => f.code),
    len:
      d.figure.points.length === 2
        ? Math.hypot(
            d.figure.points[0].x - d.figure.points[1].x,
            d.figure.points[0].y - d.figure.points[1].y,
          ).toFixed(4)
        : 'n/a',
  };
};

describe('#1260 — the copula means «=»', () => {
  it.each(COPULAS)('«אורך הקטע AB %s 10» parses as «אורך הקטע AB = 10»', (c) => {
    expect(shapeOf(`אורך הקטע AB ${c} 10`)).toBe(shapeOf('אורך הקטע AB = 10'));
  });

  it.each(COPULAS)('«אורך הקטע AB %s 10» BUILDS the same figure as the «=» form', (c) => {
    expect(figureOf(`אורך הקטע AB ${c} 10`)).toEqual(figureOf('אורך הקטע AB = 10'));
  });

  /**
   * #1128's own spelling table, finished with a copula. Read from that issue's test rather than
   * copied, so a spelling added there is covered here the day it lands instead of drifting.
   */
  const SPELLINGS = [
    'AB',
    'המרחק בין A ל-B',
    'המרחק בין A לבין B',
    'המרחק מ-A ל-B',
    'המרחק AB',
    'אורך AB',
    'אורך הקטע AB',
    'הקטע AB',
    'צלע AB',
  ];

  it.each(SPELLINGS)('«%s הוא 10» is the same given as «… = 10»', (s) => {
    expect(shapeOf(`${s} הוא 10`)).toBe(shapeOf(`${s} = 10`));
  });
});

/**
 * THE ROW THAT MATTERS — #1248's P1, asserted in this tree.
 *
 * A bound word is not a copula, so the sentence is not an equality. It must specifically NOT commit
 * `AB = 10`: a stated region silently becoming an equality at its own bound is ADR-390's cardinal
 * sin. Failing CLOSED (the line goes unread and escalates) is the honest outcome, and is what these
 * assert — not that the refusal is pretty.
 */
describe('#1260 — a BOUND is never an equality', () => {
  const BOUNDS = [
    'אורך AB גדול מ-10',
    'אורך AB > 10',
    'אורך AB לפחות 10',
    'אורך AB לכל היותר 10',
    'אורך AB קטן מ-10',
    'אורך AB פי 2 מ-CD',
  ];

  it.each(BOUNDS)('«%s» does not become a length equality', (line) => {
    expect(shapeOf(line)).not.toBe(shapeOf('אורך AB = 10'));
  });

  it.each(BOUNDS)('«%s» builds NO 10-unit segment', (line) => {
    expect(figureOf(line)).not.toEqual(figureOf('אורך AB = 10'));
  });
});

/**
 * THE NEIGHBOURS THE WIDER CONNECTIVE COULD HAVE EATEN.
 *
 * `LENGTH_EQ` runs early among the constraint rules, so admitting the copula widens what it can
 * claim from the rules below it. The issue measured that the obvious collision (the cevian) does
 * not fire; it is locked here rather than relied on, because #1128 has made more Hebrew nouns
 * readable as length terms and the next widening should fail loudly.
 */
describe('#1260 — the copula does not let the length rule swallow its neighbours', () => {
  it.each([
    ['AD הוא תיכון לצלע BC', 'constraint:midpoint'],
    ['M הוא אמצע AB', 'derived'],
    ['שיפוע AB הוא 2', 'constraint:slope'],
    ['הישר l1 הוא y=2x+1', 'curve'],
  ])('«%s» is still read by its own rule', (line, marker) => {
    expect(shapeOf(line)).toContain(marker);
  });

  /**
   * AN AREA GIVEN KEEPS ITS POLYGON DECLARATION.
   *
   * Both rules can read «שטח המשולש ABC הוא 24» — `parseLengthExpr` carries an `area` term — but only
   * the area rule also DECLARES the triangle the student named. Before #1260 the split was an
   * accident of spelling (the `=` form reached the length rule, the copula form could not), so
   * widening the connective without a precedence guard would have dropped «המשולש ABC» from the
   * figure: a stated object going unrecorded. Asserted as the declaration being present, which is
   * the thing that would be lost.
   */
  it('«שטח המשולש ABC הוא 24» still declares the polygon as well as the area', () => {
    expect(shapeOf('שטח המשולש ABC הוא 24')).toBe('polygon + constraint:area');
  });

  /**
   * And the guard yields only where the area rule will really claim the line. #1075's area-as-a-term
   * has no plain value, so it stays with the length rule — the capability the guard must not cost.
   */
  it('«שטח ABC = שטח CEF + 4» is still a length-expression equation (#1075)', () => {
    expect(shapeOf('שטח ABC = שטח CEF + 4')).toBe('constraint:length-eq');
  });
});
