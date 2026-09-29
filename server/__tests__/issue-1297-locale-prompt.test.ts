/**
 * A HEBREW SESSION IS TAUGHT HEBREW (#1297, ADR-AG-172 — the 2026-09-27 scope: "student's words
 * now, form later").
 *
 * Operator: *"the syntax written is in english so user will not learn how to write it"* — one
 * Hebrew sentence, escalated, and the model wrote English canonical rows into his fact list. Two
 * structural changes, no prompt-discipline reliance (#1251's argument): the PROMPT speaks one
 * language (the session's locale renders one vocabulary column and a HARD language rule), and the
 * ROWS display the student's own sentence — the machine lines stay the stored truth, so replay is
 * pure over the lines exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../llm/harness';
import { PROMPT_SPEC_ANALYTIC } from '../../src-analytic/parser/llmSharedAnalytic';

describe('#1297 — the prompt speaks ONE language', () => {
  it("locale 'he' renders the Hebrew column only, with the hard language rule", () => {
    const p = buildSystemPrompt(PROMPT_SPEC_ANALYTIC as never, 'he');
    expect(p).toContain("The student's session is in Hebrew. Output EVERY step in that language.");
    expect(p).toContain('Supported canonical forms (Hebrew):');
    // The catalogue's English spellings are NOT offered as vocabulary.
    expect(p).not.toContain('circle O is tangent to the x-axis');
    expect(p).toContain('מעגל O משיק לציר ה-x');
  });

  it("locale 'en' renders the English column only", () => {
    const p = buildSystemPrompt(PROMPT_SPEC_ANALYTIC as never, 'en');
    expect(p).toContain('Supported canonical forms (English):');
    expect(p).not.toContain('מעגל O משיק לציר ה-x');
  });

  it('an OLD caller (no locale) keeps the bilingual prompt byte-for-byte', () => {
    const p = buildSystemPrompt(PROMPT_SPEC_ANALYTIC as never);
    expect(p).toContain('Supported canonical forms (English | Hebrew):');
    expect(p).toContain('   |   ');
    expect(p).not.toContain("The student's session is in");
  });
});

