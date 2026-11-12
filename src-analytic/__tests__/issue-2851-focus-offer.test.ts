/**
 * #2851 (ADR-AG-465) — a SHOWN FOCUS IS CLICKABLE: the click names it, through the typed sentence.
 *
 * Operator, 2026-11-12: *"I'm trying to create a triangle where the base is F1 and F2. drawing the ellipse and pressing
 * show מוקדים shows where F1 and F2 are but when i try to write the triangle using F1 and F2 it doesnt recognize these
 * points."* Ruling, the same day: *"make the focus points clickable so he can nail them on the diagram. if he doesnt,
 * the behavior is like today."*
 *
 * pipeline-lock: the regression is a CLICK — the offer the scene hands the canvas, the popover's callback, the row it
 * records — which a fixture (lines only) cannot express. The lines the clicks record are ALSO a fixture
 * (`ellipse-foci-triangle-2851`), so the figure they build stays on the fixtures net.
 *
 * Driven as App drives it: the chip state in the store's annotation map, `conicMarksOf` → `buildScene` (the offer the
 * renderer draws), the rendered `Figure` markup (the hit target), `focusPopoverOps` over the REAL store
 * (`commitRecord` → `recordLine`), then re-derived.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';
import { conicMarksOf, focusSentenceOf } from '../app/conicMarks';
import { withConic } from '../app/annotations';
import { focusPopoverOps } from '../app/centreName';
import { commitRecord } from '../app/submit';
import { buildScene } from '../render/scene';
import { Figure } from '../render/Figure';

const store = () => useAnalyticStore.getState();
const current = () => derive(store().lines, store().seed, store().seedNames);
const state = () => {
  const s = store();
  return { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames, segStyle: s.segStyle, annotations: s.annotations };
};
const t = (k: string) => k;
const SQRT2 = Math.SQRT2;

function build(lines: string[]) {
  store().clearAll();
  for (const l of lines) store().recordLine(l);
  useAnalyticStore.temporal.getState().clear();
}

/** Press the conic chip to «focus» on the figure's one stated conic. */
function showFoci() {
  const d = current();
  const id = d.figure.curves.find((c) => c.stated && (c.curve.kind === 'ellipse' || c.curve.kind === 'parabola'))!.id;
  store().setAnnotations(withConic(store().annotations, id, 'focus'));
}

/** The focus offers the canvas draws now — through the scene, as the renderer reads them. */
function offers() {
  const d = current();
  const scene = buildScene(d.figure, { minX: -8, minY: -8, maxX: 8, maxY: 8 }, 600, 600, {
    curveKnown: (id) => knownCurve(d.construction, id) !== null,
    stated: d.stated,
    roleMarks: conicMarksOf(d, store().annotations),
  });
  return { scene, offers: scene.roles.foci.flatMap((f) => (f.offer ? [f.offer] : [])) };
}

/** Click the offer whose letter is `book`, confirm the popover with `typed` (default: the letter it opens on). */
function click(book: string, typed?: string) {
  const o = offers().offers.find((x) => x.letter === book);
  if (!o) throw new Error(`no focus offer ${book} on the canvas`);
  const ops = focusPopoverOps(o.id, state(), { record: (v) => commitRecord(v, store().recordLine, t), setError: store().setError }, current());
  return ops.onRename(o.letter, typed ?? o.letter);
}

const at = (id: string) => current().figure.points.find((p) => p.id === id);

beforeEach(() => build([]));

describe('#2851 — a shown focus is clickable, and the click records the typed sentence', () => {
  it('the operator’s figure: 7x²+9y²=63, foci on, click F₁ and F₂, «משולש F1F2D» uses the foci', () => {
    build(['7x^2+9y^2=63']);
    // without the chip: no offer
    expect(offers().offers).toEqual([]);
    showFoci();
    const { scene, offers: os } = offers();
    expect(os.map((o) => o.letter)).toEqual(['F1', 'F2']);
    // the renderer draws a hit target per offer, with the sentence as its hover — only when a caller listens
    const markup = renderToStaticMarkup(createElement(Figure, { scene, onFocus: () => {} }));
    expect(markup.match(/data-focus-offer=/g)?.length).toBe(2);
    expect(markup).toContain('F1 מוקד ימני של האליפסה');
    expect(renderToStaticMarkup(createElement(Figure, { scene }))).not.toContain('data-focus-offer');

    expect(click('F1')).toEqual({ ok: true });
    expect(click('F2')).toEqual({ ok: true });
    store().recordLine('משולש F1F2D');
    expect(store().lines).toEqual(['7x^2+9y^2=63', 'F1 מוקד ימני של האליפסה', 'F2 מוקד שמאלי של האליפסה', 'משולש F1F2D']);
    expect(at('F₁')!.x).toBeCloseTo(SQRT2, 9);
    expect(at('F₁')!.y).toBeCloseTo(0, 9);
    expect(at('F₂')!.x).toBeCloseTo(-SQRT2, 9);
    // the named foci hold their places: no offer is left, and hiding the chip does not move them
    expect(offers().offers).toEqual([]);
    store().setAnnotations({});
    expect(at('F₁')!.x).toBeCloseTo(SQRT2, 9);
  });

  it('without a click nothing changes: «משולש F1F2D» builds on two new free points, as today', () => {
    build(['7x^2+9y^2=63']);
    showFoci();
    store().recordLine('משולש F1F2D');
    expect(store().lines).toEqual(['7x^2+9y^2=63', 'משולש F1F2D']);
    expect(Math.abs(Math.abs(at('F₁')!.x) - SQRT2) > 1e-6 || Math.abs(at('F₁')!.y) > 1e-6).toBe(true);
  });

  it('a y-axis ellipse records «עליון» / «תחתון»', () => {
    build(['9x^2+7y^2=63']);
    showFoci();
    expect(click('F1')).toEqual({ ok: true });
    expect(click('F2')).toEqual({ ok: true });
    expect(store().lines.slice(1)).toEqual(['F1 מוקד עליון של האליפסה', 'F2 מוקד תחתון של האליפסה']);
    expect(at('F₁')!.y).toBeCloseTo(SQRT2, 9);
    expect(at('F₂')!.y).toBeCloseTo(-SQRT2, 9);
  });

  it('a parabola’s F records «F מוקד הפרבולה»', () => {
    build(['y^2=8x']);
    showFoci();
    expect(click('F')).toEqual({ ok: true });
    expect(store().lines).toEqual(['y^2=8x', 'F מוקד הפרבולה']);
    expect(at('F')!.x).toBeCloseTo(2, 9);
  });

  it('another letter typed in the popover names the focus by it', () => {
    build(['7x^2+9y^2=63']);
    showFoci();
    expect(click('F2', 'k')).toEqual({ ok: true });
    expect(store().lines.at(-1)).toBe('K מוקד שמאלי של האליפסה');
    expect(at('K')!.x).toBeCloseTo(-SQRT2, 9);
  });

  it('a letter already in use is refused, its holder quoted, nothing recorded', () => {
    build(['7x^2+9y^2=63', 'D(1,1)']);
    showFoci();
    const out = click('F1', 'D');
    expect(out).toMatchObject({ ok: false, reason: 'taken', holder: { text: 'D(1,1)' } });
    expect(store().lines).toEqual(['7x^2+9y^2=63', 'D(1,1)']);
  });

  it('a book letter the student already used: the mark has no letter, so no offer (sr-07)', () => {
    build(['7x^2+9y^2=63', 'F1(5,5)']);
    showFoci();
    expect(offers().offers.map((o) => o.letter)).toEqual(['F2']);
  });

  it('two ellipses: the sentence cannot bind «האליפסה», so neither offers', () => {
    build(['7x^2+9y^2=63', 'x^2/25+y^2/9=1']);
    const d = current();
    const all = Object.fromEntries(d.figure.curves.filter((c) => c.stated).map((c) => [c.id, { conic: 'focus' as const }]));
    store().setAnnotations(all);
    expect(offers().offers).toEqual([]);
    expect(focusSentenceOf(current(), `focus:0:${d.figure.curves[0].id}`, 'F1')).toBeNull();
  });
});
