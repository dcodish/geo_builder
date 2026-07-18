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

/** A circle centre's reference TOKEN ([ADR-342](../../docs/06-decisions.md#adr-342)): an anonymous auto
 *  centre ('@ctr-O') is referenced by its letter ('O' — the circle's name, «מעגל O», `circle-O`), while a
 *  student-named centre IS its letter. Keeps every ctx consumer letter-based; the `centrePoint` map below
 *  carries the translation back to the real point id for rules that use a centre AS A POINT. */
const ctrToken = (centerId: string): string => (centerId.startsWith('@ctr-') ? centerId.slice(5) : centerId);

export function buildParseCtx(construction: Construction, positions: Map<Id, Vec>): ParseContext {
  return {
    // Exclude pure SCAFFOLDING circles (a tangent's Thales aux), marked by a `~`-prefixed centre — the
    // student never references them, so they must not make "the circle" / "chord CE" ambiguous.
    // DEDUPED per centre letter (ADR-244): a concentric pair is ONE referenceable centre — "the circle" /
    // an unnamed chord still resolves to it, and the concentric post-pass (qualifier / membership /
    // clarify) decides WHICH of the pair. Two distinct centres stay two entries, as before.
    circles: [...new Set(construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [ctrToken(o.center)] : [])))],
    // Centre TOKEN → the centre's real POINT id (ADR-342): identity for named centres, '@ctr-…' for
    // anonymous auto centres — the translation rules use when a centre serves AS A POINT.
    centrePoint: Object.fromEntries(
      construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [[ctrToken(o.center), o.center] as [Id, Id]] : [])),
    ),
    // Centre letters that were AUTO-assigned (unnamed circle → hidden centre): «מרכז המעגל הוא P» renames
    // one of these to the student's letter instead of minting a second circle (issue #112).
    autoCenters: construction.objects.flatMap((o) => (o.kind === 'circle' && o.autoCenter && !o.center.startsWith('~') ? [ctrToken(o.center)] : [])),
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
    tangentAuxes: construction.objects.flatMap((o) => (o.kind === 'circle' && o.id.startsWith('tanaux-') ? [o.id] : [])), // existing Thales tangent-aux circles — a 2nd single tangent from the SAME apex takes the OTHER branch (issue #142)
    polygons: construction.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])), // definite "the quad" binds to the existing one
    // Existing COMMON tangents per circle pair (#197): touch pairs (A on c1, B on c2) recognised by the
    // paired radius-⟂-tangent constraints the common-tangent lowering emits — a REPEATED «משיק משותף»
    // must take an untaken tangent, so the rule passes these as its `avoid` list.
    commonTangents: (() => {
      const centreOf = new Map(construction.objects.flatMap((o) => (o.kind === 'circle' ? [[o.center, o.id] as [Id, Id]] : [])));
      const out: Record<string, [Id, Id][]> = {};
      const perps = construction.constraints.filter((c) => c.type === 'perpendicular');
      for (const c of perps) {
        if (c.type !== 'perpendicular') continue;
        // The tangent-side pattern: radius (centre→touch) ⟂ (touch→other touch), i.e. b === c and
        // `a` is a circle centre. Pair two such constraints sharing the same segment {c,d}.
        if (c.b !== c.c || !centreOf.has(c.a)) continue; // this ⟂: radius to the touch at the segment's C end
        // The mate: the OTHER end's radius-⟂ on the same segment (b === d there).
        const mate = perps.find(
          (m) => m !== c && m.type === 'perpendicular' && centreOf.has(m.a) && m.c === c.c && m.d === c.d && m.b === m.d,
        );
        if (!mate || mate.type !== 'perpendicular') continue;
        const id1 = centreOf.get(c.a)!;
        const id2 = centreOf.get(mate.a)!;
        if (id1 === id2) continue;
        const key = [id1, id2].sort().join('|');
        const pair: [Id, Id] = id1 <= id2 ? [c.b, mate.b] : [mate.b, c.b];
        (out[key] ??= []).push(pair);
      }
      return out;
    })(),
    radiusSymbols: construction.objects.flatMap((o) =>
      o.kind === 'circle' && o.radiusSymbol ? [{ name: o.radiusSymbol, circle: o.id, center: o.center }] : [],
    ), // "R = 1.5r" / "R > r" resolve each letter to its circle (issue #54)
    radiusOrder: construction.objects.flatMap((o) =>
      o.kind === 'circle' && o.orderedBelow ? [{ outer: o.orderedBelow, inner: o.id }] : [],
    ), // recorded size roles — «המעגל הגדול/הקטן» resolves consistently once assigned (issue #102)
    circleXs: construction.objects.flatMap((o) => {
      // each referenceable centre's drawn x — «המעגל הימני/השמאלי» (the right/left circle, #188) resolves
      // a POINTING gesture against what the student is looking at; dedupe follows `circles` (a concentric
      // pair is ONE referenceable centre).
      if (o.kind !== 'circle' || o.center.startsWith('~')) return [];
      const c = positions.get(o.center);
      return c ? [{ center: ctrToken(o.center), x: c.x }] : [];
    }),
    circleSizes: construction.objects.flatMap((o) => {
      if (o.kind !== 'circle') return [];
      // the circle's CURRENT drawn size (seed base for a free radius; |centre·through| when derivable) —
      // the M4 soft default a first «המעגל הגדול» assignment reads (what the student is looking at)
      const r =
        o.radius.via === 'free' || o.radius.via === 'length'
          ? o.radius.value
          : o.radius.via === 'through'
            ? (() => {
                const c = positions.get(o.center);
                const t = positions.get(o.radius.point);
                return c && t ? Math.hypot(t.x - c.x, t.y - c.y) : null;
              })()
            : null;
      return r !== null && r !== undefined ? [{ id: o.id, center: o.center, r }] : [];
    }),
  };
}
