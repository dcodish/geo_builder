/**
 * EVERY STATIC DISCRETE AXIS IS ONE DIGIT OF ONE ODOMETER (#2381, ADR-AG-302 — the analytic port of 2-D's ADR-593,
 * copied, never imported: boundary 1).
 *
 * A figure's discrete freedoms are the options its sentences leave open: a constraint `choice` (#1049 — which angle
 * of «משולש ישר זווית» is the right one, which tangency of two circles), a region `choice` (#1708, «משולש קהה
 * זווית»), and the letter order of two crossings named in one sentence (#1539, `crossing-nth both`). 02c R14 says
 * *"discrete ones cycle"*: every COMBINATION of them is a configuration «הציגו תצורה אחרת» must be able to reach.
 *
 * Each used to read its option as `seed % n` — every choice from the same number — so two 2-way choices moved in
 * lockstep and only the diagonal combinations (both 0, both 1) were ever drawn, and a given that needed an
 * off-diagonal one («N1 משמאל ל-N2» over two tangent circles) was refused at every seed. Here the choice seed is
 * read as ONE mixed-radix number: each axis, met in one fixed traversal order, takes the next digit.
 *
 * - **The order.** Constraint choices in construction order (a choice nested in the CHOSEN option takes the next
 *   slot, depth first), then region choices, then the crossing pairs (radix 2, the slowest digits).
 * - **Seed 0 is all zeros**, so every figure's first drawing is what it was.
 * - **A figure with one axis** reads `choiceSeed % n` exactly as before; a figure with only crossing pairs reads
 *   bit k for pair k — the #1539 rule, absorbed unchanged.
 * - **The tangents of one pair of circles are ONE PERMUTATION, read a digit at a time (#2408, ADR-AG-403).** A letter-named
 *   common tangent is a choice of the pair's families; the k-th of a pair picks among the families the earlier ones left,
 *   so its digit's base shrinks (4, 3, 2, 1) and the digits are the Lehmer code of one permutation: P(n, k) assignments,
 *   never nᵏ, and none of them two names on one family. The digit stays at the tangent's place in construction order,
 *   so a new tangent is a new SLOWEST digit: it cannot reshuffle an earlier tangent at any seed, of this pair or another.
 * - Digits past the last axis are never read, so the assignment of `s` is the assignment of `s mod total`: no total
 *   needs computing before the walk, and nested choices (whose count depends on the branch) need no special case.
 */
import { reversedFamily } from './commonTangents';
import type { Constraint } from './solve';
import type { CommonTangentFamily, Construction, Id, Selector } from './types';

/** One reading of a choice seed as a mixed-radix number: each `next(n)` takes the next digit, base n. */
export class Odometer {
  private rest: number;
  /** The digits taken, one per axis with more than one option, in traversal order. */
  readonly digits: number[] = [];
  /** Each digit's radix. */
  readonly radices: number[] = [];
  /** The families of each pair of circles the tangents met so far hold (#2408, ADR-AG-403); null before the walk starts. */
  taken: Map<string, Set<CommonTangentFamily>> | null = null;
  constructor(choiceSeed: number) {
    this.rest = Math.trunc(choiceSeed);
  }
  next(n: number): number {
    if (n <= 1) return 0;
    const d = ((this.rest % n) + n) % n;
    this.rest = (this.rest - d) / n;
    this.digits.push(d);
    this.radices.push(n);
    return d;
  }
  /** How many combinations the axes met so far span — the period of the walk over them. */
  get total(): number {
    return this.radices.reduce((p, n) => p * n, 1);
  }
}

/** A row placing one tangent's touch: which pair of circles (unordered) and which family, read in the pair's sorted order. */
function touchSlot(k: Constraint): { pair: string; family: CommonTangentFamily } | null {
  if (k.t !== 'derived-at' || k.rule.t !== 'common-touch') return null;
  const [a, b]: readonly [Id, Id] = k.rule.circles;
  return a <= b ? { pair: `${a}|${b}`, family: k.rule.family } : { pair: `${b}|${a}`, family: reversedFamily(k.rule.family) };
}
/** The slot an option of a choice takes — null for an option that is no common tangent. */
function slotOfOption(o: Constraint): { pair: string; family: CommonTangentFamily } | null {
  return o.t === 'all' ? o.of.map(touchSlot).find((s) => s !== null) ?? null : touchSlot(o);
}
function take(taken: Map<string, Set<CommonTangentFamily>>, s: { pair: string; family: CommonTangentFamily }): void {
  const held = taken.get(s.pair) ?? new Set<CommonTangentFamily>();
  held.add(s.family);
  taken.set(s.pair, held);
}
/**
 * The families no choice is open on — a tangent a later given settled, or one that had a single family to take — are held
 * before any digit is read, wherever they stand in the list: a choice never offers what is already settled.
 */
function settledSlots(ks: readonly Constraint[]): Map<string, Set<CommonTangentFamily>> {
  const taken = new Map<string, Set<CommonTangentFamily>>();
  for (const k of ks) {
    const s = k.t === 'choice' ? null : slotOfOption(k);
    if (s) take(taken, s);
  }
  return taken;
}
/**
 * What a choice offers: every option, or for a common tangent the options its pair has not taken. With none left the
 * digit is not read and the first option stands: the `distinct` beside the slot then fails, a dead assignment.
 */
function openOptions(k: Extract<Constraint, { t: 'choice' }>, odo: Odometer): readonly Constraint[] {
  const taken = odo.taken;
  if (!taken || taken.size === 0) return k.options;
  const open = k.options.filter((o) => {
    const s = slotOfOption(o);
    return !s || !taken.get(s.pair)?.has(s.family);
  });
  return open.length > 0 ? open : k.options.slice(0, 1);
}

/**
 * The constraints with every choice resolved by the odometer — `picked` (when given) records which option each
 * choice took, keyed by the choice itself, for a reader that must name the option one choice drew.
 */
export function resolveConstraintChoices(ks: readonly Constraint[], odo: Odometer, picked?: Map<Constraint, Constraint>): Constraint[] {
  odo.taken ??= settledSlots(ks);
  return ks.flatMap((k) => {
    if (k.t === 'all') return resolveConstraintChoices(k.of, odo, picked);
    if (k.t !== 'choice') return [k];
    if (k.options.length === 0) return [];
    const open = openOptions(k, odo);
    const option = open[odo.next(open.length)];
    picked?.set(k, option);
    const slot = slotOfOption(option);
    if (slot) take(odo.taken!, slot);
    return resolveConstraintChoices([option], odo, picked);
  });
}

/** The region choices resolved by the odometer (#1708) — each option is an ordinary selector. */
export function resolveSelectorChoicesWith(selectors: readonly Selector[], odo: Odometer, picked?: Map<Selector, Selector>): Selector[] {
  if (!selectors.some((s) => s.kind === 'choice')) return selectors as Selector[];
  return selectors.flatMap((s) => {
    if (s.kind !== 'choice') return [s];
    if (s.options.length === 0) return [];
    const option = s.options[odo.next(s.options.length)];
    picked?.set(s, option);
    return resolveSelectorChoicesWith([option], odo, picked);
  });
}

/**
 * TWO CROSSINGS NAMED IN ONE SENTENCE (#1539) — which letter takes which root is a radix-2 axis; the stated order is
 * digit 0. One digit per PAIR (its two selectors share it), in order of first appearance among the top-level
 * selectors — exactly the set and order `cycledPairs` keyed before this module.
 */
function cyclePairsWith(selectors: readonly Selector[], odo: Odometer): Selector[] {
  const flip = new Map<string, number>();
  let changed = false;
  const out = selectors.map((s) => {
    if (s.kind !== 'crossing-nth' || !s.both) return s;
    const key = JSON.stringify(s.pair.map((k) => ({ ...k, id: '' })));
    if (!flip.has(key)) flip.set(key, odo.next(2));
    if (flip.get(key) === 0) return s;
    changed = true;
    return { ...s, nth: (1 - s.nth) as 0 | 1 };
  });
  return changed ? out : (selectors as Selector[]);
}

/** One configuration's discrete assignment: what every axis took, and the construction it resolves to. */
export interface Assignment {
  constraints: Constraint[];
  selectors: Selector[];
  /** The digits, in axis order — `key` is their spelling, the identity two configurations compare. */
  digits: number[];
  radices: number[];
  /** How many combinations this branch of the axes spans. */
  total: number;
  key: string;
  /** Which option each constraint choice took (nested ones included, on the chosen branch). */
  picked: Map<Constraint, Constraint>;
  /** Which option each region choice took. */
  pickedRegions: Map<Selector, Selector>;
}

/** THE ASSIGNMENT AT A CHOICE SEED — every static discrete axis resolved from one odometer, in one traversal. */
export function assignmentAt(raw: Pick<Construction, 'constraints' | 'selectors'>, choiceSeed: number): Assignment {
  const odo = new Odometer(choiceSeed);
  const picked = new Map<Constraint, Constraint>();
  const pickedRegions = new Map<Selector, Selector>();
  const constraints = resolveConstraintChoices(raw.constraints, odo, picked);
  // Region choices take their digits before the pairs, but the pairs are cycled among the TOP-LEVEL selectors only
  // (as before): resolve each top-level choice in place, then cycle the pairs over the selectors the student stated.
  const top = raw.selectors.map((s) => (s.kind === 'choice' ? resolveSelectorChoicesWith([s], odo, pickedRegions) : null));
  const plain = raw.selectors.filter((s) => s.kind !== 'choice');
  const cycled = cyclePairsWith(plain, odo);
  let at = 0;
  const selectors =
    plain.length < raw.selectors.length || cycled !== plain
      ? raw.selectors.flatMap((s, i) => (s.kind === 'choice' ? top[i]! : [cycled[at++]]))
      : (raw.selectors as Selector[]);
  return { constraints, selectors, digits: odo.digits, radices: odo.radices, total: odo.total, key: odo.digits.join(','), picked, pickedRegions };
}

/**
 * A constraint flattened as an assignment drew it — each choice met takes the option the assignment picked for it
 * (option 0 for one off the assignment's branch). How a reader names what ONE choice drew without re-reading the seed.
 */
export function flattenPicked(k: Constraint, a: Pick<Assignment, 'picked'>): Constraint[] {
  if (k.t === 'all') return k.of.flatMap((x) => flattenPicked(x, a));
  if (k.t !== 'choice') return [k];
  const option = a.picked.get(k) ?? k.options[0];
  return option ? flattenPicked(option, a) : [];
}
