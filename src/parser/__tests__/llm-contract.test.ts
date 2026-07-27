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

// ── (e) property honesty: an example must never TEACH an invented given ──────
/**
 * Issue #293 (ADR-052), the 2-D twin of the 3-D #290 finding.
 *
 * The prompt forbade inventing extra POINTS but said nothing about inventing a PROPERTY, and one
 * few-shot demonstrated the sin directly: `"a circle with a triangle inscribed in it"` was taught to
 * emit `circle centered at O radius 5` — a radius the student never stated. Measured through the real
 * parser + replay: with that line the circle carries `radius {via:'length', value:5}` (PINNED); the
 * inscribe line ALONE yields an identical object set with `{via:'free', value:5}` (a free DOF, 5 being
 * only the seed). The fabricated line was both unnecessary and an ADR-052 violation.
 *
 * A prose rule alone would not stop the next example from drifting, so this is the mechanical guard:
 * every standalone magnitude appearing in an example's STEPS must also appear in its FREEFORM. Digits
 * that belong to a label (`O1`, `O2`) are excluded — they are names, not magnitudes.
 */
describe('PAR-10 (e) — no prompt example invents a magnitude the freeform never states', () => {
  /** A standalone number: not preceded by a letter, so a subscripted label like `O1` is not a magnitude. */
  const MAGNITUDE = /(?<![A-Za-z])\d+(?:\.\d+)?/g;

  it('every number in an example step is present in that example freeform', () => {
    for (const e of PROMPT_EXAMPLES) {
      const stated = new Set(e.freeform.match(MAGNITUDE) ?? []);
      for (const step of e.steps) {
        for (const n of step.match(MAGNITUDE) ?? []) {
          expect(
            stated.has(n),
            `prompt example "${e.freeform}" teaches the model to invent the magnitude ${n} in step "${step}" — ADR-052: an unstated magnitude is a FREE DOF, never a given`,
          ).toBe(true);
        }
      }
    }
  });

  it('the circle example does not pin a radius (the #293 regression itself)', () => {
    const circleEx = PROMPT_EXAMPLES.find((e) => e.freeform === 'a circle with a triangle inscribed in it');
    expect(circleEx).toBeDefined();
    expect(circleEx!.steps.join(' ')).not.toMatch(/radius\s*\d/);
    expect(circleEx!.steps.join(' ')).not.toMatch(/רדיוס\s*\d/);
  });

  it('the system prompt carries the never-invent-a-property rule and its never-drop twin', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/NEVER invent an unstated property/);
    expect(prompt).toMatch(/NEVER drop a property the student DID state/);
  });
});
