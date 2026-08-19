/**
 * #745 — the question .docx export is SHARED, and every builder offers it.
 *
 * Two things are locked here, and neither is 2-D's end-to-end net (that stays in
 * `src/export/__tests__/questionDoc.test.ts`, with real facts and the real parser):
 *
 *  1. **The composer is product-agnostic.** `buildQuestionDoc` must compose a correct document from
 *     nothing but its inputs, with the caller's own segmenter deciding where technical runs begin.
 *     Asserted with a STUB segmenter that no product would ever produce, so a hard-coded run rule
 *     sneaking back in — the fork wearing a shared file's name (ADR-W-003) — fails here.
 *  2. **Parity.** All three builders reach the shared composer, name a givens source, and carry the
 *     heading and the button label in both locales. Source-scan locks in the row-parity/isolation
 *     pattern: the capability is what #745 is about, and a silently dropped wire-up is the regression.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { buildQuestionDoc, pngDimensions, questionFileName, type QuestionDocSegment } from '../export/questionDoc';
import { QUESTION_IMAGE_WIDTH_PX, sourceSize } from '../export/svgToPng';
import { makeBidi } from '../bidi';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

/** 2×1 RGB PNG (red, green) — non-square, so aspect handling is exercised. */
const PNG_2X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DA8J8BAAf/Af8Bf4mnAAAAAElFTkSuQmCC',
    'base64',
  ),
);
const png = { data: PNG_2X1, ...pngDimensions(PNG_2X1) };

const docXml = async (input: Parameters<typeof buildQuestionDoc>[0]) =>
  (await JSZip.loadAsync(await Packer.toBuffer(buildQuestionDoc(input)))).file('word/document.xml')!.async('string');

/** The <w:t> payloads in document order, paired with whether their run carries <w:rtl/>. */
const runs = (xml: string) =>
  [...xml.matchAll(/<w:r>(?:<w:rPr>(.*?)<\/w:rPr>)?<w:t[^>]*>([^<]*)<\/w:t><\/w:r>/g)].map((m) => ({
    text: m[2],
    rtl: (m[1] ?? '').includes('<w:rtl/>'),
  }));

describe('#745 — the composer takes its bidi from the CALLER', () => {
  /** A segmenter no product would produce: every 'X' is its own LTR run. If the composer consults the
   *  input rather than a rule of its own, this shape reaches the document verbatim. */
  const stub = (line: string): QuestionDocSegment[] => [...line].map((ch) => ({ text: ch, ltr: ch === 'X' }));

  it('the caller decides which runs are LTR — nothing here re-segments', async () => {
    const xml = await docXml({ heading: 'נתון:', lines: ['aXb'], png, rtl: true, segments: stub });
    const body = runs(xml).filter((r) => 'aXb'.includes(r.text));
    expect(body).toEqual([
      { text: 'a', rtl: true },
      { text: 'X', rtl: false }, // the stub's LTR run — emitted WITHOUT w:rtl
      { text: 'b', rtl: true },
    ]);
  });

  it('a real product kit composes the same way — the shared bidi core is a valid caller', async () => {
    const kit = makeBidi();
    const xml = await docXml({ heading: 'נתון:', lines: ['הנקודה z1 = 3+4i'], png, rtl: true, segments: kit.segments });
    const ltr = runs(xml)
      .filter((r) => !r.rtl)
      .map((r) => r.text);
    expect(ltr).toContain('z1 = 3+4i'); // the technical run, whole, laid out left-to-right
  });

  it('the split is layout-only — the given reassembles byte-for-byte', async () => {
    const line = 'במשולש ABC הזווית ∠ABC = 37°';
    const xml = await docXml({ heading: 'נתון:', lines: [line], png, rtl: true, segments: makeBidi().segments });
    expect(
      runs(xml)
        .map((r) => r.text)
        .join(''),
    ).toContain(line);
  });

  it('NO bidi control characters reach the document — Word draws them as missing-glyph boxes', async () => {
    const xml = await docXml({
      heading: 'נתון:',
      lines: ['הנקודה z1 = 3+4i', 'AB = 10'],
      png,
      rtl: true,
      segments: makeBidi().segments,
    });
    expect(xml).not.toMatch(/[⁦⁧⁨⁩‪-‮]/);
  });

  it('an LTR document never splits — one plain run, whatever the segmenter says', async () => {
    const xml = await docXml({ heading: 'Given:', lines: ['aXb'], png, rtl: false, segments: stub });
    expect(runs(xml).some((r) => r.text === 'aXb')).toBe(true);
  });

  it('never branches on product IDENTITY — the ADR-W-003 fork-wearing-a-shared-name test', () => {
    // Product-tree IMPORTS are the isolation test's business; what this guards is the subtler shape it
    // cannot see — a shared module that takes the caller's inputs and then asks which product it is.
    // Quoted ids and store names, because the OOXML vocabulary legitimately says "complex" itself
    // (`sizeComplexScript` is Word's own term for the RTL/CJK font slot).
    const body = read('shell/export/questionDoc.ts').toLowerCase();
    for (const needle of ["'2d'", "'3d'", "'complex'", '"2d"', '"3d"', '"complex"', 'geostore', 'usegeo3', 'usecomplexstore'])
      expect(body, `questionDoc must not know about «${needle}»`).not.toContain(needle);
  });
});

describe('#745 — the printed figure size is ONE number', () => {
  it('the width the document prints at is the width the rasteriser normalises ink to', async () => {
    const xml = await docXml({ heading: 'נתון:', lines: ['x'], png, rtl: true, segments: makeBidi().segments });
    // docx emits transformation units as EMU: 1 px@96dpi = 9525 EMU.
    expect(xml).toContain(`cx="${QUESTION_IMAGE_WIDTH_PX * 9525}"`);
  });

  it('question-YYYY-MM-DD.docx', () => {
    expect(questionFileName(new Date('2026-08-18T09:00:00Z'))).toBe('question-2026-08-18.docx');
  });
});

describe('#745 — the source size is resolved as a PAIR, for the way each builder declares it', () => {
  const svg = (attrs: Record<string, string>, client: { w: number; h: number } = { w: 0, h: 0 }) =>
    ({
      getAttribute: (k: string) => attrs[k] ?? null,
      clientWidth: client.w,
      clientHeight: client.h,
    }) as unknown as SVGSVGElement;

  it('explicit width/height attributes win (the 2-D figure)', () => {
    expect(sourceSize(svg({ width: '700', height: '520', viewBox: '0 0 10 10' }))).toEqual({ w: 700, h: 520 });
  });

  it('a CSS-laid-out figure falls back to its client box (the 3-D scene)', () => {
    expect(sourceSize(svg({ viewBox: '0 0 10 10' }, { w: 640, h: 480 }))).toEqual({ w: 640, h: 480 });
  });

  it('a viewBox-only figure uses the viewBox (the complex Gauss plane)', () => {
    expect(sourceSize(svg({ viewBox: '0 0 680 620' }))).toEqual({ w: 680, h: 620 });
  });

  it('never mixes sources — a lone width attribute cannot pair with a viewBox height', () => {
    // the aspect ratio is the thing being protected: 900 × 620 would print the figure stretched
    expect(sourceSize(svg({ width: '900', viewBox: '0 0 680 620' }))).toEqual({ w: 680, h: 620 });
  });

  it('a figure that declares nothing still exports at a sane size', () => {
    expect(sourceSize(svg({}))).toEqual({ w: 600, h: 600 });
  });
});

/**
 * Which builders print a question document is a DECLARED matrix row, not a headcount.
 *
 * Operator ruling, 2026-08-19: «הורידו שאלה» belongs in 2-D and 3-D and **not** in the complex builder.
 * So this file locks two things that are easy to confuse: every builder in `APPS` wires the capability
 * completely, and the builder in `NO_QUESTION_EXPORT` does not wire it at all. The second assertion is
 * the one that matters — a deliberate n/a and a forgotten cell look identical in a passing suite, and
 * the only difference is whether something fails when the gap quietly closes.
 */
describe('#745 — the builders that offer the question download, and the one that does not', () => {
  const APPS = [
    { name: '2-D', file: 'src/App.tsx', lines: 'src/export/questionLines.ts' },
    { name: '3-D', file: 'src3d/App3.tsx', lines: 'src3d/export/questionLines3.ts' },
  ];
  const NO_QUESTION_EXPORT = [{ name: 'complex', file: 'src-complex/App.tsx' }];

  it.each(APPS)('$name reaches the SHARED composer, dynamically imported', ({ file }) => {
    const src = read(file);
    expect(src, `${file} must import the shared composer`).toContain('shell/export/questionDoc');
    // dynamic, so the docx library stays out of the main chunk in every product
    expect(src).toMatch(/await import\(['"][^'"]*shell\/export\/questionDoc['"]\)/);
  });

  it.each(APPS)('$name names a givens source of its own', ({ file, lines }) => {
    expect(fs.existsSync(path.join(ROOT, lines)), `${lines} must exist`).toBe(true);
    expect(read(file)).toContain('questionLines');
  });

  it.each(APPS)('$name hands the composer a segmenter — bidi is never left to default', ({ file }) => {
    expect(read(file)).toMatch(/segments:\s*\w/);
  });

  it('the button carries ONE wording in the builders that have it, he and en', () => {
    for (const rel of ['src/i18n/locales/he.json', 'src3d/i18n/locales/he.json'])
      expect(read(rel), `${rel} must carry the button label`).toContain('הורידו שאלה');
    for (const rel of ['src/i18n/locales/en.json', 'src3d/i18n/locales/en.json'])
      expect(read(rel), `${rel} must carry the en mirror`).toContain('Download question');
  });

  it('the document heading is defined in those builders, he and en', () => {
    for (const rel of ['src/i18n/locales/he.json', 'src3d/i18n/locales/he.json'])
      expect(read(rel), `${rel} must carry the «נתון:» heading`).toContain('נתון:');
    for (const rel of ['src/i18n/locales/en.json', 'src3d/i18n/locales/en.json'])
      expect(read(rel), `${rel} must carry the en heading`).toContain('Given:');
  });

  /**
   * The n/a half. If a later session mounts the button in complex — by porting a surface wholesale, or
   * by "completing the matrix" without reading the ruling — these fail and name the ruling, which is
   * the only way a DECISION not to build something survives contact with a unification programme.
   */
  it.each(NO_QUESTION_EXPORT)('$name does NOT wire the question export (operator ruling, 2026-08-19)', ({ file }) => {
    const src = read(file);
    expect(src, `${file} must not reach the question composer`).not.toContain('shell/export/questionDoc');
    expect(src, `${file} must not offer the button`).not.toContain('questionDownload');
  });

  it('complex carries no question-export strings and no givens module', () => {
    expect(read('src-complex/i18n/index.ts')).not.toContain('הורידו שאלה');
    expect(read('src-complex/i18n/index.ts')).not.toContain('Download question');
    expect(fs.existsSync(path.join(ROOT, 'src-complex/export/questionLines.ts'))).toBe(false);
  });

  /**
   * What complex DOES share is the rasteriser — the third product-local svg→png copy, which #742
   * flagged as a shell candidate and this issue's shared module retires. Sharing the pixels while
   * declining the document is the point: the n/a is about the QUESTION, not about the export layer.
   */
  it('complex still rasterises through the SHARED path — the n/a is the document, not the pixels', () => {
    expect(read('src-complex/App.tsx')).toContain('shell/export/svgToPng');
    expect(read('src-complex/App.tsx')).not.toContain('new XMLSerializer()');
  });
});
