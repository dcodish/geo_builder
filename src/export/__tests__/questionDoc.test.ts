/**
 * FR-HS-11 / ADR-251 — the question .docx export.
 *
 * questionLines: the pure facts → verbatim-givens extraction (enabled groups
 * only, first stated utterance per group, jargon-free skips).
 *
 * buildQuestionDoc: packs a real .docx in node and asserts the load-bearing
 * OOXML — verbatim Hebrew survives, w:bidi/w:rtl (RTL paragraphs+runs), w:numPr
 * (real Word numbering, not a bidi-fragile "1. " prefix), the borderless
 * bidiVisual side-by-side table. Raw-buffer text search would NOT work
 * (document.xml is deflated inside the zip), hence jszip.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import type { Fact } from '@/store/geoStore';
import { questionLines } from '@/export/questionLines';
import { buildQuestionDoc, pngDimensions, questionFileName } from '@/export/questionDoc';

/** 2×1 RGB PNG (red, green) — non-square so aspect handling is exercised. */
const PNG_2X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DA8J8BAAf/Af8Bf4mnAAAAAElFTkSuQmCC',
    'base64',
  ),
);

const fact = (over: Partial<Fact> & { id: string }): Fact => ({
  cmd: { type: 'free-point', id: over.id.toUpperCase(), x: 0, y: 0 },
  enabled: true,
  ...over,
});

describe('questionLines', () => {
  it('one line per group, entry order, verbatim utterance', () => {
    const facts: Fact[] = [
      fact({ id: 'f1', utterance: 'ריבוע ABCD', group: 'g1' }),
      fact({ id: 'f2', group: 'g1' }), // same submission — no extra line
      fact({ id: 'f3', utterance: 'נקודה G על AD' }),
    ];
    expect(questionLines(facts)).toEqual(['ריבוע ABCD', 'נקודה G על AD']);
  });

  it('a fully-disabled group is dropped; a partially-enabled one is kept', () => {
    const facts: Fact[] = [
      fact({ id: 'f1', utterance: 'מעגל O', group: 'g1', enabled: false }),
      fact({ id: 'f2', group: 'g1', enabled: false }),
      fact({ id: 'f3', utterance: 'AB קוטר', group: 'g2', enabled: false }),
      fact({ id: 'f4', group: 'g2', enabled: true }),
    ];
    expect(questionLines(facts)).toEqual(['AB קוטר']);
  });

  it('uses the FIRST stated utterance in a group', () => {
    const facts: Fact[] = [
      fact({ id: 'f1', group: 'g1' }), // utterance-less lead fact
      fact({ id: 'f2', group: 'g1', utterance: 'משולש ABC' }),
    ];
    expect(questionLines(facts)).toEqual(['משולש ABC']);
  });

  it('skips utterance-less groups entirely (no cmd-type jargon)', () => {
    const facts: Fact[] = [fact({ id: 'f1' }), fact({ id: 'f2', utterance: '  זווית ABC = 37  ' })];
    expect(questionLines(facts)).toEqual(['זווית ABC = 37']); // and trims
  });

  it('empty facts → empty lines (button disabled)', () => {
    expect(questionLines([])).toEqual([]);
  });
});

describe('pngDimensions', () => {
  it('reads width/height from the IHDR header', () => {
    expect(pngDimensions(PNG_2X1)).toEqual({ width: 2, height: 1 });
  });

  it('throws on non-PNG bytes', () => {
    expect(() => pngDimensions(Uint8Array.from([1, 2, 3, 4]))).toThrow('not a PNG');
    expect(() => pngDimensions(new TextEncoder().encode('<svg></svg> padding padding'))).toThrow('not a PNG');
  });
});

describe('questionFileName', () => {
  it('question-YYYY-MM-DD.docx', () => {
    expect(questionFileName(new Date('2026-07-07T10:00:00Z'))).toBe('question-2026-07-07.docx');
  });
});

describe('buildQuestionDoc', () => {
  const input = {
    heading: 'נתון:',
    lines: ['במשולש ABC הזווית ∠ABC = 37°', 'AB קוטר במעגל O'],
    png: { data: PNG_2X1, ...pngDimensions(PNG_2X1) },
    rtl: true,
  };

  it('packs a valid zip whose document.xml carries the verbatim givens, RTL and real numbering', async () => {
    const buf = await Packer.toBuffer(buildQuestionDoc(input));
    expect(Buffer.from(buf.subarray(0, 2)).toString('latin1')).toBe('PK'); // a zip container

    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')!.async('string');

    // verbatim content survived, untransformed
    expect(xml).toContain('במשולש ABC הזווית ∠ABC = 37°');
    expect(xml).toContain('AB קוטר במעגל O');
    expect(xml).toContain('נתון:');

    expect(xml).toContain('<w:bidi'); // RTL paragraphs
    expect(xml).toContain('<w:rtl'); // RTL runs
    expect(xml).toContain('<w:numPr'); // real Word numbering — never a "1. " prefix
    expect(xml).toContain('<w:tbl'); // the side-by-side layout table
    expect(xml).toContain('bidiVisual'); // ...rendered right-to-left
    expect(xml).toContain('<w:drawing'); // the figure image is embedded

    expect(zip.file('word/numbering.xml')).toBeTruthy();
    expect(zip.file(/^word\/media\/.+\.png$/).length).toBeGreaterThan(0); // PNG payload present
  });

  it('an English (ltr) doc has no bidi paragraphs and no bidiVisual table', async () => {
    const buf = await Packer.toBuffer(buildQuestionDoc({ ...input, heading: 'Given:', lines: ['square ABCD'], rtl: false }));
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    expect(xml).toContain('square ABCD');
    expect(xml).not.toContain('<w:bidi ');
    expect(xml).not.toContain('bidiVisual');
  });
});
