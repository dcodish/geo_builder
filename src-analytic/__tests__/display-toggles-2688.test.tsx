/**
 * #2688 (ADR-AG-388) — the canvas switches: the grid, the axis numbers, the point coordinates.
 *
 * Operator, 2026-11-03: *"an option to remove the grid and numbers from the axis and an option to show/hide the
 * coordinates of the points. This will allow teachers to print the shape more like a text book. Of course the save
 * to image/word needs to also follow this."* Scoping answers the same day: all shown by default; saved with the
 * figure and the share link; with the numbers hidden the axis lines and the origin O stay.
 *
 * Locked through the REAL path: the store's switches → `buildScene` → `render/Figure.tsx` markup → the export strip
 * `svgToPng` applies (`shell/export/exportMarkup`), and the real save → load / share link.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';
import { buildScene, pointLabelBox, type Scene } from '../render/scene';
import { Figure } from '../render/Figure';
import { ALL_SHOWN, cleanCanvasDisplay, displayForSave, type CanvasDisplay } from '../render/canvasDisplay';
import { loadAnalyticSession } from '../app/loadSession';
import { openSharedAnalytic } from '../app/shareLinkAn';
import { normalizeForExport, stripNoExport } from '../../shell/export/exportMarkup';

const store = () => useAnalyticStore.getState();

// points with stated coordinates (one partly stated), a circle with a known centre, a line, a stated length
const LINES = ['A(2,3)', 'B(6,1)', 'D(a, 0)', 'נתון מעגל I שמשוואתו (x+3)^2+(y-4)^2=9', 'נתון הישר l1: y=x', 'קטע AB', 'AD = 5'];
const BOX = { minX: -8, minY: -4, maxX: 10, maxY: 9 };

function scene(display?: CanvasDisplay): Scene {
  const d = derive(LINES, 0);
  return buildScene(d.figure, BOX, 600, 600, {
    curveKnown: (id) => knownCurve(d.construction, id) !== null,
    stated: d.stated,
    ...(display ? { display } : {}),
  });
}
const markup = (display?: CanvasDisplay, pick = false) =>
  renderToStaticMarkup(<Figure scene={scene(display)} onPick={pick ? () => {} : undefined} />);
/** What «הורידו תמונה» / «הורידו שאלה» rasterise: the drawn <svg> with its data-noexport chrome removed. */
const exported = (display?: CanvasDisplay) => normalizeForExport(stripNoExport(markup(display, true)));

const gridLines = (m: string) => (m.match(/data-testid="analytic-grid"[^>]*>(.*?)<\/g>/)?.[1].match(/<line/g) ?? []).length;
const axisTexts = (m: string) =>
  [...(m.match(/data-testid="analytic-axis-numbers"[^>]*>(.*?)<\/g>/)?.[1] ?? '').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]);
const off = (k: keyof CanvasDisplay): CanvasDisplay => ({ ...ALL_SHOWN, [k]: false });
const NONE: CanvasDisplay = { grid: false, numbers: false, values: false };

beforeEach(() => {
  store().clearAll();
  store().restore({ lines: [] });
  useAnalyticStore.temporal.getState().clear();
});

describe('#2688 — the subject figure builds', () => {
  it('no faults, and every object the cases read is there', () => {
    const d = derive(LINES, 0);
    expect(d.faults).toEqual([]);
    const s = scene();
    expect(s.points.find((p) => p.id === 'A')?.coords).toBeDefined();
    expect(s.curves.some((c) => c.kind === 'circle' && c.centre?.label)).toBe(true);
    expect(s.curves.some((c) => c.kind === 'line')).toBe(true);
  });
});

describe('#2688 — each switch, alone', () => {
  it('all shown (absent display) is today’s canvas, and equals ALL_SHOWN explicitly', () => {
    expect(markup()).toBe(markup(ALL_SHOWN));
    expect(gridLines(markup())).toBeGreaterThan(0);
    expect(axisTexts(markup()).length).toBeGreaterThan(1);
  });

  it('grid off: no grid lines; the numbers, the axes and the coordinates stay', () => {
    const s = scene(off('grid'));
    expect(s.axes.gridX).toEqual([]);
    expect(s.axes.gridY).toEqual([]);
    expect(s.axes.xTicks.length).toBeGreaterThan(0);
    const m = markup(off('grid'));
    expect(gridLines(m)).toBe(0);
    expect(axisTexts(m)).toEqual(axisTexts(markup()));
    expect(s.points.find((p) => p.id === 'A')?.coords).toBeDefined();
  });

  it('numbers off: no tick labels; the grid, the two axis lines and O stay', () => {
    const s = scene(off('numbers'));
    expect(s.axes.xTicks).toEqual([]);
    expect(s.axes.yTicks).toEqual([]);
    expect(s.axes.gridX).toEqual(scene().axes.gridX);
    const m = markup(off('numbers'));
    expect(axisTexts(m)).toEqual(['O']);
    expect(gridLines(m)).toBe(gridLines(markup()));
    expect(m).toContain(`y1="${s.axes.xAxisY}"`);
    expect(m).toContain(`x1="${s.axes.yAxisX}"`);
  });

  it('values off: every point label is its letter alone, and the centre’s coordinate label goes', () => {
    const s = scene(off('values'));
    for (const p of s.points) expect(p.coords).toBeUndefined();
    expect(s.points.map((p) => p.label)).toEqual(scene().points.map((p) => p.label));
    for (const c of s.curves) expect(c.centre?.label).toBeUndefined();
    // the cross itself stays: a feature of the circle, not a coordinate
    expect(s.curves.some((c) => c.kind === 'circle' && c.centre)).toBe(true);
    const m = markup(off('values'));
    expect(m).not.toContain('<tspan>(</tspan>');
    expect(m).toMatch(/>A<\/text>/);
  });

  it('values off: the labels are re-placed from the SHORTER boxes', () => {
    const on = scene().points.find((p) => p.id === 'A')!;
    const offA = scene(off('values')).points.find((p) => p.id === 'A')!;
    const w = (b: ReturnType<typeof pointLabelBox>) => b.x1 - b.x0;
    expect(w(pointLabelBox(offA))).toBeLessThan(w(pointLabelBox(on)));
  });

  it('the stated length is written while values are shown, and goes with them (operator: "any other data that is added")', () => {
    for (const d of [ALL_SHOWN, off('grid'), off('numbers')]) expect(scene(d).segments.some((sg) => sg.label?.text.includes('5'))).toBe(true);
    for (const d of [off('values'), NONE]) {
      const s = scene(d);
      expect(s.segments.every((sg) => !sg.label)).toBe(true);
      expect(s.stated.labels).toEqual([]);
    }
  });
});

/**
 * THE OPERATOR'S OWN FIGURE (2026-11-03, playing the PR): *"שיעורי הנקודות should also remove the S= and any other data
 * that is added"*. All three unticked, his canvas still wrote «S=18». Locked: the area's value goes, the marks stay, and
 * every value the placement writes (with everything shown) sits clear of every drawn segment.
 */
describe('#2688 — the operator’s figure: «S=18» goes with the values; the marks stay', () => {
  const HIS = ['משולש ABC', 'A(8,-2)', 'משוואת הצלע BC היא x-y+2=0', 'P מפגש תיכונים', 'שיעור ה- x של P הוא 3', 'AD תיכון', 'AE גובה', 'שטח ABC הוא 18'];
  const d = derive(HIS, 0);
  const at = (display: CanvasDisplay) => buildScene(d.figure, d.box, 700, 700, { stated: d.stated, display });
  const html = (display: CanvasDisplay) => normalizeForExport(stripNoExport(renderToStaticMarkup(<Figure scene={at(display)} onPick={() => {}} />)));

  it('builds green', () => expect(d.faults).toEqual([]));

  it('all shown: «S=18» is written; all hidden: it is not, on screen or in the export', () => {
    expect(at(ALL_SHOWN).stated.labels.map((l) => l.text)).toContain('S=18');
    expect(html(ALL_SHOWN)).toContain('S=18');
    expect(at(NONE).stated.labels).toEqual([]);
    expect(html(NONE)).not.toContain('S=18');
    expect(html(off('values'))).not.toContain('S=18');
  });

  it('the MARKS stay with the values hidden (knee, ticks, arcs), and so do the letters', () => {
    expect(at(NONE).stated.marks).toEqual(at(ALL_SHOWN).stated.marks);
    expect(at(NONE).stated.ticks).toEqual(at(ALL_SHOWN).stated.ticks);
    expect(at(NONE).points.map((p) => p.label)).toEqual(at(ALL_SHOWN).points.map((p) => p.label));
  });

  it('every placed value label is clear of every drawn segment (everything shown)', () => {
    const s = at(ALL_SHOWN);
    const F = 12;
    for (const l of s.stated.labels) {
      const hw = (l.text.length * F * 0.6) / 2;
      const b = { x0: l.x - hw, y0: l.y - 0.45 * F, x1: l.x + hw, y1: l.y + 0.6 * F };
      for (const sg of s.segments) expect(segCrossesBox(sg, b), `${l.text} on ${sg.id}`).toBe(false);
    }
  });
});

/** Liang–Barsky: does the segment pass through the box? (The scene's own test, restated so the lock is independent.) */
function segCrossesBox(l: { x1: number; y1: number; x2: number; y2: number }, b: { x0: number; y0: number; x1: number; y1: number }): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  for (const [p, q] of [[-dx, l.x1 - b.x0], [dx, b.x1 - l.x1], [-dy, l.y1 - b.y0], [dy, b.y1 - l.y1]] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

describe('#2688 — the switches combined', () => {
  it.each([
    ['grid + numbers', { grid: false, numbers: false, values: true }],
    ['grid + values', { grid: false, numbers: true, values: false }],
    ['numbers + values', { grid: true, numbers: false, values: false }],
    ['all three', NONE],
  ] as const)('%s off: each hidden part is gone, each shown part stays', (_n, d) => {
    const s = scene(d);
    const m = markup(d);
    expect(gridLines(m) === 0).toBe(!d.grid);
    expect(axisTexts(m)).toEqual(d.numbers ? axisTexts(markup()) : ['O']);
    expect(s.points.find((p) => p.id === 'A')!.coords === undefined).toBe(!d.values);
    // the figure proper is untouched: the same points, curves and segments
    expect(s.points.map((p) => [p.cx, p.cy])).toEqual(scene().points.map((p) => [p.cx, p.cy]));
    expect(s.curves.map((c) => c.d)).toEqual(scene().curves.map((c) => c.d));
    expect(s.segments.map((sg) => sg.id)).toEqual(scene().segments.map((sg) => sg.id));
  });
});

describe('#2688 — the exports follow the switches', () => {
  it('the exported markup (what svgToPng rasterises, for the image and the Word page) has none of the hidden parts', () => {
    const all = exported();
    const none = exported(NONE);
    expect(gridLines(all)).toBeGreaterThan(0);
    expect(gridLines(none)).toBe(0);
    expect(axisTexts(none)).toEqual(['O']);
    expect(none).not.toContain('<tspan>(</tspan>');
    expect(all).toContain('<tspan>(</tspan>');
    // the figure is still drawn
    expect(none).toContain('data-kind="circle"');
    expect(none).toContain('data-kind="line"');
  });

  it('the export is the on-screen render, switch for switch (the strip removes chrome only)', () => {
    for (const d of [off('grid'), off('numbers'), off('values'), NONE]) expect(exported(d)).toBe(normalizeForExport(markup(d)));
  });
});

describe('#2688 — the store: undo, save, load, the share link', () => {
  it('starts all shown; a switch is undoable and redoable', () => {
    store().recordLine('A(2,3)');
    expect(store().display).toEqual(ALL_SHOWN);
    store().setDisplay('grid', false);
    expect(store().display.grid).toBe(false);
    store().undo();
    expect(store().display.grid).toBe(true);
    store().redo();
    expect(store().display.grid).toBe(false);
  });

  it('a save holds only the hidden switches, and loads them back', () => {
    for (const l of LINES) store().recordLine(l);
    store().setDisplay('numbers', false);
    store().setDisplay('values', false);
    const saved = JSON.parse(JSON.stringify(store().serialize()));
    expect(saved.display).toEqual({ numbers: false, values: false });
    store().clearAll();
    store().restore({ lines: [] });
    loadAnalyticSession(saved, 'file');
    expect(store().display).toEqual({ grid: true, numbers: false, values: false });
    expect(store().lines).toEqual(LINES);
  });

  it('all shown writes no field at all (a save from today is byte-identical)', () => {
    for (const l of LINES) store().recordLine(l);
    expect('display' in store().serialize()).toBe(false);
  });

  it('an OLD file with no display field loads all shown', () => {
    store().setDisplay('grid', false);
    loadAnalyticSession({ app: 'analytic-builder', version: 1, lines: ['A(2,3)'], seed: 0 }, 'old');
    expect(store().display).toEqual(ALL_SHOWN);
  });

  it('the share link carries the switches', () => {
    for (const l of LINES) store().recordLine(l);
    store().setDisplay('grid', false);
    const payload = JSON.stringify(store().serialize());
    store().clearAll();
    store().restore({ lines: [] });
    expect(openSharedAnalytic(payload)).toBe(true);
    expect(store().display).toEqual({ grid: false, numbers: true, values: true });
  });

  it('a malformed field cannot hide anything by accident of type', () => {
    expect(cleanCanvasDisplay(undefined)).toEqual(ALL_SHOWN);
    expect(cleanCanvasDisplay('grid')).toEqual(ALL_SHOWN);
    expect(cleanCanvasDisplay({ grid: 0, numbers: 'no', values: null })).toEqual(ALL_SHOWN);
    expect(cleanCanvasDisplay({ values: false })).toEqual({ grid: true, numbers: true, values: false });
    expect(displayForSave(ALL_SHOWN)).toBeUndefined();
  });
});

describe('#2688 — the saved fixture (a textbook-style print) loads with every switch off', () => {
  it('fixtures/display-toggles-textbook-2688 restores the three switches and the figure', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const env = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'display-toggles-textbook-2688.analytic.json'), 'utf8'));
    const { failed } = loadAnalyticSession(env, 'fixture');
    expect(failed).toBe(0);
    expect(store().display).toEqual(NONE);
    expect(store().lines).toEqual(LINES);
  });
});
