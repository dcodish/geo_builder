/**
 * THE ASK LANE'S ROW MODEL (#789) — each saved question, resolved against the current figure.
 *
 * The panel needs, per question: the student's own text, and either its answer (the stage-5d
 * knowledge row — a value only when the givens force one, else the WHY) or the reason it has no
 * answer to look up: the grammar cannot read it, or it is actually a STATEMENT and belongs in the
 * givens box. The 3-D posture (ADR-3D-057): any text lands in the lane; the row explains itself.
 *
 * Lives in `app/` because it composes `parser` with the fold's output — the one layer the import
 * guard permits that in. Matching is by the knowledge row's `label`, which is the query's `src` —
 * the NORMALIZED line (rules stamp `src` from their normalized input) — with consumption, so two
 * questions that normalize alike each get their own row.
 */
import { parseLineV2 } from '../parser/rules';
import type { KnowledgeRow } from '../model/knowledge';

export interface AskRow {
  /** the question as the student typed it — what the row displays */
  readonly text: string;
  /** why there is no answer to look up; null when `row` carries the answer */
  readonly note: 'unreadable' | 'statement' | null;
  /** the matched stage-5d knowledge row — value when known, why when withheld */
  readonly row: KnowledgeRow | null;
}

export function askRowsOf(asks: readonly string[], knowledge: readonly KnowledgeRow[]): AskRow[] {
  const consumed = new Set<number>();
  return asks.map((text) => {
    const r = parseLineV2(text.trim());
    if (!r.ok) return { text, note: 'unreadable', row: null };
    const l = r.line;
    // `declares` uncounted, matching readAsk — a question's mentioned names are span bookkeeping
    const states =
      l.constraints.length + l.filters.length + l.assertions.length +
      l.objects.length + l.measures.length + l.sequences.length + l.roots.length;
    const srcs = [...l.queries, ...l.ratios, ...l.exprQueries].map((a) => a.src);
    if (srcs.length === 0 || states > 0) return { text, note: 'statement', row: null };
    const at = knowledge.findIndex((k, i) => !consumed.has(i) && srcs.includes(k.label));
    // no match can only mean the fold was not given this lane (a caller bug) — read as unreadable
    // rather than inventing an answer
    if (at === -1) return { text, note: 'unreadable', row: null };
    consumed.add(at);
    return { text, note: null, row: knowledge[at] };
  });
}
