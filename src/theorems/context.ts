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
 * Tangencies in the figure, read STRUCTURALLY (no coordinates). Two construction paths produce a
 * tangent, and this unifies them:
 *  1. a first-class `tangent` line spec (`{via:'tangent', circle, at}`) — the named / on-existing-line
 *     tangency, and the two-tangents-meet / incircle scaffolding;
 *  2. the "tangent from an external point" construction — a HIDDEN through-circle (the Thales circle on
 *     the centre–external diameter) whose `radius.point` is the target circle's centre, intersected with
 *     the target (`circle-circle`). That intersection point IS the tangency point.
 * The second is a genuine geometric fingerprint (a Thales circle through the centre), not an id-prefix
 * hack, so it stays correct across renamings and phrasings.
 */
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
  const circles = circleMembers(construction).map((cm) => {
    const obj = circleObjs.find((o) => o.center === cm.center);
    return {
      id: obj?.id ?? `circle-${cm.center}`,
      center: cm.center,
      members: cm.points,
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
