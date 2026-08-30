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

import { isKnowledge, whyNotKnowledge } from '../../model/knowledge';
import { deriveLines } from '../../app/deriveLines';
import { parseLineV2 } from '../../parser/rules';

describe('the predicate itself', () => {
  it('an exactly carried value is knowledge however much else is free', () => {
    expect(isKnowledge(true, { remainingDof: 3, enumeratedConfigCount: 7 })).toBe(true);
  });

  it('a closed figure with one configuration is knowledge', () => {
    expect(isKnowledge(false, { remainingDof: 0, enumeratedConfigCount: 1 })).toBe(true);
  });

  it.each([
    [{ remainingDof: 1, enumeratedConfigCount: 1 }],
    [{ remainingDof: 0, enumeratedConfigCount: 2 }],
    [{ remainingDof: 2, enumeratedConfigCount: 3 }],
  ])('%o is NOT knowledge', (closure) => {
    expect(isKnowledge(false, closure)).toBe(false);
    expect(whyNotKnowledge(closure).code).toBeTruthy();
  });

  /** The reason has to describe the student's situation, so it can tell them what to do next. */
  it('names remaining freedom and multiple configurations differently', () => {
    expect(whyNotKnowledge({ remainingDof: 1, enumeratedConfigCount: 1 })).toEqual({ code: 'free-dof-remain' });
    expect(whyNotKnowledge({ remainingDof: 0, enumeratedConfigCount: 4 })).toEqual({ code: 'multi-config', configs: 4 });
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

  it('a driving measure closes the figure, and the panel then answers', () => {
    const open = deriveLines(['z1 = 4', 'z2', '|z2| = 3', 'שטח Oz1z2']);
    expect(open.knowledge[0].value).toBeNull();

    const closed = deriveLines(['z1 = 4', 'z2', '|z2| = 3', 'שטח Oz1z2 = 6', 'היקף Oz1z2']);
    expect(closed.measures[0].status).toBe('holds');
    expect(closed.knowledge[0].value).not.toBeNull();
  });
});
