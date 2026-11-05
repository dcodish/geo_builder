/**
 * «(3,5)A» — A POINT WITH ITS LETTER AFTER ITS COORDINATES ([ADR-AG-409](../../docs/06c-decisions-analytic.md#adr-ag-409), #1774).
 *
 * The student means «A(3,5)»; right-to-left typing puts the letter on the wrong side. It is a register slip, so it is
 * TAUGHT and never accepted ([ADR-W-030](../../docs/06w-decisions-workspace.md#adr-w-030)): the sentence the book writes goes
 * in the box and one Enter records it. This module only rewrites the text. The submit decision judges the result, so a
 * rewrite the figure would not take is never taught.
 *
 * Whole-line only: every run must be a pair followed by a name, with separators between. «√(3,5)» and «(3,5)AB» stay out.
 */
import { POINT_NAME } from '../engine/pointName';

const HEAD = /^(?:(?:the\s+)?points?\s+|(?:נתונ(?:ה|ות)\s+)?(?:ה?נקוד(?:ה|ות)\s+)?)/i;
const RUN = () => new RegExp(String.raw`\(([^()]*)\)\s*(${POINT_NAME})(?![A-Za-z0-9])`, 'g');

/** The line with each name moved in front of its coordinates, or `null` when the line is not that shape. */
export function pointOrderCanonical(line: string): string | null {
  const head = HEAD.exec(line)?.[0] ?? '';
  const body = line.slice(head.length);
  if (!body.startsWith('(')) return null;
  if (body.replace(RUN(), '').replace(/[, ו-]/g, '').length > 0) return null;
  return head + body.replace(RUN(), (_, inside: string, name: string) => `${name}(${inside})`);
}
