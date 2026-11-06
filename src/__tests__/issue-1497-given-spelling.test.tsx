/**
 * #1497 ([ADR-W-179](../../docs/06w-decisions-workspace.md#adr-w-179)) — A GIVEN PRINTS AS THE STUDENT TYPED IT, in 2-D too.
 *
 * Ruled for every tool, 2026-09-28. Measured at `28dac0c3`: the canvas label already kept the spelling and the values
 * panel's «נתון» rows did not, so one stated number read two ways: «AB = √8» was «√8» on the segment and «2√2» in the
 * panel, «2/3» was «2/3» and «0.67». A decimal reads the house decimals on both (sr-22).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { factsOf } from './scenarios-harness';
import { computeValues, replay } from '@/replay/core';
import { MathValues } from '@/render/MathValue';
import { givenText, readLiteral } from '../../shell/literal';
import { formatMeasure } from '@/format';

const TRI = 'משולש ABC';
const panel = (steps: string[]) => computeValues(factsOf(steps)).rows;
const length = (steps: string[], label = 'AB') => panel(steps).find((r) => r.kind === 'length' && r.label === label);

describe('#1497 — the «נתון» row reads what was typed', () => {
  it.each([
    ['2/3', '2/3'],
    ['√8', '√8'],
    ['√20', '√20'],
    ['2√3', '2√3'],
    ['√5/2', '√5/2'],
    ['4π', '4π'],
  ])('«AB = %s» carries «%s»', (value, text) => {
    expect(length([TRI, `AB = ${value}`])?.given).toBe(text);
  });

  it.each(['0.5', '1.25', '7.9999', '5'])('«AB = %s» has no spelling to keep: the house formatter reads it, as on the canvas', (value) => {
    const r = length([TRI, `AB = ${value}`])!;
    expect(r.given).toBeUndefined();
    expect(r.stated).toBe(true);
  });

  it('an area keeps its spelling too', () => {
    const area = (v: string) => panel([TRI, `שטח המשולש ABC הוא ${v}`]).find((r) => r.kind === 'area');
    expect(area('2/3')?.given).toBe('2/3');
    expect(area('√8')?.given).toBe('√8');
  });

  it('a derived row stays on the tiers: a square’s other side is not the student’s text', () => {
    const rows = panel(['ריבוע ABCD', 'AB = √8']);
    const other = rows.find((r) => r.kind === 'length' && !r.stated);
    expect(other?.given).toBeUndefined();
    expect(rows.find((r) => r.kind === 'length' && r.stated)?.given).toBe('√8');
  });

  it('the row is typeset from the given text, not from the float', () => {
    const r = length([TRI, 'AB = 2/3'])!;
    const html = renderToStaticMarkup(<MathValues row={r} label="AB" or="או" />);
    expect(html).toContain('<math');
    expect(html).not.toContain('0.67');
  });
});

describe('#1497 — the canvas and the shared reader agree', () => {
  it.each(['2/3', '√8', '6√5', '√5/2', '0.5', '1.25', '7.9999', '4'])('«AB = %s»: the label is the shared given text', (value) => {
    const lit = readLiteral(value)!;
    const label = replay(factsOf([TRI, `AB = ${value}`]), 0).labels.lengths[0].text;
    expect(label).toBe(givenText(lit.value, lit.src, formatMeasure));
  });
});
