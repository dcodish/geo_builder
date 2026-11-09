/**
 * THE ANALYTIC TOOL'S HONESTY GATES ON THE LLM SEAM (#1356).
 *
 * The fallback ([#1251](https://github.com/dcodish/geo_builder/issues/1251)) shipped with the
 * deterministic re-parse as its only protection. That proves each returned line is *well-formed*; it
 * proves nothing about whether the decomposition still **says what the student said**. Both siblings
 * learned that the hard way and carry a battery of gates for it (`src/app/submitPipeline.ts`,
 * `src3d/parser/honesty3.ts`); this file is where analytic's live.
 *
 * It starts with the **sequence gate**, which is the one with a live case already: the model renamed
 * this product's own «ישר 1» to `l1`, and the student was then refused when they referred to their
 * line by the name they gave it ([#1297](https://github.com/dcodish/geo_builder/issues/1297)).
 *
 * Then the **faithfulness gates** ([#1355](https://github.com/dcodish/geo_builder/issues/1355),
 * [ADR-AG-279](../../docs/06c-decisions-analytic.md#adr-ag-279)), chosen from the 55 logged model answers:
 * a stated NAME the answer never mentions, a stated NUMBER nothing in it accounts for, and a name the answer
 * WRITES that nobody stated. The algebra is `shell/llm/honestyCore.ts`; what a name and a number ARE in this
 * product is below, read with the grammar's own atoms. Not built, with the reason (no evidence, or false
 * positives on the logged answers): a word-relation gate, a pair-relation symbol gate, an equation-identity
 * gate, an invented-number gate (ADR-AG-279 "Not built").
 */
import { restoreStatedSequences as restoreStatedSequencesShared } from '../../shell/llm/sequenceGate';
import { nameAccounting, scanNumbers, spendAccounts, unionByMax, COUNT_DIGITS, LATIN_FILLER, UNIT_WORD, type Account, type NumberOccurrence } from '../../shell/llm/honestyCore';
import { LETTER_LINE_NAME_ATOM, POINT_NAME_ATOM, parseLine } from './parseAnalytic';
import { HE_NUM_UNITS } from './frameAnalytic';
import { NUMERAL_ALT, asRoman, numeralKey } from '../engine/names';
import { isPointName, withPointName } from '../engine/pointName';
import { evalExpr, symbolsOf, type Expr } from '../engine/expr';
import { curveFromEquation } from '../engine/conic';
import { ellipseFoci, isOn, parabolaFocus } from '../engine/curves';
import { RESERVED_SYMBOLS } from '../engine/carriers';
import type { Construction, NumCurve } from '../engine/types';

/**
 * A point label in this product: a capital letter with an optional digit subscript — `A`, `B`, `F1`.
 * Exactly what the system prompt tells the model to emit, so the two cannot drift apart silently.
 */
// #2621 C (ADR-AG-395): the one atom, so a label carries its digit run (#2075) and its PRIME («A'»).
const LABEL = () => withPointName(/ℕ/g);
const RUN = () => withPointName(/(?<![A-Za-z])(?:ℕ){3,}(?![a-zd])/g);

/**
 * Restore any point run the model respelled, before the lines are re-parsed.
 *
 * The algorithm is `shell/llm/sequenceGate.ts`, shared with 2-D and 3-D (#1358: this would have been
 * the third copy). Analytic supplies the least of the three: its labels carry no primes, and it needs
 * neither an utterance normaliser nor a length-preserving line mask — so `prepareLine` is the identity
 * and a line the gate does not rewrite comes back byte-for-byte.
 */
export function restoreStatedSequencesAnalytic(
  utterance: string,
  lines: string[],
): { lines: string[]; restored: string[] } {
  return restoreStatedSequencesShared(utterance, lines, {
    label: LABEL,
    run: RUN,
    normalizeUtterance: (s) => s,
    prepareLine: (line) => ({ match: line, emit: line }),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// THE FAITHFULNESS GATES (#1355, ADR-AG-279)
// ---------------------------------------------------------------------------------------------------------------

/** One name as the gates compare it (`key`) and as it was typed (`shown`, for the refusal). */
interface NameToken {
  key: string;
  shown: string;
  /** `symbol` is a lowercase parameter or measure letter: stated side only (a model's letter there is a DOF, ADR-052). */
  kind: 'point' | 'line' | 'numeral' | 'symbol';
}

/** The same normalisation on both sides: subscript digits, the script ℓ, superscripts, the minus sign. */
function normalise(text: string): string {
  return text
    .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080))
    .replace(/ℓ/g, 'l')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/[−–]/g, '-');
}

const HEBREW = /[א-ת]/;
/**
 * A curve NAMED BY A NUMERAL — «ישר 1», «המעגל I», "line 2" (#1298, ADR-AG-144). The numeral is a NAME, never a
 * magnitude, and «1» and «I» are one name (ruling 2026-09-29), so the key is the Roman spelling. The separator
 * lookahead is the grammar's own (#1059): «הישר 2x-y+8=0» opens with a coefficient, not a name.
 */
const NUMERAL_NAME = (): RegExp =>
  new RegExp(`(?:ישר|קו|מעגל|פרבולה|אליפסה|line|circle|parabola|ellipse)\\s+(${NUMERAL_ALT})(?=[\\s:,.;)]|$)`, 'g');
/**
 * The same name spelled as a WORD — «ישר שלוש» (#1350's own test sentence): the student's numeral, so a model
 * answer writing «ישר 3» names the student's curve, not a new one. The frame's number-word table (1–9).
 */
const NUMERAL_WORD = (): RegExp =>
  new RegExp(`(?:ישר|קו|מעגל|פרבולה|אליפסה)\\s+(${Object.keys(HE_NUM_UNITS).sort((a, b) => b.length - a.length).join('|')})(?![\u05D0-\u05EA])`, 'g');
/** The grammar's point atom — a digit run of either kind since #2075 (ADR-AG-398), so `normalise`'s ₁ → 1 needs no widening. */
const POINT_ATOM = POINT_NAME_ATOM;
const POINT_RUN = new RegExp(`^(?:${POINT_ATOM})+$`);
const POINT_ONE = (): RegExp => new RegExp(POINT_ATOM, 'g');
const LETTER_LINE = new RegExp(`^${LETTER_LINE_NAME_ATOM}$`);
const MATH_CHAR = /[=+\-*/^()0-9√·<>]/;

/**
 * The PLURAL twin — «הישרים 1 ו-2», «המעגלים I ו-II», "lines 1 and 2": every numeral of the list is a name.
 * Without it the two numerals read as magnitudes, and an answer that names «הישר 1 והישר 2» reads as having
 * dropped the numbers 1 and 2.
 */
const NUMERAL_LIST = (): RegExp =>
  new RegExp(
    `(?:ישרים|קווים|מעגלים|פרבולות|אליפסות|lines|circles|parabolas|ellipses)\\s+(?:${NUMERAL_ALT})(?:\\s*(?:,|ו\\s*-?|and)\\s*(?:${NUMERAL_ALT}))+(?=[\\s:,.;)]|$)`,
    'g',
  );
const NUMERAL_IN_LIST = (): RegExp => new RegExp(`(?<![A-Za-z0-9])(?:${NUMERAL_ALT})(?![A-Za-z0-9])`, 'g');

/** Blank a numeral name's NUMERAL, keeping its noun (so positions survive). */
const blankNumeral = (m: string, n: string): string => m.slice(0, m.length - n.length) + ' '.repeat(n.length);

/** Every numeral NAME in `t` (singular and plural forms), reported to `seen` and blanked from the text. */
function takeNumeralNames(t: string, seen?: (key: string, shown: string) => void): string {
  const lists = t.replace(NUMERAL_LIST(), (m: string) => {
    const noun = /^\S+/.exec(m)?.[0] ?? '';
    return noun + m.slice(noun.length).replace(NUMERAL_IN_LIST(), (n: string) => {
      seen?.(`#${asRoman(n)}`, n);
      return ' '.repeat(n.length);
    });
  });
  const words = lists.replace(NUMERAL_WORD(), (m: string, w: string) => {
    seen?.(`#${asRoman(String(HE_NUM_UNITS[w]))}`, m.trim());
    return m;
  });
  return words.replace(NUMERAL_NAME(), (m: string, n: string) => {
    seen?.(`#${asRoman(n)}`, m.trim());
    return blankNumeral(m, n);
  });
}

/**
 * Every name `raw` states, in order, read the way the grammar reads (the atoms above): a capital run is point
 * names (`ABC` → A, B, C; `F1`); `l` / `l1` is a line; a numeral after a curve noun is that curve; a single
 * lowercase letter is a parameter or measure letter, except x and y (the axes) and except an English function
 * word in Latin-script text (the article «a»). A juxtaposed run inside an equation (`2ax`, `mx`) gives its
 * letters other than x and y; any other lowercase run (`line`, `tan`, `slope`) is a word.
 */
function namesOf(raw: string): NameToken[] {
  let t = normalise(raw);
  const latin = !HEBREW.test(t);
  const out: NameToken[] = [];
  t = takeNumeralNames(t, (key, shown) => out.push({ key, shown, kind: 'numeral' }));
  for (const m of t.matchAll(/[A-Za-z0-9]+/g)) {
    const run = m[0];
    const at = m.index ?? 0;
    const letters = run.replace(/^\d+/, '');
    if (!letters) continue;
    if (POINT_RUN.test(letters)) {
      for (const p of letters.match(POINT_ONE()) ?? []) out.push({ key: p, shown: p, kind: 'point' });
      continue;
    }
    if (/[A-Z]/.test(letters)) continue; // a mixed-case run is a word («Given»)
    if (LETTER_LINE.test(letters)) {
      out.push({ key: letters, shown: letters, kind: 'line' });
      continue;
    }
    if (/^[a-z]\d?$/.test(letters)) {
      if (letters[0] === 'x' || letters[0] === 'y') continue;
      if (latin && LATIN_FILLER.has(letters)) continue;
      out.push({ key: letters, shown: letters, kind: 'symbol' });
      continue;
    }
    const before = t[at - 1] ?? '';
    const after = t[at + run.length] ?? '';
    const inEquation = letters !== run || MATH_CHAR.test(before) || MATH_CHAR.test(after);
    const bare = letters.replace(/\d/g, '');
    if (inEquation && /[xy]/.test(bare) && bare.length <= 3) {
      for (const c of bare) if (c !== 'x' && c !== 'y') out.push({ key: c, shown: c, kind: 'symbol' });
    }
  }
  return out;
}

/**
 * The spans that are NOT magnitudes, blanked before numbers are read: a numeral NAME (its numeral), a
 * letter-glued subscript (`F1`, `l2`, `x_1`), an exponent (`^2` is form, not magnitude), and a COUNT — a bare
 * integer before a plural noun, «2 משיקים» / "3 circles" (2-D #160: a count is consumed by structure).
 *
 * A count is a BARE integer (#2646 am. 1): never one term of a root, a fraction or a decimal («√2», «3/4», «1.5»), and
 * never a value before a `UNIT_WORD`. Both atoms are the shell's (`honestyCore.ts`), shared with 2-D's count blank
 * (#2692, [ADR-781](../../docs/06-decisions.md#adr-781)).
 */
const NUMBER_BLANKS: readonly RegExp[] = [
  /(?<=[A-Za-z_])\d+/g,
  /\^\s*\(?\s*\d+(?:\.\d+)?\s*\)?/g,
  new RegExp(String.raw`${COUNT_DIGITS}(?=\s+(?!${UNIT_WORD})[א-ת]+(?:ים|ות)(?![א-ת]))`, 'g'),
  new RegExp(String.raw`${COUNT_DIGITS}(?=\s+(?!${UNIT_WORD})[a-z]+s\b)`, 'g'),
];
/** One stated or written number, and whether it stands in an EQUATION (#2646: a square or a root pays only across one). */
interface StatedNumber extends NumberOccurrence {
  eq: boolean;
}

/**
 * Does the occurrence at `at` stand in an equation? Its stretch of math is the run around it that no Hebrew word, no
 * Latin word of three letters or more (other than `sqrt`), and no `,` `;` `:` breaks; it is an equation when that run
 * holds `=` and an axis letter x or y («x^2+y^2=9», «y = 2x + 3»). «AB = 3», «A(√2, 1)» and «ברדיוס 3» are not.
 */
function inEquation(text: string, at: number): boolean {
  const masked = text.replace(/[א-ת]+|[,;:]|[A-Za-z]{3,}/g, (m) => (m.toLowerCase() === 'sqrt' ? ' '.repeat(m.length) : '|'.repeat(m.length)));
  const from = masked.lastIndexOf('|', at) + 1;
  const stop = masked.indexOf('|', at);
  const run = masked.slice(from, stop < 0 ? masked.length : stop);
  return run.includes('=') && /[xy]/.test(run);
}

/** The text the number gate reads; every occurrence's `at` indexes it. */
const numberText = (text: string): string => takeNumeralNames(normalise(text));

const numbersOf = (text: string): StatedNumber[] => {
  const t = numberText(text);
  return scanNumbers(t, NUMBER_BLANKS).map((o) => ({ ...o, eq: inEquation(t, o.at) }));
};

const EXPR_KINDS = new Set(['num', 'sym', 'neg', 'add', 'sub', 'mul', 'div', 'pow', 'sqrt']);
const isExpr = (o: Record<string, unknown>): boolean =>
  typeof o.kind === 'string' && EXPR_KINDS.has(o.kind) && (o.kind === 'num' ? typeof o.value === 'number' : o.kind === 'sym' ? typeof o.name === 'string' : !!o.a && typeof o.a === 'object');
const hasRoot = (e: Expr): boolean =>
  e.kind === 'sqrt' || ('a' in e && hasRoot(e.a)) || ('b' in e && hasRoot(e.b));

/** A line that states a right angle: the account for a stated 90 («∠ABC = 90» → «AB מאונכת ל-BC»). */
const PERPENDICULAR = /⊥|מאונ[ךכ]|ניצב|ישרה|perpendicular|right/i;

/**
 * Every number and name a line's PARSED FACTS carry: the generous half of the accounting (2-D's payload walk). A
 * constant expression with a root in it is ONE number, its value (#2646): the facts of «AB = 5√2» carry 7.07…, never
 * a 5 and a 2, exactly as the line's text reads. `plane`: some expression mentions x or y (the line is an equation).
 */
function factAccounts(line: string): { names: string[]; numbers: number[]; perp: boolean; plane: boolean; curves: NumCurve[]; radii: number[] } {
  const r = parseLine(line);
  if (!r.ok) return { names: [], numbers: [], perp: false, plane: false, curves: [], radii: [] };
  const names: string[] = [];
  const numbers: number[] = [];
  const curves: NumCurve[] = [];
  const radii: number[] = [];
  let plane = false;
  /** ADR-AG-405: a circle with no equation still states its radius, as a constant («ברדיוס 3»; «בקוטר 6» is 6/2). */
  const radius = (e: Expr): void => {
    if (symbolsOf(e).length === 0) radii.push(Math.abs(evalExpr(e)));
  };
  const walk = (v: unknown, key: string): void => {
    if (key === 'src') return;
    if (typeof v === 'number') numbers.push(v);
    else if (typeof v === 'string') for (const n of namesOf(v.replace(/[-_]/g, ' '))) names.push(n.key);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.t === 'radius-of' && o.value && isExpr(o.value as Record<string, unknown>)) radius(o.value as Expr);
      if (isExpr(o)) {
        const e = o as unknown as Expr;
        const syms = symbolsOf(e);
        if (key === 'r') radius(e);
        if (syms.some((s) => RESERVED_SYMBOLS.has(s))) plane = true;
        if (syms.length === 0 && hasRoot(e)) return void numbers.push(Math.abs(evalExpr(e)));
        // #2680: an EQUATION with no parameter is a curve the answer drew: keep it, read as the engine reads it
        if (key === 'eq' && syms.length > 0 && syms.every((s) => s === 'x' || s === 'y')) {
          const c = curveFromEquation(e, {});
          if (c.ok) curves.push(c.curve);
        }
      }
      // An exponent is FORM, not magnitude (blanked from the text too): x^2 must not pay for a stated 2.
      if (o.kind === 'pow') return walk(o.a, 'a');
      for (const [k, x] of Object.entries(o)) walk(x, k);
    }
  };
  walk(r.facts, '');
  return { names, numbers, perp: /perp|right/i.test(JSON.stringify(r.facts)), plane, curves, radii };
}

/**
 * #2680 ([ADR-AG-391](../../docs/06c-decisions-analytic.md#adr-ag-391)) — THE VALUES A CURVE'S CANONICAL FORM LEAVES
 * IMPLICIT. A canonical equation does not spell every parameter it has: «x^2 + y^2 = 9» has its centre at (0, 0),
 * «y = x + 3» has slope 1, «y = 2x» has intercept 0, «x^2 - 2x + y^2 - 4y - 4 = 0» is the circle about (1, 2) of radius
 * 3. The text pays none of those, so a correct answer was refused for a value it never dropped. They are the PARSED
 * curve's own parameters, read off the engine's fit (`curveFromEquation`), never a digit-0 exemption: the answer pays a
 * stated centre only when its curve has that centre.
 *
 * The parameters of each canonical form. A value COMPUTED from them (a diameter, a focus, a point the curve passes
 * through) is read by its stated role, in {@link roleVerdicts} (ADR-AG-405):
 * - a line `y = mx + n`: m and n; a vertical `x = k`: k;
 * - a circle `(x−a)² + (y−b)² = r²`: a, b, r;
 * - a canonical ellipse `x²/a² + y²/b² = 1`: its centre (0, 0), a, b;
 * - a canonical parabola `y² = 2px`: its vertex (0, 0), p.
 * Unsigned, like every account (the scanner is unsigned).
 */
function curveParameters(c: NumCurve): number[] {
  switch (c.kind) {
    case 'line':
      return Math.abs(c.b) > 1e-12 ? [-c.a / c.b, -c.c / c.b] : [-c.c / c.a];
    case 'circle':
      return [c.cx, c.cy, c.r];
    case 'parabola':
      return [0, 0, c.p];
    case 'ellipse':
      return [0, 0, c.a, c.b];
  }
}

/** What the answer drew: its curves, and the radii of the circles it stated without an equation. */
interface AnswerShapes {
  curves: readonly NumCurve[];
  radii: readonly number[];
}
type Ellipse = NumCurve & { kind: 'ellipse' };
type Parabola = NumCurve & { kind: 'parabola' };

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const ellipses = (s: AnswerShapes): Ellipse[] => s.curves.filter((c): c is Ellipse => c.kind === 'ellipse');
const parabolas = (s: AnswerShapes): Parabola[] => s.curves.filter((c): c is Parabola => c.kind === 'parabola');
const radiiOf = (s: AnswerShapes): number[] => [...s.radii, ...s.curves.flatMap((c) => (c.kind === 'circle' ? [c.r] : []))];
const hasFocus = (s: AnswerShapes, x: number, y: number): boolean =>
  [...parabolas(s).map(parabolaFocus), ...ellipses(s).flatMap(ellipseFoci)].some((f) => close(f.x, x) && close(f.y, y));

/** The words between a role noun and its value: «קוטרו הוא 6», «הציר הגדול באורך 10», "diameter of 6". */
const LINK = String.raw`(?:\s*(?:הוא|היא|הם|הן|שווה\s+ל-?|שווים\s+ל-?|באורך|שאורכו|שאורכה|of|is|are|equals?|equal\s+to|=|:))*\s*`;
/** An axis in a crossing, either script: «את ציר x», «ציר ה-y», "the x-axis". */
const AXIS = String.raw`(?:(?:את\s+)?ה?ציר\s*(?:ה-?)?([xy])|(?:the\s+)?([xy])[-\s]axis)`;
const CROSS = String.raw`(?:חות[כך][א-ת]*|פוג[שע][א-ת]*|cuts?|crosses|meets|intersects?)\s+${AXIS}`;
/** The words between a role noun and a coordinate pair: «מוקדי האליפסה הם», «עובר בנקודה A», "through the point". */
const POINT_LEAD = String.raw`(?:\s+(?:של\s+)?ה?(?:פרבולה|אליפסה)|\s+of\s+the\s+[a-z]+)?${LINK}(?:(?:the\s+)?points?\s*|ב?-?ה?נקוד(?:ה|ות)\s*|ב-?)?(?:${POINT_ATOM})?\s*$`;
/** Never a half: «חצי קוטר 3» is a radius and «חצי הציר הגדול 5» a semi-axis, parameters {@link curveParameters} pays. */
const NOT_HALF = String.raw`(?<!חצי\s+ה?)(?<!semi-?)`;

type Line = NumCurve & { kind: 'line' };
/** The answer's non-vertical lines, by slope. */
const slopesOf = (s: AnswerShapes): number[] => s.curves.filter((c): c is Line => c.kind === 'line' && Math.abs(c.b) > 1e-12).map((c) => -c.a / c.b);

/**
 * A value's ROLE, read off the words right before it: the test that the answer's curve really holds it there (`holds`),
 * and whether the answer drew a curve of the kind that role is about at all (`testable`). The second is what lets a
 * role DECIDE (#2680, ADR-AG-449): a focus is contradicted only by an answer that drew a parabola or an ellipse.
 *
 * `signed`: the role reads a minus right before the value as its sign («שיפועו -2»). Every other scalar is unsigned,
 * like the scanner: the hyphen of «ב-2» is a maqaf, never a sign.
 */
interface ScalarRole {
  before: RegExp;
  holds: (s: AnswerShapes, v: number, axis: string) => boolean;
  testable: (s: AnswerShapes) => boolean;
  signed?: true;
}
const SCALAR_ROLES: readonly ScalarRole[] = [
  {
    before: new RegExp(String.raw`${NOT_HALF}(?:קוטר[א-ת]*|diameter)${LINK}$`, 'i'),
    holds: (s, v) => radiiOf(s).some((r) => close(2 * r, v)),
    testable: (s) => radiiOf(s).length > 0,
  },
  {
    // ADR-AG-449: a radius, «רדיוסו 6» or «חצי קוטר 6», is a role too: «x^2 + y^2 = 6» has a 6 and radius √6.
    before: new RegExp(String.raw`(?:רדיוס[א-ת]*|radius|חצי\s+ה?קוטר[א-ת]*|semi-?diameter)${LINK}$`, 'i'),
    holds: (s, v) => radiiOf(s).some((r) => close(r, v)),
    testable: (s) => radiiOf(s).length > 0,
  },
  {
    // ADR-AG-449: a slope, signed: «y = 3x + 2» has a 2 and slope 3.
    before: new RegExp(String.raw`(?:שיפוע[א-ת]*|slope)${LINK}(?:-\s*)?$`, 'i'),
    holds: (s, v) => slopesOf(s).some((m) => close(m, v)),
    testable: (s) => slopesOf(s).length > 0,
    signed: true,
  },
  {
    before: new RegExp(String.raw`${NOT_HALF}(?:ציר[א-ת]*\s+ה?(?:גדול|ראשי|ארוך)|major\s+axis)${LINK}$`, 'i'),
    holds: (s, v) => ellipses(s).some((c) => close(2 * Math.max(c.a, c.b), v)),
    testable: (s) => ellipses(s).length > 0,
  },
  {
    before: new RegExp(String.raw`${NOT_HALF}(?:ציר[א-ת]*\s+ה?(?:קטן|משני|קצר)|minor\s+axis)${LINK}$`, 'i'),
    holds: (s, v) => ellipses(s).some((c) => close(2 * Math.min(c.a, c.b), v)),
    testable: (s) => ellipses(s).length > 0,
  },
  {
    before: new RegExp(String.raw`(?:מרחק\s+(?:בין\s+)?ה?מוקד[א-ת]*|distance\s+between\s+(?:the\s+)?foci|focal\s+distance)${LINK}$`, 'i'),
    holds: (s, v) =>
      ellipses(s).some((c) => {
        const [a, b] = ellipseFoci(c);
        return close(Math.hypot(a.x - b.x, a.y - b.y), v);
      }),
    testable: (s) => ellipses(s).length > 0,
  },
  {
    before: new RegExp(String.raw`(?:מדריך|מדריכ[א-ת]*|directrix)[^0-9]*?x\s*=\s*-?\s*$`, 'i'),
    holds: (s, v) => parabolas(s).some((c) => close(Math.abs(c.p) / 2, v)),
    testable: (s) => parabolas(s).length > 0,
  },
  {
    before: new RegExp(String.raw`${CROSS}\s*(?:ב-?|בנקודה\s*|at\s+)$`, 'i'),
    holds: (s, v, axis) => s.curves.some((c) => [v, -v].some((at) => (axis === 'x' ? isOn(c, at, 0) : isOn(c, 0, at)))),
    testable: (s) => s.curves.length > 0,
  },
];

/**
 * A coordinate pair's role. `features`: the points the role names on the answer's curve (a focus role: its foci), so
 * a contradicted pair names only the coordinates the curve does not have («(2,0)» against the focus (1,0): the 2).
 */
interface PairRole {
  before: RegExp;
  holds: (s: AnswerShapes, x: number, y: number) => boolean;
  testable: (s: AnswerShapes) => boolean;
  features?: (s: AnswerShapes) => { x: number; y: number }[];
}
const focusesOf = (s: AnswerShapes): { x: number; y: number }[] => [...parabolas(s).map(parabolaFocus), ...ellipses(s).flatMap(ellipseFoci)];
const PAIR_ROLES: readonly PairRole[] = [
  {
    before: new RegExp(String.raw`(?:דרך|עובר[א-ת]*|מכיל[א-ת]*|through|passes|passing|contains?|containing|${CROSS})${POINT_LEAD}`, 'i'),
    holds: (s, x, y) => s.curves.some((c) => isOn(c, x, y)),
    testable: (s) => s.curves.length > 0,
  },
  {
    before: new RegExp(String.raw`(?:מוקד[א-ת]*|foc(?:us|i))${POINT_LEAD}`, 'i'),
    holds: hasFocus,
    testable: (s) => focusesOf(s).length > 0,
    features: focusesOf,
  },
];

/** A coordinate pair's parenthesis: two parts, each of which may hold one group («(√(2), 1)»). */
const PAIR = /\(((?:[^(),;]|\([^()]*\))*)[,;]((?:[^(),;]|\([^()]*\))*)\)/g;
/** What joins one pair of a list to the next: «(4,0) ו-(-4,0)», "(1,2) and (3,4)"; the next may be named. */
const LIST_GAP = new RegExp(String.raw`^\s*,?\s*(?:ו\s*-?|and\b)?\s*(?:${POINT_ATOM})?\s*$`);

/**
 * #2680 — THE ROLE VERDICT ([ADR-AG-405](../../docs/06c-decisions-analytic.md#adr-ag-405), operator ruling 2026-11-04:
 * *"Accept when the answer's curve really has the value"*; [ADR-AG-449](../../docs/06c-decisions-analytic.md#adr-ag-449),
 * operator ruling 2026-11-06: *"We would want the correct to be accepted and wrong not"*). The number gate looks a value
 * up, and a value the answer COMPUTED is not there to find: a diameter of 6 in «x^2 + y^2 = 9», the point (2,3) in
 * «y = 4x - 5», the focus (1,0) in «y^2 = 4x». This reads each occurrence's stated ROLE and tests the curve the engine
 * draws, with the engine's own {@link isOn}, {@link parabolaFocus} and {@link ellipseFoci}. Each occurrence gets one of
 * three verdicts:
 *
 * - **held**: the role holds on the answer's curve. It needs no account and spends none, so the multiset is left for
 *   what remains: in «(2,3), slope 4» answered «y=4x-5», the 4 pays the slope, not the root of the stated 2.
 * - **contradicted**: the answer drew a curve of the kind the role is about, the role fails on every one of them, and the
 *   answer never restates the value as a plain given (outside an equation, «ברדיוס 6», «A=(2,3)»: the grammar then
 *   carries it). It is DROPPED, and never reaches the number gate, where an exponent, a square, a root or another of
 *   the curve's parameters would pay it by coincidence (`y^2 = 4x`'s p = 2 paying a stated focus (2,0)). Its statement,
 *   as the student typed it, is what the one retry names (ADR-W-189 am.).
 * - **no role**: no role noun, or no curve of that kind to test it on. The number gate, as before.
 *
 * The test needs the role. «x^2 + y^2 = 25» does pass through (3,4), and that does not pay a stated CENTRE (3,4); its
 * diameter is 10, and that does not pay a stated RADIUS 10.
 */
interface RoleVerdicts {
  held: Set<number>;
  contradicted: Set<number>;
  /** The contradicted statements, as typed («שמוקדה (2,0)»), in order and once each. */
  statements: string[];
}

/** What the answer states OUTSIDE an equation: a plain value, a plain pair. A role it restates there is the grammar's to hold. */
interface PlainGivens {
  values: number[];
  pairs: [number, number][];
}

/** Each coordinate pair of `t` whose two parts are `numbers`' occurrences: where it opens and ends, and its signed values. */
function pairsOf(t: string, numbers: readonly StatedNumber[]): { open: number; end: number; parts: StatedNumber[]; xy: [number, number] }[] {
  const out: { open: number; end: number; parts: StatedNumber[]; xy: [number, number] }[] = [];
  for (const m of t.matchAll(PAIR)) {
    const open = m.index ?? 0;
    const end = open + m[0].length;
    const parts = numbers.filter((o) => o.at > open && o.at < end);
    if (parts.length !== 2) continue;
    const signed = (o: StatedNumber): number => (/-\s*$/.test(t.slice(open, o.at)) ? -o.value : o.value);
    out.push({ open, end, parts, xy: [signed(parts[0]), signed(parts[1])] });
  }
  return out;
}

function plainGivensOf(lines: readonly string[]): PlainGivens {
  const out: PlainGivens = { values: [], pairs: [] };
  for (const line of lines) {
    const occ = numbersOf(line).filter((o) => !o.eq);
    out.values.push(...occ.map((o) => o.value));
    for (const p of pairsOf(numberText(line), occ)) out.pairs.push(p.xy);
  }
  return out;
}

function roleVerdicts(utterance: string, stated: readonly StatedNumber[], shapes: AnswerShapes, plain: PlainGivens): RoleVerdicts {
  const out: RoleVerdicts = { held: new Set(), contradicted: new Set(), statements: [] };
  if (shapes.curves.length === 0 && shapes.radii.length === 0) return out;
  const t = numberText(utterance);
  /** The student's words from the role noun's word to the value's end, by where they start: a listed pair widens its list's. */
  const spans = new Map<number, number>();
  const statement = (from: number, to: number): void => {
    const start = t.slice(0, from).search(/\S*$/);
    spans.set(start, Math.max(to, spans.get(start) ?? to));
  };
  const inPair = new Set<number>();
  let role: PairRole | undefined;
  let roleAt = -1;
  let prevEnd = -1;
  for (const { open, end, parts, xy } of pairsOf(t, stated)) {
    const before = t.slice(0, open);
    const listed = prevEnd >= 0 && LIST_GAP.test(t.slice(prevEnd, open)) ? role : undefined;
    const own = PAIR_ROLES.map((r) => ({ r, m: r.before.exec(before) })).find((x) => x.m);
    role = own?.r ?? listed;
    if (own?.m) roleAt = own.m.index;
    prevEnd = end;
    for (const o of parts) inPair.add(o.at);
    if (!role) continue;
    if (role.holds(shapes, xy[0], xy[1])) for (const o of parts) out.held.add(o.at);
    else if (role.testable(shapes) && !plain.pairs.some(([x, y]) => close(x, xy[0]) && close(y, xy[1]))) {
      // A role that names points on the curve names only the coordinates none of them has; else the whole pair.
      const features = role.features?.(shapes) ?? [];
      const wrong = parts.filter((_o, i) => !features.some((f) => close(i === 0 ? f.x : f.y, xy[i])));
      for (const o of wrong.length ? wrong : parts) out.contradicted.add(o.at);
      statement(roleAt, end);
    }
  }
  for (const o of stated) {
    if (inPair.has(o.at)) continue;
    const before = t.slice(0, o.at);
    for (const r of SCALAR_ROLES) {
      const m = r.before.exec(before);
      if (!m) continue;
      const v = r.signed && /-\s*$/.test(before) ? -o.value : o.value;
      if (r.holds(shapes, v, (m[1] ?? m[2] ?? '').toLowerCase())) out.held.add(o.at);
      else if (r.testable(shapes) && !plain.values.some((p) => close(p, o.value))) {
        out.contradicted.add(o.at);
        statement(m.index, o.at + o.raw.length);
      }
      break; // one role per value
    }
  }
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) out.statements.push(t.slice(start, end).replace(/\s+/g, ' ').trim());
  return out;
}

/**
 * The names the figure already holds, in the gates' key space: a point's letter, a letter line's name, a
 * numeral curve's numeral, a parameter's letter.
 */
export function existingNamesAnalytic(c: Pick<Construction, 'objects' | 'params'>): Set<string> {
  const out = new Set<string>();
  for (const o of c.objects) {
    if (isPointName(o.id)) out.add(o.id);
    const num = numeralKey(o.id);
    if (num) out.add(`#${num.slice(num.indexOf('-') + 1)}`);
    const line = /^line-(.+)$/.exec(o.id);
    if (line && LETTER_LINE.test(normalise(line[1]))) out.add(normalise(line[1]));
  }
  for (const p of c.params) if (/^[a-z]\d?$/.test(p.sym)) out.add(p.sym);
  return out;
}

/** What {@link faithfulnessAnalytic} found. Each list is in the student's (or the model's) own spelling. */
export interface Faithfulness {
  /** Names the student stated that the answer never mentions, then numbers it never accounts for: as typed. */
  dropped: string[];
  /** The NAME half of {@link dropped}: what the one retry asks the model to keep (#2231, ADR-W-189). A lost number never retries. */
  droppedNames: string[];
  /**
   * #2680 (ADR-AG-449): the student's statements whose role the answer's curve contradicts, as typed («שמוקדה (2,0)»).
   * Their values are in {@link dropped}. The second trigger of the one retry, which names them (ADR-W-189 am.).
   */
  contradicted: string[];
  /** Names the answer wrote that the student did not, and the figure does not hold. */
  invented: string[];
  /**
   * Names the answer wrote that the student did not, though the figure HOLDS them (#2225, ADR-AG-281): an
   * unstated relation pulled onto an existing point or line («ישר l» → «דרך P עובר ישר l»). As typed by the model,
   * which may be shown: the figure shows the name (ADR-W-096).
   */
  inventedExisting: string[];
}

/**
 * THE GATES, on one utterance and the model's whole answer (after the sequence gate). `existing` is the figure's
 * names before the answer ({@link existingNamesAnalytic}).
 *
 * 1. **Dropped name**: every stated name must appear in some model line or its parsed facts, case-blind,
 *    EXISTING names included. A text answer has no context to carry them (#34 dropped `l1`, and the crossing
 *    went with it).
 * 2. **Dropped number**: every stated number must be paid, as a multiset, by a model line's numbers or facts:
 *    the value itself, its square (a radius stated, r² in the equation), its square root, or, for 90, a line
 *    that states a right angle. A value whose stated role the answer's curve really holds needs no account, and
 *    one whose role it contradicts is dropped whatever pays it (ADR-AG-405, ADR-AG-449, {@link roleVerdicts}).
 * 3. **Invented name**: every point, line or numeral name the model WROTE must be stated or in the figure. Read
 *    off the text, so a name the grammar mints while lowering (P₁, a canonical centre) is never counted.
 * 4. **Invented existing name** (#2225, ADR-AG-281, operator ruling 2026-10-16): a name the model wrote that the
 *    student did not, though the figure holds it, is refused too — the model attached a relation to it that the
 *    sentence never stated (an existing P made «ישר l» pass through P, and pinned it).
 */
export function faithfulnessAnalytic(utterance: string, modelLines: readonly string[], existing: ReadonlySet<string>): Faithfulness {
  const stated = namesOf(utterance);
  const perLine = modelLines.map((l) => namesOf(l));
  const written = perLine.flat().filter((n) => n.kind !== 'symbol');
  const facts = modelLines.map(factAccounts);
  const shownOf = new Map<string, string>();
  for (const n of [...stated, ...written]) if (!shownOf.has(n.key)) shownOf.set(n.key, n.shown);
  const names = nameAccounting({
    stated: stated.map((n) => n.key),
    written: written.map((n) => n.key),
    accounted: [...perLine.flat().map((n) => n.key), ...facts.flatMap((f) => f.names)],
    existing,
  });

  // #2225: the same difference with the figure's names NOT exempt; what it adds is an existing name pulled in.
  const widened = nameAccounting({ stated: stated.map((n) => n.key), written: written.map((n) => n.key), existing, exemptExistingFromInvented: false });
  const newly = new Set(names.invented);
  const inventedExisting = widened.invented.filter((k) => !newly.has(k));

  // #2646 (ADR-AG-384): every account is tagged with whether its line is an EQUATION (its text or its parsed facts
  // mention x or y). A stated number is paid by its own value from any line; by its square or its root only ACROSS an
  // equation (a radius stated as r, written as r² in a circle's equation, or the converse). «AB = 3» answered
  // «AB = 9» is not paid.
  const EQ = 'eq';
  const PLAIN = 'plain';
  const accounts: Account[] = [];
  // #2680 (ADR-AG-391): the answer's curves pay the parameters their canonical form leaves implicit (a centre at the
  // origin, a slope of 1, an intercept of 0, an expanded circle's centre and radius). A further SOURCE of the union, so a
  // parameter the text already spells («(x-1)^2» and the centre's 1) pays once, never twice.
  modelLines.forEach((line, i) => {
    const occ = numbersOf(line);
    const tag = facts[i].plane || occ.some((o) => o.eq) ? EQ : PLAIN;
    const params = [...facts[i].curves.flatMap(curveParameters).map(Math.abs), ...facts[i].radii];
    for (const value of unionByMax(occ.map((o) => o.value), facts[i].numbers, params)) accounts.push({ value, tag });
    if (facts[i].perp || PERPENDICULAR.test(line)) accounts.push({ value: 90, tag });
  });
  const statedNumbers = numbersOf(utterance);
  const roles = roleVerdicts(utterance, statedNumbers, { curves: facts.flatMap((f) => f.curves), radii: facts.flatMap((f) => f.radii) }, plainGivensOf(modelLines));
  // ADR-AG-449: a held value needs no account; a contradicted one is dropped and never reaches the accounts.
  const unpaid = spendAccounts(statedNumbers.filter((o) => !roles.held.has(o.at) && !roles.contradicted.has(o.at)), accounts, (o) => {
    const across = o.eq ? PLAIN : EQ;
    return [
      { value: o.value, tag: EQ },
      { value: o.value, tag: PLAIN },
      { value: o.value * o.value, tag: across },
      { value: Math.sqrt(o.value), tag: across },
    ];
  });

  const droppedNumbers = [...unpaid, ...statedNumbers.filter((o) => roles.contradicted.has(o.at))].sort((a, b) => a.at - b.at);

  const droppedNames = names.dropped.map((k) => shownOf.get(k) ?? k);
  return {
    dropped: [...droppedNames, ...droppedNumbers.map((o) => o.raw)],
    droppedNames,
    contradicted: roles.statements,
    invented: names.invented.map((k) => shownOf.get(k) ?? k),
    inventedExisting: inventedExisting.map((k) => shownOf.get(k) ?? k),
  };
}
