/**
 * #815 — A MEMBERSHIP AGAINST AN ALGEBRAIC-LANE EQUATION OBJECT IS SATISFIABLE: the letter re-homes to
 * the pivot through the MEMBERSHIP door (the #801 injection door's twin).
 *
 * The operator's sequence, EQUATION FIRST (round #822):
 *
 *   «מנסרה ישרה משולשת ABCA'B'C'»
 *   «משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)»   ← was refused `not-on-line: A` at this step
 *   «AA'=(k-1,k-7,k+1)» · «AC=(k+1,0,k-3)» · «AB=(k-1,k,3)»
 *
 * Before: at the equation's own step k belonged to the algebraic lane, whose letter is root-found
 * post-pivot or — with nothing to root-find over — simply SAMPLED (ADR-052). A membership can neither
 * select a root (there were none) nor move the figure, so «A on AC» was verified against a sampled
 * line and refused. The class: *a letter carried only by equations was never an unknown any drive
 * could solve for, even when a stated membership was exactly the given that determines it.*
 *
 * After: an EXISTING point stated onto an algebraic-lane carrier hands the letter to the pivot
 * (`adoptParamForCarrier` → `releaseParamToPivot`, the body `adoptParamAsPinSym` already used), and
 * the pivot's unknown layout derives from ONE namespace (`pinSymsOf`, which now sees equation-object
 * letters), so the ADR-3D-174 §4 membership residual drives gauge + k jointly.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3, pinSymsOf } from '../engine/types';
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

const PRISM = "מנסרה ישרה משולשת ABCA'B'C'";
const NAMED = 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)';
const INJECTIONS = ["AA'=(k-1,k-7,k+1)", 'AC=(k+1,0,k-3)', 'AB=(k-1,k,3)'];

const offLine = (p: { x: number; y: number; z: number }, ln: { anchor: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } }) =>
  norm3(cross3(sub3(p, ln.anchor), ln.dir)) / norm3(ln.dir);

const facts = (us: string[]): Fact3[] =>
  us.map((u, i) => {
    const p = parse3(u);
    if (!p.ok) throw new Error(`parse failed: ${u}`);
    return { id: `f${i}`, utterance: u, cmds: p.commands, enabled: true };
  });

const allOk = (d: ReturnType<typeof derive3>) => Object.values(d.status).every((s) => s === 'ok');

describe('#815 — the equation typed FIRST: its memberships DRIVE the figure', () => {
  beforeEach(reset);

  it('the operator’s exact order builds green at every step, interactively', () => {
    for (const u of [PRISM, NAMED, ...INJECTIONS]) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      expect(allOk(d), `seed ${seed}: ${JSON.stringify(d.status)}`).toBe(true);
      expect(d.resolved.pivot?.pinSymbols?.k, `seed ${seed}`).toBeCloseTo(2, 3);
      const ln = d.resolved.lines.get('AC')!;
      expect(ln.dir.x, `seed ${seed}`).toBeCloseTo(3, 4);
      expect(ln.dir.z, `seed ${seed}`).toBeCloseTo(-1, 4);
      for (const id of ['A', 'C']) expect(offLine(d.positions.get(id)!, ln), `seed ${seed}: ${id} on AC`).toBeLessThan(1e-5);
    }
    expect(dataView(derive3(state().facts, 0).construction, 0).params).toEqual([{ sym: 'k', text: 'k = 2', open: false }]);
  });

  it('at the equation’s OWN step the figure is already driven onto the line, k an OPEN pivot symbol', () => {
    // the moment that used to refuse: prism + equation, no injection yet. Two memberships (A, C) on a
    // line whose letter only the equations carry — the pivot must own the letter and drive A, C onto it.
    for (const u of [PRISM, NAMED]) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    const ks: number[] = [];
    for (const seed of [0, 1, 2, 3]) {
      const d = derive3(state().facts, seed);
      expect(allOk(d), `seed ${seed}: ${JSON.stringify(d.status)}`).toBe(true);
      expect(d.construction.param, 'the letter left the algebraic lane').toBeUndefined();
      const ln = d.resolved.lines.get('AC')!;
      expect(ln, `seed ${seed}: the line is resolved (at the pivot’s k, not left blank)`).toBeDefined();
      for (const id of ['A', 'C']) expect(offLine(d.positions.get(id)!, ln), `seed ${seed}: ${id} on AC`).toBeLessThan(1e-5);
      ks.push(d.resolved.pivot!.pinSymbols!.k);
    }
    // nothing pins k yet — it is a free DOF and must VARY with the seed (ADR-052), never a frozen default
    expect(new Set(ks.map((k) => k.toFixed(2))).size, `k by seed: ${ks.join(', ')}`).toBeGreaterThan(1);
    expect(dataView(derive3(state().facts, 0).construction, 0).params).toEqual([{ sym: 'k', text: 'k = ?', open: true }]);
  });

  it('the apply gate: the membership door re-homes the letter; the equation object carries it', () => {
    let c = emptyConstruction3();
    for (const f of facts([PRISM, NAMED])) {
      for (const cmd of f.cmds) {
        const r = applyCommand3(c, cmd);
        expect(r.ok, `${f.utterance} / ${cmd.type}`).toBe(true);
        if (r.ok) c = r.next;
      }
    }
    expect(c.param).toBeUndefined();
    const def = c.lines.get('AC')!;
    expect(def.kind === 'parametric' && def.sym).toBe('k');
    expect(pinSymsOf(c), 'the pivot namespace sees the equation’s letter with no pin carrying it').toEqual(['k']);
  });

  it('entry-order independence (docs/17 M2 law i): equation-first ≡ injections-first, same figure', () => {
    const a = derive3(facts([PRISM, NAMED, ...INJECTIONS]), 0);
    const b = derive3(facts([PRISM, ...INJECTIONS, NAMED]), 0);
    expect(allOk(a)).toBe(true);
    expect(allOk(b)).toBe(true);
    for (const id of ['A', 'B', 'C', "A'", "B'", "C'"]) {
      const p = a.positions.get(id)!;
      const q = b.positions.get(id)!;
      expect(p.x, id).toBeCloseTo(q.x, 3);
      expect(p.y, id).toBeCloseTo(q.y, 3);
      expect(p.z, id).toBeCloseTo(q.z, 3);
    }
  });

  it('the CLASS, plane cell: «A על המישור π» against a c.param plane typed BEFORE the injections drives too', () => {
    for (const u of [PRISM, 'מישור π: x+(k-1)y+z-4=0', 'A על המישור π']) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    const d0 = derive3(state().facts, 0);
    expect(allOk(d0), JSON.stringify(d0.status)).toBe(true);
    expect(d0.construction.param).toBeUndefined();
    const pl = d0.resolved.planes.get('π')!;
    const A = d0.positions.get('A')!;
    expect(pl.n.x * A.x + pl.n.y * A.y + pl.n.z * A.z + pl.d, 'A is DRIVEN onto the plane').toBeCloseTo(0, 4);
    for (const u of INJECTIONS) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    const d = derive3(state().facts, 0);
    expect(allOk(d), JSON.stringify(d.status)).toBe(true);
    expect(d.resolved.pivot?.pinSymbols?.k).toBeCloseTo(2, 3);
    expect(d.resolved.planes.get('π')!.n.y, 'the normal is (1, k−1, 1) at k = 2').toBeCloseTo(1, 4);
  });

  it('a NEW point on the line is a rider — no door opens, the letter stays the algebraic lane’s', () => {
    // «D על הישר ℓ» with D new is seated by construction (1 sampled DOF); nothing to drive, nothing to re-home
    for (const u of [PRISM, 'x=(8,-1,-1)+t(k+1,0,k-3)', 'D על הישר ℓ']) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    const d = derive3(state().facts, 0);
    expect(allOk(d)).toBe(true);
    expect(d.construction.param).toBe('k');
  });

  it('the honest boundary survives: with a ROOT-FIND given on the letter the lane keeps it', () => {
    // the plane angle pins k by root-find — the algebraic lane has a real claim, so the membership stays a
    // verify/selection rather than silently moving a root-find given into the pivot
    for (const u of [PRISM, 'מישור π: x+(k-1)y+z-4=0', 'מישור π2: x+y+z-1=0', 'הזווית בין המישורים π ו-π2 היא 60']) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    submit('A על המישור π');
    const d = derive3(state().facts, 0);
    expect(d.construction.param, 'k stays the algebraic lane’s').toBe('k');
    expect(d.construction.planes.get('π')!.sym).toBeUndefined();
  });
});
