/**
 * ADR-3D-030 — a plane EQUATION on a solid-bearing figure is an M1 GIVEN:
 * `מישור A'B'C'D' הוא x-4y-8z-142=0` DRIVES the free gauge/dims (pivot plane-pins,
 * placement-first staged solve — never the degenerate shrink-onto-the-plane basin)
 * when nothing else pins the figure, VERIFIES on a determined figure, and a
 * contradictory equation refuses keep-prior. Operator request 2026-07-09
 * (follow-up to the ADR-3D-026 Am. parse fix — bare מישור + the copula הוא).
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
const derived = () => derive3(state().facts, state().seed);
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}

describe('ADR-3D-030 — a plane equation drives / verifies / refuses', () => {
  beforeEach(reset);

  it('drives a FREE box: the named face lands exactly on the plane, non-degenerate; resample keeps it', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit("מישור A'B'C'D' הוא x-4y-8z-142=0");
    expectAllOk();
    const check = () => {
      const d = derive3(state().facts, state().seed);
      for (const id of ["A'", "B'", "C'", "D'"]) {
        const p = d.positions.get(id)!;
        expect(Math.abs(p.x - 4 * p.y - 8 * p.z - 142) / 9, id).toBeLessThan(1e-6);
      }
      // the box must NOT have shrunk onto the plane (the degenerate basin)
      const a = d.positions.get("A'")!;
      const b = d.positions.get("B'")!;
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeGreaterThan(0.05);
    };
    check();
    useGeo3.getState().resample(); // ADR-052: free dims vary, the stated membership holds
    check();
  });

  it('English mirror: "plane ... is ..." drives a free box', () => {
    submit("box ABCDA'B'C'D'");
    submit("plane A'B'C'D' is x-4y-8z-142=0");
    expectAllOk();
  });

  it('verifies on a coordinate-pinned box (copula form); a wrong equation refuses claim-refuted keep-prior', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit("נתון: A(0,0,0), B(4,0,0), C(4,3,0), A'(0,0,5)");
    submit("מישור A'B'C'D' הוא z-5=0");
    expectAllOk();
    const n = state().facts.length;
    submit('מישור ABCD הוא z-1=0'); // the base sits on z=0 — a wrong answer
    expect(state().facts).toHaveLength(n);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it("dev session rqlu4vkt: plane-eq + ONE injected base vertex — jointly satisfiable (height 18), B' derived as knowledge, no sample labels", () => {
    submit('תיבה');
    submit("מישור A'B'C'D' הוא x+4y-8z-142=0");
    submit('B(0,7,6)'); // dist(B, plane) = |0+28−48−142|/9 = 18 ⇒ the box height
    expectAllOk();
    const check = () => {
      const d = derive3(state().facts, state().seed);
      const B = d.positions.get('B')!;
      const Bp = d.positions.get("B'")!;
      expect(Math.hypot(Bp.x - B.x, Bp.y - B.y, Bp.z - B.z)).toBeCloseTo(18, 4);
      // non-degenerate box — the collapsed B'≡C' basin is rejected, never accepted
      const Cp = d.positions.get("C'")!;
      expect(Math.hypot(Cp.x - Bp.x, Cp.y - Bp.y, Cp.z - Bp.z)).toBeGreaterThan(0.05);
    };
    check();
    useGeo3.getState().resample();
    check();
    // the data panel prints ONLY seed-invariant knowledge: B (the given) and B'
    // (forced: B + 18·n̂ = (2, 15, −10)); every free node carries NO label at all
    const d = derived();
    const panel = dataView(d.construction, state().seed);
    expect(Object.keys(panel.pointCoords).sort()).toEqual(['B', "B'"]);
    expect(panel.pointCoords["B'"]).toEqual({ text: '(2, 15, -10)', kind: 'fact' });
    // drawing BB' surfaces its DERIVED length — forced by the givens, never typed
    submit("BB'");
    expectAllOk();
    const panel2 = dataView(derived().construction, state().seed);
    const row = panel2.vectors.find((v) => v.label === "BB'");
    expect(row?.mag).toBe("|BB'| = 18");
    expect(row?.sq).toBe("BB'² = 324");
  });

  it('two contradictory equations on the same face refuse keep-prior', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit("מישור A'B'C'D' הוא z-5=0");
    expectAllOk();
    const n = state().facts.length;
    submit("מישור A'B'C'D' הוא z-9=0"); // one face cannot lie on two parallel planes
    expect(state().facts).toHaveLength(n);
    expect(state().lastError).not.toBeNull();
  });
});
