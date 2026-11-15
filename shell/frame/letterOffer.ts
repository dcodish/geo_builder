/**
 * THE LETTER POPOVER'S DECISIONS (#1631) — pure, so every builder's lock can CALL them.
 *
 * The on-canvas «click a point, type its new letter» popover was written twice (2-D's FR-RN-10 menu,
 * 3-D's #578 port) and the analytic tool is the third consumer, so it lives in `shell/` (ADR-W-016's
 * seeding rule: ≥ 2 implementations). The decisions it makes are here, apart from the JSX, for the same
 * reason 2-D extracted `swapOffered` in #1199: a lock that drives only a store stays green while the
 * OFFER one layer up is wrong (ADR-532 measured exactly that), so the gate must be a named function the
 * component calls and the tests call too ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 *
 * Nothing here knows which product it serves. The product answers two questions through callbacks —
 * "rename `from` to `to`" and "exchange `a` and `b`" — and reports a refusal in this module's
 * vocabulary; the strings the student reads come from the caller.
 */

/** Who holds a taken letter, as the PRODUCT describes it: the student's own wording of the statement
 *  that introduced it, and (where the product can) a way to light that statement's row up. */
export interface LetterHolderView {
  /** the holder statement's text, quoted back verbatim («האות תפוסה על ידי: «…»») */
  text: string;
  /** select/highlight the holder's row — optional: not every builder highlights rows */
  onHighlight?: () => void;
}

/**
 * What a product's rename callback answers.
 *
 * `taken` is the one refusal the popover treats specially: it names the holder and offers the swap.
 * Every other refusal (`bad`, or a product's own reason string) shows the "invalid letter" note.
 *
 * #2893 (ADR-W-210 phase 4): `not-decided` is NOT a refusal. The product's decision reached its work limit before it
 * decided (`shell/notDecided`); the popover shows the operator's sentence with «המשיכו לחפש» where it shows the invalid
 * note, and the button calls the same callback again with `round` (the round to run, as the product handed it back).
 */
export type LetterRenameResult =
  | { ok: true }
  /** `round` (#2893): with `not-decided`, the round «המשיכו לחפש» passes back */
  | { ok: false; reason: 'taken' | 'bad' | 'not-decided' | (string & {}); holder?: LetterHolderView | null; round?: number };

/** What a product's swap callback answers. #2893: `notDecided` = its decision reached the work limit (see above). */
export interface LetterSwapResult {
  ok: boolean;
  notDecided?: { round: number };
}

/** #2893: the attempt «המשיכו לחפש» repeats, and the round it runs. */
export type LetterRetry = { kind: 'rename'; to: string; round: number } | { kind: 'swap'; to: string; round: number };

/**
 * THE TAKEN-LETTER OFFER'S SCOPE — a swap is offered wherever the letter has a holder (#1199, ADR-532).
 *
 * **Operator ruling, 2026-09-18: «always allow switching names of nodes».** Before it, 2-D gated the
 * offer on a flag that read only the TARGET's holder, so one pair of letters was refused in one direction
 * and offered in the other. It is a named predicate rather than an inline `true` so the decision is
 * CALLABLE: the offer's scope has one home and one lock, and a future narrowing has to come through here.
 */
export const swapOffered = <H>(holder: H | null | undefined): boolean => holder != null;

/** The typed letter as the popover hands it on: trimmed and upper-cased (every builder's labels are
 *  capitals; a product with a richer label grammar — 3-D's prime — normalises further itself). */
export const typedLetter = (raw: string): string => raw.trim().toUpperCase();

/** The popover's state after an attempt. `close` ends it; otherwise `note` and `takenBy` are shown. */
export interface LetterPopoverOutcome {
  close: boolean;
  note: 'taken' | 'bad' | 'not-decided' | null;
  /** the holder to quote and the letter the student asked for — the swap offer's two halves */
  takenBy: { holder: LetterHolderView; to: string } | null;
  /** #2893: what «המשיכו לחפש» runs, when `note` is `not-decided` */
  retry?: LetterRetry;
}

/**
 * The reducer from a rename answer to what the popover shows (2-D's `applyRename`, #238 / ADR-520).
 *
 * A refusal keeps the popover OPEN with its reason — a menu that closed on failure would read as "it
 * worked" (#578). A taken letter names its holder (when the product knows one) so «האות כבר בשימוש» is
 * not a dead end, and the swap offer rides on that holder.
 */
export function afterRename(res: LetterRenameResult, to: string): LetterPopoverOutcome {
  if (res.ok) return { close: true, note: null, takenBy: null };
  if (res.reason === 'not-decided') return { close: false, note: 'not-decided', takenBy: null, retry: { kind: 'rename', to, round: res.round ?? 1 } };
  if (res.reason !== 'taken') return { close: false, note: 'bad', takenBy: null };
  return { close: false, note: 'taken', takenBy: res.holder ? { holder: res.holder, to } : null };
}

/** The reducer from a swap answer (2-D's `swapLetters`, #1013): a swap that went through closes the
 *  popover; one the product refused leaves it open with the "invalid" note, the offer still showing. */
export function afterSwap(res: LetterSwapResult, to = ''): { close: boolean; note: 'bad' | 'not-decided' | null; retry?: LetterRetry } {
  if (res.ok) return { close: true, note: null };
  // #2893: a swap whose decision reached the work limit is not refused: the sentence and «המשיכו לחפש»
  if (res.notDecided) return { close: false, note: 'not-decided', retry: { kind: 'swap', to, round: res.notDecided.round } };
  return { close: false, note: 'bad' };
}

/** Fill `{{a}}`/`{{b}}` (the swap button) or `{{what}}` (the holder line) in a caller-supplied string. */
export const fillLetters = (template: string, vars: Record<string, string>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), template);
