/**
 * The grammar of «אורך המשיק מ-P למעגל (I)?» · "the length of the tangent from P to the circle" (#2620 A4, ADR-AG-383),
 * and the word a refusal names the term by. It is kept beside the parser that reads the language, rather than inline in
 * `engine/lengths.ts` (the #2201 inline-Hebrew ratchet, the `conicRoleWords` precedent). It imports only the point-name atom (#2621 C), so the
 * engine can read it without a cycle.
 *
 * Captures: 1 the point (Hebrew), 2 the point (English), 3 the circle's name or its centre's letter, when written.
 */
import { POINT_NAME } from '../engine/pointName';

export const TANGENT_LENGTH_SOURCE = String.raw`(?:ה?אורך\s+ה?משיק\s+(?:היוצא\s+)?מ(?:ן\s+|-?\s*)(?:ה?נקודה\s+)?(${POINT_NAME})\s+(?:א?ל-?\s*)?ה?מעגל|(?:the\s+)?length\s+of\s+the\s+tangent\s+from\s+(?:the\s+)?(?:point\s+)?(${POINT_NAME})\s+to\s+the\s+circle)(?:\s+(?:ש?מרכזו\s+)?((?:${POINT_NAME}|I{1,3}|IV|V|[1-9])(?![A-Za-z0-9₀-₉])))?`;

/** The term's name in an internal refusal detail. */
export const TANGENT_WORD = 'משיק';
