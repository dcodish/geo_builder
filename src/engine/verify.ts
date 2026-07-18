/**
 * Givens verifier — "does the final figure actually satisfy the problem?"
 *
 * A green run only means every step APPLIED without error. It does NOT mean the drawing honours
 * the relations the input stated: a fact can be silently dropped (a re-definition that no-ops), or
 * a solver can converge to a point that drifts off where it belongs. This module re-derives the
 * relations a command stream ASSERTS — from the ORIGINAL input, independent of how each object was
 * constructed — and checks them against the final coordinates. A non-empty result is a figure that
 * looks clean but does not match its givens, and should be surfaced (not shown as a silent green).
 *
 * First slice: on-circle membership (the class behind the "E not on the circle" bug) and a tangent's
 * tangency point. Expandable to constraint residuals (distance/angle/parallel/⟂) and collinearity.
 */

import type { Command, Constraint, Id, Vec } from './types';
import type { ResolvedCircle } from './evaluate';
import { dist, pointInPolygon } from './geometry';
import { constraintRefs, describeConstraint, isSatisfied, residual } from './solve';

export interface GivenViolation {
  /** The kind of relation that doesn't hold — an on-circle/tangent incidence, or any constraint type. */
  relation: 'on-circle' | 'tangent' | 'radius-order' | 'radius-ratio' | 'circle-side' | 'region-side' | 'circles-disjoint' | 'circle-contained' | 'tangent-kind' | 'tangent-distinct' | Constraint['type'];
  ids: Id[];
  /** English fallback, e.g. "E should lie on circle P (radius 3.60) but is 7.42 from its centre". */
  message: string;
  /** i18n key + params so the UI renders the message in the active language (the engine has no locale). */
  messageKey: string;
  params: Record<string, string>;
}

/**
 * Re-derive the metric / incidence RELATIONS a command stream asserts — independent of how the engine
 * built each object — as plain {@link Constraint}s, so they can be checked against the final coordinates.
 * This is the [ADR-053](docs/06-decisions.md#adr-053) principle applied beyond on-circle membership: a
 * `set-distance`/`set-angle`/`set-parallel`/… command states a relation the FIGURE must honour, and a
 * silently-dropped or drifted one is caught here even when every step reported `ok`. The mapping mirrors
 * how `applyCommand` builds the same constraint, so it stays a faithful re-derivation, not a new model.
 *
 * The SOFT one-sided ORDER constraints (`set-angle-order`/`set-length-order`/`set-line`'s ordering) are
 * deliberately NOT re-derived as hard violations — they SELECT a configuration (a "visibly smaller" gap),
 * and a marginal-but-valid gap should not read as "the figure is wrong". `set-line`'s COLLINEARITY (the
 * hard part) is checked separately below.
 */
function assertedRelations(commands: Command[]): Constraint[] {
  const out: Constraint[] = [];
  for (const c of commands) {
    switch (c.type) {
      case 'set-angle': out.push({ type: 'angle', vertex: c.vertex, ray1: c.ray1, ray2: c.ray2, value: c.value }); break;
      case 'set-distance': out.push({ type: 'distance', a: c.a, b: c.b, value: c.value }); break;
      case 'set-equal': out.push({ type: 'equal', a: c.a, b: c.b, c: c.c, d: c.d }); break;
      case 'set-ratio': out.push({ type: 'ratio', a: c.a, b: c.b, c: c.c, d: c.d, k: c.k, add: c.add }); break;
      case 'set-length-radius': out.push({ type: 'length-radius', a: c.a, b: c.b, circle: c.circle, center: c.center, witness: c.witness, k: c.k, add: c.add }); break;
      case 'set-angle-ratio': out.push({ type: 'angle-ratio', v1: c.v1, a1: c.a1, b1: c.b1, v2: c.v2, a2: c.a2, b2: c.b2, k: c.k }); break;
      case 'set-parallel': out.push({ type: 'parallel', a: c.a, b: c.b, c: c.c, d: c.d }); break;
      case 'set-perpendicular': out.push({ type: 'perpendicular', a: c.a, b: c.b, c: c.c, d: c.d }); break;
      case 'set-concyclic': out.push({ type: 'concyclic', points: c.points }); break;
      case 'set-collinear': out.push({ type: 'collinear', a: c.a, b: c.b, c: c.c }); break;
      case 'set-area': out.push({ type: 'area', ids: c.ids, value: c.value }); break;
      case 'set-area-ratio': out.push({ type: 'area-ratio', ids1: c.ids1, ids2: c.ids2, k: c.k }); break;
      case 'set-perimeter': out.push({ type: 'perimeter', ids: c.ids, value: c.value }); break;
      case 'set-perimeter-ratio': out.push({ type: 'perimeter-ratio', ids1: c.ids1, ids2: c.ids2, k: c.k }); break;
      case 'set-measure-sum': out.push({ type: 'measure-sum', unit: c.unit, coefs: c.coefs, points: c.points, target: c.target }); break;
      case 'set-length-product': out.push({ type: 'length-product', k: c.k, lhs: c.lhs, rhs: c.rhs }); break;
    }
  }
  return out;
}

/** Every "point lies on circle" relation a command stream asserts — regardless of how it's built. */
function onCircleRefs(commands: Command[]): { point: Id; circle: Id }[] {
  const out: { point: Id; circle: Id }[] = [];
  for (const c of commands) {
    switch (c.type) {
      case 'point-on-circle':
      case 'line-circle-intersection':
      case 'arc-midpoint':
      case 'extend-onto-circle':
        out.push({ point: c.id, circle: c.circle });
        break;
      case 'circle-circle-intersection':
        out.push({ point: c.id, circle: c.circle1 }, { point: c.id, circle: c.circle2 });
        break;
      case 'diameter':
        out.push({ point: c.id1, circle: c.circle }, { point: c.id2, circle: c.circle });
        break;
      case 'circumcircle':
        out.push({ point: c.a, circle: c.id }, { point: c.b, circle: c.id }, { point: c.c, circle: c.id });
        break;
    }
  }
  return out;
}

/** Absolute tolerance for "on the circle", scaled to the radius (2%, with a small floor). */
const onCircleTol = (r: number) => Math.max(0.05, r * 0.02);

/** Friendly circle name for messages: `circle-P` → `circle P`. */
const circleLabel = (id: Id) => id.replace(/^circle-/, 'circle ');
/** The circle's bare letter (e.g. `circle-P` → `P`) for the i18n `params` (the locale supplies "circle"/"מעגל"). */
const circleName = (id: Id) => id.replace(/^circle-/, '');

/**
 * Check the figure's final coordinates against the relations its commands ASSERT. Returns the
 * relations that DON'T hold (empty = the drawing matches every stated given).
 */
export function checkGivens(
  commands: Command[],
  positions: Map<Id, Vec>,
  circles: Map<Id, ResolvedCircle>,
): GivenViolation[] {
  const violations: GivenViolation[] = [];

  const seen = new Set<string>();
  for (const { point, circle } of onCircleRefs(commands)) {
    const key = `${point}@${circle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = circles.get(circle);
    const p = positions.get(point);
    if (!c || !p) continue; // pending / not placed — a different failure mode, not an on-circle miss
    const d = dist(p, c.center);
    if (Math.abs(d - c.r) > onCircleTol(c.r)) {
      violations.push({
        relation: 'on-circle',
        ids: [point, circle],
        message: `${point} should lie on ${circleLabel(circle)} (radius ${c.r.toFixed(2)}) but is ${d.toFixed(2)} from its centre`,
        messageKey: 'figure.v.onCircle',
        params: { point, circle: circleName(circle), radius: c.r.toFixed(2), dist: d.toFixed(2) },
      });
    }
  }

  for (const cmd of commands) {
    if (cmd.type !== 'tangent') continue;
    const c = circles.get(cmd.circle);
    const at = positions.get(cmd.at);
    if (!c || !at) continue;
    const d = dist(at, c.center);
    if (Math.abs(d - c.r) > onCircleTol(c.r)) {
      violations.push({
        relation: 'tangent',
        ids: [cmd.at, cmd.circle],
        message: `tangency point ${cmd.at} should lie on ${circleLabel(cmd.circle)} (radius ${c.r.toFixed(2)}) but is ${d.toFixed(2)} from its centre`,
        messageKey: 'figure.v.tangent',
        params: { point: cmd.at, circle: circleName(cmd.circle), radius: c.r.toFixed(2), dist: d.toFixed(2) },
      });
    }
  }

  // Two mutually-tangent circles must touch: their centres sit r1±r2 apart (external = sum, internal =
  // difference) AND the touch point `at` lies on BOTH circles. Both halves are checked: a silently-dropped
  // or contradicted tangency ("OP=4 over-constrained") trips the centre-distance test; an `at` driven off a
  // circle (e.g. a stated-radius pair where "OM=3" can't move the touch point that sits at radius 5) trips
  // the membership test — that figure looks tangent yet the labelled touch point isn't on the circle.
  for (const cmd of commands) {
    if (cmd.type !== 'circles-tangent') continue;
    const a = circles.get(cmd.circle1);
    const b = circles.get(cmd.circle2);
    if (!a || !b) continue;
    const d = dist(a.center, b.center);
    const target = cmd.external ? a.r + b.r : Math.abs(a.r - b.r);
    if (Math.abs(d - target) > Math.max(0.05, target * 0.02)) {
      violations.push({
        relation: 'tangent',
        ids: [cmd.circle1, cmd.circle2, cmd.at],
        message: `circles ${circleName(cmd.circle1)} and ${circleName(cmd.circle2)} should be ${cmd.external ? 'externally' : 'internally'} tangent (centres ${target.toFixed(2)} apart) but they are ${d.toFixed(2)} apart`,
        messageKey: 'figure.v.circlesTangent',
        params: { c1: circleName(cmd.circle1), c2: circleName(cmd.circle2), kind: cmd.external ? 'external' : 'internal', target: target.toFixed(2), dist: d.toFixed(2) },
      });
      continue; // the centres are wrong — a touch-point miss is a redundant second flag for the same fault
    }
    const at = positions.get(cmd.at);
    if (!at) continue;
    for (const c of [a, b]) {
      const off = dist(at, c.center);
      if (Math.abs(off - c.r) > onCircleTol(c.r)) {
        violations.push({
          relation: 'tangent',
          ids: [cmd.at, cmd.circle1, cmd.circle2],
          message: `the touch point ${cmd.at} should lie on both tangent circles (radius ${c.r.toFixed(2)}) but is ${off.toFixed(2)} from a centre`,
          messageKey: 'figure.v.tangent',
          params: { point: cmd.at, circle: circleName(c === a ? cmd.circle1 : cmd.circle2), radius: c.r.toFixed(2), dist: off.toFixed(2) },
        });
        break;
      }
    }
  }

  // A CONCENTRIC pair's bound roles (ADR-244): the inner circle must stay STRICTLY inside the outer.
  // The radii are free DOFs (ADR-052), so a sampled config can violate the order — `meetsRequirements`
  // gates on a clean verifier, so the sampler / "show another configuration" skips such configs; a
  // genuinely contradicted order (the student sized the inner bigger) surfaces amber here.
  for (const cmd of commands) {
    if (cmd.type !== 'set-radius-order') continue;
    const outer = circles.get(cmd.outer);
    const inner = circles.get(cmd.inner);
    if (!outer || !inner) continue;
    if (inner.r >= outer.r - Math.max(0.05, outer.r * 0.02)) {
      violations.push({
        relation: 'radius-order',
        ids: [cmd.outer, cmd.inner],
        message: `the inner circle (radius ${inner.r.toFixed(2)}) should be strictly inside the outer circle (radius ${outer.r.toFixed(2)})`,
        messageKey: 'figure.v.radiusOrder',
        params: { inner: circleName(cmd.inner), outer: circleName(cmd.outer), ri: inner.r.toFixed(2), ro: outer.r.toFixed(2) },
      });
    }
  }

  // A stated circle-SIDE ("M מחוץ למעגל" / "בתוך המעגל", ADR-254): the point must lie STRICTLY on its
  // stated side of the circle. The point is a free DOF (ADR-052), so a sampled config can drift across —
  // `meetsRequirements` gates on a clean verifier, so the sampler / "show another configuration" skips
  // wrong-side configs; a genuinely contradicted side (the point pinned/derived onto the other side)
  // surfaces amber here.
  for (const cmd of commands) {
    if (cmd.type !== 'point-circle-side') continue;
    const c = circles.get(cmd.circle);
    const p = positions.get(cmd.id);
    if (!c || !p) continue;
    const d = dist(p, c.center);
    const tol = onCircleTol(c.r);
    const ok = cmd.side === 'outside' ? d > c.r + tol : d < c.r - tol;
    if (!ok) {
      violations.push({
        relation: 'circle-side',
        ids: [cmd.id, cmd.circle],
        message: `${cmd.id} should lie ${cmd.side} ${circleLabel(cmd.circle)} (radius ${c.r.toFixed(2)}) but is ${d.toFixed(2)} from its centre`,
        messageKey: cmd.side === 'outside' ? 'figure.v.outsideCircle' : 'figure.v.insideCircle',
        params: { point: cmd.id, circle: circleName(cmd.circle), radius: c.r.toFixed(2), dist: d.toFixed(2) },
      });
    }
  }

  // Two circles' stated MUTUAL POSITION (#196 — «שני מעגלים זרים» disjoint / «מעגל O2 מוכל בתוך מעגל O1»
  // contained): a strict-inequality REQUIREMENT in the ADR-244 radius-order shape. The centres and radii
  // are free DOFs, so a sampled config can violate it — `meetsRequirements` gates on a clean verifier, so
  // the sampler / "show another configuration" skips such configs; a genuinely contradicted position (the
  // circles pinned/sized so the relation cannot hold) surfaces amber here.
  for (const cmd of commands) {
    if (cmd.type !== 'set-circle-position') continue;
    if (cmd.relation === 'any') continue; // bare «שני מעגלים» — nothing stated, every case valid (#196 Am.)
    const a = circles.get(cmd.a);
    const b = circles.get(cmd.b);
    if (!a || !b) continue;
    const d = dist(a.center, b.center);
    const tol = Math.max(0.05, 0.02 * (a.r + b.r));
    if (cmd.relation === 'disjoint') {
      if (d <= a.r + b.r + tol) {
        violations.push({
          relation: 'circles-disjoint',
          ids: [cmd.a, cmd.b],
          message: `${circleLabel(cmd.a)} and ${circleLabel(cmd.b)} should be disjoint (centre gap ${d.toFixed(2)} ≤ r₁+r₂ = ${(a.r + b.r).toFixed(2)})`,
          messageKey: 'figure.v.circlesDisjoint',
          params: { c1: circleName(cmd.a), c2: circleName(cmd.b), d: d.toFixed(2), sum: (a.r + b.r).toFixed(2) },
        });
      }
    } else if (d + b.r >= a.r - tol) {
      violations.push({
        relation: 'circle-contained',
        ids: [cmd.a, cmd.b],
        message: `${circleLabel(cmd.b)} should lie strictly inside ${circleLabel(cmd.a)} (centre gap ${d.toFixed(2)} + r = ${(d + b.r).toFixed(2)} ≥ R = ${a.r.toFixed(2)})`,
        messageKey: 'figure.v.circleContained',
        params: { inner: circleName(cmd.b), outer: circleName(cmd.a), reach: (d + b.r).toFixed(2), ro: a.r.toFixed(2) },
      });
    }
  }

  // A COMMON tangent's stated KIND (#197 — «משיק משותף חיצוני/פנימי»): external ⇔ both centres on the
  // SAME side of the tangent line, internal ⇔ opposite sides — and the repetition distinctness (a second
  // «משיק משותף חיצוני» must be the OTHER tangent, never the first one again, the #142 pattern). Both are
  // requirements: the touch riders are driven DOFs whose basin a sampled seed picks, so meetsRequirements
  // gates which basins may be shown; a genuinely stuck configuration surfaces amber here.
  for (const cmd of commands) {
    if (cmd.type !== 'common-tangent') continue;
    const a = positions.get(cmd.a);
    const b = positions.get(cmd.b);
    const c1 = circles.get(cmd.circle1);
    const c2 = circles.get(cmd.circle2);
    if (!a || !b || !c1 || !c2) continue;
    if (cmd.kind) {
      const len = dist(a, b);
      if (len < 1e-9) continue; // collapsed tangent — pointsDistinct / the avoid check owns this
      const side = (p: Vec): number => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
      const s1 = side(c1.center);
      const s2 = side(c2.center);
      const tol = 0.02 * Math.max(c1.r, c2.r);
      const ok = cmd.kind === 'external' ? s1 * s2 > 0 && Math.abs(s1) > tol && Math.abs(s2) > tol : s1 * s2 < 0 && Math.abs(s1) > tol && Math.abs(s2) > tol;
      if (!ok) {
        violations.push({
          relation: 'tangent-kind',
          ids: [cmd.a, cmd.b, cmd.circle1, cmd.circle2],
          message: `the common tangent ${cmd.a}${cmd.b} should be ${cmd.kind} (centres on ${cmd.kind === 'external' ? 'the same side' : 'opposite sides'} of it)`,
          messageKey: cmd.kind === 'external' ? 'figure.v.tangentExternal' : 'figure.v.tangentInternal',
          params: { a: cmd.a, b: cmd.b, c1: circleName(cmd.circle1), c2: circleName(cmd.circle2) },
        });
      }
    }
    for (const avoidId of cmd.avoid ?? []) {
      const q = positions.get(avoidId);
      if (!q) continue;
      const tol = Math.max(0.15, 0.1 * Math.max(c1.r, c2.r));
      if (dist(a, q) < tol || dist(b, q) < tol) {
        violations.push({
          relation: 'tangent-distinct',
          ids: [cmd.a, cmd.b, avoidId],
          message: `the repeated common tangent ${cmd.a}${cmd.b} coincides with the one already drawn at ${avoidId}`,
          messageKey: 'figure.v.tangentDistinct',
          params: { a: cmd.a, b: cmd.b, prior: avoidId },
        });
        break;
      }
    }
  }

  // A stated RADIUS RATIO between two circles ("R = 1.5r" / "R/r = 2√7/5", issue #54): checked directly
  // against the RESOLVED radii (the witnesses the apply lowering used are an implementation detail this
  // re-derivation must not depend on — the ADR-053 independence principle).
  for (const cmd of commands) {
    if (cmd.type !== 'set-radius-ratio') continue;
    const a = circles.get(cmd.c1);
    const b = circles.get(cmd.c2);
    if (!a || !b) continue;
    const want = cmd.k * b.r;
    if (Math.abs(a.r - want) > Math.max(0.02, 0.02 * Math.max(a.r, want))) {
      violations.push({
        relation: 'radius-ratio',
        ids: [cmd.c1, cmd.c2],
        message: `radius of ${circleLabel(cmd.c1)} (${a.r.toFixed(2)}) should be ${cmd.k} × radius of ${circleLabel(cmd.c2)} (${b.r.toFixed(2)})`,
        messageKey: 'figure.v.radiusRatio',
        params: { c1: circleName(cmd.c1), c2: circleName(cmd.c2), k: String(cmd.k), r1: a.r.toFixed(2), r2: b.r.toFixed(2) },
      });
    }
  }

  // A stated POLYGON-region side ("E … בתוך המשולש KAO", issue #99 — the ADR-254 circle-side family,
  // polygon edition): the point must lie strictly on its stated side of the region in every shown config.
  // Same requirement discipline: `meetsRequirements` gates on a clean verifier, so the sampler /
  // "show another configuration" skips wrong-side configs; a genuinely contradicted side (the point
  // pinned/derived onto the other side) surfaces amber here.
  for (const cmd of commands) {
    if (cmd.type !== 'point-polygon-side') continue;
    const p = positions.get(cmd.id);
    const verts = cmd.poly.map((v) => positions.get(v));
    if (!p || verts.some((v) => v === undefined)) continue; // a ref isn't placed — a different failure mode
    const vs = verts as Vec[];
    const cx = vs.reduce((s, v) => s + v.x, 0) / vs.length;
    const cy = vs.reduce((s, v) => s + v.y, 0) / vs.length;
    const rspan = Math.max(...vs.map((v) => dist(v, { x: cx, y: cy })));
    const ok = cmd.side === 'inside' ? pointInPolygon(p, vs, rspan * 0.01) : !pointInPolygon(p, vs);
    if (!ok) {
      const polyName = cmd.poly.join('');
      violations.push({
        relation: 'region-side',
        ids: [cmd.id, ...cmd.poly],
        message: `${cmd.id} should lie ${cmd.side} ${polyName}`,
        messageKey: cmd.side === 'outside' ? 'figure.v.outsideRegion' : 'figure.v.insideRegion',
        params: { point: cmd.id, poly: polyName },
      });
    }
  }

  // Every metric / incidence relation the commands assert (distance, angle, equal, ratio, ∥, ⟂, collinear,
  // concyclic, …) — checked against the final coordinates with the engine's own `isSatisfied` tolerance,
  // so a relation the solver accepted passes and only a genuinely-off (silently dropped, mis-built, or
  // later-perturbed) one is flagged. (ADR-053, extended past on-circle membership.)
  for (const con of assertedRelations(commands)) {
    const refs = constraintRefs(con);
    if (refs.some((id) => !positions.has(id))) continue; // a ref isn't placed — a different failure mode
    const get = (id: Id) => positions.get(id)!;
    const r = residual(con, get);
    if (!Number.isFinite(r)) continue; // a degenerate config (collapsed ray/circle) — NaN, not a measurable miss
    if (!isSatisfied(con, get)) {
      violations.push({ relation: con.type, ids: refs, message: `${describeConstraint(con)} does not hold in the final figure`, messageKey: 'figure.v.constraint', params: { desc: describeConstraint(con) } });
    }
  }

  // A declared TRAPEZOID's identity is "exactly ONE pair of opposite sides is parallel" — its legs must NOT
  // become parallel. A later constraint (e.g. "∠ABC = 90" on a right trapezoid that already has ∠A = ∠D = 90)
  // can force the second pair parallel, silently turning the trapezoid into a parallelogram/rectangle. The
  // figure is geometrically valid, so we don't refuse it ([ADR-157](docs/06-decisions.md#adr-157) is about
  // re-declaring a different shape WORD); instead we flag it amber so the student sees the declared trapezoid
  // is no longer one. (A genuine trapezoid keeps its legs clearly non-parallel, so this never false-fires.)
  for (const cmd of commands) {
    if (cmd.type !== 'trapezoid') continue;
    const [a, b, c, d] = cmd.ids.map((id) => positions.get(id));
    if (!a || !b || !c || !d) continue;
    const par = (p: Vec, q: Vec, r: Vec, s: Vec) => {
      const ux = q.x - p.x, uy = q.y - p.y, vx = s.x - r.x, vy = s.y - r.y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < 1e-9 || lv < 1e-9) return false;
      return Math.abs(ux * vy - uy * vx) / (lu * lv) < Math.sin((Math.PI / 180) * 1); // within ~1°
    };
    if (par(a, b, c, d) && par(b, c, d, a)) {
      const quad = cmd.ids.join('');
      violations.push({
        relation: 'parallel',
        ids: cmd.ids,
        message: `${quad} was declared a trapezoid but both pairs of opposite sides are now parallel — it is no longer a trapezoid`,
        messageKey: 'figure.v.trapezoidMorph',
        params: { quad },
      });
    }
  }

  // An `extend-onto-circle` ("המשך AB onto the circle at C") asserts a DIRECTIONAL extension: the new
  // point lies BEYOND the second endpoint (order a→b→id), not between a and b. Unlike the generic order
  // SELECTORS above (which only pick a "visibly smaller" gap), the direction here is a HARD given — the
  // student said "המשך"/extend — so a figure where the new point fell on the NEAR side is genuinely wrong
  // and must be flagged, even when every step applied ok. (This happens when the apex is outside the
  // target circle, so the line's far crossing IS the shared endpoint and the only "other" crossing sits
  // between the apex and the endpoint — the figure is satisfiable only at a DIFFERENT placement of the
  // upstream free DOF, which the sampler/auto-seed must find. ADR-098.)
  for (const cmd of commands) {
    if (cmd.type !== 'extend-onto-circle') continue;
    const a = positions.get(cmd.a);
    const b = positions.get(cmd.b);
    const id = positions.get(cmd.id);
    if (!a || !b || !id) continue;
    // SHARED-ENDPOINT ([ADR-142](docs/06-decisions.md#adr-142)): when a line endpoint already lies on the
    // target circle, the line meets the circle at that endpoint AND exactly ONE other point, so the extension
    // SIDE is forced by the geometry — not by the letter order. A reversed "המשך BD" vs "DB" then describes
    // the SAME unique crossing, so accept the new point on EITHER extension; flag only one genuinely BETWEEN
    // a and b. A NEITHER-on-circle extension is genuinely directional (a driven far crossing) → keep strict.
    const c = circles.get(cmd.circle);
    const onCirc = (p: Vec) => !!c && Math.abs(dist(p, c.center) - c.r) <= onCircleTol(c.r);
    const ab2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = ab2 < 1e-18 ? 0.5 : ((id.x - a.x) * (b.x - a.x) + (id.y - a.y) * (b.y - a.y)) / ab2; // id's param on a→b
    const wrong = onCirc(a) || onCirc(b) ? t > 0.001 && t < 0.999 : t <= 1; // shared: between is wrong; else: must be beyond b
    if (wrong) {
      violations.push({
        relation: 'collinear-order',
        ids: [cmd.a, cmd.b, cmd.id],
        message: `${cmd.id} should lie on the extension of ${cmd.a}${cmd.b} beyond ${cmd.b}, but it landed between ${cmd.a} and ${cmd.b}`,
        messageKey: 'figure.v.orderBeyond',
        params: { id: cmd.id, seg: `${cmd.a}${cmd.b}`, a: cmd.a, b: cmd.b },
      });
    }
  }

  // A plain SEGMENT meet — "AE and BF meet at G", no "המשך"/"הישר" (`onSeg`) — asserts the crossing lies
  // WITHIN both segments, not on their continuation ([ADR-166](docs/06-decisions.md#adr-166), the operator's
  // rule). When an apex points the wrong way the segments diverge and the infinite-line crossing lands on the
  // backward/forward extension — the figure builds clean but is the wrong configuration. The sampler reflects
  // the apex to fix it; if no valid config is found, flag it amber here. Tolerance is LOOSE (a crossing just
  // past an endpoint isn't flagged — only one genuinely off the segment), mirroring the extension check.
  for (const cmd of commands) {
    if (cmd.type !== 'line-line-intersection' || !(cmd.onSeg || cmd.onSeg1 || cmd.onSeg2)) continue;
    const g = positions.get(cmd.id);
    const param = (a: Id, b: Id): number | null => {
      const pa = positions.get(a), pb = positions.get(b);
      if (!pa || !pb || !g) return null;
      const abx = pb.x - pa.x, aby = pb.y - pa.y, L = abx * abx + aby * aby;
      return L < 1e-12 ? null : ((g.x - pa.x) * abx + (g.y - pa.y) * aby) / L;
    };
    // Per-operand (issue #22): only a BARE operand asserts "within" — joint `onSeg` asserts both.
    const t1 = cmd.onSeg || cmd.onSeg1 ? param(cmd.a, cmd.b) : null;
    const t2 = cmd.onSeg || cmd.onSeg2 ? param(cmd.c, cmd.d) : null;
    const off = (t: number | null) => t !== null && (t < -0.02 || t > 1.02);
    const seg = off(t1) ? `${cmd.a}${cmd.b}` : off(t2) ? `${cmd.c}${cmd.d}` : null;
    if (seg) {
      violations.push({
        relation: 'collinear-order',
        ids: [cmd.id, cmd.a, cmd.b, cmd.c, cmd.d],
        message: `${cmd.id} should lie where segments ${cmd.a}${cmd.b} and ${cmd.c}${cmd.d} cross, but the crossing is on the continuation of ${seg}, not on the segment`,
        messageKey: 'figure.v.meetOnSegment',
        params: { id: cmd.id, seg1: `${cmd.a}${cmd.b}`, seg2: `${cmd.c}${cmd.d}` },
      });
    }
  }

  // `line ABE…` (`set-line`) asserts the named points are COLLINEAR (its ordering is a soft selector,
  // not re-checked). Flag an interior point that sits clearly off the line through the two ends.
  for (const cmd of commands) {
    if (cmd.type !== 'set-line') continue;
    const pts = cmd.points;
    if (pts.some((id) => !positions.has(id))) continue;
    const p0 = positions.get(pts[0])!;
    const pn = positions.get(pts[pts.length - 1])!;
    const span = dist(p0, pn);
    if (span < 1e-9) continue;
    for (let i = 1; i < pts.length - 1; i++) {
      const pi = positions.get(pts[i])!;
      const offset = Math.abs((pi.x - p0.x) * (pn.y - p0.y) - (pi.y - p0.y) * (pn.x - p0.x)) / span;
      if (offset > Math.max(0.05, 0.02 * span)) {
        violations.push({
          relation: 'collinear',
          ids: pts,
          message: `${pts.join('–')} should be collinear, but ${pts[i]} is ${offset.toFixed(2)} off the line`,
          messageKey: 'figure.v.collinear',
          params: { pts: pts.join('–'), point: pts[i], offset: offset.toFixed(2) },
        });
      }
    }
  }

  // A `point-on-segment` asserts membership: the point lies ON its segment BETWEEN the endpoints
  // (t∈[0,1]), or — for a stated EXTENSION ("D on the extension of AB", t>1) — BEYOND the second
  // endpoint. This is the backstop for the whole "a driven DOF slid out of its geometric domain"
  // class ([ADR-194](docs/06-decisions.md#adr-194)): a dual-root distance/ratio can drive an
  // on-segment point onto the external division (t<0), off the segment, and the figure would look
  // clean. On-circle membership was already verified here; on-segment was the gap that let ADR-194
  // slide through silently. Tolerance is LOOSE (a point just past an endpoint isn't flagged — only
  // one genuinely off), mirroring the meet/extension checks; a point on the segment's LINE but off
  // its span, OR off the line entirely (a redefinition that no-op'd the membership), both trip it.
  //
  // Only the point's OPERATIVE (last) definition is checked: a point declared on a segment/extension
  // and then REDEFINED by a later command ("E on the extension of AC" then "E on circle P", which
  // supersedes the placement) is verified against its real definition (the on-circle check above),
  // not the stale on-segment one. A command "defines" a point when it OUTPUTS it under an `id` (or
  // the diameter's `id1`/`id2`) — a placement. A shape's `ids` tuple is a REFERENCE list, never a
  // placement: a polygon drawn THROUGH an existing on-segment point only wires edges (apply's
  // polyEdges), so it must NOT supersede the membership — counting it did, and silently disabled
  // this backstop for any point a later triangle/quad named (review 2026-07-03, E1). A CONSTRAINT
  // that merely references the point (set-ratio/∥ driving it, the ADR-194 case) doesn't define
  // either — so a genuinely-drifted driven point is still caught.
  const lastDef = new Map<Id, number>();
  commands.forEach((c, i) => {
    const anyC = c as Record<string, unknown>;
    for (const f of ['id', 'id1', 'id2']) if (typeof anyC[f] === 'string') lastDef.set(anyC[f] as Id, i);
  });
  for (let ci = 0; ci < commands.length; ci++) {
    const cmd = commands[ci];
    if (cmd.type !== 'point-on-segment') continue;
    if (lastDef.get(cmd.id) !== ci) continue; // superseded by a later definition of the same point
    const pa = positions.get(cmd.a), pb = positions.get(cmd.b), p = positions.get(cmd.id);
    if (!pa || !pb || !p) continue;
    const abx = pb.x - pa.x, aby = pb.y - pa.y;
    const L2 = abx * abx + aby * aby;
    if (L2 < 1e-12) continue; // degenerate segment (endpoints coincide) — a different failure mode
    const span = Math.sqrt(L2);
    const t = ((p.x - pa.x) * abx + (p.y - pa.y) * aby) / L2;
    const offLine = Math.abs((p.x - pa.x) * aby - (p.y - pa.y) * abx) / span; // ⟂ distance to the line
    const tol = Math.max(0.05, 0.02 * span);
    const seg = `${cmd.a}${cmd.b}`;
    if (cmd.extension) {
      // Beyond b (t≥1): flag only if it fell within/before the segment — reuse the "should be beyond" message.
      if (offLine <= tol && t < 0.98) {
        violations.push({
          relation: 'collinear-order',
          ids: [cmd.id, cmd.a, cmd.b],
          message: `${cmd.id} should lie on the extension of ${seg} beyond ${cmd.b}, but it landed between ${cmd.a} and ${cmd.b}`,
          messageKey: 'figure.v.orderBeyond',
          params: { id: cmd.id, seg, a: cmd.a, b: cmd.b },
        });
      }
    } else if (offLine > tol || t < -0.02 || t > 1.02) {
      // Off the line entirely (a dropped membership) OR on the line but past an endpoint (a domain escape).
      violations.push({
        relation: 'collinear',
        ids: [cmd.id, cmd.a, cmd.b],
        message: `${cmd.id} should lie on segment ${seg} but landed off it (outside its endpoints)`,
        messageKey: 'figure.v.onSegment',
        params: { point: cmd.id, seg },
      });
    }
  }

  return violations;
}
