/**
 * LLM-fallback contract tests ([docs/archive/15-hardening-plan.md] C10 / PAR-10 + TST-3).
 *
 * The LLM never emits engine JSON — it emits CANONICAL command STRINGS that the deterministic parser
 * re-reads (llm.ts). So the fallback is only as good as (a) the few-shot examples in the prompt actually
 * parsing, (b) the catalog examples parsing to the RIGHT rule (not just `.ok`), and (d) cross-step context
 * carrying subscripted labels. These were untested contracts that a parser change could silently break.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';
import { PROMPT_EXAMPLES, PROMPT_SPEC_2D } from '../llmShared';
import { laneContext } from '@/app/laneContext';
import type { ParseContext } from '../parse';
import { COMMAND_CATALOG } from '../catalog';
import type { AnyCommand } from '@/engine';

// #1359: the request body is composed in `server/llm/harness.ts`, which a product tree may not
// import (BOUNDARIES: src -> server is forbidden). These cases assert this product's own prompt
// PARTS instead — a tighter check than searching the composed blob, and the composition itself is
// covered once for all three products in `server/__tests__/issue-1359-prompt-lane.test.ts`.
const promptText = (s: { rules: string[]; vocabulary: () => string; examples: { freeform: string }[] }) =>
  [...s.rules, s.vocabulary(), ...s.examples.map((e) => `"${e.freeform}" →`)].join('\n');

// ── (a) every prompt few-shot example's steps parse ──────────────────────────
describe('PAR-10 (a) — every PROMPT_EXAMPLES step parses (the prompt teaches only readable canonical forms)', () => {
  for (const ex of PROMPT_EXAMPLES) {
    it(`"${ex.freeform}" → all steps parse`, () => {
      // Thread context as llmParse does (#2428, ADR-741): each later step reads the context of the figure the earlier
      // steps built (the lane's own `laneContext`). The example's ASSUMED figure exists only as its ctx, so its
      // points and circles are kept beside the built figure's.
      const assumed: ParseContext = { points: ex.ctx?.points ?? [], circles: ex.ctx?.circles ?? [] };
      const lane = laneContext(assumed, () => ({ facts: [], seed: 0 }));
      const built: AnyCommand[] = [];
      for (const step of ex.steps) {
        const c = lane(built);
        const ctx = { ...c, points: [...new Set([...(c.points ?? []), ...assumed.points!])], circles: [...new Set([...(c.circles ?? []), ...assumed.circles!])] };
        const r = parse(step, ctx);
        expect(r.ok, `step "${step}" must parse (drifted prompt example)`).toBe(true);
        if (r.ok) built.push(...r.commands);
      }
    });
  }

  it('the rendered prompt still contains every example (extraction stayed in sync)', () => {
    const prompt = promptText(PROMPT_SPEC_2D);
    for (const ex of PROMPT_EXAMPLES) expect(prompt).toContain(`"${ex.freeform}" →`);
  });
});

// ── (b) each supported catalog example parses to a STABLE rule (catch a silent shadow flip) ───────────
describe('PAR-10 (b) — supported catalog examples parse to stable command types (He + En)', () => {
  const typesOf = (u: string): string[] => {
    const r = parse(u);
    // #775: a typed refusal is a RECOGNIZED, pinned outcome (a figure-dependent example clarifies
    // standalone); only the silent `not-handled` degrade stays banned below.
    return r.ok ? r.commands.map((c) => c.type) : [`<${r.reason}>`];
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
// #2428 (ADR-741): the lane reads the context of the built figure, so a later step sees O1/O2 because the figure has
// them — no label-shape fold (the retired `absorb`) decides what enters the context.
describe('PAR-10 (d) — a later step sees the subscripted labels an earlier step introduced', () => {
  it('O1 from step 1 is a point and a circle in the context of step 2', () => {
    const lane = laneContext({}, () => ({ facts: [], seed: 0 }));
    const cmds = ['נקודה A', 'circle O1 through A'].flatMap((l) => {
      const r = parse(l, { points: ['A'] });
      expect(r.ok, l).toBe(true);
      return r.ok ? r.commands : [];
    });
    const ctx = lane(cmds);
    expect(ctx.points).toEqual(expect.arrayContaining(['O1', 'A']));
    expect(ctx.circles).toContain('O1');
    expect(ctx.points, 'the structured id is NOT a point').not.toContain('circle-O1');
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
    const prompt = promptText(PROMPT_SPEC_2D);
    expect(prompt).toMatch(/NEVER invent an unstated property/);
    expect(prompt).toMatch(/NEVER drop a property the student DID state/);
  });
});
