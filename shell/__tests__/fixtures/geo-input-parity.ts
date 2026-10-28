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

export type ExceptionId = 'X1' | 'X2' | 'X3' | 'X4' | 'X5' | 'X6' | 'X7' | 'X8' | 'X9' | 'X10' | 'X11';

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
    title: 'coordinates, the origin, the axes, quadrants, position words between points, or against a line',
    reason:
      "the coordinate frame: 2-D is coordinate-free by design and sends these to the analytic builder. A position word between two points («D מעל A», «C מימין ל-B») is the frame too: analytic's axes are fixed, so it compares coordinates there (#1706, operator ruling 2026-10-03), while 2-D refuses screen orientation (input.scope.orientation) — those rows carry only: ['analytic']. A position word against a LINE («M מעל הישר KL», «M מימין לישר l») is the same frame: y against the line's y at the point, x against its x (#2386, operator rulings 2026-10-20, ADR-AG-310) — analytic's alone, only: ['analytic']",
    products: ['analytic', '3d'],
    mustRefuse: ['2d'],
    topic: true,
    patterns: [/\(\s*[-\w√.+ ]+,/, /ציר ה-?\s?[xyz]/, /ראשית/, /רביע/, /הצירים/, /(?:^|\()[A-Z]\d?\s+(?:מעל|מתחת|מימין|משמאל)\s*ל?-?\s*[A-Z]\d?(?:$|\))/, /(?:מעל|מתחת|מימין|משמאל)\s*ל?-?\s*ה?ישר/, /(?:above|below|to the (?:right|left) of) (?:the )?line/i],
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
  X11: {
    title: 'a capital letter as a size in analytic («נתון מעגל O שרדיוסו K», «AB = AC + D»)',
    reason:
      "operator ruling 2026-10-20 on #2427 (ADR-AG-325, amending ADR-AG-307's \"only R\"): in analytic a capital letter is a point's name, so a size written with one — a radius, a length, an angle, a parameter — is refused with a teaching message (sizes are lowercase, except R for a radius and an area's label); \"Only R\" stays analytic-only, so 2-D keeps reading a capital radius («שרדיוסו K») and declines «AB = AC + D». Every other spelling is a plain parity row",
    products: ['2d', '3d'],
    mustRefuse: ['analytic'],
    topic: false,
    patterns: [/(?:רדיוס\S*|radius)\s+[A-QS-Z](?![A-Za-z0-9₀-₉_'])/, /[=+−-]\s*\d*[A-QS-Z](?![A-Za-z0-9₀-₉_'])\s*$/],
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
  /**
   * The gap is PARKED: its issue is closed or in the icebox, so nobody is scheduled to close it (operator
   * ruling B15, 2026-10-07, [ADR-W-118](../../../docs/06w-decisions-workspace.md#adr-w-118): *"3-D's core
   * plane parity is parked, not realised"*). It is still a gap — the thin lock still asserts the builder
   * differs, and a healed gap still fails with "move it to the parity rows". What `parked` changes is the
   * claim: a gap that is not parked names OPEN work. {@link rowFaults} holds both directions against
   * {@link GAP_ISSUES}.
   */
  parked?: true;
}

/**
 * The state of every issue that owns a known gap, from `gh issue view <N> --json state,labels`. Tests cannot
 * call GitHub, so this is a SNAPSHOT (2026-10-07, #1861 C4), and {@link rowFaults} reads it: a gap whose
 * issue is `closed` or `icebox` must be `parked`, a parked gap's issue must not be `open`, every gap's issue
 * must be listed here, and every issue listed must still own a gap. When an issue is closed or iceboxed,
 * update its line here and park its gaps in the same commit; a new gap adds its issue here when it is filed.
 *
 * `icebox` is a closed issue carrying the `icebox` label (CLAUDE.md, the label glossary). #1448 closed as
 * completed for the PYRAMID height; the trapezoid and triangle height rows it is cited on still differ in
 * 3-D, so they are parked with it until someone files the 3-D plane-height port.
 */
export const GAP_ISSUES: Readonly<Record<GapIssue, 'open' | 'closed' | 'icebox'>> = {
  '#1171': 'open',
  '#1257': 'open',
  '#1448': 'closed',
  '#1531': 'open',
  '#1677': 'icebox',
  '#1679': 'icebox',
  '#1680': 'open',
  '#1726': 'icebox',
  '#1784': 'open',
  '#1796': 'open',
  '#1799': 'open',
  '#1802': 'open',
  '#1842': 'open',
  '#1858': 'open',
  '#1888': 'open',
  '#1905': 'open',
  '#1903': 'open',
  '#1961': 'open',
  '#1839': 'open', // #2018 (ADR-AG-298): analytic does not read a bare role with typed letters until 2-D's reading is ruled
  '#1969': 'open',
  '#2013': 'open',
  '#2047': 'open',
  '#2092': 'open', // #2097 (ADR-719): 3-D does not read a bar-spelled length set to a letter («|AB| = k»)
  '#2260': 'open', // #2199 (ADR-AG-282): 3-D does not read a point stated on a list of lines
  '#2072': 'open', // #2064 (ADR-643): analytic refuses a two-vertex height 2-D answers «כבר קיים» — the cross-tool question
  '#2110': 'open', // #2101/#2100 (ADR-648/649): analytic does not read a radius letter's value or a radius ratio
  '#2041': 'open', // #2041 (ADR-664): analytic reads a symbol on an arc as degrees — its half of the ruling waits for #2013 // #2037 (ADR-663): analytic does not put a fresh arc's endpoints on its circle — the cross-tool question

  '#2131': 'open', // #2090 (ADR-665): analytic does not read the incremental trapezoid mid-segment or «… מקביל לבסיסים»

  '#2074': 'open', // #2074 (ADR-659): analytic's half of «תיכון ליתר» on an open right triangle waits for #2018 // #2066 (ADR-643): analytic does not read «AB חוצה זווית» on a side

  '#2130': 'open', // #2125 (ADR-3D-342): analytic refuses an unnamed circumcircle stated after the incircle

  '#2060': 'open', // #2024 (ADR-668): 3-D does not read a single-letter angle given a symbol («זוית B=b», «זוית B=α»)

  '#2140': 'open',
  '#2218': 'open', // #2197 (ADR-736): analytic does not read a chord / diameter of one circle tangent to another in its relative and diameter forms
  '#2190': 'open', // #2198 / #2216 (ADR-677), #2149 (ADR-671) and #2217 (ADR-691): analytic does not read one «ברדיוס N» for a circle pair, nor the named two-circle sentences (centre segment, equal radii, touch point), nor a fresh equal-radii pair
  '#2236': 'open', // #2205 (ADR-685): analytic does not read a definite unnamed shape noun with a predicate

  '#2223': 'open', // #2219 (ADR-744): analytic and 3-D do not read a relation stated to a list of objects («AF מאונך ל-BC ול-DE»)
  '#2244': 'open', // #2242 (ADR-690): analytic reads no circle area or circumference, so «מעגל O · שטח המעגל הוא 9π» is not-handled

  '#2067': 'open', // #2065 (ADR-700): analytic and 3-D read no similarity ratio, «ביחס p ל-q» included

  '#2302': 'open', // #2210 (ADR-704): analytic's containment is strict, so «…מוכל…» then a tangency of the pair is refused unsatisfiable

  '#2560': 'open', // #2545 (ADR-768 / ADR-AG-335): 2-D refuses a relation-named circle the figure lacks; analytic hands it to the model (R124) — creating it is the open question
  '#2204': 'open', // #2191 (ADR-720): analytic records a second alias on the same angle; 2-D refuses it

  '#2253': 'open', // #2165 (ADR-681): analytic and 3-D read no value line for a length letter; 3-D refuses «AB = 2a»

  '#2323': 'open', // #2215 (ADR-723): analytic does not read «AB קוטר במעגל O ו-CD מיתר במעגל O» (not-handled)

  '#2342': 'open', // #2096 (ADR-730) × #2088 (ADR-3D-370): 3-D teaches a trailing length given, not a trailing angle given («ו-∠ABC = 30»)
  '#2327': 'open', // #2177 (ADR-733): analytic does not read the reserved r on a several-circle figure; 2-D refuses it naming the circles

  '#2356': 'open', // #2234 (ADR-737): 3-D sends «ישר זווית ב-X» / "right-angled at X" (definite, bare, English) to the LLM lane
  '#2357': 'open', // #2234 (ADR-737): analytic sends the same spellings to the model

  '#2417': 'open', // #2395 (ADR-AG-311): 2-D does not read a stated distinctness («P ≠ Q», «המעגלים N1 ו-N2 שונים»)

  '#2415': 'open', // #2391 (ADR-AG-315): 2-D does not read «M מקיימת …», the centres' distance by role, or the distributed named circle pair
  '#2420': 'open', // #2391 (ADR-AG-315): 3-D does not read «M מקיימת …» or an underscore index «N_2»
  '#2421': 'open', // #2388 (ADR-AG-307): 2-D does not read «R = 2r», «r:R = 1:2» or the unnamed ratio of two radii
  '#2376': 'open', // #2362 (ADR-748): analytic answers the tool's circumcircle letter to the student's «מעגל O» (refuses the arc third-crossing)
  '#2449': 'open', // #2398 (ADR-747): analytic refuses a circle centre's second letter (unknown-reference O); 2-D asks (names the holder, or «מעגל O לא הוגדר»)
  '#2448': 'open', // #2405 (ADR-751): analytic does not read «כל המשיקים המשותפים» on externally tangent circles (not-handled)
  '#2442': 'open', // #2405 (ADR-751): «כל המשיקים המשותפים» on a pair whose position was never stated: 2-D asks (interim), analytic does not read it; the permanent answer awaits the operator
  '#2509': 'open', // #2257 (ADR-767): analytic reads no unnamed polygon-in-polygon inscription («הריבוע חסום במשולש EFG»); 2-D moves the drawn square
  '#2451': 'open', // #2355 (ADR-753): 3-D refuses «ריבוע ABCD חסום במעגל» over a ring already inscribed (already-defined); 2-D builds the square
  '#2460': 'open', // #2464 / #2470 (ADR-760): analytic does not read «המעגל החיצוני/הפנימי» as a reference (not-handled)
  '#2506': 'open', // #2443 (ADR-764): analytic draws three loose points with «AB = BC · AC ⊥ BC» green
  '#2216': 'open', // #2552 (ADR-AG-336): 2-D does not read the pair with one radius for both, «שני מעגלים שרדיוס כל אחד מהם 5» (its item 2)
  '#2069': 'open', // #2069 (ADR-3D-369): analytic's polygon declaration does not read the triangle sign «△ABC» (its parser is in PR #2299)
};

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
   *
   * `not-handled` is a verdict too (#1701, ADR-AG-238): where 2-D's deterministic lane DECLINES a sentence and hands
   * it to the model, a builder that reads it deterministically into something else («∠CAB = A1» as a parameter A·1)
   * has given a different verdict — the row asserts every expected builder declines as 2-D does.
   */
  expect: Verdict;
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

/**
 * Faults in the rows themselves — run by the meta-lock, so a malformed row cannot pass quietly. `issues` is
 * the issue-state snapshot the gaps are held against ({@link GAP_ISSUES}); a test passes its own.
 */
export function rowFaults(
  rows: readonly ParityRow[] = PARITY_ROWS,
  issues: Readonly<Record<string, 'open' | 'closed' | 'icebox'>> = GAP_ISSUES,
): string[] {
  const faults: string[] = [];
  const ids = new Set<string>();
  const owning = new Set<string>();
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
      if (!/^#\d+$/.test(g.issue)) {
        faults.push(`[${row.id}] the known gap in ${g.product} names no filed issue («${g.issue}») — file it first`);
        continue;
      }
      // #1861 C4 (ADR-W-118 B15): a gap names OPEN work, or says it is parked.
      owning.add(g.issue);
      const state = issues[g.issue];
      if (!state) faults.push(`[${row.id}] the known gap in ${g.product} names ${g.issue}, which GAP_ISSUES does not list — record its state from \`gh issue view\``);
      else if (state !== 'open' && !g.parked) faults.push(`[${row.id}] the known gap in ${g.product} names ${g.issue}, which is ${state} — mark the gap \`parked: true\`, or name the open issue that owns it`);
      else if (state === 'open' && g.parked) faults.push(`[${row.id}] the known gap in ${g.product} is parked, but ${g.issue} is open — an open issue is scheduled work, not a parked gap`);
    }
    if (!PRODUCTS.some((p) => roleOf(row, p) === 'expected')) faults.push(`[${row.id}] is expected in no builder — it checks only refusals`);
    for (const p of Object.keys(row.contextFor ?? {}) as Product[]) {
      if (roleOf(row, p) === 'free') faults.push(`[${row.id}] carries a context for ${p}, which the row does not check`);
    }
  }
  // The snapshot cannot rot quietly either: an issue that owns no gap any more is deleted from it.
  for (const issue of Object.keys(issues)) {
    if (!owning.has(issue)) faults.push(`GAP_ISSUES lists ${issue}, which owns no known gap — remove it`);
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
  { id: 'cat-2d-009', family: 'polygons', steps: ['ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-010', family: 'polygons', steps: ['דלתון ABCD'], expect: 'builds' },
  { id: 'cat-2d-011', family: 'polygons', steps: ['משולש שווה שוקיים ABC'], expect: 'builds' },
  { id: 'cat-2d-012', family: 'lengths', steps: ['ABC משולש שווה שוקיים (AB=AC)'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1888' }], note: '3-D does not read the parenthetical (it drew «(AB=BC)» with apex A too), so ADR-3D-316 refuses it — "refuse it too" (#1888); reading it in 3-D is found work' },
  { id: 'cat-2d-013', family: 'polygons', steps: ['ריבוע ABCD שצלעו הוא 1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-014', family: 'polygons', steps: ['ריבוע שצלעו 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-015', family: 'lengths', steps: ['מלבן במידות 4*6'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-016', family: 'polygons', steps: ['משולש שווה צלעות ABC'], expect: 'builds' },
  { id: 'cat-2d-017', family: 'polygons', steps: ['טרפז שווה שוקיים ABCD'], expect: 'builds' },
  { id: 'cat-2d-018', family: 'angles', steps: ['טרפז ישר-זווית ABCD'], expect: 'builds' },
  { id: 'cat-2d-019', family: 'polygons', steps: ['מחומש משוכלל ABCDE'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-020', family: 'inscribed', steps: ['מעוין BDEF חסום במשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-021', family: 'inscribed', steps: ['מלבן DEFG חסום במשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-022', family: 'inscribed', steps: ['ריבוע DEFG חסום במשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-023', family: 'points-incidence', steps: ['נקודה A'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-024', family: 'midpoint-ratio', steps: ['נקודה E על AC ב-40%'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-025', family: 'points-incidence', steps: ['נקודות F, G, H על AB, AC, CB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-026', family: 'lengths', steps: ['משולש ABC', 'C במרחק 5 מ-A ו-5 מ-B'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-027', family: 'lengths', steps: ['משולש ABC', 'D על AB במרחק 3 מ-A'], expect: 'builds', note: '3-D reads AD = 3 since #1730 and builds it since #1735 (the off-host rider is re-seated, the triangle grows)' },
  { id: 'cat-2d-028', family: 'intersections', steps: ['מרובע ABCD', 'M חיתוך AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-029', family: 'cevians-centres', steps: ['מרובע ABCD', 'G מפגש האלכסונים במרובע ABCD'], expect: 'builds' },
  { id: 'cat-2d-030', family: 'cevians-centres', steps: ['משולש ABC', 'M מפגש התיכונים במשולש ABC'], expect: 'builds' },
  { id: 'cat-2d-031', family: 'cevians-centres', steps: ['O מפגש חוצי הזוויות במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-032', family: 'cevians-centres', steps: ['H מפגש הגבהים במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-033', family: 'cevians-centres', steps: ['P מפגש האנכים האמצעיים במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-034', family: 'midpoint-ratio', steps: ['משולש ABC', 'M אמצע AB'], expect: 'builds' },
  { id: 'cat-2d-035', family: 'points-incidence', steps: ['נקודה F על המשך AD'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-036', family: 'polygons', steps: ['הנקודה E נמצאת בתוך המשולש KAO'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-037', family: 'points-incidence', steps: ['C ו-D בצדדים שונים של AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-038', family: 'points-incidence', steps: ['משולש ABC', 'קטע AC'], expect: 'builds' },
  { id: 'cat-2d-039', family: 'points-incidence', steps: ['קו ועליו נקודה A'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-040', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'BC מקביל ל-AD'], expect: 'builds' },
  { id: 'cat-2d-041', family: 'cevians-centres', steps: ['CD חוצה את AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-042', family: 'cevians-centres', steps: ['מרובע ABCD', 'F רגל האנך מ-C ל-AD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-043', family: 'cevians-centres', steps: ['משולש ABC', 'E חיתוך חוצי הזוויות BAC ו-BCA'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-044', family: 'cevians-centres', steps: ['משולש ABC', 'חוצה זווית ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-045', family: 'parallel-perpendicular', steps: ['משולש ABC', 'נקודה P', 'ישר דרך P מאונך ל-AB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-046', family: 'parallel-perpendicular', steps: ['משולש ABC', 'נקודה P', 'ישר דרך P מקביל ל-AB'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-047', family: 'points-incidence', steps: ['משולש ABC', 'E על הישר AC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-048', family: 'points-incidence', steps: ['משולש ABC', 'ישר ABE'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-049', family: 'cevians-centres', steps: ['תיכון מ-A במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-050', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון לצלע BC'], expect: 'builds' },
  { id: 'cat-2d-051', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'תיכון ליתר'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2074' }, { product: '3d', issue: '#1679', parked: true }], note: '#2074 (ADR-659, reversing ADR-639): drawn on the shown triangle, the right-angle vertex a free choice «הציגו תצורה אחרת» cycles; analytic still asks until its half lands (waits on #2018)' },
  { id: 'hypotenuse-altitude-open-2074', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'גובה ליתר'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2074' }, { product: '3d', issue: '#1679', parked: true }], note: '#2074 (ADR-659): the altitude spelling' },
  { id: 'hypotenuse-apex-pins-2074', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'CM תיכון ליתר'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2074' }, { product: '3d', issue: '#1679', parked: true }], note: '#2074 (ADR-659), ruling 2026-10-14: a typed apex forces the seat' },
  { id: 'hypotenuse-two-open-2074', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'משולש ישר-זווית DEF', 'תיכון ליתר'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2074 (ADR-659): two right triangles, no single host' },
  { id: 'hypotenuse-median-stated', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'זווית C ישרה', 'תיכון ליתר'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'hypotenuse-median-named', family: 'cevians-centres', steps: ['משולש ישר-זווית ABC', 'תיכון ליתר AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'right-triangle-perp-reseats-2082', family: 'angles', steps: ['משולש ישר-זווית ABC', 'AB ⟂ BC'], expect: 'builds', note: '#2082 (ADR-658): a right angle stated as ⟂ pins the seat as «זווית B ישרה» does' },
  { id: 'right-triangle-height-reseats-2082', family: 'angles', steps: ['משולש ישר-זווית ABC', 'AB גובה'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2072' }, { product: '3d', issue: '#1679', parked: true }], note: '#2082 (ADR-658): the height lowers to the ⟂ at B' },
  { id: 'right-triangle-perp-first-2082', family: 'angles', steps: ['משולש ABC', 'AB ⟂ BC', 'משולש ישר-זווית ABC'], expect: 'builds', note: '#2082 (ADR-658): the other entry order' },
  { id: 'second-right-angle-refused-1936', family: 'angles', steps: ['משולש ישר זווית ABC', 'AB ⊥ BC', 'AC ⊥ BC'], expect: 'refused', note: '#1936 (ADR-658), operator rulings 2026-10-09/10: refused at once naming both statements, as 3-D and analytic already did' },
  { id: 'second-right-angle-plain-1936', family: 'angles', steps: ['משולש ABC', 'זווית B ישרה', 'AC ⊥ BC'], expect: 'refused', note: '#1936 (ADR-658): the same contradiction in another spelling' },
  { id: 'isosceles-base-median-1810', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'תיכון לבסיס'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'ADR-596 / #1810: the base follows the configuration; analytic since #2018 (ADR-AG-298), the foot bound to the role and re-lettered per configuration' },
  { id: 'isosceles-base-altitude-2018', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'גובה לבסיס'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): the altitude to the base, from the drawn apex' },
  { id: 'isosceles-leg-median-2018', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'תיכון לשוק'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): the median to a leg' },
  { id: 'isosceles-leg-altitude-twice-2018', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'גובה לשוק', 'גובה לשוק'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): the second takes the other leg (2-D #805)' },
  { id: 'isosceles-base-median-en-2018', family: 'cevians-centres', steps: ['isosceles triangle ABC', 'the median to the base'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): the English spelling' },
  { id: 'isosceles-base-median-settled-2018', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'AB = AC', 'תיכון לבסיס'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): a stated apex settles it — the lettered twin «תיכון לצלע BC»' },
  { id: 'isosceles-base-median-later-pin-2018', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'תיכון לבסיס', 'AB = BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): a later pin moves the median to AC' },
  { id: 'isosceles-base-median-lettered-2018', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'תיכון לבסיס BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298; 2-D ADR-563): the claim «הבסיס BC» pins the apex, and the median to BC' },
  { id: 'role-cevian-plain-triangle-2018', family: 'cevians-centres', steps: ['משולש ABC', 'תיכון לבסיס'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): a plain triangle has no base (operator ruling 2026-10-13) — 2-D input.roleSideUnresolved' },
  { id: 'role-cevian-equilateral-2018', family: 'cevians-centres', steps: ['משולש שווה צלעות ABC', 'תיכון לבסיס'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): no single base' },
  { id: 'role-cevian-trapezoid-2018', family: 'cevians-centres', steps: ['טרפז ABCD', 'גובה לבסיס'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): 2-D reads the role cevian on a triangle only' },
  { id: 'role-cevian-typed-foot-1839', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'AD תיכון לבסיס'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1839' }, { product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): typed letters with a bare role stay literal in 2-D; whether they pin the apex is #1839, so analytic does not read them yet' },
  { id: 'role-cevian-lettered-leg-1839', family: 'cevians-centres', steps: ['משולש שווה שוקיים ABC', 'גובה לשוק AC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1839' }, { product: '3d', issue: '#1679', parked: true }], note: '#2018 (ADR-AG-298): a lettered leg is literal in 2-D, no pin — #1839' },
  { id: 'hypotenuse-no-right-angle', family: 'cevians-centres', steps: ['משולש ABC', 'תיכון ליתר'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  // #1944 (ADR-3D-321): the dropped-perpendicular imperative on a flat polygon. 2-D commits [foot, segment] onto the
  // side opposite the apex (a trapezoid's parallel base); 3-D did mint the foot ON the apex, green, and now agrees.
  { id: 'perp-to-base-flat-1944', family: 'cevians-centres', steps: ['משולש ABC', 'מ-A מורידים אנך לבסיס'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1961' }] },
  { id: 'perp-to-base-trapezoid-1944', family: 'cevians-centres', steps: ['טרפז ABCD', 'מ-A מורידים אנך לבסיס'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1961' }], note: 'the foot drops on the PARALLEL base (CD in 2-D, DC in 3-D), not on the first side of the ring' },
  { id: 'cat-2d-052', family: 'cevians-centres', steps: ['גובה מ-A במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-053', family: 'cevians-centres', steps: ['משולש ABC', 'אנך אמצעי ל-AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-054', family: 'midpoint-ratio', steps: ['קטע האמצעים לצלע BC במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-055', family: 'midpoint-ratio', steps: ['קטע האמצעים בטרפז ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-056', family: 'cevians-centres', steps: ['משולש ABC', 'AD חוצה את הזווית BAC'], expect: 'builds' },
  { id: 'cat-2d-057', family: 'cevians-centres', steps: ['משולש ABC', 'CE חוצה זווית C במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-058', family: 'intersections', steps: ['CD חותך את AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-059', family: 'angles', steps: ['נסמן זוית BAM כ-A1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-060', family: 'angles', steps: ['נקודה G', 'נקודה B', 'נקודה A', 'זווית GBA = 37'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-061', family: 'angles', steps: ['מרובע ABCD', 'הזווית בין BD ל-BA היא 30'], expect: 'builds' },
  { id: 'cat-2d-062', family: 'angles', steps: ['זווית ABC שווה לשלושים מעלות'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-063', family: 'angles', steps: ['זוית AEB שווה לזווית BEC שווה 60 מעלות'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-064', family: 'angles', steps: ['משולש ABC', 'משולש DEF', 'זווית ABC היא זווית DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-065', family: 'chords-arcs', steps: ['נקודה D', 'נקודה E', 'נקודה C', 'נקודה O', 'קשת DE = 2 קשת CE במעגל O'], expect: 'builds', exception: 'X8', note: 'ADR-663 (#2049): the arc puts its existing endpoints ON circle O — before, the row built with them left off it' },
  { id: 'cat-2d-066', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O', 'קשת AB = 40 במעגל O'], expect: 'builds', exception: 'X8', note: 'ADR-663 (#2049): the arc puts its existing endpoints ON circle O — before, the row built with them left off it' },
  { id: 'cat-2d-067', family: 'chords-arcs', steps: ['נקודה A', 'נקודה C', 'נקודה B', 'נקודה E', 'נקודה D', 'נקודה O', 'קשת AC + קשת BE = קשת AD + קשת BC במעגל O'], expect: 'builds', exception: 'X8', note: 'ADR-663 (#2049): the arc puts its existing endpoints ON circle O — before, the row built with them left off it' },
  { id: 'cat-2d-068', family: 'lengths', steps: ['נקודה D', 'נקודה M', 'נקודה E', 'נקודה B', 'נקודה R', 'DM*ME = BM*DR'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-069', family: 'chords-arcs', steps: ['זוית מרכזית COD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-2d-070', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC הוא 13'], expect: 'builds', note: '3-D healed by #2069 (ADR-3D-369, the area copula); was a parked #1679 gap' },
  { id: 'cat-2d-071', family: 'area-perimeter', steps: ['נקודה A', 'נקודה B', 'נקודה F', 'נקודה E', 'שטח ABF גדול פי 2 משטח BFE'], expect: 'builds', exception: 'X9' },
  { id: 'cat-2d-072', family: 'area-perimeter', steps: ['נסמן את שטח ABCD ב-S'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-073', family: 'area-perimeter', steps: ['משולש ABC', 'היקף המשולש ABC = 20'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-074', family: 'lengths', steps: ['משולש ABC', 'AB = 6'], expect: 'builds' },
  { id: 'cat-2d-075', family: 'lengths', steps: ['מרובע ABCD', 'AB = CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1680' }] },
  { id: 'cat-2d-076', family: 'lengths', steps: ['מרובע ABCD', 'AB = 2 AD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1680' }] },
  { id: 'cat-2d-077', family: 'midpoint-ratio', steps: ['מרובע ABCD', 'AD:DB = 1:2'], expect: 'builds' },
  { id: 'cat-2d-078', family: 'midpoint-ratio', steps: ['מרובע ABCD', 'G מחלקת את DC ביחס 1:2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-079', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מאונך ל-CD'], expect: 'builds' },
  { id: 'cat-2d-080', family: 'lengths', steps: ['△ABC ≅ △DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-081', family: 'lengths', steps: ['△ABC ~ △DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-082', family: 'lengths', steps: ['AD = 12√x'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'analytic refuses x as a length (2026-10-03)' },
  { id: 'cat-2d-083', family: 'angles', steps: ['משולש ABC', 'זווית ABC = 2α'], expect: 'builds' },
  { id: 'cat-2d-084', family: 'angles', steps: ['α < β'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-085', family: 'angles', steps: ['משולש ABC', 'זווית ABC גדולה מ-40'], expect: 'builds' },
  { id: 'cat-2d-086', family: 'angles', steps: ['משולש ABC', '40 < זווית ABC < 60'], expect: 'builds' },
  { id: 'cat-2d-087', family: 'points-incidence', steps: ['5 < AB < 9'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-2d-088', family: 'angles', steps: ['זווית ABC קהה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
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
  { id: 'cat-2d-109', family: 'inscribed', steps: ['במרובע ABCD חסום מעגל O'], expect: 'builds', exception: 'X8' },
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
  { id: 'diameter-cut-end-2056', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O', 'קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E'], expect: 'builds', exception: 'X8', note: 'ADR-663 (#2056): F, a stated end of the diameter, is put on circle O — cat-2d-128 without «F על מעגל O»' },
  { id: 'arc-bare-pi-2032', family: 'chords-arcs', steps: ['גזרה AOB', 'קשת AB = 4π'], expect: 'builds', exception: 'X8', note: 'ADR-664 (#2032): 2-D reads the arc\x27s LENGTH (the twin of «אורך הקשת AB הוא 4π»); analytic builds it as 4π degrees until #2013 — the verdict row cannot see degrees against length, the class test does' },
  { id: 'arc-bare-pi-no-arc-2032', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'קשת AB = 4π'], expect: 'not-handled', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2013' }], note: 'ADR-664 (#2032): no drawn arc — 2-D does not understand it (never the chord); analytic draws a 12.57° arc until #2013' },
  { id: 'arc-symbol-value-2041', family: 'chords-arcs', steps: ['גזרה AOB', 'קשת AB = x'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2041' }], note: 'ADR-664 (#2041): 2-D asks degrees or length with the ruled sentence; analytic\x27s half of the ruling is open' },
  { id: 'arc-fresh-2037-01', family: 'chords-arcs', steps: ['קשת AB = 40 במעגל O'], expect: 'builds', exception: 'X8', note: 'ADR-663 (#2037): 2-D creates circle O and puts A and B on it; analytic does the same since ADR-W-162 (#1467 closed #2129)' },
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
  { id: 'cat-2d-152', family: 'chords-arcs', steps: ['חצי מעגל שקוטרו AB העובר דרך C'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1796' }] }, // #1771 (ADR-589)
  { id: 'e1771-semi-three-vertices', family: 'chords-arcs', steps: ['משולש ABC', 'זווית ACB = 90', 'חצי מעגל ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1796' }] }, // #1771: all three ON it, the figure picks AB
  { id: 'e1771-on-the-semicircle', family: 'chords-arcs', steps: ['חצי מעגל שקוטרו AB', 'C על חצי המעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1796' }] }, // #1771: reads like «C על המעגל»
  { id: 'cat-an-001', family: 'points-incidence', steps: ['נקודה M'], expect: 'builds', exception: 'X9' },
  { id: 'cat-an-002', family: 'points-incidence', steps: ['הישר AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-an-003', family: 'points-incidence', steps: ['נקודה P', 'דרך P עובר ישר'], expect: 'builds', exception: 'X9', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'cat-an-004', family: 'circles', steps: ['מרובע ABCD', 'מעגל ABD'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'cat-an-005', family: 'circles', steps: ['מרובע ABCD', 'המעגל העובר דרך הנקודות A, B ו-D'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-006', family: 'inscribed', steps: ['המעגל החוסם את המשולש ABD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-007', family: 'chords-arcs', steps: ['מרובע ABCD', 'BD קוטר במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-008', family: 'inscribed', steps: ['מעגל O', 'D על מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על המעגל החוסם את המשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-009', family: 'circles', steps: ['A על המעגל שמרכזו M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-010', family: 'chords-arcs', steps: ['מרובע ABCD', 'נתון מעגל שקוטרו BD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-011', family: 'inscribed', steps: ['מרובע ABCD חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-012', family: 'inscribed', steps: ['המשולש ABC חסום במעגל שמרכזו M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-013', family: 'inscribed', steps: ['במעגל חסום משולש חד זוויות ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'cat-an-015', family: 'inscribed', steps: ['מעגל חסום במרובע ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-016', family: 'circles', steps: ['נתון מעגל O שרדיוסו 5'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-017', family: 'area-perimeter', steps: ['משולש ABC', 'היקף המשולש ABC הוא 12'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-an-018', family: 'tangents', steps: ['נתון מעגל K', 'מעגל M משיק למעגל K'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-019', family: 'tangents', steps: ['נתון מעגל K', 'נתון מעגל M', 'המעגלים משיקים מבחוץ'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-020', family: 'tangents', steps: ['מעגל O ומעגל M משיקים מבחוץ'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-021', family: 'tangents', steps: ['נתון מעגל K', 'מעגל M משיק למעגל K בנקודה T'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-022', family: 'tangents', steps: ['מעגל O', 'הישר BC משיק למעגל בנקודה B'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-023', family: 'tangents', steps: ['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-024', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל בנקודה A'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-025', family: 'tangents', steps: ['נקודה P', 'דרך P עובר משיק למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-026', family: 'chords-arcs', steps: ['מעגל O', 'AB מיתר במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-028', family: 'lengths', steps: ['טרפז ABCD', 'אורך השוק BC הוא 6'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-an-029', family: 'circles', steps: ['מעגל O', 'הנקודה B נמצאת מחוץ למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-030', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O', 'הנקודה E נמצאת על הקשת הקטנה AC'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-031', family: 'circles', steps: ['משולש ABC', 'מעגל O', 'אורך הקטע AB שווה לרדיוס המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-032', family: 'circles', steps: ['מעגל O', 'C על מעגל O', 'D על מעגל O', 'CD עובר דרך מרכז המעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'cat-an-033', family: 'points-incidence', steps: ['הקטע AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-an-034', family: 'lengths', steps: ['משולש ABC', 'אורך הקטע AB = 10'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-an-035', family: 'lengths', steps: ['משולש ABC', 'המרחק בין A ל-B = 10'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-an-036', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מקביל ל-DC'], expect: 'builds' },
  { id: 'cat-an-037', family: 'points-incidence', steps: ['משולש ABC', 'הצלע AB מאונכת לצלע BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
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
  { id: 'cat-an-051', family: 'angles', steps: ['משולש ABC', '∠ABC = 2∠ACB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-an-052', family: 'angles', steps: ['משולש ABC', 'זווית C = 60'], expect: 'builds' },
  { id: 'cat-an-053', family: 'angles', steps: ['משולש ABC', '∠B = ∠C'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cat-an-054', family: 'circles', steps: ['נתון מעגל שמרכזו M', 'A על מעגל M'], expect: 'builds', exception: 'X8' },
  { id: 'cat-an-055', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון במשולש ABC'], expect: 'builds' },
  { id: 'cat-an-056', family: 'cevians-centres', steps: ['משולש ABC', 'AD גובה לצלע BC'], expect: 'builds' },
  { id: 'cat-an-057', family: 'cevians-centres', steps: ['טרפז ABCD', 'M מפגש האלכסונים'], expect: 'builds' },
  { id: 'cat-an-058', family: 'angles', steps: ['משולש ABC', '∢C = 90°'], expect: 'builds', note: '3-D’s park closed with #1912’s glyph fold (ADR-3D-329)' },
  { id: 'cat-an-059', family: 'angles', steps: ['המרובע ABCO הוא טרפז ישר זווית'], expect: 'builds' },
  { id: 'cat-an-060', family: 'polygons', steps: ['במלבן ABCD, הנקודה E נמצאת על הצלע DC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  // #1620 S2 (ADR-AG-207): the perpendicular from a point, its foot, the line through a point cutting a side.
  { id: 'an-1620-perp-01', family: 'cevians-centres', steps: ['משולש ABC', 'האנך מ-C ל-AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'an-1620-perp-02', family: 'cevians-centres', steps: ['משולש ABC', 'האנך מהקודקוד C לצלע AB חותך אותה בנקודה D'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'an-1620-perp-03', family: 'cevians-centres', steps: ['משולש ABC', 'האנך מ-A ל-BC', 'E על האנך'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'an-1620-perp-04', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'דרך E עובר ישר מקביל ל-AC החותך את הצלע AB בנקודה F'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'an-1620-perp-05', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'הישר העובר דרך הנקודה E מקביל ל-AC וחותך את הצלע AB בנקודה F'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'an-1620-perp-06', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'הקטע EF מקביל ל-AC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'an-1620-perp-06b', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'EF ∥ AC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }], note: 'a bare pair mints its new end (#1670 row 4, ADR-AG-210)' },
  { id: 'an-1620-perp-06c', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'הצלע EF מקבילה ל-AC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'an-1620-perp-06d', family: 'parallel-perpendicular', steps: ['משולש ABC', 'E על BC', 'הישר EF מקביל ל-AC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'an-1620-perp-07', family: 'tangents', steps: ['מעגל O', 'A על המעגל', 'המשיק למעגל בנקודה A', 'משולש BCE', 'האנך מ-B ל-CE', 'המשיק והאנך נחתכים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },

  // ── #1620 S7 (ADR-AG-213): the two tangents meet — 01–06 agree with 2-D; 08–13 are analytic-ahead (2-D owes them, #1677) ──
  { id: 'an-1620-tan-01', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'המשיקים נפגשים בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'an-1620-tan-02', family: 'tangents', steps: ['מעגל O', 'המשיק בנקודה A והמשיק בנקודה C נפגשים בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'an-1620-tan-04', family: 'tangents', steps: ['מעגל O', 'AC קוטר במעגל O', 'המשיק בנקודה A והמשיק בנקודה C למעגל O נפגשים בנקודה D'], expect: 'refused', exception: 'X8', note: 'antipodal touch points: the tangents are parallel' },
  { id: 'an-1620-tan-05', family: 'tangents', steps: ['מעגל O', 'AC קוטר במעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'המשיקים נפגשים בנקודה D'], expect: 'refused', exception: 'X8' },
  { id: 'an-1620-tan-06', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'המשיקים נחתכים בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'an-1620-tan-08', family: 'tangents', steps: ['המשיקים למעגל O בנקודות A ו-C נפגשים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'an-1620-tan-09', family: 'tangents', steps: ['מעגל O', 'המשיקים בנקודות A ו-C נחתכים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'an-1620-tan-11', family: 'tangents', steps: ['מעגל O', 'המשיק בנקודה A והמשיק בנקודה C למעגל O נחתכים בנקודה D'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }], note: '2-D reads «נפגשים» here but not «נחתכים»' },
  { id: 'an-1620-tan-12', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיקים נפגשים בנקודה D'], expect: 'asks', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }], note: 'one tangent drawn: which two?' },
  { id: 'an-1620-tan-13', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'D נקודת החיתוך של המשיקים'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'meet-verb-1620', family: 'intersections', steps: ['מרובע ABCD', 'הישר AC והישר BD נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'ADR-AG-213: «נפגשים» is «נחתכים» for two lines' },
  { id: 'cat-3d-001', family: 'midpoint-ratio', steps: ['משולש ABC', 'E על AC כך ש-AE:EC = 2:1'], expect: 'builds' },
  { id: 'cat-3d-002', family: 'lengths', steps: ['משולש ABC', 'AB = 3'], expect: 'builds' },
  { id: 'cat-3d-003', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC = 4.5'], expect: 'builds' },
  { id: 'cat-3d-004', family: 'polygons', steps: ['ABEC מלבן'], expect: 'builds' },
  { id: 'cat-3d-005', family: 'angles', steps: ['משולש ABC', '∠BAC = 90'], expect: 'builds' },
  { id: 'cat-3d-006', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מקביל ל-CD'], expect: 'builds' },
  { id: 'cat-3d-007', family: 'intersections', steps: ['מרובע ABCD', 'AC ו-BD נחתכים'], expect: 'builds' },
  { id: 'cat-3d-008', family: 'lengths', steps: ['מרובע ABCD', 'המרחק בין D לישר AB הוא 5'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'cat-3d-009', family: 'lengths', steps: ['טרפז ABCD', 'המרחק בין AB לבין CD הוא 3'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'cat-3d-010', family: 'angles', steps: ['משולש ABC', 'קוסינוס הזווית ACB = 3/4'], expect: 'builds', note: '2-D draws acos 3/4 ≈ 41.41° since #1698 (ADR-566)' },
  { id: 'trig-sine-choice-1711', family: 'angles', steps: ['משולש ABC', 'סינוס הזווית ACB = 3/4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1726', parked: true }], note: 'a sine fits θ and 180° − θ — a configuration choice «הציגו תצורה אחרת» cycles (#1711, operator ruling 2026-10-03)' },
  { id: 'trig-sine-out-of-range-1711', family: 'angles', steps: ['משולש ABC', 'סינוס הזווית ACB = 5/4'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1726', parked: true }], note: 'no angle has a sine above 1 (#1711)' },
  // #1712 (ADR-587) — an angle measures between 0° and 180°, a length is never negative: refused by name
  { id: 'angle-negative-1712', family: 'angles', steps: ['משולש ABC', '∢ABC = -2'], expect: 'refused', note: '3-D’s park closed with #1912’s glyph fold (ADR-3D-329): ∢ reads as ∠, and ∠ABC = -2 was already refused' },
  { id: 'angle-negative-he-1712', family: 'angles', steps: ['משולש ABC', 'זווית ABC = -30'], expect: 'refused' },
  { id: 'angle-reflex-1712', family: 'angles', steps: ['משולש ABC', '∢ABC = 200'], expect: 'refused', note: '3-D’s park closed with #1912’s glyph fold (ADR-3D-329)' },
  { id: 'angle-bound-out-of-range-1712', family: 'angles', steps: ['משולש ABC', 'זווית ABC גדולה מ-200'], expect: 'refused' },
  { id: 'length-negative-1712', family: 'lengths', steps: ['משולש ABC', 'AB = -3'], expect: 'refused' },
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
  // #1815 (ADR-3D-309, 2-D ADR-413) — a rider's incidence that holds only on a FLAT triangle is refused, not drawn flat
  { id: 'rider-midpoint-collapse-1815', family: 'midpoint-ratio', steps: ['משולש ABC', 'M על AB', 'M אמצע BC'], expect: 'refused', note: 'M on AB and the midpoint of BC only when ABC is flat' },
  { id: 'rider-midpoint-collapse-mirror-1815', family: 'midpoint-ratio', steps: ['משולש ABC', 'D על AB', 'D אמצע AC'], expect: 'refused' },
  // #1847 (ADR-3D-361) — the same conflict in the other order: the membership is stated about an EXISTING midpoint
  { id: 'midpoint-rider-collapse-1847', family: 'midpoint-ratio', steps: ['משולש ABC', 'M אמצע BC', 'M על AB'], expect: 'refused', note: 'the reverse order of rider-midpoint-collapse-1815' },
  // #1849 (operator ruling 2026-10-07, ADR-W-115; 3-D ADR-3D-310) — a DECLARED polygon the givens force flat is
  // refused on the line that completes the collapse, in every builder: "a flat line is not a triangle". The 2-D
  // gap is this issue's own 2-D stream (today 2-D builds it flat with ADR-W-048's notice); it closes there.
  { id: 'flat-polygon-1849-538', family: 'lengths', steps: ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8'], expect: 'refused', note: '5 + 3 = 8: only a flat triangle' },
  { id: 'flat-polygon-1849-538-rev', family: 'lengths', steps: ['משולש ABC', 'AC = 8', 'BC = 3', 'AB = 5'], expect: 'refused' },
  { id: 'flat-polygon-1849-448', family: 'lengths', steps: ['משולש ABC', 'AB = 4', 'BC = 4', 'AC = 8'], expect: 'refused' },
  { id: 'flat-polygon-1849-coincide', family: 'polygons', steps: ['מרובע ABCD', 'AB מתלכד עם CD'], expect: 'refused', exception: 'X7', note: 'two sides of one quadrilateral on one line (T31); «מתלכד» is 3-D vocabulary (X7)' },
  { id: 'flat-polygon-1849-thin-control', family: 'lengths', steps: ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.9'], expect: 'builds', note: 'thin but a real triangle — the control' },
  // #2292 / #2344 (ADR-W-146; 3-D ADR-3D-372) — givens that hold only in the LIMIT where a declared polygon collapses
  // (the tangent root: |BA| = |BC| with a right angle at C forces C = A) are refused like any forced collapse, never
  // drawn as a sliver. 3-D reads «AB = BC» as a vector question, so its context spells the lengths «|BA| = |BC|».
  { id: 'impossible-right-isosceles-2292-perp', family: 'parallel-perpendicular', steps: ['משולש ABC', 'AB = BC', 'AC ⊥ BC'], contextFor: { '3d': ['משולש ABC', '|BA| = |BC|'] }, expect: 'refused', note: 'a right angle at C makes BC a leg and AB the hypotenuse, so AB = BC only if C = A' },
  { id: 'impossible-right-isosceles-2292-angle', family: 'angles', steps: ['משולש ABC', 'AB = BC', '∠ACB = 90'], contextFor: { '3d': ['משולש ABC', '|BA| = |BC|'] }, expect: 'refused' },
  { id: 'impossible-right-isosceles-2292-other-leg', family: 'parallel-perpendicular', steps: ['משולש ABC', 'AB = BC', 'AB ⊥ AC'], contextFor: { '3d': ['משולש ABC', '|BA| = |BC|'] }, expect: 'refused' },
  { id: 'thin-right-triangle-2292-control', family: 'parallel-perpendicular', steps: ['משולש ABC', 'AB = 2', 'BC = 1', 'AC ⊥ BC'], expect: 'builds', note: 'a real right triangle — the control' },
  // #2443 (ADR-764) / #2503 (ADR-3D-378): the same impossible givens with NO declared triangle — two vertices of a quadrilateral, or loose points, would meet
  { id: 'impossible-isosceles-quad-2443-perp', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB = BC', 'AC ⊥ BC'], contextFor: { '3d': ['מרובע ABCD', '|AB| = |BC|'] }, expect: 'refused', note: 'AB = BC holds only where C meets A; D keeps the quadrilateral wide, so no ring is flat' },
  { id: 'impossible-isosceles-quad-2443-angle', family: 'angles', steps: ['מרובע ABCD', 'AB = BC', '∠ACB = 90'], contextFor: { '3d': ['מרובע ABCD', '|AB| = |BC|'] }, expect: 'refused' },
  { id: 'impossible-isosceles-loose-2443', family: 'parallel-perpendicular', steps: ['נקודה A', 'נקודה B', 'נקודה C', 'AB = BC', 'AC ⊥ BC'], expect: 'refused', exception: 'X9', knownGap: [{ product: 'analytic', issue: '#2506' }], note: 'three loose points: no polygon at all' },
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
  { id: 'letter-bound-1658', family: 'lengths', steps: ['משולש ABC', '0 < k < 6'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },

  // ── 3-D's plane sentences on a solid's letters: 2-D and analytic type the letters free, 3-D types its pyramid ──
  { id: 'pyr-equal-lengths', family: 'lengths', steps: ['מרובע ABCD', 'נקודה S', 'אורך AS שווה לאורך AB'], contextFor: { '3d': ['פירמידה SABCD שבסיסה ריבוע'] }, expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
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
  // #1907 (ADR-3D-315): the bare altitude onto a foot already on the opposite side — 2-D drops it there (3-D refused the triangle as flat)
  { id: 'cevian-named-foot-on-side', family: 'cevians-centres', steps: ['משולש ABC', 'D על BC', 'AD גובה'], expect: 'builds' },
  /*
   * #1945 (ADR-AG-253) — the two rows #1907's stream parked for want of an analytic issue: a HEIGHT's host is
   * any ring with a side opposite the apex, not a triangle alone. 2-D drops it onto the trapezoid's parallel
   * base (DC) and onto the parallelogram's first opposite side (BC); analytic refused both as
   * `cevian-no-triangle` until this issue, and 3-D reads them through ADR-3D-315's flat-polygon reader.
   */
  { id: 'cevian-height-trapezoid', family: 'cevians-centres', steps: ['טרפז ABCD', 'AE גובה'], expect: 'builds' },
  { id: 'cevian-height-parallelogram', family: 'cevians-centres', steps: ['מקבילית ABCD', 'AE גובה'], expect: 'builds' },
  // #1966/#2090 (ADR-665): a placed foot outranks the assumed base; a trapezoid's bases are its own pair (the #1965 verdict never changed — builds — so it has no row; where the foot lands is its scenario)
  { id: 'cevian-height-placed-foot-1966', family: 'cevians-centres', steps: ['טרפז ABCD', 'E על BC', 'AE גובה'], expect: 'builds', note: 'E stays on BC, never on C' },
  { id: 'trapezoid-midsegment-foreign-parallel-2090', family: 'cevians-centres', steps: ['טרפז ABCD', 'AC מקביל ל-KL', 'EF קטע אמצעים'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2131' }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'trapezoid-bases-foreign-parallel-2090', family: 'cevians-centres', steps: ['טרפז ABCD', 'AC מקביל ל-KL', 'EL מקביל לבסיסים'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2131' }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-to-side', family: 'cevians-centres', steps: ['משולש ABC', 'תיכון לצלע BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-plural-respectively', family: 'cevians-centres', steps: ['משולש OBC', 'OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '471 corpus 7/4, as S1 teaches its imperative' },
  { id: 'cevian-plural-respectively-medians', family: 'cevians-centres', steps: ['משולש ABC', 'AD ו-BE הם תיכונים לצלעות BC ו-AC בהתאמה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the medians twin (#1685, ADR-629)' },
  { id: 'bisector-copula', family: 'cevians-centres', steps: ['משולש CMD', 'AM הוא חוצה זווית CMD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '471 corpus 22/5; 2-D reads it since #1685/#1999 (ADR-666)' },
  // #1999/#1685 (ADR-666, ADR-AG-278): a named cevian, either letter first, with or without the copula, Hebrew and English
  { id: 'cevian-vertex-last-median', family: 'cevians-centres', steps: ['משולש CMD', 'AM תיכון לצלע CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-vertex-last-height', family: 'cevians-centres', steps: ['משולש CMD', 'AM גובה לצלע CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-vertex-last-bisector', family: 'cevians-centres', steps: ['משולש CMD', 'AM חוצה זווית CMD'], expect: 'builds' },
  { id: 'cevian-copula-median', family: 'cevians-centres', steps: ['משולש CMD', 'AM הוא תיכון לצלע CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-copula-height', family: 'cevians-centres', steps: ['משולש CMD', 'AM היא גובה לצלע CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-vertex-last-triangle-median', family: 'cevians-centres', steps: ['משולש CMD', 'AM תיכון במשולש CMD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-vertex-last-triangle-bisector', family: 'cevians-centres', steps: ['משולש CMD', 'AM חוצה זווית CMD במשולש CMD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-vertex-last-existing', family: 'cevians-centres', steps: ['משולש CMD', 'A על CD', 'AM תיכון לצלע CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-english-bisector', family: 'cevians-centres', steps: ['משולש CMD', 'AM is the bisector of angle CMD'], expect: 'builds' },
  { id: 'cevian-english-median', family: 'cevians-centres', steps: ['משולש CMD', 'AM is the median to side CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cevian-english-height', family: 'cevians-centres', steps: ['משולש CMD', 'AM is the height to side CD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'bisector-wrong-vertex', family: 'cevians-centres', steps: ['משולש ABC', 'AD חוצה זווית C'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the honesty invariant: a segment from A cannot bisect ∠C (2-D refuses since #1684, ADR-568)' },
  { id: 'bisector-wrong-vertex-en', family: 'cevians-centres', steps: ['משולש ABC', 'AD bisects angle C'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the English twin (#1684)' },
  { id: 'cevian-apex-two-triangles', family: 'cevians-centres', steps: ['משולש ABC', 'משולש ABD', 'AE גובה'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'ADR-052: A is in two triangles with different opposite sides (2-D asks since #1684, ADR-568)' },
  { id: 'cevian-apex-two-triangles-side', family: 'cevians-centres', steps: ['משולש ABC', 'משולש ABD', 'AE גובה לצלע BD'], expect: 'builds', note: 'naming the side answers the #1684 question' },
  { id: 'bisector-foot', family: 'cevians-centres', steps: ['משולש AOC', 'D על AC כך ש-OD חוצה-זווית AOC'], expect: 'builds' },
  // the circle rows of 3-D's own catalog are plain rows (X8 excepts every other circle sentence in 3-D)
  { id: 'circle3d-incircle', family: 'inscribed', steps: ['מעגל חסום במשולש ABC'], expect: 'builds' },
  { id: 'circle3d-touch', family: 'tangents', steps: ['משולש ABC', 'מעגל A משיק לישר BC בנקודה F'], expect: 'builds' },
  { id: 'circle3d-circum', family: 'inscribed', steps: ['משולש ABC חסום במעגל'], expect: 'builds' },
  // #1792 (ADR-3D-307): a quad inscribed in a circle — 3-D draws its cyclic member (a trapezoid is made isosceles)
  { id: 'circle3d-circum-trapezoid-1792', family: 'inscribed', steps: ['טרפז ABCD חסום במעגל'], expect: 'builds' },
  // #1914 / #1993 (ADR-656): a second noun the ring can carry refines it — 2-D built neither before
  { id: 'inscribed-then-noun-1914', family: 'inscribed', steps: ['ABCD חסום במעגל', 'מקבילית ABCD'], expect: 'builds' },
  { id: 'sibling-nouns-1993', family: 'polygons', steps: ['מלבן ABCD', 'מעוין ABCD'], expect: 'builds' },
  { id: 'circle3d-centre-circum', family: 'inscribed', steps: ['משולש ABC חסום במעגל', 'K מרכז המעגל החוסם את המשולש ABC'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1531' }] },
  { id: 'circle-centre-incircle', family: 'inscribed', steps: ['במשולש ABC חסום מעגל', 'K מרכז המעגל החסום במשולש ABC'], expect: 'builds', exception: 'X8' },
  { id: 'circle-numeral-on', family: 'circles', steps: ['נתון מעגל I', 'P על המעגל I'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1257' }] },

  // ── known gaps the audit seeded (B2), re-measured ──
  { id: 'frame-paren', family: 'frame', steps: ['המרובע ABCD הוא טרפז (AB ∥ CD)'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1888' }], note: '3-D does not read the parenthetical («(AD ∥ BC)» drew AB ∥ CD), so ADR-3D-316 refuses it (#1888)' },
  { id: 'frame-dash', family: 'frame', steps: ['מעגל O', 'O – מרכז המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'frame-noun-after', family: 'frame', steps: ['המרובע ABCD מלבן'], expect: 'builds' },
  { id: 'frame-figure', family: 'frame', steps: ['בסרטוט שלפניך מתואר משולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'frame-predicate-copula', family: 'frame', steps: ['המרובע ABCD הוא מלבן'], expect: 'builds', note: 'the copula twin of frame-noun-after (#1676, ADR-630)' },
  { id: 'frame-dash-hyphen', family: 'frame', steps: ['מעגל O', 'O - מרכז המעגל'], expect: 'builds', exception: 'X8', note: 'the ASCII hyphen twin of frame-dash (#1676)' },
  { id: 'frame-figure-feminine', family: 'frame', steps: ['בסרטוט שלפניכם מתוארת מקבילית ABCD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the feminine participle and plural address (#1676)' },
  { id: 'acute', family: 'polygons', steps: ['משולש חד זוויות ABC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'acute-circ', family: 'inscribed', steps: ['משולש חד-זוויות ABC חסום במעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'circ-diam', family: 'inscribed', steps: ['משולש ABC חסום במעגל שקוטרו AC'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'touch-list', family: 'tangents', steps: ['משולש ABC', 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'], expect: 'builds', exception: 'X8' },
  { id: 'touch-list-first', family: 'tangents', steps: ['הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'], expect: 'builds', exception: 'X8' },
  { id: 'passes', family: 'points-incidence', steps: ['משולש ABC', 'נקודה P', 'AC עובר דרך P'], expect: 'builds', exception: 'X9', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'mid-compound', family: 'midpoint-ratio', steps: ['משולש ABC', 'הנקודה D היא אמצע הצלע AB, והנקודה E היא אמצע הצלע BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D builds both midpoints since #1795 (ADR-597): the whole-line rule dropped the existing C, so the clause split reads the compound' },
  { id: 'dist-line', family: 'lengths', steps: ['משולש ABD', 'המרחק בין D לישר AB הוא 5'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }] },
  { id: 'diag-meet', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים AC ו-BD נפגשים בנקודה E'], expect: 'builds' },

  // ── #1620 (ADR-AG-208): extensions, named diagonals, a point on a side with a condition, the midsegment ──
  { id: 'ext-side-1620', family: 'points-incidence', steps: ['מרובע ABCD', 'הנקודה E נמצאת על המשך הצלע BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'ext-bare-1620', family: 'points-incidence', steps: ['משולש ABC', 'F נמצאת על המשך BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'ext-condition-1620', family: 'points-incidence', steps: ['מרובע ABCD', 'E על המשך BC כך ש-DE = DC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'ext-meet-1620', family: 'intersections', steps: ['מרובע ABCD', 'המשכי הצלעות AD ו-BC נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'ext-given-clause-1682', family: 'points-incidence', steps: ['מרובע ABCD', 'הנקודה E נמצאת על המשך הצלע BC ונתון כי DE = DC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#1682 (ADR-570): the clause is a given, read like «כך ש» — 2-D built before too, with DE = DC dropped' },
  { id: 'ext-beyond-1682', family: 'points-incidence', steps: ['מרובע ABCD', 'הנקודה E נמצאת על המשך הצלע BC מעבר לנקודה B'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#1682 (ADR-570): «מעבר לנקודה B» picks the end — 2-D built before too, past C' },
  { id: 'side-given-clause-1682', family: 'points-incidence', steps: ['משולש ABC', 'D על BC ונתון כי AD = AC'], expect: 'builds', note: '#1682 (ADR-570): the on-side twin of ext-given-clause-1682. The verdict alone passed in 3-D while AD = AC was dropped (#1730) — side-given-clause-holds-1730 checks the given is held' },
  { id: 'side-given-clause-holds-1730', family: 'points-incidence', steps: ['משולש ABC', 'AC = 2', 'D על BC ונתון כי AD = AC', 'AD = 1'], expect: 'refused', note: 'the CONTENT check of side-given-clause-1682 (#1730, ADR-3D-296): with AD = AC held, AD = 1 contradicts AC = 2; a builder that dropped the clause builds it (3-D on 4fbb3293 did)' },
  { id: 'ext-meet-each-1620', family: 'intersections', steps: ['מרובע ABCD', 'המשך הצלע AD והמשך הצלע BC נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'ext-circle-1620', family: 'circles', steps: ['מעגל O', 'משולש ABC', 'המשך AC חותך את מעגל O בנקודה E'], expect: 'builds', exception: 'X8' },
  { id: 'side-condition-1620', family: 'points-incidence', steps: ['משולש ABC', 'הנקודה E נמצאת על צלע BC כך ש-AE = AC'], expect: 'builds' },
  { id: 'diag-meet-crossing-1620', family: 'intersections', steps: ['דלתון ABCD', 'E היא נקודת החיתוך של אלכסוני הדלתון'], expect: 'builds' },
  { id: 'meet-noun-1609', family: 'intersections', steps: ['מרובע ABCD', 'M מפגש AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-point-of-1609', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת המפגש של AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-lines-plural-1609', family: 'intersections', steps: ['מרובע ABCD', 'M מפגש הישרים AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-line-with-1609', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת המפגש של הישר AC עם הישר BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'cross-lines-plural-1609', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת החיתוך של הישרים AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'diag-meet-noun-1620', family: 'intersections', steps: ['טרפז ABCD', 'מרובע EFGH', 'אלכסוני הטרפז נפגשים בנקודה M'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the noun selects the trapezoid beside a plain quadrilateral' },
  { id: 'diag-meet-right-trapezoid-1620', family: 'intersections', steps: ['טרפז ישר זווית ABCD', 'אלכסוני הטרפז נפגשים בנקודה M'], expect: 'builds' },
  { id: 'diag-meet-two-trapezoids-1620', family: 'intersections', steps: ['טרפז ABCD', 'טרפז EFGH', 'אלכסוני הטרפז נפגשים בנקודה M'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'diag-meet-generic-two-1620', family: 'intersections', steps: ['טרפז ABCD', 'מרובע EFGH', 'אלכסוני המרובע נפגשים בנקודה M'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'diag-meet-sides-1683', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים AB ו-CD נפגשים בנקודה E'], expect: 'refused', note: 'AB and CD are sides of ABCD, not its diagonals (#1683, ADR-569; analytic ADR-AG-208; 3-D #1728, ADR-3D-297)' },
  { id: 'diag-meet-holds-1728', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים AC ו-BD נפגשים בנקודה E', 'E על BD'], expect: 'builds', note: 'the CONTENT check of diag-meet (#1728, ADR-3D-297): E lies on the SECOND diagonal too. 3-D on 4fbb3293 put E at the midpoint of AC alone, so «E על BD» was refuted' },
  { id: 'diag-meet-no-figure-1620', family: 'intersections', steps: ['האלכסונים AC ו-BD נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'diagonal-decl-1620', family: 'polygons', steps: ['מרובע ABCD', 'האלכסון AC'], expect: 'builds' },
  { id: 'diagonal-in-ring-1620', family: 'polygons', steps: ['מרובע ABCD', 'האלכסון AC במרובע ABCD'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: 'the sentence #1620 S1 teaches «העבירו את האלכסון AC במרובע ABCD» onto; 2-D does not read the ring tail' },
  { id: 'symbol-length', family: 'lengths', steps: ['משולש ABC', 'AB = 3x'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'ported to analytic 2026-10-02, withdrawn for x/y 2026-10-03: analytic refuses it with the teaching message' },
  { id: 'symbol-length-square', family: 'lengths', steps: ['משולש ABC', 'AB = x²'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },

  // ── #1622 E2 (ADR-AG-218): the sentences slice E makes readable in analytic, each at 2-D's measured verdict ──
  { id: 'congruent-he-1622', family: 'lengths', steps: ['משולש ABC חופף למשולש DEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'X11, ported by ruling 2 (2026-10-02)' },
  { id: 'similar-plural-he-1622', family: 'angles', steps: ['המשולשים ABC ו-DEF דומים'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'X12' },
  { id: 'congruent-proof-target-1622', family: 'lengths', steps: ['הוכיחו ש-△ABC ≅ △DEF'], expect: 'refused', note: 'a PROOF TARGET is never a given (#1666) — the boundary ≅ as a given must not cross' },
  { id: 'segment-product-1622', family: 'lengths', steps: ['משולש ABC', 'D על BC', 'AB·AC = AD²'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'X13' },
  { id: 'symbol-length-chain-1622', family: 'lengths', steps: ['משולש ABC', 'AB = AC = 3x'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'a chained equality with a value' },
  { id: 'symbol-length-y-1622', family: 'lengths', steps: ['משולש ABC', 'AB = 2y'], expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'symbol-length-beside-line-1622', family: 'topic', steps: ['משולש ABC', 'AB = 3x', 'y = 2x + 1'], expect: 'builds', exception: 'X2', contextFor: { analytic: ['משולש ABC', 'AB = 3a'] }, note: 'a length never makes the equation\'s x a length; analytic states its length with another letter (an x-length is X10 there since 2026-10-03)' },
  { id: 'symbol-length-letter-1622', family: 'lengths', steps: ['משולש ABC', 'AB = 3a'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'every letter but x and y is a free length in both builders' },
  { id: 'symbol-length-letter-chain-1622', family: 'lengths', steps: ['משולש ABC', 'AB = AC = 3a'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'symbol-length-letter-root-1622', family: 'lengths', steps: ['AD = 12√a'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'vertex-value-1622', family: 'angles', steps: ['משולש ABC', 'A = 40'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'vertex-value-free-1622', family: 'angles', steps: ['נקודה A', 'A = 40'], expect: 'asks', exception: 'X9', note: 'a free point has no arms: 2-D asks which angle' },
  { id: 'vertex-angle-after-altitude-1445', family: 'angles', steps: ['משולש ABC', 'BD גובה', 'זווית B = 30'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1799' }], note: 'B has three edges but is a vertex of ONE triangle: ∠B is ∠ABC, said aloud (operator ruling 2026-09-27, #1445)' },
  { id: 'vertex-angle-ratio-after-bisector-1445', family: 'angles', steps: ['משולש ABC', 'BD חוצה זווית B', 'זווית B = 2 זווית C'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1799' }] },
  { id: 'vertex-angle-two-triangles-1445', family: 'angles', steps: ['משולש ABC', 'D על AC', 'BD', 'משולש ABD', 'זווית B = 30'], expect: 'asks', note: 'two triangles at B (the sub-triangle counts): it still asks, listing the angles (#1445)' },
  { id: 'area-label-1622', family: 'area-perimeter', steps: ['מרובע ABCD', 'נסמן את שטח ABCD ב-S'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  // #1622 E5 (ADR-AG-221): an order between angle aliases, an angle named by a label, and an area label on an empty canvas.
  { id: 'alias-order-bound-1622', family: 'angles', steps: ['α < 30'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: "2-D's measure-bound on the alias, before any angle names it" },
  { id: 'alias-order-window-1622', family: 'angles', steps: ['20 < α < 60'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'alias-order-closed-1622', family: 'angles', steps: ['α ≤ β'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },

  { id: 'alias-order-binds-1622', family: 'angles', steps: ['α < β', 'משולש ABC', '∢ABC = α', '∢BAC = β'], expect: 'builds', contextFor: { '3d': ['משולש ABC', '∢ABC = α'] }, note: 'the order binds when the aliases name angles; 3-D’s #1679 park on the SENTENCE closed with #1912’s ∢ fold (ADR-3D-329), but its context line «α < β» is a measure order 3-D still does not read (#1679) — so 3-D types the context it can' },
  { id: 'angle-label-1622', family: 'angles', steps: ['משולש ABC', 'נקודה M על BC', 'נסמן זוית BAM כ-A1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'angle-label-digit-1622', family: 'angles', steps: ['משולש ABC', 'נסמן זוית CAB כ 1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the bare digit is the vertex letter plus the digit: A1' },
  { id: 'angle-label-equals-1622', family: 'angles', steps: ['משולש ABC', 'נסמן ∠CAB=A1'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'angle-label-greek-1622', family: 'angles', steps: ['משולש ABC', 'נקודה M על BC', 'נסמן זוית BAM כ-α'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'a Greek name is the alias: «∢BAM = α»' },
  { id: 'area-label-triangle-1622', family: 'area-perimeter', steps: ['נסמן את שטח המשולש ABC ב-S'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'area-value-unknown-1622', family: 'area-perimeter', steps: ['שטח ABCD = 20'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'ADR-W-162 (#1467): a line naming a missing point creates it, with the notice; was refused (only the label introduced its region)' },
  { id: 'segments-cross-pair-1622', family: 'intersections', steps: ['הקטעים AB ו-CD נחתכים'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'segment-bisects-named-1622', family: 'cevians-centres', steps: ['CD חוצה את AB בנקודה K'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'distances-free-1622', family: 'lengths', steps: ['נקודה A', 'נקודה B', 'C במרחק 5 מ-A ו-5 מ-B'], expect: 'builds', exception: 'X9' },
  { id: 'chain-length-value-1622', family: 'lengths', steps: ['משולש ABC', 'AB = AC = 5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'angle-sides-disjoint-1622', family: 'angles', steps: ['מרובע ABCD', 'הזווית בין BD ל-CA היא 30'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'sides with no common end form no angle: 2-D refuses' },
  { id: 'chord-cross', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O', 'במעגל המיתרים AC ו-BD נפגשים בנקודה E'], expect: 'builds', exception: 'X8', note: 'ADR-601 / #1678: 2-D reads the crossing of AC and BD (the locative «במעגל» is the scene, not the met circle), and the order of the four points on the circle is a sampled DOF that follows the stated crossing — the configuration search draws AC and BD crossing' },
  // ── #1622 slice E1 (ADR-AG-217): what the shapes-and-points port reads beyond the rows above, 2-D measured ──
  { id: 'e1-bare-run-3', family: 'polygons', steps: ['ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-unnamed-square', family: 'polygons', steps: ['ריבוע'], expect: 'builds' },
  { id: 'e1-unnamed-triangle', family: 'polygons', steps: ['משולש'], expect: 'builds' },
  { id: 'e1-hexagon', family: 'polygons', steps: ['משושה ABCDEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-octagon', family: 'polygons', steps: ['מתומן ABCDEFGH'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-regular-hexagon', family: 'polygons', steps: ['משושה משוכלל ABCDEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-regular-unnamed', family: 'polygons', steps: ['מחומש משוכלל'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-heptagon-bare', family: 'polygons', steps: ['משובע ABCDEFG'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-rectangle-side', family: 'lengths', steps: ['מלבן ABCD שצלעו 4'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-rhombus-side', family: 'lengths', steps: ['מעוין ABCD שצלעו 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-equilateral-side', family: 'lengths', steps: ['משולש שווה צלעות ABC שצלעו 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-rectangle-dims-named', family: 'lengths', steps: ['מלבן ABCD במידות 4*6'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-rectangle-by', family: 'lengths', steps: ['מלבן 4 על 6'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-same-side', family: 'points-incidence', steps: ['משולש ABC', 'C ו-D באותו צד של AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-outside', family: 'polygons', steps: ['משולש ABC', 'הנקודה D נמצאת מחוץ למשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-line-two-points', family: 'points-incidence', steps: ['קו ועליו נקודות A ו-B'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-ordered-four', family: 'points-incidence', steps: ['משולש ABC', 'ישר ABEF'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-at-distance-far-end', family: 'lengths', steps: ['משולש ABC', 'D על AB במרחק 3 מ-B'], expect: 'builds', note: 'as cat-2d-027: 3-D reads BD = 3 since #1730 and builds it since #1735' },
  { id: 'e1-fraction-side', family: 'midpoint-ratio', steps: ['משולש ABC', 'נקודה E על הצלע AC ב-40%'], expect: 'builds', exception: 'X9' },
  { id: 'e1-length-greater', family: 'points-incidence', steps: ['AB > 5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'e1-length-closed', family: 'points-incidence', steps: ['5 ≤ AB ≤ 9'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
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
  { id: 'bare-scaled-length-1670', family: 'lengths', steps: ['נקודה A', 'AB = 2CD'], expect: 'builds', exception: 'X9', note: 'ADR-W-162 (#1467): a line naming a missing point creates it, with the notice; 2-D used to mint no letter for a scaled length' },
  { id: 'bare-ratio-1670', family: 'midpoint-ratio', steps: ['נקודה A', 'AB:BC = 2:3'], expect: 'builds', exception: 'X9', note: 'ADR-W-162 (#1467): a line naming a missing point creates it, with the notice; 2-D used to mint no letter for a ratio alone' },
  { id: 'bare-midpoint-1670', family: 'midpoint-ratio', steps: ['נקודה A', 'M אמצע AB'], expect: 'builds', exception: 'X9' },
  { id: 'bare-divider-1670', family: 'midpoint-ratio', steps: ['נקודה A', 'C מחלקת את AB ביחס 3:2'], expect: 'builds', exception: 'X9' },
  { id: 'bare-angle-1670', family: 'angles', steps: ['נקודה A', 'זווית ABC = 30'], expect: 'builds', exception: 'X9' },
  { id: 'bare-on-segment-1670', family: 'points-incidence', steps: ['נקודה E', 'E על AB'], expect: 'builds', exception: 'X9' },
  { id: 'bare-crossing-1670', family: 'intersections', steps: ['נקודה A', 'AB חותך את CD בנקודה E'], expect: 'builds', exception: 'X9' },
  { id: 'bare-parallel-1670', family: 'parallel-perpendicular', steps: ['נקודה A', 'AB∥CD'], expect: 'builds', exception: 'X9' },
  { id: 'cevian-no-shape-1670', family: 'cevians-centres', steps: ['נקודה A', 'AD גובה לצלע BC'], expect: 'builds', exception: 'X9', note: 'ADR-W-162 (#1467): a line naming a missing point creates it, with the notice; B, C and D are created free (no shape is assumed)' },
  { id: 'cevian-median-triangle-empty-1720', family: 'cevians-centres', steps: ['AD תיכון במשולש ABC'], expect: 'builds', note: '#1720 (ADR-571): the named triangle is introduced, as the altitude form did' },
  { id: 'cevian-bisector-triangle-empty-1720', family: 'cevians-centres', steps: ['AD חוצה זווית במשולש ABC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '#1720 (ADR-571)' },
  { id: 'cevian-altitude-triangle-empty-1720', family: 'cevians-centres', steps: ['AD גובה במשולש ABC'], expect: 'builds', note: '#1720 (ADR-571): the reference the other two now match' },
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
  { id: 'chord-fresh-letter-names-drawn-circle-1694', family: 'circles', steps: ['שני מעגלים נחתכים בנקודות A ו-B', 'AD מיתר במעגל P'], expect: 'builds', exception: 'X8', note: 'P names the drawn circle A rides, never a third circle (#1694); analytic already names circle-pair1-1' },
  { id: 'two-circles-centres-by-order-1693', family: 'circles', steps: ['שני מעגלים נחתכים', 'O מרכז המעגל', 'P מרכז המעגל'], expect: 'builds', exception: 'X8', note: 'the first naming names one circle, the next the other (#1688 ruling)' },
  { id: 'two-circles-nested-1622', family: 'circles', steps: ['שני מעגלים מוכלים'], expect: 'builds', exception: 'X8' },
  { id: 'circle-by-area-1622', family: 'circles', steps: ['מעגל O ששטחו 9π'], expect: 'builds', exception: 'X8' },
  { id: 'circle-by-radius-unnamed-1622', family: 'circles', steps: ['מעגל שרדיוסו 5'], expect: 'builds', exception: 'X8' },
  { id: 'radius-letters-order-1622', family: 'circles', steps: ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'R > r'], expect: 'builds', exception: 'X8' },
  // ── #2521 (ADR-AG-332): a stated radius binds the circle's radius letter — a relation over the letter reads the value ──
  { id: 'radius-letters-order-then-value-2521', family: 'circles', steps: ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'R > r', 'רדיוס מעגל P הוא 9'], expect: 'builds', exception: 'X8', note: 'analytic drew O (3.46) smaller than P (9), green, before ADR-AG-332; the drawing is locked in src-analytic/__tests__/issue-2521-stated-radius-binds-letter.test.ts' },
  { id: 'radius-letters-value-then-order-2521', family: 'circles', steps: ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'רדיוס מעגל P הוא 9', 'R > r'], expect: 'builds', exception: 'X8', note: 'analytic refused «R > r» as naming a point r before ADR-AG-332' },
  { id: 'radius-letter-value-then-ratio-2521', family: 'circles', steps: ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'רדיוס מעגל P הוא 3', 'R = 2r'], expect: 'builds', exception: 'X8', note: 'analytic answered not-handled before ADR-AG-332' },
  { id: 'radius-letter-value-then-bound-2521', family: 'circles', steps: ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'רדיוס מעגל P הוא 9', 'r < 5'], expect: 'refused', exception: 'X8', note: 'analytic built it green (P drawn at 9, «r < 5» narrowing a ghost) before ADR-AG-332' },
  { id: 'common-tangent-internal-1622', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'AB משיק משותף פנימי לשני המעגלים'], expect: 'builds', exception: 'X8' },
  { id: 'centre-of-given-circle-1622', family: 'circles', steps: ['נתון מעגל', 'מרכז המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'radius-of-created-circle-1622', family: 'circles', steps: ['A על המעגל', 'רדיוס המעגל הוא 5'], expect: 'builds', exception: 'X8' },
  { id: 'chord-tangent-other-circle-1622', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'AB מיתר במעגל O ומשיק למעגל P'], expect: 'builds', exception: 'X8', note: '2-D drew a tangent from P to circle O and no AB, green (a builds verdict then too) before ADR-736; the figure is locked in src/app/__tests__/issue-2197-role-pair-two-circles.test.ts' },
  // ── #2197 (ADR-736): a chord / diameter of one circle tangent to another — AB drawn, touching the other circle ──
  { id: 'chord-tangent-relative-2197', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'המיתר AB במעגל O משיק למעגל P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2218' }], note: '2-D drew a tangent from P to circle O before ADR-736; analytic answers not-handled' },
  { id: 'diameter-tangent-other-circle-2197', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'AB קוטר במעגל O ומשיק למעגל P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2218' }], note: '2-D put A on B before ADR-736; analytic answers not-handled' },
  // ── #2407 + #2406 (ADR-740): a common tangent through the circles' touch point is the tangent AT the touch ──
  { id: 'tangent-through-common-point-2406', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'המעגלים משיקים בנקודה T', 'המשיק העובר בנקודה המשותפת לשני המעגלים'], expect: 'builds', exception: 'X8', note: '2-D drew a two-touch tangent through neither touch, green, before ADR-740; analytic reads it since ADR-AG-314 (#2390)' },
  { id: 'common-tangent-through-touch-internal-2407', family: 'tangents', steps: ['מעגל M', 'מעגל N', 'המעגלים משיקים מבפנים בנקודה T', 'T על AB', 'AB משיק משותף למעגלים M ו-N'], expect: 'builds', exception: 'X8', note: '2-D sent it to the AI before ADR-740 (the figure is locked in src/__tests__/issue-2407-common-tangent-at-touch.test.ts); analytic builds it since ADR-AG-312 (#2385 D1 reads the internal pair too)' },
  // ── #2428 (ADR-741): the only common tangent of circles touching from the inside, named by two free points ──
  { id: 'common-tangent-inside-pair-free-ab-2428', family: 'tangents', steps: ['מעגל M', 'מעגל N', 'המעגלים משיקים מבפנים בנקודה T', 'נקודה A', 'נקודה B', 'AB משיק משותף למעגלים M ו-N'], expect: 'builds', exception: 'X8', note: 'analytic builds it via ADR-AG-321 (#2418, the touch tangent of an inside pair); 2-D sent it to the AI before ADR-741, which drew A, B and T crowded at the touch; the figure is locked in src/__tests__/issue-2428-internal-pair-tangent-at-t.test.ts' },
  { id: 'circle-inside-the-circle-1622', family: 'circles', steps: ['מעגל O', 'מעגל מוכל בתוך המעגל'], expect: 'builds', exception: 'X8' },
  { id: 'circle-by-circumference', family: 'circles', steps: ['מעגל O שהיקפו 6π'], expect: 'builds', exception: 'X8' },
  // ── #1621 D2 (ADR-AG-215): an angle named by a Greek letter, the «נסמן» lead-in, the pin, and tan/cos of an angle ──
  { id: 'alias-nasmen-1621', family: 'angles', steps: ['מרובע ABCD', 'נסמן ∢DCB = 2α'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'corpus 471 1/4' },
  { id: 'alias-nasmen-colon-1621', family: 'angles', steps: ['משולש ABD', 'נסמן: זווית ADB = α'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'corpus 471 3/4' },
  { id: 'alias-bare-1621', family: 'angles', steps: ['משולש ABC', '∢ABC = α'], expect: 'builds', note: '3-D’s #1679 park closed with #1912’s ∢ fold (ADR-3D-329)' },
  { id: 'alias-two-angles-1621', family: 'angles', steps: ['משולש ABC', '∢ABC = β', '∢ACB = β'], expect: 'builds', note: '3-D’s #1679 park closed with #1912’s ∢ fold (ADR-3D-329)' },
  { id: 'alias-pin-1621', family: 'angles', steps: ['משולש ABC', '∢ABC = α', 'α = 30'], expect: 'builds', note: '3-D’s #1679 park closed with #1912’s ∢ fold (ADR-3D-329)' },
  { id: 'trig-tan-1621', family: 'angles', steps: ['משולש ABC', 'tan∢ABC = 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'corpus 471 9/4; 2-D builds it as a 2° angle — a wrong figure the verdict cannot see (#1698)' },
  { id: 'trig-tan-paren-1621', family: 'angles', steps: ['משולש ABC', 'tan(∢ABC) = 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D: 2° (#1698)' },
  { id: 'trig-tg-1621', family: 'angles', steps: ['משולש ABC', 'tg∢ABC = 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D: 2° (#1698)' },
  { id: 'trig-tan-he-1621', family: 'angles', steps: ['משולש ABC', 'טנגנס הזווית ABC הוא 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D: 2° (#1698)' },
  { id: 'trig-cos-1621', family: 'angles', steps: ['משולש ABC', 'cos∢ACB = 3/4'], expect: 'builds', note: '2-D: 3° (#1698); 3-D’s #1679 park closed with #1912’s ∢ fold (ADR-3D-329)' },
  // ── #1719 (ADR-AG-227): sin of an angle — a choice between its two angles; |sin| > 1 is refused ──
  { id: 'trig-sin-1719', family: 'angles', steps: ['משולש ABC', 'sin∢ABC = 0.5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D builds it too since #1711 (ADR-573, a two-angle choice); 3-D does not read sin (#1726/#1679)' },
  { id: 'trig-sin-he-1719', family: 'angles', steps: ['משולש ABC', 'סינוס הזווית ABC הוא 0.5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D builds it too since #1711 (ADR-573, a two-angle choice); 3-D does not read sin (#1726/#1679)' },
  { id: 'trig-sin-range-1719', family: 'angles', steps: ['משולש ABC', 'sin∢ABC = 2'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'altitude-is-segment', family: 'cevians-centres', steps: ['משולש ABC', 'גובה המשולש לצלע AB הוא CD'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }], note: "3-D's catalog sentence; 2-D does not read it" },
  // ── an ORDER between measures, a bound, an angle's acuteness (#1621 D3, ADR-AG-216): regions, as 2-D reads them ──
  { id: 'order-length-1621', family: 'lengths', steps: ['משולש ABC', 'AB < BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'order-length-word-1621', family: 'lengths', steps: ['משולש ABC', 'AB קטן מ-BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'order-length-quad-1621', family: 'lengths', steps: ['מרובע ABCD', 'DC > AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'order-length-bare-1621', family: 'lengths', steps: ['AB < BC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'a bare order mints its letters, as its equality twin does (ADR-AG-210)' },
  { id: 'order-length-bound-1621', family: 'lengths', steps: ['משולש ABC', 'AB ≤ 10'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'order-length-at-least-1621', family: 'lengths', steps: ['משולש ABC', 'AB לפחות 3'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'order-angle-bound-1621', family: 'angles', steps: ['משולש ABC', '∢ABC ≤ 40°'], expect: 'builds', note: '3-D’s #1679 park closed with #1912’s ∢ fold (ADR-3D-329)' },
  { id: 'order-angle-window-1621', family: 'angles', steps: ['משולש ABC', '20 < ∢ABC < 60'], expect: 'builds', note: '3-D’s #1679 park closed with #1912’s ∢ fold (ADR-3D-329)' },
  { id: 'order-angle-acute-1621', family: 'angles', steps: ['משולש ABC', 'זווית ABC חדה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'order-angle-angle-1621', family: 'angles', steps: ['משולש ABC', '∢ABC < ∢BAC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: "2-D reads an order between two named VARIABLES (α < β) and between two segments, not between two angles; its equality twin «∢ABC = ∢BAC» builds there" },
  { id: 'order-length-conflict-1621', family: 'lengths', steps: ['משולש ABC', 'AB = 5', 'BC = 7', 'AB > BC'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'a strict order never moves a determined figure: the one it contradicts is refused on the sentence' },
  // ── #1621 D1 (ADR-AG-214): measures as givens — ratios and areas ──
  { id: 'area-ratio-prose-1621', family: 'area-perimeter', steps: ['משולש AOB', 'טרפז ADCB', 'היחס בין שטח המשולש AOB לשטח הטרפז ADCB הוא 4:5'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: 'corpus 6/5; 2-D reads «הוא 4» and its honesty gate escalates the dropped 5' },
  { id: 'area-ratio-notation-1621', family: 'area-perimeter', steps: ['משולש ABC', 'נקודה D על BC', 'S_{ABD} / S_{ADC} = 0.8'], expect: 'builds', exception: 'X9', note: 'corpus 7/4 writes S_BDC / S_ODC' },
  { id: 'area-notation-value-1621', family: 'area-perimeter', steps: ['משולש ABC', 'S_{ABC} = 13'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'area-value-equals-1621', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC שווה ל-45'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: 'corpus 18/4; 2-D splits it at «שטח המשולש» (split-statements)' },
  { id: 'length-ratio-slash-1621', family: 'midpoint-ratio', steps: ['משולש ABC', 'נקודה D על BC', 'BD/DC = 2/3'], expect: 'builds', exception: 'X9', note: 'corpus 16/5 «DO/DE = 2/3», 17/4 «CD/OB = 5/2»' },
  { id: 'area-ratio-impossible-1621', family: 'area-perimeter', steps: ['משולש ABC', 'נקודה D על BC', 'S_{ABD} / S_{ABC} = 2'], expect: 'refused', exception: 'X9', note: 'a part twice its whole: refused naming the statement' },
  { id: 'area-ratio-no-region-1621', family: 'area-perimeter', steps: ['משולש ABC', 'S_{XYZ} / S_{ABC} = 2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'ADR-W-162 (#1467): a line naming a missing point creates it, with the notice; X, Y, Z are created free — was refused by name' },
  // ── #1622 E4 (ADR-AG-220): arcs, sectors, semicircles and the diameter from a point, as 2-D reads them ──
  { id: 'e4-arc-glyph', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'C על מעגל O', '⌢{AC} = 60°'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-contextual', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'קשת AC = 60'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-reflex', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'קשת AB = 200'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-equal-words', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'קשת AB שווה לקשת BC'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-sum-value', family: 'chords-arcs', steps: ['נתון מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O', 'קשת AB + קשת CD = 180'], expect: 'builds', exception: 'X8' },
  { id: 'e4-arc-unknown-end', family: 'chords-arcs', steps: ['מעגל O', 'קשת AB = 40 במעגל O'], expect: 'builds', exception: 'X8', note: 'ADR-663 (#2037 ruling 2026-10-13): 2-D puts the new ends A and B on circle O and builds — it used to refuse «references an unknown point»; analytic does the same since ADR-W-162 (#1467 closed #2129)' },
  { id: 'e4-central-value', family: 'chords-arcs', steps: ['מעגל O', 'זוית מרכזית COD = 80'], expect: 'builds', exception: 'X8' },
  { id: 'e4-sector-free', family: 'chords-arcs', steps: ['גזרה AOB'], expect: 'builds', exception: 'X8' },
  { id: 'e4-sector-reflex', family: 'chords-arcs', steps: ['גזרה AOB בזווית 200'], expect: 'builds', exception: 'X8' },
  // #172 (ADR-632): a sector's area and an arc's length as measures — size, ratio to the circle, letter
  { id: 'sector-area-172', family: 'chords-arcs', steps: ['גזרה AOB', 'שטח הגזרה AOB הוא 12π'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2013' }] },
  { id: 'arc-length-172', family: 'chords-arcs', steps: ['גזרה AOB', 'אורך הקשת AB הוא 4π'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2013' }] },
  { id: 'sector-area-ratio-172', family: 'chords-arcs', steps: ['גזרה AOB', 'שטח הגזרה AOB = ¼ משטח המעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2013' }] },
  { id: 'arc-length-ratio-172', family: 'chords-arcs', steps: ['גזרה AOB', 'אורך הקשת AB הוא רבע מהיקף המעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2013' }] },
  { id: 'sector-area-letter-172', family: 'chords-arcs', steps: ['גזרה AOB', 'נסמן את שטח הגזרה ב-S'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2013' }] },
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
  { id: 'ex-coordinate-point-planar-1954', family: 'topic', steps: ['A(0,0)'], expect: 'builds', exception: 'X1', only: ['analytic'], note: "#1954: the bare spelling the operator typed into 3-D. A PLANAR coordinate is analytic's; since #1954 both 2-D and 3-D answer it with the same «…נעשה בכלי «גאומטריה אנליטית»» pointer before the model — the refusal itself is locked per product (src3d/__tests__/issue-1954-coordinate-point.test.ts), because X1 lists 3-D among the builders that READ coordinates and this row cannot express the arity split" },
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
  { id: 'ex-sphere-fraction-2079', family: 'topic', steps: ['כדור שרדיוסו 1/2'], expect: 'refused', exception: 'X7', note: '#2079 (ADR-3D-340): a fraction size is refused, never drawn as its numerator' },
  { id: 'ex-vector', family: 'topic', steps: ['משולש ABC', 'וקטור AB'], expect: 'builds', exception: 'X7' },
  // ── #1616 rulings of 2026-10-03 (ADR-AG-222) ──
  { id: 'ex-position-above-1706', family: 'topic', steps: ['נקודה A', 'נקודה D', 'D מעל A'], expect: 'builds', exception: 'X1', only: ['analytic'], note: "#1706: y_D > y_A on analytic's fixed axes; 2-D does not read screen orientation" },
  { id: 'ex-crossed-ring-free-elsewhere-1929', family: 'topic', steps: ['משולש EFG', 'טרפז ABCD', 'A(0,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)'], contextFor: { '2d': [] }, expect: 'refused', exception: 'X1', only: ['analytic'], note: "#1929 (ADR-AG-249): the coordinate that completes a pinned crossed ring is refused whatever else in the figure is free — the ring's own freedom decides, never the figure's. 3-D's half is #1923's (same round): only: ['analytic'] until it lands" },
  { id: 'ex-coincident-crossing-free-elsewhere-1938', family: 'topic', steps: ['A(0,0)', 'D(0,4)', 'F(4,2)', 'נקודה E', 'P נקודת החיתוך של הישר AD עם הישר EF', 'E על ציר ה-y'], contextFor: { '2d': [] }, expect: 'refused', exception: 'X1', only: ['analytic'], note: "#1938 (ADR-AG-254): the line that forces a crossing onto a point the figure already has is refused although E can still slide and the figure keeps 1 DOF — the PAIR's own freedom decides, never the figure's. The axis sentence makes the family X1, so only: ['analytic']" },
  { id: 'ex-position-below-1706', family: 'topic', steps: ['נקודה A', 'נקודה D', 'D מתחת ל-A'], expect: 'builds', exception: 'X1', only: ['analytic'] },
  { id: 'ex-position-right-1706', family: 'topic', steps: ['נקודה B', 'נקודה C', 'C מימין ל-B'], expect: 'builds', exception: 'X1', only: ['analytic'], note: '2-D refuses it as input.scope.orientation' },
  { id: 'ex-position-left-1706', family: 'topic', steps: ['נקודה B', 'נקודה C', 'C משמאל ל-B'], expect: 'builds', exception: 'X1', only: ['analytic'] },
  { id: 'ex-position-above-line-2386', family: 'topic', steps: ['נקודה K', 'נקודה L', 'נקודה M', 'M מעל הישר KL'], expect: 'builds', exception: 'X1', only: ['analytic'], note: "#2386 (ADR-AG-310): y_M above the line's y at x_M; 2-D does not read screen orientation" },
  { id: 'ex-position-below-line-2386', family: 'topic', steps: ['נקודה K', 'נקודה L', 'נקודה M', 'M מתחת לישר KL'], expect: 'builds', exception: 'X1', only: ['analytic'] },
  { id: 'ex-position-right-line-2386', family: 'topic', steps: ['נקודה K', 'נקודה L', 'נקודה M', 'M מימין לישר KL'], expect: 'builds', exception: 'X1', only: ['analytic'] },
  { id: 'distinct-points-2395', family: 'points-incidence', steps: ['נקודה P', 'נקודה Q', 'P ≠ Q'], expect: 'builds', exception: 'X9', knownGap: [{ product: '2d', issue: '#2417' }], note: '#2395 (ADR-AG-311): a stated distinctness of two points; 2-D does not read it yet (#2417)' },
  { id: 'distinct-circles-2395', family: 'circles', steps: ['נתון מעגל שמרכזו N1 ורדיוסו 2', 'נתון מעגל שמרכזו N2 ורדיוסו 3', 'המעגלים N1 ו-N2 שונים'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#2417' }], note: '#2395 (ADR-AG-311): two circles stated different; 2-D does not read it yet (#2417)' },
  { id: 'ex-distinct-lines-2395', family: 'topic', steps: ['נתון ישר l1: y=2x+1', 'נתון ישר l2: y=-x', 'הישרים l1 ו-l2 שונים'], contextFor: { '2d': [] }, expect: 'builds', exception: 'X4', only: ['analytic'], note: '#2395 (ADR-AG-311): two named lines stated different' },
  { id: 'ex-position-left-line-2386', family: 'topic', steps: ['נקודה K', 'נקודה L', 'נקודה M', 'M משמאל לישר KL'], expect: 'builds', exception: 'X1', only: ['analytic'] },
  { id: 'ex-position-aside-1706', family: 'topic', steps: ['A ו-D על ציר ה-y (D מעל A), B ו-C על ציר ה-x (C מימין ל-B)'], expect: 'builds', exception: 'X1', only: ['analytic'], note: 'corpus 6/5 line 3: the position words inside the asides' },
  { id: 'ex-median-equation-1662', family: 'topic', steps: ['משולש ABC', 'משוואת התיכון AD היא y=x'], expect: 'builds', exception: 'X2', note: '#1662: the median claim is kept — D is the midpoint of BC' },
  { id: 'ex-altitude-equation-ask-1662', family: 'topic', steps: ['משולש ABC', 'משולש ABE', 'משוואת הגובה AD היא y=x'], expect: 'asks', exception: 'X2', note: '#1662: two triangles have the vertex A and neither side holds D' },
  { id: 'cevian-foot-on-side-1662', family: 'cevians-centres', steps: ['משולש ABC', 'משולש ABE', 'D על BC', 'AD גובה'], expect: 'builds', note: 'the triangle whose opposite side holds D (2-D measured: commits; 3-D since #1907, ADR-3D-315)' },
  { id: 'obtuse-triangle-1708', family: 'polygons', steps: ['משולש קהה זווית ABC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: '#1708: one of the three angles is obtuse — a choice over the vertices' },
  { id: 'obtuse-triangle-hyphen-1708', family: 'polygons', steps: ['משולש קהה-זווית ABC'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'obtuse-triangle-letters-first-1708', family: 'polygons', steps: ['ABC משולש קהה זווית'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  // ── #1715 (ADR-AG-224): ONE meet frame, «<line> ו<line> נפגשים / נחתכים בנקודה E», over every line-object ──
  { id: 'meet-bisectors-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית C וחוצה זוית B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the operator’s spelling (#1715 T4): E is the incentre' },
  { id: 'meet-bisectors-3-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית BCA וחוצה זוית CBA נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-bisectors-cut-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה הזווית B וחוצה הזווית C נחתכים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-bisector-line-2-1715', family: 'intersections', steps: ['משולש ABC', 'D על BC', 'הישר AD וחוצה זוית ABC נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-bisectors-short-cut-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית B וחוצה זוית C נחתכים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: '2-D reads «נפגשים» here but not «נחתכים»' },
  { id: 'meet-at-short-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית B וחוצה זוית C נפגשים ב-E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-bisector-altitude-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית A והגובה מ-B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-altitude-median-1715', family: 'intersections', steps: ['משולש ABC', 'הגובה מ-A והתיכון מ-B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }] },
  { id: 'meet-altitudes-1715', family: 'intersections', steps: ['משולש ABC', 'הגובה מ-A והגובה מ-B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: 'E is the orthocentre' },
  { id: 'meet-medians-1715', family: 'intersections', steps: ['משולש ABC', 'התיכון מ-A והתיכון מ-B נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: 'E is the centroid' },
  { id: 'meet-perp-bisectors-1715', family: 'intersections', steps: ['משולש ABC', 'האנך האמצעי לצלע AB והאנך האמצעי לצלע BC נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: 'E is the circumcentre' },
  { id: 'meet-perpendicular-drawn-1715', family: 'intersections', steps: ['משולש ABC', 'האנך מ-C ל-AB', 'חוצה זוית B והאנך מ-C ל-AB נפגשים בנקודה E'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1677', parked: true }, { product: '3d', issue: '#1679', parked: true }], note: '«האנך מ-C ל-AB» refers to the drawn perpendicular (ADR-AG-207)' },
  { id: 'meet-same-line-twice-1715', family: 'intersections', steps: ['משולש ABC', 'חוצה זוית B וחוצה הזווית B נפגשים בנקודה E'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'one line twice names no point; 2-D refuses it since round #1940' },
  { id: 'meet-parallel-1715', family: 'intersections', steps: ['מלבן ABCD', 'הישר AB והישר CD נפגשים בנקודה E'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  // ── #1607 (ADR-574): a role noun before a length keeps the role AND the length ──
  { id: 'role-length-diagonal-1607', family: 'lengths', steps: ['מקבילית ABCD', 'האלכסון AC = 8'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'role-length-median-1607', family: 'lengths', steps: ['משולש ABC', 'התיכון AM = 5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'role-length-altitude-1607', family: 'lengths', steps: ['משולש ABC', 'הגובה AH הוא 5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'role-length-bound-1607', family: 'lengths', steps: ['משולש ABC', 'התיכון AM גדול מ-5'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'a bound, never |AM| = 5 (#1248)' },
  // ── #1742 (ADR-642): a median named by a side is refused as its long form «AB תיכון לצלע BC» is ──
  { id: 'median-on-a-side-1742', family: 'lengths', steps: ['משולש ABC', 'התיכון AB = 5'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D: the long form’s `input.cevianMedianFootAtEnd`; analytic: its own `degenerate-role`' },
  // ── #1443 (ADR-575): a height stated as a magnitude with no segment named — the trapezoid builds, the others ask ──
  { id: 'height-trapezoid-1443', family: 'lengths', steps: ['טרפז ABCD', 'גובה הטרפז 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1448', parked: true }], note: 'the reported sentence; the height is minted and drawn between the bases' },
  { id: 'height-trapezoid-copula-1443', family: 'lengths', steps: ['טרפז ABCD', 'גובה הטרפז הוא 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1448', parked: true }] },
  { id: 'height-trapezoid-introduced-1443', family: 'lengths', steps: ['גובה הטרפז ABCD הוא 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1448', parked: true }], note: 'the trapezoid named by its letters on an empty canvas is introduced (the #1720 precedent)' },
  { id: 'height-triangle-asks-1443', family: 'lengths', steps: ['משולש ABC', 'גובה המשולש 4'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1448', parked: true }], note: 'three heights — which one is the student’s to say (ADR-052)' },
  { id: 'height-parallelogram-asks-1443', family: 'lengths', steps: ['מקבילית ABCD', 'גובה המקבילית הוא 4'], expect: 'asks', knownGap: [{ product: '3d', issue: '#1448', parked: true }] },
  // ── #1749 (ADR-AG-235): the meet VERB reads the distributive plural through the crossing's reader ──
  { id: 'meet-verb-lines-plural-1749', family: 'intersections', steps: ['מרובע ABCD', 'הישרים AC ו-BD נפגשים בנקודה M'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'control — analytic built it before through a second plural reader (`withLineNoun`); now through `distributedLines`' },
  // ── #1751 (ADR-592 · ADR-AG-241): the grammatical SUBJECT decides what a crossing draws — the verb its lines, the noun the point only ──
  { id: 'meet-verb-letters-1751', family: 'intersections', steps: ['מרובע ABCD', 'AC ו-BD נפגשים בנקודה M'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'verb: the lines are the subject — AC, BD and M drawn in both (per-builder locks: issue-1751-meet-draws-segments)' },
  { id: 'meet-verb-letters-spaced-1751', family: 'intersections', steps: ['מרובע ABCD', 'AC ו- BD נפגשים בנקודה M'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the operator’s exact line (T3)' },
  { id: 'meet-verb-letters-cuts-1751', family: 'intersections', steps: ['מרובע ABCD', 'AC חותך את BD בנקודה M'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'verb (cut): AC and BD drawn' },
  { id: 'meet-verb-diagonals-1751', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים נפגשים בנקודה M'], expect: 'builds', note: 'verb, role: the ring’s diagonals drawn (follow-up ruling)' },
  { id: 'meet-noun-letters-1751', family: 'intersections', steps: ['מרובע ABCD', 'M מפגש AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'noun: the point is the subject — M only, in both' },
  { id: 'meet-noun-letters-chitukh-1751', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת החיתוך של AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'noun: M only' },
  { id: 'meet-noun-letters-mifgash-1751', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת המפגש של AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'noun: M only' },
  { id: 'meet-noun-letters-hi-1751', family: 'intersections', steps: ['מרובע ABCD', 'M היא נקודת החיתוך של AC ו-BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'noun: M only' },
  { id: 'meet-noun-diagonals-1751', family: 'intersections', steps: ['מרובע ABCD', 'M מפגש האלכסונים'], expect: 'builds', note: 'noun, role: M only' },
  { id: 'meet-noun-diagonals-chitukh-1751', family: 'intersections', steps: ['מרובע ABCD', 'M נקודת החיתוך של האלכסונים'], expect: 'builds', note: 'noun, role: M only' },
  { id: 'height-to-side-1443', family: 'lengths', steps: ['משולש ABC', 'הגובה לצלע BC הוא 4'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1448', parked: true }] },
  // ── #1737 (ADR-AG-265): analytic composes the role and the length too; the diagonal claim and the shape's height, 2-D's verdicts ──
  { id: 'role-length-phrase-median-1737', family: 'lengths', steps: ['משולש ABC', 'התיכון מ-A הוא 5'], knownGap: [{ product: '3d', issue: '#1679', parked: true }], expect: 'builds' },
  { id: 'role-diagonal-side-1737', family: 'lengths', steps: ['מקבילית ABCD', 'האלכסון AB = 8'], knownGap: [{ product: '3d', issue: '#1679', parked: true }], expect: 'refused', note: 'AB is a side of ABCD, not a diagonal (2-D ADR-569)' },
  { id: 'role-diagonal-bare-side-1737', family: 'polygons', steps: ['מקבילית ABCD', 'האלכסון AB'], expect: 'refused', note: 'the same claim with no length' },
  { id: 'height-trapezoid-bound-1737', family: 'lengths', steps: ['טרפז ABCD', 'גובה הטרפז גדול מ-4'], knownGap: [{ product: '3d', issue: '#1448', parked: true }], expect: 'builds', note: 'the height drawn and a bound, never 4' },
  { id: 'height-no-trapezoid-1737', family: 'lengths', steps: ['משולש ABC', 'גובה הטרפז 4'], knownGap: [{ product: '3d', issue: '#1448', parked: true }], expect: 'refused', note: 'there is no trapezoid in the figure' },

  // ── #1430 (ADR-AG-233): tangents FROM a point with a movement verb / unnamed touches, and a polygon side as the subject — 2-D builds each ──
  { id: 'tan-from-1430-01', family: 'tangents', steps: ['מעגל O', 'מנקודה P יוצאים שני משיקים למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'tan-from-1430-02', family: 'tangents', steps: ['מעגל O', 'מנקודה P יוצא משיק למעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'tan-from-1430-03', family: 'tangents', steps: ['מעגל O', 'מנקודה P יוצאים שני משיקים למעגל O, הנוגעים בו בנקודות A ו-B'], expect: 'builds', exception: 'X8' },
  { id: 'tan-side-1430-04', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'הצלע AB משיקה למעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'tan-side-1430-05', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'AB משיק למעגל O'], expect: 'builds', exception: 'X8' },

  // ── #1701 (ADR-AG-238): a point's name is never a measure's VALUE — 2-D declines each (its value variable is lowercase or Greek) ──
  { id: 'point-value-angle-1701', family: 'angles', steps: ['משולש ABC', '∠CAB = A1'], expect: 'not-handled', note: 'the reported line: analytic read A1 as the parameter A times 1' },
  { id: 'point-value-angle-letter-1701', family: 'angles', steps: ['משולש ABC', '∠ABC = A'], expect: 'not-handled', knownGap: [{ product: '3d', issue: '#1784' }] },
  { id: 'point-value-angle-index-1701', family: 'angles', steps: ['משולש ABC', '∠ABC = B2'], expect: 'not-handled' },
  { id: 'point-value-angle-subscript-1701', family: 'angles', steps: ['משולש ABC', '∠ABC = A₁'], expect: 'not-handled', note: 'analytic answered bad-equation about a point name' },
  { id: 'point-value-angle-copula-1701', family: 'angles', steps: ['משולש ABC', 'זווית CAB היא A1'], expect: 'not-handled' },
  { id: 'point-value-vertex-1701', family: 'angles', steps: ['משולש ABC', '∠B = A1'], expect: 'not-handled' },
  { id: 'point-value-alias-1701', family: 'angles', steps: ['משולש ABC', '∢ABC = α', 'α = A1'], contextFor: { '3d': ['משולש ABC'] }, expect: 'not-handled', note: '3-D reads no angle alias (#1679), so its context is the triangle alone' },
  { id: 'point-value-angle-order-1701', family: 'angles', steps: ['משולש ABC', '∢ABC < A'], expect: 'not-handled' },
  { id: 'point-value-length-1701', family: 'lengths', steps: ['משולש ABC', 'AB = A1'], expect: 'not-handled' },
  { id: 'point-value-length-coef-1701', family: 'lengths', steps: ['משולש ABC', 'AB = 2A'], expect: 'not-handled' },
  { id: 'point-value-length-sum-1701', family: 'lengths', steps: ['משולש ABC', 'AB = AC + D'], expect: 'not-handled', exception: 'X11', note: 'a capital left over after the pairs were read; D is no point of the figure, so analytic refuses it as a capital size (#2427, ADR-AG-325)' },
  { id: 'point-value-length-order-1701', family: 'lengths', steps: ['משולש ABC', 'AB < C'], expect: 'not-handled' },
  { id: 'radius-value-length-1701', family: 'lengths', steps: ['משולש ABC', 'AB = 1.6R'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'control — the radius R is the one capital a length value admits (2-D ADR-034)' },
  { id: 'area-label-capital-1701', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC = S'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'control — an area label is a capital in 2-D (parseAreaExpr)' },
  // ── #1785 (ADR-AG-244): an indexed name («S1», «a1», «α1») is one name, never letter × index — every builder declines it ──
  { id: 'indexed-length-1785', family: 'lengths', steps: ['משולש ABC', 'AB = a1'], expect: 'not-handled', note: 'analytic read a·1; «AC = a2» then forced AC = 2·AB' },
  { id: 'indexed-area-1785', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC = S1'], expect: 'not-handled', note: '2-D cut it at the `=` (split-statements, a misfire over the decline) until #1814' },
  { id: 'indexed-area-point-1785', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC = A1'], expect: 'not-handled', note: 'the reported line: analytic recorded a parameter A' },
  { id: 'indexed-angle-1785', family: 'angles', steps: ['משולש ABC', '∠ABC = α1'], expect: 'not-handled', note: '2-D dropped the α and drew a 1° angle until #1814' },
  // ── #1814 (ADR-600): the index of a GREEK name is not a value either, in any spelling or relation ──
  { id: 'indexed-angle-greek-sub-1814', family: 'angles', steps: ['משולש ABC', '∠ABC = α_1'], expect: 'not-handled', note: '2-D read the LaTeX subscript as 1° (its subscript fold was Latin-only)' },
  { id: 'angle-cmp-indexed-1814', family: 'angles', steps: ['משולש ABC', '∠ABC > α1'], expect: 'not-handled', note: '2-D committed the inequality as the EQUALITY ∠ABC = 1°' },
  { id: 'area-label-point-letter-1785', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC = B'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'control — a lone point letter is an area label in 2-D (parseAreaExpr), and analytic keeps it' },
  // ── #1691 (ADR-AG-239): the spaced conjunction — «ו- X», «ו -X», «ו - X» read as «ו-X» in every builder (one shared fold) ──
  { id: 'conj-space-tan-1691-01', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'AB ו- BC משיקים למעגל'], expect: 'builds', exception: 'X8', note: 'the prod sentence (#1691)' },
  { id: 'conj-space-tan-1691-02', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'AB ו -BC משיקים למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'conj-space-tan-1691-03', family: 'tangents', steps: ['משולש ABC', 'מעגל O', 'AB ו - BC משיקים למעגל'], expect: 'builds', exception: 'X8' },
  { id: 'conj-space-tan-1691-04', family: 'tangents', steps: ['משולש ABC', 'מעגל M משיק ל-AB ו- BC'], expect: 'builds', exception: 'X8', note: 'circle-first order — the same target reader' },
  { id: 'conj-space-tan-1691-05', family: 'tangents', steps: ['מעגל O', 'AB ו- AD משיקים למעגל O בנקודות E ו - K'], expect: 'builds', exception: 'X8' },
  { id: 'conj-space-tan-1691-06', family: 'tangents', steps: ['AB משיק משותף למעגלים O ו- P'], expect: 'builds', exception: 'X8' },
  { id: 'conj-space-tan-1691-07', family: 'tangents', steps: ['מעגל O', 'מנקודה P יוצאים שני משיקים למעגל O, הנוגעים בו בנקודות A ו - B'], expect: 'builds', exception: 'X8' },
  { id: 'conj-space-on-1691-08', family: 'points-incidence', steps: ['משולש ABC', 'הנקודות D ו- E על AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '3-D reads no points-on list in either spelling' },
  { id: 'conj-space-on-1691-09', family: 'points-incidence', steps: ['משולש ABC', 'הנקודות D ו -E על AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'conj-space-on-1691-10', family: 'points-incidence', steps: ['משולש ABC', 'D ו - E על AB'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  { id: 'conj-space-perp-1691-11', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'הישרים AB ו - CD מאונכים'], expect: 'builds' },
  { id: 'conj-space-par-1691-12', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'הישרים AB ו - CD מקבילים'], expect: 'builds' },
  { id: 'conj-space-meet-1691-13', family: 'intersections', steps: ['מרובע ABCD', 'האלכסונים AC ו - BD נפגשים בנקודה E'], expect: 'builds' },
  { id: 'conj-space-cut-1691-14', family: 'intersections', steps: ['מרובע ABCD', 'AC ו -BD נחתכים'], expect: 'builds' },

  // ── #1790 (ADR-595): an inscription honours the shape's adjective — the noun decides the shape, the adjective refines it ──
  { id: 'right-trapezoid-unlettered-1790-01', family: 'inscribed', steps: ['טרפז ישר זווית חסום במעגל'], expect: 'refused', exception: 'X8', note: 'operator ruling 2026-10-01 (#1554): refused naming both nouns; 2-D drew a triangle' },
  { id: 'incircle-right-triangle-1790-02', family: 'inscribed', steps: ['מעגל חסום במשולש ישר זווית ABC'], expect: 'builds', exception: 'X8', note: '2-D drew a generic triangle (the adjective dropped)' },
  { id: 'incircle-isosceles-trapezoid-1790-03', family: 'inscribed', steps: ['מעגל חסום בטרפז שווה שוקיים ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'restated-ring-inscribed-1790-04', family: 'inscribed', steps: ['מלבן ABCD', 'ABCD חסום במעגל'], expect: 'builds', exception: 'X8', note: '2-D refused «poly-ABCD is already defined»: a generic restatement is a reference (M1 subsumption)' },

  // ── #1611 (ADR-591): a word fraction / a wish is TAUGHT (refused with the canonical line pre-filled), never sent to the model ──
  { id: 'teach-fraction-wish-1611', family: 'lengths', steps: ['מקבילית ABCD', 'E על BC', 'F על AD', 'אני רוצה ש- BE ו- DF יהיו רבע מהצלע של המקבילית'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#1802' }, { product: '3d', issue: '#1802' }], note: 'teaches «BE = 1/4 BC, DF = 1/4 AD»' },
  { id: 'teach-fraction-command-1611', family: 'lengths', steps: ['מקבילית ABCD', 'E על BC', 'F על AD', 'הפוך את BE ואת DF להיות 3/4 מצלע המקבילית'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#1802' }, { product: '3d', issue: '#1802' }] },
  { id: 'teach-fraction-word-1611', family: 'lengths', steps: ['מקבילית ABCD', 'E על BC', 'BE = רבע BC'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#1802' }, { product: '3d', issue: '#1802' }], note: 'teaches «BE = 1/4 BC»' },
  { id: 'teach-fraction-taught-1611', family: 'lengths', steps: ['מקבילית ABCD', 'E על BC', 'F על AD', 'BE = 1/4 BC, DF = 1/4 AD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1802' }], note: 'the taught line itself' },

  // ── #1554 (ADR-AG-242): the quadrilateral's incircle on a named centre, the circle-subject side list, and the sentence with no letters — 2-D builds each ──
  { id: 'incircle-centre-1554-01', family: 'inscribed', steps: ['מעגל M חסום במרובע ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'incircle-centre-1554-02', family: 'inscribed', steps: ['מעגל O חסום בטרפז ABCD'], expect: 'builds', exception: 'X8' },
  { id: 'incircle-centre-1554-03', family: 'inscribed', steps: ['מעגל חסום במרובע ABCD שמרכזו O'], expect: 'builds', exception: 'X8' },
  { id: 'incircle-centre-1554-04', family: 'inscribed', steps: ['במשולש ABC חסום מעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'side-list-1554-05', family: 'tangents', steps: ['מרובע ABCD', 'מעגל M משיק לצלעות AB, BC, CD ו-DA'], expect: 'builds', exception: 'X8' },
  { id: 'side-list-1554-06', family: 'tangents', steps: ['מרובע ABCD', 'מעגל M משיק לצלעות AB, BC, CD, DA'], expect: 'builds', exception: 'X8' },
  { id: 'side-list-1554-07', family: 'tangents', steps: ['משולש ABC', 'מעגל M משיק לצלעות AB, BC ו-CA'], expect: 'builds', exception: 'X8' },
  { id: 'side-list-1554-08', family: 'tangents', steps: ['מרובע ABCD', 'מעגל M משיק לצלעות AB ו-BC'], expect: 'builds', exception: 'X8', note: 'two sides: a circle on M, not the incircle' },
  { id: 'side-list-1554-09', family: 'tangents', steps: ['מרובע ABCD', 'מעגל O', 'המעגל משיק לצלעות AB, BC, CD ו-DA'], expect: 'builds', exception: 'X8' },
  { id: 'side-list-1554-10', family: 'tangents', steps: ['מרובע ABCD', 'המעגל משיק לצלעות AB, BC, CD ו-DA'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#1677', parked: true }], note: 'no circle yet: analytic states it (ADR-AG-198 ruling b); 2-D does not read the plural with no circle' },
  { id: 'unlettered-1554-11', family: 'inscribed', steps: ['מרובע חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'unlettered-1554-12', family: 'inscribed', steps: ['טרפז חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'unlettered-1554-13', family: 'inscribed', steps: ['משולש חסום במעגל'], expect: 'builds', exception: 'X8' },
  { id: 'unlettered-1554-14', family: 'inscribed', steps: ['מעגל חסום במרובע'], expect: 'builds', exception: 'X8' },
  { id: 'unlettered-1554-15', family: 'inscribed', steps: ['מעגל חסום בדלתון'], expect: 'builds', exception: 'X8' },
  { id: 'right-trapezoid-1554-16', family: 'inscribed', steps: ['טרפז ישר זווית ABCD חסום במעגל'], expect: 'refused', exception: 'X8', note: 'operator ruling 2026-10-01: a cyclic right trapezoid is a rectangle — refused naming both nouns' },
  // #1798 (ADR-598, operator ruling 2026-10-06): a one-line compound is all or nothing — refused whole when a clause is not honoured
  { id: 'compound-all-or-none-1798-01', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB מקביל ל-CD ו-D על BC'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1842' }] },
  { id: 'compound-all-or-none-1798-02', family: 'inscribed', steps: ['משולש ABC', 'מעגל חוסם את המשולש ABC ו-AD מאונך ל-BC'], expect: 'refused' },
  { id: 'compound-all-or-none-1798-03', family: 'intersections', steps: ['ריבוע ABCD', 'F אמצע DO, O - חיתוך של AC ו-BD'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#1842' }, { product: '3d', issue: '#1842' }], note: 'analytic reads both clauses and builds; 2-D refuses per the 2026-10-04 #553 ruling — which one should move is the question #1842 asks' },
  { id: 'compound-all-or-none-1798-04', family: 'lengths', steps: ['מרובע ABCD', 'AB=4, CD=3'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1842' }], note: 'every clause honoured: a compound commits' },
  { id: 'compound-all-or-none-1798-05', family: 'points-incidence', steps: ['ריבוע ABCD, נקודה G על AD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1842' }], note: 'every clause honoured: a compound commits' },
  // #1832 (ADR-AG-246): a domain on x or y is a restriction on the CURVE — analytic refuses it, never a parameter named x
  { id: 'coordinate-restriction-line-1832', family: 'topic', steps: ['y = 2x + 1, x > 0'], expect: 'refused', exception: 'X2', note: 'used to commit the whole line with a parameter named x' },
  { id: 'coordinate-restriction-circle-1832', family: 'topic', steps: ['x^2 + y^2 = 4, y > 0'], expect: 'refused', exception: 'X2' },
  { id: 'coordinate-restriction-param-control-1832', family: 'topic', steps: ['y = ax + 1, a > 0'], expect: 'builds', exception: 'X2', note: 'a genuine parameter keeps its domain' },
  { id: 'letter-bound-x-1832', family: 'lengths', steps: ['משולש ABC', 'AB = 3x', 'x > 2'], contextFor: { analytic: ['y = 2x + 1'] }, expect: 'builds', exception: 'X10', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: "2-D bounds its length letter x; in analytic x is the plane's coordinate, so the bound is refused (#1832)" },
  // #1849 (ADR-W-115, operator ruling 2026-10-07): a DECLARED polygon the givens force flat is REFUSED in every builder — a flat line is not a triangle
  { id: 'flat-triangle-reversed-1849', family: 'lengths', steps: ['משולש ABC', 'AC = 8', 'AB = 5', 'BC = 3'], expect: 'refused' },
  { id: 'flat-triangle-ratio-1849', family: 'lengths', steps: ['משולש ABC', 'AB : BC = 5 : 3', 'AB : AC = 5 : 8'], expect: 'refused', note: 'the ratio form of 5·3·8' },
  { id: 'flat-quadrilateral-lengths-1849', family: 'lengths', steps: ['מרובע ABCD', 'AB = 1', 'BC = 1', 'CD = 1', 'AD = 3'], expect: 'refused' },
  { id: 'thin-triangle-control-1849', family: 'lengths', steps: ['משולש ABC', 'זווית BAC = 3'], expect: 'builds', note: 'a thin triangle is still a triangle (ADR-413’s control)' },
  // end #1849
  // #1849 (ADR-W-115, operator ruling 2026-10-07): givens that force a DECLARED polygon flat are refused in every builder,
  // naming the statements — a flat figure is not a triangle. Analytic column (ADR-AG-247); the 2-D and 3-D streams close their gaps.
  { id: 'flat-polygon-1849-04', family: 'polygons', steps: ['מרובע ABCD', 'AB = 5', 'BC = 3', 'AC = 8'], expect: 'refused', knownGap: [{ product: '2d', issue: '#1858' }, { product: '3d', issue: '#1858' }], note: 'B on the diagonal AC: the quadrilateral has a straight corner' },
  { id: 'flat-polygon-1849-05', family: 'topic', steps: ['משולש ABC', 'A(0,0)', 'B(1,1)', 'C(2,2)'], contextFor: { '2d': ['משולש ABC'] }, expect: 'refused', exception: 'X1', only: ['analytic'], note: 'coordinates that put the vertices on one line — never drawn flat; 2-D refuses the coordinate itself (X1)' },
  // #1888 / #1889 (ADR-603, ADR-W-120, operator rulings 2026-10-08): a line that loses a PART is refused whole, in every builder.
  // 2-D lands first; 3-D (ADR-3D-316) and analytic (ADR-AG-251) close their gaps in the same round.
  { id: 'unread-vertex-1888-01', family: 'angles', steps: ['משולש ABC ישר זווית ב-B'], expect: 'refused', note: '2-D, 3-D and analytic teach «משולש ABC» then «∠ABC = 90°»' },
  { id: 'unread-vertex-1888-02', family: 'angles', steps: ['משולש ABC ישר זווית ב-C'], expect: 'refused', note: 'any vertex — even C, where the default angle already sits' },
  // #1947 (ADR-AG-301, operator ruling 2026-10-10 «port it to 3-D and analytic»): the same line with a further given is taught
  // with the further given continuing the numbered list «(3) AB = 4». 3-D since #2088 (ADR-3D-370).
  { id: 'unread-vertex-1947-01', family: 'angles', steps: ['משולש ABC ישר זווית ב-B ו-AB = 4'], expect: 'refused', note: 'every builder: (1) משולש ABC (2) ∠ABC = 90° (3) AB = 4' },
  { id: 'unread-tail-1889-01', family: 'intersections', steps: ['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E על AB'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },
  // #1904 (ADR-604, operator rulings 2026-10-08): a second ROLE the reading drops refuses the line, teaching one line per role
  { id: 'role-clause-1904-01', family: 'cevians-centres', steps: ['משולש ABC', 'AD גובה לצלע BC שהוא גם תיכון'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#1905' }, { product: '3d', issue: '#1905' }], note: 'analytic and 3-D hand it to the model; reading the relative clause is #1905' },
  { id: 'role-clause-1904-02', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון לצלע BC שהוא גם גובה'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#1905' }], note: '3-D refuses it with the parts (ADR-3D-317); analytic hands it to the model' },
  { id: 'unread-tail-1889-02', family: 'intersections', steps: ['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E שהיא אמצע BD'], expect: 'builds', knownGap: [{ product: '2d', issue: '#1905' }, { product: '3d', issue: '#1679', parked: true }], note: 'analytic reads both parts (E is the midpoint); 2-D reads no relative clause, so it refuses the line whole — reading it is #1905' },
  // #1891 (ADR-606, ADR-3D-311; operator rulings 2026-10-08): a circle inscribed in a pentagon is refused as a known tool
  // limit (W19) until #1908 draws it. 3-D circle geometry is X8 (its own lock); analytic still asks its model (#1903).
  { id: 'pentagon-incircle-1891', family: 'circles', steps: ['מעגל חסום במחומש ABCDE'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1903' }] },
  // #1918 (ADR-607 / ADR-3D-313 / ADR-AG-252, operator ruling 2026-10-08 "Refuse in both"): a declared trapezoid keeps its
  // identity. A circle through a declared right trapezoid is refused in either order (3-D locks its refusal in
  // issue-1918-trapezoid-identity.test.ts — X8 leaves circles out of 3-D's plain rows); a trapezoid forced into a
  // parallelogram builds with the amber warning; a stated other pair re-seats the trapezoid's pair; a trapezoid and a
  // parallelogram-family shape are refused (analytic since #1926, ADR-AG-260).
  { id: 'trapezoid-1918-inscribed', family: 'inscribed', steps: ['טרפז ישר זווית ABCD', 'ABCD חסום במעגל'], expect: 'refused', exception: 'X8', note: 'a circle through a right trapezoid makes it a rectangle' },
  { id: 'trapezoid-1918-inscribed-rev', family: 'inscribed', steps: ['ABCD חסום במעגל', 'טרפז ישר זווית ABCD'], expect: 'refused', exception: 'X8', note: 'the reverse order: the noun line is refused' },
  { id: 'trapezoid-1918-morph', family: 'polygons', steps: ['טרפז שווה שוקיים ABCD', 'זווית DAB = 90'], expect: 'builds', note: 'builds, with the amber «no longer a trapezoid» warning' },
  { id: 'trapezoid-1918-reseat', family: 'parallel-perpendicular', steps: ['טרפז ABCD', 'AD ∥ BC'], expect: 'builds', note: 'AD and BC become the parallel pair' },
  { id: 'trapezoid-1918-redeclare', family: 'polygons', steps: ['מקבילית ABCD', 'טרפז ABCD'], expect: 'refused', note: 'no quadrilateral is both' },
  { id: 'trapezoid-1918-redeclare-rev', family: 'polygons', steps: ['טרפז ABCD', 'מקבילית ABCD'], expect: 'refused' },
  // end #1918
  // ── #1988 + #1985 (ADR-619, ADR-3D-326; operator rulings 2026-10-10): a SECOND shape noun over the same ring is
  // judged by the quadrilateral hierarchy, in both directions. A noun the declared one IMPLIES is a true restatement
  // and adds nothing («זה כבר קיים באיור», analytic's «כבר ידוע», 3-D's restatement note); a noun that EXCLUDES it is refused
  // with the ruled sentence («הצורה כבר ידועה כ־… — ולכן אינה נקראת …»), which the two #1918 rows above already carry for
  // «מקבילית»/«טרפז». Both directions are one table, so both are locked here.
  { id: 'implied-noun-1988-01', family: 'polygons', steps: ['ריבוע ABCD', 'מלבן ABCD'], expect: 'builds', note: 'every square IS a rectangle — a restatement, no row' },
  { id: 'implied-noun-1988-02', family: 'polygons', steps: ['ריבוע ABCD', 'מעוין ABCD'], expect: 'builds' },
  { id: 'implied-noun-1988-03', family: 'polygons', steps: ['ריבוע ABCD', 'מקבילית ABCD'], expect: 'builds' },
  { id: 'implied-noun-1988-04', family: 'polygons', steps: ['ריבוע ABCD', 'דלתון ABCD'], expect: 'builds', note: 'a square is a kite too' },
  { id: 'implied-noun-1988-05', family: 'polygons', steps: ['מלבן ABCD', 'מקבילית ABCD'], expect: 'builds' },
  { id: 'implied-noun-1988-06', family: 'polygons', steps: ['מעוין ABCD', 'מקבילית ABCD'], expect: 'builds' },
  { id: 'implied-noun-1988-07', family: 'polygons', steps: ['ריבוע ABCD', 'מלבן BCDA'], expect: 'builds', note: 'any reading of the same ring (ADR-618)' },
  { id: 'excluded-noun-1985-01', family: 'polygons', steps: ['ריבוע ABCD', 'טרפז ABCD'], expect: 'refused', note: 'no quadrilateral is both' },
  { id: 'excluded-noun-1985-02', family: 'polygons', steps: ['מקבילית ABCD', 'טרפז שווה שוקיים ABCD'], expect: 'refused' },
  { id: 'excluded-noun-1985-03', family: 'polygons', steps: ['טרפז ABCD', 'ריבוע ABCD'], expect: 'refused' },
  // #2169 / #2171 (ADR-W-131): one relation, read off the shared lattice, in every builder
  { id: 'excluded-noun-kite-trapezoid-2169-01', family: 'polygons', steps: ['דלתון ABCD', 'טרפז ABCD'], expect: 'refused', note: 'a kite with a parallel pair is a rhombus — analytic drew it green before #2169' },
  { id: 'excluded-noun-kite-trapezoid-2169-02', family: 'polygons', steps: ['דלתון ABCD', 'טרפז שווה שוקיים ABCD'], expect: 'refused' },
  { id: 'excluded-noun-kite-trapezoid-2169-03', family: 'polygons', steps: ['דלתון ABCD', 'טרפז ישר זווית ABCD'], expect: 'refused', note: 'analytic drew a green square before #2169' },
  { id: 'excluded-noun-kite-trapezoid-2169-04', family: 'polygons', steps: ['טרפז ABCD', 'דלתון ABCD'], expect: 'refused' },
  { id: 'excluded-noun-kite-trapezoid-2169-05', family: 'polygons', steps: ['טרפז שווה שוקיים ABCD', 'דלתון ABCD'], expect: 'refused' },
  { id: 'excluded-noun-kite-trapezoid-2169-06', family: 'polygons', steps: ['טרפז ישר זווית ABCD', 'דלתון ABCD'], expect: 'refused' },
  { id: 'excluded-noun-iso-right-2169-01', family: 'polygons', steps: ['טרפז שווה שוקיים ABCD', 'טרפז ישר זווית ABCD'], expect: 'refused', note: 'the 2026-10-16 ruling: refused in every builder, 2-D included (all three drew a rectangle before)' },
  { id: 'excluded-noun-iso-right-2169-02', family: 'polygons', steps: ['טרפז ישר זווית ABCD', 'טרפז שווה שוקיים ABCD'], expect: 'refused' },
  // end #1988 + #1985
  // ── #1892 (ADR-AG-248): a point on a BARE pair («D על AB») is the segment, as 2-D reads it; the order of the givens never changes the verdict ──
  { id: 'bare-on-pair-length-1892', family: 'points-incidence', steps: ['נקודה A', 'נקודה B', 'D על AB', 'AB = 4', 'AD = 5'], expect: 'refused', exception: 'X9', note: 'analytic rode the line and drew D beyond B before #1892' },
  { id: 'bare-on-pair-length-holds-1892', family: 'points-incidence', steps: ['נקודה A', 'נקודה B', 'D על AB', 'AB = 4', 'AD = 3'], expect: 'builds', exception: 'X9' },
  // #1927 (ADR-W-121, ADR-608): a declared ring over points the figure already placed, in an order that crosses in
  // every configuration, is REFUSED in every builder with the one shared message. The 2-D column landed first (ADR-608);
  // analytic (ADR-AG-250, ADR-AG-256) and 3-D (ADR-3D-322) closed their gaps under #1927.
  { id: 'crossed-ring-1927-01', family: 'polygons', steps: ['ריבוע ABCD', 'מרובע ACBD'], expect: 'refused', note: 'the square’s points in a crossing order' },
  { id: 'crossed-ring-1927-02', family: 'polygons', steps: ['מלבן ABCD', 'מרובע ABDC'], expect: 'refused' },
  { id: 'crossed-ring-1927-03', family: 'polygons', steps: ['מלבן ABCD', 'טרפז ABDC'], expect: 'refused', note: '3-D and analytic refuse it too (a rectangle is no trapezoid: #1918, #1927)' },
  { id: 'crossed-ring-1927-04', family: 'polygons', steps: ['מרובע ABDC', 'מלבן ABCD'], expect: 'refused', note: 'the ring first: the shape line completes the crossing' },
  { id: 'crossed-ring-1927-05', family: 'polygons', steps: ['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABED'], expect: 'refused', note: 'points placed by other givens' },
  { id: 'crossed-ring-1927-06', family: 'polygons', steps: ['ריבוע ABCD', 'מרובע ADCB'], expect: 'builds', note: 'the simple order — the control' },
  { id: 'crossed-ring-1927-07', family: 'polygons', steps: ['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABDE'], expect: 'builds', note: 'the midpoint ring in its simple order — the control' },
  // #1927's 2026-10-09 ruling, "search first, refuse last" (ADR-W-121 Am. 2026-10-10; ADR-613, ADR-3D-322, ADR-AG-256):
  // a kite may be a dart, on which ABDC is simple, so no builder refuses it; a trapezoid's other orders can never be
  // simple, whatever its free ratio, so every builder refuses them.
  { id: 'crossed-ring-1927-08', family: 'polygons', steps: ['דלתון ABCD', 'מרובע ABDC'], expect: 'builds', note: 'a dart saves the ring: search first, never refused (2-D and analytic draw the dart)' },
  { id: 'crossed-ring-1927-09', family: 'polygons', steps: ['טרפז ABCD', 'מרובע ACBD'], expect: 'refused', note: 'a trapezoid’s free ratio cannot save the ring' },
  { id: 'crossed-ring-1927-10', family: 'polygons', steps: ['מרובע ACBD', 'טרפז ABCD'], expect: 'refused', note: 'the ring first' },
  // #1991 (ADR-3D-327, ADR-AG-261; operator ruling 2026-10-10, option A): the same ring, declared with a SPECIFIC
  // noun. 3-D answered «בדקו את החישוב» (claim-refuted) or «givens-contradict» and analytic «לא נמצאה תצורה»;
  // all three now show 2-D's crossed-shape message. «מקבילית ACBD» ALONE still builds (search first).
  { id: 'crossed-ring-1991-01', family: 'polygons', steps: ['ריבוע ABCD', 'מקבילית ACBD'], expect: 'refused', note: 'the play-sheet T10 line' },
  { id: 'crossed-ring-1991-02', family: 'polygons', steps: ['ריבוע ABCD', 'טרפז ACBD'], expect: 'refused' },
  { id: 'crossed-ring-1991-03', family: 'polygons', steps: ['ריבוע ABCD', 'מלבן ACBD'], expect: 'refused' },
  { id: 'crossed-ring-1991-04', family: 'polygons', steps: ['מלבן ABCD', 'מקבילית ACBD'], expect: 'refused' },
  { id: 'crossed-ring-1991-05', family: 'polygons', steps: ['מקבילית ACBD'], expect: 'builds', note: 'nothing placed it yet: the ring is simply drawn — the control' },

  // #1987 (ADR-622) / #1986: four FREE points read in a second order. 2-D draws the CONCAVE quadrilateral — which
  // vertex is reflex is a configuration axis, not a fixed default — and analytic draws it too. 3-D records the row
  // as well, but draws the second ring CROSSED: that is a DRAWING gap, not a verdict one, and it is #1986.
  { id: 'crossed-ring-1927-11', family: 'polygons', steps: ['מרובע ABCD', 'מרובע ABDC'], expect: 'builds', note: 'a concave quadrilateral saves both rings: search first, never refused (3-D still draws it crossed — #1986)' },
  { id: 'crossed-ring-1927-12', family: 'polygons', steps: ['מרובע ABCD', 'מרובע ACBD'], expect: 'builds', note: 'the class, not the letters: any other order of the same four free points' },
  // end #1927
  // #1953 (ADR-618 / ADR-3D-324 / ADR-AG-259): a ring restated in another reading — rotated or reversed — is the same
  // polygon, so it is accepted and adds no row in every builder (2-D «זה כבר קיים באיור», analytic «כבר ידוע», 3-D the #613
  // restatement note). `builds` covers "already known"; the no-row half is locked per product in each issue-1953 test.
  { id: 'restated-ring-1953-01', family: 'polygons', steps: ['ריבוע ABCD', 'מרובע ADCB'], expect: 'builds', note: 'the operator’s T11 line — reversed' },
  { id: 'restated-ring-1953-02', family: 'polygons', steps: ['ריבוע ABCD', 'מרובע BCDA'], expect: 'builds', note: 'rotated' },
  { id: 'restated-ring-1953-03', family: 'polygons', steps: ['ריבוע ABCD', 'ריבוע BCDA'], expect: 'builds', note: '2-D refused «D is already defined» before #1953' },
  { id: 'restated-ring-1953-04', family: 'polygons', steps: ['משולש ABC', 'משולש ACB'], expect: 'builds' },
  { id: 'restated-ring-1953-05', family: 'polygons', steps: ['טרפז ABCD', 'טרפז CDAB'], expect: 'builds', note: 'AB ∥ CD read from C — the same pair' },
  // end #1953
  // #1902 (ADR-3D-312): an unread word in an inscription is never dropped. 3-D refuses it naming the word (its own lock,
  // X8); 2-D and analytic escalate it to their models. «שוה» reads as «שווה» in every builder (ADR-405's fold).
  { id: 'inscription-unread-word-1902', family: 'circles', steps: ['מעגל חסום במשולש שווה צלעת ABC'], expect: 'not-handled', exception: 'X8' },
  { id: 'defective-equal-sides-1902', family: 'polygons', steps: ['משולש שוה צלעות ABC'], expect: 'builds' },
  // #1923 (ADR-3D-314, ADR-AG-129): a polygon declared over coordinate points whose ring crosses itself is refused in
  // analytic's words. Coordinates are X1 (2-D has no coordinate frame).
  { id: 'crossed-ring-1923', family: 'topic', steps: ['טרפז ABCD', 'A(0,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)'], contextFor: { '2d': ['טרפז ABCD'] }, expect: 'refused', exception: 'X1', only: ['analytic'], note: 'the coordinate that makes sides BC and DA cross is refused; 3-D (z = 0, both orders) is locked in issue-1923-crossed-ring.test.ts; 2-D refuses the coordinate itself (X1)' },
  // #1941 (ADR-609) and #1891 (ADR-610), round #1959: a bare letter run is a container for an inscribed
  // circle, and an n-gon inscribed in a circle BUILDS with its circle drawn. Measured on the round's tip:
  // 3-D lowers the bare run exactly as it lowers the noun spelling (no direction defect there) and reads
  // the plain inscribed n-gon as `concyclic` + `circle3`; analytic reads no inscription sentence (#1969),
  // and 3-D has no regular n-gon (#1679's existing park, as cat-2d-019 already records).
  { id: 'cat-2d-inscribed-bare-run-1941', family: 'inscribed', steps: ['משולש ABC', 'מעגל חסום ב-ABC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1969' }] },
  { id: 'cat-2d-inscribed-ngon-plain-1891', family: 'inscribed', steps: ['מחומש ABCDE חסום במעגל'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1969' }] },
  { id: 'cat-2d-inscribed-ngon-regular-1891', family: 'inscribed', steps: ['מחומש משוכלל ABCDE חסום במעגל'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1969' }, { product: '3d', issue: '#1679', parked: true }], note: '3-D has no regular n-gon at all; analytic reads no inscription sentence (#1969)' },
  // #1912 (ADR-3D-329) — A LOOK-ALIKE GLYPH IS THE SYMBOL IT RENDERS AS, in every builder. Which glyph a
  // student gets is decided by their keyboard, the palette or the PDF they pasted from, so the same
  // sentence must give the same verdict whichever twin carries it. Each row pairs a twin with the
  // canonical glyph's own row elsewhere in this list (`cat-3d-005` for ∠, the perpendicular rows for ⊥).
  { id: 'glyph-perp-u27c2-1912', family: 'parallel-perpendicular', steps: ['משולש ABC', 'AC ⟂ AB'], expect: 'builds', note: '⟂ U+27C2 beside ⊥ U+22A5 — the operator’s own sequences use ⟂ (#1888)' },
  { id: 'glyph-perp-u27c2-glued-1912', family: 'parallel-perpendicular', steps: ['משולש ABC', 'AC⟂AB'], expect: 'builds' },
  { id: 'glyph-angle-measured-1912', family: 'angles', steps: ['משולש ABC', '∡ABC = 40°'], expect: 'builds', note: '∡ U+2221' },
  { id: 'glyph-angle-keyboard-1912', family: 'angles', steps: ['משולש ABC', '<ABC = 40°'], expect: 'builds', note: 'the keyboard `<` as ∠ (ADR-381); the comparison rows below keep it a comparison' },
  { id: 'glyph-degree-superscript-1912', family: 'angles', steps: ['משולש ABC', '∠ABC = 40⁰'], expect: 'builds', note: '⁰ U+2070' },
  { id: 'glyph-degree-ordinal-1912', family: 'angles', steps: ['משולש ABC', '∠ABC = 40º'], expect: 'builds', note: 'º U+00BA' },
  { id: 'glyph-degree-ring-1912', family: 'angles', steps: ['משולש ABC', '∠ABC = 40˚'], expect: 'builds', note: '˚ U+02DA' },
  { id: 'glyph-root-word-1912', family: 'lengths', steps: ['משולש ABC', 'אורך AB הוא שורש 2'], expect: 'builds', note: 'the word «שורש» before a value is √ (#105)' },
  // #1919 (ADR-626 / ADR-3D-328) — A LETTER THE TOOL CANNOT READ IS REFUSED BY NAME, in every builder
  // (operator ruling 2026-10-08: *"we only support english or hebrew … rejected. in all tools"*). 2-D and
  // 3-D DREW these as A, B, C …; analytic handed them to the model. Greek stays math, and the Cyrillic
  // look-alikes fold, so those two rows are the controls that keep the rule from overreaching.
  { id: 'unread-name-1919', family: 'polygons', steps: ['משולש ДЖФ'], expect: 'refused', note: 'Cyrillic with no Latin twin: 2-D committed A, B, C, 3-D recorded A, B, C' },
  { id: 'unread-name-square-1919', family: 'polygons', steps: ['ריבוע ДЖФИ'], expect: 'refused' },
  { id: 'unread-name-arabic-1919', family: 'polygons', steps: ['משולש ابج'], expect: 'refused', note: 'any script the label grammar cannot read, not only Cyrillic' },
  { id: 'unread-name-point-1919', family: 'points-incidence', steps: ['משולש ABC', 'נקודה Ж על AB'], expect: 'refused', note: 'anywhere in the line, not only a shape’s vertex list' },
  { id: 'unread-word-1919', family: 'frame', steps: ['треугольник ABC'], expect: 'refused', note: 'a WORD in another language takes the other ruled sentence' },
  { id: 'unread-greek-vertex-1919', family: 'polygons', steps: ['משולש ΓΔΘ'], expect: 'not-handled', note: 'Greek is math (the ruling), so a Greek vertex name goes to the model as in 2-D — 3-D recorded A, B, C before #1919' },
  { id: 'unread-lookalike-1919', family: 'polygons', steps: ['משולש КМО'], expect: 'builds', note: 'the Cyrillic look-alikes fold to K, M, O (the ruling: «fold them silently») — 2-D always did; 3-D recorded A, B, C and analytic read nothing' },
  // #1837 (ADR-710 / ADR-W-142) — AN ANGLE WRITTEN WITH π IS REFUSED, deterministically, in every plane-geometry
  // builder (operator rulings 2026-10-07 «Refuse and teach degrees», 2026-10-08 «only the complex tool should»).
  // 2-D sent these to the model, 3-D recorded «∠ABC = π» as a mark labelled π, analytic drew them in degrees.
  { id: 'radian-angle-1837-01', family: 'angles', steps: ['משולש ABC', '∠ABC = π/2'], expect: 'refused', note: 'analytic drew 1.57°; 2-D and 3-D asked the model' },
  { id: 'radian-angle-1837-02', family: 'angles', steps: ['משולש ABC', '∠ABC = π'], expect: 'refused', note: '3-D recorded an angle mark labelled π' },
  { id: 'radian-angle-1837-03', family: 'angles', steps: ['משולש ABC', 'זווית ABC שווה ל-π/4'], expect: 'refused' },
  { id: 'radian-angle-1837-04', family: 'angles', steps: ['משולש ABC', '∠ABC = pi/2'], expect: 'refused', note: 'the ASCII spelling: 2-D committed 2°' },

  // ── #1864 (ADR-AG-267): an angle's acuteness named by its VERTEX alone — 2-D's «∠C קהה/חדה» ──
  { id: 'vertex-obtuse-1864', family: 'angles', steps: ['משולש ABC', 'זווית A קהה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the line the obtuse-triangle note teaches' },
  { id: 'vertex-acute-1864', family: 'angles', steps: ['משולש ABC', 'זווית A חדה'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }] },

  // ── #1893 (ADR-AG-271): a third crossing asked of a chord whose two ends are on the circle — #1834's ruling ──
  { id: 'chord-third-crossing-1893', family: 'chords-arcs', steps: ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'AC חותך את המעגל בנקודה E'], expect: 'refused', exception: 'X8', note: 'analytic drew E on A, green; 2-D refuses (its sentence is #1834’s to reword) — the verdict, not the text, is the row' },
  // ── #1924 (ADR-AG-272): a crossing asked of a tangent at a named point — 2-D's errors.tangentNoSecondCrossing ──
  { id: 'tangent-no-second-crossing-1924', family: 'tangents', steps: ['מעגל O', 'A על מעגל O', 'מנקודה P משיק נוגע במעגל O בנקודה A', 'PA חותך את המעגל בנקודה E'], expect: 'refused', exception: 'X8' },
  // ── #2486 (ADR-759 / ADR-AG-331): an arc's three letters are read by one reader — the MIDDLE letter is the centre. The row
  //    judges builds/refused only; the centre is locked per builder (issue-2486-arc-run-centre tests) and by the shared reader ──
  { id: 'quarter-AOB-2486', family: 'chords-arcs', steps: ['רבע מעגל AOB'], expect: 'builds', exception: 'X8' },
  { id: 'sector-OAB-2486', family: 'chords-arcs', steps: ['גזרה OAB'], expect: 'builds', exception: 'X8' },

  // ── #1827 (ADR-3D-337): a stated magnitude may be a RADICAL in every slot, not only «|AD| = …» ──
  // 3-D read «|AD| = √7» and refused the bare «AD = √7» (the operator's line), the area and the `sqrt` spelling.
  { id: 'surd-length-1827', family: 'lengths', steps: ['מלבן ABCD', 'AB=1', 'AD=√7'], expect: 'builds', note: 'the operator’s exact sequence (prod 3-D, 2026-10-06)' },
  { id: 'surd-length-paren-1827', family: 'lengths', steps: ['משולש ABC', 'AB = √(7)'], expect: 'builds' },
  { id: 'surd-length-sqrt-1827', family: 'lengths', steps: ['משולש ABC', 'AB = sqrt(2)'], expect: 'builds', note: 'the keyboard spelling of √ (#1920)' },
  { id: 'surd-area-1827', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC = √3'], expect: 'builds' },

  // ── #2008 (ADR-635): a vulgar-fraction glyph is its value — 2-D spells the whole Unicode block at its boundary ──
  { id: 'glyph-fraction-ratio-2008', family: 'lengths', steps: ['משולש ABC', 'AB = ¼ BC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2047' }, { product: '3d', issue: '#2047' }], note: 'analytic and 3-D each fold their own subset of the glyphs; one shared table is #2047 (needs-operator)' },
  // #2255 (ADR-W-147 / ADR-3D-374): a MIXED number is one number — 3-D spelled «2½» as «21/2» = 10.5, green. 3-D now calls
  // the shared `shell/vulgarFractions`; the |AB| = 2.5 thin locks are 2-D's vulgar-fraction-2008 and 3-D's vulgar-fraction-2255.
  { id: 'vulgar-mixed-length-2255', family: 'lengths', steps: ['משולש ABC', 'AB = 2½'], expect: 'builds' },

  // ── #2040 (ADR-636): «קטן פי N» is the inverse factor — 2-D drew it as «גדול פי N»; analytic always read it as half ──
  { id: 'comparative-smaller-2040', family: 'lengths', steps: ['משולש ABC', 'AB קטן פי 2 מ-AC'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'the reported line; 3-D reads no «פי» comparative (not-understood)' },

  // ── #1931 (ADR-640): a crossing asked of a line the givens make TANGENT has no second point — refused with the tangent sentence ──
  { id: 'relation-tangent-crossing-1931', family: 'tangents', steps: ['מעגל O', 'A על מעגל O', 'נקודה P', 'הישר AP משיק למעגל O בנקודה A', 'הישר AP חותך את המעגל בנקודה E'], expect: 'refused', exception: 'X8', note: '2-D committed E 1e-6 from A before ADR-640; analytic refuses since ADR-AG-272 (#1924, same round)' },

  // ── #2099 (ADR-651, operator ruling 2026-10-14): a circle through three points the incidences put on ONE line is refused,
  // naming the statement that put them there — 2-D committed the solved-rider rows green with a centre at ~10⁷ ──
  { id: 'collinear-circle-2099-line', family: 'circles', steps: ['משולש ABC', 'D על הישר AB', 'מעגל שעובר דרך A, D ו-B'], expect: 'refused', exception: 'X8', note: 'the reported row; analytic drew the circle until ADR-AG-296 (#1963, the proved-collinear arm)' },
  { id: 'collinear-circle-2099-segment', family: 'circles', steps: ['משולש ABC', 'D על AB', 'מעגל שעובר דרך A, D ו-B'], expect: 'refused', exception: 'X8' },
  { id: 'collinear-circle-2099-midpoint', family: 'circles', steps: ['משולש ABC', 'M אמצע AB', 'מעגל שעובר דרך A, M ו-B'], expect: 'refused', exception: 'X8' },
  { id: 'collinear-circle-2099-circumscribed', family: 'circles', steps: ['משולש ABC', 'D על הישר AB', 'מעגל חוסם את המשולש ADB'], expect: 'refused', exception: 'X8' },
  { id: 'collinear-circle-2099-control', family: 'circles', steps: ['משולש ABC', 'D על AC', 'מעגל שעובר דרך A, D ו-B'], expect: 'builds', exception: 'X8', note: 'D off line AB — a real circle' },

  // ── #2064 (ADR-643): a height named by two existing vertices that is ALREADY a height answers «כבר קיים» in every spelling ──
  { id: 'altitude-already-height-2064', family: 'cevians-centres', steps: ['ריבוע ABCD', 'AB גובה'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2072' }, { product: '3d', issue: '#1679', parked: true }], note: '2-D: «זה כבר קיים באיור» (it used to squash the square to a point); analytic refuses `degenerate-role` — the cross-tool question #2072' },
  { id: 'altitude-reversed-side-already-drawn-2064', family: 'cevians-centres', steps: ['ריבוע ABCD', 'BC גובה ל-AB'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2072' }, { product: '3d', issue: '#1679', parked: true }], note: 'the operator’s screenshot line: the apex is the letter off the side' },
  { id: 'altitude-long-form-already-drawn-2064', family: 'cevians-centres', steps: ['ריבוע ABCD', 'AB גובה לצלע BC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2072' }, { product: '3d', issue: '#1679', parked: true }], note: 'the control: unchanged in 2-D' },
  // ── #2117 (ADR-718): a diagonal of a square, rectangle or rhombus called a height is perpendicular to no side — refused naming the declaring statement ──
  { id: 'diagonal-height-refused-2117', family: 'cevians-centres', steps: ['ריבוע ABCD', 'AC גובה'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: 'analytic refuses too; 3-D does not read a two-vertex height (#1679). 2-D: «…סותר את «ריבוע ABCD» … הסיבה: האלכסון AC אינו מאונך לאף צלע של הריבוע.» (operator ruling 2026-10-15)' },
  // ── #2064 / #2085 (ADR-643): a declared polygon is never squashed to a point or given a straight corner — every builder refuses ──
  { id: 'square-midpoint-collapse-2064', family: 'polygons', steps: ['ריבוע ABCD', 'B אמצע CD'], expect: 'refused', note: '2-D: «B כבר מוגדרת…» (it drew one point, green)' },
  { id: 'quad-straight-corner-2064', family: 'polygons', steps: ['מרובע ABCD', 'זווית BCD = 180'], expect: 'refused', note: '2-D: the flat sentence naming B, C, D' },
  { id: 'quad-corner-incidence-2064', family: 'polygons', steps: ['מרובע ABCD', 'C על BD'], expect: 'refused' },
  { id: 'pentagon-straight-corner-2085', family: 'polygons', steps: ['מחומש ABCDE', 'זווית BCD = 180'], expect: 'refused', note: '2-D: «…והמחומש ABCDE היה נעשה מרובע»' },
  { id: 'definite-triangle-predicate-2205', family: 'polygons', steps: ['משולש ABC', 'המשולש ישר זווית'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2236' }], note: '#2205 (ADR-685): the definite noun is the one triangle — 2-D drew a second triangle DEF before' },
  { id: 'definite-triangle-two-2205', family: 'polygons', steps: ['משולש ABC', 'משולש DEF', 'המשולש ישר זווית'], expect: 'asks', knownGap: [{ product: 'analytic', issue: '#2236' }], note: '#2205 (ADR-685): two triangles — refused naming them, with the named form as the next step' },
  { id: 'indefinite-triangle-new-2235', family: 'polygons', steps: ['משולש ABC', 'משולש ישר זווית'], expect: 'builds', note: '#2235 (ADR-3D-351): the indefinite noun is a NEW triangle (DEF in 2-D and 3-D) — the ring count is asserted in issue-2235-shape-ref.test.ts' },
  { id: 'altitude-two-vertex-not-true-2064', family: 'cevians-centres', steps: ['מרובע ABCD', 'AC גובה'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2072' }, { product: '3d', issue: '#1679', parked: true }], note: '2-D: AC ⟂ BC, the side a free choice «הציגו תצורה אחרת» cycles (ADR-644); analytic refuses `degenerate-role` — the cross-tool question #2072' },
  // ── #2101 / #2100 (ADR-648 / ADR-649, operator rulings 2026-10-14): a radius letter's value sizes its circle; a radius ratio is a relation ──
  { id: 'radius-letter-value-2101', family: 'circles', steps: ['מעגל O ברדיוס r', 'r = 3'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2110' }] },
  { id: 'radius-letter-value-upper-2101', family: 'circles', steps: ['מעגל O ברדיוס R', 'R = 3'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2110' }] },
  { id: 'radius-ratio-2100', family: 'circles', steps: ['מעגל O', 'מעגל P', 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2110' }] },
  { id: 'radius-ratio-after-2100', family: 'circles', steps: ['מעגל O', 'מעגל P', 'רדיוס מעגל O גדול מרדיוס מעגל P פי 2'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2110' }] },
  // ── #2459 (ADR-754): the same ratio between the circles of a concentric pair, named by their roles ──
  { id: 'radius-ratio-role-2459', family: 'circles', steps: ['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל פנימי 1.5', 'רדיוס המעגל החיצוני גדול פי 2 מרדיוס המעגל הפנימי'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2110' }], note: '2-D drew the outer radius as 2 (the factor), green, before ADR-754' },
  { id: 'radius-ratio-role-smaller-2459', family: 'circles', steps: ['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל חיצוני 3', 'רדיוס המעגל הפנימי קטן פי 2 מרדיוס המעגל החיצוני'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2110' }], note: '2-D refused it (read as the inner radius 2) before ADR-754' },
  // ── #2464 / #2470 (ADR-760): each role word names its own circle, and never adds a relation ──
  { id: 'concentric-two-roles-2464', family: 'circles', steps: ['שני מעגלים בעלי מרכז משותף O', 'A על המעגל החיצוני ו-B על המעגל הפנימי'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2460' }], note: '2-D put both points on the outer circle, green, before ADR-760' },
  { id: 'concentric-role-tangent-2470', family: 'circles', steps: ['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9', 'מעגל P', 'משיק למעגל החיצוני בנקודה A'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2460' }], note: '2-D also made O and P tangent at A, green, before ADR-760' },
  // ── #2066 (ADR-643): a side of the triangle is never its bisector — 2-D refuses with a sentence ──
  { id: 'bisector-on-a-side-2066', family: 'cevians-centres', steps: ['משולש ABC', 'AB חוצה זווית'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D: «AB היא צלע של המשולש ולכן אינה יכולה לחצות את זווית A…»' },
  // #2115 (ADR-AG-299): the same predicate on a quadrilateral, and the vertex-less verb that builds over a non-side
  { id: 'bisector-on-a-quad-side-2115', family: 'cevians-centres', steps: ['מרובע ABCD', 'AB חוצה זווית'], expect: 'refused', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D: «AB היא צלע של המרובע ולכן אינה יכולה לחצות את זווית A.»' },
  { id: 'bisector-vertexless-builds-2115', family: 'cevians-centres', steps: ['משולש ABC', 'AD חוצה זווית'], expect: 'builds', knownGap: [{ product: '3d', issue: '#1679', parked: true }], note: '2-D: the bisector from A, D on BC' },

  // ── #2098 (ADR-650): a bare run as the SUBJECT of «חוסם» encloses the circle — the incircle in every builder ──
  // ── #1975 (ADR-652, ADR-3D-341, ADR-AG-275): both voices of both inscription relations, every shape, all tools ──
  // operator 2026-10-14: "we need to have both forms supported … for all shapes … in all tools". Each row's other
  // voice is a row above or below with the same verdict.
  { id: 'voices-circum-pentagon-1975', family: 'inscribed', steps: ['מחומש ABCDE', 'מעגל חוסם את המחומש ABCDE'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1969' }], note: 'the request (2026-10-10)' },
  { id: 'voices-circum-pentagon-empty-1975', family: 'inscribed', steps: ['מעגל חוסם את המחומש ABCDE'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1969' }] },
  { id: 'voices-circum-bare-pentagon-1975', family: 'inscribed', steps: ['מחומש ABCDE', 'מעגל חוסם את ABCDE'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#1969' }] },
  { id: 'voices-circum-square-1975', family: 'inscribed', steps: ['ריבוע ABCD', 'מעגל חוסם את הריבוע ABCD'], expect: 'builds', note: '#1841' },
  { id: 'voices-circum-square-en-1975', family: 'inscribed', steps: ['ריבוע ABCD', 'a circle circumscribes the square ABCD'], expect: 'builds' },
  { id: 'voices-circum-named-1975', family: 'inscribed', steps: ['משולש ABC', 'מעגל O חוסם את המשולש ABC'], expect: 'builds', note: '#1531 (the inscription half)' },
  { id: 'voices-circum-relative-1975', family: 'inscribed', steps: ['משולש ABC', 'מעגל שחוסם את המשולש ABC'], expect: 'builds', note: 'analytic read no relative clause before ADR-AG-275' },
  { id: 'voices-in-named-1975', family: 'inscribed', steps: ['משולש ABC', 'מעגל O חסום במשולש ABC'], expect: 'builds' },
  { id: 'voices-in-relative-1975', family: 'inscribed', steps: ['משולש ABC', 'מעגל ש-ABC חוסם'], expect: 'builds', note: '3-D drew the circle THROUGH A, B, C before ADR-3D-341 (the #2098 trap)' },
  { id: 'voices-in-pentagon-refused-1975', family: 'inscribed', steps: ['מחומש ABCDE', 'ABCDE חוסם מעגל'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#1903' }], note: 'the other voice of pentagon-incircle-1891 (the same gap); #1908 lifts both' },
  { id: 'voices-feminine-inscribed-1975', family: 'inscribed', steps: ['מקבילית ABCD', 'מקבילית ABCD חסומה במעגל'], expect: 'builds', note: '#2035-01' },
  { id: 'voices-feminine-circumscribes-1975', family: 'inscribed', steps: ['משולש ABC', 'משולש ABC חוסמת מעגל'], expect: 'builds', note: '#2035-02' },
  { id: 'bare-run-circumscribes-2098', family: 'inscribed', steps: ['משולש ABC', 'ABC חוסם מעגל'], expect: 'builds', note: 'all three built it before the fix; 2-D drew the circle THROUGH the vertices — its geometry is held by issue-2098-bare-run-circumscribes.test.ts' },
  // ── #2024 (ADR-668): a symbol letter equal to one of the measured element's own endpoints is a value, never a lowercase label ──
  { id: 'symbol-endpoint-length-2024', family: 'lengths', steps: ['משולש ABC', 'AB=b'], expect: 'builds', note: '2-D refused it as a lowercase label and taught «AB=B»; «AB=c» built' },
  { id: 'symbol-endpoint-angle-2024', family: 'angles', steps: ['משולש ABC', 'זוית B=b'], expect: 'builds', knownGap: [{ product: '3d', issue: '#2060' }], note: '2-D taught «זוית B=B»; 3-D reads no symbol on a one-letter angle, Greek included' },
  { id: 'symbol-endpoint-angle-full-2024', family: 'angles', steps: ['משולש ABC', 'זווית ABC=b'], expect: 'builds' },

  // ── #2125 (ADR-3D-342): the circle through the vertices and the circle inside are two circles — both build, in either order ──
  { id: 'circum-then-incircle-2125', family: 'inscribed', steps: ['משולש ABC', 'מעגל חוסם את ABC', 'מעגל חסום במשולש ABC'], expect: 'builds', note: "the operator's sequence: 3-D refused the incircle «ABC כבר מוגדר» before ADR-3D-342 (both unnamed circles were circle-ABC)" },
  { id: 'incircle-then-circum-2125', family: 'inscribed', steps: ['משולש ABC', 'מעגל חסום במשולש ABC', 'מעגל חוסם את ABC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2130' }], note: 'analytic refuses the circumcircle unsatisfiable in this order (found by round #2128)' },
  { id: 'circum-passive-then-incircle-2125', family: 'inscribed', steps: ['משולש ABC', 'משולש ABC חסום במעגל', 'מעגל חסום במשולש ABC'], expect: 'builds' },

  // ── #2083 (ADR-646): a sentence that only NAMES an existing circle is a reference — the stated radii are kept ──
  { id: 'named-crossing-keeps-radii-2083', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'המעגלים O ו-P נחתכים בנקודות X ו-Y'], expect: 'builds', exception: 'X8', note: 'analytic refused the crossing line bad-operand before ADR-AG-300 (#2108). 2-D replaced both radii with free defaults (r 5 and 3.6) before ADR-646; the verdict was builds then too — the radii are locked in src/app/__tests__/issue-2083-circle-reference.test.ts' },

  // ── #2108 (ADR-AG-300): the PLURAL circle subject crosses in analytic as in 2-D — letterless, contextual, English ──
  { id: 'plural-circles-cross-empty-2108', family: 'circles', steps: ['המעגלים O ו-P נחתכים בנקודות A ו-B'], expect: 'builds', exception: 'X8', note: 'the catalog sentence: on an empty figure both builders draw the two circles first' },
  { id: 'plural-circles-cross-letterless-2108', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'המעגלים O ו-P נחתכים'], expect: 'builds', exception: 'X8' },
  { id: 'plural-circles-cross-contextual-2108', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'שני המעגלים נחתכים בנקודות X ו-Y'], expect: 'builds', exception: 'X8' },
  { id: 'plural-circles-cross-en-2108', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'circles O and P intersect at X and Y'], expect: 'builds', exception: 'X8' },

  // ── #2080 / #2083 (ADR-645): two circles with ONE common point have no two-point crossing — refused with the contradiction sentence ──
  { id: 'circles-tangent-then-cross-2080', family: 'circles', steps: ['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים', 'המעגלים O ו-P נחתכים בנקודות X ו-Y'], expect: 'refused', exception: 'X8', note: '2-D committed X = Y on the touch point before ADR-645' },
  // ── #2084 (ADR-647): a point stated on two tangent circles is their touch point (builds, with the converge notice) ──
  { id: 'point-on-two-tangent-circles-2084', family: 'circles', steps: ['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים', 'X על מעגל O', 'X על מעגל P'], expect: 'builds', exception: 'X8', note: '2-D answered «כבר קיים» with X off circle P before ADR-647 (a builds verdict then too — the position is locked in src/app/__tests__/issue-2084-point-on-tangent-circles.test.ts)' },
  { id: 'indefinite-second-triangle-2127', family: 'inscribed', steps: ['מעגל O', 'משולש חוסם את מעגל O', 'משולש חסום במעגל O'], expect: 'builds', exception: 'X8', note: '2-D refused the second, indefinite triangle as contradicting the first before ADR-654; analytic already drew two' },
  { id: 'indefinite-second-triangle-other-order-2127', family: 'inscribed', steps: ['מעגל O', 'משולש חסום במעגל O', 'משולש חוסם את מעגל O'], expect: 'builds', exception: 'X8' },
  { id: 'tangent-by-lengths-cross-2083', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'OP = 5', 'המעגלים O ו-P נחתכים בנקודות X ו-Y'], expect: 'refused', exception: 'X8', note: '2-D drew X and Y 0.01 apart, green, before ADR-645' },

  // ── #2023 / #2061 (ADR-661): a second letter for a measured angle or segment, or the same letter with another
  // coefficient, is refused naming the earlier line (operator rulings 2026-10-13 and 2026-10-14: all three builders) ──
  { id: 'angle-second-name-2023', family: 'angles', steps: ['משולש ABC', 'זווית ABC=α', 'זווית ABC=β'], expect: 'refused', note: 'before ADR-AG-277 / ADR-3D-344 analytic recorded both names and 3-D relabelled the arc to β (#2054)' },
  // #2191 (ADR-720): a second ALIAS on an angle an earlier alias named is the same one-name refusal (ruling 2026-10-16)
  { id: 'angle-second-alias-2191', family: 'angles', steps: ['משולש ABC', 'נסמן זוית ABC כ-A1', 'נסמן זוית ABC כ-B2'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#2204' }, { product: '3d', issue: '#1679', parked: true }], note: '2-D committed it and A1 vanished before ADR-720; analytic records both names (#2204); 3-D does not read the alias (#1679)' },
  { id: 'angle-coef-restated-2061', family: 'angles', steps: ['משולש ABC', '∠ABC=2α', '∠ABC=3α'], expect: 'refused', note: 'before ADR-3D-344 3-D recorded both and kept 2α; analytic refused it as a flat triangle (ADR-AG-277 gives it 2-D sentence)' },
  // ── #2105 (ADR-AG-295): a second, different NUMBER for one segment or angle is refused naming the first line, in 2-D's wording
  // (the letter twin «AB = 2a» · «AB = 3a» is locked per product: 3-D reads «2a» as a vector, #2253) ──
  { id: 'length-numbers-twin-2105', family: 'lengths', steps: ['משולש ABC', 'AB=4', 'AB=5'], expect: 'refused', note: 'analytic refused it «לא נמצאה תצורה» before ADR-AG-295 (the sentence is locked in src-analytic/__tests__/issue-2105-numeric-contradiction.test.ts)' },
  { id: 'angle-numbers-twin-2105', family: 'angles', steps: ['משולש ABC', '∠ABC=40', '∠ABC=50'], expect: 'refused', note: 'analytic refused it «לא נמצאה תצורה» before ADR-AG-295' },
  // ── #1851 (ADR-662): a symbol plus a constant is read by one affine-tail reader, as a length's «a + 3» is ──
  { id: 'angle-symbol-constant-1851', family: 'angles', steps: ['משולש ABC', '∠ABC = α + 40'], expect: 'builds', knownGap: [{ product: '3d', issue: '#2140' }], note: 'the operator (2026-10-07): «should be accepted and drawn»; analytic already recorded it; 3-D does not read a constant (#2140, needs-operator)' },
  // ── #2149 / #2123 (ADR-671): a sentence naming its circles is never asked «which circle?»; the named-pair readers ──
  { id: 'centres-named-pair-2149', family: 'circles', steps: ['מעגל O', 'מעגל P', 'קטע המרכזים של המעגלים O ו-P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D asked «which circle?» before ADR-671' },
  { id: 'equal-radii-plural-2149', family: 'circles', steps: ['מעגל O', 'מעגל P', 'רדיוסי המעגלים O ו-P שווים'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D asked «which circle?» before ADR-671' },
  { id: 'equal-radii-singular-2149', family: 'circles', steps: ['מעגל O', 'מעגל P', 'רדיוס מעגל O שווה לרדיוס מעגל P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D sent it to the AI before ADR-671' },
  { id: 'touch-point-unstated-2149', family: 'circles', steps: ['מעגל O', 'מעגל P', 'X נקודת ההשקה של המעגלים O ו-P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D asked «which circle?» before ADR-671 (operator ruling 2026-10-16, card 7: the sentence states the tangency)' },
  { id: 'touch-point-named-2123', family: 'circles', steps: ['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים', 'X נקודת ההשקה של המעגלים O ו-P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D asked «which circle?» before ADR-671' },
  // ── #2188 (ADR-672): a restated tangency keeps the kind stated earlier ──
  { id: 'tangent-twin-kind-2188', family: 'circles', steps: ['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים מבפנים', 'המעגלים O ו-P משיקים בנקודה X'], expect: 'builds', exception: 'X8', note: '2-D drew the twin EXTERNAL with the internal row red before ADR-672 (a builds verdict then too; the kind is locked in src/app/__tests__/issue-2188-tangent-kind-inherited.test.ts); analytic already kept it internal (src-analytic issue-1504)' },
  // ── #2208 (ADR-669): «משיק» with a circle subject is the verb — the circles are tangent, never a common tangent line ──
  { id: 'circle-subject-kind-2208', family: 'circles', steps: ['מעגל O', 'מעגל P', 'מעגל P משיק למעגל O מבפנים'], expect: 'builds', exception: 'X8', note: '2-D drew a common tangent AB with the circles not tangent before ADR-669 (a builds verdict then too — the kind is locked in src/app/__tests__/issue-2208-circle-subject-tangent.test.ts); analytic already drew them internally tangent' },
  { id: 'angle-same-letter-other-constant-1851',family: 'angles', steps: ['משולש ABC', '∠ABC = α', '∠ABC = α + 40'], expect: 'refused', knownGap: [{ product: '3d', issue: '#2140' }], note: '2-D refuses it in the #2061 contradiction frame; analytic refused it «לא נמצאה תצורה» before ADR-AG-295 (#2105), now in the same frame' },
  // ── #2198 / #2216 (ADR-677): one «ברדיוס N» on a two-circle sentence sizes BOTH circles (operator ruling 2026-10-16) ──
  { id: 'two-circles-radius-both-2216', family: 'circles', steps: ['שני מעגלים נחתכים ברדיוס 5'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D drew 5 / 3.6 green before ADR-677 (the 5 paid by the default radius); analytic does not read the sentence (not-handled)' },
  // ── #2263 (ADR-702): one «ברדיוס N» on a NESTED pair is refused, one given per line (operator 2026-10-16) ──
  { id: 'concentric-pair-radius-refused-2263', family: 'circles', steps: ['שני מעגלים בעלי מרכז משותף O ברדיוס 5'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D escalated to the model before ADR-702, which gave 5 to the outer circle green; analytic does not read the sentence (not-handled)' },
  { id: 'contained-pair-radius-refused-2263', family: 'circles', steps: ['שני מעגלים מוכלים ברדיוס 5'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D escalated to the model before ADR-702; analytic does not read the sentence (not-handled)' },
  { id: 'internal-tangent-pair-radius-refused-2263', family: 'circles', steps: ['שני מעגלים משיקים מבפנים ברדיוס 5'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D escalated to the model (not-handled) before ADR-702; analytic does not read the sentence (not-handled)' },
  // ── #2186 (ADR-679): a stated equal size on intersecting circles is drawn ──
  { id: 'equal-radii-intersecting-2186', family: 'circles', steps: ['שני מעגלים נחתכים ברדיוסים שווים'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D drew 5 / 3.6 green before ADR-679 (the equality dropped); analytic does not read the sentence (not-handled)' },
  // ── #2200 (ADR-712): the bare equal pair builds; a contained pair stated equal is refused from the words ──
  { id: 'equal-circles-bare-2200', family: 'circles', steps: ['שני מעגלים ברדיוסים שווים'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D escalated not-handled before ADR-712 (the bare rule never stripped the equal-size words); analytic does not read the sentence (not-handled)' },
  { id: 'equal-circles-nested-2200', family: 'circles', steps: ['שני מעגלים מוכלים ברדיוסים שווים'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D committed red (figure.v.circleContained) before ADR-712; analytic does not read the sentence (not-handled)' },
  // ── #2206 (ADR-713): equal circles stated nested — from the words or the stated values — are refused ──
  { id: 'equal-circles-nested-values-2206', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', 'מעגל P מוכל בתוך מעגל O'], expect: 'refused', exception: 'X8', note: '2-D committed red (figure.v.circleContained) before ADR-713; analytic refuses it unsatisfiable (generic sentence)' },
  { id: 'equal-circles-int-tangent-words-2206', family: 'circles', steps: ['שני מעגלים משיקים מבפנים ברדיוסים שווים'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D escalated (ADR-455 D2 stop) before ADR-713; analytic does not read the sentence (not-handled)' },
  { id: 'equal-circles-concentric-words-2206', family: 'circles', steps: ['שני מעגלים בעלי מרכז משותף O ברדיוסים שווים'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D escalated (ADR-679 word gate) before ADR-713; analytic does not read the sentence (not-handled)' },
  // ── #2199 (ADR-AG-282) / #2185: a point stated on a LIST of carriers is on each ──
  { id: 'point-on-two-circles-2185', family: 'circles', steps: ['מעגל O', 'מעגל P', 'A על מעגל O ועל מעגל P'], expect: 'builds', exception: 'X8' },
  { id: 'points-on-two-circles-2185', family: 'circles', steps: ['מעגל O', 'מעגל P', 'A ו-B על מעגל O ועל מעגל P'], expect: 'builds', exception: 'X8' },
  { id: 'point-on-two-circles-en-2185', family: 'circles', steps: ['מעגל O', 'מעגל P', 'A on circle O and on circle P'], expect: 'builds', exception: 'X8' },
  { id: 'point-on-three-circles-2185', family: 'circles', steps: ['מעגל O', 'מעגל P', 'מעגל Q', 'A על מעגל O, על מעגל P ועל מעגל Q'], expect: 'builds', exception: 'X8' },
  { id: 'points-respectively-en-2185', family: 'circles', steps: ['מעגל O', 'מעגל P', 'A and B on circle O and on circle P respectively'], expect: 'builds', exception: 'X8' },
  { id: 'point-per-circle-2185', family: 'circles', steps: ['מעגל O', 'מעגל P', 'A על מעגל O ו-B על מעגל P'], expect: 'builds', exception: 'X8', note: '2-D put B on circle O (swapped), green, before ADR-735; analytic already put each on its own circle' },
  { id: 'point-per-circle-en-2185', family: 'circles', steps: ['מעגל O', 'מעגל P', 'A on circle O and B on circle P'], expect: 'builds', exception: 'X8', note: '2-D refused it split-statements before ADR-735 (#2185)' },
  { id: 'point-on-two-lines-2185', family: 'points-incidence', steps: ['ריבוע ABCD', 'P על הישר AC ועל הישר BD'], expect: 'builds', knownGap: [{ product: '3d', issue: '#2260' }], note: '2-D escalated it before ADR-735 (#2185)' },
  // ── #2165 + #2135 + #2133 (ADR-681): a letter's values are judged in list order — a second value is an equation or a
  // contradiction, never «כבר קיים» or last-wins ──
  { id: 'letter-equation-2165', family: 'lengths', steps: ['משולש ABC', 'AB = 2a', 'AB = a + 3'], expect: 'builds', knownGap: [{ product: '3d', issue: '#2253' }], note: 'the operator (2026-10-15): «commits the equation: a = 3, |AB| = 6, as analytic does»; 2-D answered «כבר קיים» before ADR-681' },
  { id: 'letter-binding-after-number-2165', family: 'lengths', steps: ['משולש ABC', 'AB = 5', 'AB = a'], expect: 'builds', note: '2-D answered «כבר קיים» and dropped the binding before ADR-681' },
  { id: 'letter-value-against-number-2165', family: 'lengths', steps: ['משולש ABC', 'AB = a', 'AB = 5', 'a = 6'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#2253' }], note: '2-D committed it and turned «AB = 5» red before ADR-681' },
  // the second value itself («k = 4» after «k = 3») needs a value line the siblings do not read yet (#2253), so its row is
  // the value line; the refusal is locked in src/app/__tests__/issue-2165-letter-system.test.ts
  { id: 'letter-value-line-2135', family: 'lengths', steps: ['משולש ABC', 'AB = k', 'k = 3'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2253' }, { product: '3d', issue: '#2253' }] },
  { id: 'radius-letter-second-value-2135', family: 'circles', steps: ['מעגל O ברדיוס r', 'r = 3', 'r = 4'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2110' }], note: '2-D drew r = 4 with «r = 3» still ✓ before ADR-681' },
  { id: 'reserved-radius-value-2133', family: 'circles', steps: ['מעגל O ברדיוס 3', 'r = 4'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2253' }], note: 'ADR-034 Am. 1: r names the radius; 2-D committed it green with r = 3 before ADR-681' },
  { id: 'reserved-radius-through-length-2133', family: 'circles', steps: ['מעגל O ברדיוס 4', 'A, B על מעגל O', 'AB = r', 'r = 3'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2253' }], note: '2-D drew radius 4 and |AB| = 3, green, before ADR-681' },
  // ── #2119 (ADR-683, ADR-684): a second, different stated radius is refused naming the first, 2-D's sentence in both builders ──
  { id: 'radius-restated-2119', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל O ברדיוס 4'], expect: 'refused', exception: 'X8', note: '2-D answered «כבר קיים» before ADR-683; analytic refused in its own conflict sentence before ADR-684' },
  { id: 'radius-restated-sentence-2119', family: 'circles', steps: ['מעגל O ברדיוס 5', 'רדיוס המעגל O הוא 3'], expect: 'refused', exception: 'X8' },
  { id: 'radius-restated-with-point-2119', family: 'circles', steps: ['מעגל O ברדיוס 3', 'A על מעגל O', 'מעגל O ברדיוס 4'], expect: 'refused', exception: 'X8', note: '2-D resized silently and committed green before ADR-683' },
  // ── #2242 (ADR-690): a size stated about «המעגל» sizes the drawn circle ──
  { id: 'definite-circle-area-2242', family: 'circles', steps: ['מעגל O', 'שטח המעגל הוא 9π'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2244' }], note: '2-D drew a second circle P of radius 3 beside O, green, before ADR-690; analytic reads no circle area (not-handled)' },
  // ── #2217 (ADR-691): a fresh pair stated with equal radii is named by use ──
  { id: 'equal-pair-named-by-use-2217', family: 'circles', steps: ['שני מעגלים משיקים ברדיוסים שווים', 'רדיוס מעגל O הוא 5'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D refused input.unknownCircle before ADR-691; analytic does not read the equal-size pair sentence (not-handled)' },

  // ── #2065 (ADR-700): a similarity ratio in words, «ביחס p ל-q», reads as «ביחס p:q» in 2-D ──
  { id: 'similarity-ratio-to-2065', family: 'angles', steps: ['משולש ABC', 'משולש DEF', 'ABC ∽ DEF ביחס של 1 ל-2'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2067' }, { product: '3d', issue: '#2067' }], note: '2-D escalated to the AI before ADR-700; analytic and 3-D read no similarity ratio (#2067)' },

  // ── #2239 (ADR-692): two circles of equal stated radius stated internally tangent are refused, never resized ──
  { id: 'stated-radius-never-changed-2239', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', 'המעגלים O ו-P משיקים מבפנים'], expect: 'refused', exception: 'X8', note: '2-D committed green with P silently resized (the ADR-037 Am. 2 tangent-inner rewrite) before ADR-692; analytic already refused' },

  // ── #2209 (ADR-703): the catalog's named-pair tangency builds on two drawn circles (cat-2d-139 is the empty-figure case) ──
  { id: 'catalog-tangent-drawn-2209', family: 'circles', steps: ['מעגל O', 'מעגל P', 'מעגל O ומעגל P משיקים'], expect: 'builds', exception: 'X8', note: '2-D refused it as two statements (input.scope.split-statements) before ADR-703; analytic already recorded it' },

  // ── #2210 (ADR-704): a defaulted tangency kind yields to a later stated kind or a containment ──
  { id: 'tangent-later-internal-2210', family: 'circles', steps: ['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים', 'המעגלים O ו-P משיקים מבפנים'], expect: 'builds', exception: 'X8', note: '2-D drew it external with the internal row red before ADR-704 (a builds verdict then too; the kind is locked in src/app/__tests__/issue-2210-tangency-record.test.ts); analytic already drew it internal (ADR-AG-167)' },
  { id: 'contained-then-tangent-2210', family: 'circles', steps: ['מעגל O', 'מעגל P', 'מעגל P מוכל בתוך מעגל O', 'המעגלים O ו-P משיקים בנקודה X'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2302' }], note: '2-D drew it external with the containment row red before ADR-704; analytic refuses it unsatisfiable (its containment is strict)' },

  // ── #1855 (ADR-3D-355): two figures that share no point have a free relative size and orientation ──
  { id: 'two-triangle-lengths-1855', family: 'lengths', steps: ['משולש ABC', 'משולש DEF', 'DE = 2', 'AB = 5'], expect: 'builds', note: '3-D refused the second length givens-contradict before ADR-3D-355' },
  { id: 'two-triangle-parallel-1855', family: 'parallel-perpendicular', steps: ['משולש ABC', 'משולש DEF', 'AB ∥ DE'], expect: 'builds', note: '3-D refused claim-refuted before ADR-3D-355' },

  // ── #2097 (ADR-719): «|XY|» is the length XY in every slot — 2-D read it only in the sum, ordering and bound rules ──
  { id: 'abs-length-2097', family: 'lengths', steps: ['משולש ABC', '|AB| = 4'], expect: 'builds', note: '2-D escalated it before ADR-719' },
  { id: 'abs-length-var-2097', family: 'lengths', steps: ['משולש ABC', '|AB| = k'], expect: 'builds', knownGap: [{ product: '3d', issue: '#2092' }], note: '2-D escalated it before ADR-719' },

  // ── #2215 (ADR-723): a chord after a tangent builds in either order; a role noun spreads only over the pairs it governs ──
  { id: 'tangent-then-chord-2215', family: 'circles', steps: ['מעגל O', 'מעגל P', 'AB משיק למעגל P', 'AB מיתר במעגל O'], expect: 'builds', exception: 'X8', note: '2-D refused the chord as a conflict with the tangent before ADR-723 (the reverse order built); analytic already built it' },
  { id: 'diameter-and-chord-2215', family: 'circles', steps: ['מעגל O', 'AB קוטר במעגל O ו-CD מיתר במעגל O'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2323' }], note: '2-D built it with CD drawn as a second diameter before ADR-723 (a builds verdict then too; the drawing is locked in src/parser/__tests__/role-distribution-2215.test.ts); analytic does not read the compound line (not-handled)' },
  // ── #2001 arm 2 (ADR-724): a named touch point on a drawn incircle builds — the vacuity gate reads collapsed terms ──
  { id: 'incircle-named-touch-2001', family: 'circles', steps: ['משולש ABC', 'מעגל חסום במשולש ABC', 'AB משיק למעגל בנקודה D'], expect: 'builds', exception: 'X8', note: '2-D refused it «משהו השתבש…» before ADR-724 (D is the own touch witness of the incircle, read as a collapse); analytic already built it' },

  // ── #2089 (ADR-728): «AE ⟂ CD» about a rider E of CD is the foot statement «AE גובה לצלע CD» — the quadrilateral yields ──
  { id: 'rider-perp-foot-2089', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'E על CD', 'AE ⟂ CD'], expect: 'builds', note: '2-D refused it before ADR-728' },

  // ── #2096 / #2106 (ADR-730): a right-angle vertex then «ו-∠…» is refused with the taught list, never a cut inside the angle ──
  { id: 'unread-vertex-2106', family: 'angles', steps: ['משולש ABC ישר זווית ב-A ו-∠ABC = 30'], expect: 'refused', knownGap: [{ product: '3d', issue: '#2342' }], note: '2-D taught «(1) … ב-A ו-∠  (2) ABC = 30» before ADR-730 (analytic already refused, measured at 688dfb96); the list is locked in src/app/__tests__/issue-2096-split-cut.test.ts' },

  // ── #2234 / #2143 (ADR-737): "right-angled at X" is never a given and never the AI's, in any spelling (ruling 2026-10-18) ──
  { id: 'right-angled-at-definite-2234', family: 'angles', steps: ['משולש ABC', 'המשולש ישר זווית ב-B'], expect: 'refused', knownGap: [{ product: '3d', issue: '#2356' }, { product: 'analytic', issue: '#2357' }], note: '2-D escalated it before ADR-737; 3-D and analytic still hand it to their model' },
  { id: 'right-angled-at-bare-2234', family: 'angles', steps: ['משולש ABC', 'ישר זווית ב-B'], expect: 'refused', knownGap: [{ product: '3d', issue: '#2356' }, { product: 'analytic', issue: '#2357' }], note: '2-D escalated it before ADR-737' },
  { id: 'right-angled-at-english-2234', family: 'angles', steps: ['triangle ABC is right-angled at B'], expect: 'refused', knownGap: [{ product: '3d', issue: '#2356' }, { product: 'analytic', issue: '#2357' }], note: '2-D escalated it before ADR-737 (#2143 asked it be read; reversed 2026-10-18)' },
  { id: 'right-angled-at-english-and-2143', family: 'angles', steps: ['triangle ABC right-angled at B and AB = 4'], expect: 'refused', knownGap: [{ product: '3d', issue: '#2356' }, { product: 'analytic', issue: '#2357' }], note: '2-D gave a fragment list «(1) triangle ABC right-  (2) angled at B …» before ADR-737; now the teach with «(3) AB = 4»' },
  // ── #2195 (ADR-738): an English word is never read as point labels ──
  { id: 'english-words-not-labels-2195', family: 'angles', steps: ['משולש ABC', 'highlight right triangles'], expect: 'not-handled', note: '2-D committed ∠TRI = s («triangles» read as T, R, I) before ADR-738; analytic and 3-D already did not read it' },

  // ── #2177 (ADR-733): the reserved r on a figure with several circles names none of them — refused, never a pick ──
  { id: 'reserved-r-several-circles-2177', family: 'circles', steps: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5', 'r = 4'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2327' }], note: '2-D committed it green and ignored the 4 before ADR-733; analytic does not read it (not-handled)' },

  // #2069 (ADR-3D-369, ADR-W-145): the value readers 2-D already had, and the parallel look-alikes folded at the shared boundary
  { id: 'root-product-2069', family: 'lengths', steps: ['מלבן ABCD', 'AD=2*√7'], expect: 'builds', note: '3-D did not read the explicit product before ADR-3D-369' },
  { id: 'root-product-dot-2069', family: 'lengths', steps: ['מלבן ABCD', 'AD=2·√7'], expect: 'builds', note: '3-D did not read the explicit product before ADR-3D-369' },
  { id: 'area-copula-2069', family: 'area-perimeter', steps: ['משולש ABC', 'שטח המשולש ABC הוא 2√3'], expect: 'builds', note: '3-D read the area only with «=» before ADR-3D-369' },
  { id: 'area-copula-en-2069', family: 'area-perimeter', steps: ['משולש ABC', 'the area of triangle ABC is 6'], expect: 'builds', note: '3-D read the area only with «=» before ADR-3D-369' },
  { id: 'triangle-sign-2069', family: 'polygons', steps: ['△ABC'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2069' }], note: '3-D did not read the sign before ADR-3D-369' },
  { id: 'parallel-u2016-2069', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB ‖ CD'], expect: 'builds', note: 'escalated in 2-D, not understood in 3-D, refused in analytic before ADR-W-145' },
  { id: 'parallel-bars-2069', family: 'parallel-perpendicular', steps: ['מרובע ABCD', 'AB || CD'], expect: 'builds', note: '2-D escalated it before ADR-W-145' },

  // ── #1942 (ADR-3D-367): a role stated about an EXISTING point is a given about it, never a re-creation ──
  { id: 'altitude-on-existing-d-1942', family: 'cevians-centres', steps: ['משולש ABC', 'D על BC', 'AD גובה לצלע BC'], expect: 'builds', note: '3-D refused already-defined D before ADR-3D-367' },
  { id: 'median-then-altitude-1942', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'], expect: 'builds', note: '3-D refused already-defined D before ADR-3D-367' },
  { id: 'median-then-bisector-1942', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון לצלע BC', 'AD חוצה זווית A'], expect: 'builds', note: '3-D asked which angle at A before ADR-3D-367; «זווית A» is the triangle angle, said aloud' },
  { id: 'median-also-altitude-oneline-1942', family: 'cevians-centres', steps: ['משולש ABC', 'AD תיכון לצלע BC שהוא גם גובה'], expect: 'refused', knownGap: [{ product: 'analytic', issue: '#1905' }], note: 'guided: 2-D and 3-D teach the two lines (3-D gave the parts list before ADR-3D-367); analytic as role-clause-1904-02' },

  // ── #1946 + #2103 (ADR-731, ADR-3D-366): a ⟂ at a NAMED foot / crossing draws one knee at rest, in the corner the statement names ──
  { id: 'perp-knee-named-foot-1946', family: 'parallel-perpendicular', steps: ['משולש ABC', 'D על BC', 'AD ⟂ BC'], expect: 'builds', note: 'the knee at D (∠ADC) is locked per tool in issue-1946-knee-at-named-foot.test.ts (2-D and 3-D)' },
  { id: 'knee-named-crossing-2103', family: 'parallel-perpendicular', steps: ['ריבוע ABCD', 'O נקודת חיתוך האלכסונים', 'AC ⟂ BD'], expect: 'builds', note: 'the knee at O (∠COD) is locked per tool in issue-1946-knee-at-named-foot.test.ts (2-D and 3-D)' },

  // ── #2385 (ADR-AG-312): a common tangent through the circles' stated touch point is the tangent at it ──
  { id: 'common-tangent-through-touch-2385', family: 'tangents', steps: ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T', 'T על AB', 'AB משיק משותף למעגלים M ו-N'], expect: 'builds', exception: 'X8', note: '2-D builds it since ADR-740 (#2407); analytic since ADR-AG-312 (#2385)' },

  // ── #2418 (ADR-AG-321): the common tangent reads a LATER line that pins it to the touch point; the pair's only tangent ──
  { id: 'common-tangent-later-pin-2418', family: 'tangents', steps: ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T', 'AB משיק משותף למעגלים M ו-N', 'T על AB'], expect: 'builds', exception: 'X8', note: 'the reverse order of #2385; 2-D builds it since ADR-752 (#2430, the fold re-decides AB as the tangent at T), analytic since ADR-AG-321' },
  { id: 'common-tangent-internal-touch-alone-2418', family: 'tangents', steps: ['מעגל O', 'מעגל K', 'מעגל O ומעגל K משיקים מבפנים בנקודה T', 'AB משיק משותף למעגלים O ו-K'], expect: 'builds', exception: 'X8', note: '2-D draws tan-T (ADR-740); analytic did not before ADR-AG-321' },

  // ── #2397 (ADR-AG-322): two circles introduced before they are described — the pair a tangency sentence draws ──
  { id: 'pair-tangent-first-2397', family: 'circles', steps: ['נתונים שני מעגלים המשיקים זה לזה מבחוץ'], expect: 'builds', exception: 'X8', note: 'analytic refused it on an empty canvas before ADR-AG-322' },
  { id: 'pair-tangent-internal-first-2397', family: 'circles', steps: ['שני מעגלים משיקים מבפנים'], expect: 'builds', exception: 'X8', note: 'analytic refused it on an empty canvas before ADR-AG-322' },
  { id: 'the-circles-tangent-empty-2397', family: 'circles', steps: ['המעגלים משיקים מבחוץ'], expect: 'builds', exception: 'X8', note: 'analytic refused it on an empty canvas before ADR-AG-322' },
  { id: 'pair-tangent-named-by-order-2397', family: 'circles', steps: ['שני מעגלים משיקים מבחוץ', 'O מרכז המעגל', 'P מרכז המעגל'], expect: 'builds', exception: 'X8', note: 'a tangent pair is named by order (the #1688 ruling); analytic asked which before ADR-AG-322' },
  { id: 'pair-internal-asks-2397', family: 'circles', steps: ['שני מעגלים משיקים מבפנים', 'O מרכז המעגל'], expect: 'asks', exception: 'X8', note: 'circles touching from inside are told apart (one inside the other): both builders ask which' },

  // ── #2390 (ADR-AG-314): every common tangent in one sentence; the tangent at the touching circles' common point ──
  { id: 'all-common-tangents-2390', family: 'tangents', steps: ['שני מעגלים זרים', 'כל המשיקים המשותפים לשני המעגלים'], expect: 'builds', exception: 'X8', note: 'the counts agree since ADR-751 (#2405): both draw the four; the names differ by design (2-D touch letters AB, CD, EF, GH; analytic l1…)' },
  // ── #2405 (ADR-751): 2-D draws the whole set by the pair's stated position; an unstated position asks ──
  { id: 'all-common-tangents-crossing-2405', family: 'tangents', steps: ['שני מעגלים נחתכים', 'כל המשיקים המשותפים לשני המעגלים'], expect: 'builds', exception: 'X8', note: '2-D draws the two external tangents (ADR-751); before, one' },
  { id: 'all-common-tangents-ext-touch-2405', family: 'tangents', steps: ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T', 'כל המשיקים המשותפים לשני המעגלים'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2448' }], note: '2-D draws the two external tangents and the tangent at T (ADR-751); before, one; analytic does not read it on a touching pair' },
  { id: 'all-common-tangents-unstated-2405', family: 'tangents', steps: ['שני מעגלים', 'כל המשיקים המשותפים לשני המעגלים'], expect: 'asks', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2442' }], note: '2-D asks which position (input.ambiguousConstruct, the P1 interim answer of ADR-751); analytic does not read it; the permanent answer for both is #2442' },
  { id: 'touch-tangent-2390', family: 'tangents', steps: ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T', 'המשיק המשותף בנקודת ההשקה'], expect: 'builds', exception: 'X8', note: 'analytic did not read it before ADR-AG-314' },
  { id: 'touch-tangent-through-2390', family: 'tangents', steps: ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T', 'המשיק העובר בנקודה המשותפת לשני המעגלים'], expect: 'builds', exception: 'X8', note: 'the verdicts agree; 2-D draws a two-touch tangent there, not the tangent at T (found work); analytic did not read it before ADR-AG-314' },

  // ── #2392 (ADR-AG-313): the common tangent named by its line, a line named after, the axis side of a crossing — analytic's ──
  { id: 'named-common-tangent-2392', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'הישר l משיק למעגלים O ו-P בנקודות A ו-B בהתאמה'], expect: 'builds', exception: 'X4', only: ['analytic'], note: '2-D names no line (X4); analytic did not read it before ADR-AG-313' },
  { id: 'name-line-2392', family: 'topic', steps: ['נקודה A', 'נקודה B', 'AB', 'נסמן את הישר AB ב-l'], expect: 'builds', exception: 'X4', only: ['analytic'], note: 'analytic did not read it before ADR-AG-313' },
  { id: 'axis-cut-2392', family: 'topic', steps: ['נקודה A', 'נקודה B', 'הישר AB', 'הישר AB חותך את ציר ה-y בנקודה הנמצאת מעל ציר ה-x'], expect: 'builds', exception: 'X1', only: ['analytic'], note: 'the axis side of a crossing, no point made; analytic did not read it before ADR-AG-313' },

  // ── #2388 (ADR-AG-307): a relation between the radius letters, and the ratio of two circles' radii ──
  { id: 'radius-relation-2388', family: 'circles', steps: ['נתון מעגל M שרדיוסו r', 'נתון מעגל N שרדיוסו R', 'R = 2r'], contextFor: { '2d': ['מעגל M ברדיוס r', 'מעגל N ברדיוס R'] }, expect: 'builds', exception: 'X8', note: '2-D reads it too (measured on the #2414 tip)' },
  { id: 'radius-ratio-colon-2388', family: 'circles', steps: ['נתון מעגל M שרדיוסו r', 'נתון מעגל N שרדיוסו R', 'r:R = 1:2'], contextFor: { '2d': ['מעגל M ברדיוס r', 'מעגל N ברדיוס R'] }, expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#2421' }] },
  { id: 'radius-ratio-words-2388', family: 'circles', steps: ['נתון מעגל M שרדיוסו r', 'נתון מעגל N שרדיוסו R', 'היחס בין R ל-r הוא 2:1'], contextFor: { '2d': ['מעגל M ברדיוס r', 'מעגל N ברדיוס R'] }, expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#2421' }] },
  { id: 'radius-ratio-unnamed-2388', family: 'circles', steps: ['נתון מעגל שמרכזו M(0,0) ורדיוסו r', 'נתון מעגל שמרכזו N(9,0) ורדיוסו R', 'היחס בין אורכי הרדיוסים של המעגלים הוא 1:2'], contextFor: { '2d': ['מעגל M', 'מעגל N'] }, expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#2421' }], note: '2-D asks which circle (ambiguous-circle-ref)' },

  // ── #2391 (ADR-AG-315): the exam's own two-circle and centre sentences, each read as its canonical twin ──
  { id: 'satisfies-2391', family: 'lengths', steps: ['נקודה A', 'נקודה B', 'M מקיימת MA = MB'], contextFor: { '3d': ['A(0,0,0)', 'B(4,0,0)'] }, expect: 'builds', knownGap: [{ product: '2d', issue: '#2415' }, { product: '3d', issue: '#2420' }], note: 'analytic did not read «מקיימת» before ADR-AG-315; 2-D escalates it to the model' },
  { id: 'underscore-index-2391', family: 'points-incidence', steps: ['נקודה N_2'], expect: 'builds', knownGap: [{ product: '3d', issue: '#2420' }], note: 'analytic did not read `N_2` before ADR-AG-315 (it is `N₂` there; 2-D reads it as `N2`)' },
  { id: 'two-tangents-meet-2391', family: 'tangents', steps: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', 'שני המשיקים נחתכים בנקודה D'], expect: 'builds', exception: 'X8' },
  { id: 'centres-distance-2391', family: 'circles', steps: ['מעגל M ברדיוס 3', 'מעגל N ברדיוס 6', 'המרחק בין מרכזי המעגלים הוא 9'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#2415' }], note: '2-D asks which circle (input.ambiguousCircleRef)' },
  { id: 'centres-segment-2391', family: 'circles', steps: ['מעגל M ברדיוס 3', 'מעגל N ברדיוס 6', 'אורכו של הקטע המחבר את מרכזי המעגלים הוא 9'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#2415' }], note: '2-D asks which circle (input.ambiguousCircleRef)' },
  { id: 'given-pair-tangent-2391', family: 'circles', steps: ['מעגל M ברדיוס 3', 'מעגל N ברדיוס 6', 'נתונים שני מעגלים המשיקים זה לזה מבחוץ'], expect: 'builds', exception: 'X8' },
  { id: 'named-pair-distributed-2391', family: 'circles', steps: ['מעגל M ברדיוס 5', 'שני מעגלים שמרכזיהם בנקודות N₁ ו-N₂ והרדיוס של כל אחד מהם הוא 10, משיקים למעגל M בנקודה A'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#2415' }], note: '2-D escalates it to the model' },
  { id: 'diameter-construct-2391', family: 'circles', steps: ['מעגל M', 'N₂A הוא קוטר המעגל M'], expect: 'builds', exception: 'X8' },
  { id: 'centre-after-circle-2391', family: 'circles', steps: ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'מרכז המעגל I הוא K'], expect: 'builds', exception: 'X8', only: ['analytic'], note: 'a numeral circle is named by its equation (#1257), so only analytic can state the context' },
  { id: 'centres-respectively-2391', family: 'circles', steps: ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1', 'K ו-L מרכזי המעגלים I ו-II בהתאמה'], expect: 'builds', exception: 'X8', only: ['analytic'], note: 'as centre-after-circle-2391' },
  // ── #2427 (ADR-AG-325): a capital letter as a size — analytic refuses it with the lowercase lesson; "only R" is analytic's ──
  { id: 'capital-radius-2427', family: 'circles', steps: ['נתון מעגל O שרדיוסו K'], expect: 'builds', exception: 'X11', only: ['2d'], note: 'the T38 line (#2414); 2-D reads K as its radius symbol' },
  { id: 'capital-radius-centre-2427', family: 'circles', steps: ['מעגל שמרכזו O ורדיוסו K'], expect: 'builds', exception: 'X11', only: ['2d'] },
  { id: 'capital-length-2427', family: 'lengths', steps: ['משולש ABC', 'AB = K'], expect: 'not-handled', exception: 'X11', note: '2-D and 3-D hand it to the model; analytic refuses it, teaching «AB = k» (#2427)' },

  // ── #2362 (ADR-748): the tool's centre letter of a circle drawn through drawn points is not the student's «O» ──
  // ── #2398 (ADR-747): a circle's centre given a second letter is refused in both builders ──
  { id: 'second-centre-letter-2398', family: 'circles', steps: ['מרכז המעגל O הוא K'], expect: 'asks', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2449' }], note: '2-D answers errors.unknownCircle as a clarify note (asks); analytic refuses unknown-reference O' },
  { id: 'second-centre-letter-drawn-2398', family: 'circles', steps: ['מעגל O', 'מרכז המעגל O הוא K'], expect: 'asks', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2449' }], note: '2-D names the holder (input.centreAlreadyNamed, a clarify note: asks); analytic refuses with unknown-reference O — the port is #2449' },
  // The report's last line («F אמצע הקשת BC במעגל O») cannot be a row for analytic while the gap sits in its context: analytic
  // records it on a figure that lost the second circle, so the row would pass vacuously. The gap row ends where analytic differs;
  // 2-D's last line is locked by the fixture src/__tests__/fixtures/arc-on-minted-circle-name-2362.geo.json.
  { id: 'second-unnamed-circumcircle-2362', family: 'circles', steps: ['משולש CDE', 'A על CD', 'B על CE', 'מרובע ABED חסום במעגל', 'משולש ABC חסום במעגל'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2376' }], note: 'analytic refuses «משולש ABC חסום במעגל» third-crossing (line CD meets ONE circle at C, D and A: it reads the second unnamed circle as the first); measured at 37800b85, 8a5372be and the round tip' },
  // ── #2211 + #2219 (ADR-744): a relation stated to a LIST of objects holds for each — the distributor's object-list shape ──
  { id: 'circle-tangent-to-two-circles-2211', family: 'circles', steps: ['מעגל O', 'מעגל P', 'מעגל Q', 'מעגל Q משיק למעגל O ולמעגל P'], expect: 'builds', exception: 'X8', note: '2-D committed Q tangent to O with P dropped before ADR-744 (then escalated after ADR-735); analytic already distributes it' },
  { id: 'circle-tangent-to-pair-2211', family: 'circles', steps: ['מעגל O', 'מעגל P', 'מעגל Q', 'מעגל Q משיק למעגלים O ו-P'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: '2-D drew O and P tangent with Q dropped before ADR-735; analytic answers not-handled' },
  { id: 'pair-tangent-to-circle-2211', family: 'circles', steps: ['מעגל O', 'מעגל P', 'מעגל Q', 'המעגלים O ו-P משיקים למעגל Q'], expect: 'not-handled', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2190' }], note: 'the pair-subject form is not read in 2-D (it named [O, P] and dropped Q before ADR-735); analytic reads it, Q tangent to both' },
  { id: 'perpendicular-to-two-2219', family: 'parallel-perpendicular', steps: ['משולש ABC', 'D אמצע AB', 'E אמצע AC', 'F אמצע BC', 'AF מאונך ל-BC ול-DE'], expect: 'builds', knownGap: [{ product: 'analytic', issue: '#2223' }, { product: '3d', issue: '#2223' }], note: '2-D escalated it before ADR-744; analytic refuses it bad-operand, 3-D not-understood' },
  { id: 'parallel-to-two-conflict-2219', family: 'parallel-perpendicular', steps: ['משולש ABC', 'D אמצע AB', 'E אמצע AC', 'F אמצע BC', 'DE מקביל ל-BC ול-AB'], expect: 'refused', knownGap: [{ product: '3d', issue: '#2223' }], note: '2-D escalated it before ADR-744 (and drew «…ו-AB» green with AB a plain segment); analytic refuses it; 3-D does not read it' },
  // ── #2355 (ADR-753): an inscribed rigid 3-/4-gon states its noun's shape over existing vertices ──
  { id: 'square-inscribed-existing-2355', family: 'inscribed', steps: ['מרובע ABCD', 'ריבוע ABCD חסום במעגל'], expect: 'builds', note: 'a square in all three builders; 2-D drew a non-square green before ADR-753 (the figure is locked in src/app/__tests__/issue-2355-inscribed-shape-stated.test.ts)' },
  // ── #2477 (ADR-761): a diameter stated about «המעגל» is drawn on the drawn circle, and beside two it asks which ──
  { id: 'diameter-of-the-circle-2477', family: 'chords-arcs', steps: ['מעגל O', 'AB הוא קוטר של המעגל'], expect: 'builds', exception: 'X8', note: '2-D drew a second circle P on AB beside O, green, before ADR-761; analytic already drew AB on O' },
  { id: 'diameter-of-the-circle-two-asks-2477', family: 'chords-arcs', steps: ['מעגל O', 'מעגל P', 'AB הוא קוטר של המעגל'], expect: 'asks', exception: 'X8', note: '2-D drew a third circle M, green, before ADR-761; analytic already asked' },
  // ── #2257 (ADR-767): an inscription whose inner shape is already drawn moves THAT shape into the container ──
  { id: 'inscribe-existing-square-named-2257', family: 'inscribed', steps: ['ריבוע ABCD', 'משולש EFG', 'הריבוע ABCD חסום במשולש EFG'], expect: 'builds', exception: 'X8', note: '2-D refused «would be flat» before ADR-767; analytic already put A–D on the sides' },
  { id: 'inscribe-existing-square-definite-2257', family: 'inscribed', steps: ['ריבוע ABCD', 'משולש EFG', 'הריבוע חסום במשולש EFG'], expect: 'builds', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2509' }], note: '2-D drew a second square HIJK, green, before ADR-767; analytic does not read the unnamed inscription (not-handled)' },
  // ── #2532 (ADR-765): an incidence clause the reading never read refuses the line whole (FR-IN-4g); analytic refuses it the same (ADR-AG-334, #2547) ──
  { id: 'chord-through-centre-2532-01', family: 'chords-arcs', steps: ['מעגל O', 'AB מיתר העובר דרך מרכז המעגל'], expect: 'refused', exception: 'X8', note: '2-D drew an ordinary chord with O off AB, green, before ADR-765; analytic handed it to the model before ADR-AG-334 (#2547) and now refuses it with 2-D’s parts; the read is #2541' },
  { id: 'chord-through-centre-2547-02', family: 'chords-arcs', steps: ['מעגל O', 'AB מיתר במעגל העובר דרך מרכזו'], expect: 'refused', exception: 'X8', note: 'the pronoun «מרכזו»: 2-D refuses it (ADR-765); analytic handed it to the model before ADR-AG-334 (#2547)' },
  { id: 'chord-through-centre-2547-03', family: 'chords-arcs', steps: ['מעגל O', 'AB קוטר העובר דרך מרכז המעגל'], expect: 'refused', exception: 'X8', note: 'true but unread: refused in both (ADR-765, ADR-603 decision 7 "refuse it too"); analytic handed it to the model before ADR-AG-334 (#2547)' },
  { id: 'chord-through-centre-2532-03', family: 'chords-arcs', steps: ['מעגל O', 'AB מיתר', 'O על AB'], expect: 'builds', exception: 'X8', note: 'the honest two-line form of chord-through-centre-2532-01: O on AB at every seed in both builders (the English spellings are locked in src/app/__tests__/issue-2532-unread-through.test.ts: X8 is matched in Hebrew)' },
  { id: 'square-inscribed-reentry-2355', family: 'inscribed', steps: ['מרובע ABCD חסום במעגל', 'ריבוע ABCD חסום במעגל'], expect: 'builds', knownGap: [{ product: '3d', issue: '#2451' }], note: '2-D answered «כבר קיים» before ADR-753 and now draws the square; analytic builds it; 3-D refuses it already-defined' },
  // ── #2499 (ADR-766): a membership after a distance that already pins its point sizes the free radius, in either order ──
  { id: 'diameter-after-distance-2499', family: 'chords-arcs', steps: ['מעגל O', 'AB = 6', 'AB קוטר של המעגל'], expect: 'builds', exception: 'X8', note: '2-D refused «… סותר את «AB = 6»» before ADR-766 (the other order built r = 3); analytic already drew r = 3' },
  { id: 'point-on-circle-after-distance-2499', family: 'chords-arcs', steps: ['מעגל O', 'OA = 4', 'נקודה A על המעגל'], expect: 'builds', exception: 'X8', note: '2-D refused «… סותר את «OA = 4»» before ADR-766; analytic already drew r = 4' },
  { id: 'quarter-after-radius-distance-2499', family: 'chords-arcs', steps: ['OA = 4', 'רבע מעגל OAB'], expect: 'builds', exception: 'X8', note: '2-D drew the quarter around B with a re-read hint before ADR-766; analytic already drew it around O, r = 4' },
  // ── #2512 (ADR-762 / ADR-AG-333): a second triangle around one circle is its own triangle ──
  { id: 'second-ring-around-circle-2512', family: 'inscribed', steps: ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O'], expect: 'builds', exception: 'X8', note: '2-D drew DEF exactly on ABC, green, before ADR-762; analytic refused it «polygon-collapsed» before ADR-AG-333' },
  // ── #2545 (ADR-768 / ADR-AG-335): a circle named by its relation to a polygon binds the described circle, or the line is refused ──
  { id: 'ring-circle-ref-2545-01', family: 'chords-arcs', steps: ['משולש ABC', 'DE מיתר במעגל החוסם'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2560' }], note: '2-D drew a free circle missing A, B, C, green, before ADR-768; analytic answers not-handled (the model, R124) — whether the circle is created is #2560' },
  { id: 'ring-circle-ref-2545-02', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל O חוסם את משולש ABC', 'DE מיתר במעגל החוסם'], expect: 'builds', exception: 'X8', note: 'D, E on the circumcircle in both builders; analytic answered not-handled before ADR-AG-335' },
  { id: 'ring-circle-ref-2545-03', family: 'chords-arcs', steps: ['משולש ABC', 'מעגל I חסום במשולש ABC', 'DE מיתר במעגל החוסם'], expect: 'refused', exception: 'X8', knownGap: [{ product: 'analytic', issue: '#2560' }], note: '2-D put D, E on the INCIRCLE, green, before ADR-768; analytic answers not-handled (the model)' },
  // ── #2553 (ADR-AG-337): the common tangent the sentence does not letter, its kind written as its definition, its touch point named ──
  { id: 'unnamed-common-tangent-2553', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'משיק חיצוני משותף לשני המעגלים'], expect: 'builds', exception: 'X8', note: 'both letter the touches A, B; analytic handed it to the model before ADR-AG-337' },
  { id: 'unnamed-common-tangent-named-circles-2553', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'משיק משותף חיצוני למעגלים O ו-P'], expect: 'builds', exception: 'X8', note: 'analytic handed it to the model before ADR-AG-337' },
  { id: 'tangent-same-side-2553', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'משיק משותף ששני המעגלים נמצאים באותו צד שלו'], expect: 'builds', exception: 'X8', note: 'the exam’s definition of «חיצוני» (foldTangentSide, one copy per builder); both builders handed it to the model before ADR-AG-337' },
  { id: 'tangent-opposite-sides-2553', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'משיק משותף ששני המעגלים נמצאים מצדדים שונים שלו'], expect: 'builds', exception: 'X8', note: '«פנימי» by its definition; both handed it to the model before ADR-AG-337' },
  { id: 'line-named-common-tangent-2553', family: 'tangents', steps: ['מעגל O', 'מעגל P', 'הישר l משיק משותף חיצוני לשני המעגלים'], expect: 'builds', exception: 'X4', only: ['analytic'], note: '2-D names no line (X4); analytic handed it to the model before ADR-AG-337' },
  { id: 'touch-point-noun-2553', family: 'tangents', steps: ['נתון מעגל שמרכזו O(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו P(10,0) ורדיוסו 3', 'כל המשיקים המשותפים לשני המעגלים', 'A נקודת ההשקה של l1 עם מעגל O'], contextFor: { '2d': ['מעגל O', 'מעגל P'] }, expect: 'builds', exception: 'X4', only: ['analytic'], note: 'the inverse of «הישר l1 משיק למעגל O בנקודה A»; 2-D names no line (X4) and letters every touch it draws; analytic handed it to the model before ADR-AG-337' },
  // ── #2552 (ADR-AG-336): the exam’s two pair sentences (operator ruling D8 = B: these two only) ──
  { id: 'pair-each-radius-2552', family: 'circles', steps: ['נתונים שני מעגלים שרדיוס כל אחד מהם 5'], expect: 'builds', exception: 'X8', knownGap: [{ product: '2d', issue: '#2216' }], note: 'analytic draws two radius-5 circles since ADR-AG-336; 2-D hands it to the model (#2216 item 2)' },
  { id: 'pair-first-centre-2552', family: 'circles', steps: ['נתונים שני מעגלים שרדיוס כל אחד מהם 5', 'מרכז המעגל הראשון הוא O_1(-3,1)'], contextFor: { '2d': ['שני מעגלים'] }, expect: 'builds', exception: 'X1', only: ['analytic'], note: 'a coordinate centre: analytic’s; not-handled before ADR-AG-336' },
  { id: 'pair-centres-joined-2552', family: 'circles', steps: ['נתונים שני מעגלים שרדיוס כל אחד מהם 5', 'מרכז המעגל הראשון הוא O1(−3, 1) ומרכז המעגל השני הוא O2(9, 10)'], contextFor: { '2d': ['שני מעגלים'] }, expect: 'builds', exception: 'X1', only: ['analytic'], note: 'the exam’s joined sentence, cut before «ומרכז»; not-handled before ADR-AG-336' },
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
