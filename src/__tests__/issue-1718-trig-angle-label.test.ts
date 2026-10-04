/**
 * #1718 (ADR-572, amends ADR-566) — a trig given's canvas label is the ANGLE it draws.
 *
 * Operator, 2026-10-03, playing T31: "if we have tan something = something, we should translate that to
 * an angle and show the angle" — and "only 64.43" (atan 2 = 63.43°): the figure shows only the angle,
 * never «tan=2» beside it. The fact row keeps the sentence as typed.
 *
 * Measured on main deed7b20: «tan∢ABC = 2» labelled the wedge «tan=2» (ADR-566 put the given's text on
 * the measure). These locks CALL the real path (`decideDeterministic2D` → `replay` → the figure's label
 * list); the expected text is the shared display rounder's (`fmtNum`) output, never a re-implemented
 * rounding.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: () => null }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay } from '@/store/geoStore';
import { fmtNum } from '../../shell/format';
import { factsOf } from './scenario-pipeline';

const DEG = 180 / Math.PI;
const TRI = ['משולש ABC'];

/** The label texts at a vertex, as the figure carries them. */
const wedge = (lines: string[], vertex: string, seed: number): string[] =>
  replay(factsOf(lines), seed).labels.angles.filter((l) => l.vertex === vertex).map((l) => l.text);

describe('#1718 — the wedge of a trig given prints its angle through the shared rounder, at every seed', () => {
  const CASES: [string, string, number][] = [
    ['tan∢ABC = 2', 'B', Math.atan(2) * DEG], // the operator's case: 63.43°
    ['טנגנס הזווית ABC הוא 2', 'B', Math.atan(2) * DEG],
    ['tan∢ABC = -2', 'B', 180 - Math.atan(2) * DEG],
    ['tan∢ABC = √3', 'B', 60],
    ['cot∢ABC = 2', 'B', Math.atan(0.5) * DEG],
    ['cos∢ACB = 3/4', 'C', Math.acos(0.75) * DEG],
    ['קוסינוס הזווית ACB = 3/4', 'C', Math.acos(0.75) * DEG],
    ['cos∢ABC = -1/2', 'B', 120],
  ];
  for (const [line, vertex, want] of CASES) {
    it(`«${line}» → «${fmtNum(want)}°» at seeds 0–3`, () => {
      for (let seed = 0; seed < 4; seed++) {
        const texts = wedge([...TRI, line], vertex, seed);
        expect(texts, `seed ${seed}`).toEqual([`${fmtNum(want)}°`]);
        expect(texts.join(' '), 'no ratio beside the angle').not.toMatch(/=|tan|cos|cot/);
      }
    });
  }
  it('the operator’s case reads exactly «63.43°»', () => {
    expect(wedge([...TRI, 'tan∢ABC = 2'], 'B', 0)).toEqual(['63.43°']);
  });
});

describe('#1718 — the fact row keeps the sentence as typed', () => {
  it('«tan∢ABC = 2» is stored with its own utterance', () => {
    const facts = factsOf([...TRI, 'tan∢ABC = 2']);
    const trig = facts.filter((f) => f.cmd.type === 'measure-angle');
    expect(trig.length).toBe(1);
    expect(trig[0].utterance).toBe('tan∢ABC = 2');
  });
});

describe('#1718 — a signed fraction is accounted by its value, not by label digits', () => {
  // ADR-566's label text «cos=-1/2» carried the digits 1 and 2, and those paid the span accountant for the
  // stated «2». With the text gone, the accountant must credit the pair from the lowered −0.5 itself.
  for (const [line, want] of [['cos∢ABC = -1/2', 120], ['tan∢ABC = -3/4', 180 - Math.atan(0.75) * DEG]] as const) {
    it(`«${line}» commits ∠ = ${want.toFixed(2)}°, never escalates`, async () => {
      const facts = factsOf(TRI);
      const d = replay(facts, 0);
      const v = await decideDeterministic2D({ facts, seed: 0, view: { construction: d.construction, positions: d.positions } }, line, 'he');
      expect(v.kind).toBe('commit');
      const m = v.kind === 'commit' ? v.commands.find((c) => c.type === 'measure-angle') : undefined;
      expect(m && m.type === 'measure-angle' && 'value' in m.expr ? m.expr.value : NaN).toBeCloseTo(want, 9);
    });
  }
});
