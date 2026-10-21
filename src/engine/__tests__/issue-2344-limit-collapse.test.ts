/**
 * #2344 ([ADR-746](../../../docs/06-decisions.md#adr-746)) — GIVENS THAT HOLD ONLY IN THE LIMIT WHERE A DECLARED
 * TRIANGLE COLLAPSES ARE REFUSED, HOWEVER THE SLACK IS SPELLED. The mechanism half (the class through the student's
 * door is `src/__tests__/issue-2344-impossible-right-isosceles.test.ts`).
 *
 * «משולש ABC» · «AB = BC» · «AC ⊥ BC» drew a green sliver (|AC| ≈ 1e-3 of the sides): two escapes, one per spelling.
 *  A. ADR-537's tightened re-solve scaled only the DEGREE tolerances. At a TANGENT root a length equality's residual
 *     vanishes to second order, so the length family's own slack bought the sliver; it is now tightened too, by its
 *     own factor (`LENGTH_TIGHT_FACTOR`).
 *  B. «AB = BC» · «∠ACB = 90» found no candidate at all and was parked as pending: ADR-658's no-room prover did not
 *     read the base angles a stated equal pair forces. It does now, and the verdict is the triangle's collapse.
 *  C. Both refuse with ADR-602's flat refusal (`collapsed: polygon …`), marked degenerate.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { COLLAPSED_VS, replay } from '@/replay/core';
import {
  applyCommand,
  applyStep,
  buildSymTab,
  drivenConstraintsOf,
  LENGTH_TIGHT_FACTOR,
  lowerOne,
  residualTolerance,
  TIGHT_TOLERANCE_FACTOR,
  withToleranceFactor,
} from '@/engine';
import { angleSumImpossibility } from '@/engine/metricFeasibility';
import type { Command, Construction } from '@/engine';
import { buildParseCtx, parse } from '@/parser';

/** The prefix's figure, and the last line's lowered commands. */
function lineOn(prefix: string[], line: string): { cur: Construction; cmds: Command[] } {
  const facts = factsOf(prefix);
  const fig = replay(facts);
  const r = parse(line, buildParseCtx(fig.construction, fig.positions));
  if (!r.ok) throw new Error(`no parse: ${line}`);
  const symtab = buildSymTab([...facts.map((f) => f.cmd), ...r.commands]);
  return { cur: fig.construction, cmds: r.commands.flatMap((c) => lowerOne(c, symtab)) as Command[] };
}
/** The prover's verdict on the construction with the line applied — the gate's own reading. */
function proverOn(prefix: string[], line: string) {
  const { cur, cmds } = lineOn(prefix, line);
  const probe = cmds.reduce((c, cmd) => applyCommand(c, cmd), cur);
  return angleSumImpossibility(probe.objects, probe.constraints, [...probe.constraints, ...drivenConstraintsOf(probe)]);
}
/** The first refused step of the line, or null when every lowered command applies. */
function refusalOf(prefix: string[], line: string) {
  const { cur, cmds } = lineOn(prefix, line);
  let c = cur;
  for (const cmd of cmds) {
    const s = applyStep(c, cmd);
    if (!s.ok) return s;
    c = s.construction;
  }
  return null;
}

describe('#2344 A — the tightened re-solve reaches the length family, at its own factor', () => {
  it('the per-family table: degree × 0.02, length × LENGTH_TIGHT_FACTOR, ∥/⟂ and bounds untouched; always restored', () => {
    const angle = { type: 'angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 90 } as const;
    const length = { type: 'distance', a: 'A', b: 'B', value: 5 } as const;
    const equal = { type: 'equal', a: 'A', b: 'B', c: 'B', d: 'C' } as const;
    const perp = { type: 'perpendicular', a: 'A', b: 'B', c: 'B', d: 'C' } as const;
    const base = { angle: residualTolerance(angle), length: residualTolerance(length, 10), equal: residualTolerance(equal, 10), perp: residualTolerance(perp) };
    withToleranceFactor(TIGHT_TOLERANCE_FACTOR, () => {
      expect(residualTolerance(angle)).toBeCloseTo(base.angle * TIGHT_TOLERANCE_FACTOR, 12);
      expect(residualTolerance(length, 10)).toBeCloseTo(base.length * LENGTH_TIGHT_FACTOR, 15);
      expect(residualTolerance(equal, 10)).toBeCloseTo(base.equal * LENGTH_TIGHT_FACTOR, 15);
      expect(residualTolerance(perp), '∥/⟂/collinear are never tightened').toBe(base.perp);
    }, LENGTH_TIGHT_FACTOR);
    withToleranceFactor(TIGHT_TOLERANCE_FACTOR, () => {
      expect(residualTolerance(length, 10), 'the length family is tightened only when asked').toBe(base.length);
    });
    expect(residualTolerance(angle), 'restored').toBe(base.angle);
    expect(residualTolerance(length, 10), 'restored').toBe(base.length);
  });

  it('the factor is sized for a quadratic contact: √(2 · 2e-4 · f) sits below the 1e-3 coincidence floor', () => {
    expect(Math.sqrt(2 * 2e-4 * LENGTH_TIGHT_FACTOR)).toBeLessThan(1e-3);
  });

  it('the ⊥ sliver is refused at the step as the triangle\'s collapse, degenerate, naming the statement', () => {
    const s = refusalOf(['משולש ABC', 'AB = BC'], 'AC ⊥ BC');
    expect(s, 'the ⊥ is refused').not.toBeNull();
    if (s && !s.ok) {
      expect(s.error).toMatch(COLLAPSED_VS);
      expect(s.error).toMatch(/^collapsed: polygon A, B, C would be flat — .*⟂.* cannot hold$/);
      expect(s.degenerate, 'a solution existed and was not a figure — never pending').toBe(true);
    }
  });
});

describe('#2344 B — the no-room prover reads the base angles of a stated equal pair', () => {
  const ISO = ['משולש ABC', 'AB = BC'];
  it.each([
    [ISO, '∠ACB = 90'],
    [ISO, 'AC ⊥ BC'],
    [ISO, 'AB ⊥ AC'],
    [['משולש ABC', 'AB = AC'], '∠ABC = 90'],
    [['משולש ABC', 'AB = AC'], 'AB ⊥ BC'],
    [['משולש ABC', 'AB = 5', 'BC = 5'], 'AC ⊥ BC'],
    [['משולש ABC', '∠ACB = 90'], 'AB = BC'],
  ])('%j · «%s» is a limit-collapse', (prefix, line) => {
    const v = proverOn(prefix, line);
    expect(v?.kind).toBe('limit-collapse');
    expect(v?.polygon).toEqual(['A', 'B', 'C']);
    expect(v?.inferred?.length).toBe(1);
  });

  it.each([
    [ISO, '∠ABC = 90', 'the right angle at the APEX: a real right isosceles triangle'],
    [ISO, 'AB ⊥ BC', 'the same, as a ⟂'],
    [['משולש ABC', 'CA = CB'], 'AC ⊥ BC', 'the apex at C'],
    [ISO, '∠ACB = 40', 'a base angle that leaves room'],
    [['משולש ABC', 'AB = 10', 'BC = 9.99'], 'AC ⊥ BC', 'unequal stated lengths are no pair'],
  ])('%j · «%s» proves nothing (%s)', (prefix, line) => {
    expect(proverOn(prefix, line)).toBeNull();
  });

  it('the angle form is refused at the step as the collapse, degenerate, before the ladder', () => {
    const s = refusalOf(['משולש ABC', 'AB = BC'], '∠ACB = 90');
    expect(s).not.toBeNull();
    if (s && !s.ok) {
      expect(s.error).toBe('collapsed: polygon A, B, C would be flat — ∠ACB = 90° cannot hold');
      expect(s.degenerate).toBe(true);
      expect(s.ladder).toEqual(['pre:impossible']);
    }
  });

  it('two STATED right angles keep ADR-658\'s over-constraint wording', () => {
    const s = refusalOf(['משולש ABC', '∠ABC = 90'], '∠ACB = 90');
    expect(s).not.toBeNull();
    if (s && !s.ok) expect(s.error).toMatch(/^over-constrained: ∠ACB = 90° cannot hold/);
  });
});
