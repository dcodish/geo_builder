/**
 * The humaniser's evidence corpus (moved here from `humanize-error.test.ts` by #1995 stage 5, ADR-W-154, so two locks
 * read ONE list): `humanize-error.test.ts` asserts each raw engine message humanises (every pattern covered), and
 * `refusal-style.test.ts` holds each rendered refusal to the one-next-step rule. Test-only.
 */
import { describeConstraint } from '@/engine/solve';
import { shapeExclusionError } from '@/engine/apply';
import { collapsedPolygonError } from '@/engine/step';
import { collinearCircleError, notCyclicImpossibilityError } from '@/engine/cyclicFeasibility';
import { diagonalHeightError } from '@/engine/heightFeasibility';
import { equalNestedMessage, tangentsExhaustedMessage } from '@/engine/radiusFeasibility';
import { reservedAmbiguity } from '@/engine/lower';
import type { AnyCommand } from '@/engine';

/** #2177: the circles a reserved-r refusal names — two sized, and one sized beside an unsized one. */
const RESERVED_TWO_SIZED = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 3 },
  { type: 'circle', id: 'circle-P', center: 'P', radius: 5 },
  { type: 'set-var', name: 'r', value: 4 },
] as AnyCommand[];
const RESERVED_ONE_SIZED = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 3 },
  { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true },
  { type: 'set-var', name: 'r', value: 4 },
] as AnyCommand[];


/**
 * Every CURRENT engine error shape (catalogued from evaluate.ts / step.ts / geoStore.ts)
 * must humanise to a Hebrew message that still carries its dynamic data. If a new error
 * site is added to the engine, add its raw shape here so coverage stays complete.
 */
export const CASES: { raw: string; contains: string[] }[] = [
  // lower.ts reservedAmbiguity (#2177, ADR-733) — the reserved r on a figure with several circles, BOTH wordings (two sized
  // circles; one sized beside an unsized one). Built by the engine's own function, never re-spelled here.
  { raw: reservedAmbiguity(RESERVED_TWO_SIZED, 2, new Map())!, contains: ['O, P', 'שרדיוסם נתון', 'הוא הרדיוס', 'רדיוס מעגל'] },
  { raw: reservedAmbiguity(RESERVED_ONE_SIZED, 2, new Map())!, contains: ['O, P', 'הוא הרדיוס', 'רדיוס מעגל'] },
  // step.ts collapsedPolygonError (#1849, ADR-602) — a declared polygon the step would flatten; the noun is the
  // polygon's own, so all three wordings (triangle, quadrilateral, polygon) and the no-statement form are exercised.
  // Built by the engine's own function, never re-spelled here.
  { raw: collapsedPolygonError(['A', 'B', 'C'], '|AC| = 8'), contains: ['ABC', 'A, B, C', 'משולש'] },
  { raw: `${collapsedPolygonError(['A', 'B', 'C', 'D'], '|AD| = 3')} [vs #0]`, contains: ['ABCD', 'מרובע'] },
  { raw: collapsedPolygonError(['A', 'B', 'C', 'D', 'E'], null), contains: ['ABCDE', 'מצולע'] },
  // #2064 B2 / #2085 item 2 (ADR-643): a straight corner names its triple; a quadrilateral keeps the flat sentence,
  // a pentagon and up says it would become the (n−1)-gon
  { raw: collapsedPolygonError(['A', 'B', 'C', 'D'], '∠BCD = 180°', ['B', 'C', 'D']), contains: ['ABCD', 'B, C, D', 'מרובע'] },
  { raw: collapsedPolygonError(['A', 'B', 'C', 'D', 'E'], '∠BCD = 180°', ['B', 'C', 'D']), contains: ['ABCDE', 'B, C, D', 'המחומש', 'מרובע'] },
  { raw: collapsedPolygonError(['A', 'B', 'C', 'D', 'E', 'F'], null, ['B', 'C', 'D']), contains: ['ABCDEF', 'המשושה', 'מחומש'] },
  // cyclicFeasibility.ts (#1918, ADR-607) — a circle through a ring declared a right trapezoid; the reason clause is a
  // nested translation built from the shape-noun keys. Built by the engine's own function, never re-spelled here.
  { raw: `${notCyclicImpossibilityError({ ring: ['A', 'B', 'C', 'D'], shape: 'right-trapezoid', forced: 'rectangle' })} [vs #0]`, contains: ['טרפז ישר זווית', 'למלבן'] },
  // #2099 (ADR-651): the structural refusal and the evaluator's numeric backstop — one ruled reason, never half-English
  { raw: `${collinearCircleError({ points: ['A', 'D', 'B'], centre: 'O' })} [vs #1]`, contains: ['A, D', 'B', 'ואין מעגל שעובר דרך שלוש נקודות על ישר אחד'] },
  { raw: `${diagonalHeightError({ diagonal: ['A', 'C'], ring: ['A', 'B', 'C', 'D'], shape: 'square' })} [vs #0]`, contains: ['האלכסון', 'AC', 'אינו מאונך לאף צלע של הריבוע'] },
  { raw: 'cannot construct O: A, D, B are collinear (no circumscribed circle)', contains: ['A, D', 'B', 'ואין מעגל שעובר דרך שלוש נקודות על ישר אחד'] },
  // apply.ts shapeExclusionError (#1985, ADR-619) — two nouns no quadrilateral carries at once. Both shape words
  // are `paramKeys` (translation keys), so the gate also proves no English noun survives into the sentence.
  // Built by the engine's own function, never re-spelled here.
  { raw: shapeExclusionError({ actual: 'parallelogram', stated: 'trapezoid' }), contains: ['מקבילית', 'טרפז'] },
  { raw: shapeExclusionError({ actual: 'square', stated: 'right-trapezoid' }), contains: ['ריבוע', 'טרפז ישר זווית'] },
  // metricFeasibility.ts (#420, ADR-417) — BOTH wordings: `keyOf` picks the triangle sentence for a
  // single intermediate point and the general path sentence for a longer cycle, so both are exercised.
  // Added by #983's coverage gate, which found this pattern carried no evidence row at all.
  { raw: 'impossible: |AC| = 9 exceeds 8, the distance from A to C via B', contains: ['|AC|', '9'] },
  { raw: 'impossible: |AD| = 20 exceeds 12, the distance from A to D via B, C', contains: ['|AD|', '20'] },
  // metricFeasibility.ts (#1329, ADR-538) — the angle twin, BOTH wordings: the triangle sentence at a
  // 180° bound and the general polygon sentence otherwise.
  { raw: 'impossible: the angles of ABC sum to 200°, exceeding 180°: ∠ABC = 100°, ∠ACB = 100°', contains: ['∠ABC = 100°', '200°'] },
  { raw: 'impossible: the angles of ABCD sum to 400°, exceeding 360°: ∠DAB = 100°, ∠ABC = 100°, ∠BCD = 100°, ∠CDA = 100°', contains: ['ABCD', '400°', '360°'] },
  // metricFeasibility.ts (#1335, ADR-540) — the bound twin: a stated value and a stated bound of the
  // same measure that exclude each other. Both halves are the student's own sentences.
  // metricFeasibility.ts (#1712, ADR-587) — a stated measure outside its range, BOTH wordings
  { raw: 'impossible: ∠ABC = -2° — an angle measures between 0° and 180°', contains: ['∠ABC = -2°', '180°'] },
  { raw: 'impossible: |AB| = -3 — a length is never negative', contains: ['|AB| = -3'] },
  { raw: 'impossible: |BC| = 4 contradicts |BC| > 10', contains: ['|BC| = 4', '|BC| > 10'] },
  { raw: 'impossible: ∠ABC = 40° contradicts ∠ABC > 100°', contains: ['∠ABC = 40°', '∠ABC > 100°'] },
  // metricFeasibility.ts (#1441) — the obtuse-side member, BOTH wordings: the hypotenuse sentence at
  // exactly 90° and the general longest-side sentence for an obtuse angle.
  { raw: 'impossible: the angle at C is 90°, so |AB| must be the longest side, but |AB| = 3 and |CB| = 4', contains: ['|AB| = 3', '|CB| = 4', 'C'] },
  { raw: 'impossible: the angle at B is 120°, so |AC| must be the longest side, but |AC| = 5 and |BA| = 7', contains: ['120°', '|AC| = 5', '|BA| = 7'] },
  // core.ts (#926) — a variable whose defining step was removed, muted or failed. Same finding.
  { raw: 'variable α is not defined by any statement (the step that defined it was removed, muted or failed)', contains: ['α'] },
  // core.ts (#1658, ADR-562) — a relation over letters bound in a form it cannot follow («AB = k²» · «0 < k < 6»)
  { raw: 'relation on k cannot be enforced (a letter is used in a form this statement cannot follow)', contains: ['k'] },
  // step.ts danglingCircleError (#186) — a reference to a circle that doesn't exist
  { raw: "circle 'O2' is not defined", contains: ['O2'] },
  { raw: 'unresolved dependencies for: A, B, circle-O', contains: ['A, B, O'] },
  // core.ts (#1748, ADR-578) — a differently spelled re-statement over an unticked row's letters names the row
  { raw: "can't build: A, B, C belong to the unticked row «משולש ABC» — tick it again or delete it", contains: ['«משולש', 'ABC', 'מסומנת כרגע כלא מוצגת'] },
  { raw: 'undefined point: A, B', contains: ['A, B'] }, // #1411 (ADR-577): evaluate names the ABSENT operands
  { raw: 'non-finite position computed', contains: [] },
  { raw: '|AB| = |AD| references an unknown point', contains: ['|AB| = |AD|'] },
  { raw: 'over-constrained: |AC| = 9 cannot hold', contains: ['|AC| = 9'] },
  // #2165 + #2119 (ADR-681): a second size for a stated circle — the ruled frame without a reason clause
  { raw: 'over-constrained: radius of circle-O = 4 cannot hold', contains: ['רדיוס המעגל', 'O = 4'] },
  // radiusFeasibility.ts equalNestedPair (#2206, ADR-713) — built by the engine's own function, each relation's reason.
  { raw: `${equalNestedMessage('circle-P', 'int-tangent')} [vs #1]`, contains: ['משיקים מבפנים', 'אותו מעגל'] },
  { raw: equalNestedMessage('circle-P', 'contained'), contains: ['מוכלים זה בזה', 'קטן ממנו'] },
  { raw: equalNestedMessage('circle-O-2', 'concentric'), contains: ['ומרכזם משותף', 'אותו מעגל'] },
  // radiusFeasibility.ts commonTangentCapacityError (#2428, ADR-741) — the parser's own tangents-exhausted sentences
  { raw: tangentsExhaustedMessage('A', 'B', 'any', 'int-tangent'), contains: ['משיקים מבפנים', 'בנקודת ההשקה'] },
  { raw: tangentsExhaustedMessage('A', 'B', 'internal', 'int-tangent'), contains: ['אין משיק משותף פנימי'] },
  { raw: tangentsExhaustedMessage('A', 'B', 'internal', 'ext-tangent'), contains: ['המשיק הפנימי היחיד'] },
  { raw: tangentsExhaustedMessage('A', 'B', 'external', 'contained'), contains: ['אין אף משיק משותף'] },
  // replay/core.ts (#2023, ADR-661) — a second letter for an angle or a segment that already has one
  { raw: 'name-taken: angle ABC is already named α [vs #1]', contains: ['ABC', 'α'] },
  { raw: 'name-taken: segment AB is already named 2a', contains: ['AB', '2a'] },
  { raw: 'over-constrained: ∠DOE = 2·∠COE cannot hold', contains: ['∠DOE = 2·∠COE'] },
  // replay/core.ts (#855, ADR-476) — the SAMPLED-VALUE degradation of the two rows above: the ids it
  // names are the still-free objects, so they must survive `sanitizeIds` as the student's letters.
  {
    raw: 'not determined: @ctr-O, A are still free, so @ctr-OB ⟂ AB cannot be judged in this configuration',
    contains: ['O, A', 'OB ⟂ AB'],
  },
  { raw: 'not determined: |AC| = 9 cannot be judged in this configuration', contains: ['|AC| = 9'] },
  { raw: 'cannot place F on segment AB so that |AC| = 9', contains: ['F', 'AB', '|AC| = 9'] },
  {
    raw: 'cannot place E: line line-CA is tangent to circle circle-O at A — it has no second crossing to extend onto',
    contains: ['E'],
  },
  // #1834 (ADR-729): a third crossing asked of a chord — the line is named by its two crossings, the asked point is not.
  { raw: 'cannot place ~D: line AC already crosses circle circle-O at A and C — a line has no third crossing with a circle', contains: ['AC', 'A', 'C'] },
  { raw: 'cannot place E: B is at the centre of circle-O', contains: ['E', 'B'] },
  { raw: 'cannot take a tangent at the centre of circle-O', contains: ['O'] },
  { raw: 'cannot construct A: circles circle-O and circle-P do not meet', contains: ['A', 'O', 'P'] },
  { raw: 'C and E would be at the same point', contains: ['C', 'E'] },
  { raw: "'O' is already defined — it can't be redefined as something different", contains: ['O'] },
  { raw: 'tangent circles need a fixed radius (a radius-through-a-point circle is not supported yet)', contains: [] },
  { raw: "can't build: D is no longer available (an earlier step it relies on was removed or failed)", contains: ['D'] },
  // step.ts degenerateConstraintError (ADR-202 + Am.) — the whole NaN-by-id class
  { raw: '⟂ needs two distinct points on each side — "BB" is a single point, not a segment', contains: ['⟂', 'BB'] },
  { raw: '∥ needs two distinct points on each side — "CC" is a single point, not a segment', contains: ['∥', 'CC'] },
  { raw: 'an angle needs three distinct points — "∠ABB" repeats its vertex', contains: ['∠ABB'] },
  { raw: 'collinear points must be distinct — "A" is named twice', contains: ['A'] },
  // step.ts — #966 (ADR-499) / #983 (ADR-500): the two «אלכסון» ROLE refusals. They shipped with a
  // collapsed backslash, so both patterns matched nothing and a Hebrew-first student read the raw
  // English. Present here as the join these rows always needed: the message the engine emits, asserted
  // against the pattern that must recognise it.
  { raw: 'AB is not a diagonal of ABCD — it is a side', contains: ['AB', 'ABCD'] },
  { raw: 'AB is not a diagonal — ABC has no diagonals', contains: ['AB', 'ABC'] },
  // #2112 (ADR-698): a radius relation's reason names the radii, never the hidden witness distance |O~radw-circle-O|
  { raw: `over-constrained: ${describeConstraint({ type: 'ratio', a: 'O', b: '~radw-circle-O', c: 'P', d: '~radw-circle-P', k: 2, radii: { c1: 'circle-O', c2: 'circle-P' } })} cannot hold [vs #0]`, contains: ['רדיוס מעגל', ' = 2 · '] },
];
