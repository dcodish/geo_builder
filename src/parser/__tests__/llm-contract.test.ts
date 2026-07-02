/**
 * LLM-fallback contract tests ([docs/15-hardening-plan.md] C10 / PAR-10 + TST-3).
 *
 * The LLM never emits engine JSON — it emits CANONICAL command STRINGS that the deterministic parser
 * re-reads (llm.ts). So the fallback is only as good as (a) the few-shot examples in the prompt actually
 * parsing, (b) the catalog examples parsing to the RIGHT rule (not just `.ok`), and (d) cross-step context
 * carrying subscripted labels. These were untested contracts that a parser change could silently break.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';
import { PROMPT_EXAMPLES, buildSystemPrompt } from '../llmShared';
import { absorb } from '../llm';
import { COMMAND_CATALOG } from '../catalog';
import type { AnyCommand } from '@/engine';

// ── (a) every prompt few-shot example's steps parse ──────────────────────────
describe('PAR-10 (a) — every PROMPT_EXAMPLES step parses (the prompt teaches only readable canonical forms)', () => {
  for (const ex of PROMPT_EXAMPLES) {
    it(`"${ex.freeform}" → all steps parse`, () => {
      // Thread context exactly as llmParse does: seed from the example's assumed ctx, then absorb each
      // step's introduced points/circles so a later step can reference them.
      const points = new Set(ex.ctx?.points ?? []);
      const circles = new Set(ex.ctx?.circles ?? []);
      for (const step of ex.steps) {
        const r = parse(step, { points: [...points], circles: [...circles] });
        expect(r.ok, `step "${step}" must parse (drifted prompt example)`).toBe(true);
        if (r.ok) for (const c of r.commands) absorb(c, points, circles);
      }
    });
  }

  it('the rendered prompt still contains every example (extraction stayed in sync)', () => {
    const prompt = buildSystemPrompt();
    for (const ex of PROMPT_EXAMPLES) expect(prompt).toContain(`"${ex.freeform}" →`);
  });
});

// ── (b) each supported catalog example parses to a STABLE rule (catch a silent shadow flip) ───────────
describe('PAR-10 (b) — supported catalog examples parse to stable command types (He + En)', () => {
  const typesOf = (u: string): string[] => {
    const r = parse(u);
    return r.ok ? r.commands.map((c) => c.type) : ['<not-handled>'];
  };
  it('the {example → command types} map is pinned — a rule shadow that flips a line while still `.ok` breaks this', () => {
    const map: Record<string, { en: string[]; he: string[] }> = {};
    for (const c of COMMAND_CATALOG.filter((c) => c.supported)) {
      map[c.en] = { en: typesOf(c.en), he: typesOf(c.he) };
      // No catalog example may silently degrade to not-handled (that's the `.ok` guarantee, kept explicit).
      expect(map[c.en].en, `EN "${c.en}"`).not.toContain('<not-handled>');
      expect(map[c.en].he, `HE "${c.he}"`).not.toContain('<not-handled>');
    }
    expect(map).toMatchSnapshot();
  });
});

// ── (d) cross-step context carries SUBSCRIPTED labels ────────────────────────
describe('PAR-10 (d) — absorb folds subscripted labels (O1/O2) into the running context', () => {
  it('a command introducing O1/O2 puts BOTH into the points set (was /^[A-Z]$/ → dropped)', () => {
    const points = new Set<string>();
    const circles = new Set<string>();
    absorb({ type: 'point-on-segment', id: 'O2', a: 'O1', b: 'X' } as AnyCommand, points, circles);
    expect(points.has('O1')).toBe(true);
    expect(points.has('O2')).toBe(true);
    expect(points.has('X')).toBe(true);
  });

  it("a subscripted circle centre enters the circles set via its command", () => {
    const points = new Set<string>();
    const circles = new Set<string>();
    absorb({ type: 'circle-through', id: 'circle-O1', center: 'O1', through: 'A' } as AnyCommand, points, circles);
    expect(circles.has('O1')).toBe(true);
    expect(points.has('A')).toBe(true);
    expect(points.has('circle-O1'), 'the structured id is NOT a point').toBe(false);
  });
});
