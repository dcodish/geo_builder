/**
 * #2286 ([ADR-AG-397](../../docs/06c-decisions-analytic.md#adr-ag-397), operator ruling 2026-11-03: *"Refuse it, naming
 * the line, in every builder"*) — two numbers with only a space between them are REFUSED, never multiplied.
 *
 * Measured at ebacadd1 through `decideSubmit`: «A(2 3, 1)» recorded A = (6, 1), «x = 2 3» the line x = 6, «y = 2 3x + 1»
 * the line y = 6x + 1, «x² + y² = 2 3» a circle of radius √6 — green, for values the student never stated. The cause:
 * `tokenize`'s implicit product takes any operand after another, and the one guard (`findMixedNumber`, ADR-AG-284) knew
 * only «integer, space, fraction». The detector is now the suite's (`shell/juxtaposedNumbers`), asked by the tokenizer
 * and by `parseLine` before every rule and before the model.
 */
import { describe, expect, it } from 'vitest';
import { parseExpr } from '../engine/expr';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit, reachesFallback } from '../app/submit';
import { runFallback } from '../app/fallback';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { findJuxtaposedNumbers } from '../../shell/juxtaposedNumbers';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Every slot the issue measured multiplying, with the pair as typed and the twin written with a comma or a decimal. */
const SLOTS: readonly [line: string, text: string, twin: string][] = [
  ['A(2 3, 1)', '2 3', 'A(2.3, 1)'],
  ['A(2 3;1)', '2 3', 'A(2.3;1)'],
  ['A(1, 2 3)', '2 3', 'A(1, 2.3)'],
  ['A(-2 3, 1)', '2 3', 'A(-2.3, 1)'],
  ['A(2.5 3, 1)', '2.5 3', 'A(2.5, 1)'],
  ['x = 2 3', '2 3', 'x = 2.3'],
  ['y = 2 3', '2 3', 'y = 2.3'],
  ['y = 2 3x + 1', '2 3', 'y = 2.3x + 1'],
  ['y = 1/2 3', '2 3', 'y = 1/2'],
  ['x² + y² = 2 3', '2 3', 'x² + y² = 2.3'],
  ['שיעור ה-x של P הוא 2 3', '2 3', 'שיעור ה-x של P הוא 2.3'],
  ['the x-coordinate of P is 2 3', '2 3', 'the x-coordinate of P is 2.3'],
];

describe('#2286 — a pair of numbers is refused in every analytic slot, before the model', () => {
  it.each(SLOTS)('«%s» → juxtaposed-numbers, naming «%s» (its twin «%s» records)', (line, text, twin) => {
    expect(decideSubmit(twin, [], 0).kind).toBe('record');
    const r = parseLine(line);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('juxtaposed-numbers');
      expect(r.detail).toBe(text);
    }
    const v = decideSubmit(line, [], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('juxtaposed-numbers');
    // OWNED, so the line never reaches the paid model (which could re-multiply it)
    expect(reachesFallback(v)).toBe(false);
  });

  it('on a populated figure too: a length, a line', () => {
    const lines = ['A(1,2)', 'B(4,6)'];
    for (const line of ['AB = 2 3', 'x = 2 3']) {
      const v = decideSubmit(line, lines, 0);
      expect(v.kind === 'refused' && v.error.key, line).toBe('juxtaposed-numbers');
    }
  });

  it('a model line carrying one is rejected by the same gate (the fallback re-decides every step)', async () => {
    const out = await runFallback('נקודה A ששיעוריה שתיים שלוש ואחת', [], 0, async () => ({ steps: ['A(2 3, 1)'] }));
    expect(out).toMatchObject({ kind: 'rejected', refusedStep: 'A(2 3, 1)', code: 'juxtaposed-numbers' });
  });

  it('the tokenizer itself refuses the shape — no reader of a value can multiply it', () => {
    expect(parseExpr('2 3')).toBeNull();
    expect(parseExpr('2 3x + 1')).toBeNull();
    expect(parseExpr('2.5 3')).toBeNull();
  });

  it('the sentence names the pair and teaches its three readings, Hebrew and English', () => {
    const v = decideSubmit('A(2 3, 1)', [], 0);
    if (v.kind !== 'refused') throw new Error('not refused');
    expect(errorText(v.error, t)).toBe('לא ברור מה פירוש «2 3». כתבו 2.3 (מספר עשרוני), 23 (מספר אחד) או 2*3 (מכפלה).');
    expect(errorText(v.error, tEn)).toBe('It is not clear what «2 3» means. Write 2.3 (a decimal), 23 (one number) or 2*3 (a product).');
  });

  it('a decimal in the pair teaches the product alone', () => {
    const v = decideSubmit('A(2.5 3, 1)', [], 0);
    if (v.kind !== 'refused') throw new Error('not refused');
    expect(errorText(v.error, t)).toBe('לא ברור מה פירוש «2.5 3». אם הכוונה למכפלה, כתבו 2.5*3.');
    expect(errorText(v.error, tEn)).toBe('It is not clear what «2.5 3» means. If you mean a product, write 2.5*3.');
  });

  it('a point with its comma missing («A(2 3)») teaches the comma — no single number fits that slot', () => {
    const v = decideSubmit('A(2 3)', [], 0);
    if (v.kind !== 'refused') throw new Error('not refused');
    expect(errorText(v.error, t)).toBe('לא ברור מה פירוש «2 3». אם אלה שני מספרים, הפרידו ביניהם בפסיק: 2, 3.');
    expect(errorText(v.error, tEn)).toBe('It is not clear what «2 3» means. If these are two numbers, separate them with a comma: 2, 3.');
  });

  it('every spelling a sentence teaches records, in place of the pair (#1156)', () => {
    for (const [line] of SLOTS) {
      const v = decideSubmit(line, [], 0);
      if (v.kind !== 'refused' || v.error.key !== 'juxtaposed-numbers') throw new Error(line);
      const e = v.error;
      const taught = [e.decimal, e.joined, e.product, e.comma].filter((s): s is string => !!s);
      expect(taught.length, line).toBeGreaterThan(0);
      for (const s of taught) {
        const fixed = line.replace(e.detail, s);
        expect(decideSubmit(fixed, [], 0).kind, `«${fixed}»`).toBe('record');
      }
    }
  });
});

describe('#2286 — what is not a pair is unchanged', () => {
  it.each(['x = 2 √3', 'y = 2 x', 'y = 2x', 'y = 2 (x+1)', 'A(2, 3)', 'A(2,3) B(4, 5)', 'y = 1/2x', 'x = 2.5', 'x = 5/2', 'x = 2*3', 'A(2;3)'])(
    '«%s» still records',
    (line) => {
      expect(decideSubmit(line, [], 0).kind).toBe('record');
    },
  );

  it('«2 1/2» keeps its mixed-number sentence (ADR-AG-284)', () => {
    const v = decideSubmit('x = 2 1/2', [], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('mixed-number');
  });

  it('no line of the analytic catalog is a pair of numbers', () => {
    const hits = COMMAND_CATALOG_ANALYTIC.flatMap((e) => [e.he, e.en]).filter((s) => s && findJuxtaposedNumbers(s)?.kind === 'numbers');
    expect(hits).toEqual([]);
  });
});
