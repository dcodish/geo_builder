/**
 * #1497 ([ADR-W-179](../docs/06w-decisions-workspace.md#adr-w-179)) — A STATED NUMBER, AND HOW THE STUDENT SPELLED IT.
 *
 * Operator, 2026-09-28: *"we need to keep the format of entry"*; ruled for every tool: a given is printed as the
 * student typed it, a derived value goes through the tiers, and a typed `√8` stays `√8`. Every printer used to guess
 * a spelling from the float the parser left behind, so `2/3` read `0.6667` and `0.5` read `1/2`. Pure string
 * surgery with no product knowledge; the caller decides which slots state a number.
 *
 * Two functions, one for each end of the seam:
 *  - {@link readLiteral} at the parser: a signed literal's value and its spelling;
 *  - {@link givenText} at every given printer: the text a student reads for a given.
 *
 * sr-22 ([ADR-W-175](../docs/06w-decisions-workspace.md#adr-w-175), 2026-11-02) is the newer ruling and it binds a
 * typed DECIMAL: «7.9999» reads «8», computed with the full value, so a decimal spelling prints through `fmtNum`
 * and never as the raw text. A fraction, a root or an integer prints exactly as written.
 */

import { fmtNum } from './format';
import { spellVulgarFractions } from './vulgarFractions';

const UNUM = String.raw`\d+(?:\.\d+)?`;
/** `48`, `(48)`, `(12/4)`. */
const RADICAND = String.raw`\(\s*${UNUM}(?:\s*\/\s*${UNUM})?\s*\)|${UNUM}`;
/** `[coef][*·]√radicand[/den]`, `p/q`, or a number: the unsigned family every builder's value slot reads. */
const LITERAL_RE = new RegExp(String.raw`^(${UNUM})?\s*(?:[*·]\s*(?=√))?\s*(?:√\s*(${RADICAND}))?\s*(?:\/\s*(${UNUM}))?$`);
const RADICAND_FRAC_RE = new RegExp(String.raw`^(${UNUM})\s*\/\s*(${UNUM})$`);

/** A stated number: its value, and the student's spelling with whitespace, a product sign and outer brackets normalised. */
export interface Literal {
  readonly value: number;
  readonly src: string;
  /** Spelled as a decimal numeral («4.1»): a decimal prints in the house decimals (sr-22), never as the raw text. */
  readonly decimal: boolean;
}

const radicandValue = (raw: string): number | null => {
  const inner = raw.trim().replace(/^\(\s*(.*?)\s*\)$/, '$1');
  const frac = inner.match(RADICAND_FRAC_RE);
  if (frac) return +frac[2] === 0 ? null : +frac[1] / +frac[2];
  return +inner;
};

const unwrap = (s: string): string => s.trim().replace(/^\((.*)\)$/, '$1').trim();

/**
 * A signed literal, or null when `raw` is not one: `2/3`, `0.5`, `√8`, `2√3`, `√5/2`, `√(2/3)`, `(2/3)`, `-√2`, `⅔`, `2½`.
 * Null on a zero denominator, so a malformed value refuses rather than reaching a figure as NaN or Infinity.
 */
export function readLiteral(raw: string): Literal | null {
  let body = unwrap(spellVulgarFractions(raw));
  const sign = body[0] === '-' || body[0] === '−' ? -1 : 1;
  if (/^[-−+]/.test(body)) body = unwrap(body.slice(1));
  if (body === '') return null;
  const m = body.match(LITERAL_RE);
  if (!m || (!m[1] && !m[2])) return null;
  const a = m[1] ? +m[1] : 1;
  const radicand = m[2] !== undefined ? radicandValue(m[2]) : 1;
  if (radicand === null) return null;
  const d = m[3] ? +m[3] : 1;
  if (d === 0) return null;
  const v = (a * (m[2] !== undefined ? Math.sqrt(radicand) : 1)) / d;
  const spelled = body.replace(/\s+/g, '').replace(/[*·](?=√)/, '');
  return { value: sign < 0 ? -v : v, src: `${sign < 0 ? '-' : ''}${spelled}`, decimal: /^\d+\.\d+$/.test(body) };
}

/** Do `a` and `b` state one number, to the tolerance of a solved figure? A spelling that does not was left behind by a rewrite. */
const sameValue = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

/**
 * What a student reads for a GIVEN: its spelling, or the house decimals for a decimal (sr-22).
 *
 * `tier` is the product's printer for a number nobody spelled (an old save, a tool-made value). A spelling that is a
 * literal must still read as `value`, so a term rescaled after the parse falls back to `tier`, and can never print
 * a number the figure does not hold. An expression that is no literal («2 + √3», «4π») prints as it stands.
 */
export function givenText(value: number, src: string | undefined, tier: (v: number) => string): string {
  if (src === undefined) return tier(value);
  const lit = readLiteral(src);
  if (lit === null) return src;
  if (!sameValue(lit.value, value)) return tier(value);
  return lit.decimal ? fmtNum(value) : lit.src;
}
