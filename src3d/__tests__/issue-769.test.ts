/**
 * #769 (ADR-3D-183) — a DERIVED point that lands on an existing named point is not minted.
 *
 * Operator ruling, 2026-08-25: refuse the NAMING, affirm the geometry. «G נקודת חיתוך של AC' עם מישור
 * ADE» on the box: A defines plane ADE, so the crossing IS A — the student is told the crossing exists
 * and is the point they already have, and no second point is stacked on A. The honest sibling «CC'»
 * crosses at t = ½ and still builds. Stated over every derived-point kind (one check at the mint
 * chokepoint, provenance derived from the fact list), with the judgement the click-offer already uses
 * (`namedPointAt`), so the offer lane and the typed lane answer one question the same way (#653).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { openCrossings3 } from '../engine/crossings3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const facts = (us: string[]): Fact3[] =>
  us.map((u, i) => {
    const p = parse3(u);
    if (!p.ok) throw new Error(`parse failed: ${u}`);
    return { id: `f${i}`, utterance: u, cmds: p.commands, enabled: true };
  });

const BOX = ["תיבה ABCDA'B'C'D'", "E אמצע BB'", 'מישור ADE'];

describe('#769 — the operator’s box', () => {
  beforeEach(reset);

  it('«G נקודת חיתוך של AC\' עם מישור ADE» refuses, naming A — and G is NOT minted', () => {
    BOX.forEach(submit);
    expect(state().lastError).toBeNull();
    submit("G נקודת חיתוך של AC' עם מישור ADE");
    expect(state().lastError).toEqual({ code: 'point-coincides', id: 'G', with: 'A' });
    const d = derive3(state().facts, state().seed);
    expect(d.construction.points.has('G'), 'keep-prior-on-error: no second point on A').toBe(false);
  });

  it('the honest sibling «CC\'» crosses inside the edge and still builds', () => {
    BOX.forEach(submit);
    submit("G נקודת חיתוך של CC' עם מישור ADE");
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);
    const G = d.positions.get('G')!;
    const C = d.positions.get('C')!;
    const C1 = d.positions.get("C'")!;
    expect(G.z, 'strictly inside CC′ (t = ½)').toBeCloseTo((C.z + C1.z) / 2, 6);
    expect(G.x).toBeCloseTo(C.x, 6);
  });

  it('the OFFER lane agrees: no dot is offered at A for the same crossing', () => {
    const d = derive3(facts([...BOX, "AC'"]), 0);
    const A = d.positions.get('A')!;
    for (const k of openCrossings3(d.construction, d.resolved)) {
      expect(Math.hypot(k.point.x - A.x, k.point.y - A.y, k.point.z - A.z)).toBeGreaterThan(1e-6);
    }
  });
});

describe('#769 — the CLASS: every derived-point kind, not the one that surfaced it', () => {
  beforeEach(reset);

  it('a midpoint minted twice: «F אמצע AB» after «E אמצע AB» names E', () => {
    ["קובייה ABCDA'B'C'D'", 'E אמצע AB'].forEach(submit);
    submit('F אמצע AB');
    expect(state().lastError).toEqual({ code: 'point-coincides', id: 'F', with: 'E' });
  });

  it('a foot that lands on a vertex: the perpendicular from A′ onto the base meets it at A', () => {
    ["קובייה ABCDA'B'C'D'"].forEach(submit);
    submit("A'H גובה לפאה ABCD"); // the V8-e height-to-face mints H as the foot of A′ on the base — which is A
    expect(state().lastError).toEqual({ code: 'point-coincides', id: 'H', with: 'A' });
  });

  it('a plane∩segment crossing at an endpoint names the endpoint', () => {
    ["קובייה ABCDA'B'C'D'"].forEach(submit);
    submit("G נקודת חיתוך של BB' עם מישור ABCD");
    expect(state().lastError).toEqual({ code: 'point-coincides', id: 'G', with: 'B' });
  });

  it('a FREE rider is never judged — «P על הישר ℓ» twice is two riders, not a coincidence', () => {
    ["קובייה ABCDA'B'C'D'", 'x=(0,0,9)+t(1,0,0)', 'P על הישר ℓ', 'Q על הישר ℓ'].forEach(submit);
    expect(state().lastError).toBeNull();
  });

  it('a distinct derived point on a numerically-near figure still builds (the epsilon is the figure’s own)', () => {
    ["קובייה ABCDA'B'C'D'", 'E אמצע AB', 'F אמצע AD'].forEach(submit);
    expect(state().lastError).toBeNull();
  });
});
