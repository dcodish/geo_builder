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

export type ExceptionId = 'X1' | 'X2' | 'X3' | 'X4' | 'X5' | 'X6' | 'X7' | 'X8' | 'X9' | 'X10';

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
    title: 'coordinates, the origin, the axes, quadrants, position words between points',
    reason:
      "the coordinate frame: 2-D is coordinate-free by design and sends these to the analytic builder. A position word between two points («D מעל A», «C מימין ל-B») is the frame too: analytic's axes are fixed, so it compares coordinates there (#1706, operator ruling 2026-10-03), while 2-D refuses screen orientation (input.scope.orientation) — those rows carry only: ['analytic']",
    products: ['analytic', '3d'],
    mustRefuse: ['2d'],
    topic: true,
    patterns: [/\(\s*[-\w√.+ ]+,/, /ציר ה-?\s?[xyz]/, /ראשית/, /רביע/, /הצירים/, /(?:^|\()[A-Z]\d?\s+(?:מעל|מתחת|מימין|משמאל)\s*ל?-?\s*[A-Z]\d?(?:$|\))/],
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
    reason:
      'coordinate notation («x של A הוא 5», «x_B > x_D», «d_{AB} = 10»). 3-D reads ONE coordinate of a point — a value, a sign, a comparison with zero (#1547, ADR-3D-299); the two-point comparison and the distance notation are analytic-only, so those rows carry only: [analytic]',
    products: ['analytic', '3d'],
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
  X10: {
    title: 'x or y as a length («AB = 3x»)',
    reason:
      "operator ruling 2026-10-03 on #1622 (ADR-W-109): in analytic x and y are the plane's coordinates, so a length written in them is refused there with a teaching message (name it «AB = 3a»); 2-D reads it as a free length, as it always has. Every other letter is a plain parity row",
    products: ['2d', '3d'],
    mustRefuse: ['analytic'],
    topic: false,
    patterns: [/[A-Z]{2}\s*=\s*(?:[A-Z]{2}\s*=\s*)?[\d√]*\s*[xy](?![A-Za-z])/],
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
  { id: 'cat-2d-009', family: 'polygons', steps: ['ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-010', family: 'polygons', steps: ['דלתון ABCD'], expect: 'builds' },
  { id: 'cat-2d-011', family: 'polygons', steps: ['משולש שווה שוקיים ABC'], expect: 'builds' },
  { id: 'cat-2d-012', family: 'lengths', steps: ['ABC משולש שווה שוקיים (AB=AC)'], expect: 'builds' },
  { id: 'cat-2d-013', family: 'polygons', steps: ['ריבוע ABCD שצלעו הוא 1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-014', family: 'polygons', steps: ['ריבוע שצלעו 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-015', family: 'lengths', steps: ['מלבן במידות 4*6'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-016', family: 'polygons', steps: ['משולש שווה צלעות ABC'], expect: 'builds' },
  { id: 'cat-2d-017', family: 'polygons', steps: ['טרפז שווה שוקיים ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-018', family: 'angles', steps: ['טרפז ישר-זווית ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-019', family: 'polygons', steps: ['מחומש משוכלל ABCDE'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-020', family: 'inscribed', steps: ['מעוין BDEF חסום במשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-021', family: 'inscribed', steps: ['מלבן DEFG חסום במשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-022', family: 'inscribed', steps: ['ריבוע DEFG חסום במשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-023', family: 'points-incidence', steps: ['נקודה A'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-024', family: 'midpoint-ratio', steps: ['נקודה E על AC ב-40%'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-025', family: 'points-incidence', steps: ['נקודות F, G, H על AB, AC, CB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-026', family: 'lengths', steps: ['משולש ABC', 'C במרחק 5 מ-A ו-5 מ-B'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-027', family: 'lengths', steps: ['משולש ABC', 'D על AB במרחק 3 מ-A'], expect: 'builds', note: '3-D reads AD = 3 since #1730 and builds it since #1735 (the off-host rider is re-seated, the triangle grows)' },
  { id: 'cat-2d-028', family: 'intersections', steps: ['מרובע ABCD', 'M חיתוך AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-029', family: 'cevians-centres', steps: ['מרובע ABCD', 'G מפגש האלכסונים במרובע ABCD'], expect: 'builds' },
  { id: 'cat-2d-030', family: 'cevians-centres', steps: ['משולש ABC', 'M מפגש התיכונים במשולש ABC'], expect: 'builds' },
  { id: 'cat-2d-031', family: 'cevians-centres', steps: ['O מפגש חוצי הזוויות במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-032', family: 'cevians-centres', steps: ['H מפגש הגבהים במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-033', family: 'cevians-centres', steps: ['P מפגש האנכים האמצעיים במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-034', family: 'midpoint-ratio', steps: ['משולש ABC', 'M אמצע AB'], expect: 'builds' },
  { id: 'cat-2d-035', family: 'points-incidence', steps: ['נקודה F על המשך AD'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-036', family: 'polygons', steps: ['הנקודה E נמצאת בתוך המשולש KAO'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-037', family: 'points-incidence', steps: ['C ו-D בצדדים שונים של AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-038', family: 'points-incidence', steps: ['משולש ABC', 'קטע AC'], expect: 'builds' },
  { id: 'cat-2d-039', family: 'points-incidence', steps: ['קו ועליו נקודה A'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-040', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'BC מקביל ל-AD'], expect: 'builds' },
  { id: 'cat-2d-041', family: 'cevians-centres', steps: ['CD חוצה את AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-042', family: 'cevians-centres', steps: ['מרובע ABCD', 'F רגל האנך מ-C ל-AD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-043', family: 'cevians-centres', steps: ['משולש ABC', 'E חיתוך חוצי הזוויות BAC ו-BCA'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-044', family: 'cevians-centres', steps: ['משולש ABC', 'חוצה זווית ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-045', family: 'parallel-perpendicular', steps: ['משולש ABC', 'נקודה P', 'ישר דרך P מאונך ל-AB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-046', family: 'parallel-perpendicular', steps: ['משולש ABC', 'נקודה P', 'ישר דרך P מקביל ל-AB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-047', family: 'points-incidence', steps: ['משולש ABC', 'E על הישר AC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-048', family: 'points-incidence', steps: ['משולש ABC', 'ישר ABE'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-049', family: 'cevians-centres', steps: ['תיכון מ-A במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-050', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון לצלע BC'], expect: 'builds' },
  { id: 'cat-2d-051', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'תיכון ליתר'], expect: 'asks', knownGap: [{ product: '2d', issue: '#1689' }, { product: '3d', issue: '#1679' }], note: 'the reference is the ruling (2026-10-02, #1620), not 2-D: the right angle is not stated, so the hypotenuse is asked — 2-D assumes C' },
  { id: 'hypotenuse-median-stated', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'זווית C ישרה', 'תיכון ליתר'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'hypotenuse-median-named', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'תיכון ליתר AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'hypotenuse-no-right-angle', family: 'cevians-centres', steps: ['משולש ABC', 'תיכון ליתר'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-052', family: 'cevians-centres', steps: ['גובה מ-A במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-053', family: 'cevians-centres', steps: ['משולש ABC', 'אנך אמצעי ל-AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-054', family: 'midpoint-ratio', steps: ['קטע האמצעים לצלע BC במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-055', family: 'midpoint-ratio', steps: ['קטע האמצעים בטרפז ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-056', family: 'cevians-centres', steps: ['משולש ABC', 'AD חוצה את הזווית BAC'], expect: 'builds' },
  { id: 'cat-2d-057', family: 'cevians-centres', steps: ['משולש ABC', 'CE חוצה זווית C במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-058', family: 'intersections', steps: ['CD חותך את AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-059', family: 'angles', steps: ['נסמן זוית BAM כ-A1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-060', family: 'angles', steps: ['נקודה G', 'נקודה B', 'נקודה A', 'זווית GBA = 37'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-061', family: 'angles', steps: ['מרובע ABCD', 'הזווית בין BD ל-BA היא 30'], expect: 'builds' },
  { id: 'cat-2d-062', family: 'angles', steps: ['זווית ABC שווה לשלושים מעלות'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-063', family: 'angles', steps: ['זוית AEB שווה לזווית BEC שווה 60 מעלות'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-064', family: 'angles', steps: ['משולש ABC', 'משולש DEF', 'זווית ABC היא זווית DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-065', family: 'chords-arcs', steps: ['נקודה D', 'נקודה E', 'נקודה C', 'נקודה O', 'קשת DE = 2 קשת CE במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-066', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O', 'קשת AB = 40 במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-067', family: 'chords-arcs', steps: ['נקודה A', 'נקודה C', 'נקודה B', 'נקודה E', 'נקודה D', 'נקודה O', 'קשת AC + קשת BE = קשת AD + קשת BC במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-068', family: 'lengths', steps: ['נקודה D', 'נקודה M', 'נקודה E', 'נקודה B', 'נקודה R', 'DM*ME = BM*DR'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-069', family: 'chords-arcs', steps: ['זוית מרכזית COD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-070', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC הוא 13'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-071', family: 'area-perimeter', steps: ['נקודה A', 'נקודה B', 'נקודה F', 'נקודה E', 'שטח ABF גדול פי 2 משטח BFE'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-072', family: 'area-perimeter', steps: ['נסמן את שטח ABCD ב-S'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-073', family: 'area-perimeter', steps: ['משולש ABC', 'היקף המשולש ABC = 20'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-074', family: 'lengths', steps: ['משולש ABC', 'AB = 6'], expect: 'builds' },
  { id: 'cat-2d-075', family: 'lengths', steps: ['מרובע ABCD', 'AB = CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1680' }] },
  { id: 'cat-2d-076', family: 'lengths', steps: ['מרובע ABCD', 'AB = 2 AD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1680' }] },
  { id: 'cat-2d-077', family: 'midpoint-ratio', steps: ['מרובע ABCD', 'AD:DB = 1:2'], expect: 'builds' },
  { id: 'cat-2d-078', family: 'midpoint-ratio', steps: ['מרובע ABCD', 'G מחלקת את DC ביחס 1:2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-079', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מאונך ל-CD'], expect: 'builds' },
  { id: 'cat-2d-080', family: 'lengths', steps: ['△ABC ≅ △DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-081', family: 'lengths', steps: ['△ABC ~ △DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-082', family: 'lengths', steps: ['AD = 12√x'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679' }], note: 'analytic refuses x as a length (2026-10-03)' },
  { id: 'cat-2d-083', family: 'angles', steps: ['משולש ABC', 'זווית ABC = 2α'], expect: 'builds' },
  { id: 'cat-2d-084', family: 'angles', steps: ['α < β'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-085', family: 'angles', steps: ['משולש ABC', 'זווית ABC גדולה מ-40'], expect: 'builds' },
  { id: 'cat-2d-086', family: 'angles', steps: ['משולש ABC', '40 < זווית ABC < 60'], expect: 'builds' },
  { id: 'cat-2d-087', family: 'points-incidence', steps: ['5 < AB < 9'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-088', family: 'angles', steps: ['זווית ABC קהה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-2d-089', family: 'circles', steps: ['מעגל סביב O רדיוס 5'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-090', family: 'circles', steps: ['שני מעגלים בעלי מרכז משותף O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-091', family: 'circles', steps: ['שני מעגלים'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-092', family: 'circles', steps: ['שני מעגלים זרים'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-093', family: 'circles', steps: ['מעגל P מוכל בתוך מעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-094', family: 'circles', steps: ['מעגל מוכל בתוך המעגל הגדול'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-095', family: 'tangents', steps: ['AB משיק משותף חיצוני לשני המעגלים'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-096', family: 'circles', steps: ['ישר חותך את שני המעגלים בנקודות C, D, E ו-F'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-097', family: 'chords-arcs', steps: ['מעגל בקוטר 10'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-098', family: 'circles', steps: ['מעגל O שרדיוסו R'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-099', family: 'circles', steps: ['מעגל O', 'A על מעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-100', family: 'circles', steps: ['נתון מעגל שמרכזו M', 'המעגל עובר דרך A'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-101', family: 'circles', steps: ['מעגל O', 'M מחוץ למעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-102', family: 'circles', steps: ['O מרכז המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-103', family: 'inscribed', steps: ['משולש ABC חסום במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-104', family: 'inscribed', steps: ['משולש ישר-זווית ABC חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-105', family: 'inscribed', steps: ['מעגל חוסם את ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-106', family: 'inscribed', steps: ['משולש ABC', 'נקודה E', 'נקודה D', 'המעגל החוסם את משולש ABC חותך את CE בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-107', family: 'inscribed', steps: ['משולש DEF חוסם את המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-108', family: 'inscribed', steps: ['מעגל חסום בטרפז ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-109', family: 'inscribed', steps: ['במרובע ABCD חסום מעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1554' }] },
  { id: 'cat-2d-110', family: 'inscribed', steps: ['מעגל חסום בדלתון ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-111', family: 'tangents', steps: ['המשיק בנקודה A והמשיק בנקודה C למעגל O נפגשים בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-112', family: 'tangents', steps: ['מעגל O', 'AB ו-AD משיקים למעגל O בנקודות E ו-K'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-113', family: 'inscribed', steps: ['טרפז ABCD חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-114', family: 'inscribed', steps: ['מרובע ABCD בר חסימה'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-115', family: 'chords-arcs', steps: ['חצי מעגל שקוטרו AB'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-116', family: 'chords-arcs', steps: ['על כל צלע של ריבוע ABCD יש חצי מעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-117', family: 'chords-arcs', steps: ['חצי מעגל על צלע AB מחוץ למשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-118', family: 'chords-arcs', steps: ['רבע מעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-119', family: 'chords-arcs', steps: ['גזרה AOB בזווית 80'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-120', family: 'chords-arcs', steps: ['מעגל O', 'מיתר AB במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-121', family: 'chords-arcs', steps: ['AB ו-CD מיתרים במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-122', family: 'circles', steps: ['מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-123', family: 'circles', steps: ['משולש ABC', 'מעגל O', 'הישר AO חותך את מעגל O בנקודות C ו-D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-124', family: 'circles', steps: ['מעגל O', 'נקודה A', 'נקודה D', 'נקודה B', 'AD חותך את מעגל O בנקודה B'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-125', family: 'tangents', steps: ['מנקודה E מחוץ למעגל O שני משיקים נוגעים במעגל בנקודות A ו-B'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-126', family: 'tangents', steps: ['מנקודה E משיק נוגע במעגל O בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-127', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'קוטר AB במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-128', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O', 'F על מעגל O', 'קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-129', family: 'chords-arcs', steps: ['קוטר מנקודה F במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-130', family: 'chords-arcs', steps: ['קוטר העובר בנקודה A במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-131', family: 'chords-arcs', steps: ['M אמצע הקשת BC במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-132', family: 'tangents', steps: ['מעגל O', 'משיק למעגל O בנקודה A'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-133', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'E חיתוך המשיק למעגל O בנקודה A עם BC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-134', family: 'circles', steps: ['מעגל O', 'מעגל P', 'G חיתוך מעגל O ומעגל P'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-135', family: 'circles', steps: ['שני מעגלים נחתכים בנקודות A ו-B'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-136', family: 'tangents', steps: ['המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-137', family: 'circles', steps: ['משולש ABC', 'המשך AC חותך את מעגל P בנקודה E'], expect: 'builds', exception: 'X8', note: '#1620 reads the extension (ext-circle-1620); the gap left is cat-2d-138\'s — «מעגל P» names a circle the figure lacks, which 2-D creates' },
  { id: 'cat-2d-138', family: 'circles', steps: ['משולש ישר-זווית ABC', 'הישר AC פוגש את מעגל P בנקודה E'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-139', family: 'tangents', steps: ['מעגל O ומעגל P משיקים זה לזה בנקודה M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-140', family: 'tangents', steps: ['מעגל O ומעגל P משיקים מבפנים בנקודה M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-141', family: 'tangents', steps: ['AB משיק משותף למעגלים O ו-P'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-142', family: 'tangents', steps: ['CD משיק משותף למעגלים O ו-P בנקודה M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-143', family: 'midpoint-ratio', steps: ['משולש ABC', 'אמצע AB'], expect: 'builds' },
  { id: 'cat-2d-144', family: 'tangents', steps: ['משיק למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-145', family: 'chords-arcs', steps: ['קוטר'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-146', family: 'circles', steps: ['ישר החותך את המעגל בשתי נקודות'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-147', family: 'circles', steps: ['נתון מעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-148', family: 'circles', steps: ['מעגל עם מרכז O'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-149', family: 'circles', steps: ['מרכז המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-150', family: 'tangents', steps: ['AB משיק למעגל C'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-151', family: 'tangents', steps: ['מנקודה A יוצאים שני משיקים לשני המעגלים'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-001', family: 'points-incidence', steps: ['נקודה M'], expect: 'builds', exception: 'X9' },
  { id: 'cat-an-002', family: 'points-incidence', steps: ['הישר AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cat-an-003', family: 'points-incidence', steps: ['נקודה P', 'דרך P עובר ישר'], expect: 'builds', exception: 'X9', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-an-004', family: 'circles', steps: ['מרובע ABCD', 'מעגל ABD'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-an-005', family: 'circles', steps: ['מרובע ABCD', 'המעגל העובר דרך הנקודות A, B ו-D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-006', family: 'inscribed', steps: ['המעגל החוסם את המשולש ABD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-007', family: 'chords-arcs', steps: ['מרובע ABCD', 'BD קוטר במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-008', family: 'inscribed', steps: ['מעגל O', 'D על מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על המעגל החוסם את המשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-009', family: 'circles', steps: ['A על המעגל שמרכזו M'], expect: 'builds', exception: 'X8' },
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
  { id: 'an-1620-perp-06b', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'EF ∥ AC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: 'a bare pair mints its new end (#1670 row 4, ADR-AG-210)' },
  { id: 'an-1620-perp-06c', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'הצלע EF מקבילה ל-AC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'an-1620-perp-06d', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'הישר EF מקביל ל-AC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'an-1620-perp-07', family: 'tangents', steps: ['מעגל O', 'A על המעגל', 'המשיק למעגל בנקודה A', 'משולש BCE', 'האנך מ-B ל-CE', 'המשיק והאנך נחתכים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },

  // ── #1620 S7 (ADR-AG-213): the two tangents meet — 01–06 agree with 2-D; 08–13 are analytic-ahead (2-D owes them, #1677) ──
  { id: 'an-1620-tan-01', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'המשיקים נפגשים בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'an-1620-tan-02', family: 'tangents', steps: ['מעגל O', 'המשיק בנקודה A והמשיק בנקודה C נפגשים בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'an-1620-tan-04', family: 'tangents', steps: ['מעגל O', 'AC קוטר במעגל O', 'המשיק בנקודה A והמשיק בנקודה C למעגל O נפגשים בנקודה D'], expect: 'refused', exception: 'X8', note: 'antipodal touch points: the tangents are parallel' },
  { id: 'an-1620-tan-05', family: 'tangents', steps: ['מעגל O', 'AC קוטר במעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'המשיקים נפגשים בנקודה D'], expect: 'refused', exception: 'X8' },
  { id: 'an-1620-tan-06', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'המשיקים נחתכים בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'an-1620-tan-08', family: 'tangents', steps: ['המשיקים למעגל O בנקודות A ו-C נפגשים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'an-1620-tan-09', family: 'tangents', steps: ['מעגל O', 'המשיקים בנקודות A ו-C נחתכים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'an-1620-tan-11', family: 'tangents', steps: ['מעגל O', 'המשיק בנקודה A והמשיק בנקודה C למעגל O נחתכים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }], note: '2-D reads «נפגשים» here but not «נחתכים»' },
  { id: 'an-1620-tan-12', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיקים נפגשים בנקודה D'], expect: 'asks', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }], note: 'one tangent drawn: which two?' },
  { id: 'an-1620-tan-13', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'D נקודת החיתוך של המשיקים'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'meet-verb-1620', family: 'intersections', steps: ['מרובע ABCD', 'הישר AC והישר BD נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'ADR-AG-213: «נפגשים» is «נחתכים» for two lines' },
  { id: 'cat-3d-001', family: 'midpoint-ratio', steps: ['משולש ABC', 'E על AC כך ש-AE:EC = 2:1'], expect: 'builds' },
  { id: 'cat-3d-002', family: 'lengths', steps: ['משולש ABC', 'AB = 3'], expect: 'builds' },
  { id: 'cat-3d-003', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC = 4.5'], expect: 'builds' },
  { id: 'cat-3d-004', family: 'polygons', steps: ['ABEC מלבן'], expect: 'builds' },
  { id: 'cat-3d-005', family: 'angles', steps: ['משולש ABC', '∠BAC = 90'], expect: 'builds' },
  { id: 'cat-3d-006', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מקביל ל-CD'], expect: 'builds' },
  { id: 'cat-3d-007', family: 'intersections', steps: ['מרובע ABCD', 'AC ו-BD נחתכים'], expect: 'builds' },
  { id: 'cat-3d-008', family: 'lengths', steps: ['מרובע ABCD', 'המרחק בין D לישר AB הוא 5'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-3d-009', family: 'lengths', steps: ['טרפז ABCD', 'המרחק בין AB לבין CD הוא 3'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }] },
  { id: 'cat-3d-010', family: 'angles', steps: ['משולש ABC', 'קוסינוס הזווית ACB = 3/4'], expect: 'builds', note: '2-D draws acos 3/4 ≈ 41.41° since #1698 (ADR-566)' },
  { id: 'trig-sine-choice-1711', family: 'angles', steps: ['משולש ABC', 'סינוס הזווית ACB = 3/4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1726' }], note: 'a sine fits θ and 180° − θ — a configuration choice «הציגו תצורה אחרת» cycles (#1711, operator ruling 2026-10-03)' },
  { id: 'trig-sine-out-of-range-1711', family: 'angles', steps: ['משולש ABC', 'סינוס הזווית ACB = 5/4'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1726' }], note: 'no angle has a sine above 1 (#1711)' },
  { id: 'cat-3d-011', family: 'angles', steps: ['משולש ABC ישר זווית'], expect: 'builds' },
  { id: 'cat-3d-012', family: 'polygons', steps: ['ABC משולש שווה צלעות'], expect: 'builds' },
  { id: 'cat-3d-013', family: 'polygons', steps: ['ABC משולש שווה שוקיים'], expect: 'builds' },
  { id: 'cat-3d-014', family: 'polygons', steps: ['מרובע MKNL'], expect: 'builds' },
  { id: 'cat-3d-015', family: 'polygons', steps: ['מחומש ABCDE'], expect: 'builds' },
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
  { id: 'pyr-angle-label', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', '∠SDB = α'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds' },
  { id: 'pyr-angle-label-value', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', '∠SDB = α', 'α = 70'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע', '∠SDB = α'] }, expect: 'builds' },
  { id: 'pyr-angle-between', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', '60 < זווית SAB < 90'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds' },
  { id: 'pyr-angle-greater', family: 'angles', steps: ['מרובע ABCD', 'נקודה S', 'זווית SAB גדולה מ-60'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds' },
  { id: 'right-angle-vertex', family: 'angles', steps: ['משולש AOB', 'זווית O ישרה'], expect: 'builds' },
  { id: 'bisector-named', family: 'cevians-centres', steps: ['משולש AOC', 'OD חוצה זווית AOC'], expect: 'builds' },
  // ── #1620 S4 (ADR-AG-209): the cevian family's remaining spellings, as 2-D reads them ──
  { id: 'cevian-named-only', family: 'cevians-centres', steps: ['משולש ABC', 'AD גובה'], expect: 'builds' },
  { id: 'cevian-to-side', family: 'cevians-centres', steps: ['משולש ABC', 'תיכון לצלע BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cevian-plural-respectively', family: 'cevians-centres', steps: ['משולש OBC', 'OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1685' }, { product: '3d', issue: '#1679' }], note: '471 corpus 7/4, as S1 teaches its imperative' },
  { id: 'bisector-copula', family: 'cevians-centres', steps: ['משולש CMD', 'AM הוא חוצה זווית CMD'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1685' }, { product: '3d', issue: '#1679' }], note: '471 corpus 22/5' },
  { id: 'bisector-wrong-vertex', family: 'cevians-centres', steps: ['משולש ABC', 'AD חוצה זווית C'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }], note: 'the honesty invariant: a segment from A cannot bisect ∠C (2-D refuses since #1684, ADR-568)' },
  { id: 'bisector-wrong-vertex-en', family: 'cevians-centres', steps: ['משולש ABC', 'AD bisects angle C'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }], note: 'the English twin (#1684)' },
  { id: 'cevian-apex-two-triangles', family: 'cevians-centres', steps: ['משולש ABC', 'משולש ABD', 'AE גובה'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679' }], note: 'ADR-052: A is in two triangles with different opposite sides (2-D asks since #1684, ADR-568)' },
  { id: 'cevian-apex-two-triangles-side', family: 'cevians-centres', steps: ['משולש ABC', 'משולש ABD', 'AE גובה לצלע BD'], expect: 'builds', note: 'naming the side answers the #1684 question' },
  { id: 'bisector-foot', family: 'cevians-centres', steps: ['משולש AOC', 'D על AC כך ש-OD חוצה-זווית AOC'], expect: 'builds' },
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
  { id: 'diag-meet', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים AC ו-BD נפגשים בנקודה E'], expect: 'builds' },

  // ── #1620 (ADR-AG-208): extensions, named diagonals, a point on a side with a condition, the midsegment ──
  { id: 'ext-side-1620', family: 'points-incidence', steps: ['מרובע ABCD', 'הנקודה E נמצאת על המשך הצלע BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'ext-bare-1620', family: 'points-incidence', steps: ['משולש ABC', 'F נמצאת על המשך BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'ext-condition-1620', family: 'points-incidence', steps: ['מרובע ABCD', 'E על המשך BC כך ש-DE = DC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'ext-meet-1620', family: 'intersections', steps: ['מרובע ABCD', 'המשכי הצלעות AD ו-BC נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'ext-given-clause-1682', family: 'points-incidence', steps: ['מרובע ABCD', 'הנקודה E נמצאת על המשך הצלע BC ונתון כי DE = DC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '#1682 (ADR-570): the clause is a given, read like «כך ש» — 2-D built before too, with DE = DC dropped' },
  { id: 'ext-beyond-1682', family: 'points-incidence', steps: ['מרובע ABCD', 'הנקודה E נמצאת על המשך הצלע BC מעבר לנקודה B'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '#1682 (ADR-570): «מעבר לנקודה B» picks the end — 2-D built before too, past C' },
  { id: 'side-given-clause-1682', family: 'points-incidence', steps: ['משולש ABC', 'D על BC ונתון כי AD = AC'], expect: 'builds', note: '#1682 (ADR-570): the on-side twin of ext-given-clause-1682. The verdict alone passed in 3-D while AD = AC was dropped (#1730) — side-given-clause-holds-1730 checks the given is held' },
  { id: 'side-given-clause-holds-1730', family: 'points-incidence', steps: ['משולש ABC', 'AC = 2', 'D על BC ונתון כי AD = AC', 'AD = 1'], expect: 'refused', note: 'the CONTENT check of side-given-clause-1682 (#1730, ADR-3D-296): with AD = AC held, AD = 1 contradicts AC = 2; a builder that dropped the clause builds it (3-D on 4fbb3293 did)' },
  { id: 'ext-meet-each-1620', family: 'intersections', steps: ['מרובע ABCD', 'המשך הצלע AD והמשך הצלע BC נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'ext-circle-1620', family: 'circles', steps: ['מעגל O', 'משולש ABC', 'המשך AC חותך את מעגל O בנקודה E'], expect: 'builds', exception: 'X8' },
  { id: 'side-condition-1620', family: 'points-incidence', steps: ['משולש ABC', 'הנקודה E נמצאת על צלע BC כך ש-AE = AC'], expect: 'builds' },
  { id: 'diag-meet-crossing-1620', family: 'intersections', steps: ['דלתון ABCD', 'E היא נקודת החיתוך של אלכסוני הדלתון'], expect: 'builds' },
  { id: 'meet-noun-1609', family: 'intersections', steps: ['מרובע ABCD', 'M מפגש AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'meet-point-of-1609', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת המפגש של AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'meet-lines-plural-1609', family: 'intersections', steps: ['מרובע ABCD', 'M מפגש הישרים AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'meet-line-with-1609', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת המפגש של הישר AC עם הישר BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'cross-lines-plural-1609', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת החיתוך של הישרים AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'diag-meet-noun-1620', family: 'intersections', steps: ['טרפז ABCD', 'מרובע EFGH', 'אלכסוני הטרפז נפגשים בנקודה M'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'the noun selects the trapezoid beside a plain quadrilateral' },
  { id: 'diag-meet-right-trapezoid-1620', family: 'intersections', steps: ['טרפז ישר זווית ABCD', 'אלכסוני הטרפז נפגשים בנקודה M'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'diag-meet-two-trapezoids-1620', family: 'intersections', steps: ['טרפז ABCD', 'טרפז EFGH', 'אלכסוני הטרפז נפגשים בנקודה M'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'diag-meet-generic-two-1620', family: 'intersections', steps: ['טרפז ABCD', 'מרובע EFGH', 'אלכסוני המרובע נפגשים בנקודה M'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'diag-meet-sides-1683', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים AB ו-CD נפגשים בנקודה E'], expect: 'refused', note: 'AB and CD are sides of ABCD, not its diagonals (#1683, ADR-569; analytic ADR-AG-208; 3-D #1728, ADR-3D-297)' },
  { id: 'diag-meet-holds-1728', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים AC ו-BD נפגשים בנקודה E', 'E על BD'], expect: 'builds', note: 'the CONTENT check of diag-meet (#1728, ADR-3D-297): E lies on the SECOND diagonal too. 3-D on 4fbb3293 put E at the midpoint of AC alone, so «E על BD» was refuted' },
  { id: 'diag-meet-no-figure-1620', family: 'intersections', steps: ['האלכסונים AC ו-BD נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'diagonal-decl-1620', family: 'polygons', steps: ['מרובע ABCD', 'האלכסון AC'], expect: 'builds' },
  { id: 'diagonal-in-ring-1620', family: 'polygons', steps: ['מרובע ABCD', 'האלכסון AC במרובע ABCD'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: 'the sentence #1620 S1 teaches «העבירו את האלכסון AC במרובע ABCD» onto; 2-D does not read the ring tail' },
  { id: 'symbol-length', family: 'lengths', steps: ['משולש ABC', 'AB = 3x'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679' }], note: 'ported to analytic 2026-10-02, withdrawn for x/y 2026-10-03: analytic refuses it with the teaching message' },
  { id: 'symbol-length-square', family: 'lengths', steps: ['משולש ABC', 'AB = x²'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679' }] },

  // ── #1622 E2 (ADR-AG-218): the sentences slice E makes readable in analytic, each at 2-D's measured verdict ──
  { id: 'congruent-he-1622', family: 'lengths', steps: ['משולש ABC חופף למשולש DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'X11, ported by ruling 2 (2026-10-02)' },
  { id: 'similar-plural-he-1622', family: 'angles', steps: ['המשולשים ABC ו-DEF דומים'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'X12' },
  { id: 'congruent-proof-target-1622', family: 'lengths', steps: ['הוכיחו ש-△ABC ≅ △DEF'], expect: 'refused', note: 'a PROOF TARGET is never a given (#1666) — the boundary ≅ as a given must not cross' },
  { id: 'segment-product-1622', family: 'lengths', steps: ['משולש ABC', 'D על BC', 'AB·AC = AD²'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'X13' },
  { id: 'symbol-length-chain-1622', family: 'lengths', steps: ['משולש ABC', 'AB = AC = 3x'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679' }], note: 'a chained equality with a value' },
  { id: 'symbol-length-y-1622', family: 'lengths', steps: ['משולש ABC', 'AB = 2y'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'symbol-length-beside-line-1622', family: 'topic', steps: ['משולש ABC', 'AB = 3x', 'y = 2x + 1'], expect: 'builds', exception: 'X2', contextFor: { analytic: ['משולש ABC', 'AB = 3a'] }, note: 'a length never makes the equation\'s x a length; analytic states its length with another letter (an x-length is X10 there since 2026-10-03)' },
  { id: 'symbol-length-letter-1622', family: 'lengths', steps: ['משולש ABC', 'AB = 3a'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'every letter but x and y is a free length in both builders' },
  { id: 'symbol-length-letter-chain-1622', family: 'lengths', steps: ['משולש ABC', 'AB = AC = 3a'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'symbol-length-letter-root-1622', family: 'lengths', steps: ['AD = 12√a'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'vertex-value-1622', family: 'angles', steps: ['משולש ABC', 'A = 40'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'vertex-value-free-1622', family: 'angles', steps: ['נקודה A', 'A = 40'], expect: 'asks', exception: 'X9', note: 'a free point has no arms: 2-D asks which angle' },
  { id: 'area-label-1622', family: 'area-perimeter', steps: ['מרובע ABCD', 'נסמן את שטח ABCD ב-S'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  // #1622 E5 (ADR-AG-221): an order between angle aliases, an angle named by a label, and an area label on an empty canvas.
  { id: 'alias-order-bound-1622', family: 'angles', steps: ['α < 30'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: "2-D's measure-bound on the alias, before any angle names it" },
  { id: 'alias-order-window-1622', family: 'angles', steps: ['20 < α < 60'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'alias-order-closed-1622', family: 'angles', steps: ['α ≤ β'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'alias-order-binds-1622', family: 'angles', steps: ['α < β', 'משולש ABC', '∢ABC = α', '∢BAC = β'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'the order binds when the aliases name angles' },
  { id: 'angle-label-1622', family: 'angles', steps: ['משולש ABC', 'נקודה M על BC', 'נסמן זוית BAM כ-A1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'angle-label-digit-1622', family: 'angles', steps: ['משולש ABC', 'נסמן זוית CAB כ 1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'the bare digit is the vertex letter plus the digit: A1' },
  { id: 'angle-label-equals-1622', family: 'angles', steps: ['משולש ABC', 'נסמן ∠CAB=A1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'angle-label-greek-1622', family: 'angles', steps: ['משולש ABC', 'נקודה M על BC', 'נסמן זוית BAM כ-α'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'a Greek name is the alias: «∢BAM = α»' },
  { id: 'area-label-triangle-1622', family: 'area-perimeter', steps: ['נסמן את שטח המשולש ABC ב-S'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'area-value-unknown-1622', family: 'area-perimeter', steps: ['שטח ABCD = 20'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }], note: 'only the LABEL introduces its region: a VALUE about points that do not exist is refused, as in 2-D' },
  { id: 'segments-cross-pair-1622', family: 'intersections', steps: ['הקטעים AB ו-CD נחתכים'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'segment-bisects-named-1622', family: 'cevians-centres', steps: ['CD חוצה את AB בנקודה K'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'distances-free-1622', family: 'lengths', steps: ['נקודה A', 'נקודה B', 'C במרחק 5 מ-A ו-5 מ-B'], expect: 'builds', exception: 'X9' },
  { id: 'chain-length-value-1622', family: 'lengths', steps: ['משולש ABC', 'AB = AC = 5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'angle-sides-disjoint-1622', family: 'angles', steps: ['מרובע ABCD', 'הזווית בין BD ל-CA היא 30'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }], note: 'sides with no common end form no angle: 2-D refuses' },
  { id: 'chord-cross', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O', 'במעגל המיתרים AC ו-BD נפגשים בנקודה E'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1678' }], note: '2-D answers a conflict: its free points on the circle do not keep AC and BD crossing' },
  // ── #1622 slice E1 (ADR-AG-217): what the shapes-and-points port reads beyond the rows above, 2-D measured ──
  { id: 'e1-bare-run-3', family: 'polygons', steps: ['ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-unnamed-square', family: 'polygons', steps: ['ריבוע'], expect: 'builds' },
  { id: 'e1-unnamed-triangle', family: 'polygons', steps: ['משולש'], expect: 'builds' },
  { id: 'e1-hexagon', family: 'polygons', steps: ['משושה ABCDEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-octagon', family: 'polygons', steps: ['מתומן ABCDEFGH'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-regular-hexagon', family: 'polygons', steps: ['משושה משוכלל ABCDEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-regular-unnamed', family: 'polygons', steps: ['מחומש משוכלל'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-heptagon-bare', family: 'polygons', steps: ['משובע ABCDEFG'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-rectangle-side', family: 'lengths', steps: ['מלבן ABCD שצלעו 4'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-rhombus-side', family: 'lengths', steps: ['מעוין ABCD שצלעו 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-equilateral-side', family: 'lengths', steps: ['משולש שווה צלעות ABC שצלעו 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-rectangle-dims-named', family: 'lengths', steps: ['מלבן ABCD במידות 4*6'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-rectangle-by', family: 'lengths', steps: ['מלבן 4 על 6'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-same-side', family: 'points-incidence', steps: ['משולש ABC', 'C ו-D באותו צד של AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-outside', family: 'polygons', steps: ['משולש ABC', 'הנקודה D נמצאת מחוץ למשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-line-two-points', family: 'points-incidence', steps: ['קו ועליו נקודות A ו-B'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-ordered-four', family: 'points-incidence', steps: ['משולש ABC', 'ישר ABEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-at-distance-far-end', family: 'lengths', steps: ['משולש ABC', 'D על AB במרחק 3 מ-B'], expect: 'builds', note: 'as cat-2d-027: 3-D reads BD = 3 since #1730 and builds it since #1735' },
  { id: 'e1-fraction-side', family: 'midpoint-ratio', steps: ['משולש ABC', 'נקודה E על הצלע AC ב-40%'], expect: 'builds', exception: 'X9' },
  { id: 'e1-length-greater', family: 'points-incidence', steps: ['AB > 5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'e1-length-closed', family: 'points-incidence', steps: ['5 ≤ AB ≤ 9'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
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
  { id: 'radius-unnamed-centre-1670', family: 'chords-arcs', steps: ['AB קוטר', 'OB רדיוס'], expect: 'builds', exception: 'X8' },
  { id: 'on-circle-no-circle-1670', family: 'circles', steps: ['A על המעגל'], expect: 'builds', exception: 'X8' },
  // operator rulings on #1670 / #1686 (2026-10-02): an unlabelled centre must NOT answer to «O», and the new letter is minted
  // anyway — «BO = 5» draws BO with O a FREE point, which a later «O מרכז המעגל» places (ADR-AG-210)
  { id: 'hidden-centre-letter-1673', family: 'circles', steps: ['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה', 'BO = 5'], expect: 'builds', exception: 'X8', note: 'builds with O a free point, never the hidden centre (#1673, #1686)' },
  { id: 'bare-relation-new-letters-1670', family: 'parallel-perpendicular', steps: ['מעגל O', 'BD⊥AC'], expect: 'builds', exception: 'X8', note: 'new letters in a bare relation: 2-D mints them; analytic does since #1670 (ADR-AG-210, ruled to follow 2-D)' },
  // #1670 (ADR-AG-210): the class — every form 2-D mints new letters for, and the forms it does NOT (#1028 holds there).
  // One free point (X9 — 3-D has none) and the rest of the letters NEW.
  { id: 'bare-length-1670', family: 'lengths', steps: ['נקודה A', 'AB = 5'], expect: 'builds', exception: 'X9' },
  { id: 'bare-equal-1670', family: 'lengths', steps: ['נקודה A', 'AB = CD'], expect: 'builds', exception: 'X9' },
  { id: 'bare-scaled-length-1670', family: 'lengths', steps: ['נקודה A', 'AB = 2CD'], expect: 'refused', exception: 'X9', note: '2-D mints no letter for a scaled length' },
  { id: 'bare-ratio-1670', family: 'midpoint-ratio', steps: ['נקודה A', 'AB:BC = 2:3'], expect: 'refused', exception: 'X9', note: '2-D mints no letter for a ratio alone' },
  { id: 'bare-midpoint-1670', family: 'midpoint-ratio', steps: ['נקודה A', 'M אמצע AB'], expect: 'builds', exception: 'X9' },
  { id: 'bare-divider-1670', family: 'midpoint-ratio', steps: ['נקודה A', 'C מחלקת את AB ביחס 3:2'], expect: 'builds', exception: 'X9' },
  { id: 'bare-angle-1670', family: 'angles', steps: ['נקודה A', 'זווית ABC = 30'], expect: 'builds', exception: 'X9' },
  { id: 'bare-on-segment-1670', family: 'points-incidence', steps: ['נקודה E', 'E על AB'], expect: 'builds', exception: 'X9' },
  { id: 'bare-crossing-1670', family: 'intersections', steps: ['נקודה A', 'AB חותך את CD בנקודה E'], expect: 'builds', exception: 'X9' },
  { id: 'bare-parallel-1670', family: 'parallel-perpendicular', steps: ['נקודה A', 'AB∥CD'], expect: 'builds', exception: 'X9' },
  { id: 'cevian-no-shape-1670', family: 'cevians-centres', steps: ['נקודה A', 'AD גובה לצלע BC'], expect: 'refused', exception: 'X9', note: 'a side named alone presupposes its shape: 2-D refuses, nothing is minted' },
  { id: 'cevian-median-triangle-empty-1720', family: 'cevians-centres', steps: ['AD תיכון במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '#1720 (ADR-571): the named triangle is introduced, as the altitude form did' },
  { id: 'cevian-bisector-triangle-empty-1720', family: 'cevians-centres', steps: ['AD חוצה זווית במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '#1720 (ADR-571)' },
  { id: 'cevian-altitude-triangle-empty-1720', family: 'cevians-centres', steps: ['AD גובה במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '#1720 (ADR-571): the reference the other two now match' },
  { id: 'cevian-named-triangle-1670', family: 'cevians-centres', steps: ['נקודה A', 'AD גובה במשולש ABC'], expect: 'builds', exception: 'X9' },
  { id: 'on-circle-indefinite-1670', family: 'circles', steps: ['A על מעגל'], expect: 'builds', exception: 'X8' },
  { id: 'on-named-circle-new-1670', family: 'circles', steps: ['A על מעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'chords-no-circle-1670', family: 'chords-arcs', steps: ['AB ו-CD מיתרים'], expect: 'builds', exception: 'X8' },
  { id: 'radius-names-chord-centre-1670', family: 'chords-arcs', steps: ['מיתר AB', 'OA רדיוס'], expect: 'builds', exception: 'X8' },
  { id: 'diameter-named-circle-new-1670', family: 'chords-arcs', steps: ['AB קוטר במעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'tangent-at-new-circle-1670', family: 'tangents', steps: ['המשיק למעגל O בנקודה A'], expect: 'builds', exception: 'X8' },
  { id: 'bare-relation-unnamed-centre-1670', family: 'chords-arcs', steps: ['AB קוטר', 'CD ⊥ AB'], expect: 'builds', exception: 'X8', note: 'a new letter beside an unnamed centre is minted free (operator ruling on #1686)' },

  // ── #1622 E3 + #1693 (ADR-AG-219): the circle sentences analytic now reads, and the #1688 naming by order ──
  { id: 'two-circles-named-by-order-1693', family: 'circles', steps: ['שני מעגלים נחתכים בנקודות A ו B', 'נקודה C על מעגל P', 'המשך CA חותך את מעגל O בנקודה D', 'המשך CB חותך את מעגל O בנקודה E'], expect: 'builds', exception: 'X8', note: 'two fresh interchangeable circles are named by order on first mention (#1688 ruling)' },
  { id: 'two-circles-centres-by-order-1693', family: 'circles', steps: ['שני מעגלים נחתכים', 'O מרכז המעגל', 'P מרכז המעגל'], expect: 'builds', exception: 'X8', note: 'the first naming names one circle, the next the other (#1688 ruling)' },
  { id: 'two-circles-nested-1622', family: 'circles', steps: ['שני מעגלים מוכלים'], expect: 'builds', exception: 'X8' },
  { id: 'circle-by-area-1622', family: 'circles', steps: ['מעגל O ששטחו 9π'], expect: 'builds', exception: 'X8' },
  { id: 'circle-by-radius-unnamed-1622', family: 'circles', steps: ['מעגל שרדיוסו 5'], expect: 'builds', exception: 'X8' },
  { id: 'radius-letters-order-1622', family: 'circles', steps: ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'R > r'], expect: 'builds', exception: 'X8' },
  { id: 'common-tangent-internal-1622', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'AB משיק משותף פנימי לשני המעגלים'], expect: 'builds', exception: 'X8' },
  { id: 'centre-of-given-circle-1622', family: 'circles', steps: ['נתון מעגל', 'מרכז המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'radius-of-created-circle-1622', family: 'circles', steps: ['A על המעגל', 'רדיוס המעגל הוא 5'], expect: 'builds', exception: 'X8' },
  { id: 'chord-tangent-other-circle-1622', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'AB מיתר במעגל O ומשיק למעגל P'], expect: 'builds', exception: 'X8' },
  { id: 'circle-inside-the-circle-1622', family: 'circles', steps: ['מעגל O', 'מעגל מוכל בתוך המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'circle-by-circumference', family: 'circles', steps: ['מעגל O שהיקפו 6π'], expect: 'builds', exception: 'X8' },
  // ── #1621 D2 (ADR-AG-215): an angle named by a Greek letter, the «נסמן» lead-in, the pin, and tan/cos of an angle ──
  { id: 'alias-nasmen-1621', family: 'angles', steps: ['מרובע ABCD', 'נסמן ∢DCB = 2α'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'corpus 471 1/4' },
  { id: 'alias-nasmen-colon-1621', family: 'angles', steps: ['משולש ABD', 'נסמן: זווית ADB = α'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'corpus 471 3/4' },
  { id: 'alias-bare-1621', family: 'angles', steps: ['משולש ABC', '∢ABC = α'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'alias-two-angles-1621', family: 'angles', steps: ['משולש ABC', '∢ABC = β', '∢ACB = β'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'alias-pin-1621', family: 'angles', steps: ['משולש ABC', '∢ABC = α', 'α = 30'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'trig-tan-1621', family: 'angles', steps: ['משולש ABC', 'tan∢ABC = 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'corpus 471 9/4; 2-D builds it as a 2° angle — a wrong figure the verdict cannot see (#1698)' },
  { id: 'trig-tan-paren-1621', family: 'angles', steps: ['משולש ABC', 'tan(∢ABC) = 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '2-D: 2° (#1698)' },
  { id: 'trig-tg-1621', family: 'angles', steps: ['משולש ABC', 'tg∢ABC = 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '2-D: 2° (#1698)' },
  { id: 'trig-tan-he-1621', family: 'angles', steps: ['משולש ABC', 'טנגנס הזווית ABC הוא 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '2-D: 2° (#1698)' },
  { id: 'trig-cos-1621', family: 'angles', steps: ['משולש ABC', 'cos∢ACB = 3/4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '2-D: 3° (#1698)' },
  // ── #1719 (ADR-AG-227): sin of an angle — a choice between its two angles; |sin| > 1 is refused ──
  { id: 'trig-sin-1719', family: 'angles', steps: ['משולש ABC', 'sin∢ABC = 0.5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '2-D builds it too since #1711 (ADR-573, a two-angle choice); 3-D does not read sin (#1726/#1679)' },
  { id: 'trig-sin-he-1719', family: 'angles', steps: ['משולש ABC', 'סינוס הזווית ABC הוא 0.5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: '2-D builds it too since #1711 (ADR-573, a two-angle choice); 3-D does not read sin (#1726/#1679)' },
  { id: 'trig-sin-range-1719', family: 'angles', steps: ['משולש ABC', 'sin∢ABC = 2'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'altitude-is-segment', family: 'cevians-centres', steps: ['משולש ABC', 'גובה המשולש לצלע AB הוא CD'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }], note: "3-D's catalog sentence; 2-D does not read it" },
  // ── an ORDER between measures, a bound, an angle's acuteness (#1621 D3, ADR-AG-216): regions, as 2-D reads them ──
  { id: 'order-length-1621', family: 'lengths', steps: ['משולש ABC', 'AB < BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'order-length-word-1621', family: 'lengths', steps: ['משולש ABC', 'AB קטן מ-BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'order-length-quad-1621', family: 'lengths', steps: ['מרובע ABCD', 'DC > AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'order-length-bare-1621', family: 'lengths', steps: ['AB < BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'a bare order mints its letters, as its equality twin does (ADR-AG-210)' },
  { id: 'order-length-bound-1621', family: 'lengths', steps: ['משולש ABC', 'AB ≤ 10'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'order-length-at-least-1621', family: 'lengths', steps: ['משולש ABC', 'AB לפחות 3'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'order-angle-bound-1621', family: 'angles', steps: ['משולש ABC', '∢ABC ≤ 40°'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'order-angle-window-1621', family: 'angles', steps: ['משולש ABC', '20 < ∢ABC < 60'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'order-angle-acute-1621', family: 'angles', steps: ['משולש ABC', 'זווית ABC חדה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'order-angle-angle-1621', family: 'angles', steps: ['משולש ABC', '∢ABC < ∢BAC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: "2-D reads an order between two named VARIABLES (α < β) and between two segments, not between two angles; its equality twin «∢ABC = ∢BAC» builds there" },
  { id: 'order-length-conflict-1621', family: 'lengths', steps: ['משולש ABC', 'AB = 5', 'BC = 7', 'AB > BC'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }], note: 'a strict order never moves a determined figure: the one it contradicts is refused on the sentence' },
  // ── #1621 D1 (ADR-AG-214): measures as givens — ratios and areas ──
  { id: 'area-ratio-prose-1621', family: 'area-perimeter', steps: ['משולש AOB', 'טרפז ADCB', 'היחס בין שטח המשולש AOB לשטח הטרפז ADCB הוא 4:5'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: 'corpus 6/5; 2-D reads «הוא 4» and its honesty gate escalates the dropped 5' },
  { id: 'area-ratio-notation-1621', family: 'area-perimeter', steps: ['משולש ABC', 'נקודה D על BC', 'S_{ABD} / S_{ADC} = 0.8'], expect: 'builds', exception: 'X9', note: 'corpus 7/4 writes S_BDC / S_ODC' },
  { id: 'area-notation-value-1621', family: 'area-perimeter', steps: ['משולש ABC', 'S_{ABC} = 13'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'area-value-equals-1621', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC שווה ל-45'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: 'corpus 18/4; 2-D splits it at «שטח המשולש» (split-statements)' },
  { id: 'length-ratio-slash-1621', family: 'midpoint-ratio', steps: ['משולש ABC', 'נקודה D על BC', 'BD/DC = 2/3'], expect: 'builds', exception: 'X9', note: 'corpus 16/5 «DO/DE = 2/3», 17/4 «CD/OB = 5/2»' },
  { id: 'area-ratio-impossible-1621', family: 'area-perimeter', steps: ['משולש ABC', 'נקודה D על BC', 'S_{ABD} / S_{ABC} = 2'], expect: 'refused', exception: 'X9', note: 'a part twice its whole: refused naming the statement' },
  { id: 'area-ratio-no-region-1621', family: 'area-perimeter', steps: ['משולש ABC', 'S_{XYZ} / S_{ABC} = 2'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }], note: 'a region whose vertices do not exist is refused by name' },
  // ── #1622 E4 (ADR-AG-220): arcs, sectors, semicircles and the diameter from a point, as 2-D reads them ──
  { id: 'e4-arc-glyph', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'C על מעגל O', '⌢{AC} = 60°'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-contextual', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'קשת AC = 60'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-reflex', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'קשת AB = 200'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-equal-words', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'קשת AB שווה לקשת BC'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-sum-value', family: 'chords-arcs', steps: ['נתון מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O', 'קשת AB + קשת CD = 180'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-unknown-end', family: 'chords-arcs', steps: ['מעגל O', 'קשת AB = 40 במעגל O'], expect: 'refused', exception: 'X8', note: 'an arc whose ends the figure does not have is refused in both (2-D: «references an unknown point»)' },
  { id: 'e4-central-value', family: 'chords-arcs', steps: ['מעגל O', 'זוית מרכזית COD = 80'], expect: 'builds', exception: 'X8' },
  { id: 'e4-sector-free', family: 'chords-arcs', steps: ['גזרה AOB'], expect: 'builds', exception: 'X8' },
  { id: 'e4-sector-reflex', family: 'chords-arcs', steps: ['גזרה AOB בזווית 200'], expect: 'builds', exception: 'X8' },
  { id: 'e4-quarter-named', family: 'chords-arcs', steps: ['רבע מעגל OAB'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-mid-contextual', family: 'chords-arcs', steps: ['מעגל O', 'B על מעגל O', 'C על מעגל O', 'M אמצע הקשת BC'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-mid-major', family: 'chords-arcs', steps: ['מעגל O', 'B על מעגל O', 'C על מעגל O', 'M אמצע הקשת הגדולה BC'], expect: 'builds', exception: 'X8' },
  { id: 'e4-semi-beside-circle', family: 'chords-arcs', steps: ['מעגל O', 'חצי מעגל שקוטרו AB'], expect: 'builds', exception: 'X8' },
  { id: 'e4-semi-inside', family: 'chords-arcs', steps: ['משולש ABC', 'חצי מעגל על צלע AB בתוך המשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'e4-circle-diameter-named', family: 'chords-arcs', steps: ['מעגל O בקוטר 10'], expect: 'builds', exception: 'X8' },
  { id: 'e4-circle-diameter-shekotro', family: 'chords-arcs', steps: ['מעגל O שקוטרו 10'], expect: 'builds', exception: 'X8' },
  { id: 'e4-diameter-from-contextual', family: 'chords-arcs', steps: ['מעגל O', 'F על מעגל O', 'קוטר מנקודה F'], expect: 'builds', exception: 'X8' },
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
  { id: 'ex-coordinate-of', family: 'topic', steps: ['נקודה A', 'x של A הוא 5'], contextFor: { '3d': [] }, expect: 'builds', exception: 'X6', note: '3-D has no bare point declaration; the coordinate creates A there (#1547)' },
  { id: 'ex-coordinate-of-vertex-1621', family: 'topic', steps: ['משולש ABC', 'שיעור ה-y של הקודקוד A הוא 10'], expect: 'builds', exception: 'X6', note: '#1621: the exam names a vertex «הקודקוד A»' },
  { id: 'ex-coordinate-compare-vertex-1621', family: 'topic', steps: ['משולש ABC', 'שיעור ה-y של הקודקוד B קטן מ-6'], expect: 'builds', exception: 'X6', only: ['analytic'], note: '3-D reads a comparison with ZERO only (#1547 scope ruling, 2026-09-29); a comparison with another number is its successor' },
  { id: 'ex-distance-notation', family: 'topic', steps: ['A(0,0)', 'נקודה B', 'd_{AB} = 10'], contextFor: { '2d': ['נקודה A', 'נקודה B'] }, expect: 'builds', exception: 'X6', only: ['analytic'] },
  // #1547 (ADR-3D-299): one coordinate on an empty canvas — the point is created with that coordinate and the rest free
  { id: 'ex-coordinate-subscript-1547', family: 'topic', steps: ['x_B = 3'], expect: 'builds', exception: 'X6' },
  { id: 'ex-coordinate-value-1547', family: 'topic', steps: ['שיעור ה-x של B הוא 3'], expect: 'builds', exception: 'X6' },
  { id: 'ex-solid', family: 'topic', steps: ['פירמידה SABCD שבסיסה ריבוע'], expect: 'builds', exception: 'X7' },
  { id: 'ex-cube', family: 'topic', steps: ["קובייה ABCDA'B'C'D'"], expect: 'builds', exception: 'X7' },
  { id: 'ex-plane-1656', family: 'topic', steps: ['משולש ACD', 'נקודה S', 'דרך AC העבירו מישור המקביל ל-SD'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds', exception: 'X7', note: '#1656: 2-D used to commit AC ∥ SD' },
  { id: 'ex-sphere-1657', family: 'topic', steps: ['כדור שמרכזו O ורדיוסו 3'], expect: 'builds', exception: 'X7', note: '#1657: 2-D used to draw a circle' },
  { id: 'ex-vector', family: 'topic', steps: ['משולש ABC', 'וקטור AB'], expect: 'builds', exception: 'X7' },
  // ── #1616 rulings of 2026-10-03 (ADR-AG-222) ──
  { id: 'ex-position-above-1706', family: 'topic', steps: ['נקודה A', 'נקודה D', 'D מעל A'], expect: 'builds', exception: 'X1', only: ['analytic'], note: "#1706: y_D > y_A on analytic's fixed axes; 2-D does not read screen orientation" },
  { id: 'ex-position-below-1706', family: 'topic', steps: ['נקודה A', 'נקודה D', 'D מתחת ל-A'], expect: 'builds', exception: 'X1', only: ['analytic'] },
  { id: 'ex-position-right-1706', family: 'topic', steps: ['נקודה B', 'נקודה C', 'C מימין ל-B'], expect: 'builds', exception: 'X1', only: ['analytic'], note: '2-D refuses it as input.scope.orientation' },
  { id: 'ex-position-left-1706', family: 'topic', steps: ['נקודה B', 'נקודה C', 'C משמאל ל-B'], expect: 'builds', exception: 'X1', only: ['analytic'] },
  { id: 'ex-position-aside-1706', family: 'topic', steps: ['A ו-D על ציר ה-y (D מעל A), B ו-C על ציר ה-x (C מימין ל-B)'], expect: 'builds', exception: 'X1', only: ['analytic'], note: 'corpus 6/5 line 3: the position words inside the asides' },
  { id: 'ex-median-equation-1662', family: 'topic', steps: ['משולש ABC', 'משוואת התיכון AD היא y=x'], expect: 'builds', exception: 'X2', note: '#1662: the median claim is kept — D is the midpoint of BC' },
  { id: 'ex-altitude-equation-ask-1662', family: 'topic', steps: ['משולש ABC', 'משולש ABE', 'משוואת הגובה AD היא y=x'], expect: 'asks', exception: 'X2', note: '#1662: two triangles have the vertex A and neither side holds D' },
  { id: 'cevian-foot-on-side-1662', family: 'cevians-centres', steps: ['משולש ABC', 'משולש ABE', 'D על BC', 'AD גובה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'the triangle whose opposite side holds D (2-D measured: commits)' },
  { id: 'obtuse-triangle-1708', family: 'polygons', steps: ['משולש קהה זווית ABC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: '#1708: one of the three angles is obtuse — a choice over the vertices' },
  { id: 'obtuse-triangle-hyphen-1708', family: 'polygons', steps: ['משולש קהה-זווית ABC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'obtuse-triangle-letters-first-1708', family: 'polygons', steps: ['ABC משולש קהה זווית'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  // ── #1715 (ADR-AG-224): ONE meet frame, «<line> ו<line> נפגשים / נחתכים בנקודה E», over every line-object ──
  { id: 'meet-bisectors-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית C וחוצה זוית B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'the operator’s spelling (#1715 T4): E is the incentre' },
  { id: 'meet-bisectors-3-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית BCA וחוצה זוית CBA נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'meet-bisectors-cut-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה הזווית B וחוצה הזווית C נחתכים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'meet-bisector-line-2-1715', family: 'intersections', steps: ['משולש ABC', 'D על BC', 'הישר AD וחוצה זוית ABC נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }] },
  { id: 'meet-bisectors-short-cut-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית B וחוצה זוית C נחתכים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: '2-D reads «נפגשים» here but not «נחתכים»' },
  { id: 'meet-at-short-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית B וחוצה זוית C נפגשים ב-E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'meet-bisector-altitude-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית A והגובה מ-B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'meet-altitude-median-1715', family: 'intersections', steps: ['משולש ABC', 'הגובה מ-A והתיכון מ-B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }] },
  { id: 'meet-altitudes-1715', family: 'intersections', steps: ['משולש ABC', 'הגובה מ-A והגובה מ-B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: 'E is the orthocentre' },
  { id: 'meet-medians-1715', family: 'intersections', steps: ['משולש ABC', 'התיכון מ-A והתיכון מ-B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: 'E is the centroid' },
  { id: 'meet-perp-bisectors-1715', family: 'intersections', steps: ['משולש ABC', 'האנך האמצעי לצלע AB והאנך האמצעי לצלע BC נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: 'E is the circumcentre' },
  { id: 'meet-perpendicular-drawn-1715', family: 'intersections', steps: ['משולש ABC', 'האנך מ-C ל-AB', 'חוצה זוית B והאנך מ-C ל-AB נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: '«האנך מ-C ל-AB» refers to the drawn perpendicular (ADR-AG-207)' },
  { id: 'meet-same-line-twice-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית B וחוצה הזווית B נפגשים בנקודה E'], expect: 'refused', knownGap: [{ product: '2d', issue: '#1677' }, { product: '3d', issue: '#1679' }], note: 'one line twice names no point; 2-D builds a point on it' },
  { id: 'meet-parallel-1715', family: 'intersections', steps: ['מלבן ABCD', 'הישר AB והישר CD נפגשים בנקודה E'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679' }] },
  // ── #1607 (ADR-574): a role noun before a length keeps the role AND the length ──
  { id: 'role-length-diagonal-1607', family: 'lengths', steps: ['מקבילית ABCD', 'האלכסון AC = 8'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1679' }] },
  { id: 'role-length-median-1607', family: 'lengths', steps: ['משולש ABC', 'התיכון AM = 5'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1679' }] },
  { id: 'role-length-altitude-1607', family: 'lengths', steps: ['משולש ABC', 'הגובה AH הוא 5'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1679' }] },
  { id: 'role-length-bound-1607', family: 'lengths', steps: ['משולש ABC', 'התיכון AM גדול מ-5'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1679' }], note: 'a bound, never |AM| = 5 (#1248)' },
  // ── #1443 (ADR-575): a height stated as a magnitude with no segment named — the trapezoid builds, the others ask ──
  { id: 'height-trapezoid-1443', family: 'lengths', steps: ['טרפז ABCD', 'גובה הטרפז 4'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1448' }], note: 'the reported sentence; the height is minted and drawn between the bases' },
  { id: 'height-trapezoid-copula-1443', family: 'lengths', steps: ['טרפז ABCD', 'גובה הטרפז הוא 4'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1448' }] },
  { id: 'height-trapezoid-introduced-1443', family: 'lengths', steps: ['גובה הטרפז ABCD הוא 4'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1448' }], note: 'the trapezoid named by its letters on an empty canvas is introduced (the #1720 precedent)' },
  { id: 'height-triangle-asks-1443', family: 'lengths', steps: ['משולש ABC', 'גובה המשולש 4'], expect: 'asks', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1448' }], note: 'three heights — which one is the student’s to say (ADR-052)' },
  { id: 'height-parallelogram-asks-1443', family: 'lengths', steps: ['מקבילית ABCD', 'גובה המקבילית הוא 4'], expect: 'asks', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1448' }] },
  // ── #1749 (ADR-AG-235): the meet VERB reads the distributive plural through the crossing's reader ──
  { id: 'meet-verb-lines-plural-1749', family: 'intersections', steps: ['מרובע ABCD', 'הישרים AC ו-BD נפגשים בנקודה M'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679' }], note: 'control — analytic built it before through a second plural reader (`withLineNoun`); now through `distributedLines`' },
  { id: 'height-to-side-1443', family: 'lengths', steps: ['משולש ABC', 'הגובה לצלע BC הוא 4'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1737' }, { product: '3d', issue: '#1448' }] },

  // ── #1430 (ADR-AG-233): tangents FROM a point with a movement verb / unnamed touches, and a polygon side as the subject — 2-D builds each ──
  { id: 'tan-from-1430-01', family: 'tangents', steps: ['מעגל O', 'מנקודה P יוצאים שני משיקים למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'tan-from-1430-02', family: 'tangents', steps: ['מעגל O', 'מנקודה P יוצא משיק למעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'tan-from-1430-03', family: 'tangents', steps: ['מעגל O', 'מנקודה P יוצאים שני משיקים למעגל O, הנוגעים בו בנקודות A ו-B'], expect: 'builds', exception: 'X8' },
  { id: 'tan-side-1430-04', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'הצלע AB משיקה למעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'tan-side-1430-05', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'AB משיק למעגל O'], expect: 'builds', exception: 'X8' },
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
