/**
 * #2201 phase 3b ([ADR-W-130](../../docs/06w-decisions-workspace.md#adr-w-130) Am. 1) — THE ONE RENDERING OF A
 * DECIDE NOTE. Both kinds of note the deterministic lane hands the input line go through here:
 *
 *  - an `explain` note (a raw engine refusal) is worded by the caller's `explain` — App's `explainError`, which
 *    carries the figure's circle names and its vocabulary, so the provenance check runs on it;
 *  - a `key` note is the key with its params, and the SAME provenance check runs on the params: a value that names an
 *    object by its id (`poly-ABCD`) is resolved to the student's name for it (`ABCD`) — the resolver that replaced the
 *    regex strip `decideDeterministic` used to apply itself — and a value the student can neither see nor typed (an
 *    anonymous `~…`/`@…`/`#…` token, a hidden object, a label nobody typed) renders the floor sentence instead.
 *
 * A param that is not an object reference (the student's own sentence, a word, a number, a translated `{ t: key }`)
 * is rendered as before.
 */
import type { DecideNote } from './decideDeterministic';
import { labelsIn, type StudentVocabulary } from '../../shell/studentText';

type T = (key: string, opts?: Record<string, unknown>) => string;

const ANONYMOUS = /^[~@#]/;
const OBJECT_ID = /^[a-z]+-(?=[A-Z])/;
const LABEL_RUN = /^[A-Z][A-Z0-9'′]*$/;

/** One param value → what the student reads, or `null` when it names something they cannot see or never typed. */
export function noteParamText(v: string, vocab?: StudentVocabulary): string | null {
  if (ANONYMOUS.test(v)) return vocab ? null : v;
  if (!OBJECT_ID.test(v)) return v;
  const name = v.replace(OBJECT_ID, '');
  if (!vocab) return name;
  if (new Set(vocab.hiddenIds ?? []).has(v)) return null;
  const known = new Set([...vocab.names, ...labelsIn(vocab.typed)]);
  // a run of the student's letters («ABCD»), each one drawn or typed — a mint suffix («O-2») is no name they can see
  return LABEL_RUN.test(name) && labelsIn(name).every((l) => known.has(l)) ? name : null;
}

export function renderNote(n: DecideNote, ctx: { t: T; explain: (raw: string) => string; vocab?: StudentVocabulary; said?: string }): string {
  if ('explain' in n) return ctx.explain(n.explain);
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n.params ?? {})) {
    if (v && typeof v === 'object' && 't' in v) params[k] = ctx.t((v as { t: string }).t);
    else if (typeof v === 'string') {
      // the student's own sentence is never judged
      const text = v === ctx.said?.trim() ? v : noteParamText(v, ctx.vocab);
      if (text === null) return ctx.t('errors.floor');
      params[k] = text;
    } else params[k] = v;
  }
  const own = ctx.t(n.key, n.params ? params : undefined);
  return n.also ? `${own} ${renderNote(n.also, ctx)}` : own;
}
