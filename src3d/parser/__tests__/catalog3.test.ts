/**
 * The V5 catalog guard (the 2-D pattern): EVERY catalog example must parse in BOTH
 * languages, and every LLM prompt example's steps must re-parse deterministically
 * (the PAR-10 contract — the prompt can never teach the model a line the parser
 * no longer reads).
 */

import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG_3D } from '../catalog3';
import { PROMPT_EXAMPLES_3D, buildSystemPrompt3, buildLlmRequest3 } from '../llmShared3';
import { parse3, parseRename3 } from '../parse3';

/**
 * #578 (ADR-3D-211): the deterministic lane has TWO readers — `parse3`, which lowers a sentence to
 * commands, and `parseRename3`, which reads a rewrite of HISTORY (a rename adds no command, so it is
 * intercepted in `submit` before the grammar). The guard asks the honest question — "does the
 * deterministic lane understand this line?" — rather than carrying an exception list, so a catalog
 * entry can never be listed for a lane that would not in fact read it.
 */
const understood = (u: string): boolean => parse3(u).ok || parseRename3(u) !== null;

describe('catalog guard', () => {
  for (const entry of COMMAND_CATALOG_3D) {
    it(`He: ${entry.he}`, () => {
      expect(understood(entry.he), entry.he).toBe(true);
    });
    it(`En: ${entry.en}`, () => {
      expect(understood(entry.en), entry.en).toBe(true);
    });
  }
});

describe('LLM prompt contract (PAR-10)', () => {
  for (const ex of PROMPT_EXAMPLES_3D) {
    it(`"${ex.freeform}" steps re-parse`, () => {
      for (const step of ex.steps) {
        expect(parse3(step).ok, step).toBe(true);
      }
    });
  }

  it('the request body is well-formed and carries the 3-D vocabulary', () => {
    const req = buildLlmRequest3('a cube', 'The canvas is empty.');
    expect(req.model).toBe('claude-haiku-4-5');
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'emit_steps' });
    expect(buildSystemPrompt3()).toContain('קובייה ABCD');
    expect(buildSystemPrompt3()).toContain('the volume of the cone');
  });
});

// #290 (ADR-052): the prompt must never teach the model to invent an unstated property.
// The concrete regression: a bare "prism" was upgraded to a RIGHT prism (inventing ישרה).
describe('#290 — the prompt never teaches inventing an unstated property', () => {
  it('no example maps a non-right freeform to a RIGHT prism step', () => {
    for (const ex of PROMPT_EXAMPLES_3D) {
      const freeformSaysRight = /\bright\b/i.test(ex.freeform) || /ישר/.test(ex.freeform);
      if (freeformSaysRight) continue;
      for (const step of ex.steps) {
        const inventsRight = /right[\s-]*\w*\s*(?:prism|pyramid)/i.test(step) || /מנסרה\s+ישר|פירמידה\s+ישר/.test(step);
        expect(inventsRight, `"${ex.freeform}" → "${step}" silently invents "right"`).toBe(false);
      }
    }
  });

  it('the system prompt carries the ADR-052 property-honesty rule', () => {
    const p = buildSystemPrompt3();
    expect(p).toMatch(/never invent an unstated property/i);
    expect(p).toMatch(/ישרה/); // names the prism-rightness case explicitly
  });
});
