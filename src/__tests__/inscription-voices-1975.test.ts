/**
 * #1975 ([ADR-652](../../docs/06-decisions.md#adr-652)) — BOTH VOICES OF BOTH INSCRIPTION RELATIONS, EVERY SHAPE.
 *
 * Operator, 2026-10-14: *"we need to have both forms supported. משולש ABC חוסם מעגל and also מעגל חסום במשולש
 * ABC. This is for all shapes, not just triangle and in all tools"* (and 2026-10-10: *"we do need to support
 * מעגל חוסם את syntax"*).
 *
 * | relation                         | active («X חוסם Y»)            | passive («Y חסום ב-X»)       |
 * | the circle around the shape      | «מעגל חוסם את המחומש ABCDE»    | «מחומש ABCDE חסום במעגל»     |
 * | the shape around the circle      | «משולש ABC חוסם מעגל»          | «מעגל חסום במשולש ABC»       |
 *
 * Measured at 939b160a (+ #2098): every quadrilateral and n-gon in the circle-as-subject voice, every named circle
 * in that voice («מעגל O / שמרכזו O חוסם את …»), the English "a circle circumscribes the square ABCD" and "the
 * circle O circumscribes …", and the feminine «חסומה» / «חוסמת» escalated to the model while the other voice
 * built; «ABCDE חוסם מעגל» escalated where «מעגל חסום ב-ABCDE» is refused by name.
 *
 * Each row asserts the two voices give the SAME commands (one sentence, one figure), and the drawing at 24 seeds:
 * the circle AROUND puts every vertex on it, the circle INSIDE is tangent to every side with its centre inside —
 * side by side, the #1941 / #2098 lesson. The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
type Verdict = { kind: string; note?: { key?: string }; error?: { key?: string } };

async function play(lines: string[]) {
  st().clear();
  const verdicts: Verdict[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D(
      { facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never,
      line,
      /[א-ת]/.test(line) ? 'he' : 'en',
    )) as never as Verdict;
    verdicts.push(v);
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return { verdicts, facts: st().facts };
}
/** The last line's commands — what the sentence lowered to against the figure before it. */
async function lowered(lines: string[]) {
  const before = (await play(lines.slice(0, -1))).facts.length;
  const { verdicts, facts } = await play(lines);
  expect(verdicts.at(-1)?.kind, `«${lines.at(-1)}» commits`).toBe('commit');
  return facts.slice(before).map((f) => f.cmd);
}

const distToLine = (p: Vec, a: Vec, b: Vec) => Math.abs((b.y - a.y) * (p.x - a.x) - (b.x - a.x) * (p.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
const insideRing = (p: Vec, v: Vec[]) => {
  const s = v.map((a, i) => Math.sign((v[(i + 1) % v.length].x - a.x) * (p.y - a.y) - (v[(i + 1) % v.length].y - a.y) * (p.x - a.x)));
  return s.every((x) => x === s[0] && x !== 0);
};
function drawn(facts: ReturnType<typeof st>['facts'], seed: number, ring: string[]) {
  const d = replay(facts, seed);
  expect(d.lastError, `seed ${seed}`).toBeNull();
  for (const [id, s] of Object.entries(d.status)) expect(s, `seed ${seed}: step ${id}`).toBe('ok');
  const hidden = new Set(d.construction.objects.filter((o) => o.kind === 'circle' && (o as { hidden?: boolean }).hidden).map((o) => o.id));
  const circles = [...d.circles.entries()].filter(([id]) => !hidden.has(id)).map(([, c]) => c);
  expect(circles.length, `seed ${seed}: one drawn circle`).toBe(1);
  return { circle: circles[0], verts: ring.map((id) => d.positions.get(id)!) };
}
function expectAround(facts: ReturnType<typeof st>['facts'], ring: string[]) {
  for (const seed of SEEDS) {
    const { circle, verts } = drawn(facts, seed, ring);
    for (const [i, v] of verts.entries()) expect(Math.hypot(v.x - circle.center.x, v.y - circle.center.y), `seed ${seed}: ${ring[i]} on the circle`).toBeCloseTo(circle.r, Math.max(0, 4 - Math.round(Math.log10(Math.max(1, circle.r)))));
  }
}
function expectInside(facts: ReturnType<typeof st>['facts'], ring: string[]) {
  for (const seed of SEEDS) {
    const { circle, verts } = drawn(facts, seed, ring);
    for (let i = 0; i < verts.length; i++) expect(distToLine(circle.center, verts[i], verts[(i + 1) % verts.length]), `seed ${seed}: side ${i} tangent`).toBeCloseTo(circle.r, 4);
    expect(insideRing(circle.center, verts), `seed ${seed}: centre inside`).toBe(true);
  }
}

beforeEach(() => {
  llmParseMock.mockReset();
  st().clear();
});

const R3 = ['A', 'B', 'C'];
const R4 = ['A', 'B', 'C', 'D'];
const R5 = ['A', 'B', 'C', 'D', 'E'];

describe('#1975 — the circle AROUND the shape: the circle-as-subject voice is «X חסום במעגל» said the other way', () => {
  // [declared, active, passive, ring]
  const ROWS: [string, string, string, string[]][] = [
    ['ריבוע ABCD', 'מעגל חוסם את הריבוע ABCD', 'ריבוע ABCD חסום במעגל', R4], // #1841
    ['מלבן ABCD', 'מעגל חוסם את המלבן ABCD', 'מלבן ABCD חסום במעגל', R4],
    ['דלתון ABCD', 'מעגל חוסם את הדלתון ABCD', 'דלתון ABCD חסום במעגל', R4],
    // the trapezoid: equal lowering below, but not drawn here — the passive twin itself leaves A, B, D undetermined at
    // seed 1 (found, reported; the same commands, so not this issue's to fix)
    ['מרובע ABCD', 'מעגל חוסם את המרובע ABCD', 'מרובע ABCD חסום במעגל', R4],
    ['מקבילית ABCD', 'מעגל חוסם את המקבילית ABCD', 'מקבילית ABCD חסום במעגל', R4],
    ['מחומש ABCDE', 'מעגל חוסם את המחומש ABCDE', 'מחומש ABCDE חסום במעגל', R5], // the request
    ['מחומש ABCDE', 'מעגל חוסם את ABCDE', 'ABCDE חסום במעגל', R5],
    ['משושה ABCDEF', 'מעגל חוסם את המשושה ABCDEF', 'משושה ABCDEF חסום במעגל', [...R5, 'F']],
    // a named circle — the letter is its centre (#1531)
    ['משולש ABC', 'מעגל O חוסם את המשולש ABC', 'משולש ABC חסום במעגל O', R3],
    ['ריבוע ABCD', 'מעגל O חוסם את הריבוע ABCD', 'ריבוע ABCD חסום במעגל O', R4],
    ['מחומש ABCDE', 'מעגל שמרכזו O חוסם את המחומש ABCDE', 'מחומש ABCDE חסום במעגל שמרכזו O', R5],
    // English
    ['square ABCD', 'a circle circumscribes the square ABCD', 'square ABCD inscribed in a circle', R4],
    ['pentagon ABCDE', 'the circle O circumscribes pentagon ABCDE', 'pentagon ABCDE inscribed in circle O', R5],
    ['triangle ABC', 'the circle O circumscribes triangle ABC', 'triangle ABC inscribed in circle O', R3],
  ];
  for (const [shape, active, passive, ring] of ROWS) {
    it(`«${active}» lowers exactly as «${passive}», every vertex on the circle at 24 seeds`, async () => {
      const a = await lowered([shape, active]);
      expect(a).toEqual(await lowered([shape, passive]));
      const { facts } = await play([shape, active]);
      expectAround(facts, ring);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('«מעגל חוסם את הטרפז ABCD» lowers exactly as «טרפז ABCD חסום במעגל»', async () => {
    expect(await lowered(['טרפז ABCD', 'מעגל חוסם את הטרפז ABCD'])).toEqual(await lowered(['טרפז ABCD', 'טרפז ABCD חסום במעגל']));
  });

  it('on an empty canvas the circle-as-subject sentence declares the shape too, as the passive does', async () => {
    expect(await lowered(['מעגל חוסם את המחומש ABCDE'])).toEqual(await lowered(['מחומש ABCDE חסום במעגל']));
    expect(await lowered(['מעגל חוסם את הריבוע ABCD'])).toEqual(await lowered(['ריבוע ABCD חסום במעגל']));
    const { facts } = await play(['מעגל חוסם את המחומש ABCDE']);
    expectAround(facts, R5);
  });
});

describe('#1975 — the circle INSIDE the shape: the shape-as-subject voice is «מעגל חסום ב-X» said the other way', () => {
  const ROWS: [string, string, string, string[]][] = [
    ['משולש ABC', 'משולש ABC חוסם מעגל', 'מעגל חסום במשולש ABC', R3],
    ['ריבוע ABCD', 'ריבוע ABCD חוסם מעגל', 'מעגל חסום בריבוע ABCD', R4],
    ['דלתון ABCD', 'דלתון ABCD חוסם את המעגל', 'מעגל חסום בדלתון ABCD', R4],
    ['מקבילית ABCD', 'מקבילית ABCD חוסמת מעגל', 'מעגל חסום במקבילית ABCD', R4], // the feminine verb (#2035)
    ['משולש ABC', 'ABC חוסם מעגל', 'מעגל חסום ב-ABC', R3], // #2098
    ['משולש ABC', 'מעגל ש-ABC חוסם', 'מעגל חסום ב-ABC', R3],
    ['triangle ABC', 'triangle ABC circumscribes a circle', 'circle inscribed in triangle ABC', R3],
  ];
  for (const [shape, active, passive, ring] of ROWS) {
    it(`«${active}» lowers exactly as «${passive}», tangent to every side at 24 seeds`, async () => {
      expect(await lowered([shape, active])).toEqual(await lowered([shape, passive]));
      const { facts } = await play([shape, active]);
      expectInside(facts, ring);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }
});

describe('#1975 — the feminine predicate is the masculine one (#2035)', () => {
  it.each([
    ['מקבילית ABCD', 'מקבילית ABCD חסומה במעגל', 'מקבילית ABCD חסום במעגל'],
    ['טרפז ABCD', 'טרפז ABCD חסומה במעגל', 'טרפז ABCD חסום במעגל'],
    ['משולש ABC', 'משולש ABC חוסמת מעגל', 'משולש ABC חוסם מעגל'],
  ])('%s · «%s» lowers exactly as «%s»', async (shape, fem, masc) => {
    expect(await lowered([shape, fem])).toEqual(await lowered([shape, masc]));
  });
});

describe('#1975 — a voice the tool refuses is refused the same way in the other voice', () => {
  it.each([
    [['מחומש ABCDE', 'מחומש ABCDE חוסם מעגל'], ['מחומש ABCDE', 'מעגל חסום במחומש ABCDE']],
    [['מחומש ABCDE', 'ABCDE חוסם מעגל'], ['מחומש ABCDE', 'מעגל חסום ב-ABCDE']],
    [['טרפז ישר זווית ABCD', 'מעגל חוסם את הטרפז ישר זווית ABCD'], ['טרפז ישר זווית ABCD', 'טרפז ישר זווית ABCD חסום במעגל']],
  ])('%j and %j get the same refusal', async (active, passive) => {
    const a = (await play(active)).verdicts.at(-1)!;
    const p = (await play(passive)).verdicts.at(-1)!;
    expect(a.kind).toBe('refuse');
    // the same refusal, quoting each student's own sentence
    const sansDetail = (v: Verdict) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'detail' ? undefined : x)));
    expect(sansDetail(a)).toEqual(sansDetail(p));
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#1975 — unchanged: the 3-point circle-through readings', () => {
  it.each([
    [['משולש ABC', 'מעגל חוסם את המשולש ABC']],
    [['מעגל חוסם את ABC']],
    [['מעגל חוסם את המשולש ABC']],
    [['triangle ABC', 'a circle circumscribes triangle ABC']],
  ])('%j still lowers to the circumcircle alone', async (lines) => {
    const cmds = await lowered(lines);
    expect(cmds.map((c) => c.type)).toEqual(['circumcircle']);
  });
});
