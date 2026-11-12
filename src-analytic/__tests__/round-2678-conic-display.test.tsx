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
import { conicMarksOf, focusSentenceOf } from '../app/conicMarks';
import { withConic, type AnnotationMap } from '../app/annotations';
import { loadAnalyticSession } from '../app/loadSession';
// #2709: the chip's cycle per kind
import { conicChips } from '../app/conicMarks';
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

  it('the ellipse: both foci keep their letters, without their coordinates; an ellipse draws no directrix (#2709)', () => {
    const on = sceneOf('issue-1863-ellipse', ELLIPSE_BOX);
    const off = sceneOf('issue-1863-ellipse', ELLIPSE_BOX, NO_VALUES);
    expect(off.roles.foci).toHaveLength(2);
    expect(on.roles.directrices).toHaveLength(0);
    expect(off.roles.directrices).toHaveLength(0);
    expect(on.roles.foci.every((f) => /\(/.test(strip(f.label?.text) ?? ''))).toBe(true);
    expect(off.roles.foci.map((f) => strip(f.label?.text))).toEqual(on.roles.foci.map((f) => strip(f.label?.text)?.replace(/\(.*$/, '')));
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

describe('#2709 (ADR-AG-466) — an ellipse shows its foci only (operator 2026-11-04: "foci only for ellipse.")', () => {
  const ELLIPSE = ['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1'];
  const PARABOLA = ['נתונה פרבולה שמשוואתה y^2=54x'];
  const chipOf = (lines: string[], map: AnnotationMap) => {
    const d = derive(lines, 0);
    return { d, chip: conicChips(d, map)[0] };
  };

  it('the ellipse chip cycles nothing → foci → nothing; the parabola keeps its four states', () => {
    const { d, chip } = chipOf(ELLIPSE, {});
    expect([chip.state, chip.next]).toEqual(['none', 'focus']);
    const on = conicChips(d, withConic({}, chip.id, chip.next))[0];
    expect([on.state, on.next]).toEqual(['focus', 'none']);
    const p = chipOf(PARABOLA, {});
    const seen: string[] = [];
    let map: AnnotationMap = {};
    for (let i = 0; i < 4; i++) {
      const c = conicChips(p.d, map)[0];
      seen.push(c.next);
      map = withConic(map, c.id, c.next);
    }
    expect(seen).toEqual(['directrix', 'focus', 'both', 'none']);
  });

  it('a saved «both» on an ellipse loads as foci (two dots, no directrix), and the file is not rewritten', () => {
    store().clearAll();
    for (const l of ELLIPSE) store().recordLine(l);
    const { chip } = chipOf(ELLIPSE, {});
    const saved = { ...JSON.parse(JSON.stringify(store().serialize())), annotations: { [chip.id]: { conic: 'both' } } };
    store().clearAll();
    loadAnalyticSession(saved, 'file');
    expect(store().annotations).toEqual({ [chip.id]: { conic: 'both' } });
    const d = derive(store().lines, 0);
    const read = conicChips(d, store().annotations)[0];
    expect([read.state, read.next]).toEqual(['focus', 'none']);
    expect(conicMarksOf(d, store().annotations).map((m) => m.kind)).toEqual(['focus', 'focus']);
  });

  it('a saved «directrix» on an ellipse reads as nothing shown; on a parabola it still draws the directrix', () => {
    const { d, chip } = chipOf(ELLIPSE, {});
    const map: AnnotationMap = { [chip.id]: { conic: 'directrix' } };
    const read = conicChips(d, map)[0];
    expect([read.state, read.next]).toEqual(['none', 'focus']);
    expect(conicMarksOf(d, map)).toEqual([]);
    const p = chipOf(PARABOLA, {});
    expect(conicMarksOf(p.d, { [p.chip.id]: { conic: 'directrix' } }).map((m) => m.kind)).toEqual(['directrix']);
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

describe('#2851 (ADR-AG-465) — focusSentenceOf: the sentence a click on a shown focus records', () => {
  it('names the side the focus sits on, in plain digits; a parabola its one focus; a stale offer nothing', () => {
    const fx = fixture('issue-1863-ellipse');
    const d = derive(fx.lines, 0);
    const id = Object.keys(fx.annotations!)[0];
    expect(focusSentenceOf(d, `focus:0:${id}`, 'F₁')).toBe('F1 מוקד ימני של האליפסה');
    expect(focusSentenceOf(d, `focus:1:${id}`, 'F₂')).toBe('F2 מוקד שמאלי של האליפסה');
    expect(focusSentenceOf(d, 'focus:0:no-such-curve', 'F')).toBeNull();
    const p = fixture('issue-1863-parabola');
    const dp = derive(p.lines, 0);
    expect(focusSentenceOf(dp, `focus:0:${Object.keys(p.annotations!)[0]}`, 'F')).toBe('F מוקד הפרבולה');
    // the mark carries the same sentence as its offer
    expect(conicMarksOf(d, { [id]: { conic: 'focus' } }).map((m) => (m.kind === 'focus' ? m.offer?.title : null))).toEqual([
      'F1 מוקד ימני של האליפסה',
      'F2 מוקד שמאלי של האליפסה',
    ]);
  });
});
