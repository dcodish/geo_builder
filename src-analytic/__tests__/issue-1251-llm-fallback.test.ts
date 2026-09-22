/**
 * #1251 — the analytic tool's LLM fallback.
 *
 * Operator ruling, 2026-09-19 (round #1244, T19): *"we should have an llm fallback like we have in 2d
 * and 3d. this is true to all tools"*. Analytic had none: `not-handled` rendered and stopped, so every
 * grammar gap was a hard wall and every refusal was the student's final answer.
 *
 * **No live call anywhere in this file.** `docs/08` requires the fallback to be mocked, and standing
 * rule 2 forbids firing one without the operator. `runFallback` takes its transport as an argument
 * precisely so this suite never reaches the network.
 */
import { describe, expect, it, vi } from 'vitest';
import { PROMPT_EXAMPLES_ANALYTIC, PROMPT_SPEC_ANALYTIC } from '../parser/llmSharedAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { parseLine } from '../parser/parseAnalytic';
import { runFallback, fallbackContext } from '../app/fallback';
import { derive } from '../engine/derive';

// #1359: the request body is composed in `server/llm/harness.ts`, which a product tree may not
// import (BOUNDARIES: src -> server is forbidden). These cases assert this product's own prompt
// PARTS instead — a tighter check than searching the composed blob, and the composition itself is
// covered once for all three products in `server/__tests__/issue-1359-prompt-lane.test.ts`.
const promptText = (s: { rules: string[]; vocabulary: () => string; examples: { freeform: string }[] }) =>
  [...s.rules, s.vocabulary(), ...s.examples.map((e) => `"${e.freeform}" →`)].join('\n');

/**
 * THE PAR-10 CONTRACT: every step the prompt teaches must parse.
 *
 * A few-shot example is a promise to the model. If one stops parsing — a grammar change, a renamed
 * spelling — the model is being taught a line the deterministic re-parse will refuse, and every call
 * it influences is a paid call spent on something that cannot commit. So the examples are exercised
 * rather than reviewed.
 */
describe('#1251 — the prompt teaches only lines that parse', () => {
  const steps = PROMPT_EXAMPLES_ANALYTIC.flatMap((e) => e.steps);

  it('has examples with steps to check', () => {
    expect(steps.length).toBeGreaterThan(8);
  });

  it.each(steps.map((s) => [s]))('example step «%s» parses', (step) => {
    const r = parseLine(step);
    expect(r.ok, r.ok ? '' : `«${step}» → ${r.code}`).toBe(true);
  });

  /** An example whose steps are empty is the HONEST refusal, and at least one must teach it. */
  it('teaches the empty answer for a request the tool cannot express', () => {
    expect(PROMPT_EXAMPLES_ANALYTIC.some((e) => e.steps.length === 0)).toBe(true);
  });

  /**
   * The examples must not teach the 2-D coordinate spelling. `E=(-1,7)` is 2-D's form and this tool
   * refuses it (#1245); a prompt that taught it would produce a refusal on the model's own advice.
   */
  it('never teaches the 2-D coordinate spelling', () => {
    for (const s of steps) expect(s).not.toMatch(/[A-Z]\d?\s*=\s*\(/);
  });
});

describe('#1251 — the system prompt carries the catalogue and the rules that matter', () => {
  const prompt = promptText(PROMPT_SPEC_ANALYTIC);

  it('renders every catalogue entry as vocabulary', () => {
    expect(COMMAND_CATALOG_ANALYTIC.length).toBeGreaterThan(20);
    for (const e of COMMAND_CATALOG_ANALYTIC.slice(0, 40)) expect(prompt).toContain(e.he);
  });

  // The three rules that encode rulings rather than style. If one is dropped the model starts
  // inventing givens, swapping a segment for a line, or reordering a letter run — each of which has
  // its own ADR and its own past P1.
  it.each([
    ['never invent an unstated value (ADR-052)', /NEVER invent an unstated value/],
    ['the noun decides the extent (ADR-AG-111)', /THE NOUN DECIDES WHAT IS DRAWN/],
    ['never reorder a letter run', /NEVER reorder the letters/],
    ['the coordinate spelling', /NEVER `A=\(3,5\)`/],
  ])('states: %s', (_name, re) => {
    expect(prompt).toMatch(re as RegExp);
  });

  // The request body (model, tool_choice, the utterance in the message) is asserted for all three
  // products in `server/__tests__/issue-1359-prompt-lane.test.ts`; this tree cannot import the composer.
});

describe('#1251 — every returned line goes back through the real submit gate', () => {
  const ask = (steps: string[]) => vi.fn().mockResolvedValue({ steps });

  it('records the lines when they all parse and fold', async () => {
    const out = await runFallback('סמן שתי נקודות', [], 0, ask(['A(0,0)', 'B(6,8)']));
    expect(out).toEqual({ kind: 'lines', lines: ['A(0,0)', 'B(6,8)'] });
  });

  /**
   * THE LOCK THAT MAKES A HALLUCINATION HARMLESS. A line the deterministic parser refuses is refused
   * here too — the model gets no privileged route into the engine.
   */
  it('rejects a line the deterministic parser would refuse', async () => {
    const out = await runFallback('משהו', [], 0, ask(['A(0,0)', 'this is not a command at all']));
    expect(out.kind).toBe('rejected');
  });

  /** ALL-OR-NOTHING: one bad line discards the whole answer, never a half-figure. */
  it('records NOTHING when a later line is refused', async () => {
    const out = await runFallback('משהו', [], 0, ask(['A(0,0)', 'B(6,8)', 'not a command']));
    expect(out.kind).toBe('rejected');
    if (out.kind === 'rejected') expect(out.refusedStep).toBe('not a command');
  });

  /** A degenerate cevian is refused by ADR-AG-110, so the fallback cannot smuggle one in either. */
  it('rejects a line the fold refuses even though it parses', async () => {
    const out = await runFallback('תיכון', [], 0, ask(['משולש ABC', 'BD תיכון לצלע AB']));
    expect(out.kind).toBe('rejected');
  });

  it('is a no-op when the model judges the request inexpressible', async () => {
    expect(await runFallback('שטח מתחת לעקומה', [], 0, ask([]))).toEqual({ kind: 'none' });
  });

  it('keeps the deterministic refusal when the transport fails', async () => {
    expect(await runFallback('x', [], 0, vi.fn().mockResolvedValue(null))).toEqual({ kind: 'none' });
  });

  /** A throttle is not the student's fault and must not be reported as a misunderstanding. */
  it.each([['rate-limited'], ['daily-limit']])('reports a %s throttle as busy, not as a refusal', async (why) => {
    const out = await runFallback('x', [], 0, vi.fn().mockResolvedValue({ steps: [], busy: why }));
    expect(out).toEqual({ kind: 'busy', why });
  });

  /** A restatement of something already true is not a failure — it contributes nothing and is dropped. */
  it('drops a line that restates what the figure already holds', async () => {
    const out = await runFallback('שוב', ['A(0,0)'], 0, ask(['A(0,0)', 'B(6,8)']));
    expect(out).toEqual({ kind: 'lines', lines: ['B(6,8)'] });
  });

  /** A later line may depend on an earlier one — each is decided against the figure as it then stands. */
  it('lets a later line build on an earlier one', async () => {
    const out = await runFallback('משולש ותיכון', [], 0, ask(['משולש ABC', 'AD תיכון לצלע BC']));
    expect(out).toEqual({ kind: 'lines', lines: ['משולש ABC', 'AD תיכון לצלע BC'] });
  });

  it('the accepted lines actually build', async () => {
    const out = await runFallback('משולש ותיכון', [], 0, ask(['משולש ABC', 'AD תיכון לצלע BC']));
    expect(out.kind).toBe('lines');
    if (out.kind === 'lines') expect(derive(out.lines, 0).faults).toEqual([]);
  });
});

describe('#1251 — the context handed to the model', () => {
  it('says so plainly when the figure is empty', () => {
    expect(fallbackContext([])).toContain('empty');
  });

  it('lists what the student already stated, in order', () => {
    const c = fallbackContext(['A(0,0)', 'B(6,8)']);
    expect(c).toContain('1. A(0,0)');
    expect(c).toContain('2. B(6,8)');
  });
});
