/**
 * The crossing-affordance universe — where the student may click to NAME a crossing of the drawn ink
 * ([ADR-016](docs/06-decisions.md#adr-016) originally; generalized by [ADR-380](docs/06-decisions.md#adr-380), issue #228).
 *
 * Two rules govern what earns a dot, and both are about honesty rather than convenience:
 *
 * 1. **The universe is GEOMETRIC, not a whitelist of pair kinds.** This module enumerates every pair of
 *    drawn things — segments, drawn lines, drawn circles — and intersects them. The predecessor
 *    (`findSegmentCrossings`) hand-listed the pair types it knew (segment×segment, then line×segment when
 *    #197 needed it), so circle×segment, circle×circle, circle×line and line×line silently offered
 *    nothing. That is the [ADR-167](docs/06-decisions.md#adr-167) node-definition class in its affordance
 *    edition — the same shape whose history note reads "each addition was the node-definition issue, again."
 *
 * 2. **A dot is offered only where the crossing is FORCED** — where it holds in every valid configuration
 *    of the figure (operator ruling, 2026-07-21). This module supplies the raw candidates and the stable
 *    `key` that identifies "the same crossing" across configurations; the forcedness verdict itself is the
 *    store's (it owns the sample pool). Without that gate, widening the universe would make things worse:
 *    more pair types means more incidental crossings, and an incidental crossing is exactly what vanishes
 *    under "show another configuration", stranding the letter the student gave it.
 *
 * Detection stays a pure SUGGESTION — nothing is created until the student clicks, so the engine remains
 * constructive and no unnamed points appear on their own.
 */

import type { Command, Construction, Id, Vec } from './types';
import { isGeoPoint } from './types';
import { add, dist, lineCircleIntersect, circleCircleIntersect, scale, sub } from './geometry';
import { isScaffoldId } from './relations';
import type { ResolvedCircle } from './evaluate';

/** A drawn line as the scene resolves it: an anchor point and a direction. */
export interface ResolvedLineRef {
  id: Id;
  anchor: Vec;
  dir: Vec;
}

/** A drawn circle: the shape the affordance intersects against. */
export interface DrawnCircleRef {
  id: Id;
  center: Vec;
  r: number;
}

/**
 * The circles that are DRAWN INK — the single definition of what the student can see and therefore click,
 * shared by the renderer's affordance pass and the store's forcedness gate so the two can never disagree
 * about the universe.
 *
 * Excluded: a `hidden` circle (a cyclic polygon's circumcircle constrains its vertices but is not drawn —
 * the same rule `buildScene` applies), a `~`/`@`-prefixed scaffolding construction (ADR-295), and a
 * degenerate radius.
 */
export function drawnCircles(c: Construction, resolved: Map<Id, ResolvedCircle>): DrawnCircleRef[] {
  const out: DrawnCircleRef[] = [];
  for (const o of c.objects) {
    if (o.kind !== 'circle' || (o as { hidden?: boolean }).hidden || isScaffoldId(o.id)) continue;
    const rc = resolved.get(o.id);
    if (rc && rc.r > 1e-9) out.push({ id: o.id, center: rc.center, r: rc.r });
  }
  return out;
}

export interface Crossing {
  /** World position of the crossing in the configuration it was found in. */
  pos: Vec;
  /** First operand, when it is a SEGMENT: its endpoints. */
  a?: Id;
  b?: Id;
  /** Second operand, when it is a SEGMENT: its endpoints. */
  c?: Id;
  d?: Id;
  /** An operand that is a drawn LINE (a tangent / bisector / perpendicular / parallel). */
  line1?: Id;
  line2?: Id;
  /** An operand that is a drawn CIRCLE. */
  circle1?: Id;
  circle2?: Id;
  /** Which root of a two-solution pair this is — indexes the same solution array the engine's `branch`
   *  field indexes (both sides call `lineCircleIntersect` / `circleCircleIntersect`), so the lowering can
   *  hand the engine this number directly instead of guessing. */
  branch?: number;
  /** Identity of the OPERAND PAIR, stable across configurations — the key the forcedness gate counts by.
   *  Deliberately branch-free: root labelling is not stable as a figure flexes, so a pair is judged by how
   *  many interior crossings it has (identical in every sample ⇒ forced), never by matching root indices. */
  key: string;
}

type Ink =
  | { kind: 'segment'; a: Id; b: Id; pa: Vec; pb: Vec }
  | { kind: 'line'; id: Id; anchor: Vec; dir: Vec }
  | { kind: 'circle'; id: Id; center: Vec; r: number };

/** Slot order within a crossing: the circle is always operand 1, a segment always last. */
function kindRank(k: Ink): number {
  return k.kind === 'circle' ? 0 : k.kind === 'line' ? 1 : 2;
}

/** Canonical token for one operand — the halves of a {@link Crossing.key}. */
function token(k: Ink): string {
  if (k.kind === 'segment') return `s:${[k.a, k.b].sort().join('-')}`;
  return `${k.kind === 'line' ? 'l' : 'c'}:${k.id}`;
}

/** Stable, order-independent identity of an operand PAIR. */
function pairKey(x: Ink, y: Ink): string {
  return [token(x), token(y)].sort().join('|');
}

/** Parameter of `p` along a→b (0 at a, 1 at b). */
function paramOn(p: Vec, a: Vec, b: Vec): number {
  const r = sub(b, a);
  const dd = r.x * r.x + r.y * r.y;
  return dd < 1e-18 ? 0.5 : ((p.x - a.x) * r.x + (p.y - a.y) * r.y) / dd;
}

/** Does `p` lie strictly inside the drawn extent of `k`? A LINE and a CIRCLE are unbounded/closed —
 *  every point of them is drawn — so only a SEGMENT constrains where its crossings may be offered. */
function withinInk(k: Ink, p: Vec, e: number): boolean {
  if (k.kind !== 'segment') return true;
  const t = paramOn(p, k.pa, k.pb);
  return t > e && t < 1 - e;
}

/** The intersection points of two drawn things, in the engine's own root order (so an index here IS the
 *  engine's `branch`). Empty when they miss, are parallel, or are tangent within `eps` — a tangency is a
 *  touch, not a crossing to name, and a near-tangency is exactly the case that stops existing one
 *  configuration later. */
function intersect(x: Ink, y: Ink, eps: number): Vec[] {
  const asLine = (k: Ink): { anchor: Vec; dir: Vec } =>
    k.kind === 'segment' ? { anchor: k.pa, dir: sub(k.pb, k.pa) } : { anchor: (k as { anchor: Vec }).anchor, dir: (k as { dir: Vec }).dir };

  if (x.kind === 'circle' && y.kind === 'circle') {
    const sols = circleCircleIntersect(x.center, x.r, y.center, y.r);
    return sols.length === 2 && dist(sols[0], sols[1]) < eps ? [] : sols;
  }
  if (x.kind === 'circle' || y.kind === 'circle') {
    const circ = (x.kind === 'circle' ? x : y) as Extract<Ink, { kind: 'circle' }>;
    const other = x.kind === 'circle' ? y : x;
    const l = asLine(other);
    const sols = lineCircleIntersect(l.anchor, l.dir, circ.center, circ.r);
    return sols.length === 2 && dist(sols[0], sols[1]) < eps ? [] : sols;
  }
  // line/segment × line/segment — one solution or none (parallel).
  const l1 = asLine(x);
  const l2 = asLine(y);
  const denom = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
  if (Math.abs(denom) < 1e-12) return [];
  const ac = sub(l2.anchor, l1.anchor);
  const t = (ac.x * l2.dir.y - ac.y * l2.dir.x) / denom;
  return [add(l1.anchor, scale(l1.dir, t))];
}

/** Fill the operand fields of a {@link Crossing} for one ink, as operand 1 or operand 2. */
function operandFields(k: Ink, slot: 1 | 2): Partial<Crossing> {
  if (k.kind === 'segment') return slot === 1 ? { a: k.a, b: k.b } : { c: k.a, d: k.b };
  if (k.kind === 'line') return slot === 1 ? { line1: k.id } : { line2: k.id };
  return slot === 1 ? { circle1: k.id } : { circle2: k.id };
}

/**
 * Every crossing of the drawn ink in ONE configuration, deduped, excluding crossings that already carry a
 * named point and crossings at a shared endpoint (adjacent segments meet at their vertex — that is not an
 * intersection to mark).
 *
 * This is the raw candidate set for a single drawing. The forcedness gate (the store) runs it over the
 * whole sample pool and keeps only the keys whose crossing count is identical in every valid configuration.
 */
export function findInkCrossings(
  c: Construction,
  positions: Map<Id, Vec>,
  opts: { lines?: ResolvedLineRef[]; circles?: DrawnCircleRef[] } = {},
): Crossing[] {
  const inks: Ink[] = [];
  for (const o of c.objects) {
    if (o.kind !== 'segment') continue;
    const pa = positions.get(o.a);
    const pb = positions.get(o.b);
    if (pa && pb) inks.push({ kind: 'segment', a: o.a, b: o.b, pa, pb });
  }
  for (const l of opts.lines ?? []) inks.push({ kind: 'line', id: l.id, anchor: l.anchor, dir: l.dir });
  // Circles arrive already filtered to DRAWN ink by `drawnCircles` — the shared definition, so the
  // renderer's candidates and the store's forcedness verdict are computed over the same universe.
  for (const c2 of opts.circles ?? []) inks.push({ kind: 'circle', id: c2.id, center: c2.center, r: c2.r });

  const named = c.objects.filter(isGeoPoint).map((o) => positions.get(o.id)).filter((p): p is Vec => !!p);

  // Span-relative epsilons (F7/REN-8): an absolute tolerance is scale-dependent — a figure whose free radius
  // grew to hundreds of units would show duplicate dots at named points, while a micro-figure would swallow
  // genuinely distinct crossings.
  const span = (() => {
    if (!named.length) return 1;
    let nx = Infinity, ny = Infinity, xx = -Infinity, xy = -Infinity;
    for (const p of named) {
      nx = Math.min(nx, p.x); ny = Math.min(ny, p.y);
      xx = Math.max(xx, p.x); xy = Math.max(xy, p.y);
    }
    return Math.hypot(xx - nx, xy - ny) || 1;
  })();
  const eps = Math.max(1e-9, 1e-7 * span); // dedupe / tangency
  const near = Math.max(1e-9, 2e-2 * span); // "this crossing IS that named point"
  const interior = 1e-6; // strictly inside a segment: an endpoint touch is not a crossing

  const out: Crossing[] = [];
  for (let i = 0; i < inks.length; i++) {
    for (let j = i + 1; j < inks.length; j++) {
      // Operand SLOTS are canonical by kind (circle → line → segment), never by iteration order, so a
      // consumer can always read "the circle" as `circle1` and "the line" as `line1`. This also keeps the
      // pre-existing line×segment shape (`line1` + `c`/`d`) byte-identical for #197's callers.
      const [x, y] = [inks[i], inks[j]].sort((p, q) => kindRank(p) - kindRank(q)) as [Ink, Ink];
      // Adjacent segments meet AT their shared vertex — already a named point, never a dot.
      if (x.kind === 'segment' && y.kind === 'segment' && (x.a === y.a || x.a === y.b || x.b === y.a || x.b === y.b)) continue;
      // A circle and a segment/line that defines it (a radius, a diameter, a chord's endpoints) meet at
      // points that are already named — the `named` filter below catches those, no special case needed.
      const key = pairKey(x, y);
      const sols = intersect(x, y, eps);
      for (let b = 0; b < sols.length; b++) {
        const p = sols[b];
        if (!withinInk(x, p, interior) || !withinInk(y, p, interior)) continue;
        if (named.some((q) => dist(q, p) < near)) continue; // already on the canvas
        if (out.some((o) => dist(o.pos, p) < eps)) continue; // concurrent ink → one dot
        out.push({
          pos: p,
          ...operandFields(x, 1),
          ...operandFields(y, 2),
          ...(sols.length > 1 ? { branch: b } : {}),
          key,
        });
      }
    }
  }
  return out;
}

/**
 * How many crossings each operand pair contributes in one configuration — the input to the forcedness gate.
 * A pair is FORCED when this count is identical and non-zero in every valid configuration: the crossing
 * exists no matter how the figure flexes, so naming it can never strand a letter.
 */
export function crossingCounts(xs: Crossing[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x.key, (m.get(x.key) ?? 0) + 1);
  return m;
}

/**
 * The commands a clicked crossing lowers to ([ADR-379](docs/06-decisions.md#adr-379) for the original two
 * pair types, [ADR-380](docs/06-decisions.md#adr-380) for the rest) — the ONE place the dot gesture becomes
 * engine commands, so App and the tests can never drift apart (the ADR-346 shared-seam discipline).
 *
 * The gesture is a STATEMENT, not a coordinate: a dot is only ever offered where the ink crosses within its
 * drawn extent, so clicking it asserts "these two drawn things cross HERE" — the same thing the typed
 * «AM ו-DN נפגשים בנקודה O» asserts. Each operand contributes its own within requirement: an infinite drawn
 * LINE and a closed CIRCLE bound nothing, a drawn SEGMENT bounds its crossing. Every lowering mirrors what
 * the equivalent TYPED utterance produces, so the two input routes can never mean different things.
 */
export function crossingCommands(x: Crossing, id: Id): Command[] {
  const segLine = (p: Id, q: Id) => `line-${p}${q}`;
  const carrier = (p: Id, q: Id): Command => ({ type: 'line-through', id: segLine(p, q), a: p, b: q });

  // ── circle × circle ────────────────────────────────────────────────────────────────────────────────
  if (x.circle1 && x.circle2) {
    return [{ type: 'circle-circle-intersection', id, circle1: x.circle1, circle2: x.circle2, branch: x.branch ?? 0 }];
  }

  // ── circle × (line | segment) ──────────────────────────────────────────────────────────────────────
  if (x.circle1) {
    // A drawn LINE operand is infinite — the crossing is wherever it is (no order requirement). A SEGMENT
    // operand bounds it: the ADR-277 `order` twin, exactly what a bare-pair secant lowers to.
    if (x.line1 || x.line2) {
      return [{ type: 'line-circle-intersection', id, line: (x.line1 ?? x.line2)!, circle: x.circle1, branch: x.branch ?? 0 }];
    }
    const [p, q] = [x.c!, x.d!];
    return [
      carrier(p, q),
      { type: 'line-circle-intersection', id, line: segLine(p, q), circle: x.circle1, branch: x.branch ?? 0, order: [p, id, q] },
    ];
  }

  // ── line × line (both drawn, both infinite — nothing to bound) ─────────────────────────────────────
  if (x.line1 && x.line2) {
    return [{ type: 'line-intersection', id, line1: x.line1, line2: x.line2 }];
  }

  // ── line × segment (#197 Am. 7) ────────────────────────────────────────────────────────────────────
  if (x.line1) {
    return [
      carrier(x.c!, x.d!),
      { type: 'line-intersection', id, line1: x.line1, line2: segLine(x.c!, x.d!) },
      // Only the SEGMENT operand bounds the crossing — the per-operand within twin (the ADR-268 `onSeg2`
      // shape) as an order constraint, since `line-intersection` has no such field. `set-line`'s own
      // segment(c,d) is idempotent: that segment is already drawn.
      { type: 'set-line', points: [x.c!, id, x.d!] },
    ];
  }

  // ── segment × segment ──────────────────────────────────────────────────────────────────────────────
  // The joint ADR-166 `onSeg` requirement (sampled + reflection-explored, gated by `meetsRequirements`,
  // checked by the verifier's `meetOnSegment`) — byte-identical to what the typed meet form lowers to.
  return [{ type: 'line-line-intersection', id, a: x.a!, b: x.b!, c: x.c!, d: x.d!, onSeg: true }];
}
