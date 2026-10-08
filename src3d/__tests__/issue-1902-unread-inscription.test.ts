/**
 * Issue #1902 (ADR-3D-312): an inscription sentence accounts for EVERY word, or it is refused naming the words it
 * could not read; the declaration gate counts a qualifier only inside a phrase a reader lowers; «שוה» reads as
 * «שווה».
 *
 * Measured on main @ 5edeeca1: «מעגל חסום במשולש שווה צלעת ABC» (a typo for «צלעות») drew a SCALENE triangle's
 * incircle, green — `polygonCircle3` was the one declaration rule outside ADR-3D-125's fail-closed gate, so every
 * word it did not read was discarded. The same held for «כלשהו», «קטן», «קמור», «שקוטרו AC», «עם אלכסונים» and the
 * English typos (which also drew the circumcircle). «משולש שווה ABC» / «טרפז ישר ABCD» drew the bare shape: the
 * declaration gate counted «שווה» / «ישר» as read word by word. «משולש שוה צלעות ABC» drew a scalene triangle.
 *
 * Operator ruling 2026-10-08: the outcome is the honesty invariant, a refusal reusing an existing 3-D message
 * (`dropped-given`); spelling correction is not ruled.
 */

import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { decideSteps3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import he from '../i18n/locales/he.json';

type St = { facts: Fact3[]; seed: number };
const EMPTY: St = { facts: [], seed: 0 };

function play(lines: string[]) {
  let st: St = EMPTY;
  for (const l of lines.slice(0, -1)) {
    const v = decideDeterministic3(st, l);
    expect(v.kind, `«${l}» records`).toBe('record');
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return decideDeterministic3(st, lines[lines.length - 1]);
}

const kinds = (v: ReturnType<typeof decideDeterministic3>): string[] =>
  v.kind === 'record' ? v.facts[v.facts.length - 1].cmds.map((c) => (c.type === 'circle3' ? `circle3:${c.def.kind}` : c.type === 'solid' ? `solid:${c.kind}` : c.type)) : [];

const tHe = (k: string, o?: Record<string, unknown>): string => {
  const raw = k.split('.').reduce((acc: unknown, p) => (acc as Record<string, unknown> | undefined)?.[p], he) as string;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, n) => String(o?.[n] ?? ''));
};

describe('#1902 — the reported sequence', () => {
  it('«מעגל חסום במשולש שווה צלעת ABC» on an empty canvas is refused naming «שווה צלעת»; nothing is recorded', () => {
    const v = play(['מעגל חסום במשולש שווה צלעת ABC']);
    expect(v).toEqual({ kind: 'refused', error: { code: 'dropped-given', items: 'שווה צלעת' } });
    if (v.kind === 'refused') {
      expect(errorText3(tHe, v.error)).toBe('המשפט לא נוסף לציור, כי לא הצלחנו לצייר: שווה צלעת. נסו לפצל את המשפט לנתונים קצרים יותר או לנסח מחדש');
    }
  });
});

describe('#1902 — every word an inscription does not read refuses it, naming the words', () => {
  it.each([
    [['מעגל החסום במשולש שווה צלעת ABC'], 'שווה צלעת'],
    [['מעגל חסום בתוך משולש שווה צלעת ABC'], 'שווה צלעת'],
    [['במשולש שווה צלעת ABC חסום מעגל'], 'שווה צלעת'],
    [['משולש שווה צלעת ABC חוסם מעגל'], 'שווה צלעת'],
    [['מעגל חסום במשולש ABC שווה צלעת'], 'שווה צלעת'],
    [['משולש שווה צלעת ABC חסום במעגל'], 'שווה צלעת'],
    [['משולש ABC שווה צלעת חסום במעגל'], 'שווה צלעת'],
    [['מעגל חוסם את משולש שווה צלעת ABC'], 'שווה צלעת'],
    [['משולש ABC', 'מעגל חסום במשולש שווה צלעת ABC'], 'שווה צלעת'],
    [['מעגל חסום במשולש ABC', 'מעגל חסום במשולש שווה צלעת ABC'], 'שווה צלעת'], // not «already stated»
    [['מעגל חסום במשולש שווה ABC'], 'שווה'],
    [['מעגל חסום במשולש ישר ABC'], 'ישר'],
    [['מעגל חסום במשולש שווה שוקים ABC'], 'שווה שוקים'],
    [['מעגל חסום במשולש חד זווית ABC'], 'חד זווית'],
    [['מעגל חסום במשולש קהה זווית ABC'], 'קהה זווית'],
    [['מעגל חסום במשולש כלשהו ABC'], 'כלשהו'],
    [['מעגל חסום במשולש קטן ABC'], 'קטן'],
    [['משולש חד-זוויות ABC חסום במעגל'], 'חד זוויות'],
    [['מרובע קמור ABCD חסום במעגל'], 'קמור'],
    [['מלבן קטן ABCD חסום במעגל'], 'קטן'],
    [['מחומש קמור ABCDE חסום במעגל'], 'קמור'],
    [['משולש ABC חסום במעגל שקוטרו AC'], 'שקוטרו'],
    [['ריבוע ABCD חסום במעגל עם אלכסונים'], 'אלכסונים'],
    [['מעגל חסום במשולש ABC ומשיק לצלעותיו'], 'ומשיק לצלעותיו'],
    [['circle inscribed in equilaterl triangle ABC'], 'equilaterl'],
    [['circle inscribed in isoceles triangle ABC'], 'isoceles'],
    [['circle inscribed in acute triangle ABC'], 'acute'],
    [['circle inscribed in scalene triangle ABC'], 'scalene'],
    [['circle inscribed in rigth triangle ABC'], 'rigth'],
    [['equilaterl triangle ABC inscribed in a circle'], 'equilaterl'],
    [['isoceles trapezoid ABCD inscribed in a circle'], 'isoceles'],
    [['convex quadrilateral ABCD inscribed in a circle'], 'convex'],
  ])('%j → «%s»', (seq, items) => {
    expect(play(seq)).toEqual({ kind: 'refused', error: { code: 'dropped-given', items } });
  });

  it('a model line carrying an unread word refuses the step', () => {
    expect(decideSteps3(EMPTY, 'מעגל חסום במשולש ABC', ['מעגל חסום במשולש שווה צלעת ABC'])).toEqual({ kind: 'refused', error: { code: 'dropped-given', items: 'שווה צלעת' } });
  });
});

describe('#1902 — «שוה» reads as «שווה» (ADR-405\'s third fold)', () => {
  it.each([
    ['מעגל חסום במשולש שוה צלעות ABC', ['solid:polygon3', 'length-rel', 'length-rel', 'circle3:incircle']],
    ['משולש שוה צלעות ABC', ['solid:polygon3', 'length-rel', 'length-rel']],
    ['ABC משולש שוה צלעות', ['solid:polygon3', 'length-rel', 'length-rel']],
    ['משולש שוה צלעות ABC חסום במעגל', ['solid:polygon3', 'length-rel', 'length-rel', 'circle3:circum']],
    ['מעגל חסום במשולש שוה שוקיים ABC', ['solid:polygon3', 'length-rel', 'circle3:incircle']],
    ["מנסרה ישרה ABCA'B'C' שבסיסה משולש שוה צלעות", ['solid:prism3e']],
    ['פירמידה SABC שבסיסה משולש שוה צלעות', ['solid:tetra', 'length-rel', 'length-rel']],
  ])('«%s»', (line, expected) => {
    expect(kinds(play([line]))).toEqual(expected);
  });
});

describe('#1902 — what still draws, and the refusals that keep their own message', () => {
  it.each([
    'מעגל חסום במשולש ABC', 'מעגל חסום במשולש שווה צלעות ABC', 'מעגל חסום במשולש שווה-צלעות ABC', 'מעגל חסום במשולש שווהצלעות ABC',
    'מעגל חסום במשולש ישר-זוית ABC', 'מעגל חסום במשולש ישר זוות ABC', 'מעגל חסום במשולש ABC, שווה צלעות',
    'מעגל חסום ב-ABC', 'מעגל חוסם את ABC', 'משולש ABC חסום במעגל O', 'במשולש ABC חסום מעגל O', 'מעגל חסום במשולש הנתון ABC',
    'circle inscribed in an equilateral triangle ABC', 'a circle inscribed in the triangle ABC', 'triangle ABC circumscribed about a circle',
    'circle inscribed in the given triangle ABC', 'circle inscribed in this triangle ABC',
    'מקבילית ABCD חסומה במעגל', 'דלתון ABCD חסום במעגל', 'טרפז שווה שוקיים ABCD חסום במעגל', 'ריבוע משוכלל ABCD חסום במעגל',
  ])('«%s» records', (line) => {
    expect(play([line]).kind).toBe('record');
  });

  it('«מרובע ישר זווית ABCD חסום במעגל» still goes to the model (FR-SP-15)', () => {
    expect(play(['מרובע ישר זווית ABCD חסום במעגל']).kind).toBe('not-understood');
  });

  it.each([
    [['המשולש ABC חסום במעגל שמרכזו M'], { code: 'dropped-given', items: 'M' }],
    [['מעגל חסום במשולש ABC שמרכזו O'], { code: 'dropped-given', items: 'O' }],
    [['מעגל חסום במשולש ABC שרדיוסו 2'], { code: 'dropped-given', items: '2' }],
    [['משולש ABC', 'מעגל חוסם את המשולש ABC ו-AD מאונך ל-BC'], { code: 'dropped-given', items: 'D' }],
    [['מעגל חסום בריבוע ABCD'], { code: 'incircle-needs-triangle' }],
  ])('%j keeps its refusal', (seq, error) => {
    expect(play(seq)).toEqual({ kind: 'refused', error });
  });

  it('«טרפז ישר זוות ABCD חסום במעגל» keeps `inscribed-contradicts-noun`', () => {
    expect(play(['טרפז ישר זוות ABCD חסום במעגל'])).toMatchObject({ kind: 'refused', error: { code: 'inscribed-contradicts-noun' } });
  });
});

describe('#1902 — the declaration gate counts a qualifier only inside a phrase a reader lowers', () => {
  it.each(['משולש שווה ABC', 'משולש ישר ABC', 'טרפז שווה ABCD', 'טרפז ישר ABCD', 'פירמידה SABC שבסיסה משולש שווה', 'זווית SAB במשולש'])(
    '«%s» is no longer drawn without its word (it goes to the model)',
    (line) => {
      expect(play([line]).kind).toBe('not-understood');
    },
  );
  it.each([
    ['מנסרה משולשת ישרה', ['solid:prism3']],
    ['טטראדר שווה מקצועות ABCD', ['solid:tetra', 'length-rel', 'length-rel', 'length-rel', 'length-rel', 'length-rel']],
    ['נתון טטראדר שווה מקצועות ABCD', ['solid:tetra', 'length-rel', 'length-rel', 'length-rel', 'length-rel', 'length-rel']],
    ['regular tetrahedron ABCD', ['solid:tetra', 'length-rel', 'length-rel', 'length-rel', 'length-rel', 'length-rel']],
    ['פירמידה ישרה מרובעת ABCDS', ['solid:pyramidQuadR', 'concyclic']],
    ["מנסרה ישרה שבסיסה משולש ישר זווית ABCA'B'C'", ['solid:prism3', 'cos-angle']],
  ])('«%s» still builds', (line, expected) => {
    expect(kinds(play([line]))).toEqual(expected);
  });
});
