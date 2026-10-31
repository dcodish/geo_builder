/**
 * #1188 step 1 (ADR-3D-386) — THE POSITIONLESS VECTOR: model, declare, float, panel, ask.
 *
 * Measured at 422cda84 through the store's real submit door: «וקטור u» was not-understood, «u = (1,2,3)» refused
 * `unknown-vector`, «w = u + v» refused `unknown-vector` about w, and «|u| = 5» `unknown-vector` about the u the
 * student had just declared. The 3-D engine had no vector that was not a point pair.
 *
 * Every row here drives `submit` and reads what `derive3` built — never the parser alone (the #1184 lesson: a
 * parser lock guarded «נתון: v = (10,-5,0)» for a year while the sentence never built).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { FREE_VEC_FLOOR, FREE_VEC_RANGE, freeDofCount3 } from '../engine/evaluate';
import { norm3 } from '../engine/vec3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { layoutFreeVectors3 } from '../render/freeVectorLayout';
import { FREE_VECTOR_COLORS } from '../render/Figure3';
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
const CUBE = "קובייה ABCDA'B'C'D'";
const BASIS = "נסמן: AB = u, AD = v, AA' = w";

describe('#1188 — a vector may be declared with no position', () => {
  it.each([
    ['וקטור u', ['u']],
    ['הווקטור u', ['u']],
    ['vector u', ['u']],
    ['וקטורים u, v ו-w', ['u', 'v', 'w']],
    ['הווקטורים u ו-v', ['u', 'v']],
    ['vectors u, v and w', ['u', 'v', 'w']],
  ])('«%s» declares %j', (line, names) => {
    expect(run([line])).toEqual([null]);
    const c = built().construction;
    expect([...c.freeVectors.keys()]).toEqual(names);
    // a VALUE, never a position: nothing positional holds it
    expect(c.points.size).toBe(0);
    expect(c.vectors.size).toBe(0);
    expect(c.arrows).toEqual([]);
    expect(c.segments).toEqual([]);
    expect(built().positions.size).toBe(0);
  });

  it('a bare UNMARKED «u» is never a declaration (it stays the ask lane’s)', () => {
    expect(run(['u'])).toEqual(['not-understood']);
  });

  it('«וקטור AB» is still the anchored arrow (#1184), not a free vector', () => {
    run(['וקטור AB']);
    const c = built().construction;
    expect(c.arrows).toEqual([['A', 'B']]);
    expect(c.freeVectors.size).toBe(0);
  });

  it('a restated «וקטור u» is idempotent', () => {
    expect(run(['וקטור u', 'הווקטור u'])).toEqual([null, null]);
    expect([...built().construction.freeVectors.keys()]).toEqual(['u']);
  });
});

describe('#1188 — ADR-052: an unstated free vector is free and MOVES; a stated one does not', () => {
  const at = (seed: number) => built(seed).resolved.freeVectors.get('u')!;

  it('«וקטור u» differs between seeds 0 and 1', () => {
    run(['וקטור u']);
    const a = at(0);
    const b = at(1);
    expect(norm3({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })).toBeGreaterThan(1e-3);
  });

  it('«u = (1,2,3)» is the same at every seed', () => {
    run(['u = (1,2,3)']);
    for (let s = 0; s < 24; s++) expect(at(s)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('a partly stated vector keeps its stated components and moves the free one', () => {
    run(['u = (1, a, 3)']);
    const ys = new Set<number>();
    for (let s = 0; s < 6; s++) {
      const v = at(s);
      expect([v.x, v.z]).toEqual([1, 3]);
      ys.add(v.y);
    }
    expect(ys.size).toBeGreaterThan(1);
  });

  it('the norm floor: no seed of 0–23 draws an unstated free vector as a dot', () => {
    run(['וקטור u', 'v = (0, 0, b)']);
    for (let s = 0; s < 24; s++) {
      expect(norm3(at(s))).toBeGreaterThanOrEqual(FREE_VEC_FLOOR * FREE_VEC_RANGE);
      expect(norm3(built(s).resolved.freeVectors.get('v')!)).toBeGreaterThanOrEqual(FREE_VEC_FLOOR * FREE_VEC_RANGE);
    }
  });

  it('the cue counts the unstated components (and only those)', () => {
    run(['וקטור u']);
    expect(freeDofCount3(built().construction, built().resolved)).toBe(3);
    st().clear();
    run(['u = (1, a, 3)']);
    expect(freeDofCount3(built().construction, built().resolved)).toBe(1);
    st().clear();
    run(['u = (1,2,3)']);
    expect(freeDofCount3(built().construction, built().resolved)).toBe(0);
  });

  it('a stated sign on a named component holds at every seed («a חיובי»)', () => {
    expect(run(['u = (1, a, 3)', 'a חיובי'])).toEqual([null, null]);
    for (let s = 0; s < 24; s++) expect(at(s).y).toBeGreaterThan(0);
  });
});

describe('#1188 — M1 duality: a component tuple on a free name', () => {
  it('«u = (1,2,3)» on an empty canvas DECLARES u (#1184 arm 2)', () => {
    expect(run(['u = (1,2,3)'])).toEqual([null]);
    expect(built().construction.freeVectors.get('u')!.comps).toEqual([1, 2, 3]);
  });

  it.each(['נתון: v = (10,-5,0)', 'וקטור u = (1,2,3)'])('«%s» builds', (line) => {
    expect(run([line])).toEqual([null]);
    expect(built().construction.freeVectors.size).toBe(1);
  });

  it('«וקטור u» then «u = (1,2,3)» sets the components', () => {
    expect(run(['וקטור u', 'u = (1,2,3)'])).toEqual([null, null]);
    expect(built().construction.freeVectors.get('u')!.comps).toEqual([1, 2, 3]);
  });

  it('an EQUAL restatement is redundant', () => {
    expect(run(['u = (1,2,3)', 'נתון: u = (1, 2, 3)'])).toEqual([null, null]);
    expect(built().construction.freeVectors.get('u')!.comps).toEqual([1, 2, 3]);
  });

  it('an UNEQUAL restatement contradicts, naming both lines', () => {
    expect(run(['u = (1,2,3)', 'u = (1,5,3)'])).toEqual([null, 'givens-contradict']);
    expect(text()).toContain('u = (1,5,3)');
    expect(text()).toContain('u = (1,2,3)');
    expect(st().facts).toHaveLength(1);
  });

  it('on an ANCHORED u it is today’s pivot pin, unchanged', () => {
    expect(run([CUBE, BASIS, 'u = (2,0,0)'])).toEqual([null, null, null]);
    const c = built().construction;
    expect(c.freeVectors.size).toBe(0);
    expect(c.vectorPins.map((p) => p.name)).toEqual(['u']);
  });
});

describe('#1188 — one name, one meaning', () => {
  it('«נסמן: AB = u» then «וקטור u» is already-defined', () => {
    expect(run(['נסמן: AB = u', 'וקטור u'])).toEqual([null, 'already-defined']);
  });

  it('…and the reverse order too', () => {
    expect(run(['וקטור u', 'נסמן: AB = u'])).toEqual([null, 'already-defined']);
  });

  it('a free LINE’s name is taken, both ways', () => {
    expect(run(['ישר k', 'וקטור k'])).toEqual([null, 'already-defined']);
    st().clear();
    expect(run(['וקטור k', 'ישר k'])).toEqual([null, 'already-defined']);
  });
});

describe('#1188 — need-basis: a free vector never joins the basis (Q5)', () => {
  // the 2020 קיץ Q2 prism (scenarios3's gate), with a floating p declared before the span point
  const Q2 = ['מנסרה ישרה משולשת ABC', "M אמצע B'C'", "K על AA' כך ש-AK = 2KA'", "נסמן: AA' = w, KC = v, KB = u"];
  it('u, v, w · «וקטור p» · a span point still builds', () => {
    expect(run([...Q2, 'וקטור p', 'P על AM כך ש-KP = αu + βv'])).toEqual([null, null, null, null, null, null]);
    const c = built().construction;
    expect(c.vectors.size).toBe(3);
    expect(c.points.get('P')?.kind).toBe('in-span');
  });
});

/**
 * THE HONEST INTERIM REFUSALS — the known gaps of step 1, each naming the #1188 step that closes it. A row here
 * that starts to BUILD is that step landing: move the row into its step's own lock, never just delete it.
 */
// #1188 step 2 (ADR-3D-390) built the four `free-vector-combination` rows («w = u + v», «w = 2u - 3v», the cube's «p = 2u»,
// «u = (k-1, 2, k)»): they moved into issue-1188-free-vector-step2.test.ts, and the code is retired.
const KNOWN_GAPS_1188: { lines: string[]; code: 'free-vector-metric'; step: number }[] = [
  { lines: ['וקטור u', '|u| = 5'], code: 'free-vector-metric', step: 4 },
  { lines: ['וקטור u', 'וקטור v', 'u ⟂ v'], code: 'free-vector-metric', step: 4 },
  { lines: ['וקטור u', 'וקטור v', 'u·v = 0'], code: 'free-vector-metric', step: 4 },
  { lines: ['וקטור u', 'וקטור v', '|u| = |v|'], code: 'free-vector-metric', step: 4 },
  { lines: ['וקטור u', 'וקטור v', 'הזווית בין u ל-v היא 60'], code: 'free-vector-metric', step: 4 },
];

describe('#1188 — a given on a free vector that step 1 cannot build is refused honestly', () => {
  it.each(KNOWN_GAPS_1188.map((g) => [g.lines.join(' · '), g] as const))('«%s» (step %#)', (_label, g) => {
    const errs = run(g.lines);
    expect(errs.slice(0, -1).every((e) => e === null)).toBe(true);
    expect(errs[errs.length - 1]).toBe(g.code);
    // never «check the computation» about a satisfiable given, never "u is not declared" about a declared u
    expect(errs).not.toContain('claim-refuted');
    expect(errs).not.toContain('unknown-vector');
    // the text names the student's statement and says it is the tool's limit
    const line = g.lines[g.lines.length - 1];
    expect(text()).toContain(`«${line}»`);
    expect(text()).toContain('מגבלה של הכלי');
  });
});

describe('#1188 — the data panel', () => {
  const panel = () => dataView(built().construction, st().seed);

  it('a never-stated vector shows open: «u = (?, ?, ?)», and no measured value', () => {
    run(['וקטור u']);
    expect(panel().stated).toEqual(['u = (?, ?, ?)']);
    expect(panel().vectors).toEqual([]);
  });

  it('a stated tuple shows as stated, and its components and |u| are knowledge', () => {
    run(['u = (1,2,3)']);
    expect(panel().stated).toEqual(['u = (1, 2, 3)']);
    const e = panel().vectors.find((v) => v.label === 'u')!;
    expect(e.coords).toBe('(1, 2, 3)');
    expect(e.mag).toMatch(/^\|u\| = /);
    expect(e.sq).toBe('u² = 14');
  });

  it('a named free component is an open parameter until it is valued', () => {
    run(['u = (1, a, 3)']);
    expect(panel().params.find((p) => p.sym === 'a')?.open).toBe(true);
    run(['a = 2']);
    expect(built().construction.freeVectors.get('u')!.comps).toEqual([1, 2, 3]);
    expect(panel().params.find((p) => p.sym === 'a')?.value).toBe('2');
  });
});

describe('#1188 — the ask lane', () => {
  const ask = (q: string) => answerQuery(built().construction, q, st().seed);

  it('«u» and «|u|» on a stated free vector answer', () => {
    run(['u = (3,0,4)']);
    expect(ask('u').answer).toBe('(3, 0, 4)');
    expect(ask('|u|').answer).toBe('5');
  });

  it('…and on a never-stated one are honestly undetermined, never one drawing’s sample', () => {
    run(['וקטור u']);
    expect(ask('u')).toMatchObject({ answer: null, note: 'undetermined' });
    expect(ask('|u|')).toMatchObject({ answer: null, note: 'undetermined' });
  });
});

describe('#1188 — how it is drawn (display, never geometry)', () => {
  const VIEW = { width: 800, height: 600 };

  it('a free vector draws as a floating arrow in its own hue, with no points', () => {
    run(['וקטור u', 'וקטור v']);
    const d = built();
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW);
    const free = scene.vectors.filter((v) => v.free !== undefined);
    expect(free.map((v) => [v.name, v.free])).toEqual([['u', 0], ['v', 1]]);
    expect(scene.points).toEqual([]);
    // the fit contains every floating extent
    for (const v of free) for (const [x, y] of [[v.x1, v.y1], [v.x2, v.y2]]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(VIEW.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(VIEW.height);
    }
  });

  it('the hues are distinct from the anchored vector colour and from each other', () => {
    expect(new Set(FREE_VECTOR_COLORS).size).toBe(FREE_VECTOR_COLORS.length);
    expect(FREE_VECTOR_COLORS).not.toContain('#0d9488');
  });

  it('beside a figure, the tray sits outside the figure’s bounding box', () => {
    run([CUBE, 'u = (1,1,1)', 'וקטור v']);
    const d = built();
    const maxX = Math.max(...[...d.positions.values()].map((p) => p.x));
    for (const fp of layoutFreeVectors3(d.construction, d.resolved)) {
      expect(Math.min(fp.tail.x, fp.head.x)).toBeGreaterThan(maxX);
    }
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW);
    expect(scene.vectors.filter((v) => v.free !== undefined)).toHaveLength(2);
  });

  it('on an empty canvas the tray is centred on the origin', () => {
    run(['u = (2,0,0)']);
    const [fp] = layoutFreeVectors3(built().construction, built().resolved);
    expect(fp.tail.x + fp.head.x).toBeCloseTo(0, 9);
  });

  it('a free vector never moves the figure: the cube is bit-identical with or without «וקטור p»', () => {
    run([CUBE, BASIS]);
    const before = [0, 1, 7].map((s) => JSON.stringify([...built(s).positions]));
    run(['וקטור p', 'q = (1,2,3)']);
    const after = [0, 1, 7].map((s) => JSON.stringify([...built(s).positions]));
    expect(after).toEqual(before);
  });
});

describe('#1188 — save and load', () => {
  it('a saved figure of free vectors reloads with them', () => {
    run(['וקטור u', 'v = (1,2,3)']);
    const r = deserializeFigure3(serializeFigure3(st().facts, st().seed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...derive3(r.facts, r.seed).construction.freeVectors.keys()]).toEqual(['u', 'v']);
  });
});

/**
 * THE RATCHET (the lexical-ratchet pattern): a VALUE reader of a named vector asks `namedVector3` / `vectorValue3`,
 * so a free vector cannot fall through a direct `c.vectors.has/get` into "unknown". The direct reads that remain are
 * position readers (and the reference check itself). The count may only go DOWN — lower the ceiling when it does.
 */
describe('#1188 — the c.vectors direct-read ratchet', () => {
  const CEILING = 30; // 34 at 422cda84; step 1 moved the value readers it reaches to the accessor
  it(`direct c.vectors.has/get reads in src3d stay at or below ${CEILING}`, () => {
    const root = path.join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(p);
        } else if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(root);
    let n = 0;
    for (const f of files) n += (readFileSync(f, 'utf8').match(/\bc\.vectors\.(?:has|get)\(/g) ?? []).length;
    expect(n).toBeLessThanOrEqual(CEILING);
  });
});
