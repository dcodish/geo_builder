/**
 * #1127 + #1134 — spellings the tool WRITES and would not READ.
 *
 * Bundled because they are one sentence about the grammar, not two features: in each case the product
 * itself produces a notation and then refuses it back, which teaches a student that their own correct
 * transcription is wrong.
 *
 * | spelling | who writes it | was |
 * | --- | --- | --- |
 * | `x_A = 5` | the data PANEL prints coordinates this way; 02c R31c calls it canonical | `not-handled` |
 * | «x של A הוא 5» | **this parser's own docblock**, which claimed the bare form was supported | `not-handled` |
 * | «קדקוד A(1,2)» | the exam, constantly — it is the Hebrew word for a vertex | `not-handled` |
 * | «מרחק של C מ-AB» | **the operator**, in his own T15 report | `unreadable` |
 *
 * ## The «של» order is a word order, not a wider operand
 *
 * «המרחק מ-A לישר l1» names the point after `מ-` and the line after `ל-`. The operator wrote «מרחק של C
 * מ-AB», which inverts which preposition introduces which operand. Deliberately NOT the widening #1115
 * was disarmed over: no `=`, digits or operators enter the operand, so the «AB + 2·CD» ambiguity cannot
 * arise.
 *
 * It also unblocks [#1111](https://github.com/dcodish/geo_builder/issues/1111): that issue built a
 * named missing-object answer FOR THIS SENTENCE, and it could never fire, because the sentence never
 * parsed. Both halves are asserted together below.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';

const parses = (l: string) => parseLine(l).ok;
const coord = (lines: string[], id: string) => derive(lines, 0).figure.points.find((p) => p.id === id);

describe('#1127 — the subscripted component, which the panel itself prints', () => {
  it('«x_A = 5» is read, and means what it says', () => {
    const a = coord(['x_A = 5'], 'A');
    expect(a).toBeDefined();
    expect(a!.x).toBeCloseTo(5, 9);
  });

  it('the y form too, and the braced spelling', () => {
    // 6 decimals, not 9: the other component is FREE here, so the solve lands on a sampled y and the
    // pinned coordinate carries ordinary solver residue.
    expect(coord(['y_A = 3'], 'A')!.y).toBeCloseTo(3, 6);
    expect(coord(['x_{A} = 7'], 'A')!.x).toBeCloseTo(7, 6);
  });

  it('it agrees with the NOUN spelling of the same statement', () => {
    /**
     * Measured correction to this issue's framing, worth keeping: «xA = 5» is NOT the component form and
     * never was. It parses as a CURVE — the equation `x·A = 5` — so comparing against it would have
     * compared two unrelated things. The real equivalence is the noun form, which has always worked.
     */
    expect(coord(['x_A = 5'], 'A')!.x).toBeCloseTo(coord(['שיעור ה-x של A הוא 5'], 'A')!.x, 6);
  });

  it('only ONE component is stated, so the other stays free', () => {
    /**
     * The property that makes this a component and not a coordinate pair. A rule that pinned both would
     * be inventing a given — ADR-052's cardinal sin.
     */
    const d = derive(['x_A = 5'], 0);
    const e = derive(['x_A = 5'], 7);
    expect(d.figure.points[0].x).toBeCloseTo(5, 9);
    expect(e.figure.points[0].x).toBeCloseTo(5, 9);
    expect(d.figure.points[0].y).not.toBeCloseTo(e.figure.points[0].y, 6);
  });
});

describe('#1127 — the bare «x של A» form this file’s own docblock claimed', () => {
  it('is read now — it was not, despite the comment saying so', () => {
    expect(coord(['x של A הוא 5'], 'A')!.x).toBeCloseTo(5, 9);
  });

  it('the noun forms still work — the noun became optional, not forbidden', () => {
    expect(coord(['שיעור ה-x של A הוא 5'], 'A')!.x).toBeCloseTo(5, 9);
    expect(coord(['the x-coordinate of A is 5'], 'A')!.x).toBeCloseTo(5, 9);
  });
});

describe('#1127 — «קדקוד», the exam’s own noun for a vertex', () => {
  it('is admitted wherever a point noun is', () => {
    expect(parses('קדקוד A(1,2)')).toBe(true);
    expect(parses('קדקוד A נמצא על ציר ה-x')).toBe(true);
  });

  it('and means exactly what «הנקודה» means', () => {
    expect(coord(['קדקוד A(1,2)'], 'A')!.x).toBeCloseTo(coord(['הנקודה A(1,2)'], 'A')!.x, 9);
  });

  it('spelled ONCE in the shared token, not inline — asserted by breadth', () => {
    /**
     * The tree's stated rule is that a noun gate re-spelled inline drifts, and it has paid for that
     * three times. If `קדקוד` had been added at one call site, one of these would fail.
     */
    for (const l of ['קדקוד A(1,2)', 'קדקוד A נמצא על ציר ה-x']) expect(parses(l), l).toBe(true);
  });
});

describe('#1134 — the «של» word order in a distance question', () => {
  const FIG = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC', 'נתון הישר l1: y=2'];
  const answer = (q: string) => ask(derive(FIG, 0), q, (v) => String(v));

  it('the operator’s own wording answers, and agrees with the canonical spelling', () => {
    const his = answer('מרחק של A מ-l1');
    const canonical = answer('המרחק מ-A לישר l1');
    expect(his.unreadable).toBeFalsy();
    expect(his.value).toBe(canonical.value);
  });

  it('with the noun, and on a segment named by two points', () => {
    expect(answer('מרחק של A מהישר l1').value).toBe('2');
    // C(3,5) to the x-axis through A and B.
    expect(answer('מרחק של C מ-AB').value).toBe('5');
  });

  it('the canonical order is untouched', () => {
    expect(answer('המרחק מ-A לישר l1').value).toBe('2');
  });

  it('it unblocks #1111’s named answer, which could never fire on this sentence', () => {
    /**
     * #1111 built «אין בשרטוט נקודה בשם D» for exactly this wording and it was unreachable, because the
     * sentence did not parse. Asserted here as well as in that issue's own lock, because neither half is
     * worth anything alone.
     */
    const a = answer('מרחק של D מ-AB');
    expect(a.unreadable).toBeFalsy();
    expect(a.missing).toEqual({ name: 'D', kind: 'point' });
  });
});
