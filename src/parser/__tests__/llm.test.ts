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

  it('re-parses the LLM canonical steps into real engine commands', async () => {
    mockFetch(['square ABCD', 'segment AC']);
    const r = await llmParse('make a square with one diagonal', 'The canvas is empty.');
    expect(r).not.toBeNull();
    expect(r!.commands.map((c) => c.type)).toEqual(['square', 'segment']);
    expect(r!.steps).toEqual(['square ABCD', 'segment AC']);
  });

  it('keeps only steps that actually parse (LLM can hallucinate phrasing)', async () => {
    mockFetch(['triangle ABC', 'do a backflip', 'segment AB']);
    const r = await llmParse('triangle, then a flourish, then connect AB', '');
    expect(r!.commands.map((c) => c.type)).toEqual(['triangle', 'segment']);
    expect(r!.steps).toEqual(['triangle ABC', 'segment AB']);
  });

  it('returns null when nothing usable comes back', async () => {
    mockFetch(['utter nonsense']);
    expect(await llmParse('???', '')).toBeNull();
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
