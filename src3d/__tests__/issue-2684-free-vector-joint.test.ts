/**
 * #2684 ([ADR-3D-421](../../docs/06b-decisions-3d.md#adr-3d-421)) — THE JOINT FIGURE ↔ FREE-VECTOR SOLVE, #2603 stage b3.
 *
 * Measured before at 28dac0c3, through the store's submit: every row below refused `free-vector-coupling`
 * («זו מגבלה של הכלי»). A relation that ties a free vector to the figure through a letter, a span or a metric had no
 * solver, because the free-vector system resolved after the pivot and the pivot had no slot for it.
 *
 * Every number here is measured off the resolved figure and vectors, never read back from the solver's own residual.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { freeDofCount3 } from '../engine/evaluate';
import { cross3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';

const st = () => useGeo3.getState();
beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});
const run = (lines: readonly string[]) => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  const errs: (string | null)[] = [];
  for (const l of lines) {
    st().submit(l);
    errs.push((st().lastError as { code?: string } | null)?.code ?? null);
  }
  return errs;
};
const built = (seed = 0) => derive3(st().facts, seed);
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const CUBE = "קובייה ABCDA'B'C'D'";
const PRISM = ['מנסרה ישרה משולשת ABC', "M אמצע B'C'", "K על AA' כך ש-AK = 2KA'", "נסמן: AA' = w, KC = v"];
const SPAN = 'P על AM כך ש-KP = αu + βv';

type D = ReturnType<typeof built>;
const pt = (d: D, id: string): Vec3 => d.positions.get(id)!;
const vec = (d: D, a: string, b: string) => sub3(pt(d, b), pt(d, a));
const free = (d: D, n: string): Vec3 => d.resolved.freeVectors.get(n)!;
const ok = (d: D) => Object.values(d.status).every((x) => x === 'ok');
/** The direction of a vector is the one relation «a = k·b» leaves: the sine of the angle, whatever the sizes. */
const parallel = (a: Vec3, b: Vec3) => norm3(cross3(a, b)) / (norm3(a) * norm3(b));

const ROWS: { name: string; lines: string[]; holds: (d: D) => number; varying: string }[] = [
  {
    name: 'a letter over a free vector on a new rider: p turns parallel to AC′',
    lines: [CUBE, 'וקטור p', "E על AC' כך ש-AE = t·p"],
    holds: (d) => Math.max(parallel(vec(d, 'A', 'E'), free(d, 'p')), parallel(vec(d, 'A', "C'"), free(d, 'p'))),
    varying: 'p',
  },
  { name: 'a letter on an existing pair', lines: [CUBE, 'וקטור p', 'AD = k·p'], holds: (d) => parallel(vec(d, 'A', 'D'), free(d, 'p')), varying: 'p' },
  { name: 'p ⟂ a segment', lines: [CUBE, 'וקטור p', 'p ⟂ AB'], holds: (d) => Math.abs(dot3(free(d, 'p'), vec(d, 'A', 'B'))), varying: 'p' },
  { name: '|AB| = |p|', lines: [CUBE, 'וקטור p', '|AB| = |p|'], holds: (d) => Math.abs(norm3(vec(d, 'A', 'B')) - norm3(free(d, 'p'))), varying: 'p' },
  { name: 'p ∥ a segment', lines: [CUBE, 'וקטור p', 'p ∥ AB'], holds: (d) => parallel(vec(d, 'A', 'B'), free(d, 'p')), varying: 'p' },
  {
    name: 'an angle between p and a segment',
    lines: [CUBE, 'וקטור p', 'הזווית בין p ל-AB היא 60'],
    holds: (d) => {
      const [a, b] = [free(d, 'p'), vec(d, 'A', 'B')];
      return Math.abs(dot3(a, b) / (norm3(a) * norm3(b)) - 0.5);
    },
    varying: 'p',
  },
  { name: 'a dot product with an anchored name', lines: [CUBE, 'וקטור p', 'נסמן: AB = u', 'u·p = 1'], holds: (d) => Math.abs(dot3(free(d, 'p'), vec(d, 'A', 'B')) - 1), varying: 'p' },
  {
    name: 'a free vector the figure reaches through an equation',
    lines: [CUBE, 'וקטור p', 'וקטור q', 'AB = p + q', '|p| = 1'],
    holds: (d) => Math.max(Math.abs(norm3(free(d, 'p')) - 1), norm3(sub3(vec(d, 'A', 'B'), { x: free(d, 'p').x + free(d, 'q').x, y: free(d, 'p').y + free(d, 'q').y, z: free(d, 'p').z + free(d, 'q').z }))),
    varying: 'p',
  },
  {
    name: 'a span point over a free vector nothing defines: KP lies in span(u, v)',
    lines: [...PRISM, 'וקטור u', SPAN],
    holds: (d) => {
      const [kp, u, v] = [vec(d, 'K', 'P'), free(d, 'u'), vec(d, 'K', 'C')];
      return Math.abs(dot3(kp, cross3(u, v))) / (norm3(kp) * norm3(u) * norm3(v));
    },
    varying: 'u',
  },
];

describe('#2684 — each row builds at every seed, the relation holds, and what the givens leave free still moves', () => {
  it.each(ROWS.map((r) => [r.name, r] as const))('%s', (_n, row) => {
    expect(run(row.lines).every((e) => e === null)).toBe(true);
    const seen = new Set<string>();
    for (const s of SEEDS) {
      const d = built(s);
      expect(ok(d)).toBe(true); // the 24-seed whole-rate (docs/17 §9): 24/24
      expect(row.holds(d)).toBeLessThan(1e-6);
      const v = free(d, row.varying);
      seen.add([v.x, v.y, v.z].map((n) => n.toFixed(3)).join());
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('a free vector is never drawn as a dot, and never blown up by a letter sampled near 0', () => {
    for (const row of ROWS) {
      run(row.lines);
      for (const s of SEEDS) {
        const n = norm3(free(built(s), row.varying));
        expect(n).toBeGreaterThan(0.1);
        expect(n).toBeLessThan(25);
      }
    }
  });
});

describe('#2684 — stability: a relation the free vector can absorb moves nothing the student drew', () => {
  it.each([
    [[CUBE], ['וקטור p', 'AD = k·p'], ['A', 'D', "C'"]],
    [[CUBE], ['וקטור p', 'p ⟂ AB'], ['A', 'B', "C'"]],
    [[CUBE, "E על AC'"], ['וקטור p', 'AE = t·p'], ['E', "C'"]],
    [PRISM, ['וקטור p', 'AM = k·p'], ['A', 'M', 'K', 'C']],
  ])('%j then %j', (before, after, ids) => {
    run(before);
    const at = SEEDS.slice(0, 6).map((s) => ids.map((id) => pt(built(s), id)));
    run([...before, ...after]);
    SEEDS.slice(0, 6).forEach((s, i) => ids.forEach((id, j) => expect(pt(built(s), id)).toEqual(at[i][j])));
  });
});

describe('#2684 — a letter that already belongs to the free-vector system', () => {
  it('«u = (k,1,2) · A(0,0,0) · AE = k·u»: one letter, one number — E = A + k·u at the component’s k', () => {
    expect(run(['u = (k,1,2)', 'A(0,0,0)', 'AE = k·u'])).toEqual([null, null, null]);
    const ks = SEEDS.map((s) => {
      const d = built(s);
      const u = free(d, 'u');
      const e = pt(d, 'E');
      expect(norm3(sub3(e, { x: u.x * u.x, y: u.x, z: 2 * u.x }))).toBeLessThan(1e-9);
      return u.x;
    });
    expect(Math.max(...ks) - Math.min(...ks)).toBeGreaterThan(1e-3); // ADR-052: k stays free
  });

  it('a valued letter is a number: «AD = k·p · k = 2» gives p = AD/2 at every seed', () => {
    expect(run([CUBE, 'וקטור p', 'AD = k·p', 'k = 2'])).toEqual([null, null, null, null]);
    for (const s of SEEDS) {
      const d = built(s);
      const ad = vec(d, 'A', 'D');
      expect(norm3(sub3(ad, { x: 2 * free(d, 'p').x, y: 2 * free(d, 'p').y, z: 2 * free(d, 'p').z }))).toBeLessThan(1e-6);
    }
  });
});

describe('#2684 — one statement, one verdict, in either order (docs/17 M2)', () => {
  it('a ratio letter another lane also scales is refused in both orders: one letter never holds two numbers', () => {
    expect(run([CUBE, 'וקטור p', 'AD = k·p', 'AE = k·AB']).pop()).toBe('free-vector-coupling');
    expect(run([CUBE, 'וקטור p', 'AE = k·AB', 'AD = k·p']).pop()).toBe('free-vector-coupling');
  });

  it('a stated sign holds: «AD = k·p · k חיובי»', () => {
    expect(run([CUBE, 'וקטור p', 'AD = k·p', 'k חיובי'])).toEqual([null, null, null, null]);
    for (const s of SEEDS) expect(built(s).resolved.freeSyms.get('k')).toBeGreaterThan(0);
  });

  it('«|p| = 2 · AB = p» builds as «AB = p · |p| = 2» does, with AB of length 2', () => {
    expect(run([CUBE, 'וקטור p', 'AB = p', '|p| = 2'])).toEqual([null, null, null, null]);
    const one = SEEDS.slice(0, 6).map((s) => norm3(vec(built(s), 'A', 'B')));
    expect(run([CUBE, 'וקטור p', '|p| = 2', 'AB = p'])).toEqual([null, null, null, null]);
    expect(built().construction.freeVecMetrics).toEqual([]);
    SEEDS.slice(0, 6).forEach((s, i) => {
      expect(norm3(vec(built(s), 'A', 'B'))).toBeCloseTo(2, 9);
      expect(one[i]).toBeCloseTo(2, 9);
    });
  });

  it('«AD = k·p · AB = p» answers as «AB = p · AD = k·p»: the anchored verdict on «AD = k·AB»', () => {
    const a = run([CUBE, 'וקטור p', 'AB = p', 'AD = k·p']);
    const b = run([CUBE, 'וקטור p', 'AD = k·p', 'AB = p']);
    expect(a[3]).not.toBeNull();
    expect(b[3]).toBe(a[3]);
    expect(a[3]).not.toBe('free-vector-coupling');
  });

  it('a metric after the relation and before it agree: «AB = k·p · |p| = 2» and the reverse', () => {
    expect(run([CUBE, 'וקטור p', 'AB = k·p', '|p| = 2'])).toEqual([null, null, null, null]);
    expect(norm3(free(built(), 'p'))).toBeCloseTo(2, 6);
    expect(run([CUBE, 'וקטור p', '|p| = 2', 'AB = k·p'])).toEqual([null, null, null, null]);
    expect(norm3(free(built(), 'p'))).toBeCloseTo(2, 6);
  });
});

describe('#2684 — the joint rung: a figure that cannot absorb moves with the vector', () => {
  it('a free base turns into a trapezoid: «AB = k·p · DC = m·p» on a pyramid', () => {
    expect(run(['פירמידה SABCD שבסיסה מרובע', 'וקטור p', 'AB = k·p', 'DC = m·p'])).toEqual([null, null, null, null]);
    for (const s of SEEDS) {
      const d = built(s);
      expect(ok(d)).toBe(true);
      expect(parallel(vec(d, 'A', 'B'), free(d, 'p'))).toBeLessThan(1e-6);
      expect(parallel(vec(d, 'D', 'C'), free(d, 'p'))).toBeLessThan(1e-6);
    }
  });

  it('a stated p the figure must turn to: «p = (1,0,0) · p ⟂ AA′ · AD ∥ p»', () => {
    expect(run([CUBE, 'p = (1,0,0)', "p ⟂ AA'", 'AD ∥ p'])).toEqual([null, null, null, null]);
    for (const s of SEEDS.slice(0, 6)) {
      const d = built(s);
      expect(parallel(vec(d, 'A', 'D'), { x: 1, y: 0, z: 0 })).toBeLessThan(1e-6);
      expect(Math.abs(vec(d, 'A', "A'").x)).toBeLessThan(1e-6);
    }
  });
});

describe('#2684 — what cannot hold is refuted, naming the line', () => {
  it('«AB = k·p · AD = m·p» on a cube: p cannot be parallel to both', () => {
    const errs = run([CUBE, 'וקטור p', 'AB = k·p', 'AD = m·p']);
    expect(errs).toEqual([null, null, null, 'claim-refuted']);
    expect(st().facts).toHaveLength(3);
  });

  it('a stated-numbers contradiction is still `givens-contradict`, reached through the figure too', () => {
    const errs = run([CUBE, 'וקטור p', 'וקטור q', 'AB = p + q', '|p| = 1', '|p| = 2']);
    expect(errs[errs.length - 1]).toBe('givens-contradict');
  });
});

describe('#2684 — what stays the tool’s limit', () => {
  it.each([
    [[CUBE, 'וקטור p', 'p ⟂ AB', 'AE = p']], // a new point over a vector the figure reaches
    [[CUBE, 'וקטור p', 'AE = p', 'p ⟂ AB']], // the other order agrees
    [[CUBE, 'וקטור p', 'p ⟂ מישור ABC']], // a free vector against a plane has no vector form
  ])('%j', (lines) => {
    const errs = run(lines);
    expect(errs[errs.length - 1]).toBe('free-vector-coupling');
  });
});

describe('#2684 — the cue and the panel', () => {
  it.each([
    [[CUBE, 'וקטור p', 'AD = k·p'], 1], // p's 3 + k − 3: only p's size against k
    [[CUBE, 'וקטור p', 'p ⟂ AB'], 2], // 3 − 1
    [[CUBE, 'וקטור p', '|AB| = |p|'], 2],
    [[CUBE, 'וקטור p', 'p ∥ AB'], 1],
    [[CUBE, 'וקטור p', "E על AC' כך ש-AE = t·p"], 2], // E's rider + the size of p against t
    [[CUBE, 'וקטור p', 'AD = k·p', 'k = 2'], 0],
  ])('%j counts %i', (lines, dof) => {
    run(lines);
    const d = built();
    expect(freeDofCount3(d.construction, d.resolved)).toBe(dof);
  });

  it('a sampled free vector prints no number; the givens list prints the line as stated', () => {
    run([CUBE, 'וקטור p', 'AD = k·p']);
    const c = built().construction;
    const panel = JSON.stringify(dataView(c, 0));
    const p = free(built(), 'p');
    expect(panel).not.toContain(p.y.toFixed(3));
    expect(panel).toContain('k');
  });

  it('save / load keeps the relation', () => {
    run([...PRISM, 'וקטור u', SPAN]);
    const loaded = deserializeFigure3(serializeFigure3(st().facts, 0));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(Object.values(derive3(loaded.facts, 0).status).every((x) => x === 'ok')).toBe(true);
  });
});
