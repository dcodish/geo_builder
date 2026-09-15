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
import type { Constraint } from './solve';
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
    // Which pair is parallel IS stated by the vertex order: `AB ∥ DC` are the bases of `ABCD`.
    givens: ([a, b, c, d]) => [parallel(a, b, d, c)],
  },
  'טרפז שווה שוקיים': {
    arity: 4,
    givens: ([a, b, c, d]) => [parallel(a, b, d, c), equal(a, d, b, c)],
  },
  'טרפז ישר זווית': {
    // Both right angles sit on the same leg, so this is determined and needs no choice.
    arity: 4,
    givens: ([a, b, c, d]) => [parallel(a, b, d, c), rightAngleAt(a, b, d)],
  },
  דלתון: {
    // A kite: two pairs of ADJACENT equal sides, meeting at `A` and at `C`. That makes `AC` the axis
    // of symmetry, which is why this row — and only some others — can name a principal diagonal.
    arity: 4,
    givens: ([a, b, c, d]) => [equal(a, b, a, d), equal(c, b, c, d)],
    principalDiagonal: ([a, , c]) => [a, c],
  },
};

/** «ישר-זווית» ≡ «ישר זווית», and «ה» may front the noun — one spelling reaches the table. */
export const normalizeShapeNoun = (src: string): string =>
  src.replace(/[-־]/g, ' ').replace(/\s+/g, ' ').replace(/^ה/, '').trim();

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
  JSON.stringify(option) === JSON.stringify(stated);

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
