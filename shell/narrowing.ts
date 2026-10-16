/**
 * THE GIVENS FORCED A NARROWER KIND (#1996, ADR-W-129) — one decision, every builder.
 *
 * ## The defect it exists for
 *
 * A figure the givens force into a strictly narrower NAMED kind than the noun the student typed was drawn as
 * that kind without saying so, in every builder: «מקבילית ABCD · ABCD חסום במעגל» drew a rectangle in 2-D and
 * analytic silently, «מקבילית ABCD · AB = BC» drew a rhombus silently everywhere. The one builder that spoke
 * (3-D) derived its sentence from the declared noun's BASE, not from what was forced, so it also fired on a
 * declared «טרפז שווה שוקיים» (nothing narrowed) and named the circle when a right angle had already done it.
 *
 * Operator rulings of 2026-10-13 (#1996, three ballots): every forced narrowing, whatever caused it; one
 * cause-naming sentence family; triangles too, except when the typed given IS the right angle; several givens
 * are listed as typed; the first statement that forces it is the one named; silent when only numeric values
 * force a kind on a plain «משולש» / «מרובע».
 *
 * ## Why it is in `shell/`
 *
 * 3-D had a copy and 2-D and analytic each needed one (docs/22 §9: the third copy moves to `shell/`). Like
 * `proofTarget.ts`, it knows no product and holds no student string: each builder supplies its own sample pool
 * (the vertex coordinates of a ring per sample), its own per-row classes and its own "is it forced with only
 * these rows" callback, and words the note through its own locale with {@link narrowingSentence}.
 *
 * ## The parts
 *
 * - {@link NARROW_IMPLIES} — the kind lattice (exclusive trapezoid, ADR-619): a parallelogram is NOT a
 *   trapezoid, so a trapezoid forced into a parallelogram is out of family — the amber "no longer a trapezoid"
 *   warning (ADR-165 / ADR-AG-189 / ADR-3D-313), never this note.
 * - {@link ringKinds} classifies ONE sample of a ring (a kite about either axis, per sample);
 *   {@link forcedKinds} intersects over the pool; {@link narrowingOf} compares with the declared kind.
 * - {@link attributeCause} — the first statement that forces it (a monotone prefix search), plus every earlier
 *   statement it needs (its co-causes), bounded by {@link CO_CAUSE_CAP} trials.
 * - {@link causeSlot} — which sentence the cause takes (a circle through every vertex, a circle tangent to
 *   every side, a right pyramid, one given, several givens) and the ruled numeric silence.
 */

/** Every named kind the note can speak of. A ring the student named by none of these has no declared kind. */
export type NarrowKind =
  | 'quadrilateral'
  | 'trapezoid'
  | 'isosceles-trapezoid'
  | 'right-trapezoid'
  | 'parallelogram'
  | 'rectangle'
  | 'rhombus'
  | 'kite'
  | 'right-kite'
  | 'square'
  | 'triangle'
  | 'isosceles-triangle'
  | 'equilateral-triangle'
  | 'right-triangle'
  | 'right-isosceles-triangle';

/**
 * `NARROW_IMPLIES[x]` is every kind a genuine `x` also is (reflexive and transitive — written out in full so a
 * reader never has to close it by hand). Since #2169 / #2171 ([ADR-W-131](../docs/06w-decisions-workspace.md#adr-w-131))
 * this is the ONLY copy of the quadrilateral hierarchy: 2-D's and 3-D's `QUAD_IMPLIES` are views derived from it
 * and analytic's `nounsExclude` reads {@link kindRelation}. The right kite (a kite with two right angles — the
 * cyclic kite) has no noun, so it is never a stated kind.
 */
export const NARROW_IMPLIES: Readonly<Record<NarrowKind, readonly NarrowKind[]>> = {
  quadrilateral: ['quadrilateral'],
  trapezoid: ['trapezoid', 'quadrilateral'],
  'isosceles-trapezoid': ['isosceles-trapezoid', 'trapezoid', 'quadrilateral'],
  'right-trapezoid': ['right-trapezoid', 'trapezoid', 'quadrilateral'],
  parallelogram: ['parallelogram', 'quadrilateral'],
  rectangle: ['rectangle', 'parallelogram', 'quadrilateral'],
  rhombus: ['rhombus', 'parallelogram', 'kite', 'quadrilateral'],
  kite: ['kite', 'quadrilateral'],
  'right-kite': ['right-kite', 'kite', 'quadrilateral'],
  square: ['square', 'rectangle', 'rhombus', 'right-kite', 'parallelogram', 'kite', 'quadrilateral'],
  triangle: ['triangle'],
  'isosceles-triangle': ['isosceles-triangle', 'triangle'],
  'equilateral-triangle': ['equilateral-triangle', 'isosceles-triangle', 'triangle'],
  'right-triangle': ['right-triangle', 'triangle'],
  'right-isosceles-triangle': ['right-isosceles-triangle', 'right-triangle', 'isosceles-triangle', 'triangle'],
};

export const NARROW_KINDS = Object.keys(NARROW_IMPLIES) as NarrowKind[];

/** Is a genuine `have` also a `want`? */
export const narrowImplies = (have: NarrowKind, want: NarrowKind): boolean => NARROW_IMPLIES[have].includes(want);

/** The family root of a kind — the plain noun («מרובע» / «משולש»). */
export const familyRoot = (k: NarrowKind): 'quadrilateral' | 'triangle' => (NARROW_IMPLIES[k].includes('triangle') ? 'triangle' : 'quadrilateral');

/**
 * The most general kind that is BOTH `a` and `b` (rectangle ∧ rhombus = square, isosceles ∧ right = right
 * isosceles), or null when no kind is both or the answer is not unique.
 */
export function meetKinds(a: NarrowKind, b: NarrowKind): NarrowKind | null {
  const both = NARROW_KINDS.filter((k) => narrowImplies(k, a) && narrowImplies(k, b));
  const top = both.filter((k) => both.every((o) => narrowImplies(o, k)));
  return top.length === 1 ? top[0] : null;
}

/**
 * #2169 / #2171 / #2180 ([ADR-W-131](../docs/06w-decisions-workspace.md#adr-w-131)) — WHAT A SECOND NOUN DOES TO A
 * RING ALREADY DECLARED, the one relation every builder reads (2-D's `quadRelation`, moved here so 3-D's ARM 3 and
 * store twin and analytic's polygon arm stop judging it from their own copies of the hierarchy, which disagreed):
 * - `implies` — the declared kind already says it (a square is a rectangle; an isosceles trapezoid is a trapezoid):
 *   a restatement, «כבר קיים»;
 * - `narrows` — the stated kind is a special kind of the declared one («מקבילית» → «מלבן», «טרפז» → «טרפז שווה
 *   שוקיים»): the ring takes it (the 2026-10-08 ruling on #1914);
 * - `siblings` — neither implies the other but one kind is both (a rectangle and a rhombus — a square): the ring
 *   becomes that kind (the 2026-10-11 ruling on #1993);
 * - `excludes` — no kind of the lattice is both (the trapezoid family against the parallelogram family or the kite,
 *   and an isosceles against a right trapezoid — its legs equal and one of them perpendicular to the bases makes
 *   both perpendicular, a rectangle): ADR-619's refusal, in every builder (the 2026-10-16 rulings on #2169).
 * Derived from {@link NARROW_IMPLIES}, never a list of pairs.
 */
export type KindRelation = 'implies' | 'narrows' | 'siblings' | 'excludes';
export function kindRelation(declared: NarrowKind, stated: NarrowKind): KindRelation {
  if (narrowImplies(declared, stated)) return 'implies';
  if (narrowImplies(stated, declared)) return 'narrows';
  return NARROW_KINDS.some((k) => narrowImplies(k, declared) && narrowImplies(k, stated)) ? 'siblings' : 'excludes';
}

/**
 * Does a genuine `have` stay a `want` when the ring is read FROM ANY VERTEX IN EITHER DIRECTION (#1988; 2-D's
 * ADR-619, 3-D's ADR-3D-326)? {@link kindRelation} is about CLASSES; a restatement is about a sentence, and two
 * nouns name a particular pair of sides: a trapezoid (of any adjective) names its parallel pair by the ring order, so
 * it never survives an arbitrary reading; the only kinds that imply a kite without being one (the rhombus and the
 * square) are kites about either diagonal. Every other noun is symmetric under the ring's whole dihedral group.
 * One copy since #2169 (ADR-W-131): 2-D's, 3-D's and analytic's restatement checks all read it.
 */
export const kindImpliesInEveryReading = (have: NarrowKind, want: NarrowKind): boolean =>
  narrowImplies(have, want) && !narrowImplies(want, 'trapezoid') && (want !== 'kite' || narrowImplies(have, 'rhombus'));

/** Can no ring be both an `x` and a `y`? Symmetric; {@link kindRelation}'s `excludes`. */
export const kindsExclude = (x: NarrowKind, y: NarrowKind): boolean => kindRelation(x, y) === 'excludes';

/** The kind of a ring declared `declared` once `stated` is said of it too — their meet — or null when they exclude. */
export const kindAfter = (declared: NarrowKind, stated: NarrowKind): NarrowKind | null => meetKinds(declared, stated);

/** The kind in `set` that implies every other kind in it (its least element), or null. */
export function leastKind(set: ReadonlySet<NarrowKind>): NarrowKind | null {
  const least = [...set].filter((k) => [...set].every((o) => narrowImplies(k, o)));
  return least.length === 1 ? least[0] : null;
}

/** A point in any dimension — a builder hands its own coordinates (2-D {x,y} → [x, y]; 3-D → [x, y, z]). */
export type RingPoint = readonly number[];

/** Relative tolerance for two lengths to be equal, and the absolute one (radians) for a right angle / parallel. */
export const NARROW_LENGTH_TOL = 1e-3;
export const NARROW_ANGLE_TOL = (0.5 * Math.PI) / 180;

const sub = (p: RingPoint, q: RingPoint): number[] => p.map((x, i) => x - (q[i] ?? 0));
const dot = (u: readonly number[], w: readonly number[]): number => u.reduce((s, x, i) => s + x * (w[i] ?? 0), 0);
const norm = (u: readonly number[]): number => Math.sqrt(dot(u, u));

/**
 * Every kind ONE sample of a ring is (upward-closed under {@link NARROW_IMPLIES}). `pts` are the ring's
 * vertices in ring order (3 or 4). Per sample on purpose: a kite is a kite about EITHER axis in that sample,
 * so a pool spanning a kite's two axis variants (2-D's ADR-138) still forces «דלתון».
 */
export function ringKinds(pts: readonly RingPoint[], lengthTol = NARROW_LENGTH_TOL, angleTol = NARROW_ANGLE_TOL): Set<NarrowKind> {
  const out = new Set<NarrowKind>();
  const n = pts.length;
  if (n !== 3 && n !== 4) return out;
  const side = (i: number) => sub(pts[(i + 1) % n], pts[i]);
  const sides = Array.from({ length: n }, (_, i) => norm(side(i)));
  const scale = Math.max(...sides);
  if (!(scale > 1e-12) || sides.some((s) => s <= 1e-9 * scale)) return out; // a collapsed ring is no kind
  const eq = (x: number, y: number) => Math.abs(x - y) <= lengthTol * scale;
  /** interior angle at vertex i */
  const angle = (i: number): number => {
    const u = sub(pts[(i + n - 1) % n], pts[i]);
    const w = sub(pts[(i + 1) % n], pts[i]);
    const c = dot(u, w) / (norm(u) * norm(w));
    return Math.acos(Math.max(-1, Math.min(1, c)));
  };
  const right = (i: number) => Math.abs(angle(i) - Math.PI / 2) <= angleTol;
  const add = (k: NarrowKind) => NARROW_IMPLIES[k].forEach((x) => out.add(x));
  if (n === 3) {
    add('triangle');
    const iso = eq(sides[0], sides[1]) || eq(sides[1], sides[2]) || eq(sides[2], sides[0]);
    const equi = eq(sides[0], sides[1]) && eq(sides[1], sides[2]);
    const rt = [0, 1, 2].some(right);
    if (iso) add('isosceles-triangle');
    if (equi) add('equilateral-triangle');
    if (rt) add('right-triangle');
    if (rt && iso) add('right-isosceles-triangle');
    return out;
  }
  add('quadrilateral');
  /** |sin| between opposite sides i and i+2 */
  const parallel = (i: number) => {
    const u = side(i);
    const w = side(i + 2);
    const c = Math.abs(dot(u, w)) / (norm(u) * norm(w));
    return Math.sqrt(Math.max(0, 1 - c * c)) <= Math.sin(angleTol);
  };
  const p02 = parallel(0);
  const p13 = parallel(1);
  const anyRight = [0, 1, 2, 3].some(right);
  if (p02 && p13) {
    add('parallelogram');
    if (anyRight) add('rectangle');
    if (eq(sides[0], sides[1])) add('rhombus');
    if (anyRight && eq(sides[0], sides[1])) add('square');
  } else if (p02 || p13) {
    add('trapezoid');
    const legsEqual = p02 ? eq(sides[1], sides[3]) : eq(sides[0], sides[2]);
    if (legsEqual) add('isosceles-trapezoid');
    if (anyRight) add('right-trapezoid');
  }
  const kiteA = eq(sides[0], sides[1]) && eq(sides[2], sides[3]); // apex at vertex 1 and 3 (axis 1–3)
  const kiteB = eq(sides[1], sides[2]) && eq(sides[3], sides[0]); // axis 0–2
  if (kiteA || kiteB) {
    add('kite');
    // the cyclic kite: the two off-axis angles are right (axis 1–3 ⇒ vertices 0 and 2)
    if ((kiteA && right(0) && right(2)) || (kiteB && right(1) && right(3))) add('right-kite');
  }
  return out;
}

/** The kinds held in EVERY sample of the pool (empty for an empty pool — nothing is forced by no evidence). */
export function forcedKinds(perSample: readonly ReadonlySet<NarrowKind>[]): Set<NarrowKind> {
  if (!perSample.length) return new Set();
  return new Set([...perSample[0]].filter((k) => perSample.every((s) => s.has(k))));
}

/**
 * The kinds forced across the samples that ARE the declared kind. The noun is a given: a sample the noun rules
 * out is not a configuration of the figure (2-D's pool keeps a declared trapezoid's exclusive half only as a
 * drawing preference, so «טרפז ABCD · AD = BC» samples parallelograms too — none of them is the trapezoid the
 * student declared). Null when no sample is the declared kind (out of family: a trapezoid the givens force into
 * a parallelogram keeps its amber warning, never this note) or when fewer than two are (one drawing agreeing
 * with itself proves nothing — the ADR-509 lesson).
 */
export function forcedUnder(declared: NarrowKind, perSample: readonly ReadonlySet<NarrowKind>[]): Set<NarrowKind> | null {
  const kept = perSample.filter((s) => s.has(declared));
  if (kept.length < Math.min(2, perSample.length) || kept.length === 0) return null;
  return forcedKinds(kept);
}

/** A forced narrowing: the declared kind and the narrowest kind the pool forces. */
export interface Narrowing {
  from: NarrowKind;
  to: NarrowKind;
}

/**
 * The narrowing the pool forces on a ring declared `declared`, or null: when the forced kind IS the declared
 * one, when the pool does not keep the declared kind at all (out of family — a trapezoid forced into a
 * parallelogram keeps its own amber warning), or when no single narrowest kind is forced.
 */
export function narrowingOf(declared: NarrowKind, forced: ReadonlySet<NarrowKind>): Narrowing | null {
  if (!forced.has(declared)) return null;
  const to = leastKind(forced);
  if (!to || to === declared) return null;
  return { from: declared, to };
}

/** The most co-cause trials attribution makes; past it the cause is «בגלל הנתונים» with no list. */
export const CO_CAUSE_CAP = 8;

/**
 * Which statements made the ring the narrower kind.
 *
 * `n` candidate rows in typed order (the declaring noun rows are NOT candidates — the builder always includes
 * them); `isForced(rows)` answers "with the declaring rows plus exactly these candidate rows enabled, is the
 * narrower kind forced across the builder's own pool". Forcing is monotone in added rows, so:
 * - k* is the smallest prefix that forces it (a binary search) — **the statement typed first that forces it**
 *   (the operator's 2026-10-13 re-attribution on #1915; follow-up card 7, "name the one typed first");
 * - the co-causes are each earlier row whose muting from that prefix un-forces it (none when k* alone forces it);
 * - the declaring rows alone forcing it (the one-line «X ABCD חסום במעגל» is itself a candidate, so this is a
 *   noun line that forces nothing) gives an empty cause.
 *
 * `rows: null` = the co-cause trials ran past {@link CO_CAUSE_CAP}, or the whole search past `maxTrials` — a builder whose
 * subset trial is dear bounds it by COUNT, never by the clock, so the sentence is a function of the input alone
 * (M3); either way the sentence lists nothing: «בגלל הנתונים, …» (follow-up card 5: *"If the givens cannot be pinned
 * down, «בגלל הנתונים, …» with no list"*).
 */
export function attributeCause(
  n: number,
  isForced: (rows: readonly number[]) => boolean,
  cap = CO_CAUSE_CAP,
  maxTrials = Number.POSITIVE_INFINITY,
): { rows: number[] | null; trials: number } {
  // the fewest trials a search over n rows can need (the empty set, the binary search, k* alone): a budget below it
  // is known to be exceeded before any trial is paid
  if ((n <= 1 ? 1 : 2 + Math.ceil(Math.log2(n))) > maxTrials) return { rows: null, trials: 0 };
  let trials = 0;
  const asked = new Map<string, boolean>();
  const OVER = Symbol('over budget');
  const ask = (rows: readonly number[]) => {
    const key = rows.join(',');
    const hit = asked.get(key);
    if (hit !== undefined) return hit;
    if (trials >= maxTrials) throw OVER;
    trials++;
    const v = isForced(rows);
    asked.set(key, v);
    return v;
  };
  try {
    return search();
  } catch (e) {
    if (e === OVER) return { rows: null, trials }; // the givens could not be pinned within the budget (card 5)
    throw e;
  }
  function search(): { rows: number[] | null; trials: number } {
  const prefix = (k: number) => Array.from({ length: k }, (_, i) => i);
  if (n === 0 || ask([])) return { rows: [], trials };
  // smallest k in 1..n with prefix(k) forced; prefix(n) is forced by assumption (the whole figure is)
  let lo = 1;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ask(prefix(mid))) hi = mid;
    else lo = mid + 1;
  }
  const kStar = lo - 1;
  const earlier = prefix(kStar);
  // k* alone forcing it means no earlier row is needed (monotone: muting any one keeps a superset of {k*}) — one
  // trial instead of one per earlier row, and the common case (one statement did it)
  if (!earlier.length || ask([kStar])) return { rows: [kStar], trials };
  if (earlier.length > cap) return { rows: null, trials };
  const co = earlier.filter((j) => !ask([...earlier.filter((i) => i !== j), kStar]));
  return { rows: [...co, kStar], trials };
  }
}

/**
 * What one statement is, for the sentence: a circle through every vertex of the ring (its membership or
 * inscription), a circle tangent to every side, a right pyramid over the ring, a numeric length or angle value,
 * any other relation, or a definition that constrains nothing by itself («מעגל O», a noun line).
 */
export type CauseClass = 'circum' | 'incircle' | 'rightPyramid' | 'value' | 'relation' | 'definition';

/** Which sentence a cause takes. `silent` = the ruled numeric silence (follow-up card 4 + third ballot A). */
export type CauseSlot =
  | { kind: 'circum' }
  | { kind: 'incircle' }
  | { kind: 'rightPyramid' }
  | { kind: 'given'; row: number }
  | { kind: 'givens'; rows: number[] }
  | { kind: 'unknown' }
  | { kind: 'silent' };

/** The ruled numeric silence, known before any attribution: a plain root declared, and no row but values. */
export const silentByValues = (from: NarrowKind, classes: readonly CauseClass[]): boolean =>
  familyRoot(from) === from && classes.every((c) => c === 'value' || c === 'definition');

/**
 * The sentence slot for attributed cause `rows` (indices into `classes`), the declared kind `from` decides the
 * numeric silence: silent iff `from` is the family root and every cause row is a numeric value. A definition
 * row (a circle the membership rows need, a noun) is never named. A circle row together with any other row is
 * listed as typed («בגלל הנתונים ABCD חסום במעגל ו-AB = BC», follow-up card 6).
 */
export function causeSlot(rows: readonly number[] | null, classes: readonly CauseClass[], from: NarrowKind): CauseSlot {
  if (rows === null) return { kind: 'unknown' };
  const named = rows.filter((r) => classes[r] !== 'definition');
  if (!named.length) return { kind: 'unknown' };
  const cls = named.map((r) => classes[r]);
  if (familyRoot(from) === from && cls.every((c) => c === 'value')) return { kind: 'silent' };
  for (const k of ['circum', 'incircle', 'rightPyramid'] as const) if (cls.every((c) => c === k)) return { kind: k };
  return named.length === 1 ? { kind: 'given', row: named[0] } : { kind: 'givens', rows: named };
}

/** A finished note: the ring's label, the narrowing and the cause sentence slot with the rows' text. */
export interface NarrowingNote {
  /** the ring as the student named it («ABCD») */
  ring: string;
  from: NarrowKind;
  to: NarrowKind;
  cause: Exclude<CauseSlot, { kind: 'silent' }>;
  /** the typed text of each cause row named by the cause (given / givens), in typed order */
  givens: string[];
}

/** The translate function a builder hands in (its own i18n, fixed to the page's language). */
export type NarrowTranslate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * The note as ONE sentence, assembled from the builder's own locale keys under `prefix`:
 * `<prefix>.sentence` {cause, ring, from, to, fromA, toA, kindOf}; `<prefix>.cause.{circum|incircle|
 * rightPyramid|given|givens|unknown}` {given}; `<prefix>.kindOf.<to>` {from}; `<prefix>.shape.<kind>` and
 * `<prefix>.shapeA.<kind>` (the noun with its article where the language has one); `<prefix>.listSep` /
 * `<prefix>.listLast` (how several givens are joined). The strings live in each product's locale.
 */
export function narrowingSentence(note: NarrowingNote, t: NarrowTranslate, prefix: string): string {
  const shape = (k: NarrowKind) => t(`${prefix}.shape.${k}`);
  const shapeA = (k: NarrowKind) => t(`${prefix}.shapeA.${k}`);
  const list = (items: readonly string[]): string =>
    items.length <= 1 ? (items[0] ?? '') : items.slice(0, -1).join(t(`${prefix}.listSep`)) + t(`${prefix}.listLast`) + items[items.length - 1];
  const given = note.cause.kind === 'given' || note.cause.kind === 'givens' ? list(note.givens) : '';
  const cause = t(`${prefix}.cause.${note.cause.kind}`, { given });
  return t(`${prefix}.sentence`, {
    cause,
    ring: note.ring,
    from: shape(note.from),
    to: shape(note.to),
    fromA: shapeA(note.from),
    toA: shapeA(note.to),
    kindOf: t(`${prefix}.kindOf.${note.to}`, { from: shape(note.from) }),
  });
}

/**
 * Is this row the TYPED RIGHT ANGLE of a triangle ring (the card-3 carve-out)? The builder reads its own row
 * into the right angle's vertex and the two ray endpoints — «זווית C = 90» (vertex C, rays to A and B) or
 * «AC ⊥ BC» (two sides meeting at C) — and this answers whether they are the ring's own corner.
 */
export function isRingRightAngle(ring: readonly string[], vertex: string, ray1: string, ray2: string): boolean {
  return ring.length === 3 && ring.includes(vertex) && ring.includes(ray1) && ring.includes(ray2) && new Set([vertex, ray1, ray2]).size === 3;
}

/**
 * The declared kind of a ring from every noun stated for it (the narrowest — their meet) and the triangle
 * carve-out (a typed right angle on its own corner counts as declaring «ישר זווית»). Null when no noun named it.
 */
export function declaredKindOf(nouns: readonly NarrowKind[], typedRightAngle: boolean): NarrowKind | null {
  if (!nouns.length) return null;
  let k: NarrowKind | null = nouns[0];
  for (const x of nouns.slice(1)) k = k ? meetKinds(k, x) : null;
  if (k && typedRightAngle && familyRoot(k) === 'triangle') k = meetKinds(k, 'right-triangle');
  return k;
}

/** Order-free key of a ring (the same four letters in any rotation or direction). */
export const narrowRingKey = (ids: readonly string[]): string => [...ids].sort().join(',');

/**
 * #1993 ([ADR-656](../docs/06-decisions.md#adr-656)) — TWO NOUNS THE RING CARRIES TOGETHER, neither a kind of the
 * other («מלבן ABCD» · «מעוין ABCD»): the ring is now the kind both name (a square), and the student is told so —
 * the operator's 2026-10-11 ruling, *"if a shape can be both, we should say in the message that the shape is now X
 * which is also Y"*, with the wording he approved: «ABCD הוא כעת ריבוע, שהוא גם מלבן וגם מעוין.».
 */
export interface MergeNote {
  ring: string;
  /** the kind the ring now is (every noun's meet) */
  now: NarrowKind;
  /** the first two nouns, in typed order, of which neither implies the other */
  a: NarrowKind;
  b: NarrowKind;
}

/**
 * The sibling pair among a ring's nouns, typed order, and what the ring now is — or null. Quadrilaterals only: the
 * ruling's pairs (rectangle ↔ rhombus, rectangle ↔ kite, parallelogram ↔ kite); a triangle's two nouns are not in it.
 */
export function mergeOf(kinds: readonly NarrowKind[]): Omit<MergeNote, 'ring'> | null {
  const now = declaredKindOf(kinds, false);
  if (!now || familyRoot(now) !== 'quadrilateral') return null;
  for (let i = 0; i < kinds.length; i++) {
    for (let j = i + 1; j < kinds.length; j++) {
      const [a, b] = [kinds[i], kinds[j]];
      if (!narrowImplies(a, b) && !narrowImplies(b, a) && meetKinds(a, b)) return { now, a, b };
    }
  }
  return null;
}

/** The merge note as one sentence: `<prefix>.merged` {ring, now, a, b, nowA, aA, bA}. */
export function mergeSentence(note: MergeNote, t: NarrowTranslate, prefix: string): string {
  const shape = (k: NarrowKind) => t(`${prefix}.shape.${k}`);
  const shapeA = (k: NarrowKind) => t(`${prefix}.shapeA.${k}`);
  return t(`${prefix}.merged`, { ring: note.ring, now: shape(note.now), a: shape(note.a), b: shape(note.b), nowA: shapeA(note.now), aA: shapeA(note.a), bA: shapeA(note.b) });
}

/** Either note a ring can carry. */
export type RingNote = NarrowingNote | MergeNote;
export const isMergeNote = (n: RingNote): n is MergeNote => 'now' in n;
