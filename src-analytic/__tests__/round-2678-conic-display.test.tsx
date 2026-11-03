/**
 * Round #2678 — the COMBINATION of #1863 (the conic chip's focus/directrix marks, ADR-AG-376) and #2688 (the canvas
 * switches, ADR-AG-388). Each PR was tested alone; this file locks what neither could see:
 *
 * - «הסתר ערכים» hides every value written on the figure (#2688's ruling: "the letters and the MARKS stay"), so a
 *   chip's focus keeps its dot and its letter («F(27/2, 0)» → «F»), and a directrix keeps its line and drops its
 *   equation («x = -27/2»). The canvas and the export read the same scene, so the markup is checked too.
 * - A save carries BOTH records (`annotations` and `display`), a load restores both, and one «בטל» undoes one of them.
 *
 * Every assertion calls the real decisions (`derive`, `conicMarksOf`, `buildScene`, `Figure`, the store).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';
import { conicMarksOf } from '../app/conicMarks';
import { withConic, type AnnotationMap } from '../app/annotations';
import { loadAnalyticSession } from '../app/loadSession';
import { buildScene } from '../render/scene';
import { Figure } from '../render/Figure';
import { ALL_SHOWN, type CanvasDisplay } from '../render/canvasDisplay';
import { useAnalyticStore } from '../store/useAnalyticStore';

const FIX = path.join(__dirname, 'fixtures');
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(FIX, `${name}.analytic.json`), 'utf8')) as { lines: string[]; annotations?: AnnotationMap };
const strip = (s?: string) => s?.replace(/[⁦-⁩]/g, '');
const NO_VALUES: CanvasDisplay = { ...ALL_SHOWN, values: false };
const store = () => useAnalyticStore.getState();

function sceneOf(name: string, box: { minX: number; minY: number; maxX: number; maxY: number }, display?: CanvasDisplay) {
  const fx = fixture(name);
  const d = derive(fx.lines, 0);
  return buildScene(d.figure, box, 600, 600, {
    curveKnown: (id) => knownCurve(d.construction, id) !== null,
    stated: d.stated,
    roleMarks: conicMarksOf(d, fx.annotations!),
    ...(display ? { display } : {}),
  });
}
const PARABOLA_BOX = { minX: -30, minY: -30, maxX: 30, maxY: 30 };
const ELLIPSE_BOX = { minX: -8, minY: -8, maxX: 8, maxY: 8 };

describe('round #2678 — a conic chip on, with the values switched off', () => {
  it('the parabola: the focus dot keeps «F» without its coordinates; the directrix line stays, its equation goes', () => {
    const on = sceneOf('issue-1863-parabola', PARABOLA_BOX);
    const off = sceneOf('issue-1863-parabola', PARABOLA_BOX, NO_VALUES);
    expect(strip(on.roles.foci[0].label?.text)).toBe('F(27/2, 0)');
    expect(strip(on.roles.directrices[0].label?.text)).toBe('x = -27/2');
    // the marks themselves are the same with the values off
    expect(off.roles.foci.map(({ cx, cy }) => [cx, cy])).toEqual(on.roles.foci.map(({ cx, cy }) => [cx, cy]));
    expect(off.roles.directrices.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2])).toEqual(
      on.roles.directrices.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2]),
    );
    expect(strip(off.roles.foci[0].label?.text)).toBe('F');
    expect(off.roles.directrices[0].label).toBeUndefined();
  });

  it('the ellipse: both foci keep their letters, both directrices lose their equations', () => {
    const on = sceneOf('issue-1863-ellipse', ELLIPSE_BOX);
    const off = sceneOf('issue-1863-ellipse', ELLIPSE_BOX, NO_VALUES);
    expect(off.roles.foci).toHaveLength(2);
    expect(off.roles.directrices).toHaveLength(2);
    expect(on.roles.foci.every((f) => /\(/.test(strip(f.label?.text) ?? ''))).toBe(true);
    expect(off.roles.foci.map((f) => strip(f.label?.text))).toEqual(on.roles.foci.map((f) => strip(f.label?.text)?.replace(/\(.*$/, '')));
    expect(off.roles.directrices.every((l) => l.label === undefined)).toBe(true);
  });

  it('a focus on the student\'s own point F writes nothing either way', () => {
    const fx = fixture('issue-1863-student-f');
    const box = { minX: -6, minY: -6, maxX: 6, maxY: 6 };
    const off = sceneOf('issue-1863-student-f', box, NO_VALUES);
    expect(fx.annotations).toBeDefined();
    expect(off.roles.foci.length).toBeGreaterThan(0);
    expect(off.roles.foci.every((f) => f.label === undefined || !/\(/.test(strip(f.label.text) ?? ''))).toBe(true);
  });

  it('the drawn figure (what both exports rasterise) carries no focus or directrix value', () => {
    const html = (display?: CanvasDisplay) => strip(renderToStaticMarkup(<Figure scene={sceneOf('issue-1863-parabola', PARABOLA_BOX, display)} />))!;
    expect(html()).toContain('27/2');
    const off = html(NO_VALUES);
    expect(off).not.toContain('27/2');
    expect(off).toContain('data-testid="analytic-roles"');
  });
});

describe('round #2678 — the save carries the chip AND the switches', () => {
  beforeEach(() => {
    store().clearAll();
    store().restore({ lines: [] });
    useAnalyticStore.temporal.getState().clear();
  });

  it('serialize → load restores both fields; each is its own undo step', () => {
    const fx = fixture('issue-1863-parabola');
    for (const l of fx.lines) store().recordLine(l);
    const id = Object.keys(fx.annotations!)[0];
    store().setAnnotations(withConic(store().annotations, id, 'both'));
    store().setDisplay('values', false);
    store().setDisplay('grid', false);

    const saved = JSON.parse(JSON.stringify(store().serialize()));
    expect(saved.annotations).toEqual({ [id]: { conic: 'both' } });
    expect(saved.display).toEqual({ grid: false, values: false });

    store().clearAll();
    store().restore({ lines: [] });
    expect(store().annotations).toEqual({});
    expect(store().display).toEqual(ALL_SHOWN);

    loadAnalyticSession(saved, 'file');
    expect(store().lines).toEqual(fx.lines);
    expect(store().annotations).toEqual({ [id]: { conic: 'both' } });
    expect(store().display).toEqual({ grid: false, numbers: true, values: false });
  });

  it('one «בטל» puts back the last switch and leaves the chip; the next takes the chip', () => {
    const fx = fixture('issue-1863-parabola');
    for (const l of fx.lines) store().recordLine(l);
    const id = Object.keys(fx.annotations!)[0];
    store().setAnnotations(withConic(store().annotations, id, 'focus'));
    store().setDisplay('values', false);
    store().undo();
    expect(store().display.values).toBe(true);
    expect(store().annotations).toEqual({ [id]: { conic: 'focus' } });
    store().undo();
    expect(store().annotations).toEqual({});
    expect(store().lines).toEqual(fx.lines);
  });
});
