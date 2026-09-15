/**
 * CLICKABLE CROSSINGS (#1025), and the label that stopped hiding a coordinate (#1086).
 *
 * Operator, 2026-09-15: *"when a line we draw crosses another line, we need to see the dashed circle
 * allowing us to create that point"*.
 *
 * The design these assert is that a dot offers a SENTENCE: clicking it adds «P נקודת החיתוך של הישר
 * AB עם הישר CD», which is exactly what typing that produces (ADR-AG-048). Two surfaces, one grammar
 * — so a crossing whose objects have no NAME the grammar can use gets no dot at all.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingSentence, crossingsOf, freeLetter } from '../engine/crossings';
import { knownCurve } from '../engine/evaluate';
import { buildScene } from '../render/scene';

const at = (lines: string[]) => {
  const d = derive(lines, 0);
  return { d, crossings: crossingsOf(d.figure, d.construction) };
};

describe('#1025 — a crossing is offered where the student could NAME it', () => {
  it('two segments that cross', () => {
    const { d, crossings } = at(['A(0,0)', 'B(4,4)', 'C(0,4)', 'D(4,0)', 'AB', 'CD']);
    expect(crossings).toHaveLength(1);
    expect([crossings[0].x, crossings[0].y].map((n) => Number(n.toFixed(4)))).toEqual([2, 2]);
    expect(crossingSentence(crossings[0], freeLetter(d.construction))).toBe(
      'P נקודת החיתוך של הישר AB עם הישר CD',
    );
  });

  it('and the sentence it offers really BUILDS that point', () => {
    // The whole design in one assertion: the dot's words are a line the tool already understands.
    const lines = ['A(0,0)', 'B(4,4)', 'C(0,4)', 'D(4,0)', 'AB', 'CD'];
    const { d, crossings } = at(lines);
    const sentence = crossingSentence(crossings[0], freeLetter(d.construction));
    const after = derive([...lines, sentence], 0);
    expect(after.faults).toEqual([]);
    const p = after.figure.points.find((q) => q.id === 'P')!;
    expect([p.x, p.y].map((n) => Number(n.toFixed(4)))).toEqual([2, 2]);
  });

  it('a triangle side and a stated line — and only the side actually crossed', () => {
    const { crossings } = at(['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC', 'נתון הישר l1: y=x']);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].second).toBe('הישר l1');
  });

  it('offers NOTHING where a name does not exist — an anonymous conic', () => {
    // #1057 left how a student refers to one of two anonymous conics open, so a dot here would be a
    // click with no sentence behind it.
    expect(at(['x^2/9+y^2/4=1', 'נתון הישר l1: y=x']).crossings).toHaveLength(0);
  });

  it('and nothing where a point already stands', () => {
    // Two sides of a triangle meet at a vertex, which is already a point: offering to create it
    // would be the tool suggesting the student repeat themselves.
    const { crossings } = at(['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC']);
    expect(crossings).toHaveLength(0);
  });

  it('reaches the scene, projected, with its sentence intact', () => {
    const lines = ['A(0,0)', 'B(4,4)', 'C(0,4)', 'D(4,0)', 'AB', 'CD'];
    const d = derive(lines, 0);
    const scene = buildScene(d.figure, d.box, 600, 600, {
      crossings: crossingsOf(d.figure, d.construction).map((k) => ({
        id: k.id,
        x: k.x,
        y: k.y,
        sentence: crossingSentence(k, freeLetter(d.construction)),
      })),
    });
    expect(scene.crossings).toHaveLength(1);
    expect(scene.crossings[0].sentence).toContain('נקודת החיתוך');
  });
});

describe('#1086 — the centre mark does not label what a POINT already labels', () => {
  const centreLabel = (lines: string[]) => {
    const d = derive(lines, 0);
    const scene = buildScene(d.figure, d.box, 600, 600, {
      curveKnown: (id) => knownCurve(d.construction, id) !== null,
    });
    return scene.curves[0]?.centre?.label ?? null;
  };

  it('«מעגל O» — the point owns the label, so the mark prints none', () => {
    // Operator: *"the label O hides the x value"*. Both were drawn at one place, overlapping into
    // «O, 5)».
    expect(centreLabel(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25'])).toBeNull();
    const d = derive(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25'], 0);
    expect(d.figure.points.map((p) => p.id)).toEqual(['O']);
  });

  it('a circle with no named centre still labels its mark', () => {
    expect(centreLabel(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'])).toBe('(3, 4)');
    expect(centreLabel(['(x-3)^2+(y-4)^2=9'])).toBe('(3, 4)');
  });
});
