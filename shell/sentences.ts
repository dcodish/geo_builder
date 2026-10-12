/**
 * #1778 ([ADR-W-125](../docs/06w-decisions-workspace.md#adr-w-125)) — A PASTED PARAGRAPH IS READ SENTENCE BY
 * SENTENCE, ONE ROW PER SENTENCE, IN EVERY BUILDER.
 *
 * The operator, 2026-10-05, asked what a pasted multi-sentence exam paragraph should do: **"split into rows"** —
 * each sentence becomes its own row, one given per row, and the student retypes nothing. Measured at pickup
 * (2026-10-12): no builder split a paste at a sentence end. Analytic refused «M אמצע AB. C(0,5).» whole, 2-D
 * escalated «M אמצע BC. N אמצע AC.» to the model, 3-D said «not understood» to «M אמצע AB. N אמצע BC.», complex
 * refused «z = 1 + i. w = 2 - i.» — and every one of those halves records on its own.
 *
 * A submit reads exactly one sentence; a paste is N of them. The boundary is the same in every builder, so it
 * is found ONCE, here, and each builder only wires it at its own submit seam (docs/22 §9: the fourth copy of a
 * mechanism is never written). Two pieces:
 *
 * - {@link splitSentences} — WHERE the sentences are. Pure.
 * - {@link submitSentences} — the CHAIN: each sentence goes through the builder's own one-sentence submit, in
 *   order, so the second sees the figure the first built («האנך חותך…» after the perpendicular). It stops at
 *   the first sentence the builder does not take: the rows before it stay, and the input box holds that
 *   sentence (or the canonical sentence the builder taught for it, ADR-W-030) followed by the rest — exactly
 *   what the student would have in front of them had they typed the sentences one per line.
 *
 * Nothing here knows a builder: the caller passes its own submit, and maps its own verdict to an outcome.
 */
import { stripFormatControls } from './bidi';
import { isProofTarget } from './proofTarget';

/** One sentence of a paste. */
export interface Sentence {
  /** The sentence as the builder reads it: format controls stripped, trimmed, a final «.» dropped («?»/«!» kept). */
  readonly text: string;
  /** The paste FROM this sentence on, as typed — what the input box holds when the chain stops here. */
  readonly rest: string;
}

/** A terminator: a run of «.», «?», «!» — the run may be interleaved with invisible format controls (LRM/RLM/ALM). */
const TERMINATOR = /[.?!]/;
const FORMAT = /[؜​-‏‪-‮⁦-⁩﻿]/;
/** A dotted abbreviation the dot belongs to, not a sentence end: «i.e.», «e.g.», «etc.», «vs.», «cf.», «fig.». */
const ABBREVIATION = /(?:^|[\s(])(?:(?:[A-Za-z]\.)+[A-Za-z]|etc|vs|cf|fig|approx)$/i;
const OPEN = '([{';
const CLOSE = ')]}';

/**
 * WHERE THE SENTENCES ARE — or `null` when the text is one sentence (the caller submits it as today).
 *
 * A boundary is a run of «.», «?», «!» at bracket depth 0, followed by whitespace or the end of the text, with
 * the bidi marks a copied exam carries around its tokens ignored. It is never:
 * - a decimal point («2.5») — a digit follows it, not whitespace;
 * - a dot inside parentheses or a coordinate («A(2.5, 1)», «(1. 5)») — depth is not 0;
 * - a dotted abbreviation («i.e.», «e.g.»);
 * and one sentence with a trailing dot is ONE sentence, so the answer is `null`, not a split.
 *
 * A paste that carries a claim to PROVE is never split either. ADR-W-107 (operator, 2026-10-02: *"all refused
 * with explanation"*) refuses the exam's mixed line «נתון AB = AC. הוכיחו כי …» WHOLE, recording nothing of it;
 * splitting would record its given and refuse only the claim — a change to a ruled behaviour that the
 * 2026-10-05 ruling on pastes did not make. So it reaches the builder whole, and the builder's proof refusal
 * answers it as before.
 */
export function splitSentences(input: string): Sentence[] | null {
  if (isProofTarget(input)) return null;
  const out: Sentence[] = [];
  let depth = 0;
  let start = 0;
  const push = (from: number, to: number) => {
    const text = stripFormatControls(input.slice(from, to)).trim().replace(/\.+$/, '').trim();
    if (text) out.push({ text, rest: input.slice(from).trim() });
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) depth = Math.max(0, depth - 1);
    if (depth > 0 || !TERMINATOR.test(c)) continue;
    // the whole terminator run, bidi marks included («C‎.», «AB‎.‎»)
    let j = i;
    while (j < input.length && (TERMINATOR.test(input[j]) || FORMAT.test(input[j]))) j++;
    const atEnd = j === input.length;
    if (!atEnd && !/\s/.test(input[j])) {
      i = j - 1;
      continue;
    }
    if (c === '.' && ABBREVIATION.test(stripFormatControls(input.slice(start, i)))) {
      i = j - 1;
      continue;
    }
    push(start, j);
    start = j;
    i = j - 1;
  }
  if (stripFormatControls(input.slice(start)).trim()) push(start, input.length);
  return out.length >= 2 ? out : null;
}

/**
 * What the builder's one-sentence submit did with a sentence:
 * - `consumed` — it took the sentence (recorded a row, or answered it and cleared the box): go on;
 * - `kept` — it left the sentence in the box (a refusal, a question, a guidance note): stop here;
 * - `{ prefill }` — it TAUGHT a canonical sentence (ADR-W-030) and put it in the box: stop here, keeping it.
 */
export type SentenceOutcome = 'consumed' | 'kept' | { readonly prefill: string };

/** `head` then the sentences after it, with the sentence end restored so the next Enter splits them again. */
export function joinSentences(head: string, after: string): string {
  const h = head.trim();
  if (!after) return h;
  return `${/[.?!]$/.test(h) ? h : `${h}.`} ${after}`;
}

/**
 * THE CHAIN — submit each sentence through the builder's own one-sentence submit, in order, and answer what the
 * input box holds afterwards: `''` when every sentence was taken; otherwise the sentence it stopped at (or its
 * taught canonical) followed by the rest. The caller sets its box to the answer; the sentence's own message —
 * the refusal naming it, the teaching note — is whatever the builder's submit already showed.
 */
export async function submitSentences(
  sentences: readonly Sentence[],
  submitOne: (text: string, index: number) => SentenceOutcome | Promise<SentenceOutcome>,
): Promise<string> {
  for (let i = 0; i < sentences.length; i++) {
    const outcome = await submitOne(sentences[i].text, i);
    if (outcome === 'consumed') continue;
    if (outcome === 'kept') return sentences[i].rest;
    return joinSentences(outcome.prefill, sentences[i + 1]?.rest ?? '');
  }
  return '';
}

/**
 * THE BOX'S SUBMIT, for a builder whose one-sentence submit answers a {@link SentenceOutcome} and leaves the box
 * to its caller (analytic, 3-D, complex — 2-D's pipeline owns its box and calls the two pieces above itself).
 * One sentence is the one-element case: taken → the box empties; taught → it holds the canonical; kept → it is
 * left as typed. A paragraph runs the chain and the box holds what the chain answers.
 */
export async function submitTyped(
  raw: string,
  submitOne: (text: string) => SentenceOutcome | Promise<SentenceOutcome>,
  setBox: (text: string) => void,
): Promise<void> {
  const sentences = splitSentences(raw);
  if (sentences) {
    setBox(await submitSentences(sentences, submitOne));
    return;
  }
  const outcome = await submitOne(raw);
  if (outcome === 'consumed') setBox('');
  else if (outcome !== 'kept') setBox(outcome.prefill);
}
