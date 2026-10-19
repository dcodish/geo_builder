/**
 * #2234 / #2143 ([ADR-737](../../../docs/06-decisions.md#adr-737)) and #2195 ([ADR-738](../../../docs/06-decisions.md#adr-738)) —
 * the units under the two class tests (`src/app/__tests__/issue-2234-right-angled-at-vertex.test.ts`,
 * `issue-2195-latin-prose-labels.test.ts`):
 *  - the recognizer of "right-angled at X" (`rightAngledAtVertex`): every ruled spelling, and none of the forms that
 *    state a right ANGLE (the noun) or a right triangle with no vertex;
 *  - the bounded English keywords (`enWord`'s leading guard, `ANGLE_KW`'s case-spelled back guard);
 *  - `angleArms`' repeated-letter refusal, through `parse`;
 *  - `latinProseLabels`, the battery's net, and `definedLabels`.
 */
import { describe, expect, it } from 'vitest';
import { definedLabels, latinProseLabels, normalizeUtterance, parse, rightAngledAtVertex } from '@/parser';
import { ANGLE_KW, AT_VERTEX, enWord, RIGHT_ANGLED, rx } from '@/parser/lexicon';
import type { AnyCommand } from '@/engine';

const rec = (line: string) => rightAngledAtVertex(normalizeUtterance(line));

describe('#2234 — rightAngledAtVertex: the phrase, by its words', () => {
  const POSITIVE: [string, string, string[] | null, string][] = [
    // line, vertex, the triangle the line names, rest
    ['משולש ABC ישר זווית ב-B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ABC ישר-זווית ב-B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ABC ישר זוית ב-B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ABC ישר זווית ב B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ישר זווית ABC ב-B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ABC שבו ישר זווית ב-B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ABC ישר זווית שהזווית הישרה שלו ב-B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ABC ישרת זווית ב-B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ABC ישר זווית בקודקוד B', 'B', ['A', 'B', 'C'], ''],
    ['המשולש ABC ישר זווית ב-B', 'B', ['A', 'B', 'C'], ''],
    ['המשולש ABC הוא ישר זווית ב-B', 'B', ['A', 'B', 'C'], ''],
    ['משולש ABC ישר זווית ב-B ו-AB = 4', 'B', ['A', 'B', 'C'], 'AB = 4'],
    ['המשולש ישר זווית ב-B', 'B', null, ''],
    ['המשולש ישר זווית בקודקוד B', 'B', null, ''],
    ['ישר זווית ב-B', 'B', null, ''],
    ['right triangle ABC at B', 'B', ['A', 'B', 'C'], ''],
    ['triangle ABC is right-angled at B', 'B', ['A', 'B', 'C'], ''],
    ['triangle ABC right-angled at B', 'B', ['A', 'B', 'C'], ''],
    ['the triangle ABC is right angled at B', 'B', ['A', 'B', 'C'], ''],
    ['the triangle is right-angled at B', 'B', null, ''],
    ['the triangle is right-angled at vertex B', 'B', null, ''],
    ['triangle ABC right-angled at B and AB = 4', 'B', ['A', 'B', 'C'], 'AB = 4'],
    ['triangle ABC right-angled at B with AB = 4', 'B', ['A', 'B', 'C'], 'AB = 4'],
    ['right-angled at B', 'B', null, ''],
    ['right angled at B', 'B', null, ''],
    ['ABC is right-angled at B', 'B', ['A', 'B', 'C'], ''],
    ['ABC right-angled at B', 'B', ['A', 'B', 'C'], ''],
    ['right-angled at b', 'B', null, ''],
  ];
  it.each(POSITIVE)('«%s» → vertex %s', (line, vertex, named, rest) => {
    expect(rec(line)).toEqual({ vertex, named, rest });
  });

  const NEGATIVE = [
    // a right triangle with no vertex (ADR-685 / #2205)
    'המשולש ישר זווית', 'משולש ישר זווית ABC', 'משולש ABC ישר זווית', 'right triangle ABC', 'the triangle is right-angled',
    'ABC is right-angled', 'TRI is right-angled',
    // a right ANGLE, the noun
    'זווית B ישרה', 'הזווית ב-B ישרה', 'זווית ישרה ב-B', 'angle B is a right angle', 'right angle at B', '∠ABC = 90',
    'the triangle has a right angle at B',
    // another polygon noun (B7: not this ruling's)
    'טרפז ABCD ישר זווית ב-B', 'מלבן ABCD ישר זווית ב-B', 'טרפז ישר זווית ABCD',
    // no locative
    'משולש ישר זווית ABC שבו הזווית הישרה היא B', 'משולש ABC שווה שוקיים ב-B', 'משולש ישר זווית ABC במעגל O',
  ];
  it.each(NEGATIVE)('«%s» is not the phrase', (line) => {
    expect(rec(line)).toBeNull();
  });

  it('the atoms carry no capture group (the lexicon registry rule)', () => {
    for (const a of [RIGHT_ANGLED, AT_VERTEX, ANGLE_KW]) expect(new RegExp(`${a}|`).exec('')!.length).toBe(1);
  });
});

describe('#2195 — Latin keywords are whole words', () => {
  const kw = new RegExp(ANGLE_KW);
  it.each(['triangle', 'triangles', 'rectangle', 'quadrangle', 'angled', 'right-angled', 'TRIangle', 'the other triangle'])('ANGLE_KW: no match inside «%s»', (w) => {
    expect(kw.test(w)).toBe(false);
  });
  it.each(['angle ABC = 40', 'Angle B', 'angles are equal', 'angleABC = 40', '∠ABC', 'זווית ABC', 'זוית B', 'הזווית ב-B', 'ANGLE ABC'])('ANGLE_KW matches «%s»', (w) => {
    expect(kw.test(w)).toBe(true);
  });
  it('enWord guards the leading side too (non-parallel is not parallel)', () => {
    const p = rx(enWord('parallel'));
    expect(p.test('AB parallel CD')).toBe(true);
    expect(p.test('nonparallel')).toBe(false);
    expect(p.test('parallelogram')).toBe(false);
  });
});

describe('#2195 — angleArms refuses a run whose letters are not three points', () => {
  it('«show ALL angles» / «∠ALL = 40» name no angle', () => {
    expect(parse('show ALL angles', {}).ok).toBe(false);
    expect(parse('∠ALL = 40', {}).ok).toBe(false);
  });
  it('control: three distinct letters still name the angle', () => {
    const r = parse('∠ABC = 40', {});
    expect(r.ok && r.commands.some((c) => c.type === 'set-angle')).toBe(true);
  });
});

describe('#2195 — latinProseLabels and definedLabels', () => {
  const tri: AnyCommand[] = [
    { type: 'segment', a: 'R', b: 'T' },
    { type: 'segment', a: 'R', b: 'I' },
    { type: 'set-angle', vertex: 'R', ray1: 'T', ray2: 'I', value: 90 },
  ];
  it('the report: ∠TRI read out of «triangle» is flagged, naming the word', () => {
    expect(latinProseLabels('the triangle is right-angled', tri, ['A', 'B', 'C'])).toEqual(['triangle']);
  });
  it('a letter the student typed as a capital, a figure point or a defined point is stated', () => {
    expect(latinProseLabels('TRI is right-angled', tri, ['A', 'B', 'C'])).toEqual([]);
    expect(latinProseLabels('the triangle is right-angled', tri, ['T', 'R', 'I'])).toEqual([]);
    const foot: AnyCommand[] = [{ type: 'foot', id: 'H', from: 'A', a: 'B', b: 'C' }];
    expect(latinProseLabels('draw the altitude from A', foot, ['A', 'B', 'C'])).toEqual([]);
  });
  it('a capital that only starts a word is not a typed label («The»)', () => {
    expect(latinProseLabels('The triangle is right-angled', tri, [])).toEqual(['triangle']);
  });
  it('scaffolding ids are never labels', () => {
    expect(latinProseLabels('two circles meet', [{ type: 'circle', id: 'circle-@ctr-O', center: '@ctr-O', radius: 3 }], [])).toEqual([]);
  });
  it('definedLabels: vertices, a point id, a centre — never a reference', () => {
    const cmds: AnyCommand[] = [
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 2 },
      { type: 'set-angle', vertex: 'R', ray1: 'T', ray2: 'I', value: 90 },
      { type: 'bisector', id: 'bis-ABC', vertex: 'B', p: 'A', q: 'C' },
    ];
    expect([...definedLabels(cmds)].sort()).toEqual(['A', 'B', 'C', 'M', 'O']);
  });
});
