/**
 * #1472 (ADR-3D-286) — a relation between two absolute objects pins the figure parameter iff an operand
 * it READS carries it; the root-find's residual is the verifier's own deviation.
 *
 * The operator's report: «המישור π1: z = 1» · «המישור π2: mx + z - 1 = 0» · «π1 מתלכד עם π2» was refused
 * «הטענה אינה מתקיימת» at all 24 seeds. The pin set tested only "does a DIRECTION carry the parameter",
 * so every relation that reads POSITION — coincidence, containment, intersection, distance — was judged at
 * a SAMPLED m although a value satisfying it existed (the #909 class).
 *
 * And the identity guard: a relation that holds for EVERY m is not a pin. Before, «π1: z = 0 · π2: mx + y = 0
 * · π1 ⟂ π2» gave 2 500 grid "roots" (m = −25 drawn, 2 500 configurations to cycle), and «ℓ מוכל במישור π»
 * with ℓ ∥ π for every m froze the submit for minutes while every claim was verified on every "branch".
 *
 * Every assertion drives the REAL path (`submit` → `derive3`) or calls the decision itself
 * (`paramPinningRels`, `pinningGivens`, `paramRoots`, `applyCommand3`) — nothing is re-implemented here.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { applyCommand3 } from '../engine/apply';
import { paramPinningRels } from '../engine/operands';
import { paramRoots, pinningGivens } from '../engine/evaluate';
import { emptyConstruction3, type Construction3 } from '../engine/types';

const st = () => useGeo3.getState();
const submitAll = (lines: string[]) => {
  for (const l of lines) st().submit(l);
};
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const allOk = (seed: number) => Object.values(derive3(st().facts, seed).status).every((s) => s === 'ok');
const param = (seed = 0) => derive3(st().facts, seed).resolved.param;

/** The construction the lines lower to, WITHOUT the store's verification — the decision's own input. */
const construct = (lines: string[]): Construction3 => {
  let c = emptyConstruction3();
  for (const l of lines) {
    const p = parse3(l);
    if (!p.ok) throw new Error(`does not parse: ${l}`);
    for (const cmd of p.commands) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) throw new Error(`${l}: ${JSON.stringify(r.error)}`);
      c = r.next;
    }
  }
  return c;
};

const PLANES_MZ = ['המישור π1: z = 1', 'המישור π2: mx + z - 1 = 0'];
const LINES_X_Y = ['הישר l1: x = (0,0,0) + t(1,0,0)', 'הישר l2: x = (0,0,m) + s(0,1,0)'];

describe('#1472 — the operator\'s sequence: two planes that coincide for the right m', () => {
  beforeEach(() => st().clear());

  it.each([
    ['π1 מתלכד עם π2', 'Hebrew'],
    ['המישורים π1 ו-π2 מתלכדים', 'the plural frame'],
    ['π1 coincides with π2', 'English'],
  ])('«%s» (%s) builds, m = 0 is the one root, at all 24 seeds', (rel) => {
    submitAll([...PLANES_MZ, rel]);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(3);
    expect(param()).toMatchObject({ name: 'm', value: 0, roots: [0], branches: [0] });
    for (const s of SEEDS) expect(allOk(s), `seed ${s}`).toBe(true);
  });

  it('the English plane declarations too', () => {
    submitAll(['plane π1: z = 1', 'plane π2: mx + z - 1 = 0', 'π1 coincides with π2']);
    expect(st().lastError).toBeNull();
    expect(param()?.value).toBe(0);
  });

  it('the relation is in the ONE pin list, read as a POSITION relation', () => {
    const pins = paramPinningRels(construct([...PLANES_MZ, 'π1 מתלכד עם π2']));
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ reads: 'position', claim: { type: 'plane-rel', rel: 'coincident' } });
  });
});

describe('#1472 — the measured class: every position relation pins at its root', () => {
  beforeEach(() => st().clear());

  it.each([
    ['row 2 — coincident, the parameter on every coefficient', ['המישור π1: x + y + z = 1', 'המישור π2: mx + my + mz - 2 = 0', 'π1 מתלכד עם π2'], 2],
    ['row 3 — coincident, the parameter in the offset only', ['המישור π1: z = 1', 'המישור π2: z - m = 0', 'π1 מתלכד עם π2'], 1],
    ['row 7 — a line lying in a plane (the anchor decides)', ['הישר l: x = (1,0,1) + t(0,1,0)', 'המישור π: mx + z - 1 = 0', 'הישר l מוכל במישור π'], 0],
    ['row 7 — the same, in the plane-subject frame', ['הישר l: x = (1,0,1) + t(0,1,0)', 'המישור π: mx + z - 1 = 0', 'המישור π מכיל את הישר l'], 0],
    ['row 7 variant — the direction decides', ['הישר l: x = (0,0,1) + t(1,0,0)', 'המישור π: mx + z - 1 = 0', 'הישר l מוכל במישור π'], 0],
    ['row 8 — two lines coincide', ['הישר l1: x = (0,0,0) + t(1,0,0)', 'הישר l2: x = (0,m,0) + s(1,0,0)', 'l1 מתלכד עם l2'], 0],
    ['row 9 — two lines meet', [...LINES_X_Y, 'l1 ו-l2 נחתכים'], 0],
  ])('%s: ok, m = %s, at all 24 seeds', (_name, lines, root) => {
    submitAll(lines);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(3);
    expect(param()).toMatchObject({ value: root, roots: [root], branches: [root] });
    for (const s of SEEDS) expect(allOk(s), `seed ${s}`).toBe(true);
  });

  it.each([
    ['row 4 — a distance between planes', ['המישור π1: z = 1', 'המישור π2: z - m = 0', 'המרחק בין המישורים π1 ו-π2 הוא 3'], [-2, 4]],
    ['row 4 — the «בין … לבין» spelling', ['המישור π1: z = 1', 'המישור π2: z - m = 0', 'המרחק בין π1 לבין π2 הוא 3'], [-2, 4]],
    ['row 5 — a coordinate point to a plane', ['הנקודה A(0, 0, 0)', 'המישור π: z - m = 0', 'המרחק בין A למישור π הוא 2'], [-2, 2]],
    ['row 6 — a coordinate point to a line', ['הנקודה A(0, 0, 0)', 'הישר l: x = (0,m,0) + t(1,0,0)', 'המרחק בין A לישר l הוא 2'], [-2, 2]],
    ['row 10 — a distance between skew lines', [...LINES_X_Y, 'המרחק בין l1 לבין l2 הוא 2'], [-2, 2]],
    // the parallel branch of `distanceBetween` is a single point in m: found by the continuous scan
    ['a distance that exists only where the planes turn parallel', ['המישור π1: z = 1', 'המישור π2: mx + z - 5 = 0', 'המרחק בין π1 לבין π2 הוא 4'], [0]],
  ])('%s: both roots are configurations, and «הציגו תצורה אחרת» reaches each', (_name, lines, roots) => {
    submitAll(lines);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(3);
    expect(param()?.roots).toEqual(roots);
    expect(param()?.branches).toEqual(roots);
    expect(new Set([param(0)?.value, param(1)?.value])).toEqual(new Set(roots));
    for (const s of SEEDS) expect(allOk(s), `seed ${s}`).toBe(true);
  });
});

describe('#1472 — refusals that must stay refused, now with the honest message', () => {
  beforeEach(() => st().clear());

  it.each([
    ['no m makes the planes coincide (z = 1 and z = 2 at m = 0)', ['המישור π1: z = 1', 'המישור π2: mx + z - 2 = 0', 'π1 מתלכד עם π2']],
    ['l2 is parallel to l1 and distinct for every m', ['הישר l1: x = (0,0,0) + t(1,0,0)', 'הישר l2: x = (0,1,m) + s(1,0,0)', 'l1 ו-l2 נחתכים']],
    ['the direction pins m = 0 but the anchor is off the plane', ['הישר l: x = (0,0,2) + t(1,0,0)', 'המישור π: mx + z - 1 = 0', 'הישר l מוכל במישור π']],
    ['a distance no m reaches (a point ON the line for every m cannot be 2 away)', ['הנקודה A(0, 0, 0)', 'הישר l: x = (0,0,0) + t(1,m,0)', 'המרחק בין A לישר l הוא 2']],
  ])('%s: refused no-roots naming the statement, keep-prior', (_name, lines) => {
    submitAll(lines);
    expect(st().lastError).toMatchObject({ code: 'no-roots', sym: 'm', stated: lines[2] });
    expect(st().facts).toHaveLength(2);
  });

  it('a false coincidence with NO parameter stays the claim refusal', () => {
    submitAll(['המישור π1: x + y + z = 1', 'המישור π2: x + y + z = 4']);
    st().submit('π1 מתלכד עם π2');
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    expect(st().facts).toHaveLength(2);
  });
});

describe('#1472 — the identity guard: a relation true for EVERY m pins nothing', () => {
  beforeEach(() => st().clear());

  it.each([
    ['⟂ between planes', ['המישור π1: z = 0', 'המישור π2: mx + y = 0', 'π1 ניצב ל-π2']],
    ['a line in a plane for every m', ['הישר l: x = (0,0,1) + t(0,1,0)', 'המישור π: mx + z - 1 = 0', 'הישר l מוכל במישור π']],
    ['∥ with the parameter in the offset only', ['המישור π1: z = 1', 'המישור π2: z - m = 0', 'π1 מקביל ל-π2']],
  ])('%s: accepted, m stays a free sampled DOF (no roots, no branches to cycle)', (_name, lines) => {
    const c = construct(lines);
    expect(pinningGivens(c)).toBe(0);
    expect(paramRoots(c)).toEqual([]);
    submitAll(lines);
    expect(st().lastError).toBeNull();
    const values = new Set<number>();
    for (const s of [0, 1, 2]) {
      const p = param(s)!;
      expect(p.roots).toEqual([]);
      expect(p.branches).toEqual([]);
      expect(Math.abs(p.value)).toBeLessThanOrEqual(3); // the free-DOF range, never the scan's −25
      values.add(p.value);
      expect(allOk(s), `seed ${s}`).toBe(true);
    }
    expect(values.size, 'the sample moves with the seed').toBeGreaterThan(1);
  });
});

describe('#1472 — one gate, two readers: a pinning relation keeps the letter in the algebraic lane', () => {
  it('a membership on the pinned plane does not re-home m to the pivot (#815 door)', () => {
    const lines = [...PLANES_MZ, 'π1 מתלכד עם π2', 'הנקודה A(0, 0, 1)', 'A על המישור π2'];
    const c = construct(lines);
    expect(c.param).toBe('m');
    expect(c.planes.get('π2')?.sym).toBeUndefined();
    st().clear();
    submitAll(lines);
    expect(st().lastError).toBeNull();
    expect(param()).toMatchObject({ name: 'm', value: 0 });
  });
});
