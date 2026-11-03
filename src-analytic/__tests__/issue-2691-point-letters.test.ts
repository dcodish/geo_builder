/**
 * #2691 (ADR-AG-389) — a point's letter sits NEXT TO its point, never on a line.
 *
 * Operator, 2026-11-03, playing PR #2690: *"points C and D are not located correctly and are on the line instead of
 * next to it"*. The letter was drawn at a fixed offset up-right of its dot, so C's and D's boxes lay across side BC
 * (BC runs up-right from C, and through its own midpoint D). Now every letter is placed (`placePointLetters`): 2-D's
 * seed — the widest gap between the lines at the dot — turned off any drawn line, dot or letter, before the values.
 *
 * His exact sequence is the saved fixture `operator-letters-on-side-2691.analytic.json`; the class lock is the sweep
 * `issue-2691-letter-sweep.test.ts`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildScene, placePointLetters, pointLabelBox, type ScenePoint } from '../render/scene';
import { ALL_SHOWN, type CanvasDisplay } from '../render/canvasDisplay';
import { crossesBox, inkOf, letterViolations, sceneOf } from './pointLetterSweep';
import { derive } from '../engine/derive';

const LINES = (JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'operator-letters-on-side-2691.analytic.json'), 'utf8')) as { lines: string[] }).lines;

const DISPLAYS: Array<[string, CanvasDisplay]> = [
  ['all on', ALL_SHOWN],
  ['grid off', { ...ALL_SHOWN, grid: false }],
  ['numbers off', { ...ALL_SHOWN, numbers: false }],
  ['values off', { ...ALL_SHOWN, values: false }],
  ['all off', { grid: false, numbers: false, values: false }],
];

describe('#2691 — the operator’s figure: C and D clear of side BC', () => {
  it('the figure builds green, and its letters are the six points', () => {
    expect(derive(LINES, 0).faults).toEqual([]);
    expect(sceneOf(LINES, 0)!.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'P']);
  });

  for (const seed of [0, 1, 2, 3]) {
    for (const [tag, display] of DISPLAYS) {
      it(`seed ${seed}, ${tag}: no letter crosses a segment, a dot or another letter`, () => {
        const s = sceneOf(LINES, seed, display)!;
        const ink = inkOf(s);
        for (const id of ['C', 'D']) {
          const b = pointLabelBox(s.points.find((p) => p.id === id)!);
          expect(ink.filter((l) => crossesBox(l, b)).map((l) => l.what), `${id}`).toEqual([]);
        }
        expect(letterViolations(s)).toEqual([]);
      });
    }
  }

  it('the values are placed after the letters: no stated value covers a letter', () => {
    for (const seed of [0, 1, 2, 3]) {
      const s = sceneOf(LINES, seed)!;
      const boxes = s.points.map(pointLabelBox);
      const vals = [...s.stated.labels, ...s.segments.flatMap((g) => (g.label ? [g.label] : []))];
      expect(vals.length).toBeGreaterThan(0); // «שטח ABC הוא 18» is written on the figure
      for (const v of vals) {
        const hw = (v.text.replace(/[\u2066-\u2069]/g, '').length * 12 * 0.6) / 2;
        const vb = { x0: v.x - hw, y0: v.y - 5.4, x1: v.x + hw, y1: v.y + 7.2 };
        expect(boxes.some((b) => b.x0 < vb.x1 && vb.x0 < b.x1 && b.y0 < vb.y1 && vb.y0 < b.y1), v.text).toBe(false);
      }
    }
  });
});

describe('#2691 — the rule is 2-D’s: the widest gap first, turned only when something is in the way', () => {
  const pt = (id: string, cx: number, cy: number): ScenePoint => ({ id, cx, cy, label: id });
  const centre = (p: ScenePoint) => {
    const b = pointLabelBox(p);
    return { x: (b.x0 + b.x1) / 2 - p.cx, y: (b.y0 + b.y1) / 2 - p.cy };
  };

  it('a lone point: up-right, 2-D’s default', () => {
    const [p] = placePointLetters([pt('A', 100, 100)], [], [], [], { width: 400, height: 400 });
    const c = centre(p);
    expect(c.x).toBeGreaterThan(0);
    expect(c.y).toBeLessThan(0);
  });

  it('a triangle’s vertex: outside, on the bisector of the widest gap between its two sides', () => {
    // A at the top, the sides going down-left and down-right: the letter goes UP
    const ink = [{ x1: 200, y1: 100, x2: 100, y2: 300 }, { x1: 200, y1: 100, x2: 300, y2: 300 }];
    const [p] = placePointLetters([pt('A', 200, 100)], ink, [], [], { width: 400, height: 400 });
    const c = centre(p);
    expect(Math.abs(c.x)).toBeLessThan(1);
    expect(c.y).toBeLessThan(0);
  });

  it('a point inside a line (a midpoint): off the line, to one side', () => {
    const ink = [{ x1: 0, y1: 300, x2: 300, y2: 0 }];
    const [p] = placePointLetters([pt('D', 150, 150)], ink, [], [], { width: 400, height: 400 });
    expect(crossesBox(ink[0], pointLabelBox(p))).toBe(false);
  });

  it('two points at one place (a foot on a vertex): two letters, side by side, never on top of each other', () => {
    const [b, e] = placePointLetters([pt('B', 100, 100), pt('E', 100, 100)], [], [], [], { width: 400, height: 400 });
    const bb = pointLabelBox(b);
    const eb = pointLabelBox(e);
    expect(bb.x0 < eb.x1 && eb.x0 < bb.x1 && bb.y0 < eb.y1 && eb.y0 < bb.y1).toBe(false);
  });

  it('a point built outside the scene keeps the old offset (no placement, no move)', () => {
    const b = pointLabelBox(pt('A', 10, 10));
    expect(b.x0).toBe(17);
  });

  it('the scene places every letter it draws', () => {
    const d = derive(LINES, 0);
    const s = buildScene(d.figure, d.box, 600, 600, { stated: d.stated });
    expect(s.points.every((p) => p.at !== undefined)).toBe(true);
  });
});
