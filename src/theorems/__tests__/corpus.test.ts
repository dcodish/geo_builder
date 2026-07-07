/**
 * Phase-6a corpus gate — Q5–Q7 of the validation corpus, the primary theorem-surfacing target
 * (`docs/sample questions/theorem-ground-truth.md`). Each question is replayed step-by-step through the
 * REAL pipeline — parse-with-context → fact list → `replay` → `detectShapes` → `detectTheorems` — and at
 * every step asserts the two halves of "help, don't reveal":
 *   - **expectSurfaced ⊆ feed** — a theorem MUST be in the feed from the step its announcing given lands
 *     (accumulated: once expected it must stay);
 *   - **mustNotSurface ∩ feed = ∅** — a theorem whose premise is DERIVED (never given-announced) must
 *     never appear (`neverSurface`, every step), and a step-gated one must be absent until its given lands
 *     (`absentUntil`, the plan's step-tier transition — e.g. Q5's 104 only after "∠ACD = 90°").
 *
 * The forbidden derived-premise ids (68/71 for Q5, 69 for Q6, 76 for Q7) are excluded structurally — they
 * are simply not in THEOREM_TABLE (`integrity.test.ts` asserts that) — so these assertions also guard the
 * table against ever tabling them.
 */

import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { detectShapes } from '@/engine';
import type { AnyCommand } from '@/engine';
import { detectTheorems, visibleFeed } from '../detect';

function ctxOf(facts: Fact[]) {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

interface Step {
  u: string;
  /** Ids whose announcing given lands at THIS step (asserted ⊆ feed here and at every later step). */
  expect: number[];
  /** Ids that must be ABSENT at this step (a step-gated theorem before its given, plus `neverSurface`). */
  absent?: number[];
  /** RANKING assertion (T3, §9.2): these ids must appear within the first max(3, top.length) VISIBLE
   *  headline rows at this step — authored only where order matters pedagogically. */
  top?: number[];
}
interface CorpusQ {
  id: string;
  title: string;
  /** Derived-premise theorems that must NEVER appear, asserted absent at every step. */
  neverSurface: number[];
  steps: Step[];
}

const CORPUS: CorpusQ[] = [
  {
    id: 'Q5',
    title: 'isosceles triangle inscribed, arc midpoint, 90° inscribed angle',
    neverSurface: [103, 68, 71], // no diameter is ever stated (103); the similarity pairing is derived (68/71)
    steps: [
      { u: 'triangle ABC inscribed in circle O', expect: [99, 84], absent: [104, 91] }, // 91 needs a circumcircle CONSTRUCTED through 3 points, not points ON a circle (ADR-210 Am.)
      { u: 'D is the midpoint of arc BC', expect: [92, 94], absent: [104] },
      { u: 'AB = AC', expect: [22], absent: [104] }, // 104 still off — the 90° given hasn't landed
      { u: 'angle ACD = 90', expect: [104], top: [104] }, // the inscribed right angle announces a diameter — and must LEAD
    ],
  },
  {
    id: 'Q6',
    title: 'diameter ∩ chord, similar triangles, dropped perpendicular',
    neverSurface: [69], // the △ACD~△ECB pairing is the proof task (derived)
    steps: [
      { u: 'circle O radius 4', expect: [] },
      { u: 'AB is a diameter of circle O', expect: [103, 104, 97, 98], top: [103, 104] },
      // 4 concyclic points → same-chord inscribed angles (102). NOT 84 (no triangle) and NOT 91 (no
      // circumcircle CONSTRUCTED through 3 points — the chord's points are placed ON circle O; ADR-210 Am.).
      { u: 'DE is a chord of circle O', expect: [102], absent: [84, 91] },
      { u: 'AB and DE meet at C', expect: [2] }, // two chords cross → vertical angles
      { u: 'DF perpendicular to AB', expect: [28] },
    ],
  },
  {
    id: 'Q7',
    title: 'inscribed triangle, tangent, isosceles, bisector-ratio chain',
    neverSurface: [76], // the sharpest no-reveal case — no bisector is ever stated
    steps: [
      { u: 'triangle ABD inscribed in circle O', expect: [99, 84, 10, 11], absent: [103, 104, 91] }, // 91 needs a constructed circumcircle (ADR-210 Am.)
      { u: 'the tangent at D meets the extension of AB at E', expect: [105, 107], absent: [103, 104], top: [105, 107] },
      { u: 'F on AB', expect: [], absent: [103, 104] },
      { u: 'DE = FE', expect: [22], absent: [103, 104] }, // 103/104 off until AB is called a diameter
      { u: 'AB is a diameter', expect: [103, 104], top: [103, 104] },
    ],
  },
];

describe('Phase-6a theorem corpus (Q5–Q7)', () => {
  for (const q of CORPUS) {
    describe(`${q.id} — ${q.title}`, () => {
      const facts: Fact[] = [];
      let g = 0;
      const expected = new Set<number>();

      q.steps.forEach((step, i) => {
        it(`step ${i + 1}: ${step.u}`, () => {
          const group = `g${g++}`;
          const r = parse(step.u, ctxOf(facts));
          expect(r.ok, `step did not parse (would escalate): ${step.u}`).toBe(true);
          if (!r.ok) return;
          for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step.u, group, cmd, enabled: true });

          const { construction } = replay(facts);
          const shapes = detectShapes(construction).shapes;
          const entries = detectTheorems({ facts, construction, shapes });
          const feed = new Set(entries.map((e) => e.id));

          step.expect.forEach((x) => expected.add(x));
          // expectSurfaced ⊆ feed (accumulated)
          for (const x of expected) expect(feed.has(x), `#${x} expected in the feed by step ${i + 1}`).toBe(true);
          // mustNotSurface ∩ feed = ∅
          for (const x of [...q.neverSurface, ...(step.absent ?? [])]) expect(feed.has(x), `#${x} must NOT surface at step ${i + 1}`).toBe(false);
          // RANKING (T3, §9.2): the step's announcements lead the visible headline rows.
          if (step.top) {
            const { visible } = visibleFeed(entries);
            const window = visible.slice(0, Math.max(3, step.top.length)).map((e) => e.id);
            for (const x of step.top) expect(window, `#${x} must rank in the top of step ${i + 1}`).toContain(x);
          }
        });
      });
    });
  }
});
