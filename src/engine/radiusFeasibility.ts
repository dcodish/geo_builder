/**
 * Stage-0 radius feasibility (docs/LADDER.md stage 0a) — what a step can be told about the circles' stated sizes
 * before any solve.
 *
 * Two members:
 *  - {@link circlesTangentError}: a tangency over a radius-through-a-point circle, which apply cannot size;
 *  - {@link equalNestedPair} (#2239, [ADR-692](../../docs/06-decisions.md#adr-692); #2206, [ADR-713](../../docs/06-decisions.md#adr-713)):
 *    two circles of EQUAL radius by statement that a statement nests — internally tangent (the centres would have to
 *    coincide, |OP| = |r₁ − r₂| = 0: two coincident circles, not a tangency), contained, or concentric. Before ADR-692
 *    apply resolved the tangency by REWRITING the second stated radius (ADR-037 Am. 2, the `tangent-inner` radius), a
 *    stated magnitude silently changed and drawn green; containment and concentric drew red.
 *
 * Pure readings of the construction (its objects and its stated circle-position records), never of coordinates.
 */
import { engineErrorDebugText } from './errors';
import type { Command, Construction, GeoObject, Id } from './types';
import { statedCirclePosition } from './requirements';

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
    return engineErrorDebugText({ code: 'tangent-needs-fixed-radius' });
  }
  return null;
}

/** #2119's tolerance for "the same stated size". */
const sameSize = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** The stated (`length`) radius of a circle, or undefined for a free / through one. */
const statedRadius = (c: Circle | undefined): number | undefined => (c && c.radius.via === 'length' ? c.radius.value : undefined);

/**
 * The NESTING statements a pair of circles can carry (#2206, [ADR-713](../../docs/06-decisions.md#adr-713)): one inside the
 * other (`contained`), internally tangent (`int-tangent`), or on one centre (`concentric`). Two circles of equal radius
 * can be none of them — a circle strictly inside another is smaller, and equal nested circles are one circle.
 */
export type NestedRelation = 'contained' | 'int-tangent' | 'concentric';
/** The engine message of {@link equalNestedPair}; the fold and the humanizer read it back (`EQUAL_NESTED_CANNOT_HOLD`). */
export const equalNestedMessage = (circle: Id, relation: NestedRelation): string => engineErrorDebugText({ code: 'equal-nested', circle, relation });
export const EQUAL_NESTED_CANNOT_HOLD = /^over-constrained: equal circles (\S+) nested (contained|int-tangent|concentric) cannot hold$/;

/**
 * #2239 ([ADR-692](../../docs/06-decisions.md#adr-692)), widened by #2206 ([ADR-713](../../docs/06-decisions.md#adr-713)) —
 * TWO CIRCLES OF EQUAL RADIUS BY STATEMENT THAT A STATEMENT NESTS, in either order.
 *
 * The nested pairs are every nesting the construction already states plus the ones the incoming commands state; `next`
 * is the construction with the incoming commands applied:
 *  - internally tangent: its `circle-position` tangent records (ADR-645/672) and incoming internal `circles-tangent`;
 *  - contained: its `circle-position` contained records and incoming `set-circle-position contained`;
 *  - concentric: two circles of `next` on one centre.
 * "Equal by statement": both radii stated (`length`) and the same (#2119's 1e-9 relative tolerance), or a radius ratio
 * k = 1 stated on the pair (`set-radius-ratio`, a `ratio` constraint carrying `radii`). A pair that is equal and nested in
 * `next`, and was not already so in `prev`, is refused — so the line that COMPLETES the contradiction is the one refused:
 * the nesting over two equal circles, or the size / equality that makes a nested pair equal.
 *
 * `<circle>` in the message is the circle the incoming commands size, else the later of the pair in the construction;
 * the fold names the other statement by provenance (`replay/core.ts`), the humanizer gives the relation's reason.
 */
export function equalNestedPair(prev: Construction, next: Construction, cmds: readonly Command[]): string | null {
  const nestedIn = (c: Construction, incoming: readonly Command[]): [Id, Id, NestedRelation][] => {
    const out: [Id, Id, NestedRelation][] = [];
    for (const r of c.requirements ?? []) {
      if (r.kind !== 'circle-position') continue;
      if (r.relation === 'tangent' && r.external === false) out.push([r.a, r.b, 'int-tangent']);
      else if (r.relation === 'contained') out.push([r.a, r.b, 'contained']);
    }
    for (const x of incoming) {
      if (x.type === 'circles-tangent' && !x.external) out.push([x.circle1, x.circle2, 'int-tangent']);
      else if (x.type === 'set-circle-position' && x.relation === 'contained') out.push([x.a, x.b, 'contained']);
    }
    const circles = c.objects.filter((o): o is Circle => o.kind === 'circle');
    for (let i = 0; i < circles.length; i++)
      for (let j = i + 1; j < circles.length; j++) if (circles[i].center === circles[j].center) out.push([circles[i].id, circles[j].id, 'concentric']);
    return out;
  };
  const pairs = nestedIn(next, cmds);
  if (!pairs.length) return null;
  const sized = new Set<Id>();
  for (const c of cmds) {
    if (c.type === 'set-radius') sized.add(c.circle);
    else if (c.type === 'circle') sized.add(c.id);
    else if (c.type === 'set-radius-ratio') sized.add(c.c2);
  }
  const equalIn = (c: Construction, a: Id, b: Id): boolean => {
    const ra = statedRadius(circleIn(c, a));
    const rb = statedRadius(circleIn(c, b));
    if (ra !== undefined && rb !== undefined && sameSize(ra, rb)) return true;
    return c.constraints.some(
      (k) => k.type === 'ratio' && k.radii !== undefined && k.k === 1 && !k.add && ((k.radii.c1 === a && k.radii.c2 === b) || (k.radii.c1 === b && k.radii.c2 === a)),
    );
  };
  const samePair = (p: [Id, Id, NestedRelation], a: Id, b: Id, rel: NestedRelation) => p[2] === rel && ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  const before = nestedIn(prev, []);
  for (const [a, b, rel] of pairs) {
    if (!equalIn(next, a, b)) continue;
    // Already equal and already nested so before this step: not this step's contradiction.
    if (before.some((p) => samePair(p, a, b, rel)) && equalIn(prev, a, b)) continue;
    const named = sized.has(b) ? b : sized.has(a) ? a : next.objects.findIndex((o) => o.id === a) > next.objects.findIndex((o) => o.id === b) ? a : b;
    return equalNestedMessage(named, rel);
  }
  return null;
}

/** The engine message of {@link commonTangentCapacityError}; the humanizer reads it back (`TANGENTS_EXHAUSTED`). */
export const tangentsExhaustedMessage = (a: Id, b: Id, kind: 'external' | 'internal' | 'any', position: 'int-tangent' | 'ext-tangent' | 'contained'): string =>
  engineErrorDebugText({ code: 'tangents-exhausted', pair: `${a}${b}`, kind, position });
export const TANGENTS_EXHAUSTED = /^tangents-exhausted: common tangent (\S+) of kind (external|internal|any) on (int-tangent|ext-tangent|contained) circles$/;

/**
 * #2428 ([ADR-741](../../docs/06-decisions.md#adr-741)) — A TWO-TOUCH COMMON TANGENT ON A PAIR THAT HAS NONE OF THAT KIND.
 *
 * A `common-tangent` without `at` asks for a line touching each circle at its OWN point. The pair's STATED position
 * decides whether one exists: circles stated internally tangent have no two-touch tangent at all (their one common
 * tangent is the tangent at the touch, the `at` record); circles stated externally tangent have no internal one (the
 * internal tangent is the tangent at the touch); a circle stated inside another has no common tangent. Before ADR-741
 * the capacity rule lived only in the parser, so a record that reached apply anyway (the AI lane's re-parse with a
 * partial context) was solved toward its degenerate limit by shrinking the circles' free radii — A ≈ B ≈ T, green.
 *
 * Read from the construction's stated circle-position records (ADR-567 / ADR-645), never from coordinates. A count
 * beyond capacity (a third external tangent) is not judged here: the `avoid` requirement and the verifier own it.
 */
export function commonTangentCapacityError(prev: Construction, cmd: Command): string | null {
  if (cmd.type !== 'common-tangent' || cmd.at !== undefined) return null;
  // #2405 (ADR-751): the pair's position through the ONE stated-position reader the parser's count also reads
  const kind = cmd.kind ?? 'any';
  const position = statedCirclePosition(prev, cmd.circle1, cmd.circle2);
  if (position === 'contained' || position === 'int-tangent') return tangentsExhaustedMessage(cmd.a, cmd.b, kind, position);
  if (position === 'ext-tangent' && cmd.kind === 'internal') return tangentsExhaustedMessage(cmd.a, cmd.b, kind, 'ext-tangent');
  return null;
}

/**
 * #2677 ([ADR-779](../../docs/06-decisions.md#adr-779)) — two STATED mutual positions of one circle pair that exclude each
 * other. The words are what a statement can say about the pair: one circle strictly inside the other (`contained`), each
 * outside the other (`disjoint`), touching from outside (`ext-tangent`, its kind STATED), touching with any kind
 * (`tangent`), or a drawn crossing point (`crossing`).
 */
export type PairPosition = 'contained' | 'disjoint' | 'ext-tangent' | 'tangent' | 'crossing';
/** An excluding pair, the containment first (`contained` twice: each circle stated inside the other). */
export type PairPositionConflict = ['contained', Exclude<PairPosition, 'tangent'>];
/** The engine message of {@link pairPositionConflict}; the humanizer reads it back through `parseEngineError`. */
export const pairPositionConflictMessage = (a: Id, b: Id, [position, other]: PairPositionConflict): string =>
  engineErrorDebugText({ code: 'pair-position-conflict', a, b, position, other });

/**
 * What the construction STATES about the pair (a, b) that excludes something else it states, or null. Read from the
 * circle-position records (ADR-567 / ADR-645) and the pair's crossing points (`circle-circle` objects), never from
 * coordinates. The exclusions are the plane's, and nothing more:
 *  - a circle strictly inside another has no common point with it and is not outside it: it neither touches it from
 *    outside, nor crosses it, nor is disjoint from it. Internal tangency is NOT excluded (ADR-704: «מוכל» plus «משיקים
 *    מבפנים» builds), so a crossing point is excluded only while no tangency is stated (a touch point of a tangency is a
 *    common point the tangency itself states), and a tangency whose kind nobody stated is not excluded either (the fold
 *    resolves it internal under a containment, ADR-704);
 *  - a circle inside another is the smaller one, so the other is not inside it (`contained` twice).
 * Kinds of tangency against each other (ADR-704: a later stated kind wins) and a tangency against a second crossing
 * point (the one-common-point guard, ADR-645) are not this reader's: they keep their own refusals. Nor is «זרים» against
 * a tangency or a crossing: its outcome is the operator's question (round #2697), so it is still drawn with the
 * disjointness flagged.
 */
export function pairPositionConflictOf(c: Pick<Construction, 'objects' | 'requirements'>, a: Id, b: Id): PairPositionConflict | null {
  const pair = (x: Id, y: Id) => (x === a && y === b) || (x === b && y === a);
  let contained = false;
  let reversed = false; // each circle stated inside the other
  let outer: Id | undefined;
  let disjoint = false;
  let tangent = false;
  let extStated = false;
  for (const r of c.requirements ?? []) {
    if (r.kind !== 'circle-position' || !pair(r.a, r.b)) continue;
    if (r.relation === 'contained') {
      if (contained && outer !== r.a) reversed = true;
      contained = true;
      outer = r.a;
    }
    else if (r.relation === 'disjoint') disjoint = true;
    else if (r.relation === 'tangent') {
      tangent = true;
      if (r.kindStated !== false && r.external !== false) extStated = true;
    }
  }
  if (!contained) return null;
  const crossing = c.objects.some((o) => o.kind === 'circle-circle' && pair(o.circle1, o.circle2));
  if (reversed) return ['contained', 'contained'];
  if (contained && disjoint) return ['contained', 'disjoint'];
  if (contained && extStated) return ['contained', 'ext-tangent'];
  if (contained && crossing && !tangent) return ['contained', 'crossing'];
  return null;
}

/**
 * #2677 ([ADR-779](../../docs/06-decisions.md#adr-779)) — A STATEMENT ABOUT A CIRCLE PAIR'S MUTUAL POSITION THAT AN
 * EARLIER ONE EXCLUDES, in either order. Stage 0a, beside {@link equalNestedPair}: `next` is the construction with the
 * incoming commands applied; a pair whose stated positions exclude each other in `next` and did not in `prev` is
 * refused, so the line that COMPLETES the contradiction is the one refused — «משיקים מבחוץ» or «נחתכים» after «מוכל»,
 * or «מוכל» after either of them, «זרים» against «מוכל», and a containment stated both ways. Before ADR-779 each was applied as a construct
 * over free centres and radii, the containment was only a requirement the drive never reconciled,
 * and the figure was drawn with every row green and the verifier flagging the earlier statement. The fold's drop-one
 * search names the other statement; the humanizer gives the reason.
 */
export function pairPositionConflict(prev: Construction, next: Construction): string | null {
  const circles = next.objects.filter((o): o is Circle => o.kind === 'circle');
  for (let i = 0; i < circles.length; i++)
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i].id;
      const b = circles[j].id;
      const now = pairPositionConflictOf(next, a, b);
      if (now && !pairPositionConflictOf(prev, a, b)) return pairPositionConflictMessage(a, b, now);
    }
  return null;
}

/** The wire of {@link pairPositionConflict} before the fold's attribution tail. */
export const PAIR_POSITION_CONFLICT = /^over-constrained: circles (\S+) and (\S+) stated (\S+) and (\S+) cannot hold$/;

/**
 * #2677 ([ADR-779](../../docs/06-decisions.md#adr-779)) — which of the {@link PairPosition}s a command STATES about the
 * pair (a, b), read from the command alone: the fold's provenance reader for the refusal's other side. The same words
 * {@link pairPositionConflictOf} reads off the construction.
 */
export function pairPositionsStated(cmd: Command, a: Id, b: Id): PairPosition[] {
  const pair = (x: Id, y: Id) => (x === a && y === b) || (x === b && y === a);
  if (cmd.type === 'set-circle-position' && pair(cmd.a, cmd.b) && cmd.relation !== 'any') return [cmd.relation];
  if (cmd.type === 'circles-tangent' && pair(cmd.circle1, cmd.circle2)) return cmd.external && cmd.kindStated !== false ? ['tangent', 'ext-tangent'] : ['tangent'];
  if (cmd.type === 'circle-circle-intersection' && pair(cmd.circle1, cmd.circle2)) return ['crossing'];
  return [];
}
