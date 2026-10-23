/**
 * #1455 (ADR-W-096) — A MESSAGE NAMES ONLY WHAT THE STUDENT CAN SEE.
 *
 * The honesty invariant says an error names the student's statement, never internal state. It had leaked
 * in all four builders, each fixed locally: 2-D `~tanmid-OE` / `@ctr-O`, analytic `curve-anon…` /
 * `circle-Z`, complex `#sz5_N`, and 3-D's English engine nouns («המישור «base» לא הוגדר», «גוף מסוג
 * «pyramid»»). This is the one check, product-free.
 *
 * It judges the VALUES a message interpolates, never the template: a template may quote a worked example
 * («תיבה ABCDA'B'C'D'»), and every leak so far arrived as a value. A value may name:
 *   - anything the student TYPED (case-insensitive: «זווית sdb» makes D the student's own letter);
 *   - any name the FIGURE shows (a vertex the tool lettered, «ℓ», «π1»);
 *   - words the product translated (Hebrew/English prose from its own locale) and numbers.
 * It may not carry an id-shaped token (`~x`, `@x`, `#x`, `kind-Id`), an English word the student did
 * not type (an engine noun), or a capital label that is neither typed nor drawn.
 */

export interface StudentVocabulary {
  /** Everything the student typed in this figure, joined. */
  typed: string;
  /** Every name the figure shows (points, lines, planes, vectors, symbols). */
  names: Iterable<string>;
  /**
   * #2201 phase 3b (ADR-W-130 Am. 1): the ids of the objects the figure DRAWS, and of the ones it holds but never
   * draws (a hidden scaffold, a hidden circle). A product that names objects by id fills them, so a value the tool
   * made is told from one the student can see by provenance, not by its shape.
   */
  shownIds?: Iterable<string>;
  hiddenIds?: Iterable<string>;
}

const ID_SHAPED = /[~@#][\p{L}\p{N}_-]+|\b[a-z]+-[\p{L}\p{N}_]+/gu;

/**
 * #2028 (ADR-W-130) — does `s` carry an engine token (`~x`, `@x`, `#x`, `kind-Id`)? The same id shape
 * {@link studentFacingViolations} reports, as a yes/no for a seam that must REFUSE to render a value rather
 * than report it (2-D's humaniser renders its floor sentence instead). One shape, so the next anonymous-id
 * kind is caught without a new prefix list.
 */
export function hasEngineToken(s: string): boolean {
  return new RegExp(ID_SHAPED.source, 'u').test(s);
}

const LATIN_WORD = /\b[a-z]{2,}\b/g;
const LABEL_RUN = /\b[A-Z](?:[A-Z0-9'′])*/g;
const LABEL = /[A-Z]\d*['′]*/g;

export function studentFacingViolations(values: readonly string[], vocab: StudentVocabulary): string[] {
  const typed = vocab.typed.toLowerCase();
  const names = new Set(vocab.names);
  const out: string[] = [];
  for (const v of values) {
    for (const m of v.matchAll(ID_SHAPED)) out.push(`id-shaped «${m[0]}» in «${v}»`);
    for (const m of v.matchAll(LATIN_WORD)) if (!typed.includes(m[0])) out.push(`untyped word «${m[0]}» in «${v}»`);
    for (const run of v.matchAll(LABEL_RUN)) {
      for (const l of run[0].matchAll(LABEL)) {
        if (!names.has(l[0]) && !typed.includes(l[0].toLowerCase())) out.push(`unknown label «${l[0]}» in «${v}»`);
      }
    }
  }
  return out;
}

/**
 * #2201 phase 3b ([ADR-W-130](../docs/06w-decisions-workspace.md#adr-w-130) Am. 1) — the point labels a text spells,
 * case-sensitive: «OR=r» → O, R; «S_{ABC}» → S, A, B, C. A message may name a label the student TYPED even before the
 * figure draws it.
 */
export function labelsIn(text: string): string[] {
  const out: string[] = [];
  for (const run of text.matchAll(LABEL_RUN)) for (const l of run[0].matchAll(LABEL)) out.push(l[0]);
  return out;
}

/** The numbers a text spells («AD:DB = 1:2» → 1, 2): a coefficient a message shows must be one of them. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
}

const FORMAT_CONTROLS = /[⁦-⁩‎‏]/g;
const REPEATED_VERTEX = /∠([A-Z]\d*['′]*)([A-Z]\d*['′]*)([A-Z]\d*['′]*)/g;
const COEFFICIENT = /(\d+(?:\.\d+)?)·/g;

/**
 * #2201 phase 3b — THE LEAK PREDICATE over a RENDERED message: what in it the student neither typed nor can see.
 * The student's own sentences (`said`, `other`) appear quoted «…»; they are removed first, since a student's words are
 * never judged. A violation is one of {@link studentFacingViolations}' (an id-shaped token, an untyped English word, a
 * label neither drawn nor typed), or the engine's own reasoning: an angle with a repeated vertex («∠AAB») the
 * sentences do not contain, or a coefficient («0.5·») they do not spell. `englishProse`: the message is the English
 * locale, whose words are the product's own.
 */
export function internalTextViolations(text: string, vocab: StudentVocabulary, said?: string, other?: string, opts: { englishProse?: boolean } = {}): string[] {
  const own = [said, other].filter((x): x is string => !!x?.trim()).map((x) => x.trim());
  let body = text.replace(FORMAT_CONTROLS, '');
  for (const o of own) body = body.split(`«${o}»`).join('«»');
  // an English message is English prose: its words are the product's, so only a Hebrew message is judged for them
  const out = studentFacingViolations([body], { ...vocab, typed: [vocab.typed, ...own].join(' ') }).filter((v) => !(opts.englishProse && v.startsWith('untyped word')));
  const sentences = own.join(' ');
  for (const m of body.matchAll(REPEATED_VERTEX)) {
    if ((m[1] === m[2] || m[2] === m[3]) && !sentences.includes(m[0].slice(1))) out.push(`untyped repeated-vertex angle «${m[0]}» in «${body}»`);
  }
  const nums = new Set(numbersIn(sentences));
  for (const m of body.matchAll(COEFFICIENT)) if (!nums.has(m[1])) out.push(`untyped coefficient «${m[0]}» in «${body}»`);
  return out;
}
