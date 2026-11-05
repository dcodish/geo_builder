/**
 * «(3,5)A» AND «A = (3,5)» — A POINT IN A SPELLING THE BOOK DOES NOT USE ([ADR-AG-409](../../docs/06c-decisions-analytic.md#adr-ag-409), #1774).
 *
 * The student means «A(3,5)»: right-to-left typing puts the letter on the wrong side, or the habit of «=» sits between
 * the letter and the pair. Each is a register slip, so it is TAUGHT and never accepted ([ADR-W-030](../../docs/06w-decisions-workspace.md#adr-w-030)): the sentence the book writes goes
 * in the box and one Enter records it. This module only rewrites the text. The submit decision judges the result, so a
 * rewrite the figure would not take is never taught.
 *
 * Whole-line only: every run must be a pair followed by a name, with separators between. «√(3,5)» and «(3,5)AB» stay out.
 */
import { POINT_NAME } from '../engine/pointName';

const HEAD = /^(?:(?:the\s+)?points?\s+|(?:נתונ(?:ה|ות)\s+)?(?:ה?נקוד(?:ה|ות)\s+)?)/i;
const RUN = () => new RegExp(String.raw`\(([^()]*)\)\s*(${POINT_NAME})(?![A-Za-z0-9])`, 'g');
/** «A = (3,5)», which is never accepted (the ruling of 2026-09-19 on #1245) and is taught as «A(3,5)». */
const EQUALS_RUN = () => new RegExp(String.raw`(?<![A-Za-z0-9'])(${POINT_NAME})\s*=\s*\(([^()]*)\)`, 'g');

/** What the line did wrong, and the sentence the book writes. */
export interface PointSpelling {
  readonly note: 'point-order' | 'point-equals';
  readonly canonical: string;
}

/** The line in the book's spelling, or `null` when the whole line is not one of the two shapes. */
export function pointSpelling(line: string): PointSpelling | null {
  const head = HEAD.exec(line)?.[0] ?? '';
  const body = line.slice(head.length);
  const clean = (re: RegExp) => body.replace(re, '').replace(/[, ו-]/g, '').length === 0;
  if (body.startsWith('(') && clean(RUN())) {
    return { note: 'point-order', canonical: head + body.replace(RUN(), (_, inside: string, name: string) => `${name}(${inside})`) };
  }
  if (body.includes('=') && clean(EQUALS_RUN())) {
    return { note: 'point-equals', canonical: head + body.replace(EQUALS_RUN(), (_, name: string, inside: string) => `${name}(${inside})`) };
  }
  return null;
}
