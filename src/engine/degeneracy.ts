/**
 * #945 ([ADR-513](../../docs/06-decisions.md#adr-513)) — the 2-D half of the cross-product degeneracy rule
 * ([ADR-W-048](../../docs/06w-decisions-workspace.md#adr-w-048)): a figure whose givens force a NAMED
 * polygon flat is said out loud, never drawn in silence with every fact green.
 *
 * The predicate is COLLINEARITY of a declared polygon's vertices, judged against the polygon's OWN extent:
 * the greatest distance of any vertex from the line through its two most-separated vertices, divided by
 * that separation. Scale-free by construction — a figure drawn ten times bigger is not ten times less
 * degenerate — and per object, so a small polygon in a large figure is judged by its own size.
 *
 * The band this sits in, measured on the 2-D corpus (2026-09-13, the calibration is the ADR's deliverable):
 * a driven solve that flattens a polygon is REFUSED at the accept gate below 1e-4 (`collapsedPolygon`,
 * ADR-413); a construction the givens force flat — «משולש ABC» with sides 5, 3 and 8 — lands between
 * 1e-4 and ~1e-3 and used to draw silently; the thinnest legitimately-constructible corpus triangle sits
 * an order of magnitude above. The notice covers the middle band; the gate keeps the floor.
 *
 * A THIRD band, above both (#1328, ADR-537): a polygon below 5e-2 that is thin only because the DEGREE
 * tolerance (0.5°) let a contradictory set pass — two right angles in one triangle satisfied by a 0.35°
 * apex at 6e-3. Not a flatness threshold at all: it is a re-solve under a tightened tolerance, so a real
 * thin triangle in the same band (89° + 90° at 1.7e-2) survives and a needle does not. See the tail.
 */
import type { Construction, Id, Vec } from './types';
import { LEN_EPS } from './types';

/** A declared polygon's vertices are collinear to within this fraction of the polygon's own extent. */
export const DEGENERATE_EXTENT_RATIO = 5e-4;

export interface DegeneratePolygon {
  /** The polygon object id (`poly-ABC`). */
  id: Id;
  vertices: Id[];
  /** max vertex offset from the widest chord, over that chord's length (0 = perfectly flat). */
  ratio: number;
}

/**
 * A polygon's FLATNESS: the greatest distance of any vertex from the line through its two most-separated
 * vertices, over that separation (0 = a line). Null when every vertex sits on one spot — that is the
 * coincidence channel's fact (ADR-123), not a flat polygon. The ONE flatness definition, shared by the
 * ADR-513 notice, the ADR-413 collapse floor and the ADR-537 tolerance-artefact gate, so the three
 * bands are measured on one ruler.
 */
export function polygonFlatness(pts: Vec[]): number | null {
  let ai = 0, bi = 1, span = -1;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d > span) { span = d; ai = i; bi = j; }
    }
  if (!(span > 0)) return null;
  const A = pts[ai], B = pts[bi];
  const ux = (B.x - A.x) / span, uy = (B.y - A.y) / span;
  const off = pts.reduce((m, p) => Math.max(m, Math.abs((p.x - A.x) * uy - (p.y - A.y) * ux)), 0);
  return off / span;
}

/** Every declared polygon with its resolved vertices, when all are placed. */
function placedPolygons(c: Construction, positions: Map<Id, Vec>): { id: Id; vertices: Id[]; pts: Vec[] }[] {
  const out: { id: Id; vertices: Id[]; pts: Vec[] }[] = [];
  for (const o of c.objects) {
    if (o.kind !== 'polygon') continue;
    const pts = o.vertices.map((id) => positions.get(id));
    if (pts.length < 3 || pts.some((p) => !p)) continue;
    out.push({ id: o.id, vertices: [...o.vertices], pts: pts as Vec[] });
  }
  return out;
}

/** Every declared polygon whose resolved vertices have collapsed onto a line, with its flatness ratio. */
export function degeneratePolygons(c: Construction, positions: Map<Id, Vec>, tol = DEGENERATE_EXTENT_RATIO): DegeneratePolygon[] {
  const out: DegeneratePolygon[] = [];
  for (const { id, vertices, pts } of placedPolygons(c, positions)) {
    const ratio = polygonFlatness(pts);
    if (ratio !== null && ratio < tol) out.push({ id, vertices, ratio });
  }
  return out;
}

/**
 * #2064 B1 ([ADR-643](../../docs/06-decisions.md#adr-643)) — A RING SQUASHED TO ONE POINT. `polygonFlatness` is
 * scale-free, so a square 1e-8 across reads its own rounding noise as a healthy shape (0.5 measured), and its
 * `null` for "every vertex on one spot" is never reached because the span is 1e-8, not 0. Every vertex within
 * the ADR-123 coincidence floor (`LEN_EPS`, the ruler that already declares two points one) is the limit of a
 * line: not a polygon. Reached with no role noun at all — «ריבוע ABCD» · «B אמצע CD».
 */
export function collapsedToPoint(pts: Vec[]): boolean {
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= LEN_EPS) return false;
  return pts.length > 0;
}

/**
 * #2064 B2 / #2085 item 2 ([ADR-643](../../docs/06-decisions.md#adr-643)) — A STRAIGHT CORNER. The index of the first
 * vertex whose two sides lie on one line (|sin| of the corner below `tol`, the ADR-513 ruler — one number for
 * "flat"), for a polygon of four or more vertices; `null` when every corner turns. A triangle with a straight
 * corner is a flat triangle, which `polygonFlatness` already judges. A corner whose side has no length is the
 * coincidence channel's (ADR-123), not this one's.
 */
export function straightCorner(pts: Vec[], tol = DEGENERATE_EXTENT_RATIO): number | null {
  const n = pts.length;
  if (n < 4) return null;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < LEN_EPS || lv < LEN_EPS) continue;
    if (Math.abs(ux * vy - uy * vx) / (lu * lv) < tol) return i;
  }
  return null;
}

/** #2064 (ADR-643): what makes a declared polygon not a polygon — the accept gate's one question, three answers. */
export interface PolygonDefect {
  id: Id;
  vertices: Id[];
  /** `point`: squashed to one spot (B1) · `flat`: onto a line (ADR-413/602) · `corner`: a straight corner (B2) */
  kind: 'point' | 'flat' | 'corner';
  /** for `corner`: the three consecutive vertices on one line, the straight one in the middle */
  corner?: [Id, Id, Id];
}

/**
 * #2064 ([ADR-643](../../docs/06-decisions.md#adr-643)) — EVERY declared polygon that is not a polygon at these
 * positions, judged in the order a figure degenerates: one point, then one line, then one straight corner.
 * `flatTol` is the caller's flatness floor (the accept gate's `COLLAPSED_POLYGON_RATIO`).
 */
export function polygonDefects(c: Construction, positions: Map<Id, Vec>, flatTol = DEGENERATE_EXTENT_RATIO): PolygonDefect[] {
  const out: PolygonDefect[] = [];
  for (const { id, vertices, pts } of placedPolygons(c, positions)) {
    if (collapsedToPoint(pts)) {
      out.push({ id, vertices, kind: 'point' });
      continue;
    }
    const ratio = polygonFlatness(pts);
    if (ratio !== null && ratio < flatTol) {
      out.push({ id, vertices, kind: 'flat' });
      continue;
    }
    const i = straightCorner(pts);
    if (i !== null) {
      const n = vertices.length;
      out.push({ id, vertices, kind: 'corner', corner: [vertices[(i + n - 1) % n], vertices[i], vertices[(i + 1) % n]] });
    }
  }
  return out;
}

/**
 * #1328 ([ADR-537](../../docs/06-decisions.md#adr-537)) — A POLYGON THINNER THAN ITS TOLERANCE IS NOT A SOLUTION.
 *
 * «משולש ABC» · «AB = AC» · «∠ABC = ∠ACB» · «∠ABC = 90» has no triangle in it: both base angles are right,
 * the apex is 0°, and the givens hold only in the limit B = C. The solver satisfied them WITHIN TOLERANCE —
 * `ANGLE_EPS` is 0.5°, so an apex of 0.35° passes both right angles — and committed a needle (BC at 0.6% of
 * AB, flatness 6e-3) as a valid, fully determined figure with every row green. The two degeneracy mechanisms
 * sit below it: the ADR-413 collapse floor at 1e-4 and the ADR-513 notice band to 5e-4. The needle's
 * thinness is not the geometry's — it is the tolerance's, in radians (0.5° ≈ 8.7e-3).
 *
 * The class: *a given set whose only solutions lie in a degenerate limit is accepted because the residual
 * tolerance admits a nearly-degenerate figure, and the accept gate asks whether the residuals are small,
 * never whether the tolerance is what made them small.* The predicate lives in `step.ts`
 * (`toleranceArtefactPolygon`): a declared polygon below `THIN_POLYGON_RATIO` triggers a RE-SOLVE under a
 * tolerance tightened by `TIGHT_TOLERANCE_FACTOR` (`evaluateTightened`). A genuine thin triangle (89° + 90°,
 * a stated 1°) is an EXACT solution and re-solves to the same shape at any tightening; a needle bought with
 * slack can only meet the tighter bar by collapsing past the solvers' coincidence floor (1e-3 of the
 * figure's extent), where their own accept refuses it — so the re-solve fails, and the step is refused as
 * over-constrained naming the student's statement. A residual-fraction test was tried first and rejected by
 * measurement: on «∠ABC = 90» · «∠ACB = 90» the solver drove the residual under any fraction before the
 * floor stopped it, at flatness 1.5e-3 — the residual is not the signal, the existence of an exact solution is.
 */

/**
 * A declared polygon below this flatness is THIN enough to ask the re-solve question. Measured on the 2-D
 * corpus: the thinnest ordinary polygon sits at 2.3e-2 (ADR-513's sweep), a stated 1° apex at 1.7e-2, the
 * operator's needle at 6e-3, the two-right-angles needle at 1.5e-3. The band contains legitimate figures
 * ON PURPOSE — they are told apart by re-solving, not by their shape — and it is the trigger, so an
 * ordinary figure pays nothing.
 */
export const THIN_POLYGON_RATIO = 5e-2;
/**
 * The factor the re-solve tightens every tolerance by. The needle can meet an angle tolerance τ only with an
 * apex of ~2τ, i.e. a short side of ~2τ·(long side); the solvers' coincidence floor is 1e-3 of the extent,
 * so refusal needs 2τ < 1e-3 rad — τ below 0.029°. 0.02 × ANGLE_EPS (0.5°) = 0.01°, a margin of ~3; on the
 * length family it is 4e-6·scale, which the polished solves (LM to 1e-12 cost) sit far below.
 */
export const TIGHT_TOLERANCE_FACTOR = 0.02;
