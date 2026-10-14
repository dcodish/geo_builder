/**
 * #2066 + #2085 item 3 ([ADR-643](../../../docs/06-decisions.md#adr-643)) — A SIDE IS NOT A BISECTOR.
 *
 * Measured at 939b160a through `decideDeterministic2D`: «משולש ABC» · «AB חוצה זווית» lowered to ∠BAB = ∠BAC (a zero
 * angle only a flattened triangle meets) and was refused with the flat-triangle message; «AB חוצה זווית B» said
 * «בקודקוד B עדיין אין זווית» (false); the role-noun spellings escalated to the model; «מרובע ABCD» · «AB חוצה זווית»
 * committed with D on AB, green. Operator rulings of 2026-10-14: #2066 (the triangle sentence) and #2085 item 3 (the
 * same predicate on every other declared polygon, «…צלע של המרובע/המלבן/…», without the triangle-only clause).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D, type Verdict2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';

const st = () => useGeoStore.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

async function decideHere(line: string): Promise<Verdict2D> {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
async function drive(prefix: readonly string[]) {
  st().clear();
  for (const p of prefix) {
    const v = await decideHere(p);
    expect(v.kind, `«${p}» builds`).toBe('commit');
    commitVerdict(v, p);
  }
}
const textOf = (v: Verdict2D, lng: 'he' | 'en') => {
  if (v.kind !== 'refuse' || !('key' in v.note)) return null;
  const params = Object.fromEntries(Object.entries(v.note.params ?? {}).map(([k, x]) => [k, x && typeof x === 'object' && 't' in x ? i18n.t((x as { t: string }).t, { lng }) : x]));
  return plain(i18n.t(v.note.key, { ...params, lng }) as string);
};
const TRI = (side: string, v: string) => `${side} היא צלע של המשולש ולכן אינה יכולה לחצות את זווית ${v} — חוצה זווית יוצא מקודקוד אל הצלע שמולו.`;

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2066 — a bisector named by a side of the triangle is refused as a side', () => {
  it.each([
    ['AB חוצה זווית', 'AB', 'A'],
    ['AB חוצה את זווית A', 'AB', 'A'],
    ['AB חוצה את הזווית BAC', 'AB', 'A'],
    ['AB חוצה זווית לצלע BC', 'AB', 'A'],
    ['AB bisects angle A', 'AB', 'A'],
    ['BA חוצה זווית', 'BA', 'B'],
    ['AB חוצה זווית B', 'AB', 'B'],
    ['AB חוצה את זווית ABC', 'AB', 'B'],
    ['AB הוא חוצה זווית', 'AB', 'A'],
    ['חוצה הזווית AB', 'AB', 'A'],
    ['AB is an angle bisector', 'AB', 'A'],
    ['the bisector AB', 'AB', 'A'],
    ['חוצה הזווית AB = 5', 'AB', 'A'],
    ['AC חוצה זווית', 'AC', 'A'],
    ['CB חוצה זווית', 'CB', 'C'],
  ])('«משולש ABC» · «%s» → «%s היא צלע של המשולש… את זווית %s…», nothing committed', async (line, side, vertex) => {
    await drive(['משולש ABC']);
    const n = st().facts.length;
    const v = await decideHere(line);
    expect(v.kind).toBe('refuse');
    expect(textOf(v, 'he')).toBe(TRI(side, vertex));
    commitVerdict(v, line);
    expect(st().facts.length).toBe(n);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the English locale', async () => {
    await drive(['משולש ABC']);
    expect(textOf(await decideHere('AB חוצה זווית'), 'en')).toBe('AB is a side of the triangle, so it cannot bisect angle A — an angle bisector runs from a vertex to the opposite side.');
  });
});

describe('#2085 item 3 — the same predicate on every other declared polygon, naming it', () => {
  it.each([
    ['מרובע ABCD', 'המרובע'],
    ['ריבוע ABCD', 'הריבוע'],
    ['מלבן ABCD', 'המלבן'],
    ['מקבילית ABCD', 'המקבילית'],
    ['טרפז ABCD', 'הטרפז'],
    ['מעוין ABCD', 'המעוין'],
    ['דלתון ABCD', 'הדלתון'],
    ['מחומש ABCDE', 'המחומש'],
  ])('«%s» · «AB חוצה זווית» → «AB היא צלע של %s ולכן אינה יכולה לחצות את זווית A.»', async (shape, noun) => {
    await drive([shape]);
    const n = st().facts.length;
    const v = await decideHere('AB חוצה זווית');
    expect(v.kind).toBe('refuse');
    expect(textOf(v, 'he')).toBe(`AB היא צלע של ${noun} ולכן אינה יכולה לחצות את זווית A.`);
    commitVerdict(v, 'AB חוצה זווית');
    expect(st().facts.length).toBe(n);
  });
  it('both letter orders: «מרובע ABCD» · «BA חוצה זווית» → the angle at B', async () => {
    await drive(['מרובע ABCD']);
    expect(textOf(await decideHere('BA חוצה זווית'), 'he')).toBe('BA היא צלע של המרובע ולכן אינה יכולה לחצות את זווית B.');
  });
  it('English: "AB is a side of the rectangle, so it cannot bisect angle A."', async () => {
    await drive(['מלבן ABCD']);
    expect(textOf(await decideHere('AB חוצה זווית'), 'en')).toBe('AB is a side of the rectangle, so it cannot bisect angle A.');
  });
});

describe('#2066 — controls, unchanged', () => {
  it('«AB חוצה זווית C» keeps its honest wrong-apex refusal', async () => {
    await drive(['משולש ABC']);
    const v = await decideHere('AB חוצה זווית C');
    expect(v.kind === 'refuse' && 'key' in v.note && v.note.key).toBe('input.bisectorWrongApex');
  });
  it('«AD חוצה זווית» with D new builds the bisector from A', async () => {
    await drive(['משולש ABC']);
    const v = await decideHere('AD חוצה זווית');
    expect(v.kind === 'commit' && v.commands.some((c) => c.type === 'bisector')).toBe(true);
  });
  it.each(['חוצה הזווית AD = 5', 'האנך AB = 5'])('«%s» still goes to the model', async (line) => {
    await drive(['משולש ABC']);
    expect((await decideHere(line)).kind).toBe('escalate');
  });
  it('a diagonal of a quadrilateral is a real bisector: «מרובע ABCD» · «AC חוצה זווית» is not refused as a side', async () => {
    await drive(['מרובע ABCD']);
    const v = await decideHere('AC חוצה זווית');
    expect(v.kind === 'refuse' && 'key' in v.note ? v.note.key : '').not.toMatch(/cevianBisector/);
  });
});
