/**
 * #1528 (ADR-3D-396) — a COORDINATE point's stated membership pins the figure parameter.
 *
 * The report: «הנקודה A(1, 2, 3)» · «המישור π: mx + z - 1 = 0» · «A על המישור π» was refused «A is not on the
 * plane» although m = −2 satisfies it. Two gaps at one seam:
 *  1. the root-find's ONE pin list (`paramPinningRels`, #1472) read only `c.claims`, and a membership is recorded in
 *     `c.memberships` / `c.onLines` — so «distance(A, π) = 2» pinned m while «A ∈ π», the same relation at
 *     distance 0, was judged at a SAMPLED m;
 *  2. the #815 membership door re-homed the letter to the pivot whenever the lane held no pin — and the pivot has
 *     nothing to move for an absolute point, so nothing could determine m.
 * The fix: the membership joins the pin list through the same admission rule, and the door asks the membership
 * itself (recorded first) through that one predicate — so a figure member (a cube vertex) still re-homes.
 *
 * Every assertion drives the REAL path (`submit` → `derive3`) or calls the decision itself.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { applyCommand3 } from '../engine/apply';
import { paramPinningRels } from '../engine/operands';
import { pinningGivens } from '../engine/evaluate';
import { dataView } from '../engine/dataView';
import { emptyConstruction3, type Construction3 } from '../engine/types';

const st = () => useGeo3.getState();
const submitAll = (lines: string[]) => {
  for (const l of lines) st().submit(l);
};
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const allOk = (seed: number) => Object.values(derive3(st().facts, seed).status).every((s) => s === 'ok');
const param = (seed = 0) => derive3(st().facts, seed).resolved.param;
const panelParams = () => dataView(derive3(st().facts, st().seed).construction, st().seed).params.map((p) => p.text);

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

const A = 'הנקודה A(1, 2, 3)';
const PI = 'המישור π: mx + z - 1 = 0';

describe('#1528 — the reported rows build, the letter pinned at its root', () => {
  beforeEach(() => st().clear());

  it.each([
    ['the issue\'s sequence', [A, PI, 'A על המישור π'], -2],
    ['the plane typed first', [PI, A, 'A על המישור π'], -2],
    ['the subject-noun spelling', [A, PI, 'הנקודה A נמצאת על המישור π'], -2],
    ['English', ['point A(1, 2, 3)', 'plane π: mx + z - 1 = 0', 'A on the plane π'], -2],
    ['the parameter in the plane\'s offset', [A, 'המישור π: z - m = 0', 'A על המישור π'], 3],
    ['a line, the parameter in its direction', ['הנקודה A(1, 2, 0)', 'הישר l: x = (0,0,0) + t(1,m,0)', 'A על הישר l'], 2],
    ['a line, the parameter in its anchor', ['הנקודה A(1, 2, 0)', 'הישר l: x = (0,m,0) + t(1,0,0)', 'A על הישר l'], 2],
    ['a line, typed first', ['הישר l: x = (0,0,0) + t(1,m,0)', 'הנקודה A(1, 2, 0)', 'A על הישר l'], 2],
    [
      'a plane∩plane line',
      ['המישור π1: z = 0', 'המישור π2: mx + y - 2 = 0', 'ℓ ישר החיתוך בין המישורים π1 ו-π2', 'הנקודה A(1, 4, 0)', 'A על הישר ℓ'],
      -2,
    ],
  ])('%s: ok, one root, at all 24 seeds', (_name, lines, root) => {
    submitAll(lines);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(lines.length);
    expect(param()).toMatchObject({ name: 'm', value: root, roots: [root], branches: [root] });
    for (const s of SEEDS) expect(allOk(s), `seed ${s}`).toBe(true);
  });

  it('the pinned value is visible: the data panel prints «m = −2», as for every pinned letter (#1472)', () => {
    submitAll([A, PI, 'A על המישור π']);
    const row = panelParams().find((t) => t.startsWith('m = '));
    expect(row).toBeDefined();
    expect(row!.replace('−', '-')).toBe('m = -2');
  });

  it('two roots: both are configurations, and «הציגו תצורה אחרת» reaches each', () => {
    // (P − anchor) × dir = (−m, −4, 0) × (1, m, 0) → z-component −m² + 4: m = ±2
    submitAll(['הנקודה A(0, -4, 0)', 'הישר l: x = (m,0,0) + t(1,m,0)', 'A על הישר l']);
    expect(st().lastError).toBeNull();
    expect(param()?.roots).toEqual([-2, 2]);
    expect(new Set([param(0)?.value, param(1)?.value])).toEqual(new Set([-2, 2]));
    for (const s of SEEDS) expect(allOk(s), `seed ${s}`).toBe(true);
  });

  it('the membership is in the ONE pin list, read as a POSITION relation', () => {
    const pins = paramPinningRels(construct([A, PI, 'A על המישור π']));
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ reads: 'position', member: { type: 'on-planes', id: 'A', plane: 'π' } });
  });
});

describe('#1528 — the identity guard: a membership that holds for EVERY m pins nothing', () => {
  beforeEach(() => st().clear());

  it('«B(0,0,1) על π» alone: m stays a free sampled DOF and the membership verifies', () => {
    submitAll(['הנקודה B(0, 0, 1)', PI, 'B על המישור π']);
    expect(st().lastError).toBeNull();
    expect(pinningGivens(derive3(st().facts, 0).construction)).toBe(0);
    expect(param()?.roots).toEqual([]);
    expect(param(0)?.value).not.toBe(param(1)?.value); // sampled, so it moves with the configuration
    for (const s of SEEDS) expect(allOk(s), `seed ${s}`).toBe(true);
  });

  it('A and B on π: A pins m = −2, B is verified', () => {
    submitAll([A, 'הנקודה B(0, 0, 1)', PI, 'A על המישור π', 'B על המישור π']);
    expect(st().lastError).toBeNull();
    expect(param()).toMatchObject({ value: -2, roots: [-2], branches: [-2] });
    for (const s of SEEDS) expect(allOk(s), `seed ${s}`).toBe(true);
  });
});

describe('#1528 — no value of m satisfies it: the honest refusal names the membership', () => {
  beforeEach(() => st().clear());

  it.each([
    ['a plane (0·m + 2 ≠ 0)', ['הנקודה A(0, 2, 3)', PI, 'A על המישור π'], 'A על המישור π'],
    ['a line (the anchor stays off the point)', ['הנקודה A(0, 1, 0)', 'הישר l: x = (0,0,m) + t(1,0,0)', 'A על הישר l'], 'A על הישר l'],
  ])('%s: refused no-roots, the facts not grown', (_name, lines, stated) => {
    submitAll(lines);
    expect(st().lastError).toMatchObject({ code: 'no-roots', sym: 'm', stated });
    expect(st().facts).toHaveLength(lines.length - 1);
  });
});

describe('#1528 — the #815 door asks the membership itself', () => {
  it('an absolute member keeps the letter in the algebraic lane', () => {
    const c = construct([A, PI, 'A על המישור π']);
    expect(c.param).toBe('m');
    expect(c.planes.get('π')?.sym).toBeUndefined();
  });

  it('a figure member (a cube vertex) still re-homes it to the pivot, as #815 ruled', () => {
    const c = construct(["קובייה ABCDA'B'C'D'", PI, 'A על המישור π']);
    expect(c.param).toBeUndefined();
    expect(c.planes.get('π')?.sym).toBe('m');
  });

  it('…and that figure still builds', () => {
    st().clear();
    submitAll(["קובייה ABCDA'B'C'D'", PI, 'A על המישור π']);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(3);
  });
});
