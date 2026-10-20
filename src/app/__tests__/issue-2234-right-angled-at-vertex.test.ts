/**
 * #2234 / #2143 ([ADR-737](../../../docs/06-decisions.md#adr-737)) — "RIGHT-ANGLED AT X" IS NEVER A GIVEN, AND NEVER THE AI'S.
 *
 * Operator ruling, 2026-10-18 (#2234): *"the syntax of המשולש ישר זווית ב-B is not accepted. user should separate this to
 * 2 lines and the term ישר זווית ב- X is not have to define an angle. This might require some removal of code but i do
 * not want to accept this syntax - not even through AI."* #2143 (read English "right-angled at B") is reversed by it.
 *
 * Measured at b7d6223c through `decideDeterministic2D`, the model mocked: «המשולש ישר זווית ב-B», «ישר זווית ב-B»,
 * "triangle ABC is right-angled at B", "the triangle is right-angled at B" escalated to the AI; "right-angled at B"
 * after △ABC committed ∠ABC = 90 green; "triangle ABC right-angled at B and AB = 4" got a list of fragments
 * («(1) triangle ABC right-  (2) angled at B and AB = 4»). Every spelling is now refused by its words, before any reading,
 * with the two-line teach — and the model is never called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';

const st = () => useGeoStore.getState();

async function decideHere(line: string) {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
async function drive(prefix: readonly string[]) {
  st().clear();
  for (const p of prefix) {
    const v = await decideHere(p);
    expect(['commit', 'noop'], `the prefix line «${p}» builds`).toContain(v.kind);
    commitVerdict(v, p);
  }
}

type Note = { key: string; params?: Record<string, unknown> };
async function expectRefused(prefix: readonly string[], line: string, note: Note, log?: string) {
  await drive(prefix);
  const before = JSON.stringify(st().facts);
  const v = await decideHere(line);
  expect(v.kind, `«${line}» after ${JSON.stringify(prefix)}: ${JSON.stringify(v).slice(0, 300)}`).toBe('refuse');
  if (v.kind !== 'refuse') return;
  expect(v.note).toEqual(note);
  if (log) expect(v.logs.at(-1)).toMatchObject({ result: log });
  commitVerdict(v, line);
  expect(JSON.stringify(st().facts), 'nothing is committed').toBe(before);
  expect(llmParseMock, 'never sent to the AI').not.toHaveBeenCalled();
}

const taught = (triangle: string, angle: string, more = ''): Note => ({ key: 'input.scope.right-angle-vertex', params: { triangle, angle, more } });
const TAUGHT_LOG = 'scope:right-angle-vertex';

const TRI = ['משולש ABC'];
const TWO = ['משולש ABC', 'משולש BDE'];
const SQUARE = ['ריבוע ABCD'];
const SEGS = ['קטע AB', 'קטע BC'];

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe("the operator's five measured lines (ruling 2026-10-18), verbatim", () => {
  it.each([
    [[] as string[], 'משולש ABC ישר זווית ב-B'],
    [[] as string[], 'משולש ABC ישר-זווית ב-B'],
    [TRI, 'המשולש ישר זווית ב-B'],
    [[] as string[], 'triangle ABC is right-angled at B'],
    [TRI, 'the triangle is right-angled at B'],
  ])('%j · «%s» → refused, taught «(1) משולש ABC  (2) ∠ABC = 90°»', async (prefix, line) => {
    await expectRefused(prefix, line, taught('ABC', 'ABC'), TAUGHT_LOG);
  });
});

describe('every spelling of the phrase, refused with the two lines that build it', () => {
  it.each([
    // A1 — the forms taught before, now decided by the phrase
    [[], 'משולש ABC ישר זוית ב-B'], [[], 'משולש ABC ישר זווית ב B'], [[], 'משולש ישר זווית ABC ב-B'], [[], 'משולש ABC שבו ישר זווית ב-B'],
    // A3, A4
    [TRI, 'המשולש ABC ישר זווית ב-B'], [TRI, 'המשולש ABC הוא ישר זווית ב-B'], [[], 'right triangle ABC at B'],
    // A6, A7 — handed to the AI before
    [TRI, 'המשולש ישר זווית בקודקוד B'], [[], 'משולש ABC ישר זווית בקודקוד B'], [TRI, 'משולש ABC ישרת זווית ב-B'], [TRI, 'ישר זווית ב-B'],
    // A8, A9
    [[], 'triangle ABC right-angled at B'], [TRI, 'triangle ABC is right-angled at B'], [TRI, 'the triangle ABC is right angled at B'],
    [TRI, 'the triangle is right-angled at vertex B'],
    // A11 — committed ∠ABC = 90 before
    [TRI, 'right-angled at B'], [TRI, 'right angled at B'],
    // A12 — a fragment list before
    [TRI, 'ABC is right-angled at B'], [TRI, 'ABC right-angled at B'],
  ] as [string[], string][])('%j · «%s»', async (prefix, line) => {
    await expectRefused(prefix, line, taught('ABC', 'ABC'), TAUGHT_LOG);
  });

  it.each([
    ['A', 'CAB'],
    ['C', 'BCA'],
  ])('the angle is named at the student’s vertex (%s → ∠%s)', async (v, angle) => {
    await expectRefused([], `משולש ABC ישר זווית ב-${v}`, taught('ABC', angle), TAUGHT_LOG);
    await expectRefused(TRI, `the triangle is right-angled at ${v}`, taught('ABC', angle), TAUGHT_LOG);
  });

  it.each([
    [[], 'משולש ABC ישר זווית ב-B ו-AB = 4'],
    [[], 'משולש ABC ישר זווית ב-B, AB = 4'],
    [[], 'triangle ABC right-angled at B and AB = 4'],
    [[], 'triangle ABC right-angled at B with AB = 4'],
    [TRI, 'triangle ABC is right-angled at B and AB = 4'],
  ] as [string[], string][])('%j · «%s» → the teach, continuing «(3) AB = 4»', async (prefix, line) => {
    await expectRefused(prefix, line, taught('ABC', 'ABC', '  (3) AB = 4'), TAUGHT_LOG);
  });
});

describe('when no triangle can be named — the message 2-D gives that vertex today, never the AI', () => {
  it('no angle at the vertex: «בקודקוד B עדיין אין זווית»', async () => {
    await expectRefused([], 'right-angled at B', { key: 'input.noAngleYet', params: { vertex: 'B' } });
    await expectRefused([], 'ישר זווית ב-B', { key: 'input.noAngleYet', params: { vertex: 'B' } });
    await expectRefused(TRI, 'right-angled at D', { key: 'input.noAngleYet', params: { vertex: 'D' } });
  });
  it('several angles at the vertex: the list, with «∠ABC = 90» as the example', async () => {
    const note = { key: 'input.ambiguousAngleOptions', params: { vertex: 'B', options: '∠ABC, ∠ABD, ∠ABE, ∠CBD, ∠CBE, ∠DBE', example: 'ABC' } };
    await expectRefused(TWO, 'right-angled at B', note);
    await expectRefused(TWO, 'ישר זווית ב-B', note);
  });
  it('the definite noun with two triangles drawn: ADR-685’s question, naming them', async () => {
    await drive(TWO);
    const v = await decideHere('המשולש ישר זווית ב-B');
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.note).toMatchObject({ key: 'input.ambiguousDefiniteShape', params: { shapes: 'ABC, BDE', example: 'המשולש ABC ישר זווית ב-B' } });
    expect(llmParseMock).not.toHaveBeenCalled();
    // and its next step is the named form, which is taught as two lines
    await expectRefused(TWO, 'המשולש ABC ישר זווית ב-B', taught('ABC', 'ABC'), TAUGHT_LOG);
  });
  it.each([
    [SQUARE, 'right-angled at B'],
    [SQUARE, 'המשולש ישר זווית ב-B'],
    [SEGS, 'right-angled at B'],
    [SEGS, 'ישר זווית ב-B'],
  ] as [string[], string][])('one angle no triangle holds (%j · «%s»): «לא הצלחתי לקרוא את זה עדיין…» (rule 7 P1 reuse)', async (prefix, line) => {
    await expectRefused(prefix, line, { key: 'input.notUnderstood' }, TAUGHT_LOG);
  });
});

describe('unchanged: a right triangle with no vertex, a right ANGLE stated as an angle, another polygon', () => {
  it.each([
    [TRI, 'המשולש ישר זווית', 'right-triangle'],
    [[], 'משולש ישר זווית ABC', 'right-triangle'],
    [[], 'משולש ABC ישר זווית', 'right-triangle'],
    [[], 'right triangle ABC', 'right-triangle'],
    [[], 'טרפז ישר זווית ABCD', 'trapezoid'],
    [TRI, 'זווית B ישרה', 'set-angle'],
    [TRI, 'הזווית ב-B ישרה', 'set-angle'],
    [TRI, 'זווית ישרה ב-B', 'set-angle'],
    [TRI, 'angle B is a right angle', 'set-angle'],
    [TRI, 'right angle at B', 'set-angle'],
    [TRI, '∠ABC = 90', 'set-angle'],
    [TRI, 'ABC is right-angled', 'set-angle'],
    [TRI, 'angle ABC is right-angled', 'set-angle'],
  ] as [string[], string, string][])('%j · «%s» commits (%s)', async (prefix, line, type) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    if (v.kind !== 'commit') return;
    expect(v.commands.map((c) => c.type)).toContain(type);
  });
  it('«ABC is right-angled» keeps ∠ABC = 90 and its canonical note exactly (#2234 amendment 1)', async () => {
    await drive(TRI);
    const v = await decideHere('ABC is right-angled');
    expect(v.kind).toBe('commit');
    if (v.kind !== 'commit') return;
    expect(v.commands).toEqual([
      { type: 'segment', a: 'B', b: 'A' },
      { type: 'segment', a: 'B', b: 'C' },
      { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 90 },
    ]);
    expect(v.note).toEqual({ key: 'input.canonicalHint', params: { canonical: '∠ABC = 90' } });
  });
  it('«the triangle has a right angle at B» (the noun) is not the phrase: unchanged, it goes to the AI', async () => {
    await drive(TRI);
    const v = await decideHere('the triangle has a right angle at B');
    expect(v.kind).toBe('escalate');
  });
  it('«טרפז ABCD ישר זווית ב-B» keeps its list; «מלבן ABCD ישר זווית ב-B» still goes to the AI (not ruled: found work)', async () => {
    await drive([]);
    const tr = await decideHere('טרפז ABCD ישר זווית ב-B');
    expect(tr.kind === 'refuse' && (tr.note as { key?: string } | null)?.key).toBe('input.scope.split-statements');
    const re = await decideHere('מלבן ABCD ישר זווית ב-B');
    expect(re.kind).toBe('escalate');
  });
});

describe('the ✎ edit seam refuses with the same words', () => {
  function submit(u: string): string {
    const v = replay(st().facts, st().seed);
    const r = parse(u, buildParseCtx(v.construction, v.positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    st().executeMany(r.commands, u);
    const f = st().facts;
    return groupKey(f[f.length - 1]);
  }
  it.each([
    [['משולש ABC'], 'משולש ABC ישר זווית ב-B', { triangle: 'ABC', angle: 'ABC', more: '' }],
    [['משולש ABC', 'AB = 4'], 'המשולש ישר זווית ב-B', { triangle: 'ABC', angle: 'ABC', more: '' }],
    [['משולש ABC', 'AB = 4'], 'right-angled at C', { triangle: 'ABC', angle: 'BCA', more: '' }],
  ] as [string[], string, Record<string, string>][])('editing the last step of %j into «%s»', (prefix, edit, params) => {
    st().clear();
    let key = '';
    for (const p of prefix) key = submit(p);
    const before = JSON.stringify(st().facts);
    const notes: string[] = [];
    const ok = runEditCommit(key, edit, { t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k), setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(notes.at(-1)).toBe(`input.scope.right-angle-vertex:${JSON.stringify(params)}`);
    expect(JSON.stringify(st().facts), 'the step is unchanged').toBe(before);
  });
});

describe('an AI answer carrying the phrase is not built ("not even through AI")', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('a model step «משולש ABC ישר זווית ב-B» is dropped; the answer’s other steps are unchanged', async () => {
    const { llmParse } = await vi.importActual<typeof import('@/parser/llm')>('@/parser/llm');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ steps: ['משולש ABC ישר זווית ב-B', 'AB = 4'] }) })));
    const out = await llmParse('anything', {} as never, () => ({}));
    expect(out?.dropped).toEqual(['משולש ABC ישר זווית ב-B']);
    expect(out?.built.map((b) => b.step)).toEqual(['AB = 4']);
  });
});
