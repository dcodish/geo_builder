/**
 * Build the {@link MatchCtx} — every premise-side signal precomputed once per detect run.
 * Symbolic only: reads the fact list, the dependency graph, and the caller-supplied detected shapes.
 * No `replay`/`evaluate`/coordinates (plan §7.5).
 */

import type { Circle, Construction, Id, Line } from '../engine/types';
import { circleMembers, pointNeighbors } from '../engine/step';
import { groupKey, type Fact } from '../store/geoStore';
import type { DetectedShape } from '../engine/detectShapes';
import type { MatchCtx } from './types';

/**
 * Tangencies in the figure, read STRUCTURALLY (no coordinates). Three construction paths produce a
 * tangent, and this unifies them:
 *  1. a first-class `tangent` line spec (`{via:'tangent', circle, at}`) — the named / on-existing-line
 *     tangency, and the two-tangents-meet / incircle scaffolding;
 *  2. the "tangent from an external point" construction — a HIDDEN through-circle (the Thales circle on
 *     the centre–external diameter) whose `radius.point` is the target circle's centre, intersected with
 *     the target (`circle-circle`). That intersection point IS the tangency point.
 *  3. a tangency stated AGAINST AN EXISTING point/line, which lowers to a radius-⟂ CONSTRAINT
 *     (ADR-075/115/233: `perpendicular` with one segment = centre→T where T lies on that circle, the
 *     other = the tangent line through T). This was the T1 wiring's "tangent bundle misses on
 *     B4/B9/B19" gap (ADR-244): the whole 105/107/108/109 family read only paths 1–2.
 * Each is a genuine geometric fingerprint (a Thales circle through the centre; a radius-⟂ at an
 * on-circle point), not an id-prefix hack, so they stay correct across renamings and phrasings.
 */
/**
 * Circle membership including `concyclic`-CONSTRAINT members (ADR-243): a constraint sharing ≥3
 * points with a circle's structural members ties to it and contributes the rest. Keyed by circle id.
 * Shared by the ctx.circles build and the tangency fingerprint (path 3 below).
 */
function enrichedCircleMembers(c: Construction): Map<Id, Set<Id>> {
  const memberSets = new Map<Id, Set<Id>>();
  for (const cm of circleMembers(c)) {
    const obj = c.objects.find((o) => o.kind === 'circle' && o.center === cm.center);
    if (obj) memberSets.set(obj.id, new Set(cm.points));
  }
  for (const con of c.constraints) {
    if (con.type !== 'concyclic') continue;
    for (const set of memberSets.values()) {
      if (con.points.filter((p) => set.has(p)).length >= 3) for (const p of con.points) set.add(p);
    }
  }
  return memberSets;
}

export function tangentPoints(c: Construction): { circle: Id; at: Id; from?: Id }[] {
  const out: { circle: Id; at: Id; from?: Id }[] = [];
  const circles = new Map(c.objects.filter((o): o is Circle => o.kind === 'circle').map((o) => [o.id, o]));

  for (const o of c.objects) {
    if (o.kind === 'line' && (o as Line).spec.via === 'tangent') {
      const spec = (o as Line).spec as { via: 'tangent'; circle: Id; at: Id };
      out.push({ circle: spec.circle, at: spec.at });
    } else if (o.kind === 'circle-circle') {
      // A Thales aux circle passes through the OTHER circle's centre ⇒ the crossing is a tangency point.
      const c1 = circles.get(o.circle1);
      const c2 = circles.get(o.circle2);
      const aux = (target?: Circle, other?: Circle) =>
        other && other.hidden && other.radius.via === 'through' && target && other.radius.point === target.center
          ? { circle: target.id, at: o.id, from: undefined as Id | undefined }
          : null;
      const hit = aux(c1, c2) ?? aux(c2, c1);
      if (hit) out.push(hit);
    }
  }

  // Path 3 — the radius-⟂ tangency constraint. One side of the ⟂ is centre→T with T ON that circle;
  // the other side is the tangent line: either T itself is one of its endpoints (the "from N two
  // tangents at M and B" lowering — `from` is the far endpoint), or T is an ON-SEGMENT marker riding
  // it (the ADR-075 "AB tangent to circle P at F" form, F placed on AB). Membership must be the
  // ENRICHED set (concyclic constraints included) — B19's touch point F is a member only via its
  // quad's `set-concyclic`.
  const memberSets = enrichedCircleMembers(c);
  const onSegmentOf = (p: Id, x: Id, y: Id): boolean => {
    const o = c.objects.find((ob) => ob.id === p);
    if (!o) return false;
    if (o.kind === 'on-segment' || o.kind === 'on-segment-solved') {
      const os = o as { a: Id; b: Id };
      return (os.a === x && os.b === y) || (os.a === y && os.b === x);
    }
    return false;
  };
  // The ⟂ may live in the constraints list OR be EMBEDDED as a point's driving constraint (an
  // `on-segment-solved` touch point like B19's F carries its perpendicular inside the object) or a
  // solve directive — collect every form.
  const perps: { a: Id; b: Id; c: Id; d: Id }[] = c.constraints.filter(
    (k): k is Extract<(typeof c.constraints)[number], { type: 'perpendicular' }> => k.type === 'perpendicular',
  );
  for (const o of c.objects) {
    const embedded = [
      (o as { constraint?: { type: string } }).constraint,
      (o as { solve?: { constraint: { type: string }; also?: { type: string }[] } }).solve?.constraint,
      ...((o as { solve?: { also?: { type: string }[] } }).solve?.also ?? []),
    ];
    for (const k of embedded) {
      if (k && k.type === 'perpendicular') perps.push(k as unknown as { a: Id; b: Id; c: Id; d: Id });
    }
  }
  for (const con of perps) {
    // Try both orientations: (a,b) the radius, (c,d) the tangent — and swapped.
    const sides: [Id, Id, Id, Id][] = [
      [con.a, con.b, con.c, con.d],
      [con.c, con.d, con.a, con.b],
    ];
    for (const [ra, rb, ta, tb] of sides) {
      const circ = [...circles.values()].find((k) => k.center === ra && memberSets.get(k.id)?.has(rb));
      if (!circ) continue;
      if (rb === ta || rb === tb) {
        const from = rb === ta ? tb : ta;
        if (!out.some((t) => t.circle === circ.id && t.at === rb && t.from === from)) out.push({ circle: circ.id, at: rb, from });
        break;
      }
      if (onSegmentOf(rb, ta, tb)) {
        if (!out.some((t) => t.circle === circ.id && t.at === rb)) out.push({ circle: circ.id, at: rb });
        break;
      }
    }
  }
  return out;
}

export function buildMatchCtx(
  facts: Fact[],
  construction: Construction,
  shapes: DetectedShape[] = [],
): MatchCtx {
  const enabled = facts.filter((f) => f.enabled);

  // Circles: centre + stated on-circle members (`circleMembers`), enriched with the circle object's
  // id/hidden flag so a cyclic (hidden) circle still counts for the concyclic-quad trigger (87).
  const circleObjs = construction.objects.filter((o): o is Circle => o.kind === 'circle');
  const enriched = enrichedCircleMembers(construction);
  const circles = circleMembers(construction).map((cm) => {
    const obj = circleObjs.find((o) => o.center === cm.center);
    const id = obj?.id ?? `circle-${cm.center}`;
    // Members are the ENRICHED set: a `concyclic` CONSTRAINT is stated membership with no
    // object-graph edge ("quadrilateral EABF inscribed in circle M" lowers to circumcircle(3
    // points) + set-concyclic(4)) — without it the 87 matcher never saw a complete quad (ADR-243;
    // the T1 wiring's widest evidence gap — 8 B-questions). Symbolic, not sampled.
    return {
      id,
      center: cm.center,
      members: [...(enriched.get(id) ?? new Set(cm.points))],
      hidden: !!obj?.hidden,
      autoCenter: !!obj?.autoCenter,
    };
  });

  const lastGroup = enabled.length ? groupKey(enabled[enabled.length - 1]) : null;

  return {
    facts: enabled,
    construction,
    shapes,
    lastGroup,
    circles,
    neighbors: pointNeighbors(construction),
    tangents: tangentPoints(construction),
  };
}
