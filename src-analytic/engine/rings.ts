/**
 * THE POLYGON-NOUN VALIDITY SEAM — does the configuration drawn honour the noun that was declared?
 * (#1158, #1166)
 *
 * Two operator reports on the same day, on two different nouns, turned out to be one sentence:
 *
 * - «טרפז ABCD» drawn as a crossed "butterfly" ring — *"which should never happen on any quad"* — at
 *   **16 of 24** configurations. «מרובע ABCD», which lowers to NO constraint at all, crossed at 11 of
 *   24, which is the proof that it is about the ring and not about the parallel relation (#1158).
 * - «משולש ABC» drawn as a **straight line** at **13 of 24** configurations once an intersection point
 *   was stated — *"on same diagram, i now have a collapsed triangle on several show next steps"*
 *   (#1166).
 *
 * In both, `faults = []` and `unsatisfied = 0`: the tool believed the figure satisfied its givens.
 * And it did satisfy the *constraints*. What it did not satisfy is **the noun** — because a shape
 * noun asserts more than the relations it lowers to. `shapes.ts` is explicit that
 * *"`parallel(a,b,c,d)` and `equal(a,b,c,d)` are the whole vocabulary"*, and both of those are
 * **direction-insensitive**: a cross-product residual cannot tell `A→B→C→D` from the traversal that
 * folds the ring over itself, and a length equation cannot either. Nothing downstream re-checked.
 *
 * #1166 ruled the two into ONE seam rather than two predicate lists that drift apart:
 *
 * > *the configuration drawn must honour the polygon noun that was declared.*
 *
 * ## What is rejected, and what deliberately is not
 *
 * **Simplicity — not convexity.** A concave quadrilateral is a legitimate «מרובע» and the exam draws
 * them; rejecting concavity would assert a given the question never gave, which is
 * [ADR-052](../../docs/06-decisions.md#adr-052)'s cardinal sin from the other side. Only a ring that
 * crosses *itself* is rejected, and it is rejected because the noun asserts a simple ring — not
 * because crossed is ugly. (This is where the 2-D sibling's `declaredPolygonsConvex` is deliberately
 * NOT the template: 2-D prefers convexity under ADR-018/ADR-097, a different decision for a different
 * product.)
 *
 * **Exact degeneracy — not near-degeneracy.** «משולש» promises a triangle, and a collinear triple
 * contradicts the noun exactly as a crossed ring contradicts «טרפז»; #1166 ruled it invalid, never
 * drawn. A *thin* triangle is a different thing: 3° is ugly but TRUE, and refusing it would again
 * assert a given nobody gave. So the tolerance below sits two orders of magnitude under the "ugly"
 * band — it separates a ring that has collapsed from one that is merely narrow, and nothing else.
 *
 * **Vacancy is not this predicate's business.** A derived object that does not exist at this
 * parameter value — a collinear triple having no circumcentre — is
 * [ADR-AG-008](../../docs/06c-decisions-analytic.md) and keeps its own behaviour. This seam judges
 * the RING the student named, not what can be built from it.
 *
 * ## How it is consumed
 *
 * `evaluate` records the violations on the figure and `drawableAt` prefers a configuration with
 * none — so the seed sweep, the canvas, the data panel and «הציגו תצורה אחרת» are all fixed at one
 * chokepoint. When the whole budget holds nothing valid, `derive` REPORTS on the line that named the
 * polygon rather than drawing a figure that contradicts it. Adding «דלתון» stays one row in
 * `shapes.ts`; it inherits this with no edit here.
 */
import type { Construction, Id } from './types';

/** A position, as `evaluate` has already resolved it. */
export interface RingPt {
  x: number;
  y: number;
}

/** WHICH promise of the noun this configuration breaks. Both are "the ring is not that ring". */
export type RingViolation = 'degenerate' | 'crossed';

/** A declared polygon whose drawn ring contradicts its noun — carried with the id so the line that
 *  stated it can be blamed, and the noun so a report can use the student's own word. */
export interface RingFault {
  id: Id;
  noun?: string;
  violation: RingViolation;
}

/**
 * How flat a corner may be before the ring has COLLAPSED rather than merely narrowed.
 *
 * This is `|sin θ|` at a vertex, so the value is an angle: `1e-3` is **0.057°**. The bands it has to
 * separate were measured on the operator's own figures (#1166) — the collapsed configurations sit
 * under **0.01°**, and the legitimately-thin ones this must NOT touch are at 3–5°. Two orders of
 * magnitude of daylight on each side, which is why the exact value is not delicate.
 *
 * Using `|sin θ|` rather than the ring's AREA is deliberate: area scales with the figure, so a
 * tolerance on it would mean something different at every zoom, and it misses the vertex that sits
 * ON the edge between its neighbours — an "A-B-E-D quad" with E on the diagonal keeps triangle ABD's
 * full area while being no quadrilateral at all. The 2-D sibling learned that one the same way
 * (`hasStraightVertex`, `src/engine/detectShapes.ts`).
 */
export const COLLAPSED_SIN_TOL = 1e-3;

/** Below this, two consecutive vertices are the same point and no angle can be read at all. */
const COINCIDENT_EPS = 1e-9;

const sub = (p: RingPt, q: RingPt): RingPt => ({ x: p.x - q.x, y: p.y - q.y });
const cross = (u: RingPt, v: RingPt): number => u.x * v.y - u.y * v.x;
const len = (u: RingPt): number => Math.hypot(u.x, u.y);

/**
 * Has any corner of this ring gone flat — collinear neighbours, or two vertices on top of each other?
 *
 * Read per VERTEX rather than over the whole ring, because that is the question the noun asks: an
 * n-gon with a straight corner is really an (n−1)-gon, whatever its area says.
 */
function isCollapsed(p: readonly RingPt[]): boolean {
  const n = p.length;
  for (let i = 0; i < n; i += 1) {
    const b = p[i];
    const u = sub(p[(i + n - 1) % n], b);
    const w = sub(p[(i + 1) % n], b);
    const lu = len(u);
    const lw = len(w);
    if (lu < COINCIDENT_EPS || lw < COINCIDENT_EPS) return true;
    if (Math.abs(cross(u, w)) / (lu * lw) < COLLAPSED_SIN_TOL) return true;
  }
  return false;
}

/**
 * Do two segments cross at an interior point of both?
 *
 * PROPER crossing only — segments that merely touch at a shared endpoint are what every adjacent
 * pair of a ring does, and are not what makes a ring self-intersecting.
 */
function properlyCross(a: RingPt, b: RingPt, c: RingPt, d: RingPt): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Does any pair of NON-ADJACENT sides meet? Written over `n` rather than over the quadrilateral's
 * two pairs, so a pentagon added later inherits the check instead of slipping past it.
 */
function isSelfIntersecting(p: readonly RingPt[]): boolean {
  const n = p.length;
  if (n < 4) return false; // a triangle's sides are all adjacent — it cannot cross itself
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      // Adjacent sides share a vertex; side 0 and side n−1 are adjacent through the closing vertex.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (properlyCross(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Does this ring honour the noun it was declared under, or not — and if not, which promise it breaks.
 *
 * Pure over the positions the caller already has: no solve, no seed, no construction. That is what
 * makes it safe to consult inside the existing budgeted seed sweep, and it is the property the 2-D
 * `spread.ts` docblock singles out as the reason that mechanism could be adopted without a new search.
 *
 * Degeneracy is checked FIRST: a collapsed ring has no meaningful crossing to report, and naming it
 * "crossed" would send a report at the student that describes the wrong thing.
 */
export function ringViolation(vertices: readonly RingPt[]): RingViolation | null {
  if (vertices.length < 3) return null; // not a ring; nothing is promised
  if (isCollapsed(vertices)) return 'degenerate';
  if (isSelfIntersecting(vertices)) return 'crossed';
  return null;
}

/**
 * Every declared polygon of `c` whose drawn ring contradicts its noun.
 *
 * A polygon with a vertex that did not resolve is SKIPPED — an unplaced point is a vacancy and
 * belongs to ADR-AG-008, not here; judging it would turn one honest state into a different dishonest
 * report.
 */
export function ringFaultsOf(c: Construction, at: (id: Id) => RingPt | undefined): RingFault[] {
  const faults: RingFault[] = [];
  for (const o of c.objects) {
    if (o.kind !== 'polygon') continue;
    const pts = o.vertices.map(at);
    if (pts.some((p) => !p)) continue;
    const violation = ringViolation(pts as RingPt[]);
    if (violation) faults.push({ id: o.id, noun: o.noun, violation });
  }
  return faults;
}
