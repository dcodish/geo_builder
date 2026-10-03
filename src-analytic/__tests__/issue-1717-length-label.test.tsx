/**
 * #1717 (ADR-AG-223) — a stated length is written where it can be read.
 *
 * Operator, corpus 9/4 (T6 of the 2026-10-03 sheet): *"AO=3 is not created"*. It was — A(−3,0), AO = 3 — but AO lies
 * on the x-axis and its «3» was written at the segment's midpoint 6px up, inside A's own label: the canvas read
 * «A(x_A, 0)3». The class: a length label was placed with no knowledge of the other labels. 2-D's value-label rule
 * (midpoint, outward from the figure) is copied into `placeLengthLabels`, which then steps the label along the normal
 * until it clears every point label, point dot, axis tick label and earlier length label.
 *
 * The locks read the DRAWN markup (`<Figure>` rendered), so they judge what the student sees, through the real
 * scene → paint path; the label boxes are estimated here independently (0.6 em per glyph), as an oracle.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { derive } from '../engine/derive';
import { buildScene } from '../render/scene';
import { Figure } from '../render/Figure';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
type Box = { x0: number; y0: number; x1: number; y1: number; what: string };

const num = (attrs: string, name: string): number | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}="(-?[\\d.]+)(em)?"`).exec(attrs);
  return m ? Number(m[1]) : undefined;
};
const plain = (inner: string) => inner.replace(/<[^>]+>/g, '').replace(/[\u2066-\u2069]/g, '').replace(/&#x27;/g, "'");

/** Every <text> the figure paints, as a box: baseline from y (+ dy em), height and width from the font size. */
function textBoxes(markup: string): Box[] {
  const out: Box[] = [];
  // the group a text sits in may carry its font size / anchor; track the nearest enclosing <g> attributes
  const re = /<(g|text)\b([^>]*)>|<\/(g|text)>/g;
  const stack: Array<{ size?: number; anchor?: string }> = [];
  let m: RegExpExecArray | null;
  let open: { attrs: string; start: number; size?: number; anchor?: string } | null = null;
  while ((m = re.exec(markup))) {
    if (m[1] === 'g') {
      const parent = stack.at(-1) ?? {};
      stack.push({ size: num(m[2], 'font-size') ?? parent.size, anchor: /text-anchor="(\w+)"/.exec(m[2])?.[1] ?? parent.anchor });
    } else if (m[3] === 'g') stack.pop();
    else if (m[1] === 'text') {
      const parent = stack.at(-1) ?? {};
      open = { attrs: m[2], start: re.lastIndex, size: num(m[2], 'font-size') ?? parent.size, anchor: /text-anchor="(\w+)"/.exec(m[2])?.[1] ?? parent.anchor };
    } else if (m[3] === 'text' && open) {
      const inner = markup.slice(open.start, m.index);
      const text = plain(inner);
      const f = open.size ?? 12;
      const x = num(open.attrs, 'x')!;
      const base = num(open.attrs, 'y')! + (num(open.attrs, 'dy') ?? 0) * f;
      const w = text.length * f * 0.6;
      const x0 = open.anchor === 'middle' ? x - w / 2 : open.anchor === 'end' ? x - w : x;
      const who = /data-length-for="([^"]+)"/.exec(open.attrs)?.[1];
      out.push({ x0, x1: x0 + w, y0: base - f * 0.8, y1: base + f * 0.25, what: who ? `len:${who}` : text });
      open = null;
    }
  }
  return out;
}
const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function drawn(lines: readonly string[], seed: number) {
  const d = derive(lines, seed);
  expect(d.faults, `${lines.join(' · ')} @${seed}`).toEqual([]);
  // the app's own hand-off (#1714): the stated lengths come from `Derivation.stated`, as `App.tsx` passes them
  const scene = buildScene(d.figure, d.box, 800, 600, { stated: d.stated });
  const markup = renderToStaticMarkup(<Figure scene={scene} />);
  return { scene, markup, boxes: textBoxes(markup) };
}

/** The figure's inked segments, read off the markup. */
function inkLines(markup: string): Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> {
  return [...markup.matchAll(/<line\b([^>]*data-ink="(?:solid|dashed)"[^>]*)>/g)].map((m) => ({
    id: /data-id="([^"]+)"/.exec(m[1])![1],
    x1: num(m[1], 'x1')!,
    y1: num(m[1], 'y1')!,
    x2: num(m[1], 'x2')!,
    y2: num(m[1], 'y2')!,
  }));
}
/** Does the segment pass through the box? Sampled densely — an oracle, independent of the scene's clipping. */
const through = (l: { x1: number; y1: number; x2: number; y2: number }, b: Box) => {
  for (let i = 0; i <= 400; i += 1) {
    const x = l.x1 + ((l.x2 - l.x1) * i) / 400;
    const y = l.y1 + ((l.y2 - l.y1) * i) / 400;
    if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
  }
  return false;
};

/** Every length label's box against every OTHER text the canvas paints (point labels, ticks, other lengths) and every inked segment. */
function collisions(boxes: Box[], markup: string): string[] {
  const out: string[] = [];
  const lines = inkLines(markup);
  for (const l of boxes.filter((b) => b.what.startsWith('len:'))) {
    for (const o of boxes) if (o !== l && hit(l, o)) out.push(`${l.what} × ${o.what}`);
    for (const g of lines) if (through(g, l)) out.push(`${l.what} × line ${g.id}`);
  }
  return out;
}

const corpus: { id: string; lines: string[] }[] = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'),
);
const q94 = corpus.find((x) => x.id === '9/4')!.lines;

describe('#1717 — corpus 9/4: AO = 3 is drawn and its «3» is readable', () => {
  it.each(SEEDS)('seed %i: the «3» clears A’s label, every other label and every tick', (seed) => {
    const { boxes, markup } = drawn(q94, seed);
    const len = boxes.filter((b) => b.what === 'len:seg-AO');
    expect(len).toHaveLength(1);
    expect(boxes.some((b) => b.what.startsWith('A('))).toBe(true);
    expect(inkLines(markup).map((l) => l.id).sort()).toEqual(['poly-ABCD-0', 'poly-ABCD-1', 'poly-ABCD-2', 'poly-ABCD-3', 'seg-AO']);
    expect(collisions(boxes, markup)).toEqual([]);
  });

  it.each(SEEDS)('seed %i: AO is inked in the figure’s stroke, painted over the axes', (seed) => {
    const { markup, scene } = drawn(q94, seed);
    const ao = scene.segments.find((s) => s.id === 'seg-AO')!;
    expect(ao.ink).toBe('solid');
    expect(Math.abs(ao.y1 - scene.axes.xAxisY)).toBeLessThan(1e-3); // it really lies on the axis
    const axisAt = markup.indexOf(`y1="${scene.axes.xAxisY}"`);
    const segAt = markup.indexOf('data-id="seg-AO"');
    expect(axisAt).toBeGreaterThan(-1);
    expect(segAt).toBeGreaterThan(axisAt); // later in the SVG = on top
    // the figure's ink group: the same stroke and weight as the polygon's sides
    const groupOf = (i: number) => markup.slice(markup.lastIndexOf('<g ', i), i);
    expect(groupOf(segAt)).toMatch(/stroke="#2563eb" stroke-width="2"/);
  });

  it('the label does not flip sides between configurations of one figure (AO straddled by the figure has no outside)', () => {
    const ys = new Set(SEEDS.map((seed) => Math.round(drawn(q94, seed).scene.segments.find((s) => s.id === 'seg-AO')!.label!.y)));
    expect(ys.size).toBe(1);
  });
});

describe('#1717 — the class: a length label clears every other label', () => {
  it.each(SEEDS)('seed %i: a short stated side between two coordinate-labelled points', (seed) => {
    const { boxes, markup } = drawn(['A(0,0)', 'B(1,0)', 'C(0,6)', 'משולש ABC', 'AB = 1'], seed);
    expect(boxes.filter((b) => b.what.startsWith('len:'))).toHaveLength(1);
    expect(collisions(boxes, markup)).toEqual([]);
  });

  it.each(SEEDS)('seed %i: a vertical stated side on the y-axis', (seed) => {
    const { boxes, markup } = drawn(['A(0,0)', 'B(0,1)', 'C(6,0)', 'משולש ABC', 'AB = 1'], seed);
    expect(boxes.some((b) => b.what.startsWith('len:'))).toBe(true);
    expect(collisions(boxes, markup)).toEqual([]);
  });

  it.each(SEEDS)('seed %i: three stated sides — the length labels clear each other and the point labels', (seed) => {
    const { boxes, markup } = drawn(['משולש ABC', 'AB = 2', 'BC = 2', 'AC = 2'], seed);
    expect(boxes.filter((b) => b.what.startsWith('len:'))).toHaveLength(3);
    expect(collisions(boxes, markup)).toEqual([]);
  });
});
