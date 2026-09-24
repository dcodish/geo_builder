/**
 * #1405 (ADR-CX-047) — «u מספר מרוכב»: a DECLARATION makes a letter complex for the whole figure, and a
 * letter read as a real number says so, once, with the sentence that changes it.
 *
 * The operator, playing round #1397: *"u^5=32 is accepted. the data panel shows u=2. maybe there should
 * be a message saying that if the user meant the u is complex it needs to be defined. so we have a line
 * u מספר מרוכב and system will know to treat it as so."*
 *
 * Measured at pickup (7234e7be): the declaration sentence already PARSED, but as an existence, not a
 * type. «u מספר מרוכב · u^5 = 32» drew a free point u at a sampled position AND showed the real
 * parameter u = 2: one letter, two unrelated meanings. The reversed order did the same, and
 * «z^3 = 8 · z מספר מרוכב» was REFUSED while the other order drew one root. The declaration's meaning
 * depended on its position.
 *
 * Every lock CALLS the decision it guards: the real `submitLine` gate, the real `deriveLines` fold, the
 * real `complexScopeOf` pre-scan and `realParamNotes`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { complexScopeOf, deriveLines } from '../app/deriveLines';
import { declarationOf, realParamNotes } from '../app/paramNote';
import { acceptLine, editLine, submitLine, toggleLine } from '../app/submit';
import { stripFormatControls } from '../../shell/bidi';
import { complexI18n } from '../i18n';
import { CATALOG } from '../parser/catalog';
import { parseLineV2 } from '../parser/rules';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
const feed = (lines: readonly string[]) => {
  for (const l of lines) expect(submitLine(l), `${l} — ${JSON.stringify(store().lastError)}`).toBe(true);
};
const figure = () => deriveLines(store().lines, store().seed, store().seed);
const names = () => figure().points.map((p) => p.name).sort();
const FIVE = ['u1', 'u2', 'u3', 'u4', 'u5'];

beforeEach(() => store().resetSession());

describe('the declaration makes the letter complex in every line, in either order', () => {
  it.each([
    [['u מספר מרוכב', 'u^5 = 32']],
    [['u^5 = 32', 'u מספר מרוכב']],
    [['u is a complex number', 'u^5 = 32']],
    [['u^5 = 32', 'u is a complex number']],
  ])('%j — five roots u₁..u₅, no real parameter, no phantom point u', (lines) => {
    feed(lines);
    expect(store().lines).toEqual(lines);
    const d = figure();
    expect(names()).toEqual(FIVE);
    expect(d.params).toEqual([]);
    expect(d.untranslated).toEqual([]);
    // the roots really are the fifth roots of 32: modulus 2, 72° apart
    for (const p of d.points) expect(Math.hypot(p.z.re, p.z.im)).toBeCloseTo(2, 9);
    expect(d.points.find((p) => p.name === 'u1')!.z.re).toBeCloseTo(2, 9);
  });

  it('the pre-scan reads the declaration wherever it stands, and never records z or w', () => {
    expect([...complexScopeOf(['u^5 = 32', 'u מספר מרוכב']).entries()]).toEqual([['u', 'u מספר מרוכב']]);
    expect([...complexScopeOf(['z מספר מרוכב', 'w1 is a complex number']).keys()]).toEqual([]);
    expect([...complexScopeOf(['u ו-v מספרים מרוכבים']).keys()]).toEqual(['u', 'v']);
  });

  it('declaring a member declares its family: «u1 מספר מרוכב» makes u₂ complex too', () => {
    feed(['u1 מספר מרוכב', 'u2 = 1+i']);
    expect(names()).toEqual(['u1', 'u2']);
    expect(figure().params).toEqual([]);
  });

  it('a declared family is a complex name everywhere the z/w family is: a sequence of u terms reads', () => {
    feed(['u מספר מרוכב', 'u1 = 1+i', 'u2 = 2', 'u1, u2, u3 סדרה הנדסית']);
    const u3 = figure().points.find((p) => p.name === 'u3')!.z;
    expect(u3.re).toBeCloseTo(2, 9);
    expect(u3.im).toBeCloseTo(-2, 9);
  });

  it('declared alone, the letter is drawn as a free number (the F1 behaviour, unchanged)', () => {
    feed(['u מספר מרוכב']);
    expect(names()).toEqual(['u']);
  });

  it('a definition after the declaration defines the complex number', () => {
    feed(['u מספר מרוכב', 'u = 3+4i']);
    const u = figure().points.find((p) => p.name === 'u')!.z;
    expect(u.re).toBeCloseTo(3, 9);
    expect(u.im).toBeCloseTo(4, 9);
  });
});

describe('deleting or muting the declaration returns the letter to a real parameter', () => {
  it('delete the row → u = 2 again', () => {
    feed(['u מספר מרוכב', 'u^5 = 32']);
    store().removeLine(0);
    expect(store().lines).toEqual(['u^5 = 32']);
    expect(figure().params).toEqual([{ name: 'u', value: '2' }]);
    expect(figure().points).toEqual([]);
  });

  it('mute the row → u = 2; unmute → five roots', () => {
    feed(['u^5 = 32', 'u מספר מרוכב']);
    expect(toggleLine(1)).toBe(true);
    const active = store().lines.filter((_, i) => !store().disabled.includes(i));
    expect(deriveLines(active, store().seed, store().seed).params).toEqual([{ name: 'u', value: '2' }]);
    expect(toggleLine(1)).toBe(true);
    expect(names()).toEqual(FIVE);
  });
});

describe('z and w are complex already: declaring them changes nothing about their type', () => {
  it.each([
    [['z מספר מרוכב', 'z^3 = 8']],
    [['z^3 = 8', 'z מספר מרוכב']],
  ])('%j — the three roots in either order (the declaration is a type, never an existing number)', (lines) => {
    feed(lines);
    expect(names()).toEqual(['z1', 'z2', 'z3']);
  });
});

describe('the TEACHING NOTE on a letter read as a real number', () => {
  const noteText = (lng: 'he' | 'en', name: string, value: string) =>
    // the product i18n isolates Latin runs for bidi; the words are what is locked here
    stripFormatControls(complexI18n.getFixedT(lng)('noteRealParam', { name, value }));

  it('«u^5 = 32» alone: u = 2, and the note sits on that line', () => {
    feed(['u^5 = 32']);
    const d = figure();
    expect(d.params).toEqual([{ name: 'u', value: '2' }]);
    expect(realParamNotes(store().lines, d, store().seed)).toEqual([{ line: 0, name: 'u', value: '2' }]);
    expect(noteText('he', 'u', '2')).toBe('u נקרא כמספר ממשי (u = 2). אם u מרוכב, כתבו: u מספר מרוכב');
    expect(noteText('en', 'u', '2')).toBe(
      'u is read as a real number (u = 2). If u is complex, write: u is a complex number',
    );
  });

  it('«u^5 = -32» alone: u = −2 (ADR-CX-045 intact), with the note', () => {
    feed(['u^5 = -32']);
    const d = figure();
    expect(d.params).toEqual([{ name: 'u', value: '-2' }]);
    expect(realParamNotes(store().lines, d, store().seed)).toEqual([{ line: 0, name: 'u', value: '-2' }]);
  });

  it('the note TEACHES A REMEDY THAT WORKS: both spellings it prints pass the real gate and give five roots', () => {
    feed(['u^5 = 32']);
    expect(declarationOf('u')).toBe('u מספר מרוכב');
    for (const remedy of [declarationOf('u'), 'u is a complex number']) {
      expect(acceptLine(['u^5 = 32'], remedy, 0).ok).toBe(true);
      expect(deriveLines(['u^5 = 32', remedy]).points.map((p) => p.name).sort()).toEqual(FIVE);
    }
  });

  it('no note where the remedy would be refused: r in «|z1| = 9r» is a size, and a size is real', () => {
    feed(['z1 = 3+4i', '|z1| = 9r']);
    const d = figure();
    expect(d.params).toEqual([{ name: 'r', value: '5/9' }]);
    expect(realParamNotes(store().lines, d, store().seed)).toEqual([]);
  });

  it('no note for a FREE parameter (nothing was read yet), and none once u is declared', () => {
    feed(['z1 = a + b*i']);
    expect(realParamNotes(store().lines, figure(), store().seed)).toEqual([]);
    store().resetSession();
    feed(['u^5 = 32', 'u מספר מרוכב']);
    expect(realParamNotes(store().lines, figure(), store().seed)).toEqual([]);
  });
});

describe('REFUSAL — a letter used as a size (or an angle) cannot be declared complex', () => {
  it('«r מספר מרוכב» after «|z1| = 9r» is refused, naming the statement that uses r as a size', () => {
    feed(['z1 = 3+4i', '|z1| = 9r']);
    expect(submitLine('r מספר מרוכב')).toBe(false);
    expect(store().lastError).toEqual({ key: 'complex-as-real', detail: '|z1| = 9r', letter: 'r' });
    expect(store().lines).toEqual(['z1 = 3+4i', '|z1| = 9r']);
    expect(figure().params).toEqual([{ name: 'r', value: '5/9' }]);
  });

  it('the other order refuses the size statement, naming it the same way', () => {
    feed(['r מספר מרוכב', 'z1 = 3+4i']);
    expect(submitLine('|z1| = 9r')).toBe(false);
    expect(store().lastError).toEqual({ key: 'complex-as-real', detail: '|z1| = 9r', letter: 'r' });
  });

  it.each([
    [['z1 = 1', 'z2 = 3'], 'אורך z1z2 = 15r'],
    [['z1 = 1'], 'המעגל שמרכזו z1 ורדיוסו r'],
    [['z1 = 1'], 'z2 = 2cis r'],
  ])('after %j, «%s» cannot take a declared r: a length, a radius and an angle are real', (setup, line) => {
    feed(['r מספר מרוכב', ...setup]);
    expect(submitLine(line)).toBe(false);
    expect(store().lastError).toMatchObject({ key: 'complex-as-real', detail: line, letter: 'r' });
  });

  it('the refusal message names the statement, in both languages', () => {
    const e = { detail: '|z1| = 9r', letter: 'r' };
    expect(complexI18n.getFixedT('he')('errComplexAsReal', e)).toContain('"|z1| = 9r"');
    expect(complexI18n.getFixedT('en')('errComplexAsReal', e)).toContain('"|z1| = 9r"');
  });

  it('editing a line into the conflict is refused the same way', () => {
    feed(['r מספר מרוכב', 'z1 = 3+4i', '|z1| = 5']);
    expect(editLine(2, '|z1| = 9r')).toBe(false);
    expect(store().lastError).toMatchObject({ key: 'complex-as-real', detail: '|z1| = 9r' });
  });

  it.each(['i מספר מרוכב', 'o מספר מרוכב', 'ab מספר מרוכב'])(
    '«%s» — the unit, the origin and a word are not letters a number can be named by',
    (line) => {
      expect(submitLine(line)).toBe(false);
    },
  );
});

describe('the catalog row (F1)', () => {
  const row = CATALOG.find((c) => c.he === 'u מספר מרוכב')!;

  it('exists in both languages and both spellings read as the same TYPE statement', () => {
    expect(row.en).toBe('u is a complex number');
    for (const s of [row.he, row.en]) {
      const r = parseLineV2(s);
      expect(r.ok && r.line.typed).toEqual(['u']);
      expect(r.ok && r.line.declares).toEqual([]);
    }
  });

  it('passes the real gate on an empty canvas', () => {
    feed([row.he]);
    store().resetSession();
    feed([row.en]);
  });
});
