/**
 * THE SHAPE REGISTRY — a noun is a table row, not a feature (#1049).
 *
 * Operator, 2026-09-15: *"we need support for **all kinds of 2d shapes**. **I don't want to mention
 * each one.**"* That sentence is the requirement, and it is a requirement about the SHAPE OF THE
 * CODE: adding «דלתון» must be adding a line here and touching nothing else. Every row below lowers
 * its noun to constraints that already exist — a relation and a length equation — so the solve, the
 * DOF accounting and the honest failure are all inherited rather than rebuilt per noun.
 *
 * **Nothing here is geometry code.** `parallel(a, b, c, d)` and `equal(a, b, c, d)` are the whole
 * vocabulary, and a row that needs a third helper is a signal that the constraint layer is missing a
 * kind — not that this table needs an exception.
 *
 * ## The unstated choice
 *
 * «משולש ישר-זווית ABC» does not say which angle is right, and
 * [02c R14](../../docs/02c-requirements-analytic.md) is explicit that an unstated choice is a degree
 * of freedom: *"continuous ones sample and resample; discrete ones cycle"*. So such a row emits a
 * `choice` over its seats, which «הציגו תצורה אחרת» walks. Choosing one silently would assert a given
 * the question never gave — [ADR-052](../../docs/06-decisions.md#adr-052)'s cardinal sin — and it is
 * exactly what «זווית B ישרה» is for: the student consuming the discrete freedom themselves.
 *
 * ## Vertex order is the figure's own convention
 *
 * `ABCD` names the ring in order, so `AB` and `DC` are opposite sides and `AC` and `BD` are the
 * diagonals. Every row reads its vertices that way and none of them has to say so.
 */
import { parseLengthExpr } from './lengths';
import { sameConstraint, type Constraint } from './solve';
import type { Id } from './types';

/** `ab ∥ cd` / `ab ⊥ cd`, over the point pairs the ring gives. */
const rel = (kind: 'parallel' | 'perpendicular', a: Id, b: Id, c: Id, d: Id): Constraint => ({
  t: 'relation',
  rel: kind,
  u: { k: 'points', a, b },
  v: { k: 'points', a: c, b: d },
});

const parallel = (a: Id, b: Id, c: Id, d: Id) => rel('parallel', a, b, c, d);

/**
 * The parallel pair a TRAPEZOID noun carries — marked as the tool's own assumption (#1159).
 *
 * «טרפז ABCD» promises *a* pair of parallel sides, and the ring order suggests which. The student
 * stated a trapezoid; they did not state a pair. So this seat defaults by lettering and YIELDS the
 * moment they name one — and until they do, it may never be quoted back at them as something that
 * already follows from their own givens.
 *
 * This is [ADR-506](../../docs/06-decisions.md#adr-506)'s decision, ported rather than copied: the
 * 2-D tree reached it from the same operator complaint and expresses it as `trapezoidRingInForce`
 * over its own model. Trees do not share code here; they share rulings.
 */
const assumedParallel = (a: Id, b: Id, c: Id, d: Id): Constraint => ({
  t: 'relation',
  rel: 'parallel',
  u: { k: 'points', a, b },
  v: { k: 'points', a: c, b: d },
  assumed: true,
});

/**
 * A right angle AT `v`, between the rays to `p` and `q`.
 *
 * Built through one function so that the angle rule («זווית B ישרה») and a shape's own seat produce
 * the IDENTICAL constraint — which is what lets {@link collapses} recognise that the student has just
 * named one of the options, by structure rather than by a special case.
 */
export const rightAngleAt = (v: Id, p: Id, q: Id): Constraint => {
  // The rays are SORTED, so «זווית B ישרה» and a seat built from the ring produce the same object
  // whichever order the vertices arrived in. Without this the collapse would depend on spelling.
  const [x, y] = [p, q].sort();
  return rel('perpendicular', v, x, v, y);
};

/** `|ab| = |cd|`, through the same length parser every «AB = CD» sentence uses. */
const equal = (a: Id, b: Id, c: Id, d: Id): Constraint => ({
  t: 'length-eq',
  left: parseLengthExpr(`${a}${b}`)!,
  right: parseLengthExpr(`${c}${d}`)!,
});

/** Exactly one of these holds, and the student has not said which. */
const choice = (options: Constraint[]): Constraint => ({ t: 'choice', options });

/** What a shape noun carries: how many vertices it needs, and what it asserts about them. */
export interface ShapeRow {
  /** 3 for a triangle, 4 for a quadrilateral — checked before the constraints are built (#1042). */
  arity: number;
  /** The givens the noun carries, over its vertices in ring order. */
  givens: (v: Id[]) => Constraint[];
  /**
   * Does this noun distinguish a PRINCIPAL diagonal, and if so which pair of vertices is it?
   *
   * A kite's principal diagonal is its axis of symmetry — a geometric fact, not a naming
   * convention — so it can be named. A plain quadrilateral has no such thing, and «האלכסון הראשי»
   * there must be refused rather than guessed ([#1070](https://github.com/dcodish/geo_builder/issues/1070)).
   */
  principalDiagonal?: (v: Id[]) => [Id, Id];
}

/**
 * The table. Hebrew keys are the nouns as the exam writes them; `-` and space variants are
 * normalised by the caller before the lookup, so «ישר זווית» and «ישר-זווית» are one row.
 */
export const SHAPES: Record<string, ShapeRow> = {
  // --- triangles ---
  משולש: { arity: 3, givens: () => [] },
  'משולש ישר זווית': {
    arity: 3,
    // WHICH angle is right is unstated — three seats, cycled.
    givens: ([a, b, c]) => [choice([rightAngleAt(a, b, c), rightAngleAt(b, a, c), rightAngleAt(c, a, b)])],
  },
  'משולש שווה שוקיים': {
    arity: 3,
    // WHICH pair is equal is unstated, in exactly the same way.
    givens: ([a, b, c]) => [choice([equal(a, b, a, c), equal(b, a, b, c), equal(c, a, c, b)])],
  },
  'משולש שווה צלעות': {
    arity: 3,
    givens: ([a, b, c]) => [equal(a, b, b, c), equal(b, c, c, a)],
  },
  // --- quadrilaterals ---
  מרובע: { arity: 4, givens: () => [] },
  מקבילית: {
    arity: 4,
    givens: ([a, b, c, d]) => [parallel(a, b, d, c), parallel(a, d, b, c)],
  },
  מלבן: {
    // A parallelogram with one right angle has four; naming the seat asserts nothing extra, so this
    // row has no choice in it.
    arity: 4,
    givens: ([a, b, c, d]) => [parallel(a, b, d, c), parallel(a, d, b, c), rightAngleAt(a, b, d)],
  },
  ריבוע: {
    arity: 4,
    givens: ([a, b, c, d]) => [
      parallel(a, b, d, c),
      parallel(a, d, b, c),
      rightAngleAt(a, b, d),
      equal(a, b, b, c),
    ],
  },
  מעוין: {
    arity: 4,
    givens: ([a, b, c, d]) => [parallel(a, b, d, c), parallel(a, d, b, c), equal(a, b, b, c)],
    // A rhombus's diagonals are not interchangeable in a figure, but neither is distinguished by the
    // NOUN — «הראשי» has no referent here, and guessing one would assert a given (#1070).
  },
  טרפז: {
    arity: 4,
    // Which pair is parallel is the TOOL'S ASSUMPTION, defaulted by ring order and then pinned or
    // displaced the moment the student names a pair (#1159) — see `assumedParallel`.
    givens: ([a, b, c, d]) => [assumedParallel(a, b, d, c)],
  },
  'טרפז שווה שוקיים': {
    arity: 4,
    givens: ([a, b, c, d]) => [assumedParallel(a, b, d, c), equal(a, d, b, c)],
  },
  'טרפז ישר זווית': {
    // Both right angles sit on the same leg, so this is determined and needs no choice.
    arity: 4,
    givens: ([a, b, c, d]) => [assumedParallel(a, b, d, c), rightAngleAt(a, b, d)],
  },
  דלתון: {
    // A kite: two pairs of ADJACENT equal sides, meeting at `A` and at `C`. That makes `AC` the axis
    // of symmetry, which is why this row — and only some others — can name a principal diagonal.
    arity: 4,
    givens: ([a, b, c, d]) => [equal(a, b, a, d), equal(c, b, c, d)],
    principalDiagonal: ([a, , c]) => [a, c],
  },
};

/**
 * THE ANGLE NOUN'S STEM, in both of its spellings (#1407, ADR-AG-155).
 *
 * Hebrew writes «זווית» plene and «זוית» defective, and students type both. 2-D has read both since
 * #244 through its lexicon's `זו?וי` (the ADR-3D-032 vav class); this tree spelled the noun with the
 * double vav in every rule, so «זוית C ישרה» was `not-handled` everywhere at once. Every Hebrew angle
 * pattern in analytic — the noun atom of the angle rules, the incentre's «חוצי הזוויות», the
 * «הזווית בין … לציר ה-x» question, and the shape nouns below — composes THIS stem, so a new angle rule
 * inherits both spellings instead of re-spelling the word. It lives here, beside the shape nouns,
 * because the parser, the question lane and this registry all read it and the parser already imports
 * this module (the reverse import would be a cycle).
 */
export const ANGLE_STEM_HE = 'זו?וי';

/**
 * Plene/defective VARIANTS of the nouns in this table, folded onto the canonical key (#1407).
 *
 * The 2-D spelling folds (#389, ADR-405) read «מעויין» as «מעוין» and «שוה» as «שווה», and 2-D's angle
 * class reads «ישר-זוית»; a key-by-string table misses all three unless its one normaliser folds them.
 * Word-bounded, so no fold fires inside a longer word.
 */
const SPELLING_FOLDS: ReadonlyArray<[RegExp, string]> = [
  [new RegExp(`(?<![א-ת])${ANGLE_STEM_HE}ת(?![א-ת])`, 'g'), 'זווית'],
  [/(?<![א-ת])מעויין(?![א-ת])/g, 'מעוין'],
  [/(?<![א-ת])שוה(?![א-ת])/g, 'שווה'],
];

/** «ישר-זווית» ≡ «ישר זווית», and «ה» may front the noun — one spelling reaches the table. */
export const normalizeShapeNoun = (src: string): string =>
  SPELLING_FOLDS.reduce(
    (s, [from, to]) => s.replace(from, to),
    src.replace(/[-־]/g, ' ').replace(/\s+/g, ' ').replace(/^ה/, '').trim(),
  );

export const shapeRow = (noun: string): ShapeRow | null => SHAPES[normalizeShapeNoun(noun)] ?? null;

/**
 * Is this noun the GENERIC one for its arity — «משולש», «מרובע» — asserting nothing but the ring?
 *
 * Read off the row rather than listed, so a future generic noun needs no second registration. It
 * is what lets «מרובע ABCD» then «דלתון ABCD» record the kite: a specific noun tells the figure
 * what it IS, while the reverse order says nothing new and leaves the naming alone.
 */
export const isGenericNoun = (noun: string): boolean => {
  const row = shapeRow(noun);
  return !!row && row.givens(['A', 'B', 'C', 'D'].slice(0, row.arity)).length === 0;
};

/**
 * Does `stated` name one of `choice`'s options?
 *
 * Structural, over the canonical builders above, so «זווית B ישרה» collapses the seat it names and
 * nothing else. Comparing the serialised form is honest here precisely because both sides are built
 * by the functions in this file — there is no second way to spell a right angle at `B`.
 */
export const namesOption = (option: Constraint, stated: Constraint): boolean =>
  sameConstraint(option, stated);

/** The two pairs of OPPOSITE sides of a ring, as unordered point-pair keys — `ABCD` ⇒ AB|DC, BC|AD. */
const oppositePairs = (v: readonly Id[]): Array<[string, string]> => {
  const key = (a: Id, b: Id) => [a, b].sort().join(',');
  const out: Array<[string, string]> = [];
  const n = v.length;
  for (let i = 0; i < n / 2; i += 1) {
    out.push([key(v[i], v[(i + 1) % n]), key(v[(i + 2) % n], v[(i + 3) % n])]);
  }
  return out;
};

/** The point-pair key of a relation operand, or null when it is not two points. */
const operandKey = (d: { k: string; a?: Id; b?: Id }): string | null =>
  d.k === 'points' && d.a && d.b ? [d.a, d.b].sort().join(',') : null;

/**
 * WHICH ASSUMPTION DOES THIS STATEMENT DISPLACE, if any — the index in `c.constraints`, or −1 (#1159).
 *
 * The student has named a pair of parallel sides. It displaces the tool's assumed pair when both
 * belong to the SAME declared ring and they are its two different pairs of opposite sides — «טרפז
 * ABCD» assumes `AB ∥ DC`, and «BC מקביל ל-AD» is the other pair of the same quadrilateral.
 *
 * Read from the RING rather than from the letters, so it cannot fire on two segments that merely
 * happen to share names with a polygon's sides, and so a noun added later inherits it. A statement
 * about a pair that is not an opposite-side pair of that ring — a diagonal, a side against something
 * outside the figure — displaces nothing and records as the ordinary constraint it is.
 */
export function displacedAssumption(
  c: { objects: ReadonlyArray<{ kind: string; vertices?: Id[] }>; constraints: readonly Constraint[] },
  stated: Constraint,
): number {
  if (stated.t !== 'relation' || stated.rel !== 'parallel') return -1;
  const su = operandKey(stated.u);
  const sv = operandKey(stated.v);
  if (!su || !sv) return -1;

  return c.constraints.findIndex((k) => {
    if (!(k.t === 'relation' && k.rel === 'parallel' && k.assumed)) return false;
    const au = operandKey(k.u);
    const av = operandKey(k.v);
    if (!au || !av) return false;
    return c.objects.some((o) => {
      if (o.kind !== 'polygon' || !o.vertices || o.vertices.length < 4) return false;
      const pairs = oppositePairs(o.vertices).map((p) => p.slice().sort().join('|'));
      const assumedPair = [au, av].sort().join('|');
      const statedPair = [su, sv].sort().join('|');
      return statedPair !== assumedPair && pairs.includes(assumedPair) && pairs.includes(statedPair);
    });
  });
}

/**
 * The English nouns, as aliases onto the Hebrew rows — never a second table.
 *
 * A parallel table is how the three drifted shape-noun lists this issue found came to exist
 * (ADR-043's class). One row, one set of givens, whichever language named it.
 */
export const EN_SHAPE: Record<string, string> = {
  triangle: 'משולש',
  'right triangle': 'משולש ישר זווית',
  'right-angled triangle': 'משולש ישר זווית',
  'isosceles triangle': 'משולש שווה שוקיים',
  'equilateral triangle': 'משולש שווה צלעות',
  quadrilateral: 'מרובע',
  parallelogram: 'מקבילית',
  rectangle: 'מלבן',
  square: 'ריבוע',
  rhombus: 'מעוין',
  trapezoid: 'טרפז',
  trapezium: 'טרפז',
  'isosceles trapezoid': 'טרפז שווה שוקיים',
  'right trapezoid': 'טרפז ישר זווית',
  kite: 'דלתון',
};
