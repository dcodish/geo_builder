/**
 * The 3-D tool's LLM-fallback shared core (V5, ADR-3D-008) — pure, no SDK, no
 * engine imports; the 2-D `llmShared.ts` pattern. The model NORMALISES freeform
 * He/En into the canonical command lines of `COMMAND_CATALOG_3D`; the client
 * re-parses every line through the deterministic `parse3`, so the model can never
 * drift past what the engine supports. Served by the SAME proxy as the 2-D tool,
 * selected by a `tool: '3d'` field in the request body (no new infrastructure).
 */

import { COMMAND_CATALOG_3D } from './catalog3';

export const LLM_MODEL_3D = 'claude-haiku-4-5';
export const LLM_MAX_TOKENS_3D = 1024;
const TOOL_NAME = 'emit_steps';

export const STEPS_TOOL_3D = {
  name: TOOL_NAME,
  description:
    'Return the 3-D space/vectors construction as an ordered list of canonical command strings the app understands. Empty if the request cannot be expressed.',
  input_schema: {
    type: 'object',
    properties: {
      steps: { type: 'array', description: 'Ordered canonical command lines.', items: { type: 'string' } },
    },
    required: ['steps'],
    additionalProperties: false,
  },
} as const;

export interface PromptExample3 {
  freeform: string;
  steps: string[];
}

/** Few-shot examples — a contract test re-parses every step (the PAR-10 pattern). */
export const PROMPT_EXAMPLES_3D: PromptExample3[] = [
  { freeform: 'צייר קובייה עם אלכסון מהפינה C למעלה', steps: ['קובייה ABCD', "קטע CA'"] },
  // #290: the freeform must STATE "right" — a bare "a prism" must never be upgraded to a right prism (ADR-052).
  { freeform: 'a right triangular prism with M in the middle of the top edge BB prime', steps: ['right triangular prism ABC', "M is the midpoint of BB'"] },
  // #295: a prism NOT stated right is OBLIQUE — a parallelogram base ⇒ מקבילון (never invent "right").
  { freeform: 'a prism whose base is a parallelogram', steps: ['מקבילון'] },
  // #321: the parallelogram FAMILY builds oblique with its base stated — never downgrade a rhombus/
  // rectangle/square base to a plain parallelogram (that silently drops the stated base shape).
  { freeform: 'a prism whose base is a rhombus', steps: ['מנסרה שבסיסה מעוין'] },
  // #290: a prism with no base shape at all is not expressible — the honest output is an empty list.
  { freeform: 'a prism', steps: [] },
  { freeform: 'סמן את הצלעות של הקובייה כוקטורים u v w', steps: ['קובייה ABCD', "נסמן: AB = u, AD = v, AA' = w"] },
  { freeform: 'שני מישורים שהזווית ביניהם 45 מעלות', steps: ['המישור π1: z - 3 = 0', 'המישור π2: ay + z - 8 = 0', 'הזווית בין המישורים π1 ו-π2 היא 45'] },
  { freeform: 'a cone with apex S over center O, radius 5 and height 12', steps: ['cone with apex S base center O radius 5 height 12'] },
];

const renderExample = (e: PromptExample3): string => `"${e.freeform}" → ${JSON.stringify(e.steps)}`;

export function buildSystemPrompt3(): string {
  const vocab = COMMAND_CATALOG_3D.map((c) => `- ${c.en}   |   ${c.he}`).join('\n');
  return [
    "You translate a high-school student's freeform 3-D geometry / vectors request (Hebrew or English) into",
    `an ordered list of canonical command lines, returned ONLY through the ${TOOL_NAME} tool.`,
    '',
    'Rules:',
    '- Each line MUST be one of the supported canonical forms below (translate He↔En, fill in concrete labels).',
    '- Output each step in the SAME language the student wrote in. Labels (A, B, …) and numbers stay as-is.',
    "- Points are capital letters, optionally primed (A', B'). Vector names are single lowercase letters (u, v, w).",
    '- ONLY introduce points the student names. Reuse existing labels from the context.',
    // #290 (ADR-052): the LLM must never assert a given the student did not state — the property twin
    // of the "only introduce named points" rule. A silently-invented "right"/size/angle is the cardinal sin.
    '- NEVER invent an unstated property. A prism NOT stated to be right (ישרה / ישר) is OBLIQUE — never emit',
    '  a right/ישרה prism the student did not ask for (a parallelogram-base prism with no ישרה is `מקבילון`).',
    // #321: the drop twin of the never-invent rule — a stated base SHAPE must survive the decomposition.
    '  NEVER drop a stated base shape either: a rhombus/rectangle/square base prism with no ישרה is',
    '  `מנסרה שבסיסה מעוין` / `מנסרה שבסיסה מלבן` / `מנסרה שבסיסה ריבוע` — never a plain `מקבילון`.',
    '  Likewise do NOT fill in an omitted size / angle / relation. If a request cannot be expressed at all',
    '  (e.g. a prism with no base shape given), return an EMPTY list rather than guessing.',
    '- A statement about EXISTING objects is not a re-construction: never re-declare an existing point or solid.',
    '  If you cannot express it with a supported NON-constructing form, return an empty list.',
    '- Decompose multi-part requests into several lines, in build order.',
    '- If the request cannot be expressed with the supported forms, return an empty list.',
    '',
    'Supported canonical forms (English | Hebrew):',
    vocab,
    '',
    'Examples (freeform → steps):',
    ...PROMPT_EXAMPLES_3D.map(renderExample),
  ].join('\n');
}

/** The full Messages-API request body — the proxy calls this when the body says `tool: '3d'`. */
export function buildLlmRequest3(utterance: string, context: string) {
  return {
    model: LLM_MODEL_3D,
    max_tokens: LLM_MAX_TOKENS_3D,
    system: buildSystemPrompt3(),
    tools: [STEPS_TOOL_3D],
    tool_choice: { type: 'tool' as const, name: TOOL_NAME },
    messages: [{ role: 'user' as const, content: `${context}\n\nStudent request: "${utterance}"` }],
  };
}
