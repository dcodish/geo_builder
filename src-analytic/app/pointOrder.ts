/**
 * «(3,5)A» AND «A = (3,5)» — A POINT IN A SPELLING THE BOOK DOES NOT USE ([ADR-AG-409](../../docs/06c-decisions-analytic.md#adr-ag-409), #1774).
 *
 * The student means «A(3,5)»: right-to-left typing puts the letter on the wrong side, or the habit of «=» sits between
 * the letter and the pair. Each is a register slip, so it is TAUGHT and never accepted ([ADR-W-030](../../docs/06w-decisions-workspace.md#adr-w-030)): the sentence the book writes goes
 * in the box and one Enter records it. This module only rewrites the text. The submit decision judges the result, so a
 * rewrite the figure would not take is never taught.
 *
 * Whole-line only: every run must be a pair followed by a name, with separators between. «√(3,5)» and «(3,5)AB» stay out.
 *
 * A bare «(3,5)» is the third shape (ADR-AG-422, the operator's ruling of 2026-11-06: *"Teach it"*): one pair, alone on
 * the line, taught as «נתונה הנקודה (3,5)».
 *
 * A lowercase name «c(4,7)» is the fourth (ADR-AG-423, judged q13 under ADR-W-030): a label in a case the product does not
 * use. Taught only when the rewrite is certain: a letter the figure's own lines already use means something else there (a
 * parameter, a line's name), so it is left alone, and so are x and y, which are the plane's.
 */
import { stripFormatControls } from '../../shell/bidi';
import { POINT_NAME } from '../engine/pointName';
import { givenPointSentence } from '../parser/scopeAnalytic';

const HEAD = /^(?:(?:the\s+)?points?\s+|(?:נתונ(?:ה|ות)\s+)?(?:ה?נקוד(?:ה|ות)\s+)?)/i;
const RUN = () => new RegExp(String.raw`\(([^()]*)\)\s*(${POINT_NAME})(?![A-Za-z0-9])`, 'g');
/** «A = (3,5)», which is never accepted (the ruling of 2026-09-19 on #1245) and is taught as «A(3,5)». */
const EQUALS_RUN = () => new RegExp(String.raw`(?<![A-Za-z0-9'])(${POINT_NAME})\s*=\s*\(([^()]*)\)`, 'g');

/** «c(4,7)», «c1(4,7)»: a pair after a lowercase name. The comma keeps it a point and not a function's argument. */
const LOWER_RUN = () => new RegExp(String.raw`(?<![A-Za-z0-9'])([a-z])([0-9₀-₉]*(?:'(?![a-z]))?)\(([^()]*,[^()]*)\)`, 'g');

/** Does a line use this lowercase letter? An equation is read whole («ax»); a word of a sentence («circle») is not a use of its letters. */
const usesLetter = (line: string, letter: string): boolean => (line.includes('=') ? line : line.replace(/[A-Za-z]{3,}/g, ' ')).includes(letter);

/** What the line did wrong, and the sentence the book writes. */
export interface PointSpelling {
  readonly note: 'point-order' | 'point-equals' | 'point-bare' | 'point-case';
  readonly canonical: string;
}

/** The line in the book's spelling, or `null` when the whole line is not one of the shapes. `lines` is the figure as typed. */
export function pointSpelling(line: string, lines: readonly string[] = []): PointSpelling | null {
  const bare = /^\(([^()]*,[^()]*)\)\.?$/.exec(stripFormatControls(line).trim());
  if (bare) return { note: 'point-bare', canonical: givenPointSentence(bare[1]) };
  const head = HEAD.exec(line)?.[0] ?? '';
  const body = line.slice(head.length);
  const clean = (re: RegExp) => body.replace(re, '').replace(/[, ו-]/g, '').length === 0;
  if (body.startsWith('(') && clean(RUN())) {
    return { note: 'point-order', canonical: head + body.replace(RUN(), (_, inside: string, name: string) => `${name}(${inside})`) };
  }
  if (body.includes('=') && clean(EQUALS_RUN())) {
    return { note: 'point-equals', canonical: head + body.replace(EQUALS_RUN(), (_, name: string, inside: string) => `${name}(${inside})`) };
  }
  if (clean(LOWER_RUN())) {
    const letters = [...body.matchAll(LOWER_RUN())].map((m) => m[1]);
    if (letters.length > 0 && letters.every((l) => l !== 'x' && l !== 'y' && !lines.some((held) => usesLetter(held, l)))) {
      return { note: 'point-case', canonical: head + body.replace(LOWER_RUN(), (_, letter: string, tail: string, inside: string) => `${letter.toUpperCase()}${tail}(${inside})`) };
    }
  }
  return null;
}
