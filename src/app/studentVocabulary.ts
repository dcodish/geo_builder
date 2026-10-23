/**
 * #2201 phase 3b ([ADR-W-130](../../docs/06w-decisions-workspace.md#adr-w-130) Am. 1) — WHAT THE STUDENT CAN SEE AND
 * WHAT THEY TYPED, for one 2-D figure: the vocabulary a refusal's values are checked against by provenance
 * (`humanizeError`'s provenance check) instead of by their shape.
 *
 *  - `names`: every point the figure holds under a student-readable label (a scaffold `~…` and an anonymous `@…` are
 *    machinery, never a name);
 *  - `shownIds`: those points and every DRAWN circle (`circleRefs` — a hidden or scaffold circle is absent), plus the
 *    other non-hidden objects;
 *  - `hiddenIds`: what the construction holds but never draws (the tangent's Thales circle `tanaux-…`, a hidden
 *    circumcircle, a scaffold point);
 *  - `typed`: every line the student entered (the enabled facts' own words, and the line being refused).
 *
 * One function: App's banner, its row tooltip and the submit pipeline all build the vocabulary here, and so do the
 * locks (docs/17 §9 — a lock calls the decision, it never re-implements it).
 */
import { circleRefs, type Construction } from '@/engine';
import type { StudentVocabulary } from '../../shell/studentText';
import { circleResolver, explainError, type Translate } from '@/i18n/humanizeError';

const isScaffold = (id: string) => id.startsWith('~') || id.startsWith('@');

export function studentVocabulary(construction: Pick<Construction, 'objects'>, typedLines: readonly (string | undefined)[]): StudentVocabulary {
  const drawnCircles = circleRefs(construction as Construction);
  const names: string[] = [];
  const shownIds: string[] = [];
  const hiddenIds: string[] = [];
  for (const o of construction.objects as readonly { id: string; kind: string; hidden?: boolean }[]) {
    if (o.kind === 'circle') (drawnCircles.has(o.id) ? shownIds : hiddenIds).push(o.id);
    else if (o.hidden || isScaffold(o.id)) hiddenIds.push(o.id);
    else {
      shownIds.push(o.id);
      if (/^[A-Z]/.test(o.id) && !/-/.test(o.id)) names.push(o.id);
    }
  }
  return { typed: typedLines.filter((x): x is string => !!x).join('\n'), names, shownIds, hiddenIds };
}

/** The vocabulary of a displayed figure: its construction, and the words of its enabled facts. */
export const figureVocabulary = (construction: Pick<Construction, 'objects'>, facts: readonly { enabled: boolean; utterance?: string }[]): StudentVocabulary =>
  studentVocabulary(construction, facts.filter((f) => f.enabled).map((f) => f.utterance));

/**
 * THE refusal text of a displayed figure: `explainError` with the figure's circle names (#2305) and its vocabulary
 * (#2201 3b). App's banner, its row tooltip and the submit pipeline's `explainError` are this function; so is the
 * leak lock (`student-text-leak-lock.test.ts`).
 */
export function figureExplainer(t: Translate, construction: Construction, facts: readonly { enabled: boolean; utterance?: string }[]) {
  const circles = circleResolver(circleRefs(construction));
  const vocab = figureVocabulary(construction, facts);
  return (raw: string | null | undefined, said?: string, other?: string): string => explainError(raw, t, said, other, circles, vocab);
}
