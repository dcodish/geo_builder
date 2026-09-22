/**
 * THE LLM REQUEST LANE, ASSERTED ONCE FOR EVERY PRODUCT (#1359).
 *
 * The lane used to be written three times — `src/parser/llmShared.ts`, `src3d/parser/llmShared3.ts`,
 * `src-analytic/parser/llmSharedAnalytic.ts` — with no shared code, and each tree tested its own copy.
 * Three copies tested three times is how the copies drift: nothing asserted that the three products
 * asked the model for the same THING in the same way.
 *
 * This file is the docs/28 §5c shape for that: the rows live once, here, and run over every registered
 * spec. `server/` is the right home because it is the only tree that may import all the products
 * (`BOUNDARIES.json` sanctions `server -> src` / `src3d` / `src-analytic`) and because the composer it
 * exercises is server-side.
 *
 * A NEW PRODUCT joins by appearing in `PROMPT_SPECS`; every row below then applies to it with no edit
 * here. That is the property the per-tree copies could never have.
 */
import { describe, it, expect } from 'vitest';
import { buildRequest, buildSystemPrompt, buildStepsTool, extractSteps, LLM_MODEL, LLM_MAX_TOKENS, TOOL_NAME, type PromptSpec } from '../llm/harness';
import { PROMPT_SPEC_2D } from '../../src/parser/llmShared';
import { PROMPT_SPEC_3D } from '../../src3d/parser/llmShared3';
import { PROMPT_SPEC_ANALYTIC } from '../../src-analytic/parser/llmSharedAnalytic';

/** Every product that escalates, by the same key the proxy dispatches on. */
const SPECS: Record<string, PromptSpec> = {
  '2d': PROMPT_SPEC_2D,
  '3d': PROMPT_SPEC_3D,
  analytic: PROMPT_SPEC_ANALYTIC,
};

describe('#1359 — one request lane, every product', () => {
  for (const [tool, spec] of Object.entries(SPECS)) {
    describe(tool, () => {
      const req = buildRequest(spec, 'UTT', 'CTX');

      it('targets the one model, with the one bounded budget', () => {
        expect(req.model).toBe(LLM_MODEL);
        expect(LLM_MODEL).toBe('claude-haiku-4-5');
        expect(req.max_tokens).toBe(LLM_MAX_TOKENS);
        expect(req.max_tokens).toBeLessThanOrEqual(2048);
      });

      it('forces the one tool', () => {
        expect(req.tool_choice).toEqual({ type: 'tool', name: TOOL_NAME });
        expect(req.tools).toHaveLength(1);
        expect(req.tools[0].name).toBe(TOOL_NAME);
      });

      it('carries the context and the utterance, in that order', () => {
        expect(req.messages).toHaveLength(1);
        expect(req.messages[0].role).toBe('user');
        expect(req.messages[0].content).toBe('CTX\n\nStudent request: "UTT"');
      });

      /**
       * The skeleton, in order. Asserted by POSITION rather than by `toContain`, so a section that
       * moves — vocabulary above the rules, examples before either — fails rather than passing because
       * the words are still present somewhere.
       */
      it('composes the sections in the one order: intro, rules, vocabulary, examples', () => {
        const prompt = buildSystemPrompt(spec);
        const iRules = prompt.indexOf('\nRules:\n');
        const iVocab = prompt.indexOf('\nSupported canonical forms (English | Hebrew):\n');
        const iEx = prompt.indexOf('\nExamples (freeform → steps):\n');
        expect(iRules, 'the rules section exists').toBeGreaterThan(0);
        expect(iVocab, 'the vocabulary section follows the rules').toBeGreaterThan(iRules);
        expect(iEx, 'the examples section follows the vocabulary').toBeGreaterThan(iVocab);
        expect(prompt.startsWith(spec.intro(TOOL_NAME)[0])).toBe(true);
      });

      it('names the tool in its own intro, and never hardcodes it', () => {
        expect(spec.intro(TOOL_NAME).join(' ')).toContain(TOOL_NAME);
        // the product supplies a function of the tool name, so it cannot drift from the schema
        expect(spec.intro('SENTINEL').join(' ')).toContain('SENTINEL');
      });

      it('offers a non-empty vocabulary and at least one worked example', () => {
        expect(spec.vocabulary().length).toBeGreaterThan(200);
        expect(spec.examples.length).toBeGreaterThan(0);
      });

      it('renders every example into the prompt — the extraction stays in sync', () => {
        const prompt = buildSystemPrompt(spec);
        for (const ex of spec.examples) expect(prompt).toContain(`"${ex.freeform}" →`);
      });

      /**
       * ADR-052 is the cardinal rule and every product states it in its own vocabulary. It is asserted
       * HERE, across all of them, because a product that quietly loses it starts inventing givens — and
       * a per-tree test cannot notice that a SIBLING lost it.
       */
      it('states the never-invent rule (ADR-052), in this product\'s own words', () => {
        expect(spec.rules.join('\n')).toMatch(/NEVER invent an unstated (property|value)/);
      });

      it('states the never-reorder-a-letter-run rule (#536 / #555)', () => {
        expect(spec.rules.join('\n')).toMatch(/NEVER reorder the letters/);
      });

      it('tells the model to answer in the student\'s language', () => {
        expect(spec.rules.join('\n')).toMatch(/SAME language/);
      });

      /**
       * The tool DESCRIPTIONS are product-specific and that is deliberate — found while extracting
       * this lane, when unifying them would have silently changed the prompt in two tools. Asserted so
       * the difference stays a choice rather than becoming an accident.
       */
      it('describes itself to the model in its own terms', () => {
        const t = buildStepsTool(spec);
        expect(t.description).toBe(spec.toolDescription);
        expect(t.description).toMatch(/^Return the .+ construction as an ordered list/);
        expect(t.input_schema.properties.steps.description).toBe(spec.stepsDescription);
      });
    });
  }

  it('the registry here matches the one the proxy dispatches on', async () => {
    const { LLM_TOOLS } = await import('../parseHandler');
    expect(Object.keys(SPECS).sort()).toEqual([...LLM_TOOLS].sort());
  });

  describe('extractSteps — the response reader, also once', () => {
    it('pulls the step strings out of the forced tool call, dropping non-strings and blanks', () => {
      const content = [
        { type: 'text', text: 'sure' },
        { type: 'tool_use', name: TOOL_NAME, input: { steps: ['square ABCD', 123, '', 'segment AC'] } },
      ];
      expect(extractSteps(content)).toEqual(['square ABCD', 'segment AC']);
    });

    it('returns null when there is no tool call to read', () => {
      expect(extractSteps([{ type: 'text', text: 'hello' }])).toBeNull();
      expect(extractSteps([{ type: 'tool_use', name: 'other', input: { steps: ['x'] } }])).toBeNull();
    });

    it('returns null when the tool call carries no steps array', () => {
      expect(extractSteps([{ type: 'tool_use', name: TOOL_NAME, input: {} }])).toBeNull();
      expect(extractSteps([{ type: 'tool_use', name: TOOL_NAME, input: { steps: 'nope' } }])).toBeNull();
    });
  });
});
