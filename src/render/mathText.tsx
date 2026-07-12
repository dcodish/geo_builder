/**
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

const NUM = String.raw`\d+(?:\.\d+)?`;
// a radicand: a parenthesised number/fraction (the √() grouping) OR a bare number
const RADICAND = String.raw`\(\s*${NUM}(?:\s*\/\s*${NUM})?\s*\)|${NUM}`;
// a value TERM: `[coef] √ radicand`, or a plain number
const RTERM = String.raw`(?:${NUM}\s*[*·]?\s*)?√\s*(?:${RADICAND})|${NUM}`;
// a value: TERM optionally over TERM
const VALUE = String.raw`(?:${RTERM})(?:\s*\/\s*(?:${RTERM}))?`;
const SUB = String.raw`[A-Za-z]_\{[A-Za-z0-9]+\}`;
const SUP = String.raw`[A-Za-z0-9](?:²|\^\d+)`;
// One tokenizer over the line: a subscript, a superscript, or a value expression (post-filtered to those
// that actually carry a √ or a `/`, so a lone number stays plain text).
const TOKEN = new RegExp(`(${SUB})|(${SUP})|(${VALUE})`, 'g');

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
  const m = t.match(/^([A-Za-z0-9])(²|\^(\d+))$/)!;
  const exp = m[2] === '²' ? '2' : m[3];
  return `<math><msup>${/\d/.test(m[1]) ? mn(m[1]) : mi(m[1])}${mn(exp)}</msup></math>`;
}

/** True when the text carries math notation worth formatting (a radical, a fraction, a subscript, a power). */
export function hasMath(text: string): boolean {
  return /√|_\{|²|\^\d|\d\s*\/\s*[\d√]/.test(text);
}

/** Render `text` to an HTML string: MathML for the math tokens, escaped verbatim text for the rest. */
export function mathHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index!;
    out += esc(text.slice(last, i));
    if (m[1]) out += subML(m[1]);
    else if (m[2]) out += supML(m[2]);
    else if (m[3] && /√|\//.test(m[3])) out += valueML(m[3]);
    else out += esc(m[0]); // a lone number matched by VALUE — keep as plain text
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
