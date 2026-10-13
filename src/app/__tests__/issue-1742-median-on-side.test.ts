/**
 * #1742 ([ADR-642](../../../docs/06-decisions.md#adr-642)) — a median or altitude named by a pair whose far end is
 * a VERTEX of the triangle (the pair is a side) is read and judged, as the long form «AB תיכון לצלע BC» is.
 *
 * Measured at d6601678 through `decideDeterministic2D`: after «משולש ABC», «התיכון AB = 5» and «הגובה AB = 5»
 * escalated to the paid model (`weak:dropped:unread-role`), and the bare «התיכון AB» / «AB גובה» were
 * `not-handled`. `cevianShapeEdges` excluded the named foot B from the candidate sides, so the triangle's one
 * opposite side BC was dropped and the rule bowed out. Operator ruling 2026-10-13 on #1742: the median reuses the
 * long form's refusal (`input.cevianMedianFootAtEnd`); the altitude is the long form's right angle (ADR-527).
 *
 * Every lock calls the real pre-LLM decision; the model is mocked and must never be asked (standing rule 2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D, type Verdict2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';

const st = () => useGeoStore.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

async function decide(prefix: string[], line: string): Promise<Verdict2D> {
  st().clear();
  for (const p of prefix) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, p, 'he');
    expect(v.kind, `prefix «${p}» builds`).toBe('commit');
    if (v.kind === 'commit') st().executeMany([...v.commands], p);
  }
  const d = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
const noteOf = (v: Verdict2D) => (v.kind === 'refuse' && 'key' in v.note ? v.note : null);
const textOf = (v: Verdict2D, lng: 'he' | 'en') => {
  const n = noteOf(v)!;
  const params = Object.fromEntries(
    Object.entries(n.params ?? {}).map(([k, x]) => [k, x && typeof x === 'object' && 't' in x ? i18n.t((x as { t: string }).t, { lng }) : x]),
  );
  return plain(i18n.t(n.key, { ...params, lng }) as string);
};

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1742 — a median named by a side is refused, as the long form is', () => {
  it.each([
    'התיכון AB = 5',
    'תיכון AB = 5',
    'התיכון AB הוא 5',
    'אורך התיכון AB הוא 5',
    'התיכון AB גדול מ-5',
    'התיכון AB',
    'AB תיכון',
    'AB תיכון = 5',
    'the median AB = 5',
    'median AB = 5',
    'the median AB',
  ])('«%s» after «משולש ABC» → input.cevianMedianFootAtEnd on side BC', async (line) => {
    const v = await decide(['משולש ABC'], line);
    expect(noteOf(v)?.key).toBe('input.cevianMedianFootAtEnd');
    expect(noteOf(v)?.params).toMatchObject({ apex: 'A', foot: 'B', side: 'BC' });
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the student reads the ruled sentence, word for word — the long form\'s', async () => {
    const v = await decide(['משולש ABC'], 'התיכון AB = 5');
    expect(textOf(v, 'he')).toBe('אמצע הצלע BC אינו יכול להיות B — לשם כך BC הייתה צריכה להיות באורך אפס.');
    expect(textOf(v, 'he')).toBe(textOf(await decide(['משולש ABC'], 'AB תיכון לצלע BC'), 'he'));
  });

  it.each([
    ['התיכון BA = 5', { apex: 'B', foot: 'A', side: 'CA' }],
    ['התיכון CB = 5', { apex: 'C', foot: 'B', side: 'AB' }],
  ])('every side, either direction: «%s»', async (line, params) => {
    const v = await decide(['משולש ABC'], line);
    expect(noteOf(v)?.key).toBe('input.cevianMedianFootAtEnd');
    expect(noteOf(v)?.params).toMatchObject(params);
  });
});

describe('#1742 — an altitude named by a side is the right angle at its far end (ADR-527)', () => {
  const angleAt = (b: string, a: string, c: string) => {
    const p = replay(st().facts, st().seed).positions;
    const B = p.get(b)!, A = p.get(a)!, C = p.get(c)!;
    const u = { x: A.x - B.x, y: A.y - B.y }, w = { x: C.x - B.x, y: C.y - B.y };
    return Math.abs(u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y));
  };
  const len = (a: string, b: string) => {
    const p = replay(st().facts, st().seed).positions;
    return Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
  };

  it.each([
    ['הגובה AB = 5', 5],
    ['גובה AB = 5', 5],
    ['the altitude AB = 5', 5],
    ['the height AB = 5', 5],
    ['הגובה AB', null],
    ['AB גובה', null],
    ['the altitude AB', null],
  ])('«%s» after «משולש ABC» builds AB ⟂ BC', async (line, value) => {
    const v = await decide(['משולש ABC'], line);
    expect(v.kind).toBe('commit');
    if (v.kind !== 'commit') return;
    expect(v.commands).toContainEqual({ type: 'set-perpendicular', a: 'A', b: 'B', c: 'B', d: 'C' });
    expect(v.commands.some((c) => c.type === 'foot' || c.type === 'midpoint'), 'no foot is minted').toBe(false);
    st().executeMany([...v.commands], line);
    expect(angleAt('B', 'A', 'C'), '∠ABC = 90°').toBeLessThan(1e-6);
    if (value !== null) expect(len('A', 'B')).toBeCloseTo(value, 6);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('it is exactly the long form «AB גובה לצלע BC», plus the length', async () => {
    const short = await decide(['משולש ABC'], 'הגובה AB');
    const long = await decide(['משולש ABC'], 'AB גובה לצלע BC');
    expect(short).toEqual(long);
  });
});

describe('#1742 — controls: what the foot does not name stays as it was', () => {
  it('a median / altitude to a NEW foot still mints it', async () => {
    const m = await decide(['משולש ABC'], 'התיכון AD = 5');
    expect(m.kind === 'commit' && m.commands).toContainEqual({ type: 'midpoint', id: 'D', a: 'B', b: 'C' });
    const h = await decide(['משולש ABC'], 'הגובה AD = 5');
    expect(h.kind === 'commit' && h.commands).toContainEqual({ type: 'foot', id: 'D', from: 'A', a: 'B', b: 'C' });
  });

  it('a quadrilateral has two sides opposite the apex holding C — the foot picks neither («התיכון AC» stays unread)', async () => {
    const v = await decide(['מרובע ABCD'], 'התיכון AC');
    expect(v.kind).toBe('escalate');
  });
});
