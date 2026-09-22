/**
 * Ambiguous named-shape VARIANTS ([ADR-138](docs/06-decisions.md#adr-138)).
 *
 * A kite / isosceles triangle names a shape whose EQUAL-PAIR is genuinely unstated (which diagonal is the
 * kite's axis; which vertex is the isosceles apex). Per [ADR-052](docs/06-decisions.md#adr-052) that choice
 * is FREE, not a fixed assumption — so the parser emits a single `shape-variant` command carrying a cyclable
 * `variant` index, and `replay` expands it here to the base shape + the variant-selected `set-equal`s.
 *
 * Two rules make it behave as the student expects:
 *  - an EXPLICIT `set-equal` on the shape's sides PINS the matching variant (so "kite ABCD" + "AB=BC" flips
 *    the kite to that axis instead of stacking) — this generalises the ADR-114 isosceles soft default; and
 *  - a pair an explicit equality already provides is NOT re-emitted (no duplicate constraint that would
 *    corrupt the DOF count).
 *
 * Pure and deterministic. The expansion is shared by `lowerOne` (the fallback path) and `replay` (which
 * supplies the explicit equalities for the pin), and `VARIANT_COUNT` drives the cycle ("show another").
 */

import type { AnyCommand, Command, Id, VariantShape } from './types';

export type { VariantShape };


/** How many valid configurations each shape has — the modulus "show another configuration" cycles. A kite has
 *  two symmetry axes, an isosceles triangle three apexes, a base-less midsegment two host sides for its free
 *  endpoint ([ADR-199](docs/06-decisions.md#adr-199)).
 *
 *  `midsegment-free` has THREE, and the difference from `midsegment` is load-bearing rather than cosmetic
 *  ([ADR-545](docs/06-decisions.md), #1368). In `midsegment` the student has already placed one endpoint on a
 *  side — «E על AC» — so that side is STATED and only the other endpoint's side is free: two configurations.
 *  In `midsegment-free` nothing is stated at all («קטע אמצעים» alone), so the choice is which of the three
 *  sides the midsegment is PARALLEL to. Giving `midsegment` three variants instead would let "show another
 *  configuration" move E off the side the student named — cycling into a figure that contradicts a given,
 *  which is the opposite of what the variant channel is for. */
export const VARIANT_COUNT: Record<VariantShape, number> = { kite: 2, isosceles: 3, midsegment: 2, 'midsegment-free': 3 };

/**
 * The shapes that ARE a midsegment. Consumers ask this set rather than naming `'midsegment'` literally, so
 * adding a fourth midsegment form cannot silently fail a gate that was written when there were two — which
 * is exactly what happened when `midsegment-free` was added: `droppedMidsegment` tested one literal, did not
 * recognise the new command, and refused a correctly-parsed utterance as a dropped given (#1368).
 */
export const MIDSEGMENT_SHAPES: ReadonlySet<VariantShape> = new Set<VariantShape>(['midsegment', 'midsegment-free']);

/** A `set-equal` argument tuple `[a,b,c,d]` meaning |ab| = |cd|. */
type EqTuple = [Id, Id, Id, Id];

/** The base shape command (the polygon the equalities flex into the named shape). `declaredAs` carries
 *  the variant's NOUN through to the polygon stamp (#770) — a kite's ring is declared «דלתון», not a
 *  generic quad, so «אלכסוני הדלתון» can resolve on it. */
function baseCommand(shape: VariantShape, ids: Id[]): Command {
  return shape === 'kite'
    ? { type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]], declaredAs: 'kite' }
    : { type: 'triangle', ids: [ids[0], ids[1], ids[2]] };
}

/**
 * Every variant's equal-pair(s), indexed by variant. A KITE has two adjacent-equal pairs per axis (they move
 * as one unit): axis AC ⇒ {|AB|=|AD|, |CB|=|CD|}, axis BD ⇒ {|AB|=|BC|, |AD|=|DC|}. An ISOSCELES triangle
 * has one equal pair per apex: A ⇒ |AB|=|AC|, B ⇒ |AB|=|BC|, C ⇒ |AC|=|BC|.
 */
function variantPairs(shape: VariantShape, ids: Id[]): EqTuple[][] {
  const [a, b, c, d] = ids;
  if (shape === 'kite') {
    return [
      [[a, b, a, d], [c, b, c, d]], // variant 0 — axis AC: |AB|=|AD|, |CB|=|CD|
      [[a, b, b, c], [a, d, d, c]], // variant 1 — axis BD: |AB|=|BC|, |AD|=|DC|
    ];
  }
  return [
    [[a, b, a, c]], // variant 0 — apex A: |AB|=|AC|
    [[a, b, b, c]], // variant 1 — apex B: |AB|=|BC|
    [[a, c, b, c]], // variant 2 — apex C: |AC|=|BC|
  ];
}

/** Canonical key for an undirected segment {x,y}. */
const seg = (x: Id, y: Id): string => (x < y ? `${x}|${y}` : `${y}|${x}`);
/** Canonical key for an unordered pair of segments (a set-equal / a variant pair), order-independent. */
const pairKey = (p: Id, q: Id, r: Id, s: Id): string => [seg(p, q), seg(r, s)].sort().join('=');

/** Does an explicit `set-equal {a,b,c,d}` assert the SAME two segments as a variant pair `[p,q,r,s]`? */
export function eqMatchesPair(eq: { a: Id; b: Id; c: Id; d: Id }, pair: EqTuple): boolean {
  return pairKey(eq.a, eq.b, eq.c, eq.d) === pairKey(pair[0], pair[1], pair[2], pair[3]);
}

/**
 * Does the explicit equality `setEqual` NAME one of the equal-pairs of some enabled `shape-variant` that
 * NO existing explicit equality already asserts? Such a statement is the student CHOOSING which sides of a
 * kite / isosceles are equal — it PINS a previously-SOFT default ([ADR-138](docs/06-decisions.md#adr-138) /
 * design-rules M4). That is genuinely new information (soft engine guess → the student's stated choice: it
 * flips the relation from "not forced" to "forced/reported") even though the geometry — which already used
 * that pair as its default drawing — does not move. Without this, restating the default pair (e.g. `AB=AC`
 * on an isosceles that soft-defaulted to apex A) is wrongly swallowed as a redundant "already drawn" no-op.
 * A `midsegment` variant carries no equal-pair, so it never pins.
 */
export function pinsSoftVariant(
  setEqual: { a: Id; b: Id; c: Id; d: Id },
  shapeVariants: { shape: VariantShape; ids: Id[] }[],
  explicitEqs: { a: Id; b: Id; c: Id; d: Id }[],
): boolean {
  const alreadyStated = (pair: EqTuple) => explicitEqs.some((eq) => eqMatchesPair(eq, pair));
  for (const sv of shapeVariants) {
    // Neither midsegment form carries an equal-pair, so neither can be pinned by a stated equality.
    if (sv.shape === 'midsegment' || sv.shape === 'midsegment-free') continue;
    for (const variant of variantPairs(sv.shape, sv.ids)) {
      for (const pair of variant) {
        if (eqMatchesPair(setEqual, pair) && !alreadyStated(pair)) return true;
      }
    }
  }
  return false;
}

/**
 * A base-less MIDSEGMENT ([ADR-199](docs/06-decisions.md#adr-199)) — `ids = [P, Q, R, E, G]`: the student
 * placed `E` on side `PQ` of triangle `PQR` and called `EG` a midsegment, without naming the parallel base.
 * A midsegment joins two MIDPOINTS, so `E` is pinned to the midpoint of `PQ` (a `set-equal` drives the free
 * on-segment point), and `G` is the midpoint of one of the two OTHER sides — `PR` (variant 0 ⇒ EG ∥ QR) or
 * `QR` (variant 1 ⇒ EG ∥ PR). Which side is genuinely unstated (ADR-052), so it is the cyclable variant —
 * UNLESS the student states it: an explicit `point-on-segment` placing `G` on PR or QR PINS the variant
 * ([ADR-412](docs/06-decisions.md#adr-412), issue #407 — the on-segment sibling of the kite/isosceles
 * explicit-equality pin and the inscribe `explicitOnSegs` pin, ADR-262).
 */
function expandMidsegment(ids: Id[], variant: number, explicitOnSegs: { id: Id; a: Id; b: Id }[] = []): Command[] {
  const [p, q, r, e, g] = ids;
  let chosen = ((variant % 2) + 2) % 2;
  for (let v = 0; v < 2; v++) {
    const [sa, sb] = v === 0 ? [p, r] : [q, r];
    if (explicitOnSegs.some((o) => o.id === g && ((o.a === sa && o.b === sb) || (o.a === sb && o.b === sa)))) {
      chosen = v;
      break;
    }
  }
  const other: [Id, Id] = chosen === 0 ? [p, r] : [q, r]; // G rides PR (v0) or QR (v1)
  return [
    { type: 'set-equal', a: p, b: e, c: e, d: q }, // E is the midpoint of PQ: |PE| = |EQ|
    { type: 'midpoint', id: g, a: other[0], b: other[1] }, // G is the midpoint of the chosen other side
    { type: 'segment', a: e, b: g }, // draw the midsegment EG
  ];
}

/**
 * The FULLY base-less midsegment ([ADR-545](docs/06-decisions.md), #1368) — `ids = [P, Q, R, E, G]` over
 * triangle `PQR`, where BOTH endpoints are fresh: the student said «קטע אמצעים» and named nothing else.
 *
 * A midsegment joins the midpoints of two sides, so the real choice is **which pair** — equivalently, which
 * side it ends up PARALLEL to. The three sides give three configurations, and the variant selects among them:
 * `0 ⇒ ∥ QR` (endpoints on PQ, PR) · `1 ⇒ ∥ PR` (on PQ, QR) · `2 ⇒ ∥ PQ` (on PR, QR). Nothing here is a
 * default masquerading as a given: all three are genuinely unstated (ADR-052) and «הציגו תצורה אחרת» walks them.
 *
 * Both endpoints are plain `midpoint`s — unlike `expandMidsegment`, there is no pre-existing free rider to
 * drive with a `set-equal`. The student may still PIN the choice by placing an endpoint: an explicit
 * `point-on-segment` on one of the three sides selects the variant whose endpoints ride it
 * ([ADR-412](docs/06-decisions.md#adr-412)), the same pin the two-variant form honours.
 */
function expandMidsegmentFree(ids: Id[], variant: number, explicitOnSegs: { id: Id; a: Id; b: Id }[] = []): Command[] {
  const [p, q, r, e, g] = ids;
  // Variant k ⇒ the two sides the endpoints ride. Index matches the docblock: 0 ∥ QR, 1 ∥ PR, 2 ∥ PQ.
  const sidesFor = (v: number): [[Id, Id], [Id, Id]] =>
    v === 0 ? [[p, q], [p, r]] : v === 1 ? [[p, q], [q, r]] : [[p, r], [q, r]];
  let chosen = ((variant % 3) + 3) % 3;
  // An explicitly stated on-segment placement of either endpoint pins the configuration that honours it.
  for (let v = 0; v < 3; v++) {
    const [sa, sb] = sidesFor(v);
    const rides = (pt: Id, side: [Id, Id]) =>
      explicitOnSegs.some((o) => o.id === pt && ((o.a === side[0] && o.b === side[1]) || (o.a === side[1] && o.b === side[0])));
    if (rides(e, sa) || rides(g, sb) || rides(e, sb) || rides(g, sa)) {
      chosen = v;
      break;
    }
  }
  const [sideE, sideG] = sidesFor(chosen);
  return [
    { type: 'midpoint', id: e, a: sideE[0], b: sideE[1] },
    { type: 'midpoint', id: g, a: sideG[0], b: sideG[1] },
    { type: 'segment', a: e, b: g },
  ];
}

/**
 * Expand a `shape-variant` command into engine commands. `explicitEqs` are the genuine `set-equal`s the
 * student/LLM gave (NOT from another shape-variant) — they (1) PIN the variant they match and (2) suppress
 * re-emitting that pair. With none, the figure uses `cmd.variant` and emits all its pairs (seed-0/variant-0
 * reproduces the historical drawing). A `midsegment` variant carries no equal-pair to pin, so `explicitEqs`
 * is unused there.
 */
export function expandShapeVariant(
  cmd: { shape: VariantShape; ids: Id[]; variant: number },
  explicitEqs: { a: Id; b: Id; c: Id; d: Id }[],
  explicitOnSegs: { id: Id; a: Id; b: Id }[] = [],
): Command[] {
  if (cmd.shape === 'midsegment') return expandMidsegment(cmd.ids, cmd.variant, explicitOnSegs);
  if (cmd.shape === 'midsegment-free') return expandMidsegmentFree(cmd.ids, cmd.variant, explicitOnSegs);
  const all = variantPairs(cmd.shape, cmd.ids);
  const n = all.length;
  const matchesAny = (pair: EqTuple) => explicitEqs.some((eq) => eqMatchesPair(eq, pair));
  // An explicit equality on any of a variant's pairs PINS that variant (the student stated which pair is equal).
  let chosen = ((cmd.variant % n) + n) % n;
  for (let v = 0; v < n; v++) {
    if (all[v].some(matchesAny)) {
      chosen = v;
      break;
    }
  }
  // Emit the chosen variant's pairs, skipping any an explicit equality already provides (avoids a duplicate
  // constraint that would over-count the DOF / double-drive).
  const eqs: Command[] = all[chosen]
    .filter((pair) => !matchesAny(pair))
    .map(([a, b, c, d]) => ({ type: 'set-equal', a, b, c, d }) as Command);
  return [baseCommand(cmd.shape, cmd.ids), ...eqs];
}

/**
 * #444 — the equal-side pairs the DRAWN variant of a named shape declares.
 *
 * These are NOT discovered relations and must never be reported as such. `detectRelationsAcross` pools
 * samples across every variant alternative ({@link variantConfigs}), so a pair true only in the drawn
 * variant correctly fails its "holds in every sample" bar — which is right: WHICH pair is equal is the
 * student's free choice (ADR-052), and cycling the variant moves it.
 *
 * What IS forced is the DISJUNCTION — that some two sides are equal — and that is exactly what a student
 * who typed «דלתון» or «משולש שווה שוקיים» expects to see marked. The relations layer had no way to say
 * it, so it said «no equal sides found»: the one answer that is actually false. This channel says it,
 * separately, so the UI can mark it in a visually distinct way with an explanation (operator ruling,
 * 2026-08-08) rather than passing it off as a discovered invariant.
 *
 * Generalises over the whole class by CONSTRUCTION, not a per-shape list: every `shape-variant` whose
 * variant encodes an equality choice contributes (kite, isosceles triangle, isosceles trapezoid, and
 * anything added later), because the pairs come from {@link expandShapeVariant} itself — the same
 * function that builds the constraints. A pair the student stated EXPLICITLY is excluded by that
 * expansion, so it stays in the genuinely-forced channel where it belongs.
 */
export interface StatedShapeEquality {
  shape: VariantShape;
  ids: Id[];
  /** Each inner array is one class of segments the shape declares equal (≥2 segments). */
  classes: [Id, Id][][];
}

export function statedShapeEqualities(
  cmds: { shape: VariantShape; ids: Id[]; variant: number }[],
  explicitEqs: { a: Id; b: Id; c: Id; d: Id }[],
): StatedShapeEquality[] {
  const out: StatedShapeEquality[] = [];
  for (const cmd of cmds) {
    const classes = expandShapeVariant(cmd, explicitEqs)
      .filter((c): c is Extract<Command, { type: 'set-equal' }> => c.type === 'set-equal')
      .map((c) => [[c.a, c.b], [c.c, c.d]] as [Id, Id][]);
    if (classes.length > 0) out.push({ shape: cmd.shape, ids: [...cmd.ids], classes });
  }
  return out;
}

// ── #973 ([ADR-502](docs/06-decisions.md#adr-502)): the choices the tool is CURRENTLY making for an unstated given ──
//
// ADR-052 made every unstated magnitude free, and ADR-138 made "which pair is equal" a cyclable variant
// rather than a fixed assumption. What neither did was SAY so: a student who typed «משולש שווה שוקיים ABC»
// saw one drawing with one visibly equal pair and could reasonably read it as the tool asserting |AB|=|AC|.
// The figure was honest; its silence was not. This derivation names, per figure, every choice the tool is
// making on the student's behalf — for as long as the student has not made it (operator ruling 2026-09-11:
// persistent, never a one-shot; it disappears the moment the choice is stated).
//
// Pure over the fact list, like everything else here: derived on every render, so it appears with the
// fact, follows «הציגו תצורה אחרת» (the drawn pair is read from the ACTIVE variant), and vanishes when a
// later fact pins the choice or the fact is disabled or removed. Nothing is stored; nothing can go stale.
//
// It is a TABLE keyed on the fact's commands, so a new shape is a row, not a mechanism:
//   • kite / isosceles  → `equal-pair`   (which sides are equal; pinned by a stated equality, ADR-138)
//   • base-less midsegment → `free-endpoint` (which side the free end rides; pinned by «G על PR», ADR-412)
//   • isosceles trapezoid  → `parallel-pair` (the `trapezoid` lowering ASSUMES AB ∥ DC, so the legs follow;
//                            pinned by a stated ∥ on two of the ring's sides). The plain «טרפז ABCD» makes the
//                            same assumption and is a row too (#996, ADR-502 Am. 1 — it was excluded at first).

export type UnstatedChoiceKind = 'equal-pair' | 'parallel-pair' | 'free-endpoint';
/** Runtime list — the i18n net walks it against both locale files (the #882 discipline). */
export const UNSTATED_CHOICE_KINDS: readonly UnstatedChoiceKind[] = ['equal-pair', 'parallel-pair', 'free-endpoint'];

export type UnstatedChoice =
  | {
      factId: string;
      kind: 'equal-pair';
      shape: 'isosceles' | 'kite';
      ids: Id[];
      /** The equal classes AS DRAWN by the active variant — each inner array is two equal segments. */
      pairs: [[Id, Id], [Id, Id]][];
    }
  | {
      factId: string;
      kind: 'free-endpoint';
      shape: 'midsegment' | 'midsegment-free';
      ids: Id[];
      /** The free endpoint, the side it rides in the active variant, and the side the midsegment is therefore parallel to. */
      point: Id;
      side: [Id, Id];
      parallelTo: [Id, Id];
    }
  | {
      factId: string;
      kind: 'parallel-pair';
      shape: 'isosceles-trapezoid' | 'trapezoid';
      ids: Id[];
      /** The pair the lowering ASSUMED parallel — and, for the isosceles one, the legs that equality therefore fell on. */
      parallel: [[Id, Id], [Id, Id]];
      legs?: [[Id, Id], [Id, Id]];
    };

/** The minimal fact shape this derivation reads — the store's `Fact` satisfies it structurally. */
export interface ChoiceFact {
  id: string;
  enabled: boolean;
  cmd: AnyCommand;
}

const sameSeg = (p: [Id, Id], q: [Id, Id]): boolean => seg(p[0], p[1]) === seg(q[0], q[1]);

/** A ring's sides as segments, by index: side i = [ids[i], ids[i+1]] (cyclic). */
const ringSides = (ids: readonly Id[]): [Id, Id][] => ids.map((_, i) => [ids[i], ids[(i + 1) % ids.length]] as [Id, Id]);

/**
 * #989 ([ADR-506](docs/06-decisions.md#adr-506)) — a trapezoid's RING IN FORCE. The `trapezoid` lowering makes
 * sides 0 and 2 of the ring it receives parallel (AB ∥ DC for «טרפז ABCD»): which pair is parallel is a
 * property of the noun and the letters AS NAMED, never of typing order or of which vertex happens to be
 * built last (the 3-D rule of ADR-3D-240, ported). A student who then STATES the other pair («BC מקביל
 * ל-AD») is not adding a second parallel pair — that would be a parallelogram — but naming which pair the
 * trapezoid's is: the stated pair PINS the assumption, so the ring rotates by one and the lowering builds THAT
 * pair. Both pairs stated is a parallelogram the student asked for (the ring stays as named; the second pair
 * remains a constraint and the verifier's trapezoid-morph flag says so honestly). ONE predicate for every
 * reader of "which pair is parallel": the replay pre-scan (which re-seats the lowering and the isosceles
 * macro's legs), the theorem spine (`parallelPairs`) and `unstatedChoices` (is the choice still the tool's).
 */
export function trapezoidRingInForce(
  ids: readonly Id[],
  parallels: readonly { a: Id; b: Id; c: Id; d: Id }[],
): { ring: [Id, Id, Id, Id]; pinned: boolean } {
  const [a, b, c, d] = ids as [Id, Id, Id, Id];
  const sides = ringSides(ids);
  const statesPair = (i: number, j: number) =>
    parallels.some(
      (p) =>
        (sameSeg([p.a, p.b], sides[i]) && sameSeg([p.c, p.d], sides[j])) ||
        (sameSeg([p.a, p.b], sides[j]) && sameSeg([p.c, p.d], sides[i])),
    );
  const pair02 = statesPair(0, 2);
  const pair13 = statesPair(1, 3);
  if (pair13 && !pair02) return { ring: [b, c, d, a], pinned: true };
  return { ring: [a, b, c, d], pinned: pair02 || pair13 };
}

/** The LEGS of a trapezoid ring — sides 3 and 1 (the non-parallel pair), as the |AD| = |BC| tuple the
 *  isosceles macro states them. */
export function trapezoidLegs(ring: readonly Id[]): [[Id, Id], [Id, Id]] {
  return [[ring[0], ring[3]], [ring[1], ring[2]]];
}

export function unstatedChoices(facts: readonly ChoiceFact[]): UnstatedChoice[] {
  const enabled = facts.filter((f) => f.enabled);
  const explicitEqs = enabled.map((f) => f.cmd).filter((c): c is Extract<AnyCommand, { type: 'set-equal' }> => c.type === 'set-equal');
  const onSegs = enabled.map((f) => f.cmd).filter((c): c is Extract<AnyCommand, { type: 'point-on-segment' }> => c.type === 'point-on-segment');
  const parallels = enabled.map((f) => f.cmd).filter((c): c is Extract<AnyCommand, { type: 'set-parallel' }> => c.type === 'set-parallel');
  const out: UnstatedChoice[] = [];

  for (const f of enabled) {
    const c = f.cmd;
    if (c.type === 'shape-variant') {
      if (c.shape === 'midsegment') {
        const [p, q, r, , g] = c.ids;
        const pinned = onSegs.some((o) => o.id === g && (sameSeg([o.a, o.b], [p, r]) || sameSeg([o.a, o.b], [q, r])));
        if (pinned) continue;
        const v = ((c.variant % 2) + 2) % 2;
        out.push({ factId: f.id, kind: 'free-endpoint', shape: 'midsegment', ids: [...c.ids], point: g, side: v === 0 ? [p, r] : [q, r], parallelTo: v === 0 ? [q, r] : [p, r] });
        continue;
      }
      if (c.shape === 'midsegment-free') {
        // Nothing was stated, so the whole configuration is the choice — and naming the side it ended up
        // PARALLEL to describes it completely (that side determines both endpoints). Pinned the moment the
        // student places either endpoint on a side (ADR-412), exactly as the two-variant form is.
        const [p, q, r, e, g] = c.ids;
        const v = ((c.variant % 3) + 3) % 3;
        const sides: [[Id, Id], [Id, Id]] = v === 0 ? [[p, q], [p, r]] : v === 1 ? [[p, q], [q, r]] : [[p, r], [q, r]];
        const parallelTo: [Id, Id] = v === 0 ? [q, r] : v === 1 ? [p, r] : [p, q];
        const pinned = onSegs.some((o) => (o.id === e || o.id === g) && sides.some((s) => sameSeg([o.a, o.b], s)));
        if (pinned) continue;
        out.push({ factId: f.id, kind: 'free-endpoint', shape: 'midsegment-free', ids: [...c.ids], point: g, side: sides[1], parallelTo });
        continue;
      }
      // kite / isosceles: a stated equality on ANY variant's pair pins the choice (the ADR-138 rule
      // `expandShapeVariant` applies) — the same predicate, asked the other way round.
      const pinned = variantPairs(c.shape, c.ids).some((variant) => variant.some((pair) => explicitEqs.some((eq) => eqMatchesPair(eq, pair))));
      if (pinned) continue;
      const pairs = expandShapeVariant(c, [])
        .filter((e): e is Extract<Command, { type: 'set-equal' }> => e.type === 'set-equal')
        .map((e) => [[e.a, e.b], [e.c, e.d]] as [[Id, Id], [Id, Id]]);
      out.push({ factId: f.id, kind: 'equal-pair', shape: c.shape, ids: [...c.ids], pairs });
      continue;
    }
    if (c.type === 'trapezoid') {
      const [a, b, cc, d] = c.ids;
      // #996 (ADR-502 Am. 1, operator 2026-09-13): EVERY trapezoid carries the choice — the lowering assumed
      // AB ∥ DC for the plain «טרפז ABCD» exactly as for the isosceles one. The isosceles macro's leg equality
      // |AD| = |BC| additionally tells the student which sides that assumption made the legs.
      const legsStated = explicitEqs.some((eq) => eqMatchesPair(eq, [a, d, b, cc]));
      // #989 (ADR-506): pinned = a stated ∥ on either opposite pair — the ONE predicate the replay pre-scan
      // re-seats the lowering by, so "the note is gone" and "the figure draws the stated pair" never disagree.
      if (trapezoidRingInForce(c.ids, parallels).pinned) continue;
      out.push(
        legsStated
          ? { factId: f.id, kind: 'parallel-pair', shape: 'isosceles-trapezoid', ids: [...c.ids], parallel: [[a, b], [d, cc]], legs: [[a, d], [b, cc]] }
          : { factId: f.id, kind: 'parallel-pair', shape: 'trapezoid', ids: [...c.ids], parallel: [[a, b], [d, cc]] },
      );
    }
  }
  return out;
}
