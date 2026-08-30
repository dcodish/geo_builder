/**
 * #811 (ADR-3D-182) — a perpendicularity between two objects that SHARE a vertex is reported.
 *
 * Operator (2026-08-29, playing #754): «קובייה ABCDA'B'C'D'», «|AB| = 4», «BC» → the panel showed
 * AB² = 16 and BC² = 16 and NOTHING else — no AB ⊥ BC, no AB·BC = 0, no |AB| = |BC|. All three are
 * forced by the cube and identical at every seed. Two lanes, two defects: the mutual lane's
 * shared-endpoint skip (a POSITION notion) `continue`d out before the ⟂ row (a DIRECTION notion), and
 * the relations lane scanned `c.vectors` only, while a drawn segment is presented as a vector in the
 * same panel — the #558/#577 class (the object exists but is outside the universe the derivation
 * scans), third member.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const panel = () => dataView(derive3(state().facts, state().seed).construction, state().seed);
const mutualOf = (p: ReturnType<typeof panel>) => p.mutual.map((m) => `${m.a} ${m.rel} ${m.b}`);

describe('#811 — the operator’s cube', () => {
  beforeEach(reset);

  it('«|AB| = 4» then «BC»: AB ⊥ BC, AB·BC = 0 and |AB| = |BC| all appear', () => {
    ["קובייה ABCDA'B'C'D'", '|AB| = 4', 'BC'].forEach(submit);
    expect(state().lastError).toBeNull();
    const p = panel();
    expect(mutualOf(p)).toContain('AB perpendicular BC');
    expect(p.relations).toContain('AB·BC = 0');
    expect(p.relations.some((r) => /^\|AB\| = \|BC\|( = 4)?$/.test(r) || /^\|BC\| = \|AB\|( = 4)?$/.test(r)), JSON.stringify(p.relations)).toBe(true);
    // the POSITION row for an adjacent pair stays suppressed — they obviously meet at B
    expect(mutualOf(p).some((r) => r.startsWith('AB intersecting') || r.startsWith('BC intersecting'))).toBe(false);
  });

  it('the controls are unchanged: «CC\'» (skew ⊥) and «DC» (parallel) keep their rows', () => {
    ["קובייה ABCDA'B'C'D'", '|AB| = 4', "CC'"].forEach(submit);
    let m = mutualOf(panel());
    expect(m).toContain("AB skew CC'");
    expect(m).toContain("AB perpendicular CC'");
    reset();
    ["קובייה ABCDA'B'C'D'", '|AB| = 4', 'DC'].forEach(submit);
    m = mutualOf(panel());
    expect(m).toContain('AB parallel DC');
    expect(m.some((r) => r.includes('perpendicular'))).toBe(false);
  });

  it('a cube with NO named segments still produces no edge×edge flood', () => {
    ["קובייה ABCDA'B'C'D'"].forEach(submit);
    const p = panel();
    expect(p.mutual).toEqual([]);
    expect(p.relations.filter((r) => r.includes('·'))).toEqual([]);
  });

  it('two segments sharing a vertex that are NOT perpendicular: no ⟂ row, no position row', () => {
    ["קובייה ABCDA'B'C'D'", '|AB| = 4', 'AC'].forEach(submit); // AB and the face diagonal AC meet at A at 45°
    const p = panel();
    expect(mutualOf(p).some((r) => r.includes('AB') && r.includes('AC'))).toBe(false);
    expect(p.relations).not.toContain('AB·AC = 0');
  });

  it('a declared vector and its own drawn segment are ONE row (no «|u| = |AB|» tautology)', () => {
    ["קובייה ABCDA'B'C'D'", 'AB = u', 'AB', 'BC'].forEach(submit);
    const p = panel();
    expect(p.relations.some((r) => r.includes('|u| = |AB|') || r.includes('|AB| = |u|'))).toBe(false);
    expect(p.relations).toContain('u·BC = 0');
  });
});
