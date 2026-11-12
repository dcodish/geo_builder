/**
 * NAME A CIRCLE'S CENTRE BY CLICKING IT (#1598) — the canvas half of «O מרכז המעגל».
 *
 * Operator, 2026-10-02: *"in analytic tool, i want to be able to press on the center of a circle to create
 * a letter in addition to the ability to define it through input like O מרכז המעגל"*. An unnamed circle's
 * centre is an offer on the canvas (`centresOf`, #1109 / #1619 B1); clicking it now opens the SHARED letter
 * popover (`shell/frame/LetterPopover`, #1631) instead of committing the automatic letter, and the letter
 * the student types records exactly the sentence the typed path would: `centreSentenceOf` (the offer's own
 * composer, asked with that letter), decided by `decideSubmit` (the one gate every line passes). So the
 * click and the typing are ONE decision, and the recorded row is a sentence the student could have typed.
 *
 * A TAKEN letter is answered in the popover like any other: its holder, quoted, and the swap offer. The
 * swap gives the centre the asked-for letter and the old holder the letter the centre would otherwise
 * have got — one commit, so one «בטל» undoes it.
 *
 * #2851 (ADR-AG-465) — THE SAME FLOW ON A SHOWN FOCUS. Operator, 2026-11-12: *"make the focus points clickable so he
 * can nail them on the diagram"*. A focus mark that carries the book's letter is an offer; its popover opens on that
 * letter, and the letter confirmed records `focusSentenceOf`'s sentence («F1 מוקד ימני של האליפסה», «F מוקד הפרבולה»)
 * through the same gate. A taken letter is refused with its holder quoted; no swap is offered (the plan's ruling).
 */
import { decideSubmit, type SubmitVerdict } from './submit';
import { activeOf, activePins } from './active';
import { decideSwap, letterHolder, nameInUse, normalizePointName, type LetterHolder, type RelabelCommit, type RenameState } from './rename';
import { centreSentenceOf, freeLetter } from '../engine/crossings';
import { derive, type Derivation } from '../engine/derive';
import type { InputError } from '../store/useAnalyticStore';
import type { LetterRenameResult, LetterSwapResult } from '../../shell/frame/letterOffer';
import { focusSentenceOf } from './conicMarks';

export type CentreNameVerdict =
  | { kind: 'record'; verdict: Extract<SubmitVerdict, { kind: 'record' }> }
  | { kind: 'refused'; error: InputError; holder?: LetterHolder };

// #1973 (ADR-AG-430): with the session's recorded hosts, so the figure decided on is the one on the screen
const currentOf = (state: RenameState): Derivation =>
  derive(activeOf(state.lines, state.disabled), state.seed, state.seedNames ?? {}, activePins(state.hosts ?? {}, state.lines.length, state.disabled));

/** An offer's own composer: the sentence a click on it records under `letter`, or null when the offer went stale. */
type SentenceOf = (letter: string, current: Derivation) => string | null;

const centreSentence =
  (offerId: string): SentenceOf =>
  (letter, current) =>
    centreSentenceOf(current.figure, offerId, letter, current.construction);

/** The sentence the gate accepted, or why not — the one path the name and the swap, centre and focus, go through. */
function recordable(sentenceOf: SentenceOf, letter: string, state: RenameState, current: Derivation): CentreNameVerdict {
  const sentence = sentenceOf(letter, current);
  // the offer went stale under the popover (the centre was named meanwhile) — say so, never guess a circle
  if (!sentence) return { kind: 'refused', error: { key: 'already-named', detail: letter } };
  const v = decideSubmit(sentence, activeOf(state.lines, state.disabled), state.seed, current);
  if (v.kind === 'record') return { kind: 'record', verdict: v };
  if (v.kind === 'refused') return { kind: 'refused', error: v.error };
  return { kind: 'refused', error: { key: 'already-named', detail: letter } };
}

/**
 * THE DECISION — the letter `toRaw` for the centre offer `offerId`: the sentence to record, or the refusal
 * (a bad letter; a taken one, WITH its holder, so the popover can quote it and offer the swap).
 */
export function decideCentreName(offerId: string, toRaw: string, state: RenameState, current: Derivation = currentOf(state)): CentreNameVerdict {
  return decideOfferName(centreSentence(offerId), toRaw, state, current);
}

/** #2851 — the letter `toRaw` for the focus offer `offerId` (`ConicMark.offer.id`): the same decision, the focus's sentence. */
export function decideFocusName(offerId: string, toRaw: string, state: RenameState, current: Derivation = currentOf(state)): CentreNameVerdict {
  return decideOfferName((letter, cur) => focusSentenceOf(cur, offerId, letter), toRaw, state, current);
}

function decideOfferName(sentenceOf: SentenceOf, toRaw: string, state: RenameState, current: Derivation): CentreNameVerdict {
  const to = normalizePointName(toRaw);
  if (!to) return { kind: 'refused', error: { key: 'rename-bad-name', detail: toRaw.trim() } };
  if (nameInUse(state, current, to)) {
    const holder = letterHolder(state, to, current);
    return { kind: 'refused', error: { key: 'rename-taken', detail: to, ...(holder ? { holder: holder.text } : {}) }, ...(holder ? { holder } : {}) };
  }
  return recordable(sentenceOf, to, state, current);
}

/** The letter the centre is offered under before the student types one — the automatic letter (the
 *  popover's `label`, and the letter the old holder takes in a swap). */
export const centreLabelOf = (current: Derivation): string => freeLetter(current.construction);

/**
 * THE SWAP — the centre takes `taken`, and whoever held `taken` takes the centre's automatic letter.
 * Composed from the two decisions that already exist (record the centre under its automatic letter, then
 * `decideSwap`), committed as ONE session, so nothing is written unless both halves hold.
 */
export function decideCentreSwap(
  offerId: string,
  taken: string,
  state: RenameState,
  current: Derivation = currentOf(state),
): { kind: 'apply'; commit: RelabelCommit } | { kind: 'refused'; error: InputError } {
  const auto = centreLabelOf(current);
  if (nameInUse(state, current, auto)) return { kind: 'refused', error: { key: 'rename-taken', detail: auto } };
  const first = recordable(centreSentence(offerId), auto, state, current);
  if (first.kind !== 'record') return { kind: 'refused', error: first.error };
  const named: RenameState = { ...state, lines: [...state.lines, first.verdict.line] };
  const sv = decideSwap(auto, taken, named);
  if (sv.kind === 'refused') return sv;
  const { lines, queries, spokenFor, seedNames, segStyle, curveStyle, annotations } = sv;
  return { kind: 'apply', commit: { lines, queries, spokenFor, seedNames, segStyle, curveStyle, ...(annotations ? { annotations } : {}) } };
}

/** A name verdict in the popover's vocabulary: recorded, or a taken letter answered IN the popover, or the error line. */
function renameAnswer(v: CentreNameVerdict, actions: Pick<CentreActions, 'record' | 'setError'>): LetterRenameResult {
  if (v.kind === 'record') {
    actions.record(v.verdict);
    return { ok: true };
  }
  if (v.error.key === 'rename-taken' && v.holder) return { ok: false, reason: 'taken', holder: { text: v.holder.text } };
  actions.setError(v.error);
  return { ok: false, reason: v.error.key };
}

/**
 * #2851 (ADR-AG-465) — the popover's callback for one focus offer: the centre's `onRename`, the focus's sentence. No
 * `onSwap`: a taken letter quotes its holder and is refused.
 */
export function focusPopoverOps(
  offerId: string,
  state: RenameState,
  actions: Pick<CentreActions, 'record' | 'setError'>,
  current: Derivation = currentOf(state),
): { onRename: (from: string, to: string) => LetterRenameResult } {
  return { onRename: (_from, to) => renameAnswer(decideFocusName(offerId, to, state, current), actions) };
}

/** The store actions the dispatch writes through — the real ones, so the locks drive what App drives. */
export interface CentreActions {
  /** record an accepted line WITH its notice (App: `commitRecord(verdict, recordLine, t)`) */
  record: (v: Extract<SubmitVerdict, { kind: 'record' }>) => void;
  applySwap: (next: RelabelCommit) => void;
  setError: (e: InputError | null) => void;
}

/**
 * The popover's two callbacks for one centre offer, in its vocabulary — what App hands `LetterPopover` and
 * what the lock calls. A taken letter is answered IN the popover (holder + swap), so it does not also
 * light the error line; every other refusal shows this tree's own sentence there, which says WHY.
 */
export function centrePopoverOps(
  offerId: string,
  state: RenameState,
  actions: CentreActions,
  current: Derivation = currentOf(state),
): { onRename: (from: string, to: string) => LetterRenameResult; onSwap: (a: string, b: string) => LetterSwapResult } {
  return {
    onRename: (_from, to) => renameAnswer(decideCentreName(offerId, to, state, current), actions),
    onSwap: (_a, b) => {
      const v = decideCentreSwap(offerId, b, state, current);
      if (v.kind === 'refused') {
        actions.setError(v.error);
        return { ok: false };
      }
      actions.applySwap(v.commit);
      return { ok: true };
    },
  };
}
