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
    circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])),
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
    circleMembers: circleMembers(construction), // "arc BC" resolves to the circle holding both B and C
    neighbors: pointNeighbors(construction), // a single-vertex angle ("∠C קהה/חדה") finds its two arms
    parallels: parallelEdgePairs(construction, positions), // "height from C" drops to a trapezoid's opposite base (ADR-169)
    lines: construction.objects.flatMap((o) => (o.kind === 'line' ? [o.id] : [])), // idempotent construct reuse
  };
}
