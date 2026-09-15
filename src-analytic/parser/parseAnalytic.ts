/**
 * The deterministic bilingual parser — `utterance → Fact[]`.
 *
 * Slice A of the docs/19 §10 language: **F1** (point by coordinates), **F3** (line by equation),
 * **F5** (circle by equation), **F6** (conic by equation) and **F11** (parameter declaration). The
 * governing principle (ADR-AG-005 D8) is that **the student types the exam's own sentence** —
 * every form below occurs in the corpus, so the rules admit the exam's phrasing rather than a
 * command language invented for the parser's convenience.
 *
 * Two traps are inherited rather than rediscovered, both from `src3d`:
 *
 *  - **`ℓ` is not a `\w` character.** A `\b` after a line name silently fails, so line names are
 *    matched with explicit character classes and lookaheads, never word boundaries.
 *  - **A Hebrew keyword gate must admit every spelling AND the optional prefixes** — the definite
 *    article (`ה?מעגל`) and the subject noun (`הנקודה A` ≡ `נקודה A` ≡ `A`). A gate that admits
 *    one spelling is a silent drop, which is the single most productive bug class in the 3-D tree.
 *
 * Unmatched input returns `not-handled`, which is the seam where the LLM fallback escalates.
 */
import type { DerivedRule } from '../engine/derived';
import type { Constraint } from '../engine/solve';
import { parseExpr, normalizeMath, symbolsOf, type Expr } from '../engine/expr';
import { RESERVED_SYMBOLS } from '../engine/carriers';
import { UNBOUNDED, type CurveKind, type Domain, type Fact, type Id } from '../engine/types';

export type ParseFailure =
  /** No rule matched — the LLM-escalation seam. */
  | { code: 'not-handled'; detail: string }
  /** A rule matched but the equation would not parse. */
  | { code: 'bad-equation'; detail: string }
  /** Understood, and deliberately outside the product's scope. */
  | { code: 'out-of-scope'; detail: string };

export type ParseResult = { ok: true; facts: Fact[] } | ({ ok: false } & ParseFailure);

// ---------------------------------------------------------------------------
// Shared tokens — spelled ONCE (the 3-D lesson: a noun gate re-spelled inline drifts)
// ---------------------------------------------------------------------------

/**
 * «נתון» / «נתונה» / «נתונים» / «נתונות», optional.
 *
 * The masculine singular ends in FINAL NUN (ן, U+05DF) and every other form in MEDIAL nun
 * (נ, U+05E0) — so `נתונ(?:ה|ים|ות)?` matches three of the four and silently drops «נתון», which
 * is the commonest of them. This is the `מאונ[ךכ]` class from `src3d` ([src3d/CLAUDE.md] recurring
 * traps) reappearing on a different letter: a Hebrew gate that admits one spelling is a silent
 * drop, and the alternation must be written out.
 */
const HE_GIVEN = '(?:נתו(?:ן|נה|נים|נות)\\s+)?';
/** «הנקודה» / «נקודה» / «הנקודות» / «נקודות», optional — the subject noun. */
const HE_POINT = '(?:ה?נקוד(?:ה|ות)\\s+)?';
/** «הישר» / «ישר». */
const HE_LINE = 'ה?ישר';
/** «המעגל» / «מעגל». */
const HE_CIRCLE = 'ה?מעגל';
/** «שמשוואתו» / «שמשוואתה» / «משוואת» / «שמשוואת» — the "whose equation is" connector. */
const HE_EQ_OF = '(?:ש?משוואת(?:ו|ה)?)';
/** «הוא» / «היא» / «הם» / «הן» — the copula, optional. */
const HE_IS = '(?:\\s*(?:הוא|היא|הם|הן))?';

/** A point/vertex name: a capital letter with an optional digit subscript (`F1`, `D2`). */
const NAME = '[A-Z][0-9]?';
/** A line name: `ℓ`, `ℓ1`, `l`, `l1`, or a two-point run like `AC`. */
const LINE_NAME = '(?:[ℓl][0-9]?|[A-Z][0-9]?[A-Z][0-9]?)';

const trim = (s: string) => s.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Equations
// ---------------------------------------------------------------------------

/**
 * `lhs = rhs` → the residual expression `lhs − rhs`, whose zero set IS the curve. Returns null on
 * anything that is not a single well-formed equation — never a partial reading.
 */
export function equationExpr(src: string): Expr | null {
  const parts = normalizeMath(src).split('=');
  if (parts.length !== 2) return null;
  const a = parseExpr(parts[0]);
  const b = parseExpr(parts[1]);
  if (!a || !b) return null;
  return { kind: 'sub', a, b };
}

// ---------------------------------------------------------------------------
// F11 — parameter declaration (D7 kind 1: a DOMAIN, not a constraint)
// ---------------------------------------------------------------------------

const HE_POSITIVE = /חיובי/;
const HE_NEGATIVE = /שלילי/;
const HE_NONZERO = /שונה\s+מ-?\s*אפס|שונה\s+מ-?\s*0/;
const HE_LESS = /קטן\s+מ-?\s*(-?[0-9.]+)/;
const HE_GREATER = /גדול\s+מ-?\s*(-?[0-9.]+)/;

function parseParamHe(line: string): Fact | null {
  // «a הוא פרמטר חיובי» · «t הוא פרמטר קטן מ-9» · «a הוא פרמטר שונה מאפס» · «a הוא פרמטר»
  const m = line.match(new RegExp(`^([a-zA-Z])${HE_IS}\\s*פרמטר(.*)$`));
  if (!m) return null;
  const sym = m[1];
  const rest = m[2] ?? '';
  const domain: Domain = { ...UNBOUNDED };
  if (HE_POSITIVE.test(rest)) {
    domain.min = 0;
    domain.minOpen = true;
  }
  if (HE_NEGATIVE.test(rest)) {
    domain.max = 0;
    domain.maxOpen = true;
  }
  if (HE_NONZERO.test(rest)) domain.exclude = [0];
  const less = rest.match(HE_LESS);
  if (less) {
    domain.max = Number(less[1]);
    domain.maxOpen = true;
  }
  const greater = rest.match(HE_GREATER);
  if (greater) {
    domain.min = Number(greater[1]);
    domain.minOpen = true;
  }
  return { t: 'param', sym, domain, src: line };
}

function parseParamEn(line: string): Fact | null {
  const m = line.match(/^([a-zA-Z])\s+is\s+a\s+(positive\s+|negative\s+|nonzero\s+)?parameter(.*)$/i);
  if (!m) return null;
  const sym = m[1];
  const flag = (m[2] ?? '').toLowerCase();
  const rest = (m[3] ?? '').toLowerCase();
  const domain: Domain = { ...UNBOUNDED };
  if (flag.startsWith('positive')) {
    domain.min = 0;
    domain.minOpen = true;
  }
  if (flag.startsWith('negative')) {
    domain.max = 0;
    domain.maxOpen = true;
  }
  if (flag.startsWith('nonzero')) domain.exclude = [0];
  const less = rest.match(/less\s+than\s+(-?[0-9.]+)/);
  if (less) {
    domain.max = Number(less[1]);
    domain.maxOpen = true;
  }
  const greater = rest.match(/greater\s+than\s+(-?[0-9.]+)/);
  if (greater) {
    domain.min = Number(greater[1]);
    domain.minOpen = true;
  }
  return { t: 'param', sym, domain, src: line };
}

/** A bare inequality chain: `0 < k < 6`, `a > 0`, `t < 9`, `a ≠ 0`. Language-neutral. */
function parseInequality(line: string): Fact | null {
  const s = normalizeMath(line).replace(/≠/g, '!=').replace(/≤/g, '<=').replace(/≥/g, '>=');
  const ne = s.match(/^([a-zA-Z])\s*!=\s*(-?[0-9.]+)$/);
  if (ne) return { t: 'param', sym: ne[1], domain: { exclude: [Number(ne[2])] }, src: line };

  const chain = s.match(/^(-?[0-9.]+)\s*(<=?)\s*([a-zA-Z])\s*(<=?)\s*(-?[0-9.]+)$/);
  if (chain) {
    return {
      t: 'param',
      sym: chain[3],
      domain: {
        min: Number(chain[1]),
        minOpen: chain[2] === '<',
        max: Number(chain[5]),
        maxOpen: chain[4] === '<',
      },
      src: line,
    };
  }
  const one = s.match(/^([a-zA-Z])\s*(<=?|>=?)\s*(-?[0-9.]+)$/);
  if (one) {
    const v = Number(one[3]);
    const open = one[2] === '<' || one[2] === '>';
    const domain: Domain = one[2].startsWith('<')
      ? { max: v, maxOpen: open }
      : { min: v, minOpen: open };
    return { t: 'param', sym: one[1], domain, src: line };
  }
  return null;
}

// ---------------------------------------------------------------------------
// F1 — points
// ---------------------------------------------------------------------------

/** `A(2,6)`, `B(-9a, 0)`, `F1(0, 3)` — one or more, comma-separated. */
function parsePoints(line: string): Fact[] | null {
  const body = line
    .replace(new RegExp(`^${HE_GIVEN}${HE_POINT}`), '')
    .replace(/^points?\s+/i, '')
    .trim();
  const re = new RegExp(`(${NAME})\\s*\\(([^()]*)\\)`, 'g');
  const facts: Fact[] = [];
  let seen = 0;
  let m: RegExpExecArray | null;
  let consumed = '';
  while ((m = re.exec(body)) !== null) {
    seen += 1;
    const id = m[1];
    const inside = m[2].split(',');
    if (inside.length !== 2) return null;
    const x = parseExpr(inside[0]);
    const y = parseExpr(inside[1]);
    if (!x || !y) return null;
    facts.push({ t: 'point', id, x, y, src: line });
    consumed += m[0];
  }
  if (seen === 0) return null;
  // Everything outside the matched point runs must be separators only — otherwise the line said
  // something more than "here are points", and half-understanding it would drop a given.
  const leftover = body.replace(new RegExp(`(${NAME})\\s*\\(([^()]*)\\)`, 'g'), '').replace(/[, ו-]/g, '');
  if (leftover.length > 0) return null;
  return facts;
}

// ---------------------------------------------------------------------------
// F3/F5/F6 — curves by equation
// ---------------------------------------------------------------------------

interface CurveHit {
  id: Id;
  name: string;
  kind: CurveKind;
  eqSrc: string;
}

/**
 * The circle numeral. Written as an explicit alternation and matched CASE-SENSITIVELY with a
 * following separator, because neither shortcut survives contact with the corpus: a case-insensitive
 * `[IVX]{1,3}` reads the `x` of «the circle x²+y²−2ax−2x=0» as a Roman numeral and swallows it, and a
 * class that admits `X` while the validator does not silently turns a numeral into an anonymous id.
 */
const ROMAN_RUN = '(?:(I|II|III|IV|V)(?=[\\s:]))?';

function matchCurve(line: string): CurveHit | null {
  // --- line: «נתון הישר ℓ1: 4y-3x-20=0» · «משוואת הישר AC היא y=-2x+8» · «הישר x=-4» ---
  const heLineNamed = line.match(
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?${HE_LINE}\\s+(${LINE_NAME})${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heLineNamed) {
    return { id: `line-${heLineNamed[1]}`, name: heLineNamed[1], kind: 'line', eqSrc: heLineNamed[2] };
  }
  const heLineBare = line.match(new RegExp(`^${HE_GIVEN}${HE_LINE}\\s+(.+=.+)$`));
  if (heLineBare) {
    return { id: `curve-${anonIndex(heLineBare[1])}`, name: '', kind: 'line', eqSrc: heLineBare[1] };
  }
  const enLine = line.match(new RegExp(`^(?:the\\s+)?line\\s+(${LINE_NAME})\\s*:?\\s*(?:is\\s+)?(.+)$`, 'i'));
  if (enLine) return { id: `line-${enLine[1]}`, name: enLine[1], kind: 'line', eqSrc: enLine[2] };
  const enLineBare = line.match(/^(?:the\s+)?line\s+(.+=.+)$/i);
  if (enLineBare) {
    return { id: `curve-${anonIndex(enLineBare[1])}`, name: '', kind: 'line', eqSrc: enLineBare[1] };
  }

  // --- circle: «נתון מעגל I שמשוואתו …» · «משוואת המעגל …» ---
  const heCircle = line.match(
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?${HE_CIRCLE}\\s*${ROMAN_RUN}\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heCircle) {
    const roman = heCircle[1] ?? '';
    return {
      id: roman ? `circle-${roman}` : `curve-${anonIndex(heCircle[2])}`,
      name: roman ? `מעגל ${roman}` : '',
      kind: 'circle',
      eqSrc: heCircle[2],
    };
  }
  const enCircle = line.match(new RegExp(`^(?:[Tt]he\\s+)?[Cc]ircle\\s*${ROMAN_RUN}\\s*:?\\s*(?:is\\s+)?(.+)$`));
  if (enCircle) {
    const roman = enCircle[1] ?? '';
    return {
      id: roman ? `circle-${roman}` : `curve-${anonIndex(enCircle[2])}`,
      name: roman ? `circle ${roman}` : '',
      kind: 'circle',
      eqSrc: enCircle[2],
    };
  }

  // --- conics: anonymous by D6, so no name is read ---
  const heParabola = line.match(new RegExp(`^${HE_GIVEN}ה?פרבולה(?:\\s+קנונית)?\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*(.+)$`));
  if (heParabola) return { id: 'parabola', name: '', kind: 'parabola', eqSrc: heParabola[1] };
  const enParabola = line.match(/^(?:the\s+)?(?:canonical\s+)?parabola\s*:?\s*(?:is\s+)?(.+)$/i);
  if (enParabola) return { id: 'parabola', name: '', kind: 'parabola', eqSrc: enParabola[1] };

  const heEllipse = line.match(new RegExp(`^${HE_GIVEN}ה?אליפסה(?:\\s+קנונית)?\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*(.+)$`));
  if (heEllipse) return { id: 'ellipse', name: '', kind: 'ellipse', eqSrc: heEllipse[1] };
  const enEllipse = line.match(/^(?:the\s+)?(?:canonical\s+)?ellipse\s*:?\s*(?:is\s+)?(.+)$/i);
  if (enEllipse) return { id: 'ellipse', name: '', kind: 'ellipse', eqSrc: enEllipse[1] };

  return null;
}

/** A stable id for an unnamed object: derived from its own equation, so re-stating it is idempotent. */
function anonIndex(eqSrc: string): string {
  const s = normalizeMath(eqSrc).replace(/\s+/g, '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `anon${Math.abs(h).toString(36)}`;
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Derived points, segments and polygons over STATED vertices (#1028)
// ---------------------------------------------------------------------------

/** Two or more point names running together — `AB`, `ABC`, `ABCD`. */
const NAME_RUN = `(?:${NAME})+`;

const splitNames = (run: string): string[] => run.match(/[A-Z][0-9]?/g) ?? [];

/**
 * The concurrency points, keyed by the role noun the corpus uses.
 *
 * Each entry says how many vertices the construct needs, so a miscounted statement
 * («מפגש התיכונים במרובע ABCD») is refused rather than quietly reading the first three.
 */
const ROLES: Array<{ he: RegExp; en: RegExp; t: DerivedRule['t']; n: number }> = [
  { he: /ה?תיכונים/, en: /centroid|medians/i, t: 'centroid', n: 3 },
  { he: /חוצי\s+ה?זוויות/, en: /incent(?:re|er)|angle\s+bisectors/i, t: 'incentre', n: 3 },
  { he: /ה?גבהים/, en: /orthocent(?:re|er)|altitudes/i, t: 'orthocentre', n: 3 },
  { he: /ה?אנכים\s+ה?אמצעיים/, en: /circumcent(?:re|er)|perpendicular\s+bisectors/i, t: 'circumcentre', n: 3 },
  { he: /ה?אלכסונים/, en: /diagonals/i, t: 'diagonals', n: 4 },
];

/** `M אמצע AB` · `M הוא אמצע הצלע AB` · `M is the midpoint of AB`. The corpus's commonest construct. */
const MIDPOINT_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*אמצע\\s+(?:ה?(?:קטע|צלע)\\s+)?(${NAME})(${NAME})$`,
);
const MIDPOINT_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+midpoint\\s+of\\s+(?:segment\\s+|side\\s+)?(${NAME})(${NAME})$`,
  'i',
);

/** `M מפגש התיכונים במשולש ABC` · `G מפגש האלכסונים במרובע ABCD`. */
const CONCURRENCY_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נקודת\\s+)?מפגש\\s+(.+?)\\s+ב-?\\s*(?:ה?(?:משולש|מרובע)\\s+)?(${NAME_RUN})$`,
);
const CONCURRENCY_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+(?:intersection\\s+of\\s+the\\s+)?(.+?)\\s+of\\s+(?:triangle\\s+|quadrilateral\\s+)?(${NAME_RUN})$`,
  'i',
);

function parseDerived(line: string): Fact[] | null {
  const mid = MIDPOINT_HE.exec(line) ?? MIDPOINT_EN.exec(line);
  if (mid) {
    const [, id, a, b] = mid;
    return [{ t: 'derived', id, rule: { t: 'midpoint', a, b }, src: line }];
  }

  const con = CONCURRENCY_HE.exec(line) ?? CONCURRENCY_EN.exec(line);
  if (con) {
    const [, id, roleSrc, run] = con;
    const role = ROLES.find((r) => r.he.test(roleSrc) || r.en.test(roleSrc));
    if (!role) return null; // an unknown role noun is not this rule's business — let it fall through
    const v = splitNames(run);
    // A wrong vertex count is a real refusal, not a reason to read the first three and hope.
    if (v.length !== role.n) return null;
    const rule: DerivedRule =
      role.t === 'diagonals'
        ? { t: 'diagonals', v: [v[0], v[1], v[2], v[3]] }
        : { t: role.t, v: [v[0], v[1], v[2]] } as DerivedRule;
    return [{ t: 'derived', id, rule, src: line }];
  }

  return null;
}

/**
 * Shape nouns that carry NO constraint of their own — a triangle is three points and their sides,
 * a quadrilateral four.
 *
 * `מקבילית` / `טרפז` / `ריבוע` are deliberately NOT here: each carries a given (AB ∥ DC, four equal
 * sides) that this slice cannot honour, and drawing one as a plain ring of sides would silently drop
 * a stated given — the one thing the root CLAUDE.md says may never happen. They are refused by name
 * below, which is a refusal the product OWNS rather than a question outsourced to the LLM
 * ([ADR-3D-214](../../docs/06b-decisions-3d.md#adr-3d-214) D2).
 */
const NEUTRAL_SHAPE_HE = new RegExp(`^${HE_GIVEN}ה?(?:משולש|מרובע)\\s+(${NAME_RUN})$`);
const NEUTRAL_SHAPE_EN = new RegExp(`^(?:triangle|quadrilateral)\\s+(${NAME_RUN})$`, 'i');
const CONSTRAINED_SHAPE = /^(?:נתו(?:ן|נה)\s+)?ה?(?:מקבילית|טרפז|ריבוע|מעוין|מלבן)\s|^(?:parallelogram|trapezoid|trapezium|square|rhombus|rectangle)\s/i;

const SEGMENT_HE = new RegExp(`^${HE_GIVEN}ה?(?:קטע|צלע)\\s+(${NAME})(${NAME})$`);
const SEGMENT_EN = new RegExp(`^(?:segment|side)\\s+(${NAME})(${NAME})$`, 'i');

/**
 * A segment's id is CANONICAL — «הקטע AB» and «הקטע BA» are one object, so they must be one id.
 *
 * Deterministic ids are what make re-issuing a statement idempotent (root CLAUDE.md), and M1's
 * absorb is keyed on the id: without canonicalisation the undirected comparison in `apply` is never
 * even reached, and the same segment draws twice.
 */
const segmentId = (a: string, b: string) => `seg-${[a, b].sort().join('')}`;

/**
 * A polygon's id is canonical over the ROTATIONS and REFLECTIONS of its vertex ring, which are
 * exactly the rewritings that name the same figure: `ABCD`, `BCDA` and `ADCB` are one
 * quadrilateral, while `ABDC` is a genuinely different one and keeps its own id.
 *
 * The lexicographically smallest rotation of the ring and of its reverse — the standard canonical
 * form for a cycle, and the only one that is correct for n > 3 as well as for triangles.
 */
function polygonId(vertices: string[]): string {
  const rings: string[][] = [];
  for (const base of [vertices, [...vertices].reverse()]) {
    for (let i = 0; i < base.length; i += 1) rings.push([...base.slice(i), ...base.slice(0, i)]);
  }
  const best = rings.map((r) => r.join('')).sort()[0];
  return `poly-${best}`;
}

function parseShape(line: string): Fact[] | null {
  const seg = SEGMENT_HE.exec(line) ?? SEGMENT_EN.exec(line);
  if (seg) {
    const [, a, b] = seg;
    return [{ t: 'segment', id: segmentId(a, b), a, b, src: line }];
  }

  const poly = NEUTRAL_SHAPE_HE.exec(line) ?? NEUTRAL_SHAPE_EN.exec(line);
  if (poly) {
    const vertices = splitNames(poly[1]);
    if (vertices.length < 3) return null;
    return [{ t: 'polygon', id: polygonId(vertices), vertices, src: line }];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Constraints and cevians (#1034, #1047, #1033) — the «lines and points» givens
// ---------------------------------------------------------------------------

/**
 * `שטח המשולש ABC הוא 20` — the corpus's commonest PIN (~10 of 40 exercises in 02c §8).
 *
 * The noun is optional and so is the definite article, per the morphology rule this tree keeps
 * relearning: «משולש» / «המשולש» / «משולש ABC ששטחו 20» all name the same thing.
 */
const AREA_HE = new RegExp(
  `^${HE_GIVEN}שטח\\s+(?:ה?משולש|ה?מרובע|ה?מצולע)?\\s*(${NAME_RUN})${HE_IS}\\s*(?:שווה\\s+ל-?)?\\s*(.+)$`,
);
const AREA_EN = new RegExp(
  `^(?:the\\s+)?area\\s+of\\s+(?:triangle\\s+|quadrilateral\\s+|polygon\\s+)?(${NAME_RUN})\\s+is\\s+(.+)$`,
  'i',
);

/**
 * `AD תיכון לצלע BC` · `AD גובה לצלע BC` — a named cevian (#1047).
 *
 * NOT the construction decoration of ADR-AG-014: that is anonymous scaffolding attached to a derived
 * point, while this is an object the student named, measures, and makes the subject of the next
 * sentence. Same geometry, opposite status.
 */
const CEVIAN_HE = new RegExp(
  `^${HE_GIVEN}(${NAME})(${NAME})${HE_IS}\\s*(?:ה?)(תיכון|גובה)\\s+(?:ל|אל\\s+ה?)?(?:ה?צלע\\s+)?(${NAME})(${NAME})(?:\\s+ב?ה?משולש\\s+${NAME_RUN})?$`,
);
const CEVIAN_EN = new RegExp(
  `^(${NAME})(${NAME})\\s+is\\s+(?:the\\s+)?(median|altitude)\\s+to\\s+(?:side\\s+)?(${NAME})(${NAME})(?:\\s+in\\s+triangle\\s+${NAME_RUN})?$`,
  'i',
);

/** `B נמצא על ציר ה-x` / `B על החלק החיובי של ציר x` — incidence, optionally with a side selector. */
const ON_AXIS_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נמצא(?:ת)?\\s+)?על\\s+(?:ה?חלק\\s+(ה?חיובי|ה?שלילי)\\s+של\\s+)?ציר\\s+ה?-?\\s*([xy])$`,
);
const ON_AXIS_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+on\\s+the\\s+(?:(positive|negative)\\s+)?([xy])-axis$`,
  'i',
);

function parseConstraint(line: string): Fact[] | null {
  const area = AREA_HE.exec(line) ?? AREA_EN.exec(line);
  if (area) {
    const ids = splitNames(area[1]);
    const value = parseExpr(normalizeMath(area[2]));
    if (ids.length >= 3 && value) {
      return [{ t: 'constraint', k: { t: 'area', ids, value }, src: line }];
    }
    return null;
  }

  const cev = CEVIAN_HE.exec(line) ?? CEVIAN_EN.exec(line);
  if (cev) {
    const [, apex, foot, roleSrc, u, v] = cev;
    const median = /תיכון|median/i.test(roleSrc);
    return [
      // The sentence NAMES the foot — «AD תיכון לצלע BC» is where `D` first appears — so it is
      // declared here. Without this the segment below would refuse it as an unknown reference, which
      // is right for a sentence that merely mentions a point and wrong for one that introduces it.
      { t: 'declare', id: apex, src: line },
      { t: 'declare', id: foot, src: line },
      // The cevian's own segment, so «AD» is a thing on the canvas and not only a relation.
      { t: 'segment', id: segmentId(apex, foot), a: apex, b: foot, src: line },
      median
        ? { t: 'constraint', k: { t: 'midpoint', id: foot, a: u, b: v }, src: line }
        : { t: 'constraint', k: { t: 'perpendicular', a: apex, b: foot, c: u, d: v }, src: line },
    ];
  }

  const ax = ON_AXIS_HE.exec(line) ?? ON_AXIS_EN.exec(line);
  if (ax) {
    const [, id, sideSrc, axis] = ax;
    // ON the axis is an INCIDENCE; the «positive part» clause is a SELECTOR over the solutions —
    // D7's two different kinds in one sentence (ADR-AG-005). The incidence is emitted here; the
    // selector rides as a domain on the surviving coordinate and is applied after the solve.
    const onX = axis.toLowerCase() === 'x';
    const k: Constraint = onX
      ? { t: 'on-line', id, a: 0, b: 1, c: 0 }
      : { t: 'on-line', id, a: 1, b: 0, c: 0 };
    const facts: Fact[] = [{ t: 'constraint', k, src: line }];
    if (sideSrc) {
      const positive = /חיובי|positive/i.test(sideSrc);
      facts.push({ t: 'selector', id, axis: onX ? 'x' : 'y', positive, src: line });
    }
    return facts;
  }

  return null;
}

export function parseLine(raw: string): ParseResult {
  const line = trim(raw);
  if (!line) return { ok: false, code: 'not-handled', detail: raw };

  const param = parseParamHe(line) ?? parseParamEn(line) ?? parseInequality(line);
  if (param) return { ok: true, facts: [param] };

  const curve = matchCurve(line);
  if (curve) {
    const eq = equationExpr(curve.eqSrc);
    if (!eq) return { ok: false, code: 'bad-equation', detail: trim(curve.eqSrc) };
    return {
      ok: true,
      facts: [
        {
          t: 'curve',
          id: curve.id,
          label: { name: curve.name, kind: curve.kind },
          curve: { kind: curve.kind, eq },
          src: line,
        },
      ],
    };
  }

  const derived = parseConstraint(line) ?? parseDerived(line) ?? parseShape(line);
  if (derived) return { ok: true, facts: derived };

  const points = parsePoints(line);
  if (points) return { ok: true, facts: points };

  // Recognised and deliberately unsupported: a constrained shape noun carries a given this slice
  // cannot honour, so it is refused BY NAME rather than escalated as if we did not understand it.
  if (CONSTRAINED_SHAPE.test(line)) return { ok: false, code: 'out-of-scope', detail: line };

  /**
   * F3/F5/F6 WITHOUT the noun — `x-y+2=0`, `y^2=54x`, `(x-3)^2+(y-4)^2=9` (#1037).
   *
   * [02c R6](../../docs/02c-requirements-analytic.md) (operator ruling, 2026-09-04) made the shape
   * noun **optional for an equation and load-bearing for a shape**, "because the fit already knows
   * the kind" — and `y^2=54x` is the requirement's own example. It was ruled and never implemented:
   * every `matchCurve` branch is gated on a noun or a name, so a bare equation fell through every
   * rule to `not-handled` and escalated to the paid LLM as though we had not understood a sentence
   * we understand perfectly. The corpus writes figures this way — image 6 gives a triangle as
   * `4x+3y=0`, `12x-5y=0`, `x=15` — and it is the shortest thing a student can type.
   *
   * **It runs LAST, after every named form, parameter declaration, inequality, shape, derived point
   * and coordinate has had first refusal.** The issue placed it "last in `matchCurve`", but
   * `matchCurve` itself runs before the point and shape rules, and the protection this branch needs
   * is precisely that those rules answer first.
   *
   * **The discriminator is that the equation is in the PLANE's variables**, read off the PARSED
   * expression's symbol set rather than by looking for an `x` in the text. That distinction is the
   * whole defence, and it is the `[IVX]` Roman-numeral trap on a new letter
   * ([ADR-AG-006](../../docs/06c-decisions-analytic.md#adr-ag-006)): a branch that matched anything
   * containing `=` would eat `AB = 4√5` (a metric given) and `x_A = 5` (the component form). Measured
   * against those rather than reasoned about — `AB = 4√5` parses to the symbols `A` and `B`, which
   * are not the plane's, and `x_A = 5` does not parse as an equation at all.
   *
   * No kind is claimed: `classify` fits the six coefficients and names the family, and a bare
   * hyperbola or rotated conic is still refused BY NAME at evaluation
   * ([ADR-AG-008](../../docs/06c-decisions-analytic.md#adr-ag-008)).
   */
  const bare = equationExpr(line);
  if (bare && symbolsOf(bare).some((s) => RESERVED_SYMBOLS.has(s))) {
    return {
      ok: true,
      facts: [
        {
          t: 'curve',
          id: `curve-${anonIndex(line)}`,
          label: { name: '' },
          curve: { eq: bare },
          src: line,
        },
      ],
    };
  }

  return { ok: false, code: 'not-handled', detail: line };
}
