/**
 * `dryRunOutcome` (operator request) — a deterministic parse can "succeed" yet build NOTHING (apply
 * with an error / kept-prior, or change nothing). The input layer dry-runs a step before committing,
 * so a silent fail is given a SECOND try through the LLM and then surfaced honestly — never shown as
 * success. A *givens violation* is deliberately NOT "produced nothing" (the amber cue already flags it).
 */
import { describe, it, expect } from 'vitest';
import { dryRunOutcome, type Fact } from '@/store/geoStore';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const facts = (cmds: AnyCommand[]): Fact[] => cmds.map((cmd, i) => ({ id: `f${i}`, group: `g${i}`, enabled: true, cmd }));
const cmdsOf = (u: string): AnyCommand[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`parse failed: ${u}`);
  return r.commands;
};

describe('dryRunOutcome — did the step actually build something?', () => {
  it('a real construct PRODUCES something (new objects)', () => {
    expect(dryRunOutcome([], cmdsOf('square ABCD'))).toEqual({ produced: true });
  });

  it('a constraint that adds no shape but a real constraint still counts as produced', () => {
    const base = facts(cmdsOf('square ABCD'));
    expect(dryRunOutcome(base, cmdsOf('AB = 6')).produced).toBe(true);
  });

  it('re-stating an existing construct verbatim builds NOTHING new → empty', () => {
    const base = facts(cmdsOf('square ABCD'));
    const o = dryRunOutcome(base, cmdsOf('square ABCD'));
    expect(o.produced).toBe(false);
    if (!o.produced) expect(o.reason).toBe('empty');
  });

  it('a RESHAPING step (diameter on a cyclic quad) counts as produced, not a silent no-op', () => {
    // "diameter AB" on ABCD-inscribed-in-O re-places vertices (B → antipode) — it adds no new object but
    // DOES change the figure, so the "produced nothing → retry LLM" guard must not read it as empty
    // (operator: "AB קוטר" was wrongly escalating to the LLM and failing).
    const base = facts(cmdsOf('מרובע ABCD חסום במעגל O'));
    const o = dryRunOutcome(base, [{ type: 'diameter', id1: 'A', id2: 'B', circle: 'circle-O' }]);
    expect(o.produced, 'a figure-reshaping step is not "empty"').toBe(true);
  });

  it('a step that cannot apply (the operator tangent-extension) → error', () => {
    // Two circles meet at A,B; C on the tangent to O at A; "extend CA onto circle O" — line CA is that
    // tangent, so it has no second crossing. The step errors (kept-prior), it did not build F.
    const base = facts([
      ...cmdsOf('שני מעגלים נחתכים בנקודות A ו B'),
      ...cmdsOf('המשיק למעגל O בנקודה A חותך את מעגל P בנקודה C'),
    ]);
    const o = dryRunOutcome(base, [{ type: 'extend-onto-circle', id: 'F', a: 'C', b: 'A', circle: 'circle-O' }]);
    expect(o.produced).toBe(false);
    if (!o.produced) expect(o.reason).toBe('error');
  });

  it('a bare variable binding ("x = 4") draws nothing but is NOT a silent fail (data-only)', () => {
    expect(dryRunOutcome([], [{ type: 'set-var', name: 'x', value: 4 }])).toEqual({ produced: true });
  });
});
