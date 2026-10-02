/**
 * ONE PLANE-GEOMETRY SENTENCE, ONE VERDICT IN EVERY BUILDER (#1649, ADR-W-108) — the shared rows, written
 * per docs/28 §5c.
 *
 * The operator, 2026-10-02: *"we need a rule that ensures consistency in data input"*, and the governing
 * ruling the same day: *"analytics and 2d should have same user experience"* — for plane-geometry input
 * **2-D's verdict is the reference**, and a sentence 2-D builds, refuses or asks about gets the same answer
 * in the analytic builder (and, for the core plane families, in 3-D). The step-1 audit
 * (`#1649`, sections A–D) measured 474 plane sentences and found the three builders agreeing on 48%.
 *
 * `shell/` may not import a product, so no single test can run two builders. The equality is carried
 * TRANSITIVELY instead: every row states the verdict the reference gives (`expect`), the 2-D thin lock
 * asserts 2-D gives it, and every other builder's thin lock asserts the same `expect`. Two locks that each
 * equal one literal equal each other.
 *
 * - `src/__tests__/geo-input-parity.test.ts` — 2-D, through `decideDeterministic2D` (the pre-LLM lane
 *   `runSubmit` dispatches), applying each commit to the store so the next line sees the figure.
 * - `src-analytic/__tests__/geo-input-parity.test.ts` — analytic, through `decideSubmit`.
 * - `src3d/__tests__/geo-input-parity.test.ts` — 3-D, through `decideSubmit3`.
 * - `shell/__tests__/geo-input-parity-meta.test.ts` — the meta-lock: the same checks against broken runners.
 *
 * ## The three kinds of row
 *
 * - **A parity row** — every product it is expected in gives `expect` on its last line.
 * - **A known-gap row** (`knownGap`) — a measured disparity with the issue that owns it. The named product
 *   must STILL differ; when a fix makes it agree, the row fails with "now …s — move it to the parity rows",
 *   so the gap list only ever shrinks (the #1618 corpus-ratchet idea).
 * - **An exception row** (`exception: 'Xn'`) — a sentence family one builder reads by design and another
 *   does not (coordinates, equations, solids …). The builders in `mustRefuse` must answer it honestly —
 *   refuse, ask, or hand it to the model — and never BUILD it: building a slope as a length (#1654) or a
 *   sphere as a circle (#1657) is the defect this catches.
 *
 * ## The rule this lock enforces (docs/22 §10)
 *
 * A plane-geometry input change lands in every builder that should read it, or adds a known-gap row
 * naming its issue; a sentence one builder reads by design needs a family in {@link EXCEPTIONS}. The
 * catalog check ({@link catalogCoverageFaults}) makes that rule reach every sentence a builder's guide
 * advertises: each one is a step of some row, or belongs to a topic exception, or sits on a ratchet
 * allowlist that may only shrink.
 */

export type Product = '2d' | 'analytic' | '3d';
export const PRODUCTS: readonly Product[] = ['2d', 'analytic', '3d'];

/**
 * What a builder's REAL submit decision did with one line.
 *
 * - `builds` — recorded / committed, or already known (the line is accepted and adds nothing).
 * - `refused` — an owned refusal: the builder understood the line and said no, with a reason.
 * - `asks` — a clarifying question («which circle?», «AB the vector or the length?»).
 * - `not-handled` — the deterministic lane has no answer; the builder would hand the line to the model.
 */
export type Verdict = 'builds' | 'refused' | 'asks' | 'not-handled';

export interface StepVerdict {
  verdict: Verdict;
  /** the product's own code or i18n key, for the fault message */
  code?: string;
}

/**
 * Submit `steps` IN ORDER on an EMPTY canvas through the product's real submit decision, carrying the
 * figure forward exactly as the app does after an accepted line. One verdict per step: an early return
 * is a fault, never a pass.
 */
export type StepRunner = (steps: readonly string[]) => readonly StepVerdict[] | Promise<readonly StepVerdict[]>;

export type ExceptionId = 'X1' | 'X2' | 'X3' | 'X4' | 'X5' | 'X6' | 'X7' | 'X8' | 'X9';

export interface ExceptionFamily {
  title: string;
  reason: string;
  /** the builders that read this family */
  products: readonly Product[];
  /** the builders that must NOT build it — an honest refusal, a question, or the model; never a commit */
  mustRefuse: readonly Product[];
  /**
   * A TOPIC family lies outside plane geometry (coordinates, equations, space). Its catalog sentences
   * need no parity row. X8 and X9 only narrow WHERE plane geometry is expected (3-D), so their sentences
   * still need rows for 2-D ↔ analytic.
   */
  topic: boolean;
  /** how a sentence of the family is recognised (catalog coverage, and a row's own consistency check) */
  patterns: readonly RegExp[];
}

/**
 * The exceptions table (#1649 §C, operator rulings 2026-10-02: X1–X9 as proposed; the 2-D-only
 * candidates X10–X13 are PORTED to analytic, so they are known-gap rows, and there are no 2-D-only
 * exceptions).
 */
export const EXCEPTIONS: Readonly<Record<ExceptionId, ExceptionFamily>> = {
  X1: {
    title: 'coordinates, the origin, the axes, quadrants',
    reason: 'the coordinate frame: 2-D is coordinate-free by design and sends these to the analytic builder',
    products: ['analytic', '3d'],
    mustRefuse: ['2d'],
    topic: true,
    patterns: [/\(\s*[-\w√.+ ]+,/, /ציר ה-?\s?[xyz]/, /ראשית/, /רביע/, /הצירים/],
  },
  X2: {
    title: 'equations of lines, circles and conics; slopes; focus and directrix',
    reason: "analytic geometry's subject; 2-D sends these to the analytic builder, 3-D has its own R³ lane (X3)",
    products: ['analytic'],
    mustRefuse: ['2d'],
    topic: true,
    patterns: [/משוואת|שמשוואתו|שיפוע|מוקד|מדריך|פרבולה|אליפסה|היפרבולה/, /[xy]\s*\^|[xy]\s*[=+-]|=\s*-?\d*[xy]\b|\d[xy]\b/],
  },
  X3: {
    title: 'parametric lines and plane equations in R³',
    reason: "3-D's algebraic lane («ℓ: x = (…) + t(…)», «π1: z − 3 = 0»)",
    products: ['3d'],
    mustRefuse: ['2d'],
    topic: true,
    patterns: [/\bt\s*\(/, /(?<![\d)])π/,/ℓ/, /\[x[yz]\]/, /ה-xy/],
  },
  X4: {
    title: 'named lines without points',
    reason: '2-D names a line by two of its points; «ישר l1», «B על l1», «l1 מקביל ל-l2» are analytic and 3-D forms',
    products: ['analytic', '3d'],
    mustRefuse: ['2d'],
    topic: true,
    patterns: [/\bl\d?\b/, /ישר [a-z]\b/, /הישר [a-z]\b/, /ישר \d/, /הישר \d/, /ישר I\b/, /הישרים \d/],
  },
  X5: {
    title: 'parameters and domains',
    reason:
      'the symbolic-parameter lanes («k הוא פרמטר», «t פרמטר חיובי»): 2-D declares no parameters and refuses the declaration. A BOUND on a letter («0 < k < 6») is not this family: 2-D records it as waiting for its letter (ADR-562, #1658), so it is a plain parity row',
    products: ['analytic', '3d'],
    mustRefuse: ['2d'],
    topic: true,
    patterns: [/פרמטר/, /^\s*[a-z]\s*[<>]/, /^\s*[a-z]\s*=\s*[\d/]+\s*$/, /^\s*\d+\s*<\s*[a-z]\s*</],
  },
  X6: {
    title: 'coordinate components and distance notation',
    reason: 'coordinate notation («x של A הוא 5», «x_B > x_D», «d_{AB} = 10»)',
    products: ['analytic'],
    mustRefuse: ['2d'],
    topic: true,
    patterns: [/[xyz]_\{?[A-Z]/, /[xyz] של/, /שיעור ה-?\s?[xyz]/, /d_\{/],
  },
  X7: {
    title: 'solids, planes, skew lines, space vectors, volumes, primes',
    reason: '3-D only by design (vectors: operator ruling 2026-09-18, #1184)',
    products: ['3d'],
    mustRefuse: ['2d', 'analytic'],
    topic: true,
    patterns: [
      /קובי|תיבה|מנסרה|פירמידה|טטראדר|ארבעון|מקבילון|חרוט|גליל|כדור/,
      /מישור|מצטלב|נפח|וקטור|פאה|מעטפת|בסיס|היטל|מתלכד/,
      /\|\d*[a-zA-Z]|·|'|׳|\b\d*[uvw]\b|\d[uvw]\b/,
      /[∥⊥]\s*[A-Z]{3}\b/,
      /יוצר זוויות שוות/,
    ],
  },
  X8: {
    title: 'circle geometry (tangents, chords, arcs, inscribed figures, two circles)',
    reason:
      "not part of the space question: 3-D models circles only as solid bases, so it is not expected there — except the four circle rows of 3-D's own catalog, which are plain rows",
    products: ['2d', 'analytic'],
    mustRefuse: [],
    topic: false,
    patterns: [/מעגל|משיק|מיתר|קוטר|קשת|רדיוס|גזרה|מרכזית|חסימה|חוסם|חסום/],
  },
  X9: {
    title: 'free points',
    reason:
      '3-D defines a point as a vertex of a solid, by coordinates or by a construction — never «נקודה A» — so a row whose context needs a free point cannot be typed there',
    products: ['2d', 'analytic'],
    mustRefuse: [],
    topic: false,
    patterns: [/(?:^|\s)נקודה [A-Z]/, /^נקודות /],
  },
};

/** The plane families of the audit (§A), for reading the rows. */
export type Family =
  | 'polygons'
  | 'angles'
  | 'parallel-perpendicular'
  | 'lengths'
  | 'points-incidence'
  | 'midpoint-ratio'
  | 'intersections'
  | 'cevians-centres'
  | 'area-perimeter'
  | 'frame'
  | 'inscribed'
  | 'chords-arcs'
  | 'circles'
  | 'tangents'
  | 'topic';

/**
 * The issue that owns a known gap — always a filed issue. A gap with no issue is not committed: file it
 * first (`rowFaults` rejects anything but `#NNNN`, whatever the type checker lets through).
 */
export type GapIssue = `#${number}`;

export interface KnownGap {
  product: Product;
  issue: GapIssue;
}

export interface ParityRow {
  id: string;
  family: Family;
  /** the context lines, then the sentence under test (LAST) */
  steps: readonly string[];
  /**
   * The context for one product where the shared one cannot be typed there (3-D has no circle and no
   * free point). The sentence under test — the last step — is never replaced.
   */
  contextFor?: Partial<Record<Product, readonly string[]>>;
  /**
   * The verdict every expected product must give on the last line: 2-D's, measured — or, on a row where
   * 2-D itself is the known gap, the verdict the other builders give and 2-D owes.
   */
  expect: Exclude<Verdict, 'not-handled'>;
  exception?: ExceptionId;
  /**
   * Narrows an exception row to SOME of the family's builders, where another reads the family in its own
   * spelling only («A(2,6)» is analytic's; 3-D writes «A(2,-2,6)»). The rest of the family is not checked.
   */
  only?: readonly Product[];
  knownGap?: readonly KnownGap[];
  note?: string;
}

/** How one product takes part in one row. */
export type Role = 'expected' | 'gap' | 'must-refuse' | 'free';

export function roleOf(row: ParityRow, product: Product): Role {
  if (row.knownGap?.some((g) => g.product === product)) return 'gap';
  if (!row.exception) return 'expected';
  const x = EXCEPTIONS[row.exception];
  if (x.products.includes(product)) return !row.only || row.only.includes(product) ? 'expected' : 'free';
  return x.mustRefuse.includes(product) ? 'must-refuse' : 'free';
}

/** The lines `product` submits for `row`: its context, then the shared sentence under test. */
export function stepsFor(row: ParityRow, product: Product): readonly string[] {
  const last = row.steps[row.steps.length - 1];
  const ctx = row.contextFor?.[product] ?? row.steps.slice(0, -1);
  return [...ctx, last];
}

const show = (v: StepVerdict | undefined) => (v ? `${v.verdict}${v.code ? ` (${v.code})` : ''}` : 'nothing');

/**
 * Every violated property, named. Empty array = every runner given conforms.
 *
 * Each thin lock passes ONE runner (its own product); the meta-lock passes stubs. A product with no
 * runner is not checked here — its own thin lock checks it against the same rows.
 */
export async function parityFaults(
  runners: Partial<Record<Product, StepRunner>>,
  rows: readonly ParityRow[] = PARITY_ROWS,
): Promise<string[]> {
  const faults: string[] = [];
  for (const product of PRODUCTS) {
    const run = runners[product];
    if (!run) continue;
    for (const row of rows) {
      const role = roleOf(row, product);
      if (role === 'free') continue;
      const steps = stepsFor(row, product);
      const got = await run(steps);
      const where = `[${row.id}] ${product}`;
      if (got.length !== steps.length) {
        faults.push(`${where}: the runner answered ${got.length} of ${steps.length} steps — an early return proves nothing`);
        continue;
      }
      const ctxBroken = steps.slice(0, -1).findIndex((_, i) => got[i].verdict !== 'builds');
      // A known gap may fail in its context too (the missing capability can sit there); it is checked on its
      // last line only, so the row still flips the moment the builder gives the expected verdict.
      if (ctxBroken >= 0 && role !== 'gap') {
        faults.push(`${where}: context step «${steps[ctxBroken]}» gave ${show(got[ctxBroken])} — the row tests its context, not its sentence`);
        continue;
      }
      const last = got[steps.length - 1];
      const line = steps[steps.length - 1];
      if (role === 'expected' && last.verdict !== row.expect) {
        faults.push(`${where}: «${line}» gave ${show(last)}, expected ${row.expect} (2-D's verdict)`);
      } else if (role === 'gap' && last.verdict === row.expect) {
        const gap = row.knownGap!.find((g) => g.product === product)!;
        faults.push(`${where}: «${line}» now ${row.expect === 'builds' ? 'builds' : `gives ${row.expect}`} — move it to the parity rows (drop the known gap ${gap.issue})`);
      } else if (role === 'must-refuse' && last.verdict === 'builds') {
        faults.push(`${where}: «${line}» BUILDS, but it is an ${row.exception} sentence (${EXCEPTIONS[row.exception!].title}) this builder must refuse honestly`);
      }
    }
  }
  return faults;
}

/** Faults in the rows themselves — run by the meta-lock, so a malformed row cannot pass quietly. */
export function rowFaults(rows: readonly ParityRow[] = PARITY_ROWS): string[] {
  const faults: string[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) faults.push(`[${row.id}] the id is used twice`);
    ids.add(row.id);
    if (row.steps.length === 0) faults.push(`[${row.id}] has no steps`);
    const last = row.steps[row.steps.length - 1] ?? '';
    if (row.exception) {
      const x = EXCEPTIONS[row.exception];
      // a topic family is the SENTENCE's topic; X8/X9 may also come from the context (a circle, a free point)
      const probe = x.topic ? [last] : row.steps;
      if (!probe.some((s) => x.patterns.some((p) => p.test(s)))) faults.push(`[${row.id}] «${last}» is not a ${row.exception} sentence (${x.title})`);
    }
    if (row.only && (!row.exception || row.only.some((p) => !EXCEPTIONS[row.exception!].products.includes(p)))) {
      faults.push(`[${row.id}] \`only\` must name builders of the row's exception family`);
    }
    for (const g of row.knownGap ?? []) {
      const base = roleOf({ ...row, knownGap: undefined }, g.product);
      if (base !== 'expected') faults.push(`[${row.id}] a known gap in ${g.product}, where the row is not expected (${base})`);
      if (!/^#\d+$/.test(g.issue)) faults.push(`[${row.id}] the known gap in ${g.product} names no filed issue («${g.issue}») — file it first`);
    }
    if (!PRODUCTS.some((p) => roleOf(row, p) === 'expected')) faults.push(`[${row.id}] is expected in no builder — it checks only refusals`);
    for (const p of Object.keys(row.contextFor ?? {}) as Product[]) {
      if (roleOf(row, p) === 'free') faults.push(`[${row.id}] carries a context for ${p}, which the row does not check`);
    }
  }
  return faults;
}

/** Every step of every row a product takes part in — the sentences the rows cover for that product. */
export function coveredSentences(product: Product, rows: readonly ParityRow[] = PARITY_ROWS): Set<string> {
  const out = new Set<string>();
  for (const row of rows) if (roleOf(row, product) !== 'free') for (const s of stepsFor(row, product)) out.add(s);
  return out;
}

/** The topic exception a sentence belongs to in `product`, if any. */
export function topicOf(product: Product, sentence: string): ExceptionId | null {
  for (const [id, x] of Object.entries(EXCEPTIONS) as [ExceptionId, ExceptionFamily][]) {
    if (x.topic && x.products.includes(product) && x.patterns.some((p) => p.test(sentence))) return id;
  }
  return null;
}

/**
 * THE CATALOG CHECK — every construction sentence a builder's guide advertises is classified: a step of a
 * row this builder takes part in, or a sentence of a topic exception this builder reads. Anything else
 * is an unclassified capability: the rule was skipped.
 *
 * `allow` is the ratchet of sentences that predate the rule (#1649). It may only shrink: an allowlisted
 * sentence that is now covered, or no longer in the catalog, is a fault until it is removed.
 */
export function catalogCoverageFaults(
  product: Product,
  sentences: readonly string[],
  rows: readonly ParityRow[] = PARITY_ROWS,
  allow: readonly string[] = UNCOVERED_CATALOG[product],
): string[] {
  const faults: string[] = [];
  const covered = coveredSentences(product, rows);
  const isCovered = (s: string) => covered.has(s) || topicOf(product, s) !== null;
  const inCatalog = new Set(sentences);
  for (const s of sentences) {
    if (isCovered(s)) {
      if (allow.includes(s)) faults.push(`${product}: «${s}» is covered now — remove it from the uncovered allowlist`);
    } else if (!allow.includes(s)) {
      faults.push(`${product}: catalog sentence «${s}» is in no parity row and no topic exception — add a row (a known gap names its issue) or an EXCEPTIONS family`);
    }
  }
  for (const s of allow) if (!inCatalog.has(s)) faults.push(`${product}: allowlisted «${s}» is no longer in the catalog — remove it`);
  return faults;
}

// ─── the rows ───────────────────────────────────────────────────────────────────────────────────────

export const PARITY_ROWS: readonly ParityRow[] = [
  // ── every construction sentence of the three catalogs, each in the context that types in every builder
  //    it is expected in (measured on c6a412aa; 'cat-<catalog>-NNN') ──
  { id: 'cat-2d-001', family: 'polygons', steps: ['משולש ABC'], expect: 'builds' },
  { id: 'cat-2d-002', family: 'angles', steps: ['משולש ישר-זווית ABC'], expect: 'builds' },
  { id: 'cat-2d-003', family: 'polygons', steps: ['ריבוע ABCD'], expect: 'builds' },
  { id: 'cat-2d-004', family: 'polygons', steps: ['מלבן ABCD'], expect: 'builds' },
  { id: 'cat-2d-005', family: 'polygons', steps: ['מעוין ABCD'], expect: 'builds' },
  { id: 'cat-2d-006', family: 'parallel-perpendicular', steps: ['מקבילית ABCD'], expect: 'builds' },
  { id: 'cat-2d-007', family: 'polygons', steps: ['טרפז ABCD'], expect: 'builds' },
  { id: 'cat-2d-008', family: 'polygons', steps: ['מרובע ABCD'], expect: 'builds' },
  { id: 'cat-2d-009', family: 'polygons', steps: ['ABCD'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-010', family: 'polygons', steps: ['דלתון ABCD'], expect: 'builds' },
  { id: 'cat-2d-011', family: 'polygons', steps: ['משולש שווה שוקיים ABC'], expect: 'builds' },
  { id: 'cat-2d-012', family: 'lengths', steps: ['ABC משולש שווה שוקיים (AB=AC)'], expect: 'builds' },
  { id: 'cat-2d-013', family: 'polygons', steps: ['ריבוע ABCD שצלעו הוא 1'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-014', family: 'polygons', steps: ['ריבוע שצלעו 4'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-015', family: 'lengths', steps: ['מלבן במידות 4*6'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-016', family: 'polygons', steps: ['משולש שווה צלעות ABC'], expect: 'builds' },
  { id: 'cat-2d-017', family: 'polygons', steps: ['טרפז שווה שוקיים ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-018', family: 'angles', steps: ['טרפז ישר-זווית ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-019', family: 'polygons', steps: ['מחומש משוכלל ABCDE'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-020', family: 'inscribed', steps: ['מעוין BDEF חסום במשולש ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-021', family: 'inscribed', steps: ['מלבן DEFG חסום במשולש ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-022', family: 'inscribed', steps: ['ריבוע DEFG חסום במשולש ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-023', family: 'points-incidence', steps: ['נקודה A'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-024', family: 'midpoint-ratio', steps: ['נקודה E על AC ב-40%'], expect: 'builds', exception: 'X9', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-025', family: 'points-incidence', steps: ['נקודות F, G, H על AB, AC, CB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-026', family: 'lengths', steps: ['משולש ABC', 'C במרחק 5 מ-A ו-5 מ-B'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-027', family: 'lengths', steps: ['משולש ABC', 'D על AB במרחק 3 מ-A'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-028', family: 'intersections', steps: ['מרובע ABCD', 'M חיתוך AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-029', family: 'cevians-centres', steps: ['מרובע ABCD', 'G מפגש האלכסונים במרובע ABCD'], expect: 'builds' },
  { id: 'cat-2d-030', family: 'cevians-centres', steps: ['משולש ABC', 'M מפגש התיכונים במשולש ABC'], expect: 'builds' },
  { id: 'cat-2d-031', family: 'cevians-centres', steps: ['O מפגש חוצי הזוויות במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-032', family: 'cevians-centres', steps: ['H מפגש הגבהים במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-033', family: 'cevians-centres', steps: ['P מפגש האנכים האמצעיים במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-034', family: 'midpoint-ratio', steps: ['משולש ABC', 'M אמצע AB'], expect: 'builds' },
  { id: 'cat-2d-035', family: 'points-incidence', steps: ['נקודה F על המשך AD'], expect: 'builds', exception: 'X9', knownGap: [{ product: 'analytic', issue: '#1620' }] },
  { id: 'cat-2d-036', family: 'polygons', steps: ['הנקודה E נמצאת בתוך המשולש KAO'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-037', family: 'points-incidence', steps: ['C ו-D בצדדים שונים של AB'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-038', family: 'points-incidence', steps: ['משולש ABC', 'קטע AC'], expect: 'builds' },
  { id: 'cat-2d-039', family: 'points-incidence', steps: ['קו ועליו נקודה A'], expect: 'builds', exception: 'X9', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-040', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'BC מקביל ל-AD'], expect: 'builds' },
  { id: 'cat-2d-041', family: 'cevians-centres', steps: ['CD חוצה את AB'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-042', family: 'cevians-centres', steps: ['מרובע ABCD', 'F רגל האנך מ-C ל-AD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-043', family: 'cevians-centres', steps: ['משולש ABC', 'E חיתוך חוצי הזוויות BAC ו-BCA'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1284' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-044', family: 'cevians-centres', steps: ['משולש ABC', 'חוצה זווית ABC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1284' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-045', family: 'parallel-perpendicular', steps: ['משולש ABC', 'נקודה P', 'ישר דרך P מאונך ל-AB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-046', family: 'parallel-perpendicular', steps: ['משולש ABC', 'נקודה P', 'ישר דרך P מקביל ל-AB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-047', family: 'points-incidence', steps: ['משולש ABC', 'E על הישר AC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-048', family: 'points-incidence', steps: ['משולש ABC', 'ישר ABE'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-049', family: 'cevians-centres', steps: ['תיכון מ-A במשולש ABC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1222' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-050', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון לצלע BC'], expect: 'builds' },
  { id: 'cat-2d-051', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'תיכון ליתר'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1222' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-052', family: 'cevians-centres', steps: ['גובה מ-A במשולש ABC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1240' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-053', family: 'cevians-centres', steps: ['משולש ABC', 'אנך אמצעי ל-AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-054', family: 'midpoint-ratio', steps: ['קטע האמצעים לצלע BC במשולש ABC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1620' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-055', family: 'midpoint-ratio', steps: ['קטע האמצעים בטרפז ABCD'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1620' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-056', family: 'cevians-centres', steps: ['משולש ABC', 'AD חוצה את הזווית BAC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1284' }] },
  { id: 'cat-2d-057', family: 'cevians-centres', steps: ['משולש ABC', 'CE חוצה זווית C במשולש ABC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1284' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-058', family: 'intersections', steps: ['CD חותך את AB'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-059', family: 'angles', steps: ['נסמן זוית BAM כ-A1'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1621' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-060', family: 'angles', steps: ['נקודה G', 'נקודה B', 'נקודה A', 'זווית GBA = 37'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-061', family: 'angles', steps: ['מרובע ABCD', 'הזווית בין BD ל-BA היא 30'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-062', family: 'angles', steps: ['זווית ABC שווה לשלושים מעלות'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-063', family: 'angles', steps: ['זוית AEB שווה לזווית BEC שווה 60 מעלות'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-064', family: 'angles', steps: ['משולש ABC', 'משולש DEF', 'זווית ABC היא זווית DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-065', family: 'chords-arcs', steps: ['נקודה D', 'נקודה E', 'נקודה C', 'נקודה O', 'קשת DE = 2 קשת CE במעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-066', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O', 'קשת AB = 40 במעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-067', family: 'chords-arcs', steps: ['נקודה A', 'נקודה C', 'נקודה B', 'נקודה E', 'נקודה D', 'נקודה O', 'קשת AC + קשת BE = קשת AD + קשת BC במעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-068', family: 'lengths', steps: ['נקודה D', 'נקודה M', 'נקודה E', 'נקודה B', 'נקודה R', 'DM*ME = BM*DR'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-069', family: 'chords-arcs', steps: ['זוית מרכזית COD'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-070', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC הוא 13'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-071', family: 'area-perimeter', steps: ['נקודה A', 'נקודה B', 'נקודה F', 'נקודה E', 'שטח ABF גדול פי 2 משטח BFE'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-072', family: 'area-perimeter', steps: ['נסמן את שטח ABCD ב-S'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1621' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-073', family: 'area-perimeter', steps: ['משולש ABC', 'היקף המשולש ABC = 20'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-074', family: 'lengths', steps: ['משולש ABC', 'AB = 6'], expect: 'builds' },
  { id: 'cat-2d-075', family: 'lengths', steps: ['מרובע ABCD', 'AB = CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1680' }] },
  { id: 'cat-2d-076', family: 'lengths', steps: ['מרובע ABCD', 'AB = 2 AD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1680' }] },
  { id: 'cat-2d-077', family: 'midpoint-ratio', steps: ['מרובע ABCD', 'AD:DB = 1:2'], expect: 'builds' },
  { id: 'cat-2d-078', family: 'midpoint-ratio', steps: ['מרובע ABCD', 'G מחלקת את DC ביחס 1:2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-079', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מאונך ל-CD'], expect: 'builds' },
  { id: 'cat-2d-080', family: 'lengths', steps: ['△ABC ≅ △DEF'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-081', family: 'lengths', steps: ['△ABC ~ △DEF'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-082', family: 'lengths', steps: ['AD = 12√x'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-083', family: 'angles', steps: ['משולש ABC', 'זווית ABC = 2α'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1621' }] },
  { id: 'cat-2d-084', family: 'angles', steps: ['α < β'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-085', family: 'angles', steps: ['משולש ABC', 'זווית ABC גדולה מ-40'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-086', family: 'angles', steps: ['משולש ABC', '40 < זווית ABC < 60'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-087', family: 'points-incidence', steps: ['5 < AB < 9'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-088', family: 'angles', steps: ['זווית ABC קהה'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1621' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-089', family: 'circles', steps: ['מעגל סביב O רדיוס 5'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-090', family: 'circles', steps: ['שני מעגלים בעלי מרכז משותף O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-091', family: 'circles', steps: ['שני מעגלים'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-092', family: 'circles', steps: ['שני מעגלים זרים'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-093', family: 'circles', steps: ['מעגל P מוכל בתוך מעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-094', family: 'circles', steps: ['מעגל מוכל בתוך המעגל הגדול'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-095', family: 'tangents', steps: ['AB משיק משותף חיצוני לשני המעגלים'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-096', family: 'circles', steps: ['ישר חותך את שני המעגלים בנקודות C, D, E ו-F'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-097', family: 'chords-arcs', steps: ['מעגל בקוטר 10'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-098', family: 'circles', steps: ['מעגל O שרדיוסו R'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-099', family: 'circles', steps: ['מעגל O', 'A על מעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-100', family: 'circles', steps: ['נתון מעגל שמרכזו M', 'המעגל עובר דרך A'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-101', family: 'circles', steps: ['מעגל O', 'M מחוץ למעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-102', family: 'circles', steps: ['O מרכז המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-103', family: 'inscribed', steps: ['משולש ABC חסום במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-104', family: 'inscribed', steps: ['משולש ישר-זווית ABC חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-105', family: 'inscribed', steps: ['מעגל חוסם את ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-106', family: 'inscribed', steps: ['משולש ABC', 'נקודה E', 'נקודה D', 'המעגל החוסם את משולש ABC חותך את CE בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-107', family: 'inscribed', steps: ['משולש DEF חוסם את המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-108', family: 'inscribed', steps: ['מעגל חסום בטרפז ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-109', family: 'inscribed', steps: ['במרובע ABCD חסום מעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1554' }] },
  { id: 'cat-2d-110', family: 'inscribed', steps: ['מעגל חסום בדלתון ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-111', family: 'tangents', steps: ['המשיק בנקודה A והמשיק בנקודה C למעגל O נפגשים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1620' }] },
  { id: 'cat-2d-112', family: 'tangents', steps: ['מעגל O', 'AB ו-AD משיקים למעגל O בנקודות E ו-K'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-113', family: 'inscribed', steps: ['טרפז ABCD חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-114', family: 'inscribed', steps: ['מרובע ABCD בר חסימה'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-115', family: 'chords-arcs', steps: ['חצי מעגל שקוטרו AB'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-116', family: 'chords-arcs', steps: ['על כל צלע של ריבוע ABCD יש חצי מעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-117', family: 'chords-arcs', steps: ['חצי מעגל על צלע AB מחוץ למשולש ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-118', family: 'chords-arcs', steps: ['רבע מעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-119', family: 'chords-arcs', steps: ['גזרה AOB בזווית 80'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-120', family: 'chords-arcs', steps: ['מעגל O', 'מיתר AB במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-121', family: 'chords-arcs', steps: ['AB ו-CD מיתרים במעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1670' }] },
  { id: 'cat-2d-122', family: 'circles', steps: ['מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-123', family: 'circles', steps: ['משולש ABC', 'מעגל O', 'הישר AO חותך את מעגל O בנקודות C ו-D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-124', family: 'circles', steps: ['מעגל O', 'נקודה A', 'נקודה D', 'נקודה B', 'AD חותך את מעגל O בנקודה B'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-125', family: 'tangents', steps: ['מנקודה E מחוץ למעגל O שני משיקים נוגעים במעגל בנקודות A ו-B'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-126', family: 'tangents', steps: ['מנקודה E משיק נוגע במעגל O בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-127', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'קוטר AB במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-128', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O', 'F על מעגל O', 'קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-129', family: 'chords-arcs', steps: ['קוטר מנקודה F במעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-130', family: 'chords-arcs', steps: ['קוטר העובר בנקודה A במעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-131', family: 'chords-arcs', steps: ['M אמצע הקשת BC במעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-132', family: 'tangents', steps: ['מעגל O', 'משיק למעגל O בנקודה A'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-133', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'E חיתוך המשיק למעגל O בנקודה A עם BC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-134', family: 'circles', steps: ['מעגל O', 'מעגל P', 'G חיתוך מעגל O ומעגל P'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-135', family: 'circles', steps: ['שני מעגלים נחתכים בנקודות A ו-B'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-136', family: 'tangents', steps: ['המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-137', family: 'circles', steps: ['משולש ABC', 'המשך AC חותך את מעגל P בנקודה E'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1620' }] },
  { id: 'cat-2d-138', family: 'circles', steps: ['משולש ישר-זווית ABC', 'הישר AC פוגש את מעגל P בנקודה E'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-139', family: 'tangents', steps: ['מעגל O ומעגל P משיקים זה לזה בנקודה M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-140', family: 'tangents', steps: ['מעגל O ומעגל P משיקים מבפנים בנקודה M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-141', family: 'tangents', steps: ['AB משיק משותף למעגלים O ו-P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-142', family: 'tangents', steps: ['CD משיק משותף למעגלים O ו-P בנקודה M'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-143', family: 'midpoint-ratio', steps: ['משולש ABC', 'אמצע AB'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-144', family: 'tangents', steps: ['משיק למעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-145', family: 'chords-arcs', steps: ['קוטר'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-146', family: 'circles', steps: ['ישר החותך את המעגל בשתי נקודות'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-147', family: 'circles', steps: ['נתון מעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-148', family: 'circles', steps: ['מעגל עם מרכז O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-149', family: 'circles', steps: ['מרכז המעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-2d-150', family: 'tangents', steps: ['AB משיק למעגל C'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1670' }] },
  { id: 'cat-2d-151', family: 'tangents', steps: ['מנקודה A יוצאים שני משיקים לשני המעגלים'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-an-001', family: 'points-incidence', steps: ['נקודה M'], expect: 'builds', exception: 'X9' },
  { id: 'cat-an-002', family: 'points-incidence', steps: ['הישר AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-003', family: 'points-incidence', steps: ['נקודה P', 'דרך P עובר ישר'], expect: 'builds', exception: 'X9', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-an-004', family: 'circles', steps: ['מרובע ABCD', 'מעגל ABD'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-an-005', family: 'circles', steps: ['מרובע ABCD', 'המעגל העובר דרך הנקודות A, B ו-D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-006', family: 'inscribed', steps: ['המעגל החוסם את המשולש ABD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-007', family: 'chords-arcs', steps: ['מרובע ABCD', 'BD קוטר במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-008', family: 'inscribed', steps: ['מעגל O', 'D על מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על המעגל החוסם את המשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-009', family: 'circles', steps: ['A על המעגל שמרכזו M'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1670' }] },
  { id: 'cat-an-010', family: 'chords-arcs', steps: ['מרובע ABCD', 'נתון מעגל שקוטרו BD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-011', family: 'inscribed', steps: ['מרובע ABCD חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-012', family: 'inscribed', steps: ['המשולש ABC חסום במעגל שמרכזו M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-013', family: 'inscribed', steps: ['במעגל חסום משולש חד זוויות ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-an-015', family: 'inscribed', steps: ['מעגל חסום במרובע ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-016', family: 'circles', steps: ['נתון מעגל O שרדיוסו 5'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-017', family: 'area-perimeter', steps: ['משולש ABC', 'היקף המשולש ABC הוא 12'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-018', family: 'tangents', steps: ['נתון מעגל K', 'מעגל M משיק למעגל K'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-019', family: 'tangents', steps: ['נתון מעגל K', 'נתון מעגל M', 'המעגלים משיקים מבחוץ'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-020', family: 'tangents', steps: ['מעגל O ומעגל M משיקים מבחוץ'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-021', family: 'tangents', steps: ['נתון מעגל K', 'מעגל M משיק למעגל K בנקודה T'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-022', family: 'tangents', steps: ['מעגל O', 'הישר BC משיק למעגל בנקודה B'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-023', family: 'tangents', steps: ['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-024', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל בנקודה A'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-025', family: 'tangents', steps: ['נקודה P', 'דרך P עובר משיק למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-026', family: 'chords-arcs', steps: ['מעגל O', 'AB מיתר במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-028', family: 'lengths', steps: ['טרפז ABCD', 'אורך השוק BC הוא 6'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-an-029', family: 'circles', steps: ['מעגל O', 'הנקודה B נמצאת מחוץ למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-030', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O', 'הנקודה E נמצאת על הקשת הקטנה AC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-031', family: 'circles', steps: ['משולש ABC', 'מעגל O', 'אורך הקטע AB שווה לרדיוס המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-032', family: 'circles', steps: ['מעגל O', 'C על מעגל O', 'D על מעגל O', 'CD עובר דרך מרכז המעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-an-033', family: 'points-incidence', steps: ['הקטע AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-034', family: 'lengths', steps: ['משולש ABC', 'אורך הקטע AB = 10'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-035', family: 'lengths', steps: ['משולש ABC', 'המרחק בין A ל-B = 10'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-an-036', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מקביל ל-DC'], expect: 'builds' },
  { id: 'cat-an-037', family: 'points-incidence', steps: ['משולש ABC', 'הצלע AB מאונכת לצלע BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-038', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB ∥ DC'], expect: 'builds' },
  { id: 'cat-an-039', family: 'parallel-perpendicular', steps: ['משולש ABC', 'AB ⊥ BC'], expect: 'builds' },
  { id: 'cat-an-040', family: 'lengths', steps: ['משולש ABC', 'AB = 10'], expect: 'builds' },
  { id: 'cat-an-041', family: 'lengths', steps: ['משולש ABC', 'AB = AC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1680' }] },
  { id: 'cat-an-042', family: 'lengths', steps: ['משולש ABC', 'AB + BC = 10'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1680' }] },
  { id: 'cat-an-043', family: 'midpoint-ratio', steps: ['משולש ABC', 'AC:CB = 3:2'], expect: 'builds' },
  { id: 'cat-an-044', family: 'midpoint-ratio', steps: ['נקודה C', 'נקודה A', 'נקודה B', 'C מחלקת את AB ביחס 3:2'], expect: 'builds', exception: 'X9' },
  { id: 'cat-an-045', family: 'midpoint-ratio', steps: ['נקודה A', 'נקודה C', 'נקודה B', 'היחס בין AC ל-CB הוא 3:2'], expect: 'builds', exception: 'X9' },
  { id: 'cat-an-046', family: 'angles', steps: ['משולש ABC', 'זווית ABC ישרה'], expect: 'builds' },
  { id: 'cat-an-047', family: 'angles', steps: ['משולש ABC', 'זוית C ישרה'], expect: 'builds' },
  { id: 'cat-an-048', family: 'angles', steps: ['משולש ABC', '∠ABC = 90'], expect: 'builds' },
  { id: 'cat-an-049', family: 'angles', steps: ['משולש ABC', 'זווית ABC היא 60'], expect: 'builds' },
  { id: 'cat-an-050', family: 'angles', steps: ['משולש ABC', '∠ABC = ∠ACB'], expect: 'builds' },
  { id: 'cat-an-051', family: 'angles', steps: ['משולש ABC', '∠ABC = 2∠ACB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-052', family: 'angles', steps: ['משולש ABC', 'זווית C = 60'], expect: 'builds' },
  { id: 'cat-an-053', family: 'angles', steps: ['משולש ABC', '∠B = ∠C'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-054', family: 'circles', steps: ['נתון מעגל שמרכזו M', 'A על מעגל M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-055', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון במשולש ABC'], expect: 'builds' },
  { id: 'cat-an-056', family: 'cevians-centres', steps: ['משולש ABC', 'AD גובה לצלע BC'], expect: 'builds' },
  { id: 'cat-an-057', family: 'cevians-centres', steps: ['טרפז ABCD', 'M מפגש האלכסונים'], expect: 'builds' },
  { id: 'cat-an-058', family: 'angles', steps: ['משולש ABC', '∢C = 90°'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-059', family: 'angles', steps: ['המרובע ABCO הוא טרפז ישר זווית'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1676' }, { product: '3d', issue: '#1679' }] },
  { id: 'cat-an-060', family: 'polygons', steps: ['במלבן ABCD, הנקודה E נמצאת על הצלע DC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  // #1620 S2 (ADR-AG-207): the perpendicular from a point, its foot, the line through a point cutting a side.
  { id: 'an-1620-perp-01', family: 'cevians-centres', steps: ['משולש ABC', 'האנך מ-C ל-AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'an-1620-perp-02', family: 'cevians-centres', steps: ['משולש ABC', 'האנך מהקודקוד C לצלע AB חותך אותה בנקודה D'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'an-1620-perp-03', family: 'cevians-centres', steps: ['משולש ABC', 'האנך מ-A ל-BC', 'E על האנך'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'an-1620-perp-04', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'דרך E עובר ישר מקביל ל-AC החותך את הצלע AB בנקודה F'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'an-1620-perp-05', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'הישר העובר דרך הנקודה E מקביל ל-AC וחותך את הצלע AB בנקודה F'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'an-1620-perp-06', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'הקטע EF מקביל ל-AC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'an-1620-perp-07', family: 'tangents', steps: ['מעגל O', 'A על המעגל', 'המשיק למעגל בנקודה A', 'משולש BCE', 'האנך מ-B ל-CE', 'המשיק והאנך נחתכים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-3d-001', family: 'midpoint-ratio', steps: ['משולש ABC', 'E על AC כך ש-AE:EC = 2:1'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-3d-002', family: 'lengths', steps: ['משולש ABC', 'AB = 3'], expect: 'builds' },
  { id: 'cat-3d-003', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC = 4.5'], expect: 'builds' },
  { id: 'cat-3d-004', family: 'polygons', steps: ['ABEC מלבן'], expect: 'builds' },
  { id: 'cat-3d-005', family: 'angles', steps: ['משולש ABC', '∠BAC = 90'], expect: 'builds' },
  { id: 'cat-3d-006', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מקביל ל-CD'], expect: 'builds' },
  { id: 'cat-3d-007', family: 'intersections', steps: ['מרובע ABCD', 'AC ו-BD נחתכים'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-3d-008', family: 'lengths', steps: ['מרובע ABCD', 'המרחק בין D לישר AB הוא 5'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-3d-009', family: 'lengths', steps: ['טרפז ABCD', 'המרחק בין AB לבין CD הוא 3'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: 'analytic', issue: '#1622' }] },
  { id: 'cat-3d-010', family: 'angles', steps: ['משולש ABC', 'קוסינוס הזווית ACB = 3/4'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1621' }] },
  { id: 'cat-3d-011', family: 'angles', steps: ['משולש ABC ישר זווית'], expect: 'builds' },
  { id: 'cat-3d-012', family: 'polygons', steps: ['ABC משולש שווה צלעות'], expect: 'builds' },
  { id: 'cat-3d-013', family: 'polygons', steps: ['ABC משולש שווה שוקיים'], expect: 'builds' },
  { id: 'cat-3d-014', family: 'polygons', steps: ['מרובע MKNL'], expect: 'builds' },
  { id: 'cat-3d-015', family: 'polygons', steps: ['מחומש ABCDE'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'cat-3d-016', family: 'polygons', steps: ['ABCD ריבוע'], expect: 'builds' },
  { id: 'cat-3d-017', family: 'cevians-centres', steps: ['משולש ABC', 'CD תיכון במשולש ABC'], expect: 'builds' },
  { id: 'cat-3d-018', family: 'lengths', steps: ['משולש ABC', 'אורך AB=BC'], expect: 'builds' },
  // ── the step-1 audit's seed (#1649 §D), re-measured on c6a412aa — rows not already a catalog row above ──
  { id: 'on-side', family: 'points-incidence', steps: ['מלבן ABCD', 'E על הצלע DC'], expect: 'builds' },
  { id: 'ratio', family: 'midpoint-ratio', steps: ['משולש ABC', 'D על AB', 'AD:DB = 1:2'], expect: 'builds' },
  { id: 'incircle-in', family: 'inscribed', steps: ['משולש ABC', 'במשולש ABC חסום מעגל'], expect: 'builds', exception: 'X8' },
  { id: 'length-noun-q2', family: 'lengths', steps: ['משולש ABC', 'אורך AB=BC'], expect: 'builds', note: "3-D's own spelling of an equal length (Q2): builds in all three" },
  // #1650 — a tangency typed first creates its circle (was refused in 2-D at the audit; both build now)
  { id: 'tangency-first-1650', family: 'tangents', steps: ['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'], expect: 'builds', exception: 'X8' },
  // #1651 — the circle's nouns are operands (was bad-operand in analytic at the audit; both build now)
  { id: 'chord-operand-1651', family: 'chords-arcs', steps: ['מעגל O', 'B על מעגל O', 'C על מעגל O', 'נקודה A', 'נקודה D', 'המיתר BC מקביל ל-AD'], expect: 'builds', exception: 'X8' },
  { id: 'diameter-operand-1651', family: 'chords-arcs', steps: ['מעגל O', 'B על מעגל O', 'C על מעגל O', 'נקודה A', 'נקודה D', 'הקוטר BC מאונך ל-AD'], expect: 'builds', exception: 'X8' },
  // #1666 — a claim to prove is refused in every builder (operator ruling 1, 2026-10-02)
  { id: 'proof-target-1666', family: 'frame', steps: ['משולש ABC', 'הוכיחו כי AB ⊥ AC'], expect: 'refused' },
  { id: 'proof-target-show-1666', family: 'frame', steps: ['משולש ABC', 'הראו כי AB = AC'], expect: 'refused' },
  // #1658 / ADR-562 — a bound on a letter is recorded as waiting in 2-D, as analytic records it
  { id: 'letter-bound-1658', family: 'lengths', steps: ['משולש ABC', '0 < k < 6'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },

  // ── 3-D's plane sentences on a solid's letters: 2-D and analytic type the letters free, 3-D types its pyramid ──
  { id: 'pyr-equal-lengths', family: 'lengths', steps: ['מרובע ABCD', 'נקודה S', 'אורך AS שווה לאורך AB'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'pyr-equal-angles', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', '∠SAB = ∠SAD'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds' },
  { id: 'pyr-equal-angles-words', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', 'זווית SAB = זווית SAD'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds' },
  { id: 'pyr-perpendicular', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'נקודה S', 'M אמצע AB', 'SM מאונך ל-DB'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע', 'M אמצע AB'] }, expect: 'builds' },
  { id: 'pyr-angle-label', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', '∠SDB = α'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1621' }] },
  { id: 'pyr-angle-label-value', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', '∠SDB = α', 'α = 70'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע', '∠SDB = α'] }, expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1621' }] },
  { id: 'pyr-angle-between', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', '60 < זווית SAB < 90'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'pyr-angle-greater', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', 'זווית SAB גדולה מ-60'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'right-angle-vertex', family: 'angles', steps: ['משולש AOB', 'זווית O ישרה'], expect: 'builds' },
  { id: 'bisector-named', family: 'cevians-centres', steps: ['משולש AOC', 'OD חוצה זווית AOC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1284' }] },
  { id: 'bisector-foot', family: 'cevians-centres', steps: ['משולש AOC', 'D על AC כך ש-OD חוצה-זווית AOC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1284' }] },
  // the circle rows of 3-D's own catalog are plain rows (X8 excepts every other circle sentence in 3-D)
  { id: 'circle3d-incircle', family: 'inscribed', steps: ['מעגל חסום במשולש ABC'], expect: 'builds' },
  { id: 'circle3d-touch', family: 'tangents', steps: ['משולש ABC', 'מעגל A משיק לישר BC בנקודה F'], expect: 'builds' },
  { id: 'circle3d-circum', family: 'inscribed', steps: ['משולש ABC חסום במעגל'], expect: 'builds' },
  { id: 'circle3d-centre-circum', family: 'inscribed', steps: ['משולש ABC חסום במעגל', 'K מרכז המעגל החוסם את המשולש ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1531' }] },
  { id: 'circle-centre-incircle', family: 'inscribed', steps: ['במשולש ABC חסום מעגל', 'K מרכז המעגל החסום במשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'circle-numeral-on', family: 'circles', steps: ['נתון מעגל I', 'P על המעגל I'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1257' }] },

  // ── known gaps the audit seeded (B2), re-measured ──
  { id: 'frame-paren', family: 'frame', steps: ['המרובע ABCD הוא טרפז (AB ∥ CD)'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1676' }] },
  { id: 'frame-dash', family: 'frame', steps: ['מעגל O', 'O – מרכז המעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1676' }] },
  { id: 'frame-noun-after', family: 'frame', steps: ['המרובע ABCD מלבן'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1676' }] },
  { id: 'frame-figure', family: 'frame', steps: ['בסרטוט שלפניך מתואר משולש ABC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1676' }, { product: '3d', issue: '#1679' }] },
  { id: 'acute', family: 'polygons', steps: ['משולש חד זוויות ABC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'acute-circ', family: 'inscribed', steps: ['משולש חד-זוויות ABC חסום במעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'circ-diam', family: 'inscribed', steps: ['משולש ABC חסום במעגל שקוטרו AC'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'touch-list', family: 'tangents', steps: ['משולש ABC', 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1660' }] },
  { id: 'passes', family: 'points-incidence', steps: ['משולש ABC', 'נקודה P', 'AC עובר דרך P'], expect: 'builds', exception: 'X9', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'mid-compound', family: 'midpoint-ratio', steps: ['משולש ABC', 'הנקודה D היא אמצע הצלע AB, והנקודה E היא אמצע הצלע BC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'dist-line', family: 'lengths', steps: ['משולש ABD', 'המרחק בין D לישר AB הוא 5'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'diag-meet', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים AC ו-BD נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1620' }] },
  { id: 'symbol-length', family: 'lengths', steps: ['משולש ABC', 'AB = 3x'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }], note: 'X10, ported to analytic by ruling 2 (2026-10-02)' },
  { id: 'symbol-length-square', family: 'lengths', steps: ['משולש ABC', 'AB = x²'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1622' }, { product: '3d', issue: '#1679' }], note: 'X10' },
  { id: 'chord-cross', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O', 'במעגל המיתרים AC ו-BD נפגשים בנקודה E'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1678' }], note: '2-D answers a conflict: its free points on the circle do not keep AC and BD crossing' },
  { id: 'chord-cross-first', family: 'chords-arcs', steps: ['במעגל המיתרים AC ו-BD נפגשים בנקודה E'], expect: 'builds', exception: 'X8' },

  // ── #1669: a chord, diameter or radius sentence introduces its points — gaps at c6a412aa, parity since #1669 landed ──
  { id: 'diameter-on-circle-1669', family: 'chords-arcs', steps: ['מעגל O', 'AB קוטר במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'diameter-bare-1669', family: 'chords-arcs', steps: ['מעגל O', 'AB קוטר'], expect: 'builds', exception: 'X8' },
  { id: 'diameter-no-circle-1669', family: 'chords-arcs', steps: ['AB קוטר'], expect: 'builds', exception: 'X8' },
  { id: 'chord-no-circle-1669', family: 'chords-arcs', steps: ['מיתר AB'], expect: 'builds', exception: 'X8' },
  { id: 'circle-by-diameter-1669', family: 'chords-arcs', steps: ['נתון מעגל שקוטרו AB'], expect: 'builds', exception: 'X8' },
  { id: 'diameter-chain-1669', family: 'chords-arcs', steps: ['AB קוטר', 'C על המעגל', 'BD מיתר'], expect: 'builds', exception: 'X8' },
  { id: 'radius-named-centre-1669', family: 'chords-arcs', steps: ['מעגל O', 'OA רדיוס'], expect: 'builds', exception: 'X8' },
  { id: 'diameter-centre-M-1669', family: 'chords-arcs', steps: ['נתון מעגל שמרכזו M', 'AB קוטר במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'diameter-after-on-1669', family: 'chords-arcs', steps: ['מעגל O', 'A על המעגל', 'AB קוטר במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'chord-operand-new-1669', family: 'chords-arcs', steps: ['מעגל O', 'נקודה C', 'נקודה D', 'המיתר AB מקביל ל-CD'], expect: 'builds', exception: 'X8' },
  { id: 'diameter-two-circles-1669', family: 'chords-arcs', steps: ['מעגל O', 'מעגל P', 'AB קוטר במעגל'], expect: 'asks', exception: 'X8', note: 'two circles: 2-D asks which one' },

  // ── #1670: the 2-D ≠ analytic verdicts that remain after #1669 ──
  { id: 'radius-unnamed-centre-1670', family: 'chords-arcs', steps: ['AB קוטר', 'OB רדיוס'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1670' }] },
  { id: 'on-circle-no-circle-1670', family: 'circles', steps: ['A על המעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1670' }] },
  // operator ruling on #1670 (2026-10-02): an unlabelled centre must NOT answer to «O» — here 2-D is the one that changes,
  // so `expect` is the ruled verdict (analytic's), not 2-D's current one
  { id: 'hidden-centre-letter-1673', family: 'circles', steps: ['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה', 'BO = 5'], expect: 'refused', exception: 'X8', knownGap: [{ product: '2d', issue: '#1673' }], note: 'the reference is the ruling, not 2-D: 2-D lets the unnamed centre answer to O' },
  { id: 'bare-relation-new-letters-1670', family: 'parallel-perpendicular', steps: ['מעגל O', 'BD⊥AC'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1670' }], note: 'new letters in a bare relation: 2-D mints them, analytic refuses (#1028); ruled to follow 2-D' },

  { id: 'circle-by-circumference', family: 'circles', steps: ['מעגל O שהיקפו 6π'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1622' }] },
  { id: 'altitude-is-segment', family: 'cevians-centres', steps: ['משולש ABC', 'גובה המשולש לצלע AB הוא CD'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: 'analytic', issue: '#1240' }], note: "3-D's catalog sentence; 2-D and analytic do not read it" },
  // ── exception rows: the builders outside the family must answer honestly, never build ──
  { id: 'ex-coordinate-point', family: 'topic', steps: ['נתונה הנקודה A(2,6)'], expect: 'builds', exception: 'X1', only: ['analytic'], note: '3-D spells a point A(2,-2,6), so only analytic reads this spelling' },
  { id: 'ex-axis', family: 'topic', steps: ['C על ציר ה-x'], expect: 'builds', exception: 'X1' },
  { id: 'ex-origin', family: 'topic', steps: ['O ראשית הצירים'], expect: 'builds', exception: 'X1', only: ['analytic'] },
  { id: 'ex-quadrant-1655', family: 'topic', steps: ['במשולש AOB חסום מעגל שמרכזו C (הנקודה C נמצאת ברביע השני)'], expect: 'builds', exception: 'X1', only: ['analytic'], note: '#1655: 2-D used to draw the incircle and drop the quadrant' },
  { id: 'ex-slope-1654', family: 'topic', steps: ['משולש ABC', 'נתון: שיפוע הצלע AB הוא 3/4'], expect: 'builds', exception: 'X2', note: '#1654: 2-D used to commit |AB| = 0.75' },
  { id: 'ex-slope', family: 'topic', steps: ['משולש ABC', 'שיפוע AB הוא 2'], expect: 'builds', exception: 'X2' },
  { id: 'ex-line-equation', family: 'topic', steps: ['משוואת הישר AC היא y=-2x+8'], expect: 'builds', exception: 'X2' },
  { id: 'ex-named-line-equation', family: 'topic', steps: ['נתון הישר l1: 4y-3x-20=0'], expect: 'builds', exception: 'X2' },
  { id: 'ex-parametric-line', family: 'topic', steps: ['הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)'], expect: 'builds', exception: 'X3' },
  { id: 'ex-named-line', family: 'topic', steps: ['ישר l1'], expect: 'builds', exception: 'X4', knownGap: [{ product: 'analytic', issue: '#1171' }] },
  { id: 'ex-parameter', family: 'topic', steps: ['k הוא פרמטר'], expect: 'builds', exception: 'X5', only: ['analytic'], note: "3-D declares a parameter its own way («t פרמטר חיובי»)" },
  { id: 'ex-coordinate-of', family: 'topic', steps: ['נקודה A', 'x של A הוא 5'], expect: 'builds', exception: 'X6' },
  { id: 'ex-distance-notation', family: 'topic', steps: ['A(0,0)', 'נקודה B', 'd_{AB} = 10'], contextFor: { '2d': ['נקודה A', 'נקודה B'] }, expect: 'builds', exception: 'X6' },
  { id: 'ex-solid', family: 'topic', steps: ['פירמידה SABCD שבסיסה ריבוע'], expect: 'builds', exception: 'X7' },
  { id: 'ex-cube', family: 'topic', steps: ["קובייה ABCDA'B'C'D'"], expect: 'builds', exception: 'X7' },
  { id: 'ex-plane-1656', family: 'topic', steps: ['משולש ACD', 'נקודה S', 'דרך AC העבירו מישור המקביל ל-SD'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds', exception: 'X7', note: '#1656: 2-D used to commit AC ∥ SD' },
  { id: 'ex-sphere-1657', family: 'topic', steps: ['כדור שמרכזו O ורדיוסו 3'], expect: 'builds', exception: 'X7', note: '#1657: 2-D used to draw a circle' },
  { id: 'ex-vector', family: 'topic', steps: ['משולש ABC', 'וקטור AB'], expect: 'builds', exception: 'X7' },
];

/** Catalog sentences that predate the rule and have no row yet — a ratchet: it may only shrink. */
export const UNCOVERED_CATALOG: Readonly<Record<Product, readonly string[]>> = {
  '2d': [],
  // a circle named by a numeral with no equation: neither builder reads «O מרכז המעגל I» today (#1257)
  analytic: ['O מרכז המעגל I'],
  '3d': [
    'BE/ED = 1:3', // 3-D builds it on its solid; no plane context makes the row type in every builder
    'D על המעגל', // 3-D needs D to exist first; its catalog context is not a plane figure
    'הזווית שבין AB לבין AC שווה לזווית שבין AB לבין AD', // 2-D takes ~9 s to escalate it — too slow for a lock row
    '∠SDB', // a bare angle: 3-D draws it, 2-D refuses it as a question with no value — ruling pending (#1680)
  ],
};

/** The ceiling of each allowlist. Raising one is a visible edit, which is the point. */
export const UNCOVERED_CEILING: Readonly<Record<Product, number>> = { '2d': 0, analytic: 1, '3d': 4 };
