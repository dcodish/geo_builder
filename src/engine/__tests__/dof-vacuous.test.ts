/**
 * #432 ([ADR-424](docs/06-decisions.md#adr-424)): a structurally-implied (VACUOUS) `collinear`
 * constraint removes NO degree of freedom.
 *
 * The reported figure (operator, 2026-07-30 — the two-secant power-of-a-point bagrut shape): «ישר ADE»
 * re-states what the construction already guarantees (E is *defined* as the line∩circle crossing on the
 * line through A and D), yet each such statement was counted as removing 1 DOF. Two of them pushed the
 * shape count below zero (clamped to 0) on a figure with ONE genuine DOF left — the angle at A between
 * the secants — which starved the shared sample pool to a single drawing: the values panel printed one
 * seed's CD/a as forced knowledge and the DOF cue read "✓ fully determined" on an under-determined
 * figure. The class (docs/17 §2.2): constraint-count arithmetic as a proxy for "does anything vary?".
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';
import { replay, computeValues } from '@/replay/core';
import type { Fact } from '@/replay/core';
import { freeDofCount } from '@/engine/sample';
import { valueText, type ValueRow } from '@/engine/valuesPanel';

/** Build facts through the real parse path (context threaded per step). */
function factsFrom(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `g${gi}.${facts.length}`, utterance: u, group: `g${gi}`, cmd, enabled: true });
  }
  return facts;
}

const SECANTS = [
  'AB',
  'מנקודה A יוצא חותך למעגל בנקודות C ו B',
  'מנקודה A יוצא חותך למעגל בנקודות D ו E',
  'CD',
  'BE',
  'AB=10a',
  'AE=8a',
];
const LINES = ['ישר ADE', 'ישר ACB'];
const RATIO = 'BC=2DE';

const textOf = (rows: ValueRow[], label: string): string | undefined => {
  const r = rows.find((x) => x.kind === 'length' && [...x.label].sort().join('') === [...label].sort().join(''));
  return r && valueText(r);
};

describe('#432 — a vacuous collinear removes no DOF', () => {
  it("the operator's figure keeps its one genuine DOF (the inter-secant angle) despite the ישר re-statements", () => {
    const facts = factsFrom([...SECANTS, ...LINES, RATIO]);
    const { construction } = replay(facts, 0);
    // pre-fix: 0 ("✓ fully determined" on an under-determined figure). The ישר statements must cost nothing.
    expect(freeDofCount(construction)).toBe(1);
    const { construction: control } = replay(factsFrom([...SECANTS, RATIO]), 0);
    expect(freeDofCount(control), 'the ישר statements add order info, never DOF consumption').toBe(1);
  });

  it('the values panel prints exactly the FORCED multiples and withholds the config-dependent ones', () => {
    const { rows, sampleCount } = computeValues(factsFrom([...SECANTS, ...LINES, RATIO]));
    // pre-fix the pool starved to 1 sample (the "determined figure" fast path); an honest pool is ≥4.
    expect(sampleCount).toBeGreaterThanOrEqual(4);
    // forced by the givens (power of the point + BC = 2DE): AC = 4a, AD = 5a, BC = 6a, DE = 3a.
    expect(textOf(rows, 'AB')).toBe('10a');
    expect(textOf(rows, 'AE')).toBe('8a');
    expect(textOf(rows, 'AC')).toBe('4a');
    expect(textOf(rows, 'AD')).toBe('5a');
    expect(textOf(rows, 'BC')).toBe('6a');
    expect(textOf(rows, 'DE')).toBe('3a');
    // NOT forced (they vary with the free inter-secant angle): CD, BE, and every circle magnitude.
    // Pre-fix these printed one seed's accident (CD = 4.12a, radius = 4.15a).
    expect(textOf(rows, 'CD')).toBeUndefined();
    expect(textOf(rows, 'BE')).toBeUndefined();
    expect(rows.some((r) => r.kind === 'radius' || (r.kind === 'area' && r.label.startsWith('(')))).toBe(false);
  });

  it('a NON-vacuous collinear still removes its DOF (ישר over free points keeps counting)', () => {
    // ADR-050 «ישר ABE»: E free/new — the collinearity genuinely constrains it.
    const withLine = factsFrom(['משולש ABC', 'נקודה D', 'ישר ABD']);
    const without = factsFrom(['משולש ABC', 'נקודה D']);
    const dofWith = freeDofCount(replay(withLine, 0).construction);
    const dofWithout = freeDofCount(replay(without, 0).construction);
    expect(dofWithout - dofWith, 'the constraint consumed exactly one DOF').toBe(1);
  });

  it('a collinear through a MIDPOINT carrier is vacuous (pair-key lane)', () => {
    // M is defined as the midpoint of AB — «ישר AMB» adds no information.
    const base = factsFrom(['משולש ABC', 'M אמצע AB']);
    const restated = factsFrom(['משולש ABC', 'M אמצע AB', 'ישר AMB']);
    expect(freeDofCount(replay(restated, 0).construction)).toBe(freeDofCount(replay(base, 0).construction));
  });
});
