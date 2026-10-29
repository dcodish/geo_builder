/**
 * #1188 steps 2–3 (ADR-3D-390) — LINEAR COMBINATIONS OF FREE VECTORS, AND THE HEAD-TO-TAIL PICTURE.
 *
 * Measured at caf00532 through the store's real submit door: «וקטור u · וקטור v · w = u + v», «w = 2u - 3v», the cube's
 * «נסמן: AB = u · וקטור p · p = 2u» and «u = (k-1, 2, k)» were all refused `free-vector-combination` (step 1's honest
 * interim refusal), and the ask «u + v» was not understood. The operator accepted that refusal on 2026-10-28 only "as
 * long as this is in the roadmap to include"; this step removes it.
 *
 * Every row drives `submit` and reads what `derive3` built. The picture (step 3) is read from `buildScene3`, and the
 * copies it draws are asserted to live NOWHERE in the engine.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { freeDofCount3 } from '../engine/evaluate';
import { norm3, sub3, type Vec3 } from '../engine/vec3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { layoutFreeVectorScene3 } from '../render/freeVectorLayout';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';

const st = () => useGeo3.getState();
beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});
const run = (lines: readonly string[]) => {
  const errs: (string | null)[] = [];
  for (const l of lines) {
    st().submit(l);
    errs.push((st().lastError as { code?: string } | null)?.code ?? null);
  }
  return errs;
};
const built = (seed = st().seed) => derive3(st().facts, seed);
const text = () => (errorText3((k, o) => i18n3d.t(k, o) as string, st().lastError!) ?? '').replace(/[⁦-⁩]/g, '');
const val = (name: string, seed = 0): Vec3 => built(seed).resolved.freeVectors.get(name)!;
const near = (a: Vec3, b: Vec3, tol = 1e-9) => norm3(sub3(a, b)) <= tol * Math.max(1, norm3(b));
const lin = (terms: [number, Vec3][]): Vec3 =>
  terms.reduce((acc, [k, v]) => ({ x: acc.x + k * v.x, y: acc.y + k * v.y, z: acc.z + k * v.z }), { x: 0, y: 0, z: 0 });
const CUBE = "קובייה ABCDA'B'C'D'";
const SEEDS = [0, 1, 2, 3, 7, 11];

describe('#1188 step 2 — a combination DEFINES a new vector', () => {
  it.each([
    ['w = u + v', [[1, 'u'], [1, 'v']]],
    ['w = 2u - 3v', [[2, 'u'], [-3, 'v']]],
    ['w = u - v', [[1, 'u'], [-1, 'v']]],
    ['u + v = w', [[1, 'u'], [1, 'v']]],
    ['w = ½u', [[0.5, 'u']]],
  ] as const)('«%s» over two declared vectors builds, and w is that combination at every seed', (line, terms) => {
    expect(run(['וקטור u', 'וקטור v', line])).toEqual([null, null, null]);
    for (const s of SEEDS) expect(near(val('w', s), lin(terms.map(([k, n]) => [k, val(n, s)])))).toBe(true);
  });

  it('a definition moves nothing already drawn: u and v are bit-identical before and after «w = u + v»', () => {
    run(['וקטור u', 'וקטור v']);
    const before = SEEDS.map((s) => JSON.stringify([val('u', s), val('v', s)]));
    run(['w = u + v']);
    expect(SEEDS.map((s) => JSON.stringify([val('u', s), val('v', s)]))).toEqual(before);
  });

  it('ADR-052: what the givens leave free still moves between configurations, and the cue counts it', () => {
    run(['וקטור u', 'וקטור v', 'w = u + v']);
    expect(near(val('w', 0), val('w', 1))).toBe(false);
    expect(freeDofCount3(built().construction, built().resolved)).toBe(6); // u and v: a defined w adds none
  });

  it('over stated vectors it is a value: «u = (1,2,3) · v = (1,1,1) · w = u + v» is w = (2, 3, 4), and the panel says so', () => {
    run(['u = (1,2,3)', 'v = (1,1,1)', 'w = u + v']);
    for (const s of SEEDS) expect(near(val('w', s), { x: 2, y: 3, z: 4 })).toBe(true);
    const p = dataView(built().construction, 0);
    expect(p.stated).toContain('w = u + v');
    expect(p.stated).not.toContain('w = (?, ?, ?)');
    expect(p.vectors.find((v) => v.label === 'w')?.coords).toBe('(2, 3, 4)');
  });

  it('a name the line does not define is still unknown («w = u + z», z never declared)', () => {
    expect(run(['וקטור u', 'w = u + z'])).toEqual([null, 'unknown-vector']);
  });
});

describe('#1188 step 2 — equations among existing vectors: the free-vector system', () => {
  const perms = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

  it.each(perms(['u = (1,2,3)', 'v = (1,1,1)', 'w = u + v']).map((p) => [p.join(' · '), p] as const))('every entry order gives w = (2, 3, 4): %s', (_l, order) => {
    expect(run(['וקטורים u, v ו-w', ...order])).toEqual([null, null, null, null]);
    for (const s of SEEDS) expect(near(val('w', s), { x: 2, y: 3, z: 4 })).toBe(true);
  });

  it.each(perms(['u = (1,2,3)', 'w = (2,3,4)', 'w = u + v']).map((p) => [p.join(' · '), p] as const))('…and solving for v: %s', (_l, order) => {
    expect(run(['וקטורים u, v ו-w', ...order])).toEqual([null, null, null, null]);
    for (const s of SEEDS) expect(near(val('v', s), { x: 1, y: 1, z: 1 })).toBe(true);
  });

  it('an inconsistent triple refuses the LAST statement, naming the lines it contradicts', () => {
    expect(run(['u = (1,1,1)', 'v = (1,1,1)', 'w = (3,2,3)', 'w = u + v'])).toEqual([null, null, null, 'givens-contradict']);
    expect(text()).toContain('«w = u + v»');
    expect(text()).toContain('«w = (3,2,3)»');
    expect(st().facts).toHaveLength(3);
  });

  it('a one-letter affine solve: «u = (k,1,2) · v = (1,1,1) · w = (3,2,3) · w = u + v» gives k = 2 on the panel', () => {
    expect(run(['u = (k,1,2)', 'v = (1,1,1)', 'w = (3,2,3)', 'w = u + v'])).toEqual([null, null, null, null]);
    expect(dataView(built().construction, 0).params.find((p) => p.sym === 'k')?.value).toBe('2');
    expect(answerQuery(built().construction, 'k', 0).answer).toBe('2');
  });

  it('an equation the free vectors absorb projects the sample minimally — «AB = p + q» on a cube keeps p + q = AB', () => {
    expect(run([CUBE, 'וקטור p', 'וקטור q', 'AB = p + q'])).toEqual([null, null, null, null]);
    for (const s of SEEDS) {
      const d = built(s);
      const ab = sub3(d.positions.get('B')!, d.positions.get('A')!);
      expect(near(lin([[1, val('p', s)], [1, val('q', s)]]), ab)).toBe(true);
    }
    expect(near(val('p', 0), val('p', 1))).toBe(false); // what is left free still moves
  });
});

describe('#1188 step 2 — an affine component («u = (k-1, 2, k)»)', () => {
  it('builds with k an open letter, and the vector moves with it', () => {
    expect(run(['u = (k-1, 2, k)'])).toEqual([null]);
    expect(dataView(built().construction, 0).params.find((p) => p.sym === 'k')).toMatchObject({ open: true });
    expect(dataView(built().construction, 0).stated).toEqual(['u = (k-1, 2, k)']);
    for (const s of SEEDS) {
      const u = val('u', s);
      expect(u.y).toBe(2);
      expect(u.z - u.x).toBeCloseTo(1, 12);
    }
    expect(near(val('u', 0), val('u', 1))).toBe(false);
  });

  it('«k = 3» values it: u = (2, 2, 3), and the stated row reads its value', () => {
    expect(run(['u = (k-1, 2, k)', 'k = 3'])).toEqual([null, null]);
    for (const s of SEEDS) expect(near(val('u', s), { x: 2, y: 2, z: 3 })).toBe(true);
    const p = dataView(built().construction, 0);
    expect(p.params.find((r) => r.sym === 'k')?.value).toBe('3');
    expect(p.stated).toEqual(['u = (2, 2, 3)']);
  });

  it('one letter, one solver: a letter a point also uses is refused naming it, in either order', () => {
    expect(run(['u = (k-1, 2, k)', 'B(k, 0, 0)'])).toEqual([null, 'already-defined']);
    st().clear();
    expect(run(['B(k, 0, 0)', 'u = (k-1, 2, k)'])).toEqual([null, 'already-defined']);
  });
});

describe('#1188 step 2 — a free vector and the figure', () => {
  it('the cube «נסמן: AB = u · וקטור p · p = 2u»: p is 2·AB at every seed (the anchored arrow is a constant)', () => {
    expect(run([CUBE, 'נסמן: AB = u', 'וקטור p', 'p = 2u'])).toEqual([null, null, null, null]);
    for (const s of SEEDS) {
      const d = built(s);
      expect(near(val('p', s), lin([[2, sub3(d.positions.get('B')!, d.positions.get('A')!)]]))).toBe(true);
    }
  });

  it('«AB = p» on a p nothing constrains: the statement owns p, and p follows AB', () => {
    expect(run([CUBE, 'וקטור p', 'AB = p'])).toEqual([null, null, null]);
    const d = built(3);
    expect(near(val('p', 3), sub3(d.positions.get('B')!, d.positions.get('A')!))).toBe(true);
  });

  it.each([
    [['p = (1,2,3)', 'AB = p']],
    [['וקטור p', 'AB = p', 'p = (1,2,3)']],
  ])('a STATED p equated to an arrow pins the arrow, in either order (%j)', (lines) => {
    expect(run([CUBE, ...lines]).every((e) => e === null)).toBe(true);
    for (const s of SEEDS) {
      const d = built(s);
      expect(near(sub3(d.positions.get('B')!, d.positions.get('A')!), { x: 1, y: 2, z: 3 }, 1e-6)).toBe(true);
    }
  });

  it('a point DEFINED over a stated p: «p = (1,2,3) · A(0,0,0) · AE = p» puts E at (1, 2, 3)', () => {
    expect(run(['p = (1,2,3)', 'A(0,0,0)', 'AE = p'])).toEqual([null, null, null]);
    expect(near(built().positions.get('E')!, { x: 1, y: 2, z: 3 })).toBe(true);
  });

  it('…and over a sampled p, E moves with p (ADR-052)', () => {
    expect(run(['וקטור p', 'A(0,0,0)', 'AE = p'])).toEqual([null, null, null]);
    for (const s of [0, 1]) expect(near(built(s).positions.get('E')!, val('p', s))).toBe(true);
    expect(near(built(0).positions.get('E')!, built(1).positions.get('E')!)).toBe(false);
  });
});

/**
 * THE HONEST REFUSAL — a joint figure ↔ free-vector solve is not built. Each row is the tool's limit, quoting the
 * line; never «בדקו את החישוב», never "u is not declared". A row that starts to BUILD is its successor landing.
 */
const COUPLING: string[][] = [
  // after «AB = p» the statement «AD = p» says AD = AB — a relation on the FIGURE the free p cannot absorb
  [CUBE, 'וקטור p', 'AB = p', 'AD = p'],
  // a ratio letter on a free vector: the point's root-find would be a joint solve
  ['וקטור p', 'A(0,0,0)', 'AE = t·p'],
  // a span point over a free vector
  ['מנסרה ישרה משולשת ABC', "M אמצע B'C'", "K על AA' כך ש-AK = 2KA'", "נסמן: AA' = w, KC = v", 'וקטור u', 'P על AM כך ש-KP = αu + βv'],
];

describe('#1188 step 2 — what it cannot solve yet is refused honestly', () => {
  it.each(COUPLING.map((g) => [g.join(' · '), g] as const))('«%s»', (_l, lines) => {
    const errs = run(lines);
    expect(errs.slice(0, -1).every((e) => e === null)).toBe(true);
    expect(errs[errs.length - 1]).toBe('free-vector-coupling');
    expect(text()).toContain(`«${lines[lines.length - 1]}»`);
    expect(text()).toContain('מגבלה של הכלי');
  });
});

describe('#1188 step 2 — must not change', () => {
  it('the anchored lane: «AC\' = u + v + w» on the cube builds exactly as a claim, with no free vector', () => {
    expect(run([CUBE, "נסמן: AB = u, AD = v, AA' = w", "AC' = u + v + w"])).toEqual([null, null, null]);
    expect(built().construction.freeVectors.size).toBe(0);
    expect(built().construction.claims.some((c) => c.type === 'vec-eq')).toBe(true);
  });

  it('need-basis: a floating p defined from the basis still does not count', () => {
    const Q2 = ['מנסרה ישרה משולשת ABC', "M אמצע B'C'", "K על AA' כך ש-AK = 2KA'", "נסמן: AA' = w, KC = v, KB = u"];
    expect(run([...Q2, 'p = u + v', 'P על AM כך ש-KP = αu + βv']).every((e) => e === null)).toBe(true);
    expect(built().construction.points.get('P')?.kind).toBe('in-span');
  });
});

describe('#1188 step 2 — the ask lane reads combinations', () => {
  const ask = (q: string) => answerQuery(built().construction, q, st().seed);
  it('«u + v», «2u - 3v», «|u - v|» on stated vectors', () => {
    run(['u = (1,2,3)', 'v = (1,1,1)']);
    expect(ask('u + v').answer).toBe('(2, 3, 4)');
    expect(ask('2u - 3v').answer).toBe('(-1, 1, 3)');
    expect(ask('|u - v|').answer).toBe('2.24');
  });
  it('…honestly undetermined on sampled ones', () => {
    run(['וקטור u', 'וקטור v']);
    expect(ask('u + v')).toMatchObject({ answer: null, note: 'undetermined' });
  });
});

describe('#1188 step 3 — the head-to-tail picture (display, never geometry)', () => {
  const VIEW = { width: 800, height: 600 };
  const layout = (seed = 0) => layoutFreeVectorScene3(built(seed).construction, built(seed).resolved);
  const at = (l: ReturnType<typeof layout>, n: string) => l.vectors.find((v) => v.name === n)!;

  it('«w = u + v»: a copy of v at u\'s head, and w closes the triangle (copy head = w head)', () => {
    run(['וקטור u', 'וקטור v', 'w = u + v']);
    for (const s of SEEDS) {
      const l = layout(s);
      const [u, w] = [at(l, 'u'), at(l, 'w')];
      expect(near(w.tail, u.tail)).toBe(true);
      expect(l.copies).toHaveLength(1);
      expect(l.copies[0].of).toBe('v');
      expect(near(l.copies[0].tail, u.head)).toBe(true);
      expect(near(l.copies[0].head, w.head)).toBe(true);
    }
  });

  it('every combination follows the same rule (ruling 2026-10-06): «w = 2u - v» chains copies of 2u and −v', () => {
    run(['וקטור u', 'וקטור v', 'w = 2u - v']);
    const l = layout();
    const w = at(l, 'w');
    expect(l.copies.map((k) => [k.of, k.coeff])).toEqual([['u', 2], ['v', -1]]);
    expect(near(l.copies[0].tail, w.tail)).toBe(true);
    expect(near(l.copies[1].tail, l.copies[0].head)).toBe(true);
    expect(near(l.copies[1].head, w.head)).toBe(true);
  });

  it('a three-term sum is the head-to-tail polygon, and it closes', () => {
    run(['וקטורים u, v ו-w', 'p = u + v + w']);
    const l = layout();
    const p = at(l, 'p');
    expect(l.copies.map((k) => k.of)).toEqual(['v', 'w']);
    expect(near(l.copies[1].head, p.head)).toBe(true);
  });

  it('an equation over declared vectors draws it too («u + v = w» on three declared vectors)', () => {
    run(['וקטורים u, v ו-w', 'u = (1,0,0)', 'v = (0,1,0)', 'u + v = w']);
    const l = layout();
    expect(near(l.copies[0].head, at(l, 'w').head)).toBe(true);
  });

  it('u in two sums keeps one tail for both', () => {
    run(['וקטורים u, v ו-q', 'w = u + v', 'p = u + q']);
    const l = layout();
    expect(near(at(l, 'w').tail, at(l, 'u').tail)).toBe(true);
    expect(near(at(l, 'p').tail, at(l, 'u').tail)).toBe(true);
  });

  it('an anchored first term anchors the chain at its tail point: «w = u + p» with u = AB starts at A', () => {
    run([CUBE, 'נסמן: AB = u', 'וקטור p', 'w = u + p']);
    const d = built();
    const l = layout();
    expect(near(at(l, 'w').tail, d.positions.get('A')!)).toBe(true);
    expect(near(l.copies[0].tail, d.positions.get('B')!)).toBe(true);
  });

  it('the copies are in the scene and NOWHERE in the engine', () => {
    run(['וקטור u', 'וקטור v', 'w = u + v']);
    const d = built();
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW);
    expect(scene.vectorCopies).toHaveLength(1);
    for (const k of scene.vectorCopies!) for (const [x, y] of [[k.x1, k.y1], [k.x2, k.y2]]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(VIEW.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(VIEW.height);
    }
    const c = d.construction;
    expect([...c.freeVectors.keys()]).toEqual(['u', 'v', 'w']);
    expect(c.vectors.size + c.points.size + c.arrows.length + c.segments.length + d.positions.size).toBe(0);
    expect([...d.resolved.freeVectors.keys()]).toEqual(['u', 'v', 'w']);
    expect(dataView(c, 0).vectors.map((v) => v.label)).not.toContain('v′');
    expect(freeDofCount3(c, d.resolved)).toBe(6);
  });

  it('with no stated sum the tray is unchanged (step 1\'s layout, no copies)', () => {
    run(['וקטור u', 'וקטור v']);
    expect(layout().copies).toEqual([]);
  });
});

describe('#1188 step 2 — save and load', () => {
  it('a definition and an affine component reload', () => {
    run(['וקטור u', 'וקטור v', 'w = u + v', 'p = (k-1, 2, k)']);
    const r = deserializeFigure3(serializeFigure3(st().facts, st().seed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = derive3(r.facts, r.seed);
    expect([...d.construction.freeVectors.keys()]).toEqual(['u', 'v', 'w', 'p']);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
  });
});
