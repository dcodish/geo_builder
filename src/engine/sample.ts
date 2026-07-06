/**
 * Seeded sampling of a figure's residual freedom (ADR-018 Stage 1).
 *
 * An underdetermined figure has degrees of freedom the student hasn't fixed yet
 * — a shape's defaulted base vertices. "Show another configuration" should draw
 * a *different valid* figure each time, so the student sees "not yet determined"
 * as the figure wanders, and "determined" when it stops (every point pinned or
 * derived). This perturbs only the **non-pinned free points** (a seeded rotation
 * of the free cluster + independent per-point jitter); derived points recompute
 * from their moved parents, so every shape stays structurally valid (a square is
 * still a square — its corners are derived from the base). Pinned points
 * (explicit "point A at …") never move, so freedom shrinks as facts accumulate.
 *
 * Deterministic: the same (construction, seed) always yields the same figure, so
 * replay/undo stay consistent and it is unit-testable. seed 0 = the canonical
 * default (returns the construction unchanged).
 */

import type { Constraint, Construction, FreePoint, Id, OnCirclePoint, OnLinePoint, SolveDirective } from './types';
import { isGeoPoint } from './types';
import { carrierOf, isShapeCarrier } from './carriers';
import { constraintRefs } from './solve';

/**
 * An ORDER/REGION constraint ('angle-order' / 'length-order' / 'collinear-order' / 'angle-acuteness')
 * removes 0 DOF ([ADR-039](docs/06-decisions.md#adr-039); cf. `dofRemoved`): it pins the carrier into a
 * valid REGION, not to a point, so a carrier whose `solve` directive is ONLY such a constraint keeps its
 * full DOF — it is NOT consumed. Such a carrier must stay free/samplable: the order is re-enforced by
 * `evaluate` from the perturbed seed (a perturbation that keeps the order has 0 residual, so the figure
 * still varies WITHIN the region). Treating an order-only `solve` as "driven/fixed" is the ADR-052 smell —
 * a shape DOF the cue counts but the sampler can never move, so the relations layer mistakes the one drawn
 * configuration for a forced one (e.g. an inscribed triangle whose `A,B,E` collinear-order recruited its
 * vertices froze them out of sampling, so every angle read as "definitive").
 */
const isOrderOnlySolve = (o: { solve?: unknown }): boolean => {
  const k = (o as { solve?: { constraint?: Constraint } }).solve?.constraint?.type;
  return k === 'angle-order' || k === 'length-order' || k === 'collinear-order' || k === 'angle-acuteness';
};

/** A carrier's DOF is NOT consumed by a constraint: either undriven, or driven only by an order/region
 *  constraint (which removes 0 DOF). Such a carrier stays free for sampling. */
const notConsumed = (o: { solve?: unknown }): boolean => o.solve === undefined || isOrderOnlySolve(o);

/** A free on-circle vertex the sampler may slide (an arbitrary-angle vertex, not driven/fixed). */
const isFreeOnCircle = (o: { kind: string; free?: boolean; solve?: unknown }): boolean =>
  o.kind === 'on-circle' && !!o.free && notConsumed(o);

/** A free on-segment point the sampler may slide along its segment (no stated ratio, not driven — ADR-052). */
const isFreeOnSegment = (o: { kind: string; free?: boolean; solve?: unknown }): boolean =>
  o.kind === 'on-segment' && !!o.free && notConsumed(o);

/**
 * An EXTENSION on-segment point ("F on the extension of AD", t>1) with no stated distance and not
 * currently driven: its distance beyond the segment is UNSTATED, so it's a free DOF the sampler must
 * vary (ADR-052) — even though it's NOT eagerly driven (the ADR-074 distinction). This closes the
 * ADR-052 smell where such a point was counted by `rawMovableDof` but never sampled (a default
 * masquerading as fixed). A RECRUITED extension point (solve set) is excluded — it's driven, not free.
 */
const isSamplableExtension = (o: { kind: string; extension?: boolean; solve?: unknown }): boolean =>
  o.kind === 'on-segment' && !!(o as { extension?: boolean }).extension && notConsumed(o);

/** A free on-line marker the sampler may slide along its line (not yet driven by a constraint — ADR-036). */
const isFreeOnLine = (o: { kind: string; solve?: unknown }): boolean => o.kind === 'on-line' && notConsumed(o);

/**
 * A PINNED parametric point — on-circle/on-segment whose position is FIXED: an explicit θ/t that is neither
 * a free/samplable DOF nor a samplable extension nor currently driven by a constraint. It is geometrically
 * rigid (like a pinned free point), so it carries NO movable shape DOF ([ADR-112](docs/06-decisions.md#adr-112)) — a regular polygon's
 * equally-spaced corners and an inscribed square's vertices are pinned this way. A DRIVEN parametric point
 * (solve set) is NOT pinned: it still counts 1 raw, balanced by the constraint that drives it.
 */
const isPinnedParam = (o: { kind: string; free?: boolean; solve?: unknown; extension?: boolean }): boolean =>
  (o.kind === 'on-circle' || o.kind === 'on-segment') &&
  o.solve === undefined &&
  !isFreeOnCircle(o) &&
  !isFreeOnSegment(o) &&
  !isSamplableExtension(o);

/**
 * A parametric carrier (on-circle θ / on-segment t) that a CONSUMING constraint drives — an EQUALITY, not an
 * order/region one (order-only is already samplable via `notConsumed`). One scalar equality removes 1 DOF, but
 * the joint solver may RECRUIT several carriers for a single equality (the ADR-136/ADR-138 over-recruitment
 * family), so the recruited set holds residual freedom INVISIBLE to the sampler — every sample is identical and
 * the relations layer reads angles as "definite" that actually vary ([ADR-141](docs/06-decisions.md#adr-141);
 * the confirmed `DE=EF`+`DF=DB` false positives). Perturbing its θ/t while KEEPING the `solve` lets `evaluate`
 * re-solve from a different start: a fully-consumed single carrier just snaps back (harmless on a determined
 * figure); an over-recruited one reaches a genuinely different valid config (correct sampling). This MIRRORS
 * the driven-FREE-POINT perturbation already done in `applySeed` (a 2-DOF point under one scalar constraint
 * keeps residual freedom), extended to the 1-DOF parametric carriers. It cannot introduce a false NEGATIVE:
 * re-solving stays in the valid-config space, so a genuinely-forced relation (true in EVERY valid config) holds.
 */
const isDrivenParam = (o: { kind: string; solve?: unknown }): boolean =>
  (o.kind === 'on-circle' || o.kind === 'on-segment') && o.solve !== undefined && !isOrderOnlySolve(o);

/** mulberry32 — a tiny deterministic PRNG in [0, 1). */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string → a 32-bit seed, so each point jitters independently. */
function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Return a construction with its non-pinned free points perturbed by `seed`.
 * seed 0 returns the input unchanged (the canonical figure). The perturbation
 * keeps every shape valid (only free *parents* move; derived points follow).
 */
export function applySeed(c: Construction, seed: number): Construction {
  if (!seed) return c;
  // A non-pinned free point is perturbed even when a constraint drives it: one scalar constraint
  // under-determines a 2-DOF point, so it keeps residual freedom, and re-solving from the perturbed
  // start yields a DIFFERENT valid configuration (the constraint is re-enforced by `evaluate`).
  const free = c.objects.filter((o): o is FreePoint => o.kind === 'free-point' && !o.pinned);
  const freeCircle = c.objects.filter((o): o is OnCirclePoint => isFreeOnCircle(o));
  const freeLine = c.objects.filter((o): o is OnLinePoint => isFreeOnLine(o));
  const freeShape = c.objects.some((o) => isShapeCarrier(o) && notConsumed(o as { solve?: unknown }));
  if (free.length === 0 && freeCircle.length === 0 && freeLine.length === 0 && !freeShape) return c; // fully determined → nothing to sample

  // Free-point cluster: seeded spin about its centroid + per-point jitter.
  const cx = free.length ? free.reduce((s, p) => s + p.x, 0) / free.length : 0;
  const cy = free.length ? free.reduce((s, p) => s + p.y, 0) / free.length : 0;
  let span = 1;
  for (const p of free) span = Math.max(span, Math.abs(p.x - cx) * 2, Math.abs(p.y - cy) * 2);
  const jit = span * 0.22;
  const theta = (mulberry32((seed * 2654435761) >>> 0)() * 2 - 1) * Math.PI; // ±180° spin of the free cluster
  const ct = Math.cos(theta);
  const st = Math.sin(theta);

  // Free on-circle vertices: a SHARED seeded rotation (preserves their spread, so
  // the inscribed shape never collapses to a sliver) + an independent per-vertex jitter
  // for genuine variety. The jitter width is decided PER POINT by whether the point is a
  // co-vertex of a genuine INSCRIBED POLYGON (a declared polygon with ≥3 free-on-circle
  // vertices, at risk of collapsing to a sliver): such a vertex stays TIGHT (±30°); a free
  // on-circle point that is NOT in one — a lone chord end, a secant's crossing — ranges WIDE
  // (±153°) so it can reshape freely (a short chord, a point on the far arc). A seed that
  // makes two coincide is just skipped by `resample`. Previously the width keyed off the TOTAL
  // count of free on-circle points, so a chord (C,D) plus an unrelated secant point (A) read as
  // "3 → a polygon" and was wrongly pinned tight — the chord could never get short enough to
  // draw a clean tangent/secant figure (the Q4 BKCD case).
  const isFreeOn = (id: Id) => freeCircle.some((fc) => fc.id === id);
  const inscribedPolyVerts = new Set<Id>(); // vertices of a genuine inscribed polygon (≥3 free-on-circle vertices)
  let anyPolyTouchesCircle = false; // does ANY declared polygon include a free on-circle vertex?
  for (const o of c.objects) {
    if (o.kind !== 'polygon') continue;
    const freeOn = o.vertices.filter(isFreeOn);
    if (freeOn.length >= 1) anyPolyTouchesCircle = true;
    if (freeOn.length >= 3) for (const v of freeOn) inscribedPolyVerts.add(v);
  }
  const circSpin = (mulberry32((seed * 0x9e3779b1) >>> 0)() * 2 - 1) * Math.PI;
  // TIGHT (±30°, protect the spread) iff the point is a vertex of a genuine inscribed polygon, OR — when
  // the figure declares NO polygon on the circle at all (no structural grouping to trust) — the legacy
  // fallback: 3+ free on-circle points read as an implicit inscribed cluster. A chord/secant point (e.g.
  // Q4's C,D in trapezoid BKCD — only 2 on-circle vertices — plus a lone secant point A) ranges WIDE
  // (±153°) so the chord can get short enough to draw a clean tangent/secant figure.
  const circJitOf = (id: Id) =>
    inscribedPolyVerts.has(id) || (!anyPolyTouchesCircle && freeCircle.length >= 3) ? Math.PI / 6 : Math.PI * 0.85;

  // How many free on-line markers sit on each line. A LONE marker (e.g. a tangent's single external apex,
  // ADR-084) may flip to EITHER side of the anchor — a fixed side is a fixed assumption (ADR-085); a ±PAIR
  // (a named line "CD": C at +offset, D at −offset) must keep its relative signs so the segment between
  // them keeps straddling the anchor.
  const onLinePerLine = new Map<Id, number>();
  for (const o of c.objects) if (isFreeOnLine(o)) onLinePerLine.set((o as OnLinePoint).line, (onLinePerLine.get((o as OnLinePoint).line) ?? 0) + 1);

  // How many carriers each constraint drives — so a DRIVEN parametric carrier is perturbed (ADR-141) ONLY
  // when its constraint is OVER-RECRUITED (more carriers than the DOF it removes), i.e. the recruited set
  // genuinely holds residual freedom. A constraint with EXACTLY `dofRemoved` carriers is fully consumed —
  // its carrier is determined, so perturbing it would only jump to a different discrete root (the mirror
  // config of an inscribed `|AB|=|AC|`), spuriously reading as "another configuration". Only the residual
  // (over-recruited) carriers carry the hidden freedom the relations layer must sample.
  const carrierCount = new Map<Constraint, number>();
  for (const o of c.objects) {
    const sv = (o as { solve?: { constraint: Constraint } }).solve;
    if (sv) carrierCount.set(sv.constraint, (carrierCount.get(sv.constraint) ?? 0) + 1);
  }
  const isOverRecruited = (o: { kind: string; solve?: unknown }): boolean => {
    const sv = (o as { solve?: { constraint: Constraint } }).solve;
    return !!sv && (carrierCount.get(sv.constraint) ?? 0) > dofRemoved(sv.constraint);
  };
  // Only worth perturbing a driven carrier when the figure is genuinely UNDER-DETERMINED (has residual shape
  // freedom). A figure rigid up to similarity (`freeDofCount` 0) has no hidden freedom — its over-recruited
  // carriers are coupled-solve artefacts (e.g. an angle-ratio's joint carriers), not free DOFs, so perturbing
  // them would only flip to a different discrete root and spuriously read as "another configuration".
  const figUnderDetermined = freeDofCount(c) > 0;

  const objects = c.objects.map((o) => {
    if (o.kind === 'free-point' && !o.pinned) {
      const dx = o.x - cx;
      const dy = o.y - cy;
      const rx = cx + (dx * ct - dy * st);
      const ry = cy + (dx * st + dy * ct);
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, x: rx + (jr() * 2 - 1) * jit, y: ry + (jr() * 2 - 1) * jit };
    }
    // Free on-circle vertex: shared rotation keeps the vertices spread (a valid,
    // non-degenerate inscribed figure); small jitter varies its shape.
    if (isFreeOnCircle(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      // A point ON an arc (between, ADR-042): theta is a fraction in [−1,1] of the arc, so vary it
      // WITHIN the arc rather than spinning around the whole circle.
      if ((o as OnCirclePoint).between) return { ...o, theta: jr() * 2 - 1 };
      return { ...o, theta: (o as OnCirclePoint).theta + circSpin + (jr() * 2 - 1) * circJitOf(o.id) };
    }
    // Free on-segment point (ADR-052): the student gave no ratio, so slide it along the segment to a
    // genuinely different spot (kept off the endpoints so it doesn't collapse onto a or b).
    if (isFreeOnSegment(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, t: 0.15 + jr() * 0.7 }; // t ∈ [0.15, 0.85]
    }
    // Extension point (ADR-052/ADR-074): the distance beyond the segment is unstated, so slide it ALONG
    // the extension — kept past the far end (t > 1) so it stays "on the extension", just a different length.
    if (isSamplableExtension(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, t: 1.15 + jr() * 1.05 }; // t ∈ [1.15, 2.2], still beyond the segment
    }
    // A DRIVEN parametric carrier (equality over-recruitment, ADR-141): perturb its starting θ/t about its
    // CURRENT value and KEEP the `solve`, so `evaluate` re-solves to a DIFFERENT valid config when residual
    // freedom exists, and snaps back when it doesn't. The perturbation is deliberately SMALL (a local jitter,
    // NOT the wide free-vertex spin) so a FULLY-CONSUMED carrier re-solves within the same root basin (it
    // snaps back to the determined value) instead of jumping to a DIFFERENT root — e.g. an inscribed
    // `|AB|=|AC|` whose carrier, perturbed widely, would flip to the mirror config and spuriously read as
    // "another configuration". An over-recruited carrier keeps residual freedom, so even this small nudge —
    // the regulariser re-anchors to the perturbed seed — yields a genuinely different valid drawing.
    if (figUnderDetermined && isDrivenParam(o) && isOverRecruited(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      if (o.kind === 'on-circle') {
        const cur = (o as OnCirclePoint).theta;
        if ((o as OnCirclePoint).between) return { ...o, theta: Math.max(-1, Math.min(1, cur + (jr() * 2 - 1) * 0.4)) };
        return { ...o, theta: cur + (jr() * 2 - 1) * 0.3 }; // ±0.3 rad about the current angle (stays in-basin)
      }
      const seg = o as { t: number; extension?: boolean };
      if (seg.extension) return { ...o, t: Math.max(1.05, seg.t + (jr() * 2 - 1) * 0.4) };
      return { ...o, t: Math.max(0.05, Math.min(0.95, seg.t + (jr() * 2 - 1) * 0.25)) }; // ±0.25 about current t, on-segment
    }
    // Free on-line marker (ADR-036): slide it along its line by scaling the signed offset. A LONE marker may
    // also FLIP sides (ADR-085 — a fixed side is a fixed assumption, ADR-052); a ±PAIR keeps its signs so the
    // segment between them keeps straddling the anchor (a tangent's C at +offset, D at −offset).
    if (isFreeOnLine(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      const mag = 0.4 + jr() * 2; // 0.4×–2.4× the default extent
      const lone = (onLinePerLine.get((o as OnLinePoint).line) ?? 0) <= 1;
      const sign = lone && jr() < 0.5 ? -1 : 1; // a lone marker may sit on either side of the anchor
      return { ...o, offset: (o as OnLinePoint).offset * mag * sign };
    }
    // Free SHAPE-PARAMETER DOFs (ADR-033) — a rhombus's angle, a rectangle/right-triangle's
    // offset, a trapezoid's top ratio. Varying these lets "show another configuration" reach a
    // genuinely different SHAPE (e.g. an obtuse-angled rhombus), not just jiggled points. Skipped
    // when the scalar is CONSUMED by a constraint — but an order-only `solve` leaves it free (region,
    // 0 DOF removed), so the order is re-enforced by `evaluate` from the perturbed seed.
    if (o.kind === 'rotated' && notConsumed(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, angleDeg: 40 + jr() * 100 }; // ∠ ∈ [40°, 140°] — acute OR obtuse at the pivot
    }
    if (o.kind === 'perp-offset' && notConsumed(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, dist: o.dist * (0.55 + jr() * 1.3) }; // 0.55×–1.85× the default extent
    }
    if (o.kind === 'scaled-offset' && notConsumed(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, k: 0.3 + jr() * 0.55 }; // a trapezoid's top:base ratio ∈ [0.3, 0.85]
    }
    // Free-radius circle (ADR-051): vary the size so "show another configuration" reaches a figure with
    // differently-sized circles (including the OTHER one larger). A wide jitter (0.45×–1.6×) so the two
    // circles can swap which is bigger; the resample caller's distinctness guard rejects any draw where the
    // varied sizes push two points together (a near-tangent secant), so only clean alternatives are shown.
    if (o.kind === 'circle' && o.radius.via === 'free' && notConsumed(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, radius: { via: 'free' as const, value: o.radius.value * (0.45 + jr() * 1.15) } };
    }
    return o;
  });
  return { ...c, objects };
}

/**
 * The ids of the figure's SAMPLABLE free DOFs — what "show another configuration" can vary. A
 * non-pinned free point qualifies *even when a constraint drives it* (it keeps residual freedom,
 * so re-solving from a perturbed start gives a different valid drawing); a free on-circle / on-line
 * marker and an *un-driven* shape scalar each qualify. A fully-consumed parametric scalar (a driven
 * on-segment/on-circle carrier, or a driven shape scalar) does NOT — perturbing it is a no-op.
 */
export function freeDofs(c: Construction): Id[] {
  return c.objects
    .filter(
      (o) =>
        (o.kind === 'free-point' && !o.pinned) ||
        isFreeOnCircle(o) ||
        isFreeOnSegment(o) ||
        isSamplableExtension(o) ||
        isFreeOnLine(o) ||
        (isShapeCarrier(o) && notConsumed(o as { solve?: unknown })), // incl. a free-radius circle (ADR-051)
    )
    .map((o) => o.id);
}

/**
 * Reflection alternatives ([ADR-166](docs/06-decisions.md#adr-166)) — the discrete "which side of its base
 * the apex sits" DOF.
 *
 * A free point tied to two anchors by an EQUALITY/DISTANCE (an equilateral/isosceles triangle's apex,
 * equidistant to A and D) has TWO valid placements: the mirror images across the anchor line. The numeric
 * solver only reaches the one nearest its seed, so the OTHER configuration — the one that makes two
 * segments actually cross WITHIN their spans — is unreachable by the continuous sampler alone. This is an
 * unstated discrete DOF (ADR-052), so it must be EXPLORABLE. We encode it in the seed integer's HIGH bits:
 * the low `< REFLECT_STRIDE` part is the continuous sample (today's spin/jitter, unchanged), the high part
 * is a bitmask over {@link reflectableFreePoints} naming which to mirror. seed < REFLECT_STRIDE ⇒ mask 0 ⇒
 * no reflection, so every existing seed and caller is byte-for-byte unchanged; the on-segment resolver
 * deliberately searches mask>0 seeds. (The reflection itself — mirroring the apex's solver-seed across its
 * anchor line, which needs the evaluated anchor positions — lives in the store's `applyReflections`.)
 */
export const REFLECT_MAX = 4; // cap reflectable points at 4 → mask ∈ [0, 15], bounded combinatorics
export const REFLECT_STRIDE = 1 << 20; // continuous base seed occupies [0, 2^20); mask = seed >> 20
export const reflectMaskOf = (seed: number): number => Math.floor(seed / REFLECT_STRIDE);
export const baseSeedOf = (seed: number): number => seed % REFLECT_STRIDE;
export const withReflectMask = (mask: number, base: number): number => mask * REFLECT_STRIDE + base;

/** The distinct points a free point is tied to by an EQUALITY/DISTANCE/RATIO (excluding itself) — the
 *  candidate anchors of its reflection axis. An apex equidistant to A and D yields {A, D}: reflecting the
 *  apex across line AD gives the OTHER valid solution of the symmetric constraint set (the mirror config). */
export function reflectAnchors(c: Construction, pointId: Id): Id[] {
  const refs = new Set<Id>();
  const consider = (con: Constraint) => {
    // A right angle at a shared vertex — seg V→b ⟂ seg V→d, i.e. ∠(b·V·d)=90 (con.a===con.c===V) — is
    // symmetric across the line through the two leg endpoints: reflecting V there gives the OTHER valid
    // right-angle placement (Thales — the mirror arc over the same hypotenuse). So the vertex's reflection
    // anchors are its two leg endpoints (Q8, ADR-223: the shared-hypotenuse right-angle vertex must be
    // flippable to the side where the legs actually cross).
    if (con.type === 'perpendicular') {
      if (con.a === con.c && pointId === con.a) { refs.add(con.b); refs.add(con.d); return; }
      // The LOOSE END of a perpendicular between two DISTINCT segments — seg(a,b) ⟂ seg(c,d) — has a mirror
      // configuration: the OTHER perpendicular ray from its foot. Reflecting the loose end across the OTHER
      // segment's line flips it to that opposite ray (an equally-valid ⟂ placement the continuous solver
      // won't reach from the default seed). So its reflection anchors are the other segment's endpoints
      // (ADR-227: "DF ⟂ AB" where a later on-segment crossing needs segment DF pointing toward it — F must
      // be flippable to the side where AC actually crosses it). The loose end may sit in EITHER slot of its
      // segment — "FD ⟂ AB" is the same statement as "DF ⟂ AB" — so all four slots qualify (the review's F8:
      // slot-positional coverage is a patch smell; the semantic fact is "an endpoint of one segment reflects
      // across the other segment's line").
      if (pointId === con.a || pointId === con.b) { refs.add(con.c); refs.add(con.d); }
      else if (pointId === con.c || pointId === con.d) { refs.add(con.a); refs.add(con.b); }
      return;
    }
    if (con.type !== 'equal' && con.type !== 'distance' && con.type !== 'ratio') return;
    const r = constraintRefs(con);
    if (!r.includes(pointId)) return;
    for (const id of r) if (id !== pointId) refs.add(id);
  };
  for (const con of c.constraints) consider(con);
  for (const o of c.objects) {
    const sv = (o as { solve?: SolveDirective }).solve;
    if (sv) { consider(sv.constraint); for (const k of sv.also ?? []) consider(k); }
  }
  return [...refs];
}

/** Free points with a discrete REFLECTION alternative — a non-pinned free point tied by ≥1 equality/
 *  distance to ≥2 distinct anchors (its constraint set is symmetric across the anchor line, so the mirror
 *  placement is an equally-valid solution the solver won't reach from the default seed). Ordered by id and
 *  capped ({@link REFLECT_MAX}) so the reflection-mask combinatorics stay bounded. */
export function reflectableFreePoints(c: Construction): Id[] {
  return c.objects
    .filter((o) => o.kind === 'free-point' && !(o as FreePoint).pinned && reflectAnchors(c, o.id).length >= 2)
    .map((o) => o.id)
    .sort()
    .slice(0, REFLECT_MAX);
}

/**
 * The reflectable free points that are DIRECTION HELPERS — the loose end of a perpendicular/parallel
 * segment, tied by NO metric relation (equal/distance/ratio/angle) and not a shared-vertex right angle.
 * Its only symmetry is the two sides of the perpendicular ray from its foot; unlike an equidistant apex it
 * is NOT a shape vertex, so its reflection must be applied AFTER the continuous sample. `applySeed` spins
 * the whole free-point cluster about its centroid — reflecting a helper BEFORE the spin shifts that centroid
 * and re-shapes the actual figure (the shape that satisfied one requirement is lost when the side flips),
 * whereas reflecting it after leaves the sampled shape intact and only mirrors the side (ADR-227).
 */
export function directionHelperFreePoints(c: Construction): Id[] {
  return reflectableFreePoints(c).filter((id) => {
    let hasPerpPar = false;
    let hasMetric = false;
    const consider = (con: Constraint) => {
      if (con.type === 'perpendicular' && con.a === con.c && con.a === id) { hasMetric = true; return; } // Thales apex
      if (con.type === 'perpendicular' || con.type === 'parallel') {
        if (constraintRefs(con).includes(id)) hasPerpPar = true;
        return;
      }
      if ((con.type === 'equal' || con.type === 'distance' || con.type === 'ratio' || con.type === 'angle') && constraintRefs(con).includes(id))
        hasMetric = true;
    };
    for (const con of c.constraints) consider(con);
    // A co-driven constraint (ADR-229 `also`) is as binding as the primary — a helper co-driven by a
    // metric relation is NOT a pure direction helper (the review's F8 second half).
    for (const o of c.objects) {
      const sv = (o as { solve?: SolveDirective }).solve;
      if (sv) { consider(sv.constraint); for (const k of sv.also ?? []) consider(k); }
    }
    return hasPerpPar && !hasMetric;
  });
}

/** The raw movable DOF an object carries before constraints: a free point 2 (x,y), a parametric/shape DOF 1, else 0. */
function rawMovableDof(o: Construction['objects'][number]): number {
  const carrier = carrierOf(o);
  if (!carrier) return 0; // 0-DOF points, lines, circles, segments — fully determined
  if (carrier.family === 'free') return (o as FreePoint).pinned ? 0 : 2; // a pinned free point is fixed
  if (carrier.family === 'param' && isPinnedParam(o)) return 0; // a pinned on-circle/on-segment point is rigid (ADR-112)
  return carrier.dof; // parametric / on-line / shape scalar = 1
}

/** DOF a constraint removes: an equality removes 1; a `coincide` pins both coords (2); an ORDER/inequality removes 0 (it's a region, ADR-039).
 *  `byId` (optional) lets a coincide inspect its operands: the two-circles TANGENCY device is a coincide of
 *  two `radial-toward` witnesses that sit on the shared centre AXIS by construction, so its cross-axis
 *  component is identically 0 — it is a SINGLE scalar equation (|O1O2| = r1±r2), not a 2-DOF point-pin.
 *  Counting it as 1 makes two tangent circles read their true shape freedom (the radius RATIO = 1 DOF,
 *  ADR-228 Am.2) instead of 0. A coincide between ordinary points still pins both coords (2). */
function dofRemoved(con: Constraint, byId?: Map<Id, Construction['objects'][number]>): number {
  if (con.type === 'angle-order' || con.type === 'length-order' || con.type === 'collinear-order' || con.type === 'angle-acuteness') return 0;
  if (con.type === 'coincide') {
    const p = byId?.get(con.p), q = byId?.get(con.q);
    return p?.kind === 'radial-toward' && q?.kind === 'radial-toward' ? 1 : 2;
  }
  return 1;
}

/**
 * The dimension of the SIMILARITY gauge that is still FREE in the figure — the placement/rotation/scale
 * freedom that doesn't change the SHAPE (ADR-101). A figure with no absolute anchor can be translated
 * (2), rotated (1), and (when no length is fixed) scaled (1) without violating any given. Subtracting
 * this from the raw count gives the *shape* degrees of freedom, so a figure that is rigid UP TO
 * SIMILARITY reads 0 ("✓ fully determined") instead of 3–4. The gauge shrinks as the figure is anchored:
 *  - translation (2): gone once any point is PINNED (an explicit `point A at (x,y)`).
 *  - rotation (1): present once ≥2 points exist (there's an orientation), gone once ≥2 points are pinned.
 *  - scale (1): present while NO absolute size is fixed; gone when a numeric distance, a fixed-length
 *    radius, or ≥2 pinned points fixes it (those length constraints are ALREADY in the constraint count,
 *    so the gauge must NOT also subtract scale then — no double-count).
 */
function similarityGauge(c: Construction, cons: Set<Constraint>): number {
  const pts = c.objects.filter((o) => isGeoPoint(o) && !o.id.startsWith('~'));
  const npts = pts.length;
  if (npts === 0) return 0;
  const pinned = pts.filter((p) => p.kind === 'free-point' && (p as FreePoint).pinned).length;
  const hasCircle = c.objects.some((o) => o.kind === 'circle');
  const scaleFixed =
    pinned >= 2 ||
    [...cons].some((k) => k.type === 'distance' || k.type === 'area' || k.type === 'perimeter') || // a numeric length, area, OR perimeter pins the scale (already in `removed`; ADR-118/ADR-228)
    c.objects.some((o) => o.kind === 'circle' && o.radius.via === 'length'); // a numeric radius
  const t = pinned === 0 ? 2 : 0;
  const r = npts >= 2 && pinned <= 1 ? 1 : 0;
  const s = (npts >= 2 || hasCircle) && !scaleFixed ? 1 : 0;
  return t + r + s;
}

/**
 * The figure's remaining SHAPE degrees of freedom = (raw movable DOF) − (DOF the constraints remove) −
 * (the free similarity gauge). Counting the SHAPE freedom (modulo place/rotate/scale) means a figure
 * that is rigid up to similarity reads 0 — so "✓ fully determined" fires when the SHAPE is pinned down,
 * not only when points carry absolute coordinates (ADR-101, refining ADR-018 Stage 3). The raw count is
 * honest: one scalar constraint (e.g. `CD ⟂ AB`) removes ONE DOF even though the joint solver marks
 * several referenced vertices with `solve` — a `solve`-marked free point is NOT determined, it just
 * participates in the solve. Constraints are gathered from BOTH the checked list and the `solve`
 * directives (a driven constraint lives only in `solve`), deduped by identity.
 */
export function freeDofCount(c: Construction): number {
  const raw = c.objects.reduce((n, o) => n + rawMovableDof(o), 0);
  const cons = new Set<Constraint>(c.constraints);
  for (const o of c.objects) {
    const sv = (o as { solve?: { constraint: Constraint } }).solve;
    if (sv?.constraint) cons.add(sv.constraint);
  }
  const byId = new Map(c.objects.map((o) => [o.id, o] as const));
  let removed = 0;
  for (const con of cons) removed += dofRemoved(con, byId);
  return Math.max(0, raw - removed - similarityGauge(c, cons));
}
