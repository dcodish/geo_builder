/**
 * #2205 ([ADR-685](../../../docs/06-decisions.md#adr-685)) — A DEFINITE UNNAMED SHAPE NOUN IS A STATEMENT ABOUT THE
 * FIGURE'S SHAPE.
 *
 * Operator, 2026-10-16: «משולש ABC» · «המשולש ישר זווית» drew a SECOND triangle DEF, green, and ABC never became
 * right-angled. Ruling (same day): with one triangle drawn the line makes ABC right-angled, the same for every predicate;
 * with two or more it is refused, naming them, with the named form as the next step.
 *
 * Root cause: the shape rules auto-name a fresh polygon whenever the sentence has no label run, whatever the noun's
 * article — so a definite noun («המשולש», "the triangle", «הריבוע») minted a new shape in the standalone macros and the
 * n-gon rules always, and in the inscription rules whenever the figure held two or more shapes of that size. Fix: one
 * resolver (`definiteShapeVertices`, over ADR-029's candidate set) that every auto-naming shape site asks first.
 *
 * Path: `decideDeterministic2D` → `commitVerdict` → `replay`. The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { auditLoadedFigure, refreshLoadedFigure } from '@/store/loadAudit';
import { shapeNounArticle, shapeNounIsDefinite } from '@/parser/shapePhrase';
import type { AnyCommand } from '@/engine';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

const st = () => useGeoStore.getState();
type V = { kind: string; commands?: AnyCommand[]; note?: { key?: string; params?: Record<string, unknown> } | null; logs?: unknown[] };

async function play(lines: string[], lang: 'he' | 'en' = 'he') {
  st().clear();
  const verdicts: V[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, lang)) as never as V;
    verdicts.push(v);
    if (v.kind !== 'store-op' && v.kind !== 'refuse') commitVerdict(v as never, line);
  }
  return { verdicts, last: verdicts.at(-1)! };
}

const polys = () =>
  replay(st().facts, st().seed)
    .construction.objects.filter((o) => o.kind === 'polygon')
    .map((o) => (o as { vertices: string[] }).vertices.join(''));

/** The replayed positions at seeds 0–3, rounded, as one comparable record. */
function positionsBySeed() {
  return [0, 1, 2, 3].map((seed) => {
    const r = replay(st().facts, seed);
    return Object.fromEntries([...r.positions].filter(([id]) => /^[A-Z]\d*$/.test(id)).map(([id, p]) => [id, [p.x, p.y]]));
  });
}
function expectSamePositions(a: Record<string, number[]>[], b: Record<string, number[]>[]) {
  expect(a.map((m) => Object.keys(m).sort())).toEqual(b.map((m) => Object.keys(m).sort()));
  a.forEach((m, i) => {
    for (const [id, [x, y]] of Object.entries(m)) {
      expect(Math.abs(x - b[i][id][0]) + Math.abs(y - b[i][id][1]), `seed ${i} ${id}`).toBeLessThan(1e-9);
    }
  });
}

beforeEach(() => llmParseMock.mockReset());

const T = 'משולש ABC';

/** [prefix, the definite unnamed line, its named twin, locale] — table A of the fix plan. */
const DEFINITE_EQUALS_NAMED: [string, string[], string, string, ('he' | 'en')?][] = [
  ['A1 the report', [T], 'המשולש ישר זווית', 'המשולש ABC ישר זווית'],
  ['A1 copula', [T], 'המשולש הוא ישר זווית', 'המשולש ABC הוא ישר זווית'],
  ['A1 hyphen', [T], 'המשולש ישר-זווית', 'המשולש ABC ישר-זווית'],
  ['A2 isosceles', [T], 'המשולש שווה שוקיים', 'המשולש ABC שווה שוקיים'],
  ['A2 English', [T], 'the triangle is isosceles', 'the triangle ABC is isosceles', 'en'],
  ['A3 equilateral', [T], 'המשולש שווה צלעות', 'המשולש ABC שווה צלעות'],
  ['A3 English', [T], 'the triangle is equilateral', 'the triangle ABC is equilateral', 'en'],
  ['A4 noun predicate', [T], 'המשולש הוא משולש ישר זווית', 'המשולש ABC הוא משולש ישר זווית'],
  ['A4 English', [T], 'the triangle is a right triangle', 'the triangle ABC is a right triangle', 'en'],
  ['A5 beside a square', [T, 'ריבוע DEFG'], 'המשולש ישר זווית', 'המשולש ABC ישר זווית'],
  ['A6 beside a point', [T, 'D אמצע AB'], 'המשולש ישר זווית', 'המשולש ABC ישר זווית'],
  ['A7 inscribed in a circle', ['מעגל O', 'משולש חסום במעגל O'], 'המשולש ישר זווית', 'המשולש ABC ישר זווית'],
  ['A8 already right', ['משולש ישר זווית ABC'], 'המשולש ישר זווית', 'המשולש ABC ישר זווית'],
  ['A9 contradicts', ['משולש שווה צלעות ABC'], 'המשולש ישר זווית', 'המשולש ABC ישר זווית'],
  ['A10 bare', [T], 'המשולש', 'המשולש ABC'],
  ['A10 bare English', [T], 'the triangle', 'the triangle ABC', 'en'],
  ['A11 the quadrilateral', ['מרובע ABCD'], 'המרובע', 'המרובע ABCD'],
  ['A11 the parallelogram', ['מרובע ABCD'], 'המקבילית', 'המקבילית ABCD'],
  ['A11 the square', ['מרובע ABCD'], 'הריבוע', 'הריבוע ABCD'],
  ['A12 the square again', ['ריבוע ABCD'], 'הריבוע', 'הריבוע ABCD'],
  ['A12 the kite', ['דלתון ABCD'], 'הדלתון', 'הדלתון ABCD'],
  ['A13 the pentagon regular', ['מחומש ABCDE'], 'המחומש משוכלל', 'המחומש ABCDE משוכלל'],
  ['A13 the regular pentagon', ['מחומש ABCDE'], 'המחומש המשוכלל', 'המחומש ABCDE המשוכלל'],
];

describe('#2205 — with one shape of that size, the definite line is its named form over that shape', () => {
  it.each(DEFINITE_EQUALS_NAMED)('%s', async (_label, prefix, definite, named, lang) => {
    const n = await play([...prefix, named], lang ?? 'he');
    const namedPolys = polys();
    const namedPos = positionsBySeed();
    const d = await play([...prefix, definite], lang ?? 'he');
    expect(d.last.kind).toBe(n.last.kind);
    expect(d.last.note?.key).toBe(n.last.note?.key);
    expect(JSON.stringify(d.last.commands ?? [])).toBe(JSON.stringify(n.last.commands ?? []));
    expect(polys()).toEqual(namedPolys);
    expectSamePositions(positionsBySeed(), namedPos);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the report: ABC becomes right-angled, no new triangle, no new letter', async () => {
    const g = await play([T, 'המשולש ישר זווית']);
    expect(g.last.kind).toBe('commit');
    expect(g.last.commands).toEqual([{ type: 'right-triangle', ids: ['A', 'B', 'C'] }]);
    expect(polys()).toEqual(['ABC']);
    const r = replay(st().facts, st().seed);
    expect(r.violations).toHaveLength(0);
    expect([...r.positions.keys()].filter((id) => /^[A-Z]\d*$/.test(id)).sort()).toEqual(['A', 'B', 'C']);
  });

  it('A8 answers «כבר קיים», A9 is refused, as their named twins are', async () => {
    expect((await play(['משולש ישר זווית ABC', 'המשולש ישר זווית'])).last.note?.key).toBe('suite.notice.alreadyDrawn');
    expect((await play(['משולש שווה צלעות ABC', 'המשולש ישר זווית'])).last.kind).toBe('refuse');
    expect(polys()).toEqual(['ABC']);
  });

  it('entry order: a second triangle drawn after the line leaves ABC right-angled (the line is never re-read)', async () => {
    await play([T, 'המשולש ישר זווית', 'משולש DEF']);
    expect(polys()).toEqual(['ABC', 'DEF']);
    expect(st().facts.some((f) => JSON.stringify(f.cmd) === JSON.stringify({ type: 'right-triangle', ids: ['A', 'B', 'C'] }))).toBe(true);
    expect(replay(st().facts, st().seed).violations).toHaveLength(0);
  });
});

/** [figure, the definite line, the shapes named, locale] — table B, plus the definite container. */
const TWO_OR_MORE: [string, string[], string, string[], string, ('he' | 'en')?][] = [
  ['B1 the report', [T, 'משולש DEF'], 'המשולש ישר זווית', ['ABC', 'DEF'], 'המשולש ABC ישר זווית'],
  ['B2 English', [T, 'משולש DEF'], 'the triangle is isosceles', ['ABC', 'DEF'], 'the triangle ABC is isosceles', 'en'],
  ['B2 bare', [T, 'משולש DEF'], 'המשולש', ['ABC', 'DEF'], 'המשולש ABC'],
  ['B3 inscribed', [T, 'משולש DEF', 'מעגל O'], 'המשולש חסום במעגל O', ['ABC', 'DEF'], 'המשולש ABC חסום במעגל O'],
  ['B4 circumscribes', [T, 'משולש DEF', 'מעגל O'], 'המשולש חוסם את מעגל O', ['ABC', 'DEF'], 'המשולש ABC חוסם את מעגל O'],
  ['B5 the square inscribed', ['ריבוע ABCD', 'ריבוע EFGH', 'מעגל O'], 'הריבוע חסום במעגל O', ['ABCD', 'EFGH'], 'הריבוע ABCD חסום במעגל O'],
  ['B6 the parallelogram', ['מרובע ABCD', 'מרובע EFGH'], 'המקבילית', ['ABCD', 'EFGH'], 'המקבילית ABCD'],
  ['B7 three triangles', [T, 'משולש DEF', 'משולש GHI'], 'המשולש שווה שוקיים', ['ABC', 'DEF', 'GHI'], 'המשולש ABC שווה שוקיים'],
  ['B8 the pentagon', ['מחומש ABCDE', 'מחומש FGHIJ'], 'המחומש משוכלל', ['ABCDE', 'FGHIJ'], 'המחומש ABCDE משוכלל'],
  ['B9 a definite container', [T, 'משולש DEF'], 'ריבוע חסום בתוך המשולש', ['ABC', 'DEF'], 'ריבוע חסום בתוך המשולש ABC'],
  ['B9 English container', [T, 'משולש DEF'], 'a square inscribed in the triangle', ['ABC', 'DEF'], 'a square inscribed in the triangle ABC', 'en'],
];

describe('#2205 — with two or more shapes of that size, the definite line is refused naming them', () => {
  it.each(TWO_OR_MORE)('%s', async (_label, prefix, definite, shapes, example, lang) => {
    const g = await play([...prefix, definite], lang ?? 'he');
    const before = polys().length;
    expect(g.last.kind).toBe('refuse');
    expect(g.last.note?.key).toBe('input.ambiguousDefiniteShape');
    expect(g.last.note?.params?.shapes).toBe(shapes.join(', '));
    expect(g.last.note?.params?.example).toBe(example);
    expect(g.last.note?.params?.sentence).toBe(definite);
    expect(before).toBe(prefix.filter((l) => !/מעגל/.test(l)).length);
    expect(llmParseMock).not.toHaveBeenCalled();
    // the taught remedy is a grammar claim: it is read on the same figure (docs/17 §9) — it commits, or (the bare noun)
    // answers «כבר קיים»; never a refusal or an escalation
    const r = await play([...prefix, example], lang ?? 'he');
    expect(['commit', 'noop']).toContain(r.last.kind);
    expect(replay(st().facts, st().seed).violations).toHaveLength(0);
  });

  it('the plural noun is the locale table by arity (3, 4, otherwise polygons)', async () => {
    expect((await play([T, 'משולש DEF', 'המשולש'])).last.note?.params?.plural).toEqual({ t: 'input.shapePlural.3' });
    expect((await play(['מרובע ABCD', 'מרובע EFGH', 'המרובע'])).last.note?.params?.plural).toEqual({ t: 'input.shapePlural.4' });
    expect((await play(['מחומש ABCDE', 'מחומש FGHIJ', 'המחומש משוכלל'])).last.note?.params?.plural).toEqual({ t: 'input.shapePlural.n' });
    for (const loc of [he, en] as unknown as Record<string, Record<string, unknown>>[]) {
      expect(Object.keys(loc.input.shapePlural as object).sort()).toEqual(['3', '4', 'n']);
      expect(typeof loc.input.ambiguousDefiniteShape).toBe('string');
    }
  });
});

describe('#2205 — unchanged (measured at ef78f15c)', () => {
  it('D1 the indefinite «משולש ישר זווית» is a new triangle (ADR-654)', async () => {
    const g = await play([T, 'משולש ישר זווית']);
    expect(g.last.commands).toEqual([{ type: 'right-triangle', ids: ['D', 'E', 'F'] }]);
  });
  it('D2 no triangle drawn: «המשולש ישר זווית» draws one', async () => {
    expect((await play(['המשולש ישר זווית'])).last.commands).toEqual([{ type: 'right-triangle', ids: ['A', 'B', 'C'] }]);
    expect((await play(['ריבוע ABCD', 'המשולש ישר זווית'])).last.commands).toEqual([{ type: 'right-triangle', ids: ['E', 'F', 'G'] }]);
  });
  it('D3 one triangle: «המשולש חסום במעגל O» binds it (ADR-029)', async () => {
    expect((await play(['מעגל O', 'משולש חסום במעגל O', 'המשולש חסום במעגל O'])).last.note?.key).toBe('suite.notice.alreadyDrawn');
  });
  it('D4 the ב-prefixed «מעגל חסום במשולש» and «ריבוע חסום במשולש» with two triangles still draw a new one', async () => {
    await play([T, 'משולש DEF', 'מעגל O', 'מעגל חסום במשולש']);
    expect(polys()).toEqual(['ABC', 'DEF', 'GHI']);
    await play([T, 'משולש DEF', 'ריבוע חסום במשולש']);
    expect(polys()).toContain('GHI');
  });
  it.each([['המשולש חד זווית']])('D5 «%s» (no reader) still escalates with two triangles', async (line) => {
    expect((await play([T, 'משולש DEF', line])).last.kind).toBe('escalate');
  });
  // #2234 (ADR-737, ruling 2026-10-18): «ישר זווית ב-X» is refused by its words, never the AI — with two triangles drawn,
  // the definite noun gets this ADR's own question, naming them
  it('D5 «המשולש ישר זווית ב-B» with two triangles is refused with the which-triangle question (#2234), never escalated', async () => {
    const g = await play([T, 'משולש DEF', 'המשולש ישר זווית ב-B']);
    expect(g.last.kind).toBe('refuse');
  });
  it('D5 «המרובע מקבילית» still escalates', async () => {
    expect((await play(['מרובע ABCD', 'מרובע EFGH', 'המרובע מקבילית'])).last.kind).toBe('escalate');
  });
  it('D6 «המשולש ישר זווית ושווה שוקיים» is still refused', async () => {
    expect((await play([T, 'המשולש ישר זווית ושווה שוקיים'])).last.kind).toBe('refuse');
  });
  it('D7 «המשולש שווה שוקיים AB=AC» acts on ABC through the equality rule', async () => {
    const g = await play([T, 'המשולש שווה שוקיים AB=AC']);
    expect(g.last.commands?.at(-1)).toEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
  });
  it('the named twin with two triangles acts on the named one (C8)', async () => {
    const g = await play([T, 'משולש DEF', 'המשולש DEF שווה שוקיים']);
    expect(g.last.commands).toEqual([{ type: 'shape-variant', shape: 'isosceles', ids: ['D', 'E', 'F'], variant: 0 }]);
  });
});

describe('#2205 — the article reader', () => {
  it.each([
    ['המשולש', 'definite'],
    ['שהמשולש ישר זווית', 'definite'],
    ['והמשולש', 'definite'],
    ['ומשולש', 'indefinite'],
    ['במשולש', 'prefixed'],
    ['בתוך המשולש', 'definite'],
    ['משולש', 'indefinite'],
    ['the triangle', 'definite'],
    ['the right triangle', 'definite'],
    ['a triangle', 'indefinite'],
    ['', 'indefinite'],
  ])('«%s» → %s', (s, article) => {
    expect(shapeNounArticle(s)).toBe(article);
  });
  it('the n-gon nouns are read when the caller passes them', () => {
    expect(shapeNounArticle('המחומש משוכלל')).toBe('indefinite');
    expect(shapeNounArticle('המחומש משוכלל', { מחומש: 5 })).toBe('definite');
  });
  it('ADR-654\'s two-way view is unchanged: a prefixed noun is still a possible reference', () => {
    expect(shapeNounIsDefinite('במשולש')).toBe(true);
    expect(shapeNounIsDefinite('המשולש')).toBe(true);
    expect(shapeNounIsDefinite('משולש')).toBe(false);
  });
});

describe('#2205 — the edit seam and a saved figure', () => {
  const deps = (notes: string[]): EditDeps => ({ t: (k, o) => `${k}${o ? JSON.stringify(o) : ''}`, setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });

  it('a ✎ edit to «המשולש ישר זווית» with one triangle lowers onto ABC', async () => {
    await play([T, 'AB = 3']);
    expect(runEditCommit(groupKey(st().facts.at(-1)!), 'המשולש ישר זווית', deps([]))).toBe(true);
    expect(polys()).toEqual(['ABC']);
    expect(st().facts.some((f) => JSON.stringify(f.cmd) === JSON.stringify({ type: 'right-triangle', ids: ['A', 'B', 'C'] }))).toBe(true);
  });

  it('with two triangles the edit is refused with the same sentence', async () => {
    await play([T, 'משולש DEF', 'AB = 3']);
    const notes: string[] = [];
    expect(runEditCommit(groupKey(st().facts.at(-1)!), 'המשולש ישר זווית', deps(notes))).toBe(false);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('input.ambiguousDefiniteShape');
    expect(notes[0]).toContain('"shapes":"ABC, DEF"');
    expect(notes[0]).toContain('"plural":"input.shapePlural.3"');
    expect(polys()).toEqual(['ABC', 'DEF']);
  });

  it('an old save with the two-triangle line (drawn as a third triangle) reloads as saved: the re-parse is a question', async () => {
    await play([T, 'משולש DEF']);
    commitVerdict({ kind: 'commit', deferred: false, binds: [], commands: [{ type: 'right-triangle', ids: ['G', 'H', 'I'] }], logs: [], note: null } as never, 'המשולש ישר זווית');
    const saved = st().facts;
    const { facts, refreshed } = refreshLoadedFigure(saved, Number.POSITIVE_INFINITY);
    expect(refreshed).toEqual([]);
    expect(facts.map((f) => f.cmd)).toEqual(saved.map((f) => f.cmd));
    expect(auditLoadedFigure(saved, Number.POSITIVE_INFINITY).findings).toEqual([]);
  });

  it('an old save with the one-triangle line (drawn as DEF) picks the fix up on load (ADR-232 Am.): the row re-lowers onto ABC', async () => {
    await play([T]);
    commitVerdict({ kind: 'commit', deferred: false, binds: [], commands: [{ type: 'right-triangle', ids: ['D', 'E', 'F'] }], logs: [], note: null } as never, 'המשולש ישר זווית');
    const { facts, refreshed } = refreshLoadedFigure(st().facts, Number.POSITIVE_INFINITY);
    expect(refreshed).toEqual([2]);
    expect(facts.at(-1)!.cmd).toEqual({ type: 'right-triangle', ids: ['A', 'B', 'C'] });
  });
});
