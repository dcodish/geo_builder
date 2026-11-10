/**
 * Claim verification (docs/20 §5, §6.2): a claim is the STUDENT'S ANSWER, checked
 * against the figure — reproduce & verify, never solve. Verification is numeric
 * and runs across SEVERAL sampled configurations (different seeds), so a claim
 * that only happens to hold in one drawing of an under-determined figure — a
 * coincidence, not a truth — is refuted. This is the multi-sample discipline the
 * 2-D tool's relation detection uses, applied to answers.
 */

import { knowledgeSamples3, lineAtParam, planeAtParam, type Resolved3 } from './evaluate';
import { seedNumber3, type Seed3 } from './components3';
import { CLAIM_REL_TOL, containmentDeviation, coordPlaneRelHolds, DIRECTION_REL_TOL, lineRelDeviation, mutualHolds, mutualSides, MUTUAL_VERIFY_TOL, distanceBetween, figureExtent, planeCoincidenceDeviation, relDeviation, resolveOperand } from './operands';
import { atomVec, evalExpr, hasLetters3, vecEqLetters3 } from './vecExpr';
import { resolveSolidSubject, subjectVolume } from './solidSubject';
import { bisectorDir3, cross3, dist3, dot3, ringCollapsed3, runNormal, norm3, normalize3, sub3, v3, type Vec3 } from './vec3';
import { symbolOwnersOf, symbolValueOf, type Claim3, type Construction3, type Positions3, type RevolutionObj } from './types';
import { freeRelationHolds3 } from './freeVecSystem';
import { pivotLetterValue3 } from './solve3';

/** Claim tolerance. Closed-form figures verify to ~1e-15; a figure placed by the V4
 *  NUMERIC pivot carries the finite-difference-Jacobian floor (~1e-6 in loosely
 *  conditioned, unpinned directions) — 2e-5 sits far above that noise and far below
 *  any wrong bagrut answer (which differs by ≥ 0.5). */
const REL_TOL = CLAIM_REL_TOL; // #1550: one number, shared with the pivot's frame-drive trigger

/**
 * #1449 (ADR-3D-279): a solid of revolution's measure from its STATED radius and height. The one
 * formula set, shared by the claim verifier («נפח החרוט = 100π») and the ask lane («נפח החרוט»), so
 * what the tool checks and what it answers cannot disagree. `null` when a size is unstated (free,
 * ADR-052). `surface` is the total area (the lateral surface plus the base or bases); a sphere's
 * lateral and total surfaces are the same.
 */
export function revolutionMeasure(rev: RevolutionObj, which: 'volume' | 'lateral' | 'surface'): number | null {
  const r = rev.radius;
  if (r === undefined) return null;
  if (rev.kind === 'sphere') return which === 'volume' ? (4 / 3) * Math.PI * r ** 3 : 4 * Math.PI * r * r;
  const h = rev.height;
  if (h === undefined) return null;
  if (rev.kind === 'cone') {
    const slant = Math.hypot(r, h);
    return which === 'volume' ? (Math.PI * r * r * h) / 3 : which === 'lateral' ? Math.PI * r * slant : Math.PI * r * (r + slant);
  }
  return which === 'volume' ? Math.PI * r * r * h : which === 'lateral' ? 2 * Math.PI * r * h : 2 * Math.PI * r * (r + h);
}

/**
 * #1546 (ADR-3D-282) — a stated triple against an actual vector (a point's position, or a vector's
 * components, #1560). A null component is unstated (or owned by a pivot symbol) and is not checked. A fully
 * stated triple keeps the one-vector tolerance byte-for-byte; a partial one compares each present component,
 * scaled by its own magnitude.
 */
function componentsHold(w: Vec3, t: { x: number | null; y: number | null; z: number | null }): boolean {
  if (t.x !== null && t.y !== null && t.z !== null) {
    const target = v3(t.x, t.y, t.z);
    return norm3(sub3(w, target)) <= REL_TOL * Math.max(norm3(target), 1);
  }
  const within = (v: number, s: number | null) => s === null || Math.abs(v - s) <= REL_TOL * Math.max(Math.abs(s), 1);
  return within(w.x, t.x) && within(w.y, t.y) && within(w.z, t.z);
}

/** #1573 (ADR-3D-290): a stated angle holds when its measure is within this many degrees of the value. */
export const ANGLE_TOL_DEG = 1e-3;

/**
 * #1573 (ADR-3D-290) — the angle AT `vertex` between the rays vertex→p and vertex→q, in degrees (0–180), or
 * null where a ray is missing or degenerate. The one measure behind the `vertex-angle-eq` verifier AND the
 * canvas arc's "does the stated value hold here" guard (#1592), so the two cannot disagree.
 */
export function vertexAngleDeg(pos: ReadonlyMap<string, Vec3>, vertex: string, p: string, q: string): number | null {
  const v = pos.get(vertex), a = pos.get(p), b = pos.get(q);
  if (!v || !a || !b) return null;
  const u1 = sub3(a, v), u2 = sub3(b, v);
  const den = norm3(u1) * norm3(u2);
  if (den < 1e-12) return null;
  return (Math.acos(Math.max(-1, Math.min(1, dot3(u1, u2) / den))) * 180) / Math.PI;
}

/** The angle between the LINES a1b1 and a2b2 — undirected, 0–90° (the textbook convention) — or null. The
 *  `angle-seg-eq` verifier's measure, shared with the canvas's segment-angle arc (#1592). */
export function lineAngleDeg(pos: ReadonlyMap<string, Vec3>, a1: string, b1: string, a2: string, b2: string): number | null {
  const [p1, q1, p2, q2] = [a1, b1, a2, b2].map((id) => pos.get(id));
  if (!p1 || !q1 || !p2 || !q2) return null;
  const d1 = sub3(q1, p1), d2 = sub3(q2, p2);
  const den = norm3(d1) * norm3(d2);
  if (den < 1e-12) return null;
  return (Math.acos(Math.min(1, Math.abs(dot3(d1, d2)) / den)) * 180) / Math.PI;
}

/**
 * #2580 (ADR-3D-384) — the NUMBER a letter names in one resolved configuration, once per number owner
 * (`symbolOwnersOf`): the figure parameter's value, a pin symbol's solved value, a vec-def ratio's chosen value, a
 * named component's coordinate, a rider's parameter. Length and angle owners are not numbers of this kind (an angle
 * letter cannot share a length's name — ADR-3D-385). `undefined` = the lane left it unresolved.
 */
export function letterNumbersAt3(c: Construction3, sym: string, r: Resolved3): (number | undefined)[] {
  const at = (id: string) => r.positions.get(id);
  const out: (number | undefined)[] = [];
  for (const o of symbolOwnersOf(c, sym)) {
    if (o.kind === 'param') out.push(r.param?.value);
    else if (o.kind === 'pin-sym') out.push(r.pivot?.pinSymbols?.[sym]);
    else if (o.kind === 'vec-def') out.push(r.ratioSymbols[sym]);
    else if (o.kind === 'component') out.push(pivotLetterValue3(c, { kind: 'component', target: o.target, axis: o.axis }, at, () => undefined));
    else if (o.kind === 'rider') out.push(pivotLetterValue3(c, { kind: 'rider', id: o.id, fromB: o.fromB }, at, () => undefined));
    else if (o.kind === 'vec-letter') out.push(vecEqLetterAt3(c, sym, r.positions) ?? undefined); // #1551
  }
  return out;
}

/** Seeds checked for every claim: the display seed plus fixed offsets (deterministic). */
// #2764 (ADR-3D-454): a configuration of several parts is sampled around its base number — a verdict is the facts'
export const claimSeeds = (at: Seed3): number[] => {
  const seed = seedNumber3(at);
  return [seed, seed + 1013, seed + 2027, seed + 4057];
};

/**
 * #1896 (ADR-3D-433) — ONE RESIDUAL PER SCALAR CLAIM KIND, the verifier's own function (ADR-3D-286 §3).
 *
 * A scalar claim states ONE real equation about the figure. Its residual `r` is signed where the quantity is signed
 * (a length minus its value, a cosine minus its value), and the claim holds exactly when `|r| ≤ tol`: `holdsAt` judges
 * every scalar kind through this table, and the coord-sym parameter's root-find (`pinParam`, ADR-3D-032) solves
 * `r = 0` through it, so what drives the parameter and what verifies the drawing cannot drift apart (ADR-3D-033's
 * tolerance rule). Before, `pinParam` kept three hand-written residuals (length, the two angles) beside a three-kind
 * routing list in `apply.ts`, and every other kind on a coord-sym point was judged at the sampled parameter and refused
 * «בדקו את החישוב» although roots existed («AB ⊥ AC» on «B(k-1,k,3) · C(k+1,0,k-3)»: k = 2, k = −5).
 *
 * The table is TOTAL over `Claim3['type']` (a new kind is a compile error until it is placed): a `residual`, or an
 * `excluded` reason saying why the kind is not one scalar equation over the points. `letter` reads the number a letter
 * names (`length-letter` only: the verifier reads each lane's value, the root-find the value it is searching).
 */
export type ClaimResidual3 = { r: number; tol: number };
type ResidualOf3<K extends Claim3['type']> = (
  claim: Extract<Claim3, { type: K }>,
  c: Construction3,
  pos: ReadonlyMap<string, Vec3>,
  letter: (sym: string) => number | undefined,
) => ClaimResidual3 | null;
type ResidualEntry3<K extends Claim3['type']> = { residual: ResidualOf3<K> } | { excluded: string };

const lengthOf = (pos: ReadonlyMap<string, Vec3>, a: string, b: string): number | null => {
  const p = pos.get(a);
  const q = pos.get(b);
  return p && q ? norm3(sub3(q, p)) : null;
};
const valueTol = (value: number): number => REL_TOL * Math.max(Math.abs(value), 1);

export const CLAIM_RESIDUALS3 = {
  // #2580 (ADR-3D-384): |ab| = coef·(the number the letter names)
  'length-letter': {
    residual: (cl, _c, pos, letter) => {
      const len = lengthOf(pos, cl.a, cl.b);
      const v = letter(cl.sym);
      return len === null || v === undefined || !Number.isFinite(v) ? null : { r: len - cl.coef * v, tol: REL_TOL * Math.max(Math.abs(len), 1) };
    },
  },
  'length-eq': {
    residual: (cl, _c, pos) => {
      const len = lengthOf(pos, cl.a, cl.b);
      return len === null ? null : { r: len - cl.value, tol: valueTol(cl.value) };
    },
  },
  // #1680 (ADR-3D-392): Σ cᵢ·|aᵢbᵢ| against the stated value, the `length-eq` tolerance
  'length-sum': {
    residual: (cl, _c, pos) => {
      let sum = 0;
      for (const t of cl.terms) {
        const len = lengthOf(pos, t.a, t.b);
        if (len === null) return null;
        sum += t.c * len;
      }
      return { r: sum - cl.value, tol: valueTol(cl.value) };
    },
  },
  'area-eq': {
    residual: (cl, _c, pos) => {
      const ps = cl.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return null;
      const area = 0.5 * norm3(cross3(sub3(ps[1]!, ps[0]!), sub3(ps[2]!, ps[0]!)));
      return { r: area - cl.value, tol: valueTol(cl.value) };
    },
  },
  // #1560 (ADR-3D-284): the arbiter of «u·v = 24», at the `dot-eq` scale
  'dot-val': {
    residual: (cl, c, pos) => {
      const u = atomVec(cl.a, c, pos as Map<string, Vec3>);
      const v = atomVec(cl.b, c, pos as Map<string, Vec3>);
      return !u || !v ? null : { r: dot3(u, v) - cl.value, tol: REL_TOL * Math.max(norm3(u) * norm3(v), Math.abs(cl.value), 1) };
    },
  },
  // the angle between LINES: undirected, ≤ 90° (the textbook convention)
  'angle-seg-eq': {
    residual: (cl, _c, pos) => {
      const deg = lineAngleDeg(pos, cl.a1, cl.b1, cl.a2, cl.b2);
      return deg === null ? null : { r: deg - cl.deg, tol: ANGLE_TOL_DEG };
    },
  },
  // #1573 (ADR-3D-290): the angle AT the vertex, between the two rays — 0–180°
  'vertex-angle-eq': {
    residual: (cl, _c, pos) => {
      const deg = vertexAngleDeg(pos, cl.vertex, cl.p, cl.q);
      return deg === null ? null : { r: deg - cl.deg, tol: ANGLE_TOL_DEG };
    },
  },
  'length-ratio': {
    residual: (cl, _c, pos) => {
      const l1 = lengthOf(pos, cl.a1, cl.b1);
      const l2 = lengthOf(pos, cl.a2, cl.b2);
      if (l1 === null || l2 === null || cl.q === 0 || l2 < 1e-12) return null;
      return { r: l1 / l2 - cl.p / cl.q, tol: REL_TOL * Math.max(cl.p / cl.q, 1) };
    },
  },
  'length-rel': {
    residual: (cl, _c, pos) => {
      const l1 = lengthOf(pos, cl.a1, cl.b1);
      const l2 = lengthOf(pos, cl.a2, cl.b2);
      if (l1 === null || l2 === null) return null;
      const target = cl.c * l2;
      return { r: l1 - target, tol: REL_TOL * Math.max(target, 1) };
    },
  },
  // a solid of revolution's measure from its STATED dims (guarded upstream: no-such-solid / the size refusal, #2076)
  'volume-eq': { residual: (cl, c) => revolutionResidual(cl, c, 'volume') },
  'lateral-area-eq': { residual: (cl, c) => revolutionResidual(cl, c, 'lateral') },
  'surface-area-eq': { residual: (cl, c) => revolutionResidual(cl, c, 'surface') },
  // #766 (ADR-3D-169): the subject is RESOLVED against the declared figure and its volume comes from that solid's own
  // faces (the old `|triple product| / 6` over four ids read a square-base pyramid's base as 0)
  'volume-poly': {
    residual: (cl, c, pos) => {
      const vol = subjectVolume(resolveSolidSubject(c, cl.noun, cl.ids), pos as Map<string, Vec3>);
      return vol === null ? null : { r: vol - cl.value, tol: valueTol(cl.value) };
    },
  },
  'volume-eq-poly': {
    residual: (cl, _c, pos) => {
      const vol = (ids: string[]): number | null => {
        const ps = ids.map((id) => pos.get(id));
        if (ps.length !== 4 || ps.some((p) => !p)) return null;
        return Math.abs(dot3(sub3(ps[1]!, ps[0]!), cross3(sub3(ps[2]!, ps[0]!), sub3(ps[3]!, ps[0]!)))) / 6;
      };
      const v1 = vol(cl.ids1);
      const v2 = vol(cl.ids2);
      return v1 === null || v2 === null ? null : { r: v1 - v2, tol: REL_TOL * Math.max(v1, v2, 1) };
    },
  },
  // #393/#335 (ADR-3D-107): magnitude of a vector EXPRESSION — the length-rel/length-eq twins, through the one evalExpr
  'mag-rel': {
    residual: (cl, c, pos) => {
      const e1 = evalExpr(cl.e1, c, pos as Map<string, Vec3>);
      const e2 = evalExpr(cl.e2, c, pos as Map<string, Vec3>);
      if (!e1 || !e2) return null;
      const target = cl.c * norm3(e2);
      return { r: norm3(e1) - target, tol: REL_TOL * Math.max(target, 1) };
    },
  },
  'mag-val': {
    residual: (cl, c, pos) => {
      const e = evalExpr(cl.e, c, pos as Map<string, Vec3>);
      return !e ? null : { r: norm3(e) - cl.value, tol: valueTol(cl.value) };
    },
  },
  // #305 (ADR-3D-090): the ScalarPin's twin — opposite angles supplementary (see solve3)
  concyclic: {
    residual: (cl, _c, pos) => {
      const q = cl.ids.map((id) => pos.get(id));
      if (q.length !== 4 || q.some((v) => !v)) return null;
      const [A, B, C, D] = q as Vec3[];
      const cosAt = (v: Vec3, p1: Vec3, p2: Vec3) => {
        const u1 = sub3(p1, v);
        const u2 = sub3(p2, v);
        return dot3(u1, u2) / Math.max(norm3(u1) * norm3(u2), 1e-12);
      };
      return { r: cosAt(A, B, D) + cosAt(C, B, D), tol: REL_TOL * 10 };
    },
  },
  // V8-f (G6): cos of the angle between two operands = value («AB ⊥ AC» is cos = 0)
  'cos-angle-eq': {
    residual: (cl, c, pos) => {
      const u = atomVec(cl.u, c, pos as Map<string, Vec3>);
      const v = atomVec(cl.v, c, pos as Map<string, Vec3>);
      if (!u || !v) return null;
      const den = norm3(u) * norm3(v);
      return den < 1e-12 ? null : { r: dot3(u, v) / den - cl.cos, tol: REL_TOL * Math.max(Math.abs(cl.cos), 1) };
    },
  },
  // V8-f (G9): u·v = c·d (a chained-equality link)
  'dot-eq': {
    residual: (cl, c, pos) => {
      const [a, b, cc, d] = [cl.a, cl.b, cl.c, cl.d].map((r) => atomVec(r, c, pos as Map<string, Vec3>));
      if (!a || !b || !cc || !d) return null;
      return { r: dot3(a, b) - dot3(cc, d), tol: REL_TOL * Math.max(norm3(a) * norm3(b), norm3(cc) * norm3(d), 1e-12) };
    },
  },
  // V8-f (G10): ∠(a,b) = ∠(c,d) — equal angles ⟺ equal cosines
  'cos-eq': {
    residual: (cl, c, pos) => {
      const [a, b, cc, d] = [cl.a, cl.b, cl.c, cl.d].map((r) => atomVec(r, c, pos as Map<string, Vec3>));
      if (!a || !b || !cc || !d) return null;
      const den1 = norm3(a) * norm3(b);
      const den2 = norm3(cc) * norm3(d);
      return den1 < 1e-12 || den2 < 1e-12 ? null : { r: dot3(a, b) / den1 - dot3(cc, d) / den2, tol: REL_TOL };
    },
  },
  // triage 3-D: sin β = |n·u| / (|n||u|) (formula sheet). n from two plane edges at pt[0].
  'line-plane-angle': {
    residual: (cl, _c, pos) => {
      const a = pos.get(cl.a);
      const b = pos.get(cl.b);
      const pts = cl.plane.map((id) => pos.get(id));
      if (!a || !b || pts.some((p) => !p)) return null;
      const u = sub3(b, a);
      const n = cross3(sub3(pts[1]!, pts[0]!), sub3(pts[pts.length - 1]!, pts[0]!));
      const den = norm3(n) * norm3(u);
      if (den < 1e-12) return null;
      const beta = (Math.asin(Math.min(1, Math.abs(dot3(n, u)) / den)) * 180) / Math.PI;
      return { r: beta - cl.deg, tol: 1e-3 };
    },
  },
  // #833 (ADR-3D-193) — AB ∥ plane A'B'C'D': the segment's direction ⟂ the plane's normal (a segment LYING IN the plane
  // satisfies it too: ∥ is about direction, containment has its own relation). A plane whose two spanning directions are
  // dependent is not a plane, so the claim is unanswerable rather than true.
  'par-plane': {
    residual: (cl, _c, pos) => {
      const [s1, s2] = cl.seg.map((id) => pos.get(id));
      const [p1, p2, p3] = cl.plane.map((id) => pos.get(id));
      if (!s1 || !s2 || !p1 || !p2 || !p3) return null;
      const d = sub3(s2, s1);
      const e1 = sub3(p2, p1);
      const e2 = sub3(p3, p1);
      const n = cross3(e1, e2);
      if (norm3(n) <= REL_TOL * Math.max(norm3(e1) * norm3(e2), 1e-12)) return null;
      return { r: dot3(d, n), tol: REL_TOL * Math.max(norm3(d) * norm3(n), 1) };
    },
  },
  // ---- not one scalar equation over the points: each says why
  'perp-plane': { excluded: 'two equations — the segment ⟂ BOTH spanning directions of the plane' },
  'vec-eq': { excluded: 'a vector equation — three component equations, not one' },
  'coords-eq': { excluded: 'a coordinate statement — three components; on a coord-sym point the coordinate lane reads it (`readCoordGiven` → symbol-value)' },
  'vec-val': { excluded: "a vector's components — three equations, read by the pivot's pins and their arbiter" },
  'plane-eq': { excluded: 'one equation per named point, not one' },
  'collinear3': { excluded: 'a cross product per further point — a vector condition, not one equation' },
  'polygon-open': { excluded: 'an inequality (the ring does not collapse), not an equation' },
  'coord-plane-rel': { excluded: "a ring's relation to a coordinate plane — a classifier over several components" },
  'plane-line-perp': { excluded: "the plane's normal ∥ the line — a vector condition" },
  'bisector-dir': { excluded: 'a direction (a unit vector equal to the bisector), not one equation' },
  'lines-rel': { excluded: 'a classifier (parallel / crossing / skew), not an equation' },
  'free-rel': { excluded: "a free-vector relation, judged at the free-vector system's own solution (`freeX`)" },
  'line-rel': { excluded: "a relation between operands: ADR-3D-286's `paramPinningRels` reads its parameter dependence" },
  'mutual-rel': { excluded: "a relation between operands: ADR-3D-286's `paramPinningRels` reads its parameter dependence" },
  'plane-rel': { excluded: "a relation between operands: ADR-3D-286's `paramPinningRels` reads its parameter dependence" },
  'distance-rel': { excluded: "a relation between operands: ADR-3D-286's `paramPinningRels` reads its parameter dependence" },
  'never-parallel': { excluded: 'a statement about EVERY value of the parameter, never one that pins it' },
} satisfies { [K in Claim3['type']]: ResidualEntry3<K> };

/** The claim kinds the table gives a residual (one scalar equation each). */
export type ScalarClaimType3 = {
  [K in keyof typeof CLAIM_RESIDUALS3]: (typeof CLAIM_RESIDUALS3)[K] extends { residual: unknown } ? K : never;
}[keyof typeof CLAIM_RESIDUALS3];

export const hasClaimResidual3 = (type: Claim3['type']): boolean => 'residual' in CLAIM_RESIDUALS3[type];

/** #1896 (ADR-3D-433): a scalar claim's residual at these positions, or null (not a scalar kind, or a point missing or degenerate). */
export function claimResidual3(
  claim: Claim3,
  c: Construction3,
  pos: ReadonlyMap<string, Vec3>,
  letter: (sym: string) => number | undefined = () => undefined,
): ClaimResidual3 | null {
  const entry = CLAIM_RESIDUALS3[claim.type] as ResidualEntry3<Claim3['type']>;
  return 'residual' in entry ? (entry.residual as ResidualOf3<Claim3['type']>)(claim as never, c, pos, letter) : null;
}

/** `|r| ≤ tol`: the one verdict of a scalar claim, for the verifier and the root-find's candidate filter alike. */
export const residualHolds3 = (res: ClaimResidual3 | null): boolean => res !== null && Number.isFinite(res.r) && Math.abs(res.r) <= res.tol;

function revolutionResidual(cl: { solid: string; value: number }, c: Construction3, which: 'volume' | 'lateral' | 'surface'): ClaimResidual3 | null {
  const rev = c.revolutions.find((r) => r.kind === cl.solid);
  const actual = rev ? revolutionMeasure(rev, which) : null;
  return actual === null ? null : { r: actual - cl.value, tol: valueTol(cl.value) };
}

function holdsAt(claim: Claim3, c: Construction3, resolved: Resolved3): boolean {
  // #375: a claim may reference a resolved LINE, not only positions. `evaluate3` is literally
  // `resolve3(...).positions`, so taking the whole Resolved3 costs nothing and stops the claim lane
  // being blind to everything the figure resolves besides its points.
  const pos = resolved.positions;
  // #1546 (ADR-3D-282), lifted to the CLAIM LEVEL by #1560 (ADR-3D-284): the arbiter of a GIVEN is judged
  // on a PLACED figure only. Where the pivot found no placement at this configuration, the positions are the
  // unsolved seed fallback — not a figure, so not evidence against the given. The store's pin-owner guard
  // speaks for the displayed seed («no placement matches the given coordinates» / the givens contradict);
  // another verification seed simply is not one. ONE rule for every `given: true` claim, not a copy per
  // kind — the next pin family to gain an arbiter (#1567) inherits it by setting the flag. An ANSWER
  // («K = (…)») carries no flag and keeps its verify-your-answer register (ADR-3D-075).
  if ('given' in claim && claim.given && resolved.pivot !== null && resolved.pivot.solutions === 0) return true;
  // #1896 (ADR-3D-433): every scalar kind is judged through its one residual, the function the parameter root-find solves
  if (claim.type === 'length-letter') {
    // #2580 (ADR-3D-384): for EVERY number owner of the letter, each read where its lane put it, so a lane that could not
    // drive the tie is refuted here, never silently drawn
    if (!pos.get(claim.a) || !pos.get(claim.b)) return false;
    return letterNumbersAt3(c, claim.sym, resolved).every((v) => residualHolds3(claimResidual3(claim, c, pos, () => v)));
  }
  if (hasClaimResidual3(claim.type)) return residualHolds3(claimResidual3(claim, c, pos));
  switch (claim.type) {
    case 'free-rel': // #2684 (ADR-3D-421): the relation at this drawing and this configuration's free-vector solution
      return freeRelationHolds3(c, claim.m, pos, resolved.freeX);
    case 'vec-eq': {
      // #1551 (ADR-3D-472): with letters it holds when SOME letters satisfy it at this drawing — the least-squares
      // residual the pivot drove, judged by the same relative tolerance
      if (hasLetters3(claim.lhs) || hasLetters3(claim.rhs)) {
        const sol = vecEqLetters3(claim.lhs, claim.rhs, (a) => atomVec(a, c, pos), (sym) => symbolValueOf(c, sym));
        return !!sol && norm3(sol.residual) <= REL_TOL * Math.max(sol.scale, 1);
      }
      const l = evalExpr(claim.lhs, c, pos);
      const r = evalExpr(claim.rhs, c, pos);
      if (!l || !r) return false;
      const scale = Math.max(norm3(l), norm3(r), 1e-12);
      return norm3(sub3(l, r)) <= REL_TOL * Math.max(scale, 1);
    }
    case 'perp-plane': {
      const [s1, s2] = claim.seg.map((id) => pos.get(id)!);
      const [p1, p2, p3] = claim.plane.map((id) => pos.get(id)!);
      if (!s1 || !s2 || !p1 || !p2 || !p3) return false;
      const d = sub3(s2, s1);
      const e1 = sub3(p2, p1);
      const e2 = sub3(p3, p1);
      // the two plane directions must be independent, and d ⟂ both
      if (norm3(cross3(e1, e2)) <= REL_TOL * Math.max(norm3(e1) * norm3(e2), 1e-12)) return false;
      const ok1 = Math.abs(dot3(d, e1)) <= REL_TOL * Math.max(norm3(d) * norm3(e1), 1);
      const ok2 = Math.abs(dot3(d, e2)) <= REL_TOL * Math.max(norm3(d) * norm3(e2), 1);
      return ok1 && ok2;
    }
    // #1849 (ADR-3D-310): a polygon declared over existing points — its ring must be open
    case 'polygon-open': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return false;
      return !ringCollapsed3(ps as Vec3[]);
    }
    case 'collinear3': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return false;
      const [a, b] = [ps[0]!, ps[1]!];
      const ab = sub3(b, a);
      for (let i = 2; i < ps.length; i++) {
        const ac = sub3(ps[i]!, a);
        if (norm3(cross3(ab, ac)) > REL_TOL * Math.max(norm3(ab) * norm3(ac), 1)) return false;
      }
      return true;
    }
    case 'coords-eq': {
      const p = pos.get(claim.id);
      if (!p) return false;
      // (the `given` placed-figure rule is at the head of `holdsAt` — #1560 lifted it to the claim level)
      // #1546 (ADR-3D-282): a null component is unstated (or owned by a pivot symbol) and is not checked.
      // A fully stated claim keeps its one-vector tolerance byte-for-byte; a partial one compares each
      // present component, scaled by its own magnitude.
      return componentsHold(p, claim);
    }
    case 'vec-val': {
      // #1560 (ADR-3D-284): the arbiter of «u = (…)» / «AB = (…)» — the same component rule as a point's
      // coordinates, read through the one `atomVec` the claim lane shares (a named vector and a pair alike).
      const w = atomVec(claim.atom, c, pos);
      return w !== null && componentsHold(w, claim);
    }
    case 'coord-plane-rel': {
      // #324 (ADR-3D-079): the ring's relation to a coordinate plane/axis on the FINAL figure.
      // #1550: the predicate is shared with the pivot's drive trigger — one meaning, two readers.
      return coordPlaneRelHolds(claim.ids.map((id) => pos.get(id)), claim.axis, claim.mode, REL_TOL);
    }
    case 'plane-line-perp': {
      // #375: the point-run plane's normal must be PARALLEL to the line's direction (the plane ⟂ the
      // line). Judged on the FINAL figure, normalized by both magnitudes so neither a shrinking figure
      // nor an arbitrarily scaled direction vector can zero it for free.
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.length < 3 || ps.some((p) => !p)) return false;
      const ring = (ps as { x: number; y: number; z: number }[]).map((p) => v3(p.x, p.y, p.z));
      const n = runNormal(ring);
      const nn = norm3(n);
      if (nn < 1e-12) return false; // the named points do not span a plane
      const ln = resolved.lines.get(claim.line);
      if (!ln) return false;
      const dn = norm3(ln.dir);
      if (dn < 1e-12) return false;
      return norm3(cross3(n, ln.dir)) <= REL_TOL * nn * dn;
    }
    case 'line-rel': {
      // S2 (#378, ADR-3D-103): resolved through the ONE operand seam (engine/operands.ts), so the
      // claim judges exactly the geometry the drive drove. Tolerance is the DRIVE's numeric floor
      // (the memberHolds3 reasoning, 1e-4) — the unmet trigger uses the same bar, so a figure the
      // drive accepts can never flap to claim-refuted; a wrong bagrut relation misses by ≥ ~1e-2.
      const ln = resolved.lines.get(claim.line);
      if (!ln) return false;
      const geom = resolveOperand(claim.op, c, { lines: resolved.lines, planes: resolved.planes })((id) => pos.get(id) ?? null);
      if (!geom) return false;
      const dev = lineRelDeviation(claim.rel, claim.deg, geom, ln, figureExtent(pos));
      return dev !== null && dev <= 1e-4;
    }
    case 'mutual-rel': {
      // S4 (#378): the general operand pair, through the same seam and the same classifier the
      // drive and the requirement gate read — one answer to "where do these two lie".
      const sides = mutualSides(claim.a, claim.b, c, { lines: resolved.lines, planes: resolved.planes }, (id) => pos.get(id) ?? null);
      if (!sides) return false;
      return mutualHolds(claim.rel, sides[0], sides[1], MUTUAL_VERIFY_TOL);
    }
    case 'plane-rel': {
      // S3 (#378): the general direction relation, through the one operand seam and the one
      // deviation function the drive uses — so a driven figure can never disagree with its claim.
      const abs = { lines: resolved.lines, planes: resolved.planes };
      const at = (id: string) => pos.get(id) ?? null;
      const ga = resolveOperand(claim.a, c, abs)(at);
      const gb = resolveOperand(claim.b, c, abs)(at);
      if (!ga || !gb) return false;
      const dev =
        claim.rel === 'coincident'
          ? planeCoincidenceDeviation(ga, gb, figureExtent(pos))
          : // #614: containment is direction AND position — one shared predicate with the panel
            claim.rel === 'contained'
            ? containmentDeviation(ga, gb, figureExtent(pos))
            : relDeviation(claim.rel, claim.deg, ga, gb);
      return dev !== null && dev <= DIRECTION_REL_TOL;
    }
    case 'distance-rel': {
      // S5 (#378): one geometry function, shared with the drive residual and the query lane.
      const abs = { lines: resolved.lines, planes: resolved.planes };
      const at = (id: string) => pos.get(id) ?? null;
      const ga = resolveOperand(claim.a, c, abs)(at);
      const gb = resolveOperand(claim.b, c, abs)(at);
      if (!ga || !gb) return false;
      const d = distanceBetween(ga, gb);
      return d !== null && Math.abs(d - claim.value) <= REL_TOL * Math.max(1, Math.abs(claim.value));
    }
    case 'plane-eq': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.length < 3 || ps.some((p) => !p)) return false;
      const n = v3(claim.cx, claim.cy, claim.cz);
      if (norm3(n) < 1e-12) return false; // not a plane at all
      // the named points must genuinely span a plane
      if (norm3(cross3(sub3(ps[1]!, ps[0]!), sub3(ps[2]!, ps[0]!))) < 1e-9) return false;
      return ps.every((p) => Math.abs(dot3(n, p!) + claim.d) <= REL_TOL * Math.max(norm3(n) * (1 + norm3(p!)), 1));
    }
    case 'lines-rel': {
      // S4 (#378): delegates to the ONE shared classifier — the same scalars the mutual-position
      // drive, the data panel and the requirement gate read, so a driven figure can never disagree
      // with its own claim. The segments are BOUNDED sides (`מצטלבים`/`נחתכים` are statements about
      // the drawn segments, not their continuations — the 2-D ADR-166 reading in R³).
      const [a1, b1, a2, b2] = [claim.a1, claim.b1, claim.a2, claim.b2].map((id) => pos.get(id));
      if (!a1 || !b1 || !a2 || !b2) return false;
      const s1 = { geom: { point: a1, dir: sub3(b1, a1) }, bounded: true };
      const s2 = { geom: { point: a2, dir: sub3(b2, a2) }, bounded: true };
      // `parallel` here keeps its historic reading — two segments lying on ONE line satisfied the
      // old `cross ≈ 0` test, and a saved figure may rely on it.
      if (claim.rel === 'parallel') return mutualHolds('parallel', s1, s2, MUTUAL_VERIFY_TOL) || mutualHolds('coincident', s1, s2, MUTUAL_VERIFY_TOL);
      return mutualHolds(claim.rel === 'intersect' ? 'intersecting' : 'skew', s1, s2, MUTUAL_VERIFY_TOL);
    }
    case 'bisector-dir': {
      /**
       * #872 — the verification twin of the `bisector-dir` pin, reading the SAME definition. On a
       * determined figure the tool checks the statement it was actually given: that apex→tip is the
       * internal bisector RAY, not merely that the two arm angles are equal.
       */
      const O = pos.get(claim.apex);
      const A = pos.get(claim.a);
      const B = pos.get(claim.b);
      const T = pos.get(claim.tip);
      if (!O || !A || !B || !T) return false;
      const u = bisectorDir3(O, A, B);
      const ray = sub3(T, O);
      if (!u || norm3(ray) < 1e-12) return false;
      return dist3(normalize3(ray), u) <= REL_TOL;
    }
    case 'never-parallel': {
      // "ℓ ∦ π for EVERY parameter value" (2024-Q2 א): parallel ⟺ dir(m)·n(m) = 0,
      // so the claim holds iff that residual has NO zero over the scanned range —
      // sign changes AND near-zero touches both refute it. Parameter-scan, seed-free.
      let prev: number | null = null;
      for (let m = -25; m <= 25 + 1e-9; m += 0.01) {
        const ln = lineAtParam(c, claim.line, m);
        if (!ln) return false;
        const pl = planeAtParam(c, claim.plane, m);
        const scale = Math.max(norm3(ln.dir) * norm3(pl.n), 1e-12);
        const r = dot3(ln.dir, pl.n) / scale;
        if (Number.isNaN(r) || Math.abs(r) < 1e-4) return false; // touches parallel
        if (prev !== null && prev * r < 0) return false; // crosses parallel between samples
        prev = r;
      }
      return true;
    }
    default: {
      // the scalar kinds were judged above, through the table; an EXCLUDED kind with no case here is a compile error
      const scalar: ScalarClaimType3 = claim.type;
      void scalar;
      return residualHolds3(claimResidual3(claim, c, pos));
    }
  }
}

/**
 * True iff the claim holds in EVERY sampled configuration — every claim seed × every branch of the
 * parameter (#1474, ADR-3D-283: `claimSeeds` reach the branches only by `seed % n`, which missed a
 * four-root pool's index s+2, so a claim false on exactly that branch read as verified).
 *
 * #1546 (ADR-3D-282) — every claim verifies at the SAME configurations, so a figure's samples are
 * resolved once per (construction, seed), never once per claim: four coordinate claims on a pivot figure
 * re-solved the pivot sixteen times per derive (the #863 sample-count lock caught it). #863 (ADR-3D-304)
 * moved that memo down to `resolve3` itself, so the claim verifier, the data panel and the ask lane share
 * ONE solve per configuration — `knowledgeSamples3` is called directly here.
 */
export function verifyClaim(claim: Claim3, c: Construction3, seed: Seed3): boolean {
  // one base seed at a time, so a refuted claim still stops at the first failing seed (docs/17 §7)
  return claimSeeds(seed).every((s) => knowledgeSamples3(c, [s]).every((r) => holdsAt(claim, c, r)));
}

/**
 * #1551 ([ADR-3D-472](../../docs/06b-decisions-3d.md#adr-3d-472)) — the number a vector equation's letter takes in one
 * drawing: its least-squares value in the FIRST equation that carries it (`vecEqLetters3`), null when that drawing does
 * not determine it. The panel's params row, the ask «a» and the claims' number reader all read this one function.
 */
export function vecEqLetterAt3(c: Construction3, sym: string, pos: ReadonlyMap<string, Vec3>): number | null {
  for (const k of c.claims) {
    if (k.type !== 'vec-eq' || ![...k.lhs, ...k.rhs].some((t) => t.letter?.sym === sym)) continue;
    const sol = vecEqLetters3(k.lhs, k.rhs, (a) => atomVec(a, c, pos as Positions3), (s) => symbolValueOf(c, s));
    return sol?.letters?.get(sym) ?? null;
  }
  return null;
}
