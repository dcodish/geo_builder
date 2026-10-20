/**
 * #2238 — clicking a LINE, a CIRCLE or a canonical CONIC opens the shared segment menu (ADR-AG-297).
 *
 * Operator, 2026-10-16: *"in 2d, i can click a line and hide it or make it dashed but in analytics i cant and
 * this is needed"*; ruling the same day: a parabola / ellipse gets both toggles, as a line does. A circle gets
 * hide/show alone (2-D's circle menu).
 *
 * The line, parabola and ellipse are held to the SAME cross-product contract the segments are
 * (`shell/__tests__/fixtures/segment-display-rows.ts`), through the REAL store toggles App wires to the
 * menu, the REAL canvas (`buildScene` → `render/Figure.tsx`, read off its markup), the real measure path
 * (`measurablesOf`), the store's undo and the real save → load. The circle has its own hide-only rows.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { buildScene, curveInk } from '../render/scene';
import { Figure } from '../render/Figure';
import { measurablesOf } from '../app/measurable';
import { loadAnalyticSession } from '../app/loadSession';
import { dispatchRename } from '../app/rename';
import { curveMenuOf } from '../app/curveDisplay';
import { segmentMenuItems } from '../../shell/frame/segmentDisplay';
import { segmentDisplayFaults, type InkSeen } from '../../shell/__tests__/fixtures/segment-display-rows';

const store = () => useAnalyticStore.getState();
const current = () => derive(store().lines, store().seed, store().seedNames);

function build(lines: string[]) {
  store().clearAll();
  for (const l of lines) store().recordLine(l);
  useAnalyticStore.temporal.getState().clear();
}

/** The one stated curve of the session's figure (the subjects below state exactly one). */
const curveId = (): string => {
  const cs = current().figure.curves.filter((c) => c.stated);
  expect(cs.length).toBe(1);
  return cs[0].id;
};

function markup(withPick = true): string {
  const d = current();
  const scene = buildScene(d.figure, d.box, 600, 600, { segStyle: store().segStyle, curveStyle: store().curveStyle });
  return renderToStaticMarkup(<Figure scene={scene} onPick={withPick ? () => {} : undefined} />);
}

function inkOf(id: string): InkSeen {
  const m = markup().match(new RegExp(`data-id="${id}" data-ink="(\\w+)"`));
  return (m?.[1] as InkSeen | undefined) ?? 'absent';
}

const subject = (lines: string[]) => ({
  setup: () => build(lines),
  toggleHidden: () => store().toggleCurveHidden(curveId()),
  toggleDashed: () => store().toggleCurveDashed(curveId()),
  ink: () => inkOf(curveId()),
  // the contract's "still there": the curve is still a drawn curve of the figure (every crossing, question and
  // answer reads it there). Not every curve has a measure entry, so the menu's entries have their own row below.
  measurable: () => current().figure.curves.some((c) => c.stated && c.id === curveId()),
  statements: () => [...store().lines],
  undo: () => store().undo(),
  saveLoad: () => {
    const saved = JSON.parse(JSON.stringify(store().serialize()));
    store().clearAll();
    loadAnalyticSession(saved, 'file');
  },
});

beforeEach(() => {
  store().clearAll();
  useAnalyticStore.temporal.getState().clear();
});

describe('#2238 — a line, parabola or ellipse conforms to the shared segment-display contract', () => {
  it.each([
    ['a named line', ['נתון הישר l1: 4y-3x-20=0']],
    ['an anonymous line', ['הישר y=x']],
    ['a line through two points', ['A(0,0)', 'B(4,3)', 'הישר AB']],
    ['a parabola', ['נתונה פרבולה שמשוואתה y^2=8x']],
    ['an ellipse', ['נתונה אליפסה שמשוואתה x^2/9+y^2/16=1']],
  ])('%s', (_name, lines) => {
    expect(segmentDisplayFaults(subject(lines))).toEqual([]);
  });
});

describe('#2238 — the curve menu: what a click offers', () => {
  it.each([
    ['נתון הישר l1: 4y-3x-20=0', 'line', true],
    ['נתונה פרבולה שמשוואתה y^2=8x', 'parabola', true],
    ['נתונה אליפסה שמשוואתה x^2/9+y^2/16=1', 'ellipse', true],
    ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'circle', false],
  ] as const)('%s → %s, dashed offered: %s', (line, kind, dash) => {
    build([line]);
    const m = curveMenuOf(current().figure, curveId());
    expect(m).toMatchObject({ kind, dash });
    // what the shared menu then lists — the function `SegmentMenu` renders from
    expect(segmentMenuItems({}, { hide: true, dash: m!.dash }).map((i) => i.label)).toEqual(dash ? ['hide', 'dashed'] : ['hide']);
  });

  it('the menu is titled by the curve’s name, or its equation when it has none', () => {
    build(['נתון הישר l1: 4y-3x-20=0']);
    expect(curveMenuOf(current().figure, curveId())!.title).toMatch(/l\s*1|ℓ/);
    // A declared line the student did not name carries the tool's l1 since #2425 (ADR-AG-319, ruling Q4).
    build(['הישר y=x']);
    expect(curveMenuOf(current().figure, curveId())!.title).toMatch(/l\s*1|ℓ/);
  });

  it('a point or a segment id opens no curve menu', () => {
    build(['A(0,0)', 'B(4,3)', 'הקטע AB']);
    expect(curveMenuOf(current().figure, 'A')).toBeNull();
  });

  it('the line keeps its measure entries beside the display toggles', () => {
    build(['נתון הישר l1: 4y-3x-20=0']);
    const before = measurablesOf(current().construction, { kind: 'curve', id: curveId() });
    expect(before.length).toBeGreaterThan(0);
    store().toggleCurveHidden(curveId());
    expect(measurablesOf(current().construction, { kind: 'curve', id: curveId() })).toEqual(before);
  });
});

describe('#2238 — a circle hides and shows (2-D’s circle menu)', () => {
  const CIRCLE = ['נתון מעגל שמרכזו (2,3) ורדיוסו 5'];

  it('hidden, it draws nothing — no ink, no centre cross — while its hit target stays', () => {
    build(CIRCLE);
    const id = curveId();
    expect(inkOf(id)).toBe('solid');
    expect(markup()).toContain(`data-centre="${id}"`);
    store().toggleCurveHidden(id);
    expect(inkOf(id)).toBe('absent');
    const html = markup();
    expect(html).not.toContain(`data-centre="${id}"`);
    expect(html).toContain('style="cursor:pointer"'); // the transparent hit path is still there to click
    store().toggleCurveHidden(id);
    expect(inkOf(id)).toBe('solid');
  });

  it('one undo restores it, and a hidden circle survives save → load', () => {
    build(CIRCLE);
    const id = curveId();
    store().toggleCurveHidden(id);
    store().undo();
    expect(inkOf(id)).toBe('solid');
    store().toggleCurveHidden(id);
    const saved = JSON.parse(JSON.stringify(store().serialize()));
    store().clearAll();
    loadAnalyticSession(saved, 'file');
    expect(inkOf(curveId())).toBe('absent');
    expect(store().lines).toEqual(CIRCLE);
  });

  it('a dash flag on a circle (a hand-edited file) is ignored, never drawn', () => {
    expect(curveInk('circle', { dashed: true })).toBe('solid');
    expect(curveInk('circle', { hidden: true, dashed: true })).toBe('none');
    expect(curveInk('line', { dashed: true })).toBe('dashed');
    expect(curveInk('line', { hidden: true })).toBe('ghost');
  });
});

describe('#2238 — a curve’s display follows its session', () => {
  it('a hidden line’s ghost is interaction chrome: marked no-export, and absent from a read-only canvas', () => {
    build(['נתון הישר l1: 4y-3x-20=0']);
    const id = curveId();
    store().toggleCurveHidden(id);
    expect(markup()).toMatch(new RegExp(`data-id="${id}" data-ink="ghost" data-noexport="1"`));
    expect(markup(false)).not.toContain(`data-id="${id}" data-ink`);
  });

  it('a rename carries a hidden circle to its relabelled id, and one undo puts both back', () => {
    build(['נתון מעגל שמרכזו O(2,3) ורדיוסו 5']);
    const before = curveId();
    store().toggleCurveHidden(before);
    const s = store();
    const state = { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames, segStyle: s.segStyle, curveStyle: s.curveStyle };
    const v = dispatchRename('O', 'K', state, { applyRename: store().applyRename, setError: store().setError }, current());
    expect(v.kind).toBe('apply');
    const after = curveId();
    expect(store().curveStyle).toEqual({ [after]: { hidden: true } });
    expect(inkOf(after)).toBe('absent');
    store().undo();
    expect(store().curveStyle).toEqual({ [before]: { hidden: true } });
  });

  it('«נקה הכל» clears the curve display choices with the figure', () => {
    build(['הישר y=x']);
    store().toggleCurveDashed(curveId());
    store().clearAll();
    expect(store().curveStyle).toEqual({});
  });

  it('a hand-edited save cannot inject anything but hidden/dashed flags', () => {
    loadAnalyticSession({ app: 'analytic-builder', version: 1, lines: ['הישר y=x'], seed: 0, curveStyle: { 'line-l': { hidden: true, colour: 'red' }, x: 'y' } }, 'f');
    expect(store().curveStyle).toEqual({ 'line-l': { hidden: true } });
  });

  it('a save from before #2238 (no curveStyle) loads with every curve solid', () => {
    loadAnalyticSession({ app: 'analytic-builder', version: 1, lines: ['הישר y=x'], seed: 0 }, 'f');
    expect(store().curveStyle).toEqual({});
    expect(inkOf(curveId())).toBe('solid');
  });
});
