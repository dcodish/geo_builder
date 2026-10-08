/**
 * Issue #1891 (ADR-3D-311): a circle INSCRIBED IN a polygon whose incircle 3-D does not draw is refused
 * before any rule, and «משוכלל» / "regular" on a flat polygon is never dropped.
 *
 * Measured on main @ 5edeeca1: «מעגל חסום במחומש ABCDE» (and every spelling of it) recorded the circle
 * through all five vertices, green, because the inscription's private noun list lacked «מחומש» and the verb
 * fallback made the circle the container. The unlettered line and «מעגל חסום בריבוע» after «ריבוע ABCD» went
 * to the model, whose answer was re-read by grammar that drew the circumcircle. «משוכלל» / "regular" was
 * dropped: "regular pentagon ABCDE" drew an irregular pentagon, green.
 *
 * The operator's W19 ruling: until pentagon and hexagon incircles are built (#1908), the refusal is the
 * known-limit sentence «הכלי עדיין לא יודע לשרטט מעגל חסום במחומש — זו מגבלה של הכלי.». A quadrilateral
 * keeps #442's existing message until #1838 draws it.
 */

import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { decideSteps3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import { parse3 } from '../parser/parse3';
import he from '../i18n/locales/he.json';

type St = { facts: Fact3[]; seed: number };
const EMPTY: St = { facts: [], seed: 0 };

/** Play every line but the last (each must record), then decide the last. */
function play(lines: string[]) {
  let st: St = EMPTY;
  for (const l of lines.slice(0, -1)) {
    const v = decideDeterministic3(st, l);
    expect(v.kind, `«${l}» records`).toBe('record');
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return { st, v: decideDeterministic3(st, lines[lines.length - 1]) };
}

const tHe = (k: string, o?: Record<string, unknown>): string => {
  const raw = k.split('.').reduce((acc: unknown, p) => (acc as Record<string, unknown> | undefined)?.[p], he) as string;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, n) => String(o?.[n] ?? ''));
};

const commandTypes = (v: ReturnType<typeof decideDeterministic3>): string[] =>
  v.kind === 'record' ? v.facts.flatMap((f) => f.cmds).map((c) => (c.type === 'circle3' ? `circle3:${c.def.kind}` : c.type === 'solid' ? `solid:${c.kind}` : c.type)) : [];

describe('#1891 — the incircle of a polygon 3-D does not draw is refused before the rules', () => {
  const PENTAGON: string[][] = [
    ['מעגל חסום במחומש ABCDE'],
    ['circle inscribed in pentagon ABCDE'],
    ['circle inscribed in a pentagon ABCDE'],
    ['מעגל חסום במחומש משוכלל ABCDE'],
    ['circle inscribed in regular pentagon ABCDE'],
    ['מעגל החסום במחומש ABCDE'],
    ['המעגל החסום במחומש ABCDE'],
    ['מעגל חסום בתוך מחומש ABCDE'],
    ['מעגל O חסום במחומש ABCDE'],
    ['במחומש ABCDE חסום מעגל'],
    ['מחומש ABCDE חוסם מעגל'],
    ['מחומש ABCDE חוסם את המעגל'],
    ['pentagon ABCDE circumscribes a circle'],
    ['מעגל חסום ב-ABCDE'],
    ['מעגל חסום במצולע ABCDE'],
    ['מחומש ABCDE', 'מעגל חסום במחומש ABCDE'],
    ['מחומש ABCDE', 'מעגל חסום במחומש'],
  ];
  it.each(PENTAGON.map((seq) => [seq.join(' → '), seq] as const))('refused, the known-limit sentence: %s', (_, seq) => {
    const { v } = play([...seq]);
    expect(v).toMatchObject({ kind: 'refused', error: { code: 'incircle-known-limit', sides: 5 } });
    if (v.kind !== 'refused') return;
    expect(errorText3(tHe, v.error)).toBe('הכלי עדיין לא יודע לשרטט מעגל חסום במחומש — זו מגבלה של הכלי.');
  });

  it('the hexagon and seven-or-more sides name their own noun (W19)', () => {
    for (const [line, sides, text] of [
      ['מעגל חסום במשושה ABCDEF', 6, 'הכלי עדיין לא יודע לשרטט מעגל חסום במשושה — זו מגבלה של הכלי.'],
      ['circle inscribed in hexagon ABCDEF', 6, 'הכלי עדיין לא יודע לשרטט מעגל חסום במשושה — זו מגבלה של הכלי.'],
      ['מעגל חסום במצולע ABCDEFG', 7, 'הכלי עדיין לא יודע לשרטט מעגל חסום במצולע עם יותר משש צלעות — זו מגבלה של הכלי.'],
    ] as const) {
      const v = decideDeterministic3(EMPTY, line);
      expect(v, line).toMatchObject({ kind: 'refused', error: { code: 'incircle-known-limit', sides } });
      if (v.kind === 'refused') expect(errorText3(tHe, v.error)).toBe(text);
    }
  });

  it('a quadrilateral line that reached the model now gets the lettered square\'s refusal (until #1838)', () => {
    for (const seq of [['ריבוע ABCD', 'מעגל חסום בריבוע'], ['מעגל חסום במרובע ישר זווית ABCD'], ['מעגל חסום בריבוע ABCD']]) {
      expect(play(seq).v, seq.join(' → ')).toMatchObject({ kind: 'refused', error: { code: 'incircle-needs-triangle' } });
    }
  });

  it('the refusal is a parse result, so a model line re-read through the grammar is refused too', () => {
    expect(parse3('מעגל חסום במחומש ABCDE')).toEqual({ ok: false, reason: 'incircle-not-drawn', sides: 5 });
    expect(decideSteps3(EMPTY, 'מעגל חסום במחומש', ['מחומש ABCDE', 'מעגל חסום במחומש ABCDE']).kind).not.toBe('record');
  });
});

describe('#1891 — what still draws', () => {
  it('the triangle incircle, in every frame, including "the given" / "this" (the direction is the incircle)', () => {
    for (const line of [
      'מעגל חסום במשולש ABC', 'מעגל חסום במשולש הנתון ABC', 'circle inscribed in the given triangle ABC',
      'circle inscribed in this triangle ABC', 'a circle inscribed in the triangle ABC', 'circle inscribed in an equilateral triangle ABC',
      'triangle ABC circumscribed about a circle', 'מעגל חסום ב-ABC',
    ]) {
      expect(commandTypes(decideDeterministic3(EMPTY, line)), line).toContain('circle3:incircle');
    }
  });

  it('the circumcircle direction keeps its meaning', () => {
    for (const line of ['מחומש ABCDE חסום במעגל', 'pentagon ABCDE inscribed in a circle', 'מעגל חוסם את מחומש ABCDE', 'circle circumscribed about triangle ABC', 'triangle ABC inscribed in a circle']) {
      expect(commandTypes(decideDeterministic3(EMPTY, line)), line).toContain('circle3:circum');
    }
  });

  it('«ריבוע משוכלל ABCD חסום במעגל» is a square in its circle; solids keep their kind', () => {
    expect(commandTypes(decideDeterministic3(EMPTY, 'ריבוע משוכלל ABCD חסום במעגל'))).toEqual(['quad-shape', 'circle3:circum']);
    expect(commandTypes(decideDeterministic3(EMPTY, 'מחומש ABCDE'))).toEqual(['solid:polygon5']);
    expect(commandTypes(decideDeterministic3(EMPTY, 'regular tetrahedron ABCD'))[0]).toBe('solid:tetra');
    expect(commandTypes(decideDeterministic3(EMPTY, 'regular pyramid SABCD'))).toEqual(['solid:pyramid4gr']);
    expect(commandTypes(decideDeterministic3(EMPTY, 'regular square pyramid SABCD'))).toEqual(['solid:pyramid4g']);
    expect(commandTypes(decideDeterministic3(EMPTY, 'מנסרה ישרה שבסיסה מחומש'))).toEqual(['solid:prismReg5']);
  });
});

describe('#1891 — «משוכלל» / "regular" on a flat polygon is never dropped', () => {
  it.each([
    'מחומש משוכלל ABCDE', 'מחומש משוכלל ABCDE חסום במעגל', 'regular pentagon ABCDE', 'regular pentagon ABCDE inscribed in a circle',
    'regular triangle ABC', 'regular quadrilateral ABCD', 'משולש משוכלל ABC חסום במעגל', 'מעגל חסום במשולש משוכלל ABC',
    'circle inscribed in regular triangle ABC',
  ])('«%s» never records (it goes to the model, FR-SP-15)', (line) => {
    expect(decideDeterministic3(EMPTY, line).kind).toBe('not-understood');
  });

  it('a model answer that drops the word is refused naming it; one that honours it records', () => {
    const lost = (u: string, steps: string[]) => {
      const v = decideSteps3(EMPTY, u, steps);
      return v.kind === 'refused' && v.error?.code === 'dropped-given' ? v.error.items : v.kind;
    };
    expect(lost('מחומש משוכלל ABCDE', ['מחומש ABCDE'])).toBe('משוכלל');
    expect(lost('מחומש משוכלל ABCDE חסום במעגל', ['מחומש ABCDE חסום במעגל'])).toBe('משוכלל');
    expect(lost('מעגל חסום במשולש משוכלל ABC', ['מעגל חסום במשולש ABC'])).toBe('משוכלל');
    expect(lost('regular triangle ABC', ['triangle ABC'])).toBe('regular');
    expect(lost('regular quadrilateral ABCD', ['quadrilateral ABCD'])).toBe('regular');
    expect(lost('regular triangle ABC', ['equilateral triangle ABC'])).toBe('record');
    expect(lost('regular quadrilateral ABCD', ['square ABCD'])).toBe('record');
    expect(lost('מעגל חסום במשולש משוכלל ABC', ['מעגל חסום במשולש שווה צלעות ABC'])).toBe('record');
  });
});
