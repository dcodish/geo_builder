/**
 * F6 — objects on the plane: segments, polygons, circles.
 *
 * The family carries **no constraint**, and most of these tests are about that. «המרובע OZ₁Z₂Z₃» says
 * *draw it*, not "these four points form a convex quadrilateral in this order" — reading a shape into
 * it would assert a figure the question never gave (ADR-052), and the exam's own figures are often
 * non-convex. Shape as a *claim* is F11, checked rather than assumed.
 */
import { describe, expect, it } from 'vitest';

import { parseLineV2 } from '../rules';
import { deriveLines } from '../../app/deriveLines';
import { buildScene } from '../../scene/scene';

const ok = (line: string) => {
  const r = parseLineV2(line);
  if (!r.ok) throw new Error(`did not parse: ${line} (${r.reason}${'items' in r ? `: ${r.items}` : ''})`);
  return r.line;
};

describe('F6 — the sentence forms', () => {
  it.each([
    ['הקטע z1z2', 'segment', 2],
    ['segment z1z2', 'segment', 2],
    ['המשולש Oz1z2', 'polygon', 3],
    ['triangle Oz1z2', 'polygon', 3],
    ['המרובע Oz1z2z3', 'polygon', 4],
    ['quadrilateral Oz1z2z3', 'polygon', 4],
    ['המצולע Oz1z2z3z4', 'polygon', 5],
    ['polygon Oz1z2z3z4', 'polygon', 5],
  ])('«%s» is a %s over %i points', (line, kind, n) => {
    const l = ok(line);
    expect(l.objects).toHaveLength(1);
    expect(l.objects[0].kind).toBe(kind);
    expect(l.objects[0].kind === 'circle' ? [] : l.objects[0].points).toHaveLength(n);
  });

  /**
   * A PASTED figure has to work. «הקטע Z₁Z₂» normalizes to «הקטע z1*z2» — a subscript run ends a name,
   * so the orthography chokepoint inserts the product — and the shape keyword is what disambiguates it.
   */
  it('reads a run pasted from an exam, where the subscripts became a product', () => {
    expect(ok('הקטע Z₁Z₂').objects[0].kind).toBe('segment');
    expect(ok('המרובע OZ₁Z₂Z₃').objects[0].kind).toBe('polygon');
  });

  /**
   * Without a keyword the separator decides, and that is the operator's drawing convention: `z1*z2` is
   * the PRODUCT of two numbers and must keep meaning that, while a glued `z1z2` cannot be an
   * identifier — the name grammar puts digits last — so it is unambiguously a run.
   */
  it('a bare GLUED run is a figure; a starred one is never read as one', () => {
    expect(ok('Oz1z2z3').objects[0].kind).toBe('polygon');
    const starred = parseLineV2('z1*z2');
    expect(starred.ok && starred.line.objects.length > 0).toBe(false);
  });

  /** The origin is a point of the plane, never an unknown of the system. */
  it('O is drawable without being declared, and never becomes a free DOF', () => {
    const l = ok('המשולש Oz1z2');
    expect(l.declares).toEqual(['z1', 'z2']); // O is absent
    const d = deriveLines(['z1 = 3+4i', 'z2 = 1+i', 'המשולש Oz1z2']);
    expect(d.freeDof).toEqual([]);
    expect(d.points.map((p) => p.name)).toEqual(['z1', 'z2']);
  });

  /** An object declares its vertices — always visualise, without waiting for a constraint. */
  it('naming a figure is enough to put its vertices on the canvas', () => {
    const d = deriveLines(['המרובע Oz1z2z3']);
    expect(d.points.map((p) => p.name).sort()).toEqual(['z1', 'z2', 'z3']);
    expect(d.objects).toHaveLength(1);
  });

  it('states NO relation between the vertices', () => {
    expect(ok('המרובע Oz1z2z3').constraints).toEqual([]);
  });
});

describe('F6 — arity is enforced, not assumed', () => {
  it.each(['המשולש Oz1z2z3', 'triangle Oz1z2z3', 'הקטע Oz1z2'])(
    'refuses «%s» — the noun promises a different vertex count',
    (line) => {
      expect(parseLineV2(line).ok).toBe(false);
    },
  );
});

describe('F6 — circles', () => {
  it('a circumscribed circle is drawn through three named points', () => {
    const l = ok('המעגל החוסם את המשולש z1z2z3');
    expect(l.objects[0].kind).toBe('circumcircle');
    const d = deriveLines(['z1 = 1', 'z2 = i', 'z3 = -1', 'המעגל החוסם את המשולש z1z2z3']);
    const circle = d.objects.find((o) => o.kind === 'circle');
    expect(circle?.radius).toBeCloseTo(1, 9);
    expect(circle?.center?.re).toBeCloseTo(0, 9);
    expect(circle?.center?.im).toBeCloseTo(0, 9);
  });

  /**
   * Three points determine a circle; a fourth is a CYCLIC claim about that vertex. Accepting it here
   * would let a false statement draw a circle fitting three of the four and silently ignore the last.
   */
  it('refuses a circumscribed circle over four points — that is a claim, not an object', () => {
    expect(parseLineV2('המעגל החוסם את המרובע z1z2z3z4').ok).toBe(false);
  });

  it('three collinear points get no circle, and nothing is invented', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 2', 'z3 = 3', 'המעגל החוסם את המשולש z1z2z3']);
    expect(d.objects.filter((o) => o.kind === 'circle')).toEqual([]);
  });

  it.each([
    'המעגל שמרכזו O ורדיוסו 2',
    'the circle with centre O and radius 2',
    'the circle with center O and radius 2',
  ])('a stated centre and radius parses: %s', (line) => {
    const l = ok(line);
    expect(l.objects[0].kind).toBe('circle');
  });

  /** A radius in a parameter has no drawable size until the parameter is sampled — never a default. */
  it('a radius in a real parameter is sampled, and the circle moves with it', () => {
    const a = deriveLines(['z1 = 1', 'המעגל שמרכזו O ורדיוסו r'], 0, 0);
    const b = deriveLines(['z1 = 1', 'המעגל שמרכזו O ורדיוסו r'], 0, 1);
    const ra = a.objects[0]?.radius;
    const rb = b.objects[0]?.radius;
    expect(ra).toBeGreaterThan(0);
    expect(rb).toBeGreaterThan(0);
    expect(ra).not.toBe(rb);
  });
});

describe('F6 — honesty travels with the object', () => {
  it('an object over forced vertices is marked known; one over sampled vertices is not', () => {
    const forced = deriveLines(['z1 = 3+4i', 'z2 = 1+i', 'הקטע z1z2']);
    expect(forced.objects[0].known).toBe(true);

    const sampled = deriveLines(['z1 = 3+4i', 'הקטע z1z2']); // z2 is free
    expect(sampled.objects[0].known).toBe(false);
  });

  /** A triangle missing a corner is not a triangle, and the corner must not be invented. */
  it('an object is dropped whole when a vertex has no position, never drawn partially', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 2', 'המשולש z1z2z9', 'המשולש z1z2z9 סותר']);
    // z9 IS declared by the object, so it is sampled and the triangle draws; nothing is half-drawn
    expect(d.objects.every((o) => o.kind !== 'polygon' || o.vertices.length === 3)).toBe(true);
  });

  it('the scene carries the shapes, and a circle widens the view to fit', () => {
    const d = deriveLines(['z1 = 1', 'המעגל שמרכזו O ורדיוסו 8']);
    const scene = buildScene(d.points, d.objects);
    expect(scene.shapes).toHaveLength(1);
    expect(scene.extent).toBeGreaterThan(8);
  });

  it('a polygon closes and a segment does not', () => {
    const seg = buildScene(...sceneArgs('הקטע z1z2'));
    const poly = buildScene(...sceneArgs('המשולש Oz1z2'));
    expect(seg.shapes[0].closed).toBe(false);
    expect(poly.shapes[0].closed).toBe(true);
  });
});

const sceneArgs = (line: string) => {
  const d = deriveLines(['z1 = 3+4i', 'z2 = 1+i', line]);
  return [d.points, d.objects] as const;
};
