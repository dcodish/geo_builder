/**
 * #1251 — the proxy picks a prompt by a REGISTRY, and an unregistered tool is refused.
 *
 * This was `tool === '3d' ? buildLlmRequest3(…) : buildLlmRequest(…)` — a two-way branch whose
 * else-arm was the 2-D prompt. Correct while exactly two products called the proxy, and silently
 * wrong the moment a third did: the analytic client would have sent analytic sentences out with the
 * **2-D command catalogue**, and the model would have answered an analytic figure with 2-D commands.
 * Not a refusal — a confidently wrong parse, on a paid call.
 *
 * The defect a default hides is not a wrong answer, it is a wrong answer that LOOKS routed. So the
 * locks below assert the absence of a fallthrough, not just the presence of the new entry.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = readFileSync(path.join(__dirname, '..', 'parseHandler.ts'), 'utf8');

/**
 * The handler's CODE, with comments stripped.
 *
 * The docblock on `PROMPT_BUILDERS` quotes the very ternary these locks forbid, so a naive scan of
 * the file matches the documentation and reports a defect that is not there. A lock must read what
 * runs, not what explains it.
 */
const HANDLER = SOURCE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('#1251 — every tool that calls the proxy has its OWN prompt', () => {
  it.each([['2d'], ['3d'], ['analytic']])('«%s» is registered', (tool) => {
    // the registry literal, tolerant of quoting (`analytic:` vs `'analytic':`)
    expect(HANDLER).toMatch(new RegExp(`['"]?${tool}['"]?\\s*:`));
  });

  it('each registered tool maps to a DISTINCT builder — no two share a prompt', () => {
    const block = HANDLER.slice(HANDLER.indexOf('const PROMPT_BUILDERS'), HANDLER.indexOf('export const LLM_TOOLS'));
    const builders = [...block.matchAll(/:\s*(buildLlmRequest\w*)/g)].map((m) => m[1]);
    expect(builders.length).toBeGreaterThanOrEqual(3);
    expect(new Set(builders).size, `two tools share a prompt: ${builders.join(', ')}`).toBe(builders.length);
  });

  /**
   * THE LOCK THAT MATTERS. A ternary or a `||` fallback would re-introduce the silent default that
   * made this issue, and it would pass every other test in this file.
   */
  it('has no fallthrough to another product’s prompt', () => {
    expect(HANDLER).not.toMatch(/tool\s*===\s*['"]3d['"]\s*\?/);
    expect(HANDLER).not.toMatch(/PROMPT_BUILDERS\[[^\]]+\]\s*(\?\?|\|\|)/);
  });

  it('refuses an unregistered tool instead of defaulting', () => {
    expect(HANDLER).toMatch(/if \(!PROMPT_BUILDERS\[tool\]\) return send\(400, \{ error: 'unknown-tool' \}\)/);
  });

  /**
   * The refusal must come BEFORE the quota checks: an unregistered tool is a client bug, and a client
   * bug must not be able to drain the day's budget.
   */
  it('refuses before any quota is spent', () => {
    const guard = HANDLER.indexOf("error: 'unknown-tool'");
    const daily = HANDLER.indexOf('dayCount++');
    expect(guard).toBeGreaterThan(-1);
    expect(daily).toBeGreaterThan(-1);
    expect(guard, 'the unknown-tool guard must precede the daily counter').toBeLessThan(daily);
  });

  /** An absent `tool` is 2-D, as it always was — the 2-D client does not send the field. */
  it('treats an absent tool as 2-D', () => {
    expect(HANDLER).toMatch(/String\(j\.tool \?\? ''\) \|\| '2d'/);
  });
});
