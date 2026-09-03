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
import { parseExpr, normalizeMath, type Expr } from '../engine/expr';
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
    return { id: `line-${anonIndex(heLineBare[1])}`, name: '', kind: 'line', eqSrc: heLineBare[1] };
  }
  const enLine = line.match(new RegExp(`^(?:the\\s+)?line\\s+(${LINE_NAME})\\s*:?\\s*(?:is\\s+)?(.+)$`, 'i'));
  if (enLine) return { id: `line-${enLine[1]}`, name: enLine[1], kind: 'line', eqSrc: enLine[2] };
  const enLineBare = line.match(/^(?:the\s+)?line\s+(.+=.+)$/i);
  if (enLineBare) {
    return { id: `line-${anonIndex(enLineBare[1])}`, name: '', kind: 'line', eqSrc: enLineBare[1] };
  }

  // --- circle: «נתון מעגל I שמשוואתו …» · «משוואת המעגל …» ---
  const heCircle = line.match(
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?${HE_CIRCLE}\\s*${ROMAN_RUN}\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heCircle) {
    const roman = heCircle[1] ?? '';
    return {
      id: roman ? `circle-${roman}` : `circle-${anonIndex(heCircle[2])}`,
      name: roman ? `מעגל ${roman}` : '',
      kind: 'circle',
      eqSrc: heCircle[2],
    };
  }
  const enCircle = line.match(new RegExp(`^(?:[Tt]he\\s+)?[Cc]ircle\\s*${ROMAN_RUN}\\s*:?\\s*(?:is\\s+)?(.+)$`));
  if (enCircle) {
    const roman = enCircle[1] ?? '';
    return {
      id: roman ? `circle-${roman}` : `circle-${anonIndex(enCircle[2])}`,
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

  const points = parsePoints(line);
  if (points) return { ok: true, facts: points };

  return { ok: false, code: 'not-handled', detail: line };
}
