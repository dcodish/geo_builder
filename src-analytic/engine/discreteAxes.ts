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
 * - Digits past the last axis are never read, so the assignment of `s` is the assignment of `s mod total`: no total
 *   needs computing before the walk, and nested choices (whose count depends on the branch) need no special case.
 */
import type { Constraint } from './solve';
import type { Construction, Selector } from './types';

/** One reading of a choice seed as a mixed-radix number: each `next(n)` takes the next digit, base n. */
export class Odometer {
  private rest: number;
  /** The digits taken, one per axis with more than one option, in traversal order. */
  readonly digits: number[] = [];
  /** Each digit's radix. */
  readonly radices: number[] = [];
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

/**
 * The constraints with every choice resolved by the odometer — `picked` (when given) records which option each
 * choice took, keyed by the choice itself, for a reader that must name the option one choice drew.
 */
export function resolveConstraintChoices(ks: readonly Constraint[], odo: Odometer, picked?: Map<Constraint, Constraint>): Constraint[] {
  return ks.flatMap((k) => {
    if (k.t === 'all') return resolveConstraintChoices(k.of, odo, picked);
    if (k.t !== 'choice') return [k];
    if (k.options.length === 0) return [];
    const option = k.options[odo.next(k.options.length)];
    picked?.set(k, option);
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
