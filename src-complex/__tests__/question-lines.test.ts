/**
 * #745 — the complex builder's question export «נתון:» list.
 *
 * The store's `disabled` names POSITIONS, not texts (its own convention, preserved across removals),
 * and that is the whole reason this is a module rather than an inline filter: an implementation that
 * matched on the text would mute BOTH copies of a repeated statement, and a student legitimately writes
 * the same line twice under different names elsewhere in the session.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { buildQuestionDoc, pngDimensions } from '../../shell/export/questionDoc';
import { complexBidi } from '../i18n';
import { questionLines } from '../export/questionLines';

describe('questionLines (complex)', () => {
  it('every statement, in entry order — the lines ARE the givens', () => {
    const lines = ['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2'];
    expect(questionLines(lines)).toEqual(lines);
  });

  it('a disabled INDEX is excluded — a muted statement is out of the figure (B5/D6)', () => {
    expect(questionLines(['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2'], [1])).toEqual(['z1 = 3+4i', 'w = z1*z2']);
  });

  it('disabled names a POSITION, not a text — a repeated statement is muted one at a time', () => {
    expect(questionLines(['z1 = 3+4i', 'z1 = 3+4i'], [0])).toEqual(['z1 = 3+4i']);
  });

  it('an out-of-range disabled index changes nothing', () => {
    expect(questionLines(['z1 = 3+4i'], [7])).toEqual(['z1 = 3+4i']);
  });

  it('blank statements never reach the document', () => {
    expect(questionLines(['z1 = 3+4i', '   ', ''])).toEqual(['z1 = 3+4i']);
  });

  it('surrounding whitespace is trimmed, the expression itself is untouched', () => {
    expect(questionLines(['  z^5 = w^2  '])).toEqual(['z^5 = w^2']);
  });

  it('no lines, or every line muted → no givens, which is what disables the button', () => {
    expect(questionLines([])).toEqual([]);
    expect(questionLines(['z1 = 3+4i', 'z2 = 1'], [0, 1])).toEqual([]);
  });
});

/**
 * The wiring, end to end in node: this tree's givens + this tree's segmenter through the shared
 * composer. The case that matters here is the one an all-Latin tool hits hardest — every statement is
 * `z1 = 3+4i`, i.e. bidi-NEUTRAL from end to end, sitting in a paragraph the document forces RTL. With
 * no per-run direction Word renders it reversed, and the student's own algebra would be wrong on paper.
 */
describe('#745 — complex givens through the shared composer', () => {
  /** 2×1 RGB PNG — non-square, so aspect handling is exercised. */
  const PNG_2X1 = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DA8J8BAAf/Af8Bf4mnAAAAAElFTkSuQmCC',
      'base64',
    ),
  );

  const docXml = async (lines: string[]) => {
    const data = PNG_2X1;
    const doc = buildQuestionDoc({
      heading: 'נתון:',
      lines: questionLines(lines),
      png: { data, ...pngDimensions(data) },
      rtl: true,
      segments: complexBidi.segments,
    });
    return (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml')!.async('string');
  };

  const runs = (xml: string) =>
    [...xml.matchAll(/<w:r>(?:<w:rPr>(.*?)<\/w:rPr>)?<w:t[^>]*>([^<]*)<\/w:t><\/w:r>/g)].map((m) => ({
      text: m[2],
      rtl: (m[1] ?? '').includes('<w:rtl/>'),
    }));

  it('an all-Latin statement gets an LTR run — the RTL paragraph would otherwise reverse it', async () => {
    const ltr = runs(await docXml(['z1 = 3+4i', 'w = z1*z2'])).filter((r) => !r.rtl).map((r) => r.text);
    expect(ltr).toContain('z1 = 3+4i');
    expect(ltr).toContain('w = z1*z2');
  });

  it('no bidi control characters reach the page — Word draws them as missing-glyph boxes', async () => {
    expect(await docXml(['z2 = 2cis150', 'z^5 = w^2'])).not.toMatch(/[⁦⁧⁨⁩‪-‮]/);
  });

  it('a muted statement never reaches the document', async () => {
    const data = PNG_2X1;
    const doc = buildQuestionDoc({
      heading: 'נתון:',
      lines: questionLines(['z1 = 3+4i', 'z2 = 2cis150'], [1]),
      png: { data, ...pngDimensions(data) },
      rtl: true,
      segments: complexBidi.segments,
    });
    const xml = await (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml')!.async('string');
    expect(xml).toContain('z1 = 3+4i');
    expect(xml).not.toContain('2cis150');
  });
});
