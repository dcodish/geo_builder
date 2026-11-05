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

  it('the panel keeps its reading', () => {
    expect(point(['z = 0.5+1.25i']).readingCart).toBe('z = 1/2+(5/4)i');
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

describe('#1497 — what is not typed', () => {
  it('a computed number keeps its bare name', () => {
    expect(point(['z = 0.5+1.25i', 'w = 2z'], 'w').canvasCart).toBe('w');
  });
});
