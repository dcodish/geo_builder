/**
 * THE ANALYTIC TOOL'S HONESTY GATES ON THE LLM SEAM (#1356).
 *
 * The fallback ([#1251](https://github.com/dcodish/geo_builder/issues/1251)) shipped with the
 * deterministic re-parse as its only protection. That proves each returned line is *well-formed*; it
 * proves nothing about whether the decomposition still **says what the student said**. Both siblings
 * learned that the hard way and carry a battery of gates for it (`src/app/submitPipeline.ts`,
 * `src3d/parser/honesty3.ts`); this file is where analytic's live.
 *
 * It starts with the **sequence gate**, which is the one with a live case already: the model renamed
 * this product's own «ישר 1» to `l1`, and the student was then refused when they referred to their
 * line by the name they gave it ([#1297](https://github.com/dcodish/geo_builder/issues/1297)).
 *
 * The remaining gates — a dropped coordinate, a dropped or altered equation, a dropped ratio, a
 * dropped relation, an invented name — are [#1355](https://github.com/dcodish/geo_builder/issues/1355)
 * and are deliberately NOT guessed at here: they should be authored against evidence, and this product
 * emits no usage events yet ([#1243](https://github.com/dcodish/geo_builder/issues/1243)).
 */
import { restoreStatedSequences as restoreStatedSequencesShared } from '../../shell/llm/sequenceGate';

/**
 * A point label in this product: a capital letter with an optional digit subscript — `A`, `B`, `F1`.
 * Exactly what the system prompt tells the model to emit, so the two cannot drift apart silently.
 */
const LABEL = () => /[A-Z]\d*/g;
const RUN = () => /(?<![A-Za-z])(?:[A-Z]\d*){3,}(?![a-z\d])/g;

/**
 * Restore any point run the model respelled, before the lines are re-parsed.
 *
 * The algorithm is `shell/llm/sequenceGate.ts`, shared with 2-D and 3-D (#1358: this would have been
 * the third copy). Analytic supplies the least of the three: its labels carry no primes, and it needs
 * neither an utterance normaliser nor a length-preserving line mask — so `prepareLine` is the identity
 * and a line the gate does not rewrite comes back byte-for-byte.
 */
export function restoreStatedSequencesAnalytic(
  utterance: string,
  lines: string[],
): { lines: string[]; restored: string[] } {
  return restoreStatedSequencesShared(utterance, lines, {
    label: LABEL,
    run: RUN,
    normalizeUtterance: (s) => s,
    prepareLine: (line) => ({ match: line, emit: line }),
  });
}
