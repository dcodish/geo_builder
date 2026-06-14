/**
 * LLM-fallback shared core (Phase 7) — pure, no SDK, no engine imports.
 *
 * The deterministic grammar (`parse.ts`) runs first; whatever it can't read
 * escalates here (ADR-002/ADR-023). Rather than have the model emit raw engine
 * command JSON (easy to get subtly wrong), it **normalises** the student's
 * freeform Hebrew/English into the app's *canonical command phrasings* — the
 * exact lines the deterministic parser already understands — and the client
 * re-parses each line. The model does natural-language understanding; the tested
 * parser guarantees valid commands. The vocabulary it may use is the supported
 * `COMMAND_CATALOG`, so the LLM can never drift past what the engine supports.
 *
 * This module is imported by BOTH the server proxy (`server/llmProxy.ts`) and
 * the unit tests, so it must stay free of the Anthropic SDK and the `@/engine`
 * alias — it depends only on the (pure) catalog.
 */

import { COMMAND_CATALOG } from './catalog';

/** The model: Haiku 4.5 — cheap and sufficient for this bounded structured task. */
export const LLM_MODEL = 'claude-haiku-4-5';
export const LLM_MAX_TOKENS = 1024;
const TOOL_NAME = 'emit_steps';

/** The forced tool: the model must return an ordered list of canonical command strings. */
export const STEPS_TOOL = {
  name: TOOL_NAME,
  description:
    'Return the geometry construction as an ordered list of canonical command strings the app understands. Empty if the request cannot be expressed.',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: 'Ordered canonical command lines (each one a supported phrasing).',
        items: { type: 'string' },
      },
    },
    required: ['steps'],
    additionalProperties: false,
  },
} as const;

/** Build the system prompt: the rules + the supported vocabulary (the catalog) + a few examples. */
export function buildSystemPrompt(): string {
  const vocab = COMMAND_CATALOG.filter((c) => c.supported)
    .map((c) => `- ${c.en}   |   ${c.he}`)
    .join('\n');
  return [
    'You translate a high-school student\'s freeform geometry request (Hebrew or English) into an ordered',
    `list of canonical command lines, returned ONLY through the ${TOOL_NAME} tool.`,
    '',
    'Rules:',
    '- Each line you output MUST be one of the supported canonical forms below (you may translate He↔En and',
    '  fill in concrete labels). Do not invent new command words.',
    '- LANGUAGE: output each step in the SAME language the student wrote in. A Hebrew request → the Hebrew',
    '  canonical forms (right column); an English request → the English forms. Students read the steps back,',
    '  so they must be in the student\'s language. Geometry labels (A, B, C) and numbers stay as-is.',
    '- Points are single capital letters (A, B, C, …). Reuse labels the student names; otherwise pick fresh ones.',
    '- When the request refers to objects already on the canvas, reuse their labels (given as context).',
    '- ONLY introduce points the student actually names. Do NOT invent extra/intermediate points: "the extension',
    '  of AB" is just the line AB — do not create a new point on it. A phrase like "the tangent at D and AB meet',
    '  at E" has exactly one new point (E).',
    '- Decompose a multi-part request into several lines, in build order.',
    '- If you cannot express the request with the supported forms, return an empty list.',
    '',
    'Supported canonical forms (English | Hebrew):',
    vocab,
    '',
    'Examples (freeform → steps):',
    '"draw a square and both diagonals" → ["square ABCD","segment AC","segment BD"]',
    '"a circle with a triangle inscribed in it" → ["circle centered at O radius 5","triangle ABC inscribed in circle O"]',
    '"put M in the middle of AB and connect it to C" → ["M is the midpoint of AB","segment MC"]',
    '"מקבילית שבה AB שווה ל-6" → ["מקבילית ABCD","AB = 6"]   (Hebrew request → Hebrew steps)',
    '"צייר משולש ABC וגובה מ-A" → ["משולש ABC","גובה מ-A במשולש ABC"]',
    '"draw the tangent to the circle at A" → ["tangent to circle O at A"]',
  ].join('\n');
}

/** A short description of the current figure, so the model can reference existing objects. */
export function figureContext(pointIds: string[], circleCenters: string[]): string {
  const parts: string[] = [];
  if (pointIds.length) parts.push(`Existing points: ${pointIds.join(', ')}.`);
  if (circleCenters.length) parts.push(`Existing circles (by centre): ${circleCenters.join(', ')}.`);
  return parts.length ? parts.join(' ') : 'The canvas is empty.';
}

/** The full Messages-API request body (model, tool, forced tool_choice, message). Pure + testable. */
export function buildLlmRequest(utterance: string, context: string) {
  return {
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    system: buildSystemPrompt(),
    tools: [STEPS_TOOL],
    tool_choice: { type: 'tool' as const, name: TOOL_NAME },
    messages: [{ role: 'user' as const, content: `${context}\n\nStudent request: "${utterance}"` }],
  };
}

/** A minimal shape of an Anthropic response content block (we avoid importing the SDK types). */
interface ContentBlock {
  type: string;
  name?: string;
  input?: unknown;
  [k: string]: unknown;
}

/** Pull the canonical step strings out of the forced tool call. null if absent/malformed. */
export function extractSteps(content: ContentBlock[]): string[] | null {
  const block = content.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
  const steps = block && typeof block.input === 'object' && block.input !== null
    ? (block.input as { steps?: unknown }).steps
    : undefined;
  if (!Array.isArray(steps)) return null;
  return steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}
