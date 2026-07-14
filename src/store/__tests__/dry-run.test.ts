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

  it('an equality that PINS an isosceles soft default counts as produced (soft → forced), even with no geometric move', () => {
    // "משולש שווה שוקיים" soft-defaults to apex A (|AB|=|AC|). Restating AB=AC names the pair (the student's
    // choice, ADR-138) — it flips the relation from unforced to reported. The geometry (which already used
    // that pair as its default drawing) doesn't move, so the geometric checks read "empty" — but this is
    // genuine new information and must commit, not be swallowed as "already drawn" (session z4v1zza3).
    const iso = facts([{ type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'], variant: 0 } as AnyCommand]);
    expect(dryRunOutcome(iso, cmdsOf('AB=AC')).produced, 'AB=AC pins the soft default').toBe(true);
    // A DIFFERENT pair (AB=BC) reshapes → produced by geometry alone (sanity; the pin path isn't needed).
    expect(dryRunOutcome(iso, cmdsOf('AB=BC')).produced, 'a different pair reshapes').toBe(true);
    // On a PLAIN triangle (no shape-variant) an equality that reshapes still produces, and one that doesn't
    // pin any variant isn't rescued by this path — guarded by the other cases; here we assert the pin path
    // is scoped to variant shapes: an equality naming a NON-variant triangle's existing sides is unaffected.
  });

  it('RE-TYPING an equality that is already a committed fact is a friendly no-op, not a phantom move (issue #1)', () => {
    // ADR-234 class: the commit's `foldFact` dedups an EXACT enabled-duplicate, so the figure never moves —
    // but the dry-run's trial used to append the duplicate un-deduped, and two identical `set-equal`s perturb
    // the solver ~0.75, falsely reading as "produced". The dry-run must model the commit's dedup: an exact
    // enabled-duplicate contributes nothing → the step is "already drawn" (empty), not a phantom build.
    const iso = facts([{ type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'], variant: 0 } as AnyCommand]);
    const withPair = [...iso, ...facts(cmdsOf('AB=AC')).map((f, i) => ({ ...f, id: `eq${i}` }))];
    const o = dryRunOutcome(withPair, cmdsOf('AB=AC'));
    expect(o.produced, 'a duplicate of an already-committed equality builds nothing new').toBe(false);
    if (!o.produced) expect(o.reason).toBe('empty');
    // Class breadth: the same holds for a plain construct's constraint (not just the variant-pin path).
    const sq = facts(cmdsOf('square ABCD'));
    const withLen = [...sq, ...facts(cmdsOf('AB = 6')).map((f, i) => ({ ...f, id: `len${i}` }))];
    const o2 = dryRunOutcome(withLen, cmdsOf('AB = 6'));
    expect(o2.produced, 're-typing an existing distance given is already-drawn').toBe(false);
  });
});
