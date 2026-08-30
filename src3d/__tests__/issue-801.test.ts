/**
 * #801 (ADR-3D-174) — ONE SYMBOL, ONE OWNER: the bagrut prism (operator, 2026-08-27) whose line
 * equation reuses the letter the vector injections already carry.
 *
 *   «מנסרה ישרה משולשת ABCA'B'C'»
 *   «AA'=(k-1,k-7,k+1)» · «AC=(k+1,0,k-3)» · «AB=(k-1,k,3)»   → the right-prism structure pins k = 2
 *   «משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)»             → the exercise's given line
 *
 * Before the fix the equation opened a SECOND mechanism for k (the `c.param` root-find lane) while the
 * pivot held the first: the named form was refused `not-on-line: A` — blaming a correct given — and the
 * bare form drew ℓ at a SAMPLED k ≈ 0 while the panel read k = 2, a green figure contradicting the
 * student's own equation. The letter now routes to the mechanism that owns it, and the membership on a
 * pin-symbol carrier drives INSIDE the pivot (the ADR-3D-033 stage, extended past planes).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3 } from '../engine/types';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { cross3, norm3, sub3 } from '../engine/vec3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const err = () => state().lastError;

const PRISM = ["מנסרה ישרה משולשת ABCA'B'C'", "AA'=(k-1,k-7,k+1)", 'AC=(k+1,0,k-3)', 'AB=(k-1,k,3)'];
const NAMED = 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)';
const BARE = 'x=(8,-1,-1)+t(k+1,0,k-3)';

/** distance of a point from a resolved line — the store's own on-line measure */
const offLine = (p: { x: number; y: number; z: number }, ln: { anchor: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } }) =>
  norm3(cross3(sub3(p, ln.anchor), ln.dir)) / norm3(ln.dir);

const facts = (us: string[]): Fact3[] =>
  us.map((u, i) => {
    const p = parse3(u);
    if (!p.ok) throw new Error(`parse failed: ${u}`);
    return { id: `f${i}`, utterance: u, cmds: p.commands, enabled: true };
  });

describe('#801 — the equation and the injections share ONE letter', () => {
  beforeEach(reset);

  it('the NAMED form builds green: A and C ride the line, drawn at the pivot’s k = 2', () => {
    for (const u of [...PRISM, NAMED]) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      expect(Object.values(d.status).every((s) => s === 'ok'), `seed ${seed}: ${JSON.stringify(d.status)}`).toBe(true);
      expect(d.resolved.pivot?.pinSymbols?.k, `seed ${seed}`).toBeCloseTo(2, 3);
      const ln = d.resolved.lines.get('AC')!;
      expect(ln, `seed ${seed}: the stated line is drawn`).toBeDefined();
      // at k = 2 the direction is (k+1, 0, k-3) = (3, 0, -1) — the student's equation, not a sample
      expect(ln.dir.x, `seed ${seed}`).toBeCloseTo(3, 4);
      expect(ln.dir.y, `seed ${seed}`).toBeCloseTo(0, 4);
      expect(ln.dir.z, `seed ${seed}`).toBeCloseTo(-1, 4);
      for (const id of ['A', 'C']) expect(offLine(d.positions.get(id)!, ln), `seed ${seed}: ${id} on ℓ`).toBeLessThan(1e-5);
    }
  });

  it('the BARE form draws ℓ at k = 2 — never at an invented value — and the panel keeps «k = 2»', () => {
    for (const u of [...PRISM, BARE]) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    const d = derive3(state().facts, state().seed);
    expect(d.construction.param, 'the letter never opens the algebraic lane').toBeUndefined();
    expect(d.resolved.param, 'and no value is invented for it there').toBeNull();
    const ln = d.resolved.lines.get('ℓ')!;
    expect(ln.dir.x).toBeCloseTo(3, 4);
    expect(ln.dir.z).toBeCloseTo(-1, 4);
    expect(dataView(d.construction, state().seed).params).toEqual([{ sym: 'k', text: 'k = 2', open: false }]);
  });

  it('M2 re-homing — the equation FIRST still reaches the same figure (the fact SET, e.g. a loaded file)', () => {
    // The equation is applied before anything owns k, so it opens the algebraic lane; the injections
    // that follow RE-HOME the letter to the pivot instead of refusing `two-params` (#794's answer),
    // and the whole set resolves to the same figure. The interactive step in this order is #815's
    // (ADR-3D-178, `issue-815.test.ts`); what is asserted here is the re-homing of the SET.
    const d = derive3(facts([PRISM[0], NAMED, ...PRISM.slice(1)]), 0);
    expect(Object.values(d.status).every((s) => s === 'ok'), JSON.stringify(d.status)).toBe(true);
    expect(d.construction.param).toBeUndefined();
    expect(d.resolved.pivot?.pinSymbols?.k).toBeCloseTo(2, 3);
    const ln = d.resolved.lines.get('AC')!;
    expect(ln.dir.x).toBeCloseTo(3, 4);
    expect(ln.dir.z).toBeCloseTo(-1, 4);
    for (const id of ['A', 'C']) expect(offLine(d.positions.get(id)!, ln)).toBeLessThan(1e-5);
  });

  it('the apply gate: a letter the pivot owns never becomes the figure parameter', () => {
    let c = emptyConstruction3();
    for (const f of facts([...PRISM, NAMED])) {
      for (const cmd of f.cmds) {
        const r = applyCommand3(c, cmd);
        expect(r.ok, f.utterance).toBe(true);
        if (r.ok) c = r.next;
      }
    }
    expect(c.param, 'k stays the pivot’s symbol').toBeUndefined();
    const def = c.lines.get('AC')!;
    expect(def.kind).toBe('parametric');
    expect(def.kind === 'parametric' && def.sym).toBe('k');
  });

  it('the CLASS, not the instance: a PLANE equation in the pivot’s letter resolves and drives too', () => {
    // nothing reported this cell — it is the same two-mechanisms hole one object kind over, and the
    // membership drive now reaches it for the same reason (the carrier is evaluated at the trial k).
    const d = derive3(facts([...PRISM, 'מישור π: x+(k-1)y+z-4=0', 'A על המישור π']), 0);
    expect(Object.values(d.status).every((s) => s === 'ok'), JSON.stringify(d.status)).toBe(true);
    expect(d.construction.param).toBeUndefined();
    const pl = d.resolved.planes.get('π')!;
    expect(pl.n.y, 'the normal is (1, k−1, 1) at the pivot’s k = 2, not at a sampled k').toBeCloseTo(1, 4);
    const A = d.positions.get('A')!;
    expect(A.x + A.y + A.z, 'A is DRIVEN onto the stated plane').toBeCloseTo(4, 4);
  });

  it('the honest refusal survives: a letter BOTH lanes can resolve is still `two-params`', () => {
    // M(k,1,3) is a coord-sym point — the letter DEFINES its coordinates, so the algebraic lane
    // cannot be left; a pin injection in the same letter must refuse rather than pick a lane.
    submit('קובייה ABCDA\'B\'C\'D\'');
    submit('M(k,1,3)');
    expect(err()).toBeNull();
    submit('AB=(k-1,k,3)');
    expect(err()).toEqual({ code: 'two-params' });
  });
});
