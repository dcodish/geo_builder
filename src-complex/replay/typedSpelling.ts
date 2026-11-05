/**
 * #1497 ([ADR-W-179](../../docs/06w-decisions-workspace.md#adr-w-179)) — A TYPED NUMBER ON THE CANVAS, AS IT WAS TYPED.
 *
 * The complex rows ARE the student's lines, so its given rows always kept their spelling. Its one re-speller was the
 * canvas label of a number typed with no parameter: D1 (ADR-CX-065) says it shows as typed in the view's own form, and
 * the value layer holds an exact Rat, so «z = 0.5+1.25i» read «z = 1/2+(5/4)i» and «z = √8cis45» read «z = 2√2·cis45°».
 *
 * The constraint already quotes its line (`Constraint.src`). This reads the spelling of the parts from that quote through
 * the shared `shell/literal` and never decides anything about the number: the value stays the fold's, and a part that
 * does not read as the value the fold holds gives no label, so the reading stands. Only the view the line was typed in
 * changes («the view's own form»); the other view is a conversion, and the panel keeps its readings.
 */
import { givenText, readLiteral } from '../../shell/literal';

const no = (): string => '';
/** The right side of a one-`=` line, with its spaces gone. */
const rightSide = (src: string): string | null => {
  const sides = src.split('=');
  return sides.length === 2 ? sides[1].replace(/\s+/g, '') : null;
};

/** `re`, `imi` or `re±imi`, split at the last top-level sign, or null. */
function cartesianParts(rhs: string): { re: string; im: string | null } | null {
  if (!rhs.endsWith('i')) return { re: rhs, im: null };
  let depth = 0;
  for (let k = rhs.length - 1; k > 0; k -= 1) {
    const ch = rhs[k];
    if (ch === ')') depth += 1;
    else if (ch === '(') depth -= 1;
    else if (depth === 0 && (ch === '+' || ch === '-' || ch === '−')) return { re: rhs.slice(0, k), im: rhs.slice(k) };
  }
  return { re: '', im: rhs };
}

/** The imaginary coefficient as typed, signed: «+», «-» or a literal; null when it does not read as `value`. */
function imaginaryText(raw: string, value: number): string | null {
  const body = raw.replace(/[·*]?i$/, '').replace(/^\+/, '');
  if (body === '' || body === '-' || body === '−') return Math.abs(Math.abs(value) - 1) < 1e-9 ? (body === '' ? '' : '-') : null;
  const text = givenText(value, body, no);
  if (text === '' || readLiteral(body) === null) return null;
  const mag = text.replace(/^-/, '');
  return `${text.startsWith('-') ? '-' : ''}${mag.includes('/') ? `(${mag})` : mag}`;
}

/** «0.5+1.25i» as a cartesian reading, or null when the line is no literal of `z`. */
export function typedCartesian(src: string, display: string, z: { re: number; im: number }): string | null {
  const rhs = rightSide(src);
  const parts = rhs === null ? null : cartesianParts(rhs);
  if (!parts) return null;
  const re = parts.re === '' ? '' : readLiteral(parts.re) ? givenText(z.re, parts.re, no) : null;
  if (re === null || (parts.re !== '' && re === '')) return null;
  if (parts.im === null) return `${display} = ${re}`;
  const im = imaginaryText(parts.im, z.im);
  if (im === null) return null;
  const glue = re === '' || im.startsWith('-') ? '' : '+';
  return `${display} = ${re}${glue}${im}i`;
}

/** The polar reading with its modulus as typed («√8cis45» → «z = √8·cis45°»), or null. */
export function typedPolar(src: string, reading: string, modulus: number): string | null {
  const rhs = rightSide(src);
  const typed = rhs?.match(/^(.+?)[·*]?cis/)?.[1];
  const shape = reading.match(/^(.* = ).+?(·cis.*)$/);
  if (!typed || !shape || !readLiteral(typed)) return null;
  const text = givenText(modulus, typed, no);
  return text === '' ? null : `${shape[1]}${text}${shape[2]}`;
}
