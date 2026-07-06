/**
 * The figure → parser context builder — the SINGLE source of truth for what the app tells the parser
 * about the current figure ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md) A3 / TST-2).
 *
 * This was re-implemented three times (App's `parseCtx`, scenarios' `ctxOf`, the triage harness's
 * `ctxFrom`) and the copies drifted: the triage mirror was missing `parallels` (ADR-169), so it
 * misclassified every trapezoid-altitude utterance as a coverage gap — a false signal in the exact tool
 * built to find real gaps. One builder here, imported by all three, prevents that whole drift class.
 *
 * Pure: derives the context from an already-computed figure (construction + positions), so the caller
 * reuses one `replay` for both the context and its own `before` figure.
 */

import type { Construction, Id, Vec } from '@/engine';
import { isGeoPoint, circleMembers, pointNeighbors, parallelEdgePairs } from '@/engine';
import type { ParseContext } from './parse';

export function buildParseCtx(construction: Construction, positions: Map<Id, Vec>): ParseContext {
  return {
    // Exclude pure SCAFFOLDING circles (a tangent's Thales aux), marked by a `~`-prefixed centre — the
    // student never references them, so they must not make "the circle" / "chord CE" ambiguous.
    // DEDUPED per centre letter (ADR-244): a concentric pair is ONE referenceable centre — "the circle" /
    // an unnamed chord still resolves to it, and the concentric post-pass (qualifier / membership /
    // clarify) decides WHICH of the pair. Two distinct centres stay two entries, as before.
    circles: [...new Set(construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])))],
    // Concentric pairs (ADR-244): the bound roles, read off the inner circle's `innerOf` marker.
    concentric: construction.objects.flatMap((o) =>
      o.kind === 'circle' && o.innerOf ? [{ center: o.center, outer: o.innerOf, inner: o.id }] : [],
    ),
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
    circleMembers: circleMembers(construction), // "arc BC" resolves to the circle holding both B and C
    neighbors: pointNeighbors(construction), // a single-vertex angle ("∠C קהה/חדה") finds its two arms
    onSegment: Object.fromEntries(
      construction.objects.flatMap((o) => (o.kind === 'on-segment' ? [[o.id, [o.a, o.b]] as [Id, [Id, Id]]] : [])),
    ), // which side a free point rides — lets a base-less midsegment (ADR-199) resolve E's host side
    midpointOf: Object.fromEntries(
      construction.objects.flatMap((o) => (o.kind === 'midpoint' ? [[o.id, [o.a, o.b]] as [Id, [Id, Id]]] : [])),
    ), // which side an existing midpoint bisects — lets a base-less named midsegment anchor on it (ADR-199 Am.)
    parallels: parallelEdgePairs(construction, positions), // "height from C" drops to a trapezoid's opposite base (ADR-169)
    lines: construction.objects.flatMap((o) => (o.kind === 'line' ? [o.id] : [])), // idempotent construct reuse
    polygons: construction.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])), // definite "the quad" binds to the existing one
  };
}
