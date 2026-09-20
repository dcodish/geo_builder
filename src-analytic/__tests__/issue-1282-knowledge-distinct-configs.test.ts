/**
 * #1282 (P1) — THE KNOWLEDGE GATE SAMPLED THREE SEEDS, NOT THREE CONFIGURATIONS.
 *
 * Operator, 2026-09-20, transcribing מבחן 17 עמ' 561 תרגיל 1: *"M location shows different before and
 * after which is for sure wrong. if it is unknown before the last statement, it shouldn't have said
 * anything."*
 *
 * On a figure the tool itself reports as having **1 degree of freedom**, `isKnowledge` returned
 * `known: true` for every coordinate, slope and length in the panel — so the data panel printed «1 דרגות
 * חופש» directly above numbers it was asserting as determined, and none of those numbers was the answer.
 * A student doing part א off the before-figure computes the angle of a trapezoid that is not theirs.
 *
 * **The cause is a sampling collapse, not a formatting choice.** `isKnowledge` read the value at
 * `drawableAt(c, 0)`, `(c, 1)` and `(c, 2)`. `drawableAt` repairs a seed whose figure is not whole by
 * walking FORWARD to the next whole one — and on this figure only 4 of 24 seeds are whole, with seeds
 * 0–8 all walking forward to seed 8. Three "independent" samples were one sample, and zero spread read
 * as certainty.
 *
 * This is [#1084](https://github.com/dcodish/geo_builder/issues/1084)'s collapse arriving at its SECOND
 * consumer. That issue fixed «הציגו תצורה אחרת» by searching for a differing SIGNATURE and said so in
 * `another.ts`'s header; the knowledge gate was never given the same correction. The fix states the
 * signature once, in the engine, and both call it (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawableAt, distinctConfigSeeds, figureSignature, isKnowledge } from '../engine/evaluate';
import { reportedDof } from '../engine/carriers';
import { anotherConfiguration } from '../app/another';

/** The operator's own figure, one given short of the exam's full question. */
const BEFORE = [
  'טרפז ABCD',
  'AB מקביל ל CD',
  'A(5,8)',
  'B(9,6)',
  'M מפגש האלכסונים במרובע ABCD',
  'AC',
  'BD',
  'MB:MD=1:4',
  'שיעור ה- x של נקודה M הוא 7',
  'נתונה הנקודה P(-3,7)',
];
/** …and with it: the freedom collapses and the true values appear. */
const AFTER = [...BEFORE, 'P על הישר CD'];

const con = (lines: string[]) => derive(lines, 0).construction;
const at = (id: string, k: 'x' | 'y') => (f: { points: { id: string; x: number; y: number }[] }) =>
  f.points.find((p) => p.id === id)?.[k] ?? null;

describe('#1282 — a value on a figure with freedom is NOT reported as known', () => {
  it('the collapse this fix survives is real — three consecutive seeds are ONE configuration', () => {
    // The PRECONDITION, asserted so the lock below cannot go vacuous: if a future change happens to
    // spread these seeds, the rows beneath would pass without testing what they were written for.
    const c = con(BEFORE);
    const sigs = [0, 1, 2].map((s) => figureSignature(drawableAt(c, s)));
    expect(new Set(sigs).size, 'seeds 0,1,2 all walk forward to one figure').toBe(1);
  });

  it('and the figure really does have a free degree of freedom', () => {
    const d = derive(BEFORE, 0);
    expect(reportedDof(d.construction, d.figure.carrierDof)).toBeGreaterThan(0);
  });

  it('so the coordinates the student never determined read UNKNOWN', () => {
    const c = con(BEFORE);
    expect(isKnowledge(c, at('C', 'y'))).toEqual({ known: false });
    expect(isKnowledge(c, at('D', 'y'))).toEqual({ known: false });
    expect(isKnowledge(c, at('M', 'y'))).toEqual({ known: false });
  });

  it('while the coordinate he DID give still reads known — this is not "mark everything unknown"', () => {
    const k = isKnowledge(con(BEFORE), at('M', 'x'));
    expect(k.known).toBe(true);
    expect(k.known && k.value).toBeCloseTo(7, 6);
  });

  it('the sampled seeds are distinct CONFIGURATIONS, and more than one of them', () => {
    const seeds = distinctConfigSeeds(con(BEFORE));
    expect(seeds.length).toBeGreaterThan(1);
    const sigs = seeds.map((s) => figureSignature(drawableAt(con(BEFORE), s)));
    expect(new Set(sigs).size, 'every sampled seed is a different picture').toBe(sigs.length);
  });

  it('THE INVARIANT: freedom in the panel means something in the panel is unknown', () => {
    // The state the tool should not be able to be in — «1 דרגות חופש» printed above a panel of
    // certainties. Asserted on the figure that violated it.
    const d = derive(BEFORE, 0);
    const c = d.construction;
    expect(reportedDof(c, d.figure.carrierDof)).toBeGreaterThan(0);
    const quantities = ['C', 'D', 'M'].flatMap((id) => [at(id, 'x'), at(id, 'y')]);
    expect(
      quantities.some((read) => !isKnowledge(c, read).known),
      'a figure with freedom must report at least one quantity unknown',
    ).toBe(true);
  });
});

describe('#1282 — the last given still collapses the freedom, and then the values ARE known', () => {
  it('with «P על הישר CD» the answers are determined and reported', () => {
    const c = con(AFTER);
    const cy = isKnowledge(c, at('C', 'y'));
    const my = isKnowledge(c, at('M', 'y'));
    expect(cy.known, 'C.y is determined once the last given is in').toBe(true);
    expect(cy.known && cy.value).toBeCloseTo(-2, 4);
    expect(my.known && my.value).toBeCloseTo(6, 4);
  });

  it('and the before-figure never showed those answers — the defect, stated as the student sees it', () => {
    const before = drawableAt(con(BEFORE), 0);
    expect(at('C', 'y')(before), 'the value the panel asserted').not.toBeCloseTo(-2, 2);
  });
});

describe('#1282 — one definition of "a different configuration", called by both consumers', () => {
  it('«הציגו תצורה אחרת» still finds a differing figure on the same construction', () => {
    const r = anotherConfiguration(BEFORE, 0);
    expect(r.found, 'the button #1084 fixed still works through the shared signature').toBe(true);
    expect(figureSignature(drawableAt(con(BEFORE), r.seed))).not.toBe(
      figureSignature(drawableAt(con(BEFORE), 0)),
    );
  });

  it('a DETERMINED figure has one configuration, and its values stay known', () => {
    // The other direction, and the one that must not regress: nothing here is free, so the single
    // configuration is the answer and the gate must still say so.
    const lines = ['A(0,0)', 'B(4,0)', 'C(4,3)', 'משולש ABC'];
    const c = con(lines);
    expect(distinctConfigSeeds(c)).toHaveLength(1);
    const k = isKnowledge(c, at('C', 'y'));
    expect(k.known).toBe(true);
    expect(k.known && k.value).toBeCloseTo(3, 6);
    expect(anotherConfiguration(lines, 0).found, 'and the button honestly says there is no other').toBe(false);
  });
});
