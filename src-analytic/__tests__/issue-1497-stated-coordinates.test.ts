/**
 * #1497 ([ADR-AG-413](../../docs/06c-decisions-analytic.md#adr-ag-413)) — A STATED COORDINATE PRINTS AS TYPED.
 *
 * Ruled for every tool, 2026-09-28: a given prints as the student typed it, and a derived value reads the tiers.
 * Measured at `28dac0c3`: «A(0.5,2/3)» read «A(1/2, 2/3)» and «A(√8,1.25)» read «A(2√2, 5/4)», in the panel and on
 * the canvas. A decimal reads the house decimals (sr-22, ADR-W-175).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { buildScene } from '../render/scene';
import { panelKnowledge } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { fmtAnalytic } from '../format';

const row = (lines: string[], id: string) => {
  const d = derive(lines, 0);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  const p = panelKnowledge(d).points.find((q) => q.id === id)!;
  return pointText(d, id, p.x, p.y, fmtAnalytic);
};
const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');

describe('#1497 — the panel row', () => {
  it.each([
    ['A(0.5,2/3)', '(0.5, 2/3)'],
    ['A(√8,1.25)', '(√8, 1.25)'],
    ['A(1/2,0.5)', '(1/2, 0.5)'],
    ['A(4/6,3)', '(4/6, 3)'],
    ['A(2√3,-√2)', '(2√3, -√2)'],
    ['A(7.9999,1)', '(8, 1)'], // sr-22
  ])('«%s» reads «%s»', (line, text) => {
    expect(row([line], 'A')).toBe(text);
  });

  it('a value the figure fixed reads the tiers: a midpoint is no given', () => {
    expect(row(['A(0,0)', 'B(1,0)', 'M אמצע AB'], 'M')).toBe('(1/2, 0)');
  });

  it('a coordinate through a letter the student valued keeps the printer it had', () => {
    expect(row(['t = 0.5', 'A(2t,1)'], 'A')).toMatch(/^\(1, 1\)$/);
  });
});

describe('#1497 — the canvas label reads the same text', () => {
  it('«A(0.5,2/3)» is drawn as (0.5, 2/3)', () => {
    const d = derive(['A(0.5,2/3)'], 0);
    const s = buildScene(d.figure, d.box, 600, 400, { stated: d.stated });
    expect(JSON.stringify(s.points.map((p) => p)).replace(/[⁦-⁩]/g, '')).toContain('"text":"0.5"');
    expect(strip(JSON.stringify(s.points))).toContain('"text":"2/3"');
  });
});
