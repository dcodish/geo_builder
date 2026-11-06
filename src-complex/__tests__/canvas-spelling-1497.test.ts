/**
 * #1497 (ADR-W-179) — A NUMBER TYPED WITH NO PARAMETER READS AS TYPED ON THE CANVAS, in the view it was typed in.
 *
 * Ruled for every tool, 2026-09-28; D1 (ADR-CX-065) already says a typed number shows as typed in the view's own form.
 * Measured at `28dac0c3`: «z = 0.5+1.25i» read «z = 1/2+(5/4)i», «z = √8» read «z = 2√2», «z = 7.9999» read
 * «z = 79999/10000». The rows are the student's lines and always kept the spelling; the panel's readings do not change.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

function point(lines: string[], name = 'z') {
  for (const l of lines) expect(submitLine(l), `the gate refused «${l}»`).toBe(true);
  const d = deriveLines(store().lines, store().seed, store().seed, store().queries);
  return d.points.find((p) => p.name === name)!;
}

describe('#1497 — the cartesian view', () => {
  it.each([
    ['z = 0.5', 'z = 0.5'],
    ['z = 1.25', 'z = 1.25'],
    ['z = 2/3', 'z = 2/3'],
    ['z = √8', 'z = √8'],
    ['z = 0.5+1.25i', 'z = 0.5+1.25i'],
    ['z = 2/3+√8i', 'z = 2/3+√8i'],
    ['z = 1-(2/3)i', 'z = 1-(2/3)i'],
    ['z = 0.5-i', 'z = 0.5-i'],
    ['z = 3+4i', 'z = 3+4i'],
    ['z = 7.9999', 'z = 8'], // sr-22
  ])('«%s» reads «%s» on the canvas', (line, text) => {
    expect(point([line]).canvasCart).toBe(text);
  });

  it('a fraction or a root alone keeps the panel reading it had', () => {
    expect(point(['z = √8']).readingCart).toBe('z = 2√2');
  });
});

describe('#1497 — the polar view', () => {
  it.each([
    ['z = √8cis45', 'z = √8·cis45°'],
    ['z = 0.5cis30', 'z = 0.5·cis30°'],
    ['z = 2cis120', 'z = 2·cis120°'],
  ])('«%s» reads «%s» on the canvas', (line, text) => {
    expect(point([line]).canvas).toBe(text);
  });

  it('a conversion to the other view is computed, so it stays on the tiers', () => {
    expect(point(['z = √8cis45']).canvasCart).toBe('z = 2+2i');
    store().resetSession();
    expect(point(['z = 2cis120']).canvasCart).toBe('z = -1+√3i');
  });
});

describe('ADR-CX-088 — a typed decimal reads as a decimal in the panel (sr-22)', () => {
  it.each([
    ['z = 7.9999', 'z = 8'],
    ['z = 1.234', 'z = 1.23'],
    ['z = 1.5 + 2.25i', 'z = 1.5+2.25i'],
    ['z = 0.5+1.25i', 'z = 0.5+1.25i'],
    ['z = 2/3+1.5i', 'z = 2/3+1.5i'],
    ['z = 2.5i', 'z = 2.5i'],
  ])('«%s» reads «%s» in the cartesian panel', (line, text) => {
    expect(point([line]).readingCart).toBe(text);
  });

  it.each([
    ['z = 7.9999', 'z = 8·cis0°'],
    ['z = 1.234', 'z = 1.23·cis0°'],
    ['z = 0.5cis30', 'z = 0.5·cis30°'],
    ['z = -1.5', 'z = 1.5·cis180°'],
  ])('«%s» reads «%s» in the polar panel', (line, text) => {
    expect(point([line]).reading).toBe(text);
  });

  it('the canvas polar label of a typed decimal is no fraction either', () => {
    expect(point(['z = 7.9999']).canvas).toBe('z = 8·cis0°');
  });

  it('the value is computed in full, whatever the row reads', () => {
    const p = point(['z = 7.9999']);
    expect(p.z.re).toBeCloseTo(7.9999, 10);
  });

  it('what the ruling did not reach is unchanged', () => {
    expect(point(['z = 0.5cis30']).readingCart).toBe('z = √3/4+(1/4)i'); // a conversion
    store().resetSession();
    expect(point(['z = 2/3']).readingCart).toBe('z = 2/3'); // a fraction
    store().resetSession();
    expect(point(['z = 2/3']).reading).toBe('z = 2/3·cis0°');
    store().resetSession();
    expect(point(['z = 1.5', 'w = 2z'], 'w').readingCart).toBe('w = 3'); // computed from a decimal: not decided
  });
});

describe('#1497 — what is not typed', () => {
  it('a computed number keeps its bare name', () => {
    expect(point(['z = 0.5+1.25i', 'w = 2z'], 'w').canvasCart).toBe('w');
  });
});
