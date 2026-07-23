/**
 * #289 (M1): `המנסרה ישרה` / `the prism is right` — a statement that THE existing solid is a RIGHT
 * prism. It must never re-construct (the prod bug: the LLM re-declared the vertices → `'A' כבר מוגדר`).
 * An oblique `מקבילון` (parallelepiped) becomes a right `prism4` (lateral edges ⟂ base); an already-right
 * prism is idempotent; no prism → an honest refusal.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { freeDofCount3 } from '../engine/evaluate';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
const dof = () => freeDofCount3(derived().construction, derived().resolved);
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}

describe('#289 — parse: definite «המנסרה ישרה» lowers to make-right-prism', () => {
  for (const u of ['המנסרה ישרה', 'המנסרה היא ישרה', 'the prism is right', 'make the prism right', 'the prism is a right prism']) {
    it(`"${u}" → make-right-prism`, () => {
      expect(parse3(u)).toEqual({ ok: true, commands: [{ type: 'make-right-prism' }] });
    });
  }
  it('the base-less CONSTRUCTION form «מנסרה ישרה» is NOT claimed as a statement (stays not-handled)', () => {
    expect(parse3('מנסרה ישרה')).toEqual({ ok: false, reason: 'not-handled' });
  });
  it('the based construction form still builds a prism (not shadowed)', () => {
    expect(parse3('מנסרה ישרה שבסיסה מקבילית').ok).toBe(true);
    expect(parse3("מנסרה ישרה משולשת ABC").ok).toBe(true);
  });
});

describe('#289 — an oblique מקבילון becomes a RIGHT prism', () => {
  beforeEach(reset);

  it("מקבילון → המנסרה ישרה: converts to a right prism (top face straight above the base), DOF 5 → 3", () => {
    submit("מקבילון ABCDA'B'C'D'");
    expect(dof()).toBe(5); // parallelogram base (dx,dy) + free lateral vector (wx,wy,wz)
    submit('המנסרה ישרה');
    expectAllOk();
    expect(dof()).toBe(3); // dx, dy, height — the lateral vector is now pinned ⟂ base
    // every top vertex sits directly above its base vertex (lateral edges vertical)
    const pos = derived().positions;
    for (const [base, top] of [['A', "A'"], ['B', "B'"], ['C', "C'"], ['D', "D'"]] as const) {
      const b = pos.get(base)!;
      const tp = pos.get(top)!;
      expect(tp.x).toBeCloseTo(b.x, 9);
      expect(tp.y).toBeCloseTo(b.y, 9);
      expect(tp.z).toBeGreaterThan(b.z + 1e-6);
    }
    // no new points were introduced (M1, never a re-construction)
    expect([...derived().construction.points.keys()].sort()).toEqual(['A', "A'", 'B', "B'", 'C', "C'", 'D', "D'"]);
  });
});

describe('#289 — idempotent / refusals', () => {
  beforeEach(reset);

  it('an already-right prism: «המנסרה ישרה» is an idempotent no-op (NOT already-defined)', () => {
    submit("מנסרה ישרה שבסיסה מקבילית ABCDA'B'C'D'"); // prism4 — already right
    const before = derived().positions.get('A')!;
    submit('המנסרה ישרה');
    expectAllOk();
    expect(state().lastError).toBeNull();
    const after = derived().positions.get('A')!;
    expect(after).toEqual(before); // no move
  });

  it('the operator sequence: a right prism exists, «המנסרה ישרה» does NOT error already-defined', () => {
    submit("מנסרה ישרה שבסיסה מקבילית");
    submit('המנסרה ישרה');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id]).toBe('ok');
    expect(state().lastError).toBeNull();
  });

  it('no solid at all: «המנסרה ישרה» refuses honestly (no-prism-to-make-right), keep-prior', () => {
    submit('המנסרה ישרה');
    expect(state().lastError).toMatchObject({ code: 'no-prism-to-make-right' });
    expect(state().facts).toHaveLength(0); // keep-prior: nothing added
  });
});
