/**
 * The analytic tool's LLM-fallback shared core (#1251) — pure, no SDK, no engine imports; the
 * `llmShared.ts` / `llmShared3.ts` pattern, third instance.
 *
 * **The model never emits facts.** It NORMALISES freeform He/En into the canonical command lines of
 * {@link COMMAND_CATALOG_ANALYTIC}, and the client re-parses every line through the deterministic
 * `parseLine`. So the model cannot drift past what this tool already understands: a hallucinated
 * sentence is refused by the same parser a student's typing meets, and nothing reaches the engine
 * that the grammar would not have accepted anyway. That is the whole safety argument, and it is
 * structural rather than a matter of prompt discipline.
 *
 * Served by the SAME proxy as 2-D and 3-D, selected by `tool: 'analytic'` in the request body.
 *
 * **Why this tool needed it more than the others** (the operator's ruling, 2026-09-19, playing round
 * #1244): 2-D and 3-D escalate an unrecognised sentence, so a grammar gap costs a paid call and
 * usually still works. Analytic had no fallback at all — `not-handled` rendered and stopped — so
 * every gap was a hard wall and every refusal was the student's final answer.
 */

import { COMMAND_CATALOG_ANALYTIC, type CatalogEntryAnalytic } from './catalogAnalytic';


export interface PromptExampleAnalytic {
  freeform: string;
  steps: string[];
}

/**
 * Few-shot examples — a contract test re-parses every step through `parseLine` (the PAR-10 pattern),
 * so an example that stops parsing fails the suite rather than teaching the model a dead spelling.
 */
export const PROMPT_EXAMPLES_ANALYTIC: PromptExampleAnalytic[] = [
  // The plainest thing a student writes: points by coordinates. `E(-1,7)` — NOT `E=(-1,7)`, which is
  // this tool's own refusal and the 2-D spelling (#1245).
  { freeform: 'סמן את הנקודות A(0,0) ו-B(6,8)', steps: ['A(0,0)', 'B(6,8)'] },
  // A line by equation, with the noun deciding the extent (ADR-AG-111, operator ruling 2026-09-19):
  // «הישר» is the infinite line, «הצלע»/«הקטע» is a segment.
  { freeform: 'the line through A and B has equation y = 2x - 4', steps: ['משוואת הישר AB היא y=2x-4'] },
  { freeform: 'הצלע CE נמצאת על הישר x-3y=0', steps: ['משוואת הצלע CE היא x-3y=0'] },
  // A cevian named the way the exam names it. Its apex must not lie on the side it is drawn to
  // (ADR-AG-110) — the model is told the rule below rather than left to produce a refusable line.
  { freeform: 'draw the median from A to BC in triangle ABC', steps: ['משולש ABC', 'AD תיכון לצלע BC'] },
  // A circle by its equation, and by its centre — two different sentences, both supported.
  { freeform: 'מעגל שמשוואתו x^2+y^2=25', steps: ['נתון מעגל שמשוואתו x^2+y^2=25'] },
  // A parameter is a DOMAIN, not a constraint (D7 kind 1) — the student's «a>0» is the whole line.
  { freeform: 'let a be a positive parameter', steps: ['a > 0'] },
  // ADR-052, the cardinal sin, in this tool's vocabulary: an unstated coordinate is not invented.
  // A point with nothing pinning it is still a point — it is NOT given made-up coordinates.
  { freeform: 'נקודה P כלשהי במישור', steps: ['נקודה P'] },
  // The honest empty list: a request this tool cannot express at all. Coordinate geometry it does not
  // have is better refused than approximated — the student is told, rather than shown a wrong figure.
  { freeform: 'find the area under the curve between x=1 and x=4', steps: [] },
];

/** The catalog rendered as the model's vocabulary — English and Hebrew side by side, one per line. */
const vocabOf = (entries: readonly CatalogEntryAnalytic[]): string =>
  entries.map((c) => `- ${c.en}   |   ${c.he}`).join('\n');

/**
 * THIS PRODUCT'S HALF OF THE PROMPT (#1359) - data only.
 *
 * The skeleton, the model, the tool schema, the request body and the response reader live once in
 * `server/llm/harness.ts`. They cannot be imported here: `BOUNDARIES.json` forbids the product ->
 * server direction, which is exactly why this file exports DATA and `server/parseHandler.ts`
 * composes it on the sanctioned server -> product edge. The shape is checked structurally where it
 * is consumed, so a drift here is a compile error there.
 *
 * The rule lines below are VERBATIM what this product's prompt has always said. #1359 changed no
 * prompt text in any tool; harmonising the wording is a separate decision with its own risk, since
 * a prompt regression is invisible to every test.
 */
export const PROMPT_SPEC_ANALYTIC = {
  toolDescription:
    'Return the analytic-geometry construction as an ordered list of canonical command strings the app understands. Empty if the request cannot be expressed.',
  stepsDescription: 'Ordered canonical command lines.',
  intro: (tool: string) => [
    "You translate a high-school student's freeform analytic-geometry request (Hebrew or English) into",
    `an ordered list of canonical command lines, returned ONLY through the ${tool} tool.`,
  ],
  rules: [
    '- Each line MUST be one of the supported canonical forms below (translate He↔En, fill in concrete labels).',
    '- Output each step in the SAME language the student wrote in. Labels (A, B, …) and numbers stay as-is.',
    '- Points are capital letters, optionally with a digit subscript (A, B, F1). Parameters are single',
    '  lowercase letters (a, k, t). The letters x and y name the AXES and can never be a point’s unknown.',
    '- A point at coordinates is written `A(3,5)` — NEVER `A=(3,5)`, which this tool does not accept.',
    '- ONLY introduce points the student names. Reuse existing labels from the context.',
    // ADR-052 — the cardinal sin, stated in this tool's own terms.
    '- NEVER invent an unstated value. If the student does not give a coordinate, a radius, a slope or a',
    '  length, do not supply one: emit the form that leaves it open (`נקודה P`, a parameter, a bare',
    '  equation) rather than a made-up number. A figure asserting a given nobody gave is the worst',
    '  outcome this tool can produce — worse than refusing.',
    // ADR-AG-111, the operator's 2026-09-19 ruling: the noun decides the extent.
    '- THE NOUN DECIDES WHAT IS DRAWN. «הישר AB» / "the line AB" is the infinite line; «הצלע AB» and',
    '  «הקטע AB» are the bounded segment. Use the noun the student used — swapping them changes the figure.',
    // ADR-AG-110 — a degenerate role is refused by the parser, so emitting one spends a paid call on a
    // line that cannot commit (the PAR-10 contract).
    '- A median or an altitude runs from a vertex to the side OPPOSITE it. Never emit one whose apex lies',
    '  on the side it is drawn to («BD תיכון לצלע AB» is rejected), and never one whose apex is its own foot.',
    // The 2-D #536 / 3-D #555 P1, third instance: a reordered letter run negates the student's given.
    '- NEVER reorder the letters of a point sequence the student wrote — the sequence IS the statement.',
    '  «∠ABC» has its vertex at B, «משולש ABC» is that cycle, and a line named AB asserts it passes through',
    '  A and through B. Copy every letter run exactly as typed.',
    '- Decompose multi-part requests into several lines, in build order: the objects a later line refers to',
    '  must be introduced by an earlier one.',
    '- A statement about EXISTING objects is not a re-construction: never re-declare a point that already exists.',
    '- If the request cannot be expressed with the supported forms, return an EMPTY list. An honest refusal',
    '  is better than an approximation.',
  ],
  vocabulary: () => vocabOf(COMMAND_CATALOG_ANALYTIC),
  examples: PROMPT_EXAMPLES_ANALYTIC,
};
