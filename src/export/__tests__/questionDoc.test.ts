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
 *
 * The composer itself moved to `shell/export/` with #745 (three builders export the same document).
 * This file stays in the 2-D tree and stays 2-D's END-TO-END net — real facts, the real parser, the
 * real `bidiSegments` — because that is what it always was; the shared CONTRACT (product-agnostic
 * composition, any segmenter) is locked separately in `shell/__tests__/question-doc.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import type { Fact } from '@/store/geoStore';
import { replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import { questionLines } from '@/export/questionLines';
import { buildQuestionDoc, pngDimensions, questionFileName } from '../../../shell/export/questionDoc';
import { bidiSegments } from '@/i18n/bidi';

/** Real-pipeline fact builder: parse each utterance with the live figure context, exactly as the app does. */
const factsFromUtterances = (utterances: string[]): Fact[] => {
  const facts: Fact[] = [];
  utterances.forEach((u, g) => {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `g${g}.${facts.length}`, utterance: u, group: `g${g}`, cmd, enabled: true });
  });
  return facts;
};

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

  // ── ADR-252: scaffolding steps (pure ink / helper markers) are omitted ──
  const square = (id: string, utterance = 'ריבוע ABCD'): Fact =>
    fact({ id, utterance, cmd: { type: 'square', ids: ['A', 'B', 'C', 'D'] } });

  it('a bare segment between existing points is pure ink — omitted', () => {
    const facts: Fact[] = [
      square('f1'),
      fact({ id: 'f2', utterance: 'AC', cmd: { type: 'segment', a: 'A', b: 'C' } }),
      fact({ id: 'f3', utterance: 'BD', cmd: { type: 'segment', a: 'B', b: 'D' } }),
    ];
    expect(questionLines(facts)).toEqual(['ריבוע ABCD']);
  });

  it('a free marker kept alive only by omitted ink cascades away with it', () => {
    const facts: Fact[] = [
      square('f1'),
      fact({ id: 'f2', utterance: 'נקודה E על AB', cmd: { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' } }),
      fact({ id: 'f3', utterance: 'EC', cmd: { type: 'segment', a: 'E', b: 'C' } }),
    ];
    expect(questionLines(facts)).toEqual(['ריבוע ABCD']);
  });

  it('a marker referenced by a LATER real given is a definition the reader needs — kept', () => {
    const facts: Fact[] = [
      square('f1'),
      fact({ id: 'f2', utterance: 'נקודה G על AD', cmd: { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' } }),
      fact({ id: 'f3', utterance: 'זווית GBA = 37', cmd: { type: 'set-angle', vertex: 'B', ray1: 'G', ray2: 'A', value: 37 } }),
    ];
    // #465: an angle line now exports in the CANONICAL form — the export follows the step list.
    expect(questionLines(facts)).toEqual(['ריבוע ABCD', 'נקודה G על AD', '∠GBA = 37']);
  });

  it('a bare segment whose NEW endpoint a later given references is kept', () => {
    const facts: Fact[] = [
      square('f1'),
      fact({ id: 'f2', utterance: 'BE', cmd: { type: 'segment', a: 'B', b: 'E' } }), // creates E
      fact({ id: 'f3', utterance: 'זווית ABE = 30', cmd: { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'E', value: 30 } }),
    ];
    // #465: an angle line now exports in the CANONICAL form — the export follows the step list.
    expect(questionLines(facts)).toEqual(['ריבוע ABCD', 'BE', '∠ABE = 30']);
  });

  it('a membership statement about an EXISTING point is a given (M1), never scaffolding — and it keeps its carrier', () => {
    const facts: Fact[] = [
      fact({ id: 'f1', utterance: 'משולש ABC', cmd: { type: 'triangle', ids: ['A', 'B', 'C'] } }),
      fact({ id: 'f2', utterance: 'DF', cmd: { type: 'segment', a: 'D', b: 'F' } }), // creates D, F
      fact({ id: 'f3', utterance: 'C על DF', cmd: { type: 'point-on-segment', id: 'C', a: 'D', b: 'F' } }), // C exists ⇒ a constraint
    ];
    // f3 is kept (existing-id membership = a given); it references D,F so the DF step that defines them stays too.
    expect(questionLines(facts)).toEqual(['משולש ABC', 'DF', 'C על DF']);
  });

  it('a stated ratio pins a marker — kept even when nothing later references it', () => {
    const facts: Fact[] = [
      square('f1'),
      fact({ id: 'f2', utterance: 'נקודה G על AD ב-40%', cmd: { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 } }),
    ];
    expect(questionLines(facts)).toEqual(['ריבוע ABCD', 'נקודה G על AD ב-40%']);
  });

  it('a typed pinned point (coordinates stated, no free flag) is a given — kept', () => {
    const facts: Fact[] = [fact({ id: 'f1', utterance: 'נקודה A ב-(1,2)', cmd: { type: 'free-point', id: 'A', x: 1, y: 2 } })];
    expect(questionLines(facts)).toEqual(['נקודה A ב-(1,2)']);
  });

  it('operator pattern (session ufxrtyp2), real parser: centre-to-vertex helper segments are omitted', () => {
    const facts = factsFromUtterances(['במרובע ABCD חסום מעגל O', 'OB', 'OD', 'OA', 'OC']);
    expect(questionLines(facts)).toEqual(['במרובע ABCD חסום מעגל O']);
  });

  it('real parser: the canonical square figure keeps every line (marker referenced by the angle)', () => {
    const facts = factsFromUtterances(['ריבוע ABCD', 'נקודה G על AD', 'זווית GBA = 37']);
    // #465: an angle line now exports in the CANONICAL form — the export follows the step list.
    expect(questionLines(facts)).toEqual(['ריבוע ABCD', 'נקודה G על AD', '∠GBA = 37']);
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
    // #745: the composer is shared, so the segmenter is handed IN — this is the 2-D one, i.e. the
    // same function the step list renders through.
    segments: bidiSegments,
  };

  it('packs a valid zip whose document.xml carries the verbatim givens, RTL and real numbering', async () => {
    const buf = await Packer.toBuffer(buildQuestionDoc(input));
    expect(Buffer.from(buf.subarray(0, 2)).toString('latin1')).toBe('PK'); // a zip container

    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')!.async('string');

    // Content survived — but no longer as ONE contiguous string. Since #464 an RTL given is SPLIT into
    // per-direction runs (Word scrambles a technical run exactly as the browser did, and its own
    // mechanism for that is `w:rtl` per run, not control characters). The invariant is that splitting is
    // layout-only: concatenating the runs gives the given back verbatim.
    const body = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    expect(body).toContain('במשולש ABC הזווית ∠ABC = 37°');
    expect(body).toContain('AB קוטר במעגל O');
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

describe('#465 — the export follows the CANONICAL form (ADR-428 reserved decision)', () => {
  // Operator ruling 2026-08-09: once the step list echoes canonically (#450), a worksheet still saying
  // «A=50» disagrees with the screen the student is reading. Same renderer as the step row and the
  // acceptance hint, so all three surfaces cannot drift apart.
  const angle = { type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'C', value: 50 } as unknown as Fact['cmd'];

  it('a bare-vertex angle exports as «∠BAC = 50», not as the typed text', () => {
    const facts: Fact[] = [fact({ id: 'f1', utterance: 'A=50', group: 'g1', cmd: angle })];
    expect(questionLines(facts, 'he')).toEqual(['∠BAC = 50']);
  });

  it('a line the renderer cannot express keeps its verbatim utterance', () => {
    const facts: Fact[] = [
      fact({ id: 'f1', utterance: 'ריבוע ABCD', group: 'g1', cmd: { type: 'square', ids: ['A', 'B', 'C', 'D'] } as unknown as Fact['cmd'] }),
    ];
    expect(questionLines(facts, 'he')).toEqual(['ריבוע ABCD']);
  });

  it('an utterance is still REQUIRED — a canonical form never resurrects a jargon line', () => {
    // The header rule stands: a group with no typed utterance is skipped rather than rendered as a
    // command-type join. Canonicalisation changes how a line READS, never whether it appears.
    const facts: Fact[] = [fact({ id: 'f1', group: 'g1', cmd: angle })];
    expect(questionLines(facts, 'he')).toEqual([]);
  });
});

describe('#464/#465 — the .docx marks direction PER RUN, with no control characters', () => {
  const base = {
    heading: 'נתון:',
    png: { data: PNG_2X1, ...pngDimensions(PNG_2X1) },
    segments: bidiSegments,
  };
  const docXml = async (over: { rtl: boolean; lines: string[] }) => {
    const buf = await Packer.toBuffer(buildQuestionDoc({ ...base, ...over }));
    return (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
  };
  /** The <w:t> payloads in document order, paired with whether their run carries <w:rtl/>. */
  const runs = (xml: string) =>
    [...xml.matchAll(/<w:r>(?:<w:rPr>(.*?)<\/w:rPr>)?<w:t[^>]*>([^<]*)<\/w:t><\/w:r>/g)].map((m) => ({
      text: m[2],
      rtl: (m[1] ?? '').includes('<w:rtl/>'),
    }));

  it('NO bidi control characters reach the document — Word draws them as boxes', () => {
    // The operator saw literal ⟦LRI⟧/⟦PDI⟧ boxes in the givens list: the browser's isolate strategy does
    // not port to .docx, because Word has no glyph for U+2066/U+2069. This is the regression guard.
    return docXml({ rtl: true, lines: ['|BC| = 10', 'במשולש ABC הזווית ∠ABC = 37°'] }).then((xml) => {
      expect(xml).not.toContain('\u2066');
      expect(xml).not.toContain('\u2069');
    });
  });

  it('a technical run is emitted as its own run WITHOUT w:rtl, so Word lays it out LTR', async () => {
    const xml = await docXml({ rtl: true, lines: ['במשולש ABC הזווית ∠ABC = 37°'] });
    const ltr = runs(xml).filter((r) => !r.rtl).map((r) => r.text);
    expect(ltr).toContain('ABC');
    expect(ltr.some((t) => t.includes('∠ABC = 37'))).toBe(true);
    // ...and the Hebrew stays RTL
    expect(runs(xml).filter((r) => r.rtl).some((r) => r.text.includes('במשולש'))).toBe(true);
  });

  it('an all-Latin given still gets an LTR run — the RTL paragraph would otherwise reverse it', async () => {
    // No Hebrew anywhere, yet `w:bidi` is forced on the paragraph, so `|BC| = 10` scrambles without this.
    const xml = await docXml({ rtl: true, lines: ['|BC| = 10'] });
    expect(runs(xml).filter((r) => !r.rtl).map((r) => r.text)).toContain('|BC| = 10');
  });

  it('splitting is layout-only — the given reassembles byte-for-byte', async () => {
    const line = 'במשולש ABC הזווית ∠ABC = 37°';
    const xml = await docXml({ rtl: true, lines: [line] });
    const body = runs(xml).map((r) => r.text).join('');
    expect(body).toContain(line);
  });

  it('an LTR document is untouched — one run, no splitting', async () => {
    const xml = await docXml({ rtl: false, lines: ['|BC| = 10'] });
    expect(xml).toContain('|BC| = 10');
    expect(xml).not.toContain('<w:rtl/>');
  });
});

/**
 * #751 (ADR-W-029) — the END-TO-END lock the operator's report started.
 *
 * Playing #746 the exported `.docx` printed «קובייה ⟦PDI⟧ABCD⟦LRI⟧» — two missing-glyph boxes — on
 * the ONE line that had been entered by clicking an example chip. The exporter was innocent: it was
 * handed a stored utterance that already held the app's display isolates.
 *
 * The fix is upstream (the chip contract + the store-side ingest invariant), and this lock stays
 * anyway, because it is the assertion that would have caught it: it drives the STORE, exports what
 * the store kept, and asserts the document holds no format controls. A future seam that
 * re-introduces a display transform into the fact list fails here even if it slips past the store
 * tests.
 */
describe('#751 — a chip-seeded fact exports with no format controls', () => {
  const LRI = String.fromCharCode(0x2066);
  const PDI = String.fromCharCode(0x2069);
  const CONTROLS = /[؜​-‏‪-‮⁦-⁩﻿]/;

  it('the .docx carries the given verbatim and no U+2066/U+2069', async () => {
    const store = useGeoStore.getState();
    store.clear();
    // exactly what the chip used to submit: the DISPLAY string, isolates and all
    const chipDisplayText = `טרפז ${LRI}ABCD${PDI} חסום במעגל`;
    expect(CONTROLS.test(chipDisplayText)).toBe(true);

    const { construction, positions } = replay([]);
    const r = parse('טרפז ABCD חסום במעגל', buildParseCtx(construction, positions));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    useGeoStore.getState().executeMany(r.commands, chipDisplayText);

    const lines = questionLines(useGeoStore.getState().facts);
    expect(lines.every((l) => !CONTROLS.test(l))).toBe(true);

    const buf = await Packer.toBuffer(
      buildQuestionDoc({ heading: 'נתון:', lines, png: { data: PNG_2X1, ...pngDimensions(PNG_2X1) }, rtl: true, segments: bidiSegments }),
    );
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    const body = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

    expect(CONTROLS.test(body)).toBe(false);
    expect(body).toContain('טרפז ABCD חסום במעגל');
  });
});
