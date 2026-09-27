/**
 * THE KNOWLEDGE PANEL — a number prints only when the givens force it.
 *
 * The operator's S6 ruling: values print *only on request, and only when they are knowledge*. The
 * tests that matter here are the WITHHOLDING ones. Printing a correct number is easy; the defect this
 * design exists to prevent is printing the current sample as though it were the answer, which is what
 * an inference from sampling variance does the moment there is only one sample
 * ([ADR-421](../../docs/06-decisions.md#adr-421), a P1).
 */
import { describe, expect, it } from 'vitest';

import { type FigureClosure, knowledgeOf, whyNotKnowledge } from '../../model/knowledge';
import { deriveLines } from '../../app/deriveLines';
import { parseLineV2 } from '../../parser/rules';

const re = (x: number) => ({ re: x, im: 0 });
const closed = (configCount: number, completeness: FigureClosure['completeness'] = 'complete'): FigureClosure => ({
  remainingDof: 0,
  configCount,
  completeness,
});

/**
 * The predicate is asked with the value IN EVERY CONFIGURATION (#1427, ADR-CX-049). It used to be
 * asked with a count — "exactly one configuration" — which printed a value that differs between two
 * roots whenever the numeric tier had found only one of them, and withheld one they share.
 */
describe('the predicate itself', () => {
  it('an exactly carried value is knowledge however much else is free', () => {
    expect(knowledgeOf(true, { remainingDof: 3, configCount: 7, completeness: 'floor' }, []).known).toBe(true);
  });

  it('a closed figure with one configuration is knowledge', () => {
    expect(knowledgeOf(false, closed(1), [re(5)]).known).toBe(true);
  });

  it('a value the SAME in every configuration of a complete set is knowledge — however many there are', () => {
    expect(knowledgeOf(false, closed(3), [re(2), re(2), re(2 + 1e-12)]).known).toBe(true);
  });

  it('a value that differs across a COMPLETE set is withheld as «differs between N configurations»', () => {
    expect(knowledgeOf(false, closed(2), [re(3), re(-3)])).toEqual({
      known: false,
      why: { code: 'multi-config', configs: 2 },
    });
  });

  it('a FLOOR is never read as invariant — agreeing or not, it withholds as «may have more than one possibility»', () => {
    expect(knowledgeOf(false, closed(1, 'floor'), [re(2)])).toEqual({ known: false, why: { code: 'maybe-multi' } });
    expect(knowledgeOf(false, closed(2, 'floor'), [re(-0.73), re(2.73)])).toEqual({
      known: false,
      why: { code: 'maybe-multi' },
    });
  });

  it('remaining freedom outranks the configuration question', () => {
    expect(knowledgeOf(false, { remainingDof: 1, configCount: 1, completeness: 'complete' }, [re(1)])).toEqual({
      known: false,
      why: { code: 'free-dof-remain' },
    });
  });

  it('a value that cannot be evaluated in some configuration is not knowledge', () => {
    expect(knowledgeOf(false, closed(2), [re(1), null])).toEqual({ known: false, why: { code: 'undetermined' } });
    expect(knowledgeOf(false, closed(0), [])).toEqual({ known: false, why: { code: 'undetermined' } });
  });

  /** The reason has to describe the student's situation, so it can tell them what to do next. */
  it('without a value in hand, names remaining freedom and "undetermined" differently', () => {
    expect(whyNotKnowledge({ remainingDof: 1, configCount: 1, completeness: 'complete' })).toEqual({ code: 'free-dof-remain' });
    expect(whyNotKnowledge(closed(4))).toEqual({ code: 'undetermined' });
  });
});

describe('a measure with no value is a QUESTION, not a statement', () => {
  it('parses as a query and states nothing', () => {
    const r = parseLineV2('שטח Oz1z2z3');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.line.queries).toHaveLength(1);
      expect(r.line.measures).toEqual([]);
      expect(r.line.constraints).toEqual([]);
    }
  });

  /** The equating word is what separates the two, which is why it is required rather than optional. */
  it('the same words WITH a value are a statement instead', () => {
    const r = parseLineV2('שטח Oz1z2z3 = 6');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.line.measures).toHaveLength(1);
      expect(r.line.queries).toEqual([]);
    }
  });
});

describe('answers are given only when the figure forces them', () => {
  it('prints the area of a fully determined figure', () => {
    const d = deriveLines(['z1 = 4', 'z2 = 4i', 'שטח Oz1z2']);
    expect(d.knowledge).toHaveLength(1);
    expect(d.knowledge[0].value).toBe('8');
  });

  /**
   * The load-bearing case. z2 is free, so the area is whatever this drawing happens to show — and the
   * panel must say so rather than print it.
   */
  it('WITHHOLDS the area while a degree of freedom remains, and says why', () => {
    const d = deriveLines(['z1 = 4', 'z2', 'שטח Oz1z2']);
    expect(d.knowledge[0].value).toBeNull();
    expect(d.knowledge[0].why).toEqual({ code: 'free-dof-remain' });
  });

  /** Invariance is across EVERY valid configuration, not the one on screen. */
  it('WITHHOLDS a value that differs between configurations', () => {
    // `z` is declared first so the equation CONSTRAINS it — three configurations, and the distance to
    // w differs between them. (Without the declaration «z^3 = 8» enumerates and `z1` would be one of
    // its own solutions, so `z1 = 4` would contradict it — ADR-CX-021.)
    const d = deriveLines(['z', 'z^3 = 8', 'w = 4', 'אורך wz']);
    expect(d.knowledge[0].value).toBeNull();
    expect(d.knowledge[0].why?.code).toBe('multi-config');
  });

  /**
   * #1427 (ADR-CX-049, operator ruling 2026-09-27) — this lock used to assert the perimeter PRINTS.
   * The area given leaves z₂ at 90° or 270°: two drawings. The perimeter is 12 in both — but the
   * numeric census that found them is a multi-start FLOOR (an area is not a polynomial in z₂), so
   * nothing proves there is no third, and the ruled doctrine withholds it with the softer sentence.
   * What still holds: the measure drives, the figure is closed (no «free DOF» reason), and both
   * drawings are reachable through "show another configuration".
   */
  it('a driving measure closes the figure; over a census FLOOR the panel says «may have more than one possibility»', () => {
    const open = deriveLines(['z1 = 4', 'z2', '|z2| = 3', 'שטח Oz1z2']);
    expect(open.knowledge[0].value).toBeNull();

    const lines = ['z1 = 4', 'z2', '|z2| = 3', 'שטח Oz1z2 = 6', 'היקף Oz1z2'];
    const closedFig = deriveLines(lines);
    expect(closedFig.measures[0].status).toBe('holds');
    expect(closedFig.knowledge[0]).toEqual({ label: 'היקף Oz1z2', value: null, why: { code: 'maybe-multi' } });
    expect(closedFig.configCompleteness).toBe('floor');
    expect(closedFig.canCycle).toBe(true);
    const ims = [0, 1].map((s) => Math.sign(deriveLines(lines, s, s).points.find((p) => p.name === 'z2')!.z.im));
    expect(new Set(ims)).toEqual(new Set([1, -1]));
  });
});
