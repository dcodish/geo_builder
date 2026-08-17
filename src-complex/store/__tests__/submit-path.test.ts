/**
 * THE SUBMIT PATH, driven the way the app drives it.
 *
 * #658's own diagnosis of why the S6 claim work shipped broken: *"The S6 claim tests call
 * `deriveLines` directly and never cross the store."* That is the defect #535 cost the 3-D tree —
 * **a solver that works when called and never gets called** — so these tests deliberately go through
 * the one entry point the input box uses, and assert on what the app would then render. A test that
 * calls the engine cannot catch a pipeline that stops calling it.
 *
 * That entry point is now `app/submit.ts`'s `submitLine` for v2 and the store's own `addLine` for the
 * retiring prototype (ADR-CX-023): the acceptance gate needs the fold, and the fold is a layer the
 * store may not reach. `reset(engine)` states which engine every block means, because an ambient
 * default is how #686 let a missing v2 capability look green.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useComplexStore } from '../useComplexStore';
import { deriveLines } from '../../app/deriveLines';
import { hydrateSession, submitLine } from '../../app/submit';
import { parseLine } from '../../parser/parse';

const store = () => useComplexStore.getState();

const reset = (engine: 'proto' | 'v2'): void => {
  store().clearAll();
  store().setEngine(engine);
};

describe('the v2 submit path owns the line list (#658)', () => {
  beforeEach(() => reset('v2'));

  /**
   * The operator's exact prod report. It is here as a store test and not a parser test on purpose:
   * the grammar always read this line correctly, and the app still refused it.
   */
  it('accepts «z1 מדומה טהור» — the line the prototype gatekept', () => {
    expect(parseLine('z1 מדומה טהור').ok).toBe(false); // the prototype still cannot read it
    expect(submitLine('z1 מדומה טהור')).toBe(true);
    expect(store().lines).toEqual(['z1 מדומה טהור']);
    expect(store().lastError).toBeNull();
  });

  it.each([
    ['z1 מדומה טהור', 'imaginary'],
    ['z1 ממשי', 'real'],
    ['z1 ו-z2 צמודים זה לזה', 'conjugates'],
  ])('«%s» reaches the engine as a %s claim', (line, kind) => {
    expect(submitLine(line)).toBe(true);
    const d = deriveLines(store().lines);
    expect(d.claims.map((c) => c.claim.kind)).toContain(kind);
    // and nothing about it is reported as unreadable — the row must not be red
    expect(d.untranslated).toEqual([]);
  });

  it('a claim the givens decide is verified end to end through the store', () => {
    ['z1 = 2cis30', 'z2 = 2cis(-30)', 'z1 ו-z2 צמודים זה לזה'].forEach((l) =>
      expect(submitLine(l)).toBe(true),
    );
    const d = deriveLines(store().lines);
    expect(d.claims).toHaveLength(1);
    expect(d.claims[0].verdict.status).toBe('holds');
  });

  it('refuses a line no rule recognises, and does not record it', () => {
    expect(submitLine('בלה בלה בלה')).toBe(false);
    expect(store().lines).toEqual([]);
    expect(store().lastError?.key).toBe('not-handled');
  });

  /** The accountant's refusal must reach the student in their own words, not as a generic error. */
  it('refuses a partly-understood line naming what it could not account for', () => {
    expect(submitLine('z1 ברביע הראשון ומקבילית')).toBe(false);
    expect(store().lines).toEqual([]);
    expect(store().lastError?.key).toBe('unaccounted');
    expect(store().lastError?.detail).toContain('ומקבילית');
  });

  it('deletes by position — the v2 row owns no fact id', () => {
    // «arg z1 = 45» is deliberately NOT here: z1 = 3+4i already fixes the argument at 53.13°, and the
    // acceptance gate (ADR-CX-023) now refuses the contradiction the original data typed by accident.
    ['z1 = 3+4i', 'z1 ממשי', 'z2 = 1+i'].forEach((l) => submitLine(l));
    store().removeLine(1);
    expect(store().lines).toEqual(['z1 = 3+4i', 'z2 = 1+i']);
  });

  /**
   * The reload path. A v2 session rehydrated through the prototype's yes/no would silently lose every
   * v2-only line, which is #658 returning by the back door — so the round-trip is asserted, not assumed.
   */
  it('saves and reloads a session made of v2-only lines', () => {
    ['z1 = 3+4i', 'z1 ו-z2 צמודים זה לזה'].forEach((l) => submitLine(l));
    const saved = store().serialize();
    expect(saved.lines).toHaveLength(2);

    store().clearAll();
    expect(hydrateSession(saved)).toBe(true);
    expect(store().lines).toEqual(['z1 = 3+4i', 'z1 ו-z2 צמודים זה לזה']);
  });
});

describe('the prototype path keeps its own semantics', () => {
  beforeEach(() => reset('proto'));

  it('records the accepted line alongside the facts it lowered to', () => {
    // a MIXED polar declaration lowers to two facts — free z1, and the modulus it stated
    expect(store().addLine('z1 = 2cis(theta)')).toBe(true);
    expect(store().lines).toEqual(['z1 = 2cis(theta)']);
    expect(store().facts.length).toBeGreaterThan(1); // one utterance, several facts
  });

  it('still refuses what the prototype grammar cannot read', () => {
    expect(store().addLine('z1 מדומה טהור')).toBe(false);
    expect(store().lines).toEqual([]);
  });

  /** A removed fact must take its line with it, or the next save would resurrect the statement. */
  it('removing a fact removes the line that produced it', () => {
    store().addLine('z1 = 3+4i');
    store().addLine('z2 = 1+i');
    const target = store().facts.find((f) => f.src === 'z2 = 1+i');
    store().removeFact(target!.id);
    expect(store().lines).toEqual(['z1 = 3+4i']);
    expect(store().serialize().lines).toEqual(['z1 = 3+4i']);
  });
});
