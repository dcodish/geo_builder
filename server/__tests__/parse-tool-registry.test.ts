/**
 * #1251 — the proxy picks a prompt by a REGISTRY, and an unregistered tool is refused.
 *
 * This was `tool === '3d' ? buildLlmRequest3(…) : buildLlmRequest(…)` — a two-way branch whose
 * else-arm was the 2-D prompt. Correct while exactly two products called the proxy, and silently
 * wrong the moment a third did: the analytic client would have sent analytic sentences out with the
 * **2-D command catalogue**, and the model would have answered an analytic figure with 2-D commands.
 * Not a refusal — a confidently wrong parse, on a paid call.
 *
 * The defect a default hides is not a wrong answer, it is a wrong answer that LOOKS routed.
 *
 * ## Rewritten to CALL the decision (#1359)
 *
 * Every case here used to read `parseHandler.ts` **as text** and grep it — for the registry literal,
 * for `buildLlmRequest\w*`, for the exact source of the guard line. docs/28 §5c names that as the
 * anti-pattern: *"asserts where a decision LIVES rather than that the product MAKES it, and breaks
 * the first time someone extracts the decision into its own function."*
 *
 * It did exactly that. Extracting the composer into `server/llm/harness.ts` changed no behaviour and
 * turned this file red, because the strings it was matching had moved. The cases below assert the
 * same properties through the real handler and the real specs, so the next extraction cannot break
 * them and a genuine fallthrough cannot slip past them.
 */
import { describe, expect, it, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleParse, LLM_TOOLS } from '../parseHandler';
import { buildSystemPrompt, TOOL_NAME, type PromptSpec } from '../llm/harness';
import { PROMPT_SPEC_2D } from '../../src/parser/llmShared';
import { PROMPT_SPEC_3D } from '../../src3d/parser/llmShared3';
import { PROMPT_SPEC_ANALYTIC } from '../../src-analytic/parser/llmSharedAnalytic';

const SPECS: Record<string, PromptSpec> = { '2d': PROMPT_SPEC_2D, '3d': PROMPT_SPEC_3D, analytic: PROMPT_SPEC_ANALYTIC };

function mockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end(s?: string) { this.body = s ?? ''; },
  };
}
async function* chunks(parts: string[]) { for (const p of parts) yield Buffer.from(p); }
function mockReq(ip: string, body: unknown) {
  const req = chunks([JSON.stringify(body)]) as AsyncGenerator<Buffer> & {
    method: string; socket: { remoteAddress: string }; headers: Record<string, string>;
  };
  req.method = 'POST';
  req.socket = { remoteAddress: ip };
  req.headers = {};
  return req;
}
/** One request through the REAL handler. A fresh IP per call, so the per-IP limiter never interferes. */
let ipSeq = 0;
async function post(body: unknown) {
  const res = mockRes();
  await handleParse(mockReq(`10.9.${Math.floor(ipSeq / 250) % 250}.${ipSeq++ % 250}`, body) as unknown as IncomingMessage,
    res as unknown as ServerResponse, { apiKey: 'sk-test', logError: () => {} });
  return res;
}

afterEach(() => { delete process.env.LLM_DAILY_MAX; });

describe('#1251 — every tool that calls the proxy has its OWN prompt', () => {
  it.each(Object.keys(SPECS).map((t) => [t]))('«%s» is registered with the proxy', (tool) => {
    expect(LLM_TOOLS).toContain(tool);
  });

  it('the registry has no extra tool the specs do not cover', () => {
    expect([...LLM_TOOLS].sort()).toEqual(Object.keys(SPECS).sort());
  });

  /**
   * Stronger than the old check, which compared BUILDER NAMES in the source. Two distinct names can
   * still render the same prompt; what matters to a student is the prompt. Compare the composed text.
   */
  it('each registered tool gets a DISTINCT prompt — no two products share one', () => {
    const prompts = Object.entries(SPECS).map(([tool, spec]) => [tool, buildSystemPrompt(spec)] as const);
    expect(prompts.length).toBeGreaterThanOrEqual(3);
    const seen = new Map<string, string>();
    for (const [tool, prompt] of prompts) {
      const clash = seen.get(prompt);
      expect(clash, `«${tool}» and «${clash}» send the model the same prompt`).toBeUndefined();
      seen.set(prompt, tool);
    }
  });

  /**
   * THE LOCK THAT MATTERS, now behavioural. A ternary or a `??` fallback would re-introduce the silent
   * default that made this issue — and the old source-grep for it would have been satisfied by any
   * rewrite that spelled the fallback differently.
   */
  it('refuses an unregistered tool instead of defaulting to another product', async () => {
    for (const tool of ['nope', 'complex', '2D', '']) {
      const res = await post({ utterance: 'draw a square', context: '', tool });
      if (tool === '') continue; // an ABSENT/empty tool is 2-D by design — covered below
      expect(res.statusCode, `tool=${tool}`).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'unknown-tool' });
    }
  });

  /**
   * The refusal must come BEFORE the quota checks: an unregistered tool is a client bug, and a client
   * bug must not be able to drain the day's budget. Asserted by making the budget ZERO — a request
   * that reached the quota would answer `daily-limit`, so `unknown-tool` proves the ordering.
   */
  it('refuses before any quota is spent', async () => {
    process.env.LLM_DAILY_MAX = '0';
    const res = await post({ utterance: 'draw a square', context: '', tool: 'nope' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'unknown-tool' });
  });

  /** An absent `tool` is 2-D, as it always was — the 2-D client does not send the field. */
  it('treats an absent tool as 2-D rather than refusing it', async () => {
    process.env.LLM_DAILY_MAX = '0'; // stop before the SDK; reaching the quota proves it ROUTED
    const res = await post({ utterance: 'draw a square', context: '' });
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body)).toEqual({ error: 'daily-limit' });
  });

  /**
   * Each product's prompt is grounded in ITS OWN catalogue. The #1251 defect was analytic sentences
   * meeting the 2-D vocabulary, so the honest check is that each prompt carries a phrase only that
   * product knows — and that it does NOT carry a sibling's.
   */
  it('each prompt carries its own vocabulary and not a sibling\'s', () => {
    const only2d = buildSystemPrompt(PROMPT_SPEC_2D);
    const only3d = buildSystemPrompt(PROMPT_SPEC_3D);
    const onlyAg = buildSystemPrompt(PROMPT_SPEC_ANALYTIC);
    expect(only3d).toContain('קובייה');            // a solid — 3-D only
    expect(only2d).not.toContain('קובייה');
    expect(onlyAg).not.toContain('קובייה');
    expect(onlyAg).toMatch(/פרבולה|מעגל .*x\^2|שיפוע/); // a coordinate-plane noun — analytic only
    expect(only3d).not.toMatch(/שיפוע הישר/);
    for (const p of [only2d, only3d, onlyAg]) expect(p).toContain(TOOL_NAME);
  });
});
