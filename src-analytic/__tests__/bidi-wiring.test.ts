/**
 * THE INPUT PANEL IS WIRED FOR BIDI (#1088).
 *
 * Operator, 2026-09-16: *"input panel needs to support bidi in the same way we have for the other
 * tools"* — the chip for «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9» read back as
 * «2+(y-4)^2=9^(x-3)».
 *
 * The isolation itself was never wrong — measured here, first, so this file can never be read as
 * blaming the segmenter. What was wrong is that the panel passed none of the four seams its
 * siblings pass, and the shared quick strip had no display seam to pass anything to.
 *
 * A source-scan lock on the wiring, in the shape `row-parity.test.ts` uses: the seams are what a
 * refactor drops silently, and dropping one is invisible until a student reads a formula they did
 * not write.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyticBidi } from '../i18n';

const APP = fs
  .readFileSync(path.resolve(__dirname, '..', 'App.tsx'), 'utf8')
  .replace(/^﻿/, '');

const LINE = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';

describe('#1088 — the segmentation was always right', () => {
  it('keeps the whole equation in ONE run, caret and all', () => {
    const segs = analyticBidi.segments(LINE, false);
    expect(segs.filter((s) => s.ltr).map((s) => s.text)).toEqual(['I', '(x-3)^2+(y-4)^2=9']);
  });

  it('and isolating it round-trips to the student’s own line', () => {
    const iso = analyticBidi.isolateLtrRuns(LINE);
    expect(iso).not.toBe(LINE);
    expect(iso).toContain('⁦(x-3)^2+(y-4)^2=9⁩');
  });
});

describe('#1088 — every seam the siblings pass, this panel passes', () => {
  /** `<prop>={…analyticBidi.<fn>…}` — the wiring, not its whitespace. */
  const passes = (prop: string, fn: string) =>
    new RegExp(`${prop}=\{[^}]*analyticBidi\.${fn}`).test(APP);

  it('the quick strip renders the display form (the reported defect)', () => {
    expect(passes('quickDisplay', 'isolateLtrRuns')).toBe(true);
  });

  it('the box takes its direction from its CONTENT, never dir="auto" (the #118 lesson)', () => {
    expect(passes('boxDir', 'textDir')).toBe(true);
  });

  it('a line being typed gets the live preview, laid out correctly', () => {
    expect(passes('preview', 'inputPreview')).toBe(true);
    expect(passes('previewDir', 'textDir')).toBe(true);
  });

  it('and so does the fact-list editor', () => {
    expect(passes('editDir', 'textDir')).toBe(true);
  });
});
