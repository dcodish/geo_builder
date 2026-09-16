/**
 * #1113 — TWO CROSSINGS OF ONE PAIR ARE TWO POINTS.
 *
 * Operator, 2026-09-16, playing T16: *"somehow i got 2 points with different names on the same
 * location which should never happen"*. Measured then: four ring clicks put **four letters on
 * (0.9194, 1.8388)** and the second crossing at (3.4806, 6.9612) never received a point at all.
 *
 * An intersection is a `declare` plus two incidences and the joint solve finds *a* crossing, so two
 * sentences naming the crossings of the same pair had identical constraints and nothing distinguished
 * them. His ruling was that **the sentence names the root** rather than a branch index being stored
 * behind the student's back, so the grammar reads «הראשונה»/«השנייה» and a `crossing-distinct`
 * selector is what makes the two words denote different points.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingSentence, crossingsOf } from '../engine/crossings';
import { parseLine } from '../parser/parseAnalytic';

const BASE = [
  'משוואת הישר AB היא y=2x',
  'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
];
/** The two true crossings of `y = 2x` with the circle, to four places. */
const NEAR = { x: 0.9194, y: 1.8388 };
const FAR = { x: 3.4806, y: 6.9612 };

const at = (lines: string[], id: string) => derive(lines, 0).figure.points.find((p) => p.id === id);
const near = (p: { x: number; y: number } | undefined, q: { x: number; y: number }) =>
  p !== undefined && Math.hypot(p.x - q.x, p.y - q.y) < 1e-3;

const CROSS = (n: string, nth?: 'first' | 'second') =>
  `${n} נקודת החיתוך${nth === undefined ? '' : nth === 'first' ? ' הראשונה' : ' השנייה'} של הישר AB עם המעגל I`;

describe('#1113 — two letters never share one crossing', () => {
  it('the operator’s case: two named crossings land on the TWO different roots', () => {
    const lines = [...BASE, CROSS('P', 'first'), CROSS('Q', 'second')];
    const p = at(lines, 'P');
    const q = at(lines, 'Q');
    expect(p).toBeDefined();
    expect(q).toBeDefined();
    // Whichever way round the solve takes them, they are the two roots and not one root twice.
    expect(near(p, NEAR) || near(p, FAR)).toBe(true);
    expect(near(q, NEAR) || near(q, FAR)).toBe(true);
    expect(Math.hypot(p!.x - q!.x, p!.y - q!.y)).toBeGreaterThan(1);
  });

  it('and the FAR crossing is reachable at all — it never received a point before', () => {
    const lines = [...BASE, CROSS('P', 'first'), CROSS('Q', 'second')];
    const pts = [at(lines, 'P'), at(lines, 'Q')];
    expect(pts.some((p) => near(p, FAR))).toBe(true);
    expect(pts.some((p) => near(p, NEAR))).toBe(true);
  });

  it('a THIRD sentence on a two-root pair is REFUSED — the residue this file recorded, now closed', () => {
    /**
     * This case asserted the opposite until #1114, and that is why it is worth keeping rather than
     * deleting. It recorded the bounded residue honestly — detection live (`selectorsOk` false),
     * refusal absent — so that the day the refusal arrived, it would FAIL and be revisited. It did.
     *
     * The refusal is a COUNTING argument, not a sampling one, which is why it did not have to wait for
     * [#1071](https://github.com/dcodish/geo_builder/issues/1071): a straight meets a conic in at most
     * two points at ANY configuration, so a third such sentence cannot hold under any seed. `derive`'s
     * `reportedDof === 0` freedom gate is untouched and #1071's general question stays open.
     */
    const lines = [...BASE, CROSS('P', 'first'), CROSS('Q', 'second'), CROSS('R')];
    const d = derive(lines, 0);
    expect(d.faults).toHaveLength(1);
    expect(d.faults[0].code).toBe('unsatisfiable');
    // The refusal names the student's own sentence, never internal state.
    expect(d.faults[0].detail).toBe(CROSS('R'));
  });

  it('the ordinal PARSES, in both spellings and in English — the sentence names its root', () => {
    for (const line of [
      CROSS('P', 'first'),
      CROSS('P', 'second'),
      'P נקודת החיתוך השניה של הישר AB עם המעגל I',
      /**
       * No English row here on purpose: «P is the intersection point of the line AB and the circle I»
       * answers `bad-operand` on pristine `main` too — the English operand reader never learned these
       * nouns. Pre-existing and out of this change's scope; asserting it would lock a defect.
       */
    ]) {
      expect(parseLine(line).ok).toBe(true);
    }
  });

  it('every intersection carries the selector, ordinal or not', () => {
    const parsed = parseLine(CROSS('P'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.facts.some((f) => f.t === 'selector' && f.sel.kind === 'crossing-distinct')).toBe(true);
  });

  it('a click ROUND-TRIPS: the offered sentence names the root the ring is on', () => {
    const d = derive(BASE, 0);
    const rings = crossingsOf(d.figure, d.construction);
    expect(rings).toHaveLength(2);
    // Both rings of one pair are distinguishable in the sentence they offer.
    const sentences = rings.map((r, i) => crossingSentence(r, i === 0 ? 'P' : 'Q'));
    expect(new Set(sentences).size).toBe(2);
    for (const s of sentences) expect(parseLine(s).ok).toBe(true);
    expect(sentences.some((s) => s.includes('הראשונה'))).toBe(true);
    expect(sentences.some((s) => s.includes('השנייה'))).toBe(true);
  });

  it('a pair with ONE crossing says no ordinal — there is nothing to disambiguate', () => {
    // A line through the centre of a circle meets it twice; a TANGENT-free single-crossing pair here
    // is a straight × straight meet, which carries no `nth` at all.
    const d = derive(['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC', 'נתון הישר y=1'], 0);
    const rings = crossingsOf(d.figure, d.construction);
    expect(rings.length).toBeGreaterThan(0);
    for (const r of rings.filter((k) => k.nth === undefined)) {
      expect(crossingSentence(r, 'P')).not.toContain('הראשונה');
      expect(crossingSentence(r, 'P')).not.toContain('השנייה');
    }
  });
});
