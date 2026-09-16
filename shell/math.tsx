/**
 * THE SHARED MATH-TEXT CORE (#900, ADR-W-040). It lived at `src/render/mathText.tsx` and served the 2-D
 * step list alone; the 3-D Builder echoed `C(p^2,1,0)` with a literal caret because it had no equivalent.
 * Moved here rather than copied: the module is pure `string -> structure`, names no product, and branches
 * on nothing — the shell test the seeding rule actually protects. Its consumers are 2-D's step list and
 * 3-D's non-vector rows; 3-D's VECTOR rows keep `VecMath`, which decorates (arrows, vector pairs) and must
 * stay fact-kind-gated per #313.
 *
 * Render math-flavoured notation as formatted math (MathML) inline within a line of otherwise plain text
 * ([ADR-298](docs/06-decisions.md#adr-298) Am. / issues #77 + #40). A student types `BC = 35/√32`; this
 * shows `35` over `√32` as a real fraction-with-radical, so the interpretation is visible — the disambiguating
 * companion to the `√()` grouping (`√(2/3)` renders the whole fraction under the root; `√2/3` renders `(√2)/3`).
 *
 * Only the MATH tokens are converted (fractions, radicals, subscripts `S_{ABC}`, superscripts `x²`/`x^2`);
 * everything else — labels, `=`, Hebrew words — stays verbatim text. MathML is emitted as a string and
 * rendered via `dangerouslySetInnerHTML` because React 18 doesn't type MathML intrinsic elements (React 19
 * does); the input is our own utterance text, escaped, so there is no injection surface. Browsers render
 * `<math>` natively (MathML Core — Chromium ≥109, Firefox, Safari).
 */
import { useMemo } from 'react';
import { exprML } from './mathExpr';

const NUM = String.raw`\d+(?:\.\d+)?`;
// a radicand: a parenthesised number/fraction (the √() grouping) OR a bare number
const RADICAND = String.raw`\(\s*${NUM}(?:\s*\/\s*${NUM})?\s*\)|${NUM}`;
// a value TERM: `[coef] √ radicand`, or a plain number
const RTERM = String.raw`(?:${NUM}\s*[*·]?\s*)?√\s*(?:${RADICAND})|${NUM}`;
// a value: TERM optionally over TERM
const VALUE = String.raw`(?:${RTERM})(?:\s*\/\s*(?:${RTERM}))?`;
const SUB = String.raw`[A-Za-z]_\{[A-Za-z0-9]+\}`;
/**
 * A POWER, over a single symbol OR a parenthesised group (#1097).
 *
 * `y^2` was always handled; `(x-3)^2` was not — and that is the commonest form the analytic builder
 * sees, because every circle equation is written `(x-a)^2+(y-b)^2=r^2`. A student typing one read
 * `^2` back as literal text in the panel that exists to show them what they told the tool.
 *
 * Non-nested on purpose: `[^()]+` matches one flat group, which covers the corpus (`(x-3)`, `(y+5)`,
 * `(2x-1)`). Nesting would need a parser, and inventing one to typeset a form nothing writes is how
 * a renderer acquires bugs nobody can reproduce.
 */
const SUP = String.raw`(?:\([^()]+\)|[A-Za-z0-9])(?:²|\^\d+)`;
// An ARC measure — the ⌢/⏜ glyph or the word (קשת/arc) followed immediately by a 2-letter point pair,
// bare or in the ⌢{} toolbar template's braces («⌢{AC}», the √()/S_{} discipline) — rendered as the
// textbook over-arc (⌢ OVER the letters, like the exam's ⌢AC + ⌢BE notation; issue #155). The word form
// requires the pair RIGHT AFTER it, so «הקשת הקטנה AB» (a qualified arc reference, not a measure) stays
// plain text.
const ARC = String.raw`(?:⌢|⏜|ה?קשת|(?<![A-Za-z])arc)\s*(?:\{\s*([A-Z]\d*[A-Z]\d*)\s*\}|([A-Z]\d*[A-Z]\d*)(?![A-Za-z\d]))`;
/**
 * An EXPRESSION span (#1125) — a maximal run of mathematical characters.
 *
 * `VALUE` above matches only spans whose operands are literal NUMBERS, which is what stated magnitudes
 * are. The #1053 formula traces are arithmetic over sub-expressions, so `VALUE` never matched them and
 * their `√` and `/` survived as glyphs. This span is deliberately WIDER — identifiers, brackets, the
 * absolute-value bar, unary signs — and is post-filtered exactly as `VALUE` is: a run carrying neither
 * a `√` nor a `/` is not worth typesetting and stays plain text, so «AB = 10» and «∠ABC = 37» are
 * untouched.
 *
 * It stops at `=` and at any non-Latin letter, which is what keeps the boundaries the corpus pins:
 * «BC = 35/√32» still renders `BC = ` as text, and Hebrew never enters a formula.
 */
const MATHCH = String.raw`0-9A-Za-z√(){}|_^²·*×+\-\/.`;
/**
 * The span must CONTAIN a radical or a fraction bar, asserted up front.
 *
 * Without the lookahead this run swallowed neighbouring spans it could not improve: «(x-3)^2+(y-4)^2=9»
 * matched from the `+`, carried no radical, and fell through to plain text -- dropping a superscript
 * the corpus had always typeset. Matching only where it will actually render leaves every other token
 * to the rule that already handled it.
 *
 * It also may not begin or end on whitespace (that ate the space in «BC = 35/√32»), and a comma
 * ends it -- `m = (4 - 0) / (3 - 0),  y - 0 = ...` is two statements, not one expression.
 */
const EXPR = String.raw`(?=[${MATHCH}\s]*[√\/])[${MATHCH}](?:[${MATHCH}\s]*[${MATHCH}])?`;

/**
 * One tokenizer over the line: an arc, a subscript, a superscript, a value, or an expression.
 *
 * ORDER IS LOAD-BEARING. `SUP` precedes `EXPR` so `(x-3)^2` keeps rendering as the superscript island
 * the corpus asserts, and `VALUE` precedes it so every stated magnitude takes the byte-identical path it
 * always did. `EXPR` is the fallback that catches what the value grammar cannot express.
 */
const TOKEN = new RegExp(`(${ARC})|(${SUB})|(${SUP})|(${VALUE})|(${EXPR})`, 'gu');

const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
const mn = (s: string): string => `<mn>${esc(s.trim())}</mn>`;
const mi = (s: string): string => `<mi>${esc(s)}</mi>`;

/** MathML for a radicand string: `(a/b)` → a fraction, `(a)` / `a` → a number. */
function radicandML(inner: string): string {
  const frac = inner.match(new RegExp(String.raw`^\(\s*(${NUM})\s*\/\s*(${NUM})\s*\)$`));
  if (frac) return `<mfrac>${mn(frac[1])}${mn(frac[2])}</mfrac>`;
  return mn(inner.replace(/[()\s]/g, ''));
}
/** MathML for a value TERM: `[coef]√radicand` or a plain number. */
function termML(t: string): string {
  const m = t.match(new RegExp(String.raw`^(?:(${NUM})\s*[*·]?\s*)?√\s*(${RADICAND})$`));
  if (m) {
    const sqrt = `<msqrt>${radicandML(m[2])}</msqrt>`;
    return m[1] ? `<mrow>${mn(m[1])}${sqrt}</mrow>` : sqrt;
  }
  return mn(t);
}
/** MathML for a whole value expression `num [/ den]`. */
function valueML(whole: string): string {
  const slash = splitTopLevelSlash(whole);
  const body = slash ? `<mfrac>${termML(slash[0])}${termML(slash[1])}</mfrac>` : termML(whole);
  return `<math>${body}</math>`;
}
/** Split a value at its TOP-LEVEL `/` (not one inside a `√(…)` group), or null if there is none. */
function splitTopLevelSlash(v: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '(') depth++;
    else if (v[i] === ')') depth--;
    else if (v[i] === '/' && depth === 0) return [v.slice(0, i), v.slice(i + 1)];
  }
  return null;
}
function subML(t: string): string {
  const m = t.match(/^([A-Za-z])_\{([A-Za-z0-9]+)\}$/)!;
  return `<math><msub>${mi(m[1])}${mi(m[2])}</msub></math>`;
}
function supML(t: string): string {
  const m = t.match(/^(\([^()]+\)|[A-Za-z0-9])(²|\^(\d+))$/)!;
  const exp = m[2] === '²' ? '2' : m[3];
  return `<math><msup>${baseML(m[1])}${mn(exp)}</msup></math>`;
}

/**
 * The BASE of a power: a lone symbol, or a parenthesised expression rendered as a row.
 *
 * The group's contents are split into identifiers, numbers and operators rather than escaped as one
 * blob, so `(x-3)` renders as maths and not as a quoted string sitting inside a formula. The
 * parentheses are `<mo>` because that is what they are — operators, not decoration.
 */
function baseML(base: string): string {
  if (!base.startsWith('(')) return /\d/.test(base) ? mn(base) : mi(base);
  const inner = base.slice(1, -1);
  const parts = inner.match(/\d+(?:\.\d+)?|[A-Za-z]+|[^\sA-Za-z\d]/gu) ?? [inner];
  const body = parts
    .map((tok) => (/^\d/.test(tok) ? mn(tok) : /^[A-Za-z]+$/.test(tok) ? mi(tok) : `<mo>${esc(tok)}</mo>`))
    .join('');
  return `<mrow><mo>(</mo>${body}<mo>)</mo></mrow>`;
}
/** MathML for an arc measure: the point pair under a stretched over-arc (⏜ accent), the textbook ⌢AC. */
function arcML(pair: string): string {
  return `<math><mover accent="true">${mi(pair)}<mo stretchy="true">⏜</mo></mover></math>`;
}

/**
 * True when the text carries math notation worth formatting (a radical, a fraction, a subscript, a
 * power, an arc).
 *
 * The `/` clause used to require a DIGIT either side, which is why «משוואת הישר AB»'s trace —
 * `m = (4 - 0) / (3 - 0)` — reported `hasMath: false` and was never typeset at all (#1125). A fraction
 * bar between two bracketed sub-expressions is exactly as much a fraction as one between two numbers.
 */
export function hasMath(text: string): boolean {
  return /√|_\{|²|\^\d|[\d)|]\s*\/\s*[\d√(|]|⌢|⏜|(?:ה?קשת|(?<![A-Za-z])arc)\s*\{?[A-Z]\d*[A-Z]/u.test(text);
}

/** Render `text` to an HTML string: MathML for the math tokens, escaped verbatim text for the rest. */
export function mathHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index!;
    out += esc(text.slice(last, i));
    if (m[1]) out += arcML(m[2] ?? m[3]); // m[2] = braced pair (⌢{AC}), m[3] = bare pair — either way the over-arc replaces the token
    else if (m[4]) out += subML(m[4]);
    else if (m[5]) out += supML(m[5]);
    else if (m[6] && /√|\//.test(m[6])) out += valueML(m[6]);
    else if (m[7] && /√|\//.test(m[7])) {
      /**
       * An expression the value grammar could not express (#1125). `exprML` returns null when the span
       * is not a well-formed expression, and then the span stays verbatim — a renderer that half-parses
       * a formula would show the student a formula that is not the one they were given.
       */
      const ml = exprML(m[7]);
      out += ml ?? esc(m[0]);
    }
    else out += esc(m[0]); // a lone number, or a run with no √ and no / — keep as plain text
    last = i + m[0].length;
  }
  out += esc(text.slice(last));
  return out;
}

/** Inline math rendering of a line of utterance text (math tokens as MathML, the rest verbatim). */
export function MathText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const html = useMemo(() => mathHtml(text), [text]);
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
