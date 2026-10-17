/**
 * #2172 ([ADR-732](../../../docs/06-decisions.md#adr-732), amends ADR-544, builds on ADR-715) — NO VALUE LABEL COVERS
 * ANOTHER.
 *
 * Found work, ruled 2026-10-16 (decisions ballot round 4, card 10 A): «מעגל O · A על המעגל O · B על המעגל O · AB = 7 ·
 * קשת AB = 40 במעגל O» drew the chord's «7» under the arc's «40°», which read «740°». Each label was placed from its
 * own anchor and nudge; nothing compared one label's box with another's.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
import { LABEL_AIR, MEASURE_LABEL_PRIORITY, buildScene, placeMeasureLabels, scenePositions, type MeasureLabelPlacement, type SceneMeasure } from '../scene';
import { fitTransform } from '../transform';

const R = 4; // the renderer's base unit at zoom 1
const FONT = 16; // the renderer's base font at zoom 1
const VP = { width: 800, height: 600, padding: 48 }; // Figure.tsx's default fit

/** Every measure label of a figure, placed exactly as `Figure.tsx` places it. */
function placed(lines: string[], seed = 0) {
  const fig = replay(factsOf(lines as never), seed as never);
  expect(fig.lastError).toBeNull();
  const scene = buildScene(fig.construction, fig.positions, fig.labels, fig.angleMarks, { circles: fig.circles, coincidences: fig.coincidences });
  const t = fitTransform(scenePositions(scene), VP);
  const ps = scene.points.map((p) => t.toScreen(p.pos));
  const away = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
  const out = placeMeasureLabels(scene.measures, t.toScreen, { r: R, fontSize: FONT, away });
  return out.map((p, i) => ({ ...p, text: scene.measures[i].text, kind: scene.measures[i].kind }));
}

type Lab = MeasureLabelPlacement & { text: string };
/** The overlap (w × h, px) of two labels' boxes grown by the halo — 0 when they are apart. */
function overlap(a: Lab, b: Lab, at: (l: Lab) => { x: number; y: number } = (l) => l) {
  const pa = at(a);
  const pb = at(b);
  const grow = (l: Lab) => ({ hw: l.w / 2 + LABEL_AIR * l.fontSize, hh: l.h / 2 + LABEL_AIR * l.fontSize });
  const ga = grow(a);
  const gb = grow(b);
  const w = Math.min(pa.x + ga.hw, pb.x + gb.hw) - Math.max(pa.x - ga.hw, pb.x - gb.hw);
  const h = Math.min(pa.y + ga.hh, pb.y + gb.hh) - Math.max(pa.y - ga.hh, pb.y - gb.hh);
  return w > 0 && h > 0 ? w * h : 0;
}
const pairs = <T,>(xs: T[]) => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const));
const worstOverlap = (labs: Lab[], at?: (l: Lab) => { x: number; y: number }) => Math.max(0, ...pairs(labs).map(([a, b]) => overlap(a, b, at)));

const CIRCLE = ['מעגל O', 'A על המעגל O', 'B על המעגל O'];
const REPORTED = [...CIRCLE, 'AB = 7', 'קשת AB = 40 במעגל O'];
const REPORTED_SWAPPED = [...CIRCLE, 'קשת AB = 40 במעגל O', 'AB = 7'];

describe('#2172 — the reported chord and arc: «7» and «40°» are apart', () => {
  for (const [name, lines] of [
    ['as reported', REPORTED],
    ['arc first', REPORTED_SWAPPED],
  ] as const) {
    for (const seed of [0, 1, 2]) {
      it(`${name}, seed ${seed}: no two labels' boxes meet; the arc's value keeps its spot, the chord's yields`, () => {
        const labs = placed([...lines], seed);
        expect(labs.map((l) => l.text).sort()).toEqual(['40°', '7']);
        expect(worstOverlap(labs)).toBe(0);
        const arc = labs.find((l) => l.text === '40°')!;
        const chord = labs.find((l) => l.text === '7')!;
        expect(arc.moved).toBe(false);
        expect(chord.moved).toBe(true);
        // The defect was real: at their own spots the two boxes DID meet (the lock is not vacuous).
        expect(worstOverlap(labs, (l) => l.own)).toBeGreaterThan(0);
      });
    }
  }

  it('the drawing does not depend on the order the facts were typed', () => {
    for (const seed of [0, 1, 2]) {
      const a = placed([...REPORTED], seed);
      const b = placed([...REPORTED_SWAPPED], seed);
      const at = (labs: Lab[], text: string) => labs.find((l) => l.text === text)!;
      for (const text of ['7', '40°']) {
        expect(at(b, text).x).toBeCloseTo(at(a, text).x, 9);
        expect(at(b, text).y).toBeCloseTo(at(a, text).y, 9);
      }
    }
  });
});

describe('#2172 — the class: any two value labels that would land on each other', () => {
  for (const [name, lines, seed] of [
    ['a longer chord «12.5» under the 40° arc', [...CIRCLE, 'AB = 12.5', 'קשת AB = 40 במעגל O'], 0],
    ['a parallelogram’s two stated diagonals at their crossing', ['מקבילית ABCD', 'AC = 8', 'BD = 6'], 2],
    ['a rectangle’s two stated diagonals at their crossing', ['מלבן ABCD', 'AC = 8', 'BD = 8'], 2],
  ] as const) {
    it(`${name} (seed ${seed}): apart`, () => {
      const labs = placed([...lines], seed);
      expect(worstOverlap(labs, (l) => l.own)).toBeGreaterThan(0);
      expect(worstOverlap(labs)).toBe(0);
    });
  }
});

describe('#2172 — a label that covers nothing stays exactly where it was', () => {
  for (const lines of [
    [...CIRCLE, 'AB = 7', 'קשת AB = 120 במעגל O'],
    ['משולש ABC', 'AB = 7', 'זוית C = 170'],
    ['משולש ABC', 'AB = 7', 'BC = 7', 'זוית B = 175'],
    ['משולש ABC', 'AB = 5', 'BC = 6', 'זוית ABC = 40'],
    [...CIRCLE, 'AB = 7', 'קשת AB = 70 במעגל O'],
  ]) {
    it(`«${lines.join(' · ')}»: no label moved`, () => {
      for (const seed of [0, 1, 2]) {
        for (const l of placed(lines, seed)) {
          expect(l.moved, l.text).toBe(false);
          expect(l.x).toBe(l.own.x);
          expect(l.y).toBe(l.own.y);
        }
      }
    });
  }
});

describe('#2172 — the rule itself (synthetic labels)', () => {
  const id = (v: { x: number; y: number }) => ({ x: v.x, y: -v.y }); // world y-up → screen y-down, scale 1
  const len = (text: string, a: { x: number; y: number }, b: { x: number; y: number }, out: { x: number; y: number }): SceneMeasure => ({
    kind: 'length',
    pos: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    dir: out,
    text,
    ends: [a, b],
  });

  it('the priority is by kind: angle > arc > area > length', () => {
    expect(MEASURE_LABEL_PRIORITY.angle).toBeLessThan(MEASURE_LABEL_PRIORITY.arc);
    expect(MEASURE_LABEL_PRIORITY.arc).toBeLessThan(MEASURE_LABEL_PRIORITY.area);
    expect(MEASURE_LABEL_PRIORITY.area).toBeLessThan(MEASURE_LABEL_PRIORITY.length);
  });

  it('two lengths at one anchor: one keeps its spot, the other takes the mirror side of its segment', () => {
    const m1 = len('8', { x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 1 });
    const m2 = len('6', { x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 1 });
    const [p1, p2] = placeMeasureLabels([m1, m2], id, { r: R, fontSize: FONT });
    expect(p1.moved).toBe(false);
    expect(p2.moved).toBe(true);
    expect(p2.x).toBeCloseTo(p1.x, 9);
    expect(p2.y).toBeCloseTo(-p1.y, 9); // mirrored across the segment (y = 0)
  });

  it('a length is never dropped: with every spot covered it takes the least-covered one', () => {
    const seg = [{ x: -100, y: 0 }, { x: 100, y: 0 }] as const;
    const blockers: SceneMeasure[] = [];
    for (let y = -120; y <= 120; y += 6) blockers.push({ kind: 'area', pos: { x: 0, y }, dir: { x: 0, y: 0 }, text: '99' });
    const out = placeMeasureLabels([...blockers, len('7', seg[0], seg[1], { x: 0, y: 1 })], id, { r: R, fontSize: FONT });
    const p = out[out.length - 1];
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(p.fontSize).toBeGreaterThan(0);
  });
});
