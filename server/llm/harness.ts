/**
 * THE ONE LLM REQUEST HARNESS (#1359) — the model, the tool, the prompt skeleton and the response
 * reader, written once for every product that escalates.
 *
 * ## Why this exists, and why it is HERE rather than in `shell/`
 *
 * Measured 2026-09-22: the lane was written three times — `src/parser/llmShared.ts` (178 lines),
 * `src3d/parser/llmShared3.ts` (119) and `src-analytic/parser/llmSharedAnalytic.ts` (130) — with
 * **zero shared code** and the same model, the same 1024-token budget and the same `emit_steps` tool
 * name declared independently in each. The operator's standing rule is that the tools share as much
 * of the design and pedagogy as possible; three copies of a request body is the opposite.
 *
 * `shell/` is the wrong home: `BOUNDARIES.json` forbids `server -> shell` (*"the proxy has no UI;
 * nothing in browser chrome belongs in it"*), and the proxy is what builds these requests. The
 * complementary edge `src -> server` is forbidden too, so the product trees cannot import this file
 * either — which is exactly why a product exports **data** ({@link PromptSpec}) and the composition
 * happens here, on the `server -> product` edge the registry already sanctions.
 *
 * Note the split: the CLIENT-side half of this lane (the sequence gate and the honesty-gate battery,
 * which run on the steps after they come back) is not here and cannot be — it belongs in `shell/`,
 * which every product may import. Two halves, two homes, one per allowed edge.
 *
 * ## The refactor's contract: NOT ONE CHARACTER of any prompt changed
 *
 * Each product keeps its own rules text verbatim. Harmonising the wording is a separate decision with
 * real risk — it changes model behaviour in two tools the operator has said work well, and no test can
 * catch a prompt regression. This extraction is structural only, and
 * `server/__tests__/issue-1359-prompt-identity.test.ts` pins every byte of all three request bodies.
 */

/** Haiku 4.5 — cheap and sufficient for this bounded structured task. One declaration, three products. */
export const LLM_MODEL = 'claude-haiku-4-5';
export const LLM_MAX_TOKENS = 1024;
export const TOOL_NAME = 'emit_steps';

/**
 * The forced tool: the model must return an ordered list of canonical command strings.
 *
 * The SHAPE is shared; the two DESCRIPTIONS are not. Measured while extracting this: all three
 * products described the tool to the model differently — *"Return the geometry construction…"* vs
 * *"Return the 3-D space/vectors construction…"* vs *"Return the analytic-geometry construction…"*,
 * and 2-D alone added *"(each one a supported phrasing)"* to the array description. Those strings go
 * to the model and shape its behaviour, so unifying them silently would have been a prompt change in
 * three tools. They stay product-supplied; the byte-identity lock is what caught it.
 */
export function buildStepsTool(spec: PromptSpec) {
  return {
    name: TOOL_NAME,
    description: spec.toolDescription,
    input_schema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: spec.stepsDescription,
          items: { type: 'string' },
        },
      },
      required: ['steps'],
      additionalProperties: false,
    },
  } as const;
}

/**
 * One few-shot example (freeform → canonical steps).
 *
 * Kept as DATA rather than prose so each product's contract test can re-parse every `steps[i]` and
 * catch a drifted example — one the prompt teaches the model to emit that the deterministic parser can
 * no longer read (the PAR-10 contract). `ctx` seeds that re-parse when a step references an object an
 * earlier step or the illustrative figure introduced.
 */
export interface PromptExample {
  freeform: string;
  steps: string[];
  note?: string;
  ctx?: { points?: string[]; circles?: string[] };
}

/**
 * Everything a product contributes to its own prompt. Pure data, so the product tree exports it
 * without importing anything from `server/` (the forbidden direction) — `parseHandler` types it on
 * the way in, and a spec that drifts from this shape is a compile error there.
 */
export interface PromptSpec {
  /**
   * The opening two lines, VERBATIM, given the tool name.
   *
   * A function rather than a string so the product never hardcodes `emit_steps` — the tool name is
   * declared once, here. And product-supplied rather than composed from a domain noun because the
   * three copies wrap the sentence at DIFFERENT points ("…into an ordered" / "list of…" in 2-D,
   * "…into" / "an ordered list of…" in the others). Composing it would have silently rewritten 2-D's
   * prompt — which the byte-identity lock caught, and which is precisely the change this refactor
   * promised not to make.
   */
  intro: (toolName: string) => string[];
  /** The product's rule lines, VERBATIM and in order — one array entry per prompt line. */
  rules: string[];
  /** The supported canonical forms, already rendered as `- en   |   he` lines. */
  vocabulary: () => string;
  /** How the tool describes itself to the model. Product-specific — see {@link buildStepsTool}. */
  toolDescription: string;
  /** How the `steps` array describes itself to the model. Also product-specific. */
  stepsDescription: string;
  examples: PromptExample[];
}

/** Render one example back to the `"freeform" → ["step", …]` prompt line (with an optional note). */
export function renderExample(e: PromptExample): string {
  return `"${e.freeform}" → ${JSON.stringify(e.steps)}${e.note ? `   (${e.note})` : ''}`;
}

/**
 * The prompt SKELETON, which was identical in all three copies: intro → rules → vocabulary →
 * examples. Only the parts a product supplies differ.
 */
export function buildSystemPrompt(spec: PromptSpec): string {
  return [
    ...spec.intro(TOOL_NAME),
    '',
    'Rules:',
    ...spec.rules,
    '',
    'Supported canonical forms (English | Hebrew):',
    spec.vocabulary(),
    '',
    'Examples (freeform → steps):',
    ...spec.examples.map(renderExample),
  ].join('\n');
}

/** The full Messages-API request body (model, tool, forced tool_choice, message). Pure + testable. */
export function buildRequest(spec: PromptSpec, utterance: string, context: string) {
  return {
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    system: buildSystemPrompt(spec),
    tools: [buildStepsTool(spec)],
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
