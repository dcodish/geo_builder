/**
 * Phase-7 LLM fallback — boundary + safety, with NO live API calls.
 * The request builder and step extraction are pure; the dispatch is tested with
 * a mocked fetch; and a guard asserts the API key / SDK never leak into `src/`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
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

  it('accumulates circle MEMBERSHIP across steps (R9(b)) — "arc BC" resolves to a circle an earlier step made', async () => {
    // Step 1 "circle through A B C" creates a circumcircle holding A,B,C; step 2 "arc BC" must resolve to
    // THAT circle. Before R9(b), circleMembers was frozen at the (empty) pre-escalation figure, so step 2
    // could not find the circle holding B,C and was dropped.
    mockFetch(['circle through A B C', 'M is the midpoint of arc BC']);
    const r = await llmParse('circumscribe ABC then take the arc-midpoint of BC', '');
    expect(r!.dropped).toEqual([]); // step 2 no longer drops
    expect(r!.built.flatMap((b) => b.commands).map((c) => c.type)).toEqual(['circumcircle', 'arc-midpoint']);
  });

  it('an LLM that returns nothing buildable yields empty built (caller shows "couldn\'t read")', async () => {
    mockFetch(['utter nonsense']);
    const r = await llmParse('???', '');
    expect(r!.built).toEqual([]);
    expect(r!.dropped).toEqual(['utter nonsense']);
  });

  it('returns null on a non-throttle proxy error (no key / 5xx / network)', async () => {
    mockFetch([], false); // ok:false, no 429 status → a genuine failure, not a throttle
    expect(await llmParse('square', '')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await llmParse('square', '')).toBeNull();
  });

  it('surfaces a THROTTLE (429) distinctly so the caller shows "service busy", not "couldn\'t understand" (SEC-2)', async () => {
    const mock429 = (error: string | undefined, jsonOk = true) =>
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => {
            if (!jsonOk) throw new Error('no body');
            return { error };
          },
        }),
      );
    mock429('daily-limit');
    expect((await llmParse('square', ''))?.busy).toBe('daily-limit'); // the global cost ceiling
    mock429('rate-limited');
    expect((await llmParse('square', ''))?.busy).toBe('rate-limited'); // the per-IP limit
    mock429(undefined, false); // unparseable 429 body → default to the per-IP form
    const busy = await llmParse('square', '');
    expect(busy?.busy).toBe('rate-limited');
    expect(busy?.built).toEqual([]); // a throttle carries no built steps
  });
});

describe('security — the API key and SDK never reach the browser bundle', () => {
  it('no shipped file under src/ imports the Anthropic SDK or reads the API key', () => {
    // Read via Node fs (Vitest runs in Node) rather than Vite's `?raw` glob loader, which
    // resolves to a malformed `c:\c:\…` path on Windows under concurrent workers (flaky).
    const srcRoot = join(process.cwd(), 'src');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? walk(p) : p;
      });
    const offenders = walk(srcRoot)
      .filter((p) => /\.(ts|tsx)$/.test(p))
      .filter((p) => !p.includes(`${sep}__tests__${sep}`) && !p.includes('.test.'))
      .filter((p) => {
        const src = readFileSync(p, 'utf8');
        return src.includes('@anthropic-ai/sdk') || src.includes('ANTHROPIC_API_KEY');
      });
    expect(offenders, `client code must stay key-free: ${offenders.join(', ')}`).toEqual([]);
  });
});
