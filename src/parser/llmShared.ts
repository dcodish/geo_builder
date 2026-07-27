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

/**
 * The few-shot examples shown in the system prompt (freeform → canonical steps). Extracted from the prompt
 * string so a CONTRACT TEST can re-parse every `steps[i]` and catch a drifted example — one the prompt
 * teaches the model to emit that the deterministic parser can no longer read (PAR-10). Each `steps` line is
 * a canonical form the parser must understand; `note` is an inline parenthetical for the human reader.
 * `ctx` seeds the re-parse when a step references an object an earlier step (or the illustrative figure)
 * introduces — e.g. a lone "tangent to circle O at A" assumes a circle O already exists.
 */
export interface PromptExample {
  freeform: string;
  steps: string[];
  note?: string;
  /** Extra context the steps assume (a pre-existing circle, etc.) — for the contract test's re-parse. */
  ctx?: { points?: string[]; circles?: string[] };
}

export const PROMPT_EXAMPLES: PromptExample[] = [
  { freeform: 'draw a square and both diagonals', steps: ['square ABCD', 'segment AC', 'segment BD'] },
  // #293 (ADR-052): this example USED to emit `circle centered at O radius 5` first — a radius the student
  // never stated. Measured: with that line the circle's radius is `{via:'length', value:5}` (PINNED); the
  // inscribe line ALONE produces an identical object set with `{via:'free', value:5}` (a free DOF, 5 being
  // only the seed). So the fabricated line was both unnecessary and an invented given — the exact sin the
  // engine's own ADR-052 audit removed from the engine, still being taught here.
  { freeform: 'a circle with a triangle inscribed in it', steps: ['triangle ABC inscribed in circle O'], note: 'no radius invented — the circle comes with the inscribe, its size stays free' },
  { freeform: 'put M in the middle of AB and connect it to C', steps: ['M is the midpoint of AB', 'segment MC'] },
  { freeform: 'מקבילית שבה AB שווה ל-6', steps: ['מקבילית ABCD', 'AB = 6'], note: 'Hebrew request → Hebrew steps' },
  { freeform: 'צייר משולש ABC וגובה מ-A', steps: ['משולש ABC', 'גובה מ-A במשולש ABC'] },
  { freeform: 'draw the tangent to the circle at A', steps: ['tangent to circle O at A'], ctx: { circles: ['O'], points: ['A'] } },
  // A named shape the deterministic parser already knows — keep it as ONE canonical line (do NOT hand-expand
  // it into constraints; the app decomposes it). Only fall back to primitives for a shape with NO canonical
  // form (e.g. an irregular n>4 polygon → a loop of segments).
  { freeform: 'a kite ABCD', steps: ['kite ABCD'] },
  { freeform: 'דלתון ABCD', steps: ['דלתון ABCD'] },
  { freeform: 'an isosceles triangle ABC', steps: ['isosceles triangle ABC'] },
  { freeform: 'a regular hexagon ABCDEF', steps: ['regular hexagon ABCDEF'] },
  { freeform: 'a convex pentagon ABCDE', steps: ['segment AB', 'segment BC', 'segment CD', 'segment DE', 'segment EA'], note: 'no regular-polygon claim — just the outline' },
  // Expand a quantifier ("each vertex") and pair things up into the supported two-tangents-meet form.
  { freeform: 'דרך כל קודקוד של משולש ABC מעבירים משיק למעגל, והמשיקים נפגשים בנקודות D E F', steps: ['המשיק בנקודה A והמשיק בנקודה B נפגשים בנקודה D', 'המשיק בנקודה B והמשיק בנקודה C נפגשים בנקודה E', 'המשיק בנקודה C והמשיק בנקודה A נפגשים בנקודה F'], ctx: { circles: ['O'], points: ['A', 'B', 'C'] } },
  { freeform: 'tangents at each vertex of triangle ABC meet at D, E, F', steps: ['the tangent at A and the tangent at B meet at D', 'the tangent at B and the tangent at C meet at E', 'the tangent at C and the tangent at A meet at F'], ctx: { circles: ['O'], points: ['A', 'B', 'C'] } },
];

/** Render one example back to the `"freeform" → ["step", …]` prompt line (with an optional note). */
function renderExample(e: PromptExample): string {
  return `"${e.freeform}" → ${JSON.stringify(e.steps)}${e.note ? `   (${e.note})` : ''}`;
}

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
    '- Points are capital letters, optionally with a subscript (A, B, C, …, O1, O2). Reuse labels the student',
    '  names; otherwise pick fresh ones.',
    '- When the request refers to objects already on the canvas, reuse their labels (given as context).',
    '- ONLY introduce points the student actually names. Do NOT invent extra/intermediate points: "the extension',
    '  of AB" is just the line AB — do not create a new point on it. A phrase like "the tangent at D and AB meet',
    '  at E" has exactly one new point (E).',
    // #293 (ADR-052), the 2-D twin of the 3-D rule added by #290: the model must never assert a given the
    // student did not state — the PROPERTY twin of the "only introduce named points" rule above. A silently
    // invented size / angle / right-angle / shape specialisation is the cardinal sin: the engine treats every
    // unstated magnitude as a free degree of freedom, so a fabricated given quietly narrows the figure to one
    // the question never described.
    '- NEVER invent an unstated property. Do NOT fill in a size, length, angle, radius or relation the student',
    '  did not give: "a circle" has NO radius (just name it — its size stays free), "a triangle" is not',
    '  isosceles or right, "a quadrilateral" is not a parallelogram. Emit the plain form and let the app keep',
    '  the unstated parts free.',
    '- NEVER drop a property the student DID state: a stated shape word, size, angle or relation must survive',
    '  into the steps. If you cannot express it, return an empty list rather than emitting a weaker figure.',
    '- Decompose a multi-part request into several lines, in build order.',
    '- If you cannot express the request with the supported forms, return an empty list.',
    '',
    'Supported canonical forms (English | Hebrew):',
    vocab,
    '',
    'Examples (freeform → steps):',
    ...PROMPT_EXAMPLES.map(renderExample),
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
