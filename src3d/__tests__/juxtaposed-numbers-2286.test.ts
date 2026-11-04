/**
 * #2286 ([ADR-AG-397](../../docs/06c-decisions-analytic.md#adr-ag-397), operator ruling 2026-11-03: *"Refuse it, naming
 * the line, in every builder … 2-D and 3-D stop sending «AB = 2 3» to the AI"*) — 3-D's lock.
 *
 * Measured at ebacadd1 through `decideSubmit3`: «AB = 2 3» (after «קטע AB» or a box) and «A(2 3, 1, 0)» were
 * `not-understood`, handed to the model. Now `readStatement3` — the reader submit and the ✎ edit share — refuses them
 * with the suite's sentence (`shell/juxtaposedNumbers`), `guided`, never a model call.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, type Fact3 } from '../store/store3';
import { decideDeterministic3, refusalCategory3 } from '../app/decideDeterministic3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { findNumberPair } from '../../shell/juxtaposedNumbers';

const t = i18n3d.getFixedT('he') as (k: string, o?: Record<string, unknown>) => string;
const tEn = i18n3d.getFixedT('en') as (k: string, o?: Record<string, unknown>) => string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

const figure = (line: string) => {
  const v = decideSubmit3({ facts: [], seed: 0 }, line);
  if (v.kind !== 'record') throw new Error(`setup: «${line}» did not record`);
  return { facts: v.facts as Fact3[], seed: v.seed };
};
const segment = figure('קטע AB');
const box = figure('תיבה ABCDEFGH');
const empty = { facts: [] as Fact3[], seed: 0 };

const ROWS: readonly [st: { facts: Fact3[]; seed: number }, line: string, text: string][] = [
  [segment, 'AB = 2 3', '2 3'],
  [box, 'AB = 2 3', '2 3'],
  [empty, 'A(2 3, 1, 0)', '2 3'],
  [segment, 'AB = 2.5 3', '2.5 3'],
];

describe('#2286 — 3-D refuses two numbers with only a space between them, before the model', () => {
  it.each(ROWS.map(([st, line, text]) => [line, text, st] as const))('«%s» → guided refusal naming «%s»', (line, text, st) => {
    const v = decideDeterministic3(st, line);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused' || v.error.code !== 'juxtaposed-numbers') throw new Error('not the refusal');
    expect(v.error.detail).toBe(text);
    expect(refusalCategory3(v.error)).toBe('guided');
  });

  it('the sentence names the pair and teaches its readings, Hebrew and English', () => {
    const v = decideSubmit3(segment, 'AB = 2 3');
    if (v.kind !== 'refused') throw new Error('not refused');
    // this grammar reads no `*`, so the product is taught as its value
    expect(plain(errorText3(t, v.error)!)).toBe('לא ברור מה פירוש «2 3». כתבו 2.3 (מספר עשרוני), 23 (מספר אחד) או 6 (מכפלה).');
    expect(plain(errorText3(tEn, v.error)!)).toBe('It is not clear what «2 3» means. Write 2.3 (a decimal), 23 (one number) or 6 (a product).');
  });

  it('every reading the sentence teaches records (#1156)', () => {
    for (const [st, line] of ROWS) {
      const v = decideSubmit3(st, line);
      if (v.kind !== 'refused' || v.error.code !== 'juxtaposed-numbers') throw new Error(line);
      const e = v.error;
      for (const s of [e.decimal, e.joined, e.product, e.comma].filter((x): x is string => !!x)) {
        const fixed = line.replace(e.detail, s);
        expect(decideSubmit3(st, fixed).kind, `«${fixed}»`).toBe('record');
      }
    }
  });

  it('what is not a pair is unchanged', () => {
    expect(decideSubmit3(segment, 'AB = 2.3').kind).toBe('record');
    expect(decideSubmit3(segment, 'AB = 23').kind).toBe('record');
    expect(decideSubmit3(empty, 'A(2, 3, 1)').kind).toBe('record');
  });

  it('no line of the 3-D catalog is a pair of numbers', () => {
    const hits = COMMAND_CATALOG_3D.flatMap((e) => [e.he, e.en]).filter((s) => s && findNumberPair(s));
    expect(hits).toEqual([]);
  });
});
