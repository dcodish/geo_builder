/**
 * #745 — the 3-D question export's «נתון:» list.
 *
 * The operator ruled the list VERBATIM (see the module header for why a scaffolding classification is
 * NOT ported from 2-D), so what is actually load-bearing here is small and worth stating exactly:
 * entry order, enabled-only, the student's own words, and no line invented for a fact that carries no
 * utterance. The last one is the honesty edge — a command-type join would print developer jargon into
 * a document a student hands in.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { buildQuestionDoc, pngDimensions } from '../../shell/export/questionDoc';
import { bidiSegments3 } from '../i18n/bidi';
import { questionLines3 } from '../export/questionLines3';
import type { Fact3 } from '../store/store3';

const fact = (over: Partial<Fact3> & { id: string }): Fact3 => ({
  utterance: '',
  cmds: [],
  enabled: true,
  ...over,
});

describe('questionLines3', () => {
  it('one line per enabled fact, in entry order, verbatim', () => {
    const facts = [
      fact({ id: 'f1', utterance: "תיבה ABCDA'B'C'D'" }),
      fact({ id: 'f2', utterance: '|AB| = 6' }),
      fact({ id: 'f3', utterance: "הישר AC'" }),
    ];
    expect(questionLines3(facts)).toEqual(["תיבה ABCDA'B'C'D'", '|AB| = 6', "הישר AC'"]);
  });

  it('a DISABLED fact is not a given — the student took it out of the figure', () => {
    const facts = [
      fact({ id: 'f1', utterance: 'תיבה ABCD' }),
      fact({ id: 'f2', utterance: '|AB| = 6', enabled: false }),
      fact({ id: 'f3', utterance: '|BC| = 4' }),
    ];
    expect(questionLines3(facts)).toEqual(['תיבה ABCD', '|BC| = 4']);
  });

  it('an utterance-less fact prints NOTHING — never a command-type join', () => {
    expect(questionLines3([fact({ id: 'f1' }), fact({ id: 'f2', utterance: '   ' })])).toEqual([]);
  });

  it('surrounding whitespace is trimmed, the words themselves are untouched', () => {
    expect(questionLines3([fact({ id: 'f1', utterance: '  מישור π1 מכיל את ABC  ' })])).toEqual([
      'מישור π1 מכיל את ABC',
    ]);
  });

  it('no facts → no lines, which is what disables the button', () => {
    expect(questionLines3([])).toEqual([]);
  });

  it('every statement survives — nothing is classified away (the ruling, stated as a test)', () => {
    // 2-D would drop «הישר AC'» as pure ink. Here it stays: a given the student typed is a given.
    const facts = [
      fact({ id: 'f1', utterance: "תיבה ABCDA'B'C'D'" }),
      fact({ id: 'f2', utterance: "הישר AC'" }),
      fact({ id: 'f3', utterance: 'נקודה M אמצע AB' }),
    ];
    expect(questionLines3(facts)).toHaveLength(3);
  });
});

/**
 * The wiring, end to end in node: this tree's givens + this tree's segmenter through the shared
 * composer. Unit-testing the two halves separately would not catch the failure that actually matters —
 * a builder that reaches the composer with the wrong segmenter and prints scrambled Hebrew.
 */
describe('#745 — 3-D givens through the shared composer', () => {
  /** 2×1 RGB PNG — non-square, so aspect handling is exercised. */
  const PNG_2X1 = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DA8J8BAAf/Af8Bf4mnAAAAAElFTkSuQmCC',
      'base64',
    ),
  );

  it('a Hebrew figure prints its givens unscrambled, with no control characters', async () => {
    const facts = [
      fact({ id: 'f1', utterance: "תיבה ABCDA'B'C'D'" }),
      fact({ id: 'f2', utterance: '|AB| = 6' }),
      fact({ id: 'f3', utterance: 'המישור π1 מכיל את ABC' }),
    ];
    const data = PNG_2X1;
    const doc = buildQuestionDoc({
      heading: 'נתון:',
      lines: questionLines3(facts),
      png: { data, ...pngDimensions(data) },
      rtl: true,
      segments: bidiSegments3,
    });
    const xml = await (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml')!.async('string');

    // `document.xml` is XML, so the prime in ABCDA'B'C'D' arrives as `&apos;` — decode before comparing,
    // rather than testing against lines that happen to have no escapable character in them.
    const unescape = (s: string) =>
      s
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    const runs = [...xml.matchAll(/<w:r>(?:<w:rPr>(.*?)<\/w:rPr>)?<w:t[^>]*>([^<]*)<\/w:t><\/w:r>/g)].map((m) => ({
      text: unescape(m[2]),
      rtl: (m[1] ?? '').includes('<w:rtl/>'),
    }));
    // every given reassembles byte-for-byte — the split is layout, never content
    const rebuilt = runs.map((r) => r.text).join('');
    for (const line of questionLines3(facts)) expect(rebuilt).toContain(line);
    // the technical runs are marked LTR, which is what stops «|AB| = 6» printing as «6 = |AB|»
    expect(runs.filter((r) => !r.rtl).map((r) => r.text)).toContain('|AB| = 6');
    // Word draws U+2066/U+2069 as missing-glyph boxes — none may reach the page
    expect(xml).not.toMatch(/[⁦⁧⁨⁩‪-‮]/);
  });
});
