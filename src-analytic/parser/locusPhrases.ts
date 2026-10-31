/**
 * The two sentences the locus way in composes (#1177, ADR-AG-352) — grammar, so they live with the grammar.
 *
 * Each is the canonical spelling the tool already reads: the ask lane's `LOCUS_OF` question, and the free-point
 * declaration (02c R92). Composing them here, rather than spelling them at each caller, keeps the chip, the guide row
 * and the taught one-line refusal on one spelling.
 */
import type { Id } from '../engine/types';

/** The question a locus chip asks: «המקום הגיאומטרי של M». */
export const locusSentence = (id: Id): string => `המקום הגיאומטרי של ${id}`;

/** The line that names a point before it is placed: «נקודה M». */
export const pointDeclaration = (id: Id): string => `נקודה ${id}`;
