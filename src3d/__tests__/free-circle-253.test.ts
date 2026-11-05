/**
 * #253 ([ADR-3D-419](../../docs/06b-decisions-3d.md#adr-3d-419)) — A FREE-STANDING GIVEN CIRCLE IN R³.
 *
 * Prod (2026-07-09, still `not-understood` at 20cfa5de): «נתון מעגל שמרכזו O.». Operator ruling 2026-07-27 (A), restated
 * 2026-08-13: it builds at once, with a free radius and a free plane orientation seeded horizontal; «show another»
 * resamples them, the DOF cue counts them, and later givens (a point on the circle, a plane, tangency, a radius) pin
 * them. Bagrut questions open with the bare circle and state the plane later, so both orders are locked (ADR-104).
 *
 * Asserted geometrically on the resolved figure through the App's own decision (`decideDeterministic3`).
 */
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';
import { dist3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';

type State = { facts: Fact3[]; seed: number };

function run(lines: string[]) {
  let s: State = { facts: [], seed: 0 };
  const verdicts: string[] = [];
  for (const line of lines) {
    const v = decideDeterministic3(s, line);
    verdicts.push(v.kind === 'refused' ? `refused:${v.error.code}` : v.kind);
    if (v.kind === 'record') s = { facts: v.facts, seed: v.seed };
  }
  return { s, verdicts };
}

/** Builds every line, each with a verdict `record` and a green status, and returns the figure at `seed`. */
function build(lines: string[], seed = 0) {
  const { s, verdicts } = run(lines);
  expect(verdicts, lines.join(' · ')).toEqual(lines.map(() => 'record'));
  const d = derive3(s.facts, seed);
  for (const f of s.facts) expect(d.status[f.id], f.utterance).toBe('ok');
  const k = d.resolved.circles3[0];
  return { d, k, cue: freeDofCount3(d.construction, d.resolved) };
}

const close = (a: Vec3, b: Vec3) => expect(dist3(a, b)).toBeLessThan(1e-9);
const onCircle = (p: Vec3, k: { center: Vec3; normal: Vec3; radius: number }) => {
  expect(norm3(sub3(p, k.center))).toBeCloseTo(k.radius, 6);
  expect(dot3(sub3(p, k.center), k.normal)).toBeCloseTo(0, 6);
};

const PLACED = ['O(0,0,0)', 'A(2,0,0)', 'B(0,2,0)'];

describe('#253 — the bare circle builds', () => {
  it.each(['נתון מעגל שמרכזו O.', 'נתון מעגל שמרכזו O', 'מעגל שמרכזו O', 'מעגל O', 'a circle with center O', 'circle centered at O', 'circle O'])(
    '«%s» on a blank canvas: a circle centred at a created O, three free DOFs',
    (line) => {
      const { d, k } = build([line]);
      expect(k.id).toBe('circle-O');
      close(k.center, d.positions.get('O')!);
      expect(k.radius).toBeGreaterThan(0);
      expect(k.freeDof).toBe(3);
    },
  );

  it('an existing O is the centre: it stays where it is', () => {
    const { d, k } = build(['O(1,2,3)', 'נתון מעגל שמרכזו O.']);
    close(d.positions.get('O')!, { x: 1, y: 2, z: 3 });
    close(k.center, { x: 1, y: 2, z: 3 });
  });

  it('the default drawing is horizontal, and «show another» resamples radius and orientation', () => {
    const base = build(['O(0,0,0)', 'מעגל O']).k;
    close(base.normal, { x: 0, y: 0, z: 1 });
    const seeds = [1, 2, 3, 4, 5].map((seed) => build(['O(0,0,0)', 'מעגל O'], seed).k);
    expect(new Set(seeds.map((k) => k.radius.toFixed(6))).size).toBeGreaterThan(1);
    expect(new Set(seeds.map((k) => k.normal.z.toFixed(6))).size).toBeGreaterThan(1);
    for (const k of seeds) expect(Math.abs(k.normal.z), 'never edge-on').toBeGreaterThanOrEqual(0.5);
  });

  it('the cue counts what the sampler varies, from one source', () => {
    expect(build(['O(0,0,0)', 'מעגל O']).cue).toBe(3);
    expect(build(['O(0,0,0)', 'מעגל O ברדיוס 5']).cue).toBe(2);
    expect(build(['O(0,0,0)', 'π1: z=0', 'מעגל O במישור π1']).cue).toBe(1);
    expect(build(['O(0,0,0)', 'π1: z=0', 'מעגל O במישור π1 ברדיוס 5']).cue).toBe(0);
  });

  it('a circle draws no plane of its own (ADR-3D-350)', () => {
    const { d } = build(['O(0,0,0)', 'מעגל O']);
    expect([...d.resolved.planes.keys()]).toEqual([]);
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 });
    expect(scene.planes).toEqual([]);
    expect(scene.curves.length).toBeGreaterThan(0);
  });
});

describe('#253 — the forms the sentence carries', () => {
  // the phrasing sweep's findings: every opener, every centre word and the textbook's «(O)» notation are one reader
  it.each([
    'יהי מעגל שמרכזו O',
    'יהיה מעגל O',
    'קיים מעגל שמרכזו O',
    'נתונה מעגל O',
    'נתון: מעגל O',
    'במרחב נתון מעגל שמרכזו O',
    'נתון במרחב מעגל שמרכזו O',
    'נתון מעגל במרחב שמרכזו O',
    'המעגל (O)',
    'נתון מעגל (O)',
    'מעגל במרכז O',
    'מעגל מרכז O',
    'מעגל שמרכזו בנקודה O',
    'מעגל בעל מרכז O',
    'מעגל עם מרכז O',
    'circle centred at O',
    'Let circle O',
  ])('«%s» reads', (line) => {
    expect(build([line]).k.id).toBe('circle-O');
  });

  it.each(['מעגל O שאורך רדיוסו 5', 'מעגל O r=5', 'מעגל שמרכזו O שרדיוסו הוא 5'])('«%s» reads the radius', (line) => {
    expect(build([line]).k.radius).toBe(5);
  });

  it.each(['מעגל שמרכזו O ורדיוסו 5', 'מעגל O ברדיוס 5', 'מעגל O שרדיוסו 5', 'מעגל O רדיוס 5', 'a circle with center O and radius 5', 'circle O with radius 5'])(
    '«%s» pins the radius at every seed',
    (line) => {
      for (const seed of [0, 1, 2]) {
        const { k } = build([line], seed);
        expect(k.radius).toBe(5);
        expect(k.freeDof).toBe(2);
      }
    },
  );

  it.each(['מעגל שמרכזו O במישור π1 ורדיוסו 5', 'מעגל שמרכזו O ורדיוס 5 במישור π1', 'circle O with radius 5 in plane π1'])('«%s»: both clauses, in either order', (line) => {
    const { k } = build(['π1: z=0', 'O(0,0,0)', line], 2);
    expect(k.radius).toBe(5);
    expect(Math.abs(k.normal.z)).toBeCloseTo(1, 9);
    expect(k.freeDof).toBe(0);
  });

  it.each(['מעגל O ברדיוס 2/3', 'מעגל O בקוטר 6', 'מעגל O ברדיוס 0', 'מעגל O ABC', 'מעגל O שעובר דרך A'])(
    '«%s»: a clause the rule does not read is never dropped',
    (line) => {
      expect(run([line]).verdicts).toEqual(['not-understood']);
    },
  );

  it('the sibling forms keep their owners', () => {
    expect(run(['מעגל']).verdicts).toEqual(['guided']);
    const inscribed = run(['משולש ABC', 'מעגל O חוסם את המשולש ABC']);
    expect(derive3(inscribed.s.facts, 0).construction.circles3[0].def.kind).toBe('circum');
    const tangent = run(['A(0,0,0)', 'B(2,0,0)', 'מעגל שמרכזו O משיק לישר AB בנקודה T']);
    expect(derive3(tangent.s.facts, 0).construction.circles3[0].def.kind).toBe('tangent-line');
  });
});

describe('#253 — later givens pin it, and nothing else moves', () => {
  it('a radius stated later', () => {
    for (const line of ['רדיוס המעגל הוא 3', 'רדיוס המעגל O הוא 3', 'the radius of the circle is 3']) {
      const { k } = build(['O(0,0,0)', 'מעגל O', line], 3);
      expect(k.radius).toBe(3);
      expect(k.freeDof).toBe(2);
    }
  });

  it('a plane stated later: the textbook order, and the centre lands on it', () => {
    const { d, k } = build(['מעגל O', 'π1: z=1', 'המעגל במישור π1'], 1);
    expect(Math.abs(k.normal.z)).toBeCloseTo(1, 9);
    expect(d.positions.get('O')!.z).toBeCloseTo(1, 6);
  });

  it('the plane first and the circle after give one figure', () => {
    const first = build(['O(0,0,0)', 'π1: z=0', 'מעגל O במישור π1'], 1).k;
    const later = build(['O(0,0,0)', 'מעגל O', 'π1: z=0', 'המעגל במישור π1'], 1).k;
    expect(later.radius).toBe(first.radius);
    close(later.normal, first.normal);
  });

  it('one placed point pins the radius and one orientation DOF, and that point stays put', () => {
    for (const seed of [0, 1, 2]) {
      const { d, k } = build([...PLACED, 'מעגל שמרכזו O', 'A על המעגל'], seed);
      close(d.positions.get('A')!, { x: 2, y: 0, z: 0 });
      expect(k.radius).toBeCloseTo(2, 9);
      expect(k.freeDof).toBe(1);
      onCircle(d.positions.get('A')!, k);
    }
  });

  it('two placed points determine the circle at every seed', () => {
    const normals = [0, 1, 2].map((seed) => {
      const { d, k } = build([...PLACED, 'מעגל שמרכזו O', 'A על המעגל', 'B על המעגל'], seed);
      expect(k.freeDof).toBe(0);
      onCircle(d.positions.get('A')!, k);
      onCircle(d.positions.get('B')!, k);
      return k.normal;
    });
    close(normals[1], normals[0]);
    close(normals[2], normals[0]);
  });

  it('a new point rides the circle, and the circle takes it along', () => {
    for (const seed of [0, 1]) {
      const { d, k } = build(['O(0,0,0)', 'מעגל O', 'D על המעגל'], seed);
      onCircle(d.positions.get('D')!, k);
    }
  });

  it('a rider created BEFORE the pinning point still ends on the pinned circle', () => {
    for (const seed of [0, 1]) {
      const { d, k } = build(['O(0,0,0)', 'מעגל O', 'D על המעגל', 'A(2,0,0)', 'A על המעגל'], seed);
      expect(k.radius).toBeCloseTo(2, 9);
      onCircle(d.positions.get('D')!, k);
    }
  });

  it.each([
    [['מעגל O', 'D על המעגל', 'OD = 4']],
    [['OD = 4', 'מעגל O', 'D על המעגל']],
  ])('a length from the centre to a point on the circle IS the radius: %j', (lines) => {
    for (const seed of [0, 1]) {
      const { d, k } = build(lines, seed);
      expect(k.radius).toBe(4);
      expect(k.freeDof).toBe(2);
      onCircle(d.positions.get('D')!, k);
    }
  });

  it('tangency stated later takes over the plane and the radius', () => {
    const { d, k } = build(['A(0,0,0)', 'B(2,0,0)', 'O(1,1,0)', 'מעגל O', 'מעגל O משיק לישר AB בנקודה T']);
    expect(k.radius).toBeCloseTo(1, 9);
    expect(k.freeDof).toBeUndefined();
    close(d.positions.get('T')!, { x: 1, y: 0, z: 0 });
  });

  it('a stated radius that tangency agrees with stays green', () => {
    expect(build(['A(0,0,0)', 'B(2,0,0)', 'O(1,1,0)', 'מעגל O ברדיוס 1', 'מעגל O משיק לישר AB בנקודה T']).k.radius).toBeCloseTo(1, 9);
  });

  it('STABILITY: pinning the circle never moves an existing point', () => {
    const before = build([...PLACED, 'מעגל O']).d.positions;
    const after = build([...PLACED, 'מעגל O', 'רדיוס המעגל הוא 3', 'A על המעגל'.replace('A', 'D')]).d.positions;
    for (const id of ['O', 'A', 'B']) close(after.get(id)!, before.get(id)!);
  });
});

describe('#253 — refusals name the statement', () => {
  const CASES: [string[], object][] = [
    [['מעגל O ברדיוס 5', 'רדיוס המעגל הוא 3'], { code: 'circle-given-conflict', name: 'O', what: 'radius' }],
    [['מעגל O ברדיוס 3', 'D על המעגל', 'OD = 4'], { code: 'circle-given-conflict', name: 'O', what: 'radius' }],
    [['מעגל O', 'D על המעגל', 'OD = 4', 'OD = 5'], { code: 'circle-given-conflict', name: 'O', what: 'radius' }],
    [['מעגל O', 'D על המעגל', 'OD = 4', 'רדיוס המעגל הוא 5'], { code: 'circle-given-conflict', name: 'O', what: 'radius' }],
    [['π1: z=0', 'π2: z=1', 'מעגל O במישור π1', 'מעגל O במישור π2'], { code: 'circle-given-conflict', name: 'O', what: 'plane' }],
    [['משולש ABC חסום במעגל', 'רדיוס המעגל הוא 3'], { code: 'circle-given-determined', what: 'radius' }],
    [['רדיוס המעגל הוא 3'], { code: 'unknown-circle' }],
    [['המעגל במישור π1'], { code: 'unknown-circle' }],
  ];
  it.each(CASES)('%j', (lines, error) => {
    const { s } = run(lines.slice(0, -1));
    const v = decideDeterministic3(s, lines[lines.length - 1]);
    expect(v.kind === 'refused' ? v.error : v).toEqual(error);
  });

  it('a second placed point at another distance is refused on its own fact', () => {
    const { verdicts } = run(['O(0,0,0)', 'A(2,0,0)', 'B(0,3,0)', 'מעגל O', 'A על המעגל', 'B על המעגל']);
    expect(verdicts.at(-1)).toBe('refused:not-on-circle');
  });

  it('a stated radius tangency contradicts is refused, never dropped', () => {
    const { verdicts } = run(['A(0,0,0)', 'B(2,0,0)', 'O(1,1,0)', 'מעגל O ברדיוס 3', 'מעגל O משיק לישר AB בנקודה T']);
    expect(verdicts.at(-1)).toBe('refused:claim-refuted');
  });
});
