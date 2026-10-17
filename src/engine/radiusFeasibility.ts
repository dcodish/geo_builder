/**
 * Stage-0 radius feasibility (docs/LADDER.md stage 0a) — what a step can be told about the circles' stated sizes
 * before any solve.
 *
 * Two members:
 *  - {@link circlesTangentError}: a tangency over a radius-through-a-point circle, which apply cannot size;
 *  - {@link equalInternalTangency} (#2239, [ADR-692](../../docs/06-decisions.md#adr-692)): two circles of EQUAL stated
 *    radius stated internally tangent — the centres would have to coincide (|OP| = |r₁ − r₂| = 0), which is two
 *    coincident circles, not a tangency. Before ADR-692 apply resolved it by REWRITING the second stated radius
 *    (ADR-037 Am. 2, the `tangent-inner` radius), a stated magnitude silently changed and drawn green.
 *
 * Pure readings of the construction (its objects and its stated circle-position records), never of coordinates.
 */
import { formatMeasure } from '@/format';
import type { Command, Construction, GeoObject, Id } from './types';

type Circle = Extract<GeoObject, { kind: 'circle' }>;

const circleIn = (c: Construction, id: Id): Circle | undefined =>
  c.objects.find((o): o is Circle => o.kind === 'circle' && o.id === id);

/**
 * Reject a `circles-tangent` the engine genuinely can't size — the radius-through-a-point case (its radius isn't
 * known at apply time). Returns a message or null.
 */
export function circlesTangentError(prev: Construction, cmd: Command): string | null {
  if (cmd.type !== 'circles-tangent') return null;
  const c1 = circleIn(prev, cmd.circle1);
  const c2 = circleIn(prev, cmd.circle2);
  if (!c1 || !c2) return null; // a missing circle is handled by the normal flow
  if (c1.radius.via === 'through' || c2.radius.via === 'through') {
    return 'tangent circles need a fixed radius (a radius-through-a-point circle is not supported yet)';
  }
  return null;
}

/** #2119's tolerance for "the same stated size". */
const sameSize = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** The stated (`length`) radius of a circle, or undefined for a free / through one. */
const statedRadius = (c: Circle | undefined): number | undefined => (c && c.radius.via === 'length' ? c.radius.value : undefined);

/**
 * #2239 ([ADR-692](../../docs/06-decisions.md#adr-692)) — TWO CIRCLES OF EQUAL STATED RADIUS STATED INTERNALLY
 * TANGENT, in either order. The pairs are every internal tangency the construction already states (its
 * `circle-position` records) plus the ones the incoming commands state; `next` is the construction with the
 * incoming commands applied. A pair whose two radii are both stated and equal in `next`, and was not already so in
 * `prev`, is refused — so the line that COMPLETES the contradiction is the one refused: the tangency over two equal
 * sizes, or the size that makes an internally tangent pair equal.
 *
 * The message is #2119's restated-size shape (`radius of <circle> = <value> cannot hold`, humanized by
 * `errors.restatedSize`); the fold names the other statement by provenance (`replay/core.ts`). `<circle>` is the
 * circle the incoming commands size, else the later of the pair in the construction.
 */
export function equalInternalTangency(prev: Construction, next: Construction, cmds: readonly Command[]): string | null {
  const pairs: [Id, Id][] = [];
  for (const r of prev.requirements ?? []) if (r.kind === 'circle-position' && r.relation === 'tangent' && r.external === false) pairs.push([r.a, r.b]);
  for (const c of cmds) if (c.type === 'circles-tangent' && !c.external) pairs.push([c.circle1, c.circle2]);
  if (!pairs.length) return null;
  const sized = new Set<Id>();
  for (const c of cmds) {
    if (c.type === 'set-radius') sized.add(c.circle);
    else if (c.type === 'circle') sized.add(c.id);
  }
  const equalIn = (c: Construction, a: Id, b: Id): number | undefined => {
    const ra = statedRadius(circleIn(c, a));
    const rb = statedRadius(circleIn(c, b));
    return ra !== undefined && rb !== undefined && sameSize(ra, rb) ? rb : undefined;
  };
  for (const [a, b] of pairs) {
    const v = equalIn(next, a, b);
    if (v === undefined) continue;
    // Already equal and already stated internally tangent before this step: not this step's contradiction.
    const alreadyStated = (prev.requirements ?? []).some(
      (r) => r.kind === 'circle-position' && r.relation === 'tangent' && r.external === false && ((r.a === a && r.b === b) || (r.a === b && r.b === a)),
    );
    if (alreadyStated && equalIn(prev, a, b) !== undefined) continue;
    const named = sized.has(b) ? b : sized.has(a) ? a : next.objects.findIndex((o) => o.id === a) > next.objects.findIndex((o) => o.id === b) ? a : b;
    return `over-constrained: radius of ${named} = ${formatMeasure(v)} cannot hold`;
  }
  return null;
}
