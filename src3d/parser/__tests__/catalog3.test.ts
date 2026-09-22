/**
 * The V5 catalog guard (the 2-D pattern): EVERY catalog example must parse in BOTH
 * languages, and every LLM prompt example's steps must re-parse deterministically
 * (the PAR-10 contract — the prompt can never teach the model a line the parser
 * no longer reads).
 */

import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG_3D, type CatalogEntry3 } from '../catalog3';
import { PROMPT_EXAMPLES_3D, PROMPT_SPEC_3D } from '../llmShared3';
import { parse3, parseRename3 } from '../parse3';

// #1359: the request body is composed in `server/llm/harness.ts`, which a product tree may not
// import (BOUNDARIES: src -> server is forbidden). These cases assert this product's own prompt
// PARTS instead — a tighter check than searching the composed blob, and the composition itself is
// covered once for all three products in `server/__tests__/issue-1359-prompt-lane.test.ts`.
const promptText = (s: { rules: string[]; vocabulary: () => string; examples: { freeform: string }[] }) =>
  [...s.rules, s.vocabulary(), ...s.examples.map((e) => `"${e.freeform}" →`)].join('\n');

/**
 * #578 (ADR-3D-211): the deterministic lane has TWO readers — `parse3`, which lowers a sentence to
 * commands, and `parseRename3`, which reads a rewrite of HISTORY (a rename adds no command, so it is
 * intercepted in `submit` before the grammar). The guard asks the honest question — "does the
 * deterministic lane understand this line?" Each entry DECLARES its reader and is checked against that
 * one: an OR would let a construction entry pass because the rename reader happened to claim it, which
 * is exactly the shadow class this suite exists to catch.
 */
const understood = (u: string, lane: CatalogEntry3['lane']): boolean =>
  lane === 'rewrite' ? parseRename3(u) !== null : parse3(u).ok;

describe('catalog guard', () => {
  for (const entry of COMMAND_CATALOG_3D) {
    it(`He: ${entry.he}`, () => {
      expect(understood(entry.he, entry.lane), entry.he).toBe(true);
    });
    it(`En: ${entry.en}`, () => {
      expect(understood(entry.en, entry.lane), entry.en).toBe(true);
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

  it('the prompt carries the 3-D vocabulary and examples', () => {
    // The request BODY (model, tool_choice, budget) is asserted once for all products in
    // `server/__tests__/issue-1359-prompt-lane.test.ts` — this tree cannot import the composer.
    expect(promptText(PROMPT_SPEC_3D)).toContain('קובייה ABCD');
    expect(PROMPT_SPEC_3D.vocabulary()).toContain('the volume of the cone');
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
    const p = promptText(PROMPT_SPEC_3D);
    expect(p).toMatch(/never invent an unstated property/i);
    expect(p).toMatch(/ישרה/); // names the prism-rightness case explicitly
  });
});
