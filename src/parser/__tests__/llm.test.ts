/**
 * Phase-7 LLM fallback — boundary + safety, with NO live API calls.
 * The request builder and step extraction are pure; the dispatch is tested with
 * a mocked fetch; and a guard asserts the API key / SDK never leak into `src/`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildLlmRequest, extractSteps, LLM_MODEL, STEPS_TOOL } from '../llmShared';
import { llmParse } from '../llm';

describe('buildLlmRequest', () => {
  it('targets Haiku with a forced single tool call and a bounded token budget', () => {
    const req = buildLlmRequest('draw a square', 'The canvas is empty.');
    expect(req.model).toBe(LLM_MODEL);
    expect(LLM_MODEL).toBe('claude-haiku-4-5');
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'emit_steps' });
    expect(req.tools[0]).toBe(STEPS_TOOL);
    expect(req.max_tokens).toBeLessThanOrEqual(2048);
  });

  it('grounds the prompt in the supported catalog and includes context + utterance', () => {
    const req = buildLlmRequest('put a dot in the middle of AB', 'Existing points: A, B.');
    expect(req.system).toContain('square ABCD'); // a supported catalog form is offered as vocabulary
    expect(req.system).toContain('emit_steps');
    const msg = req.messages[0].content;
    expect(msg).toContain('Existing points: A, B.');
    expect(msg).toContain('put a dot in the middle of AB');
  });
});

describe('extractSteps', () => {
  it('pulls the step strings out of the forced tool call, dropping non-strings/blanks', () => {
    const content = [
      { type: 'text', text: 'sure' },
      { type: 'tool_use', name: 'emit_steps', input: { steps: ['square ABCD', 123, '', 'segment AC'] } },
    ];
    expect(extractSteps(content)).toEqual(['square ABCD', 'segment AC']);
  });

  it('returns null when there is no emit_steps tool call', () => {
    expect(extractSteps([{ type: 'text', text: 'hello' }])).toBeNull();
    expect(extractSteps([{ type: 'tool_use', name: 'other', input: { steps: ['x'] } }])).toBeNull();
  });
});

describe('llmParse (client dispatch — fetch mocked)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const mockFetch = (steps: unknown, ok = true) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => ({ steps }) }));

  it('re-parses the LLM canonical steps into per-step engine commands (visible decomposition)', async () => {
    mockFetch(['square ABCD', 'segment AC']);
    const r = await llmParse('make a square with one diagonal', 'The canvas is empty.');
    expect(r).not.toBeNull();
    expect(r!.built.map((b) => b.step)).toEqual(['square ABCD', 'segment AC']);
    expect(r!.built.flatMap((b) => b.commands).map((c) => c.type)).toEqual(['square', 'segment']);
    expect(r!.dropped).toEqual([]);
  });

  it('reports (not silently drops) steps the engine cannot build', async () => {
    // A shape carrying a constraint is a compound the deterministic parser won't build as one step.
    mockFetch(['circle centered at O radius 5', 'square ABCD with AB = 6', 'segment AB']);
    const r = await llmParse('a square sized 6 with a circle', '');
    expect(r!.built.map((b) => b.step)).toEqual(['circle centered at O radius 5', 'segment AB']);
    expect(r!.dropped).toEqual(['square ABCD with AB = 6']);
  });

  it('threads the figure context into the re-parse — a context-dependent step builds, not drops', async () => {
    // "another secant from the EXISTING external point A" only parses when the re-parse knows A
    // already exists. Without the figure context (the old bug) the rule fell through to the
    // "first secant" branch (which needs an "outside" cue) and the step was wrongly dropped.
    const step = 'מנקודה A ישר חותך את המעגל O בנקודות C ו-D';
    mockFetch([step]);
    // No context → dropped (the regression's failure mode).
    const without = await llmParse('AC cuts circle O at D', '');
    expect(without!.dropped).toEqual([step]);
    expect(without!.built).toEqual([]);
    // With the figure context (A exists, circle O present) → it builds the secant.
    mockFetch([step]);
    const withCtx = await llmParse('AC cuts circle O at D', '', { points: ['A', 'B'], circles: ['O'] });
    expect(withCtx!.dropped).toEqual([]);
    expect(withCtx!.built.flatMap((b) => b.commands).map((c) => c.type)).toEqual([
      'point-on-circle', 'line-through', 'line-circle-intersection', 'segment',
    ]);
  });

  it('accumulates context across steps — a later step sees a point an earlier step introduced', async () => {
    // Step 1 creates C on circle P; step 2 ("another secant from C") must see C as existing.
    mockFetch(['C על מעגל P', 'מנקודה C ישר חותך את המעגל O בנקודות E ו-F']);
    const r = await llmParse('a secant from C', '', { points: ['A', 'B'], circles: ['O', 'P'] });
    expect(r!.dropped).toEqual([]); // step 2 no longer drops — C is now in context
    expect(r!.built.map((b) => b.step)).toHaveLength(2);
  });

  it('an LLM that returns nothing buildable yields empty built (caller shows "couldn\'t read")', async () => {
    mockFetch(['utter nonsense']);
    const r = await llmParse('???', '');
    expect(r!.built).toEqual([]);
    expect(r!.dropped).toEqual(['utter nonsense']);
  });

  it('returns null on a proxy error (no key, rate limit, network)', async () => {
    mockFetch([], false);
    expect(await llmParse('square', '')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await llmParse('square', '')).toBeNull();
  });
});

describe('security — the API key and SDK never reach the browser bundle', () => {
  it('no shipped file under src/ imports the Anthropic SDK or reads the API key', () => {
    // Vite-native file read (no Node fs needed); covers everything the client bundles.
    const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const offenders = Object.entries(files)
      .filter(([path]) => !path.includes('/__tests__/') && !path.includes('.test.'))
      .filter(([, src]) => src.includes('@anthropic-ai/sdk') || src.includes('ANTHROPIC_API_KEY'))
      .map(([path]) => path);
    expect(offenders, `client code must stay key-free: ${offenders.join(', ')}`).toEqual([]);
  });
});
