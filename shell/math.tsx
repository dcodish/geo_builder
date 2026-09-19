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
const TOKEN_KINDS = ['arc', 'sub', 'sup', 'value', 'expr'] as const;
type TokenKind = (typeof TOKEN_KINDS)[number];

/**
 * The alternatives as STICKY regexes, in precedence order — the order now breaks TIES only (#1217).
 */
const TOKENS: ReadonlyArray<{ kind: TokenKind; re: RegExp }> = [
  { kind: 'arc', re: new RegExp(ARC, 'yu') },
  { kind: 'sub', re: new RegExp(SUB, 'yu') },
  { kind: 'sup', re: new RegExp(SUP, 'yu') },
  { kind: 'value', re: new RegExp(VALUE, 'yu') },
  { kind: 'expr', re: new RegExp(EXPR, 'yu') },
];

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

/**
 * A MATH SPAN IS BRACKET-BALANCED (#1208).
 *
 * `EXPR` stops at a comma, deliberately — «m = (4-0)/(3-0), y - 0 = …» is two statements. But a span
 * that BEGINS inside a bracket then ends at that comma carries an opener whose partner is outside it:
 *
 * ```
 * P = (14/3, 31/3)   →  span "(14/3"  →  unparseable  →  left as plain text
 *                       span "31/3"   →  a proper fraction
 * ```
 *
 * which is exactly what the operator saw — a coordinate pair with its y typeset and its x flat. The
 * bracket is not part of the expression; it belongs to the sentence around it. So an unmatched bracket
 * at either edge is peeled off and rendered as the text it is, and what remains is offered to `exprML`.
 *
 * Peeled one layer at a time from the edges only — an unmatched bracket in the MIDDLE means the span is
 * genuinely malformed, and `exprML` still refuses it, keeping the "never half-parse a formula" rule.
 */
function peelBrackets(span: string): { lead: string; core: string; tail: string } {
  let lead = '';
  let tail = '';
  let core = span;
  const unmatched = (s: string, open: string, close: string) => {
    let depth = 0;
    for (const ch of s) {
      if (ch === open) depth++;
      else if (ch === close) depth--;
    }
    return depth;
  };
  while (core.startsWith('(') && unmatched(core, '(', ')') > 0) {
    lead += '(';
    core = core.slice(1);
  }
  while (core.endsWith(')') && unmatched(core, '(', ')') < 0) {
    tail = ')' + tail;
    core = core.slice(0, -1);
  }
  return { lead, core, tail };
}

/**
 * The MathML one token renders to, or `null` when this alternative cannot render this text.
 *
 * `null` is what makes "longest match" safe (#1217): a candidate that declines is passed over for a
 * shorter one rather than swallowing the span, so the fix can never render LESS than the old
 * first-alternative-wins order did.
 */
function tokenML(kind: TokenKind, m: RegExpExecArray): string | null {
  switch (kind) {
    // m[1] = the braced pair (⌢{AC}), m[2] = the bare pair — either way the over-arc replaces the token.
    case 'arc':
      return arcML(m[1] ?? m[2]);
    case 'sub':
      return subML(m[0]);
    case 'sup':
      return supML(m[0]);
    // A lone number is not math — it stays plain text, exactly as it always has.
    case 'value':
      return /√|\//.test(m[0]) ? valueML(m[0]) : null;
    case 'expr': {
      /**
       * An expression the value grammar could not express (#1125). `exprML` returns null when the span
       * is not a well-formed expression, and then the span stays verbatim — a renderer that half-parses
       * a formula would show the student a formula that is not the one they were given.
       */
      if (!/√|\//.test(m[0])) return null;
      const { lead, core, tail } = peelBrackets(m[0]);
      const ml = /√|\//.test(core) ? exprML(core) : null;
      return ml ? esc(lead) + ml + esc(tail) : null;
    }
  }
}

/**
 * Render `text` to an HTML string: MathML for the math tokens, escaped verbatim text for the rest.
 *
 * THE LONGEST MATCH THAT RENDERS WINS, NOT THE FIRST ONE THAT MATCHES (#1217).
 *
 * The alternatives used to sit in one alternation, and JS takes the first branch that matches at the
 * earliest position. At index 0 of `x²/9` both `SUP` (`x²`) and `EXPR` (`x²/9`) can start, so `SUP`
 * won, ate the numerator, and left a `/9` with nothing on its left to be a fraction with:
 *
 * ```
 * x/9       ->  a fraction                    a plain fraction always worked
 * x^2/9     ->  «x²» then the text «/9»       adding a power broke it
 * (x^2)/9   ->  a fraction with a power       bracketing it brought the fraction back
 * ```
 *
 * That third line is the proof this is precedence and not a rendering gap: `exprML` already composes a
 * power inside a fraction. The brackets only stopped `SUP` from matching first.
 *
 * The old order was not arbitrary and is preserved where it mattered — `EXPR` asserts a `√` or a `/`
 * inside its span up front, so on `(x-3)^2+(y-4)^2=9` and `y^2 = 54x` it never matches at all and the
 * superscript islands the corpus asserts are untouched. Ties keep the declared order.
 */
export function mathHtml(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    let best: { kind: TokenKind; m: RegExpExecArray } | null = null;
    const candidates: Array<{ kind: TokenKind; m: RegExpExecArray }> = [];
    for (const { kind, re } of TOKENS) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m) candidates.push({ kind, m });
    }
    // Longest first; `>` not `>=` keeps the declared order as the tie-break.
    candidates.sort((p, q) => q.m[0].length - p.m[0].length);
    let html: string | null = null;
    for (const c of candidates) {
      html = tokenML(c.kind, c.m);
      if (html !== null) {
        best = c;
        break;
      }
    }
    if (best && html !== null) {
      out += html;
      i += best.m[0].length;
      continue;
    }
    /**
     * Nothing rendered. The longest span that MATCHED is consumed as plain text — which is exactly
     * what the old fall-through did — or one character, so the scan always advances.
     *
     * **A refusal must consume its whole span, and that is deliberate.** Advancing one character here
     * instead would let the renderer step over a malformed delimiter and typeset the remainder:
     * `|3 - 2 / 4` carries an unmatched bar, and skipping it renders `2/4` as a fraction beside a
     * stray `|`, which is a formula the student was never given. #1125's lock catches precisely that,
     * and it caught this while #1217 was being built.
     *
     * The cost is real and accepted: `F(27/2, 0)` matches `EXPR` as `F(27/2`, whose opener sits past
     * the comma, so `exprML` refuses it and the good `27/2` inside goes down with it. That is a
     * SPAN-BOUNDARY artefact rather than malformed input, which makes it a different fix (#1208 drew
     * the same line for brackets at a span's edges) — and a different issue.
     */
    const span = candidates[0]?.m[0] ?? String.fromCodePoint(text.codePointAt(i) as number);
    out += esc(span);
    i += span.length;
  }
  return out;
}

/** Inline math rendering of a line of utterance text (math tokens as MathML, the rest verbatim). */
export function MathText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const html = useMemo(() => mathHtml(text), [text]);
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
