/**
 * THE POLYGON-NOUN VALIDITY SEAM — the configuration drawn must honour the noun that declared it.
 * (#1158 simplicity · #1166 non-degeneracy)
 *
 * Two operator reports, one sentence. «טרפז ABCD» was drawn as a crossed butterfly at 16 of 24
 * configurations and «משולש ABC» as a straight line at 13 of 24, with `faults = []` at every one of
 * them — the tool believing a figure that contradicted its own noun.
 *
 * ## How this file is written, and why
 *
 * It **calls** `ringViolation` / `drawableAt` rather than re-deciding what a valid ring is. A test
 * that re-implements the decision it guards stays green through the change that kills the feature
 * (#1102/#1118), and here the temptation is sharp: "is this quad crossed" is four lines of geometry
 * anyone would happily inline.
 *
 * The exception is the DISTINCTNESS measure at the bottom, which is deliberately an independent
 * instrument: it is not the decision under test, it is the yardstick #1166's own comment used to
 * establish the pre-fix baseline, and re-deriving it here is what keeps it independent of anything
 * `src-analytic` believes. (It cannot be imported either way — 2-D's `shapeFingerprint` lives in
 * `src/`, which this tree may not import.)
 *
 * The registry sweep iterates `SHAPES` rather than listing nouns, so a noun added later — «דלתון»
 * was the operator's own example — inherits this lock without anyone remembering to extend it.
 */
import { describe, expect, it } from 'vitest';
import { anotherConfiguration } from '../app/another';
import { derive } from '../engine/derive';
import { drawableAt } from '../engine/evaluate';
import { ringViolation, type RingPt } from '../engine/rings';
import { SHAPES } from '../engine/shapes';

const SEEDS = 24;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** The ring as DRAWN, read off the figure `derive` actually produced. */
function drawnRing(lines: string[], seed: number, verts: string[]): RingPt[] | null {
  const d = derive(lines, seed);
  const pts = verts.map((v) => d.figure.points.find((p) => p.id === v));
  if (pts.some((p) => !p)) return null;
  return pts.map((p) => ({ x: p!.x, y: p!.y }));
}

describe('#1158/#1166 — a declared polygon is drawn as the ring its noun promises', () => {
  /**
   * THE CLASS, not the two reported nouns. Every row of the registry, at every seed of the search.
   *
   * «מרובע» is the load-bearing row: it lowers to NO constraint at all and still crossed 11 times in
   * 24 before the fix, which is the proof that this was about the ring and never about the parallel
   * relation.
   */
  for (const [noun, row] of Object.entries(SHAPES)) {
    const verts = LETTERS.slice(0, row.arity);
    it(`«${noun} ${verts.join('')}» honours its noun at every configuration`, () => {
      const bad: Array<{ seed: number; violation: string }> = [];
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const ring = drawnRing([`${noun} ${verts.join('')}`], seed, verts);
        expect(ring, `no ring drawn at seed ${seed}`).not.toBeNull();
        const violation = ringViolation(ring!);
        if (violation) bad.push({ seed, violation });
      }
      expect(bad).toEqual([]);
    });
  }

  /**
   * #1158's EXACT reported sequence, pinned to seed 1 — the very first press of
   * «הציגו תצורה אחרת», and the configuration in his screenshot.
   */
  it('#1158: «טרפז ABCD» + A(5,8) + B(9,6) is simple at seed 1 (the screenshot)', () => {
    const lines = ['טרפז ABCD', 'A(5,8)', 'B(9,6)'];
    const ring = drawnRing(lines, 1, ['A', 'B', 'C', 'D']);
    expect(ring).not.toBeNull();
    expect(ringViolation(ring!)).toBeNull();
  });

  it('#1158: his figure is simple at every one of the first 24 configurations', () => {
    const lines = ['טרפז ABCD', 'A(5,8)', 'B(9,6)'];
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const ring = drawnRing(lines, seed, ['A', 'B', 'C', 'D']);
      expect(ringViolation(ring!), `crossed at seed ${seed}`).toBeNull();
    }
  });

  /**
   * #1166's EXACT reported sequence. The intersection fact is the trigger — two medians alone gave
   * 0/24 flat, and adding `P = AD ∩ CE` took it to 13/24, because "P lies on AD and on CE" has
   * residual zero for ANY P once the two lines coincide. That is a wide zero-residual basin the
   * solver is attracted to, not an unlucky sample.
   */
  it('#1166: the operator’s five-line figure is never drawn collapsed', () => {
    const lines = [
      'משולש ABC',
      'A(2,-5)',
      'AD תיכון לצלע BC',
      'CE תיכון לצלע AB',
      'P נקודת החיתוך של הישר AD עם הישר CE',
    ];
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const ring = drawnRing(lines, seed, ['A', 'B', 'C']);
      expect(ring, `no triangle at seed ${seed}`).not.toBeNull();
      expect(ringViolation(ring!), `collapsed at seed ${seed}`).toBeNull();
    }
  });

  /**
   * The CHEAPEST reproduction, and the one most likely to regress — asking for the intersection of
   * two lines that already meet. It was the worst figure measured (17/24 exactly flat).
   */
  it('#1166: the «AB ∩ BC» control — intersecting two lines that already meet', () => {
    const lines = ['משולש ABC', 'A(2,-5)', 'P נקודת החיתוך של הישר AB עם הישר BC'];
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const ring = drawnRing(lines, seed, ['A', 'B', 'C']);
      expect(ringViolation(ring!), `collapsed at seed ${seed}`).toBeNull();
    }
  });

  /**
   * SIMPLICITY, NOT CONVEXITY — the counter-direction guard, and an explicit escalation trigger on
   * #1158.
   *
   * A concave quadrilateral is a legitimate «מרובע» and the exam draws them. A predicate that drifts
   * to convexity would assert a given the question never gave, which is ADR-052's cardinal sin
   * arriving from the other side — the opposite defect, not a stricter version of the same one.
   */
  it('a CONCAVE quadrilateral stays valid — the predicate is simplicity, not convexity', () => {
    // An arrowhead: the ring is simple, and the corner at C turns back on itself (reflex).
    // NOTE the fixture this replaced put the fourth vertex ON the diagonal of the other three, which
    // the predicate correctly called `degenerate` — a reflex corner and a straight one are different
    // things, and only the straight one makes the quadrilateral a triangle.
    const concave: RingPt[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 4 },
    ];
    expect(ringViolation(concave)).toBeNull();
  });

  /**
   * A thin triangle is UGLY but TRUE. #1166 ruled exact degeneracy invalid and near-degeneracy a
   * seed preference; a tolerance that crept up into the "merely narrow" band would start refusing
   * figures whose givens genuinely force a tight wedge.
   */
  it('a THIN triangle stays valid — only collapse is rejected, not narrowness', () => {
    const thinDeg = 1; // one degree — well inside what a figure may legitimately be forced into
    const rad = (thinDeg * Math.PI) / 180;
    const thin: RingPt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10 * Math.cos(rad), y: 10 * Math.sin(rad) },
    ];
    expect(ringViolation(thin)).toBeNull();
  });

  /** The predicate's own two verdicts, on rings that are unambiguously each. */
  it('names WHICH promise is broken', () => {
    const crossed: RingPt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    expect(ringViolation(crossed)).toBe('crossed');

    const collinear: RingPt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(ringViolation(collinear)).toBe('degenerate');

    // A collapsed ring is reported as collapsed even though its "sides" also overlap — naming it
    // crossed would describe the wrong thing to the student.
    const collapsedQuad: RingPt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(ringViolation(collapsedQuad)).toBe('degenerate');
  });

  /**
   * THE BOUNDARY OF THIS FIX — a ring the student PINNED is a different question (#1170).
   *
   * The plan's second arm would have reported these. It was built and measured, and every figure it
   * fired on turned out to be fully determined: the student gave the coordinates, and the
   * coordinates are what make the ring bad. That is #1166's own *"out of scope here"* residual, and
   * it collides with three `derived.test.ts` locks encoding ADR-AG-008's answer, so it was withdrawn
   * to #1170 rather than gated on a judgement this round is not entitled to make.
   *
   * **#1170 IS NOW RULED, and these two changed with it** (operator, 2026-09-17: *refuse the line*;
   * ADR-AG-129). They asserted the CURRENT answer rather than the desired one precisely so that this
   * moment would be deliberate and visible here instead of drifting, which is what happened: the
   * `ringFaults` half is untouched — the seam has seen these since #1158/#1166 — and only the
   * `faults` line moves, from silence to the refusal.
   *
   * They stay in this file rather than moving to #1170's own, because what they lock is still this
   * fix's boundary: the configuration search may not CHOOSE a bad ring, and a ring the student
   * pinned was never the search’s to choose.
   */
  it('#1170 boundary: a pinned crossed quad is still drawn, and the seam can see it', () => {
    const lines = ['מרובע ABCD', 'A(0,0)', 'B(1,0)', 'C(0,1)', 'D(1,1)'];
    const d = derive(lines, 0);
    expect(d.figure.ringFaults).toEqual([
      { id: 'poly-ABCD', noun: 'מרובע', violation: 'crossed' },
    ]);
    // #1170/ADR-AG-129: refused, on the line that named the shape.
    expect(d.faults).toEqual([{ index: 0, code: 'ring-contradicts-noun', detail: 'מרובע ABCD' }]);
  });

  it('#1170 boundary: a pinned collinear triangle, likewise', () => {
    const lines = ['משולש ABC', 'A(0,0)', 'B(1,0)', 'C(2,0)'];
    const d = derive(lines, 0);
    expect(d.figure.ringFaults).toEqual([
      { id: 'poly-ABC', noun: 'משולש', violation: 'degenerate' },
    ]);
    expect(d.faults).toEqual([{ index: 0, code: 'ring-contradicts-noun', detail: 'משולש ABC' }]);
  });

  /**
   * The OPERATOR'S ACTUAL COMPLAINT — *"we need to give the user different options and not similar
   * options"*.
   *
   * #1166's comment measured this and refuted the obvious diagnosis: analytic's distinctness test was
   * already fine (0 of 12 offers under the 3% bar), and the successive configurations were far apart
   * NUMERICALLY. What made them useless was that six of the first seven were *the same straight
   * line* — numerically distant, perceptually identical.
   *
   * So "no configuration is degenerate" is necessary but not sufficient to prove his complaint fixed,
   * and this asserts the property he actually asked for: successive offers must differ as SHAPES.
   * The instrument is 2-D's own — pairwise distances normalised by their mean, at the 3% bar
   * `shapeDiffers` uses — which is similarity-invariant, so a whole-figure rotation, translation or
   * scale does not read as a change.
   */
  function shapeFingerprint(p: RingPt[]): number[] {
    const ds: number[] = [];
    for (let i = 0; i < p.length; i += 1) {
      for (let j = i + 1; j < p.length; j += 1) ds.push(Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y));
    }
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    return mean > 0 ? ds.map((d) => d / mean) : ds;
  }

  it('#1166: successive OFFERS are perceptually distinct, not just numerically', () => {
    const lines = [
      'משולש ABC',
      'A(2,-5)',
      'AD תיכון לצלע BC',
      'CE תיכון לצלע AB',
      'P נקודת החיתוך של הישר AD עם הישר CE',
    ];
    /**
     * The OFFERS, not the raw seeds — what «הציגו תצורה אחרת» actually hands the student.
     * `anotherConfiguration` already skips a seed whose signature repeats (#1084), so walking seeds
     * 0,1,2… would measure a list no student is ever shown.
     */
    const prints: number[][] = [];
    let seed = 0;
    for (let press = 0; press < 8; press += 1) {
      const ring = drawnRing(lines, seed, ['A', 'B', 'C']);
      expect(ring, `no triangle at offer ${press}`).not.toBeNull();
      // Every offer he is shown is a real triangle — the half that fixes what he actually saw, which
      // was six of the first seven presses showing him another straight line.
      expect(ringViolation(ring!), `offer ${press} is degenerate`).toBeNull();
      prints.push(shapeFingerprint(ring!));
      const next = anotherConfiguration(lines, seed);
      expect(next.found, `no further configuration after offer ${press}`).toBe(true);
      seed = next.seed;
    }
    for (let i = 1; i < prints.length; i += 1) {
      const diff = Math.max(...prints[i].map((v, k) => Math.abs(v - prints[i - 1][k])));
      expect(diff, `offers ${i - 1} and ${i} look the same`).toBeGreaterThan(0.03);
    }
  });

  /**
   * The seam is consulted where the CONFIGURATION IS CHOSEN, so everything downstream of
   * `drawableAt` — canvas, data panel, `isKnowledge`, `knownOptions` and the configuration walk —
   * is corrected at once. Asserting it on the figure itself is what stops a later change from
   * satisfying the tests above through some path that bypasses the chokepoint.
   */
  it('the chosen figure carries no ring faults when a valid configuration exists', () => {
    const d = derive(['טרפז ABCD', 'A(5,8)', 'B(9,6)'], 1);
    const chosen = drawableAt(d.construction, 1);
    expect(chosen.ringFaults).toEqual([]);
  });
});
