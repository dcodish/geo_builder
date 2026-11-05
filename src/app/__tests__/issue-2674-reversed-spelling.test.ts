/**
 * #2674 ([ADR-785](../../../docs/06-decisions.md#adr-785)) — WHICH WAY ROUND A SEGMENT IS WRITTEN IS NO PART OF WHAT A POINT IS.
 *
 * Operator ruling 2026-11-04 (round #2697 questions page, card q3 = A): *"Rename for the reversed spelling too"*. Measured at
 * 28dac0c3 through `decideDeterministic2D` → `commitVerdict` → `replay`: «משולש ABC» · «אמצע BC» · «D אמצע CB» kept M and D
 * with «M ו-D נפלו על אותה נקודה.», where «D אמצע BC» renamed M to D. The same on a foot («גובה מ-A לצלע BC» · «AD גובה לצלע CB»).
 *
 * Root cause: two comparisons of "the same definition", `definitionKey` (naming by use) and `commandConflict` (an
 * idempotent restatement, FR-EN-9), both read the operands as spelled. Both now read `unspelled`, the one reading. The
 * second one matters to the first: left spelled, the line after the rename lowers to a hidden twin `~D`, and a later
 * contradiction reads «'D' is already defined» instead of the statement's own refusal.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { unspelled, type GeoObject } from '@/engine';
import { replay, useGeoStore } from '@/store/geoStore';
import { visibleCoincidences } from '@/render/pointDescriptions';

const st = () => useGeoStore.getState();
type V = { kind: string; binds?: { op: string; from: string; to: string }[]; note?: { key?: string } | null; explain?: string };

async function play(lines: string[], lang: 'he' | 'en' = 'he'): Promise<V[]> {
  st().clear();
  const out: V[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, lang)) as never as V;
    out.push(v);
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return out;
}
const fig = () => replay(st().facts, st().seed);
/** Every point object, hidden twins included: `~D` is what a spelled comparison leaves behind. */
const objects = () => fig().construction.objects.map((o) => o.id).filter((id) => /^~?[A-Z]\d*$/.test(id)).sort();
const notices = () => visibleCoincidences(fig().coincidences);

beforeEach(() => llmParseMock.mockReset());

describe('the ruling: a tool’s midpoint named with the segment written backwards', () => {
  it.each([
    ['the operator’s lines', ['משולש ABC', 'אמצע BC', 'D אמצע CB']],
    ['the tool wrote it backwards', ['משולש ABC', 'אמצע CB', 'D אמצע BC']],
    ['a median’s midpoint', ['משולש ABC', 'תיכון מ-A במשולש ABC', 'D אמצע CB']],
    ['the exact spelling, unchanged', ['משולש ABC', 'אמצע BC', 'D אמצע BC']],
  ])('%s: one point D, no notice', async (_t, lines) => {
    const vs = await play(lines);
    expect(vs.at(-1)!.kind).toBe('commit');
    expect(objects()).toEqual(['A', 'B', 'C', 'D']);
    expect(notices()).toEqual([]);
    expect(fig().violations).toEqual([]);
  });

  it('a different segment does not take over', async () => {
    await play(['משולש ABC', 'אמצע BC', 'D אמצע AB']);
    expect(objects()).toEqual(['A', 'B', 'C', 'D', 'M']);
    expect(notices()).toEqual([]);
  });

  it('M is back in the pool: the next median’s midpoint is M again', async () => {
    await play(['משולש ABC', 'תיכון מ-A במשולש ABC', 'D אמצע CB', 'תיכון מ-B במשולש ABC']);
    expect(objects()).toEqual(['A', 'B', 'C', 'D', 'M']);
  });

  it('a letter the student typed is the student’s: M and D keep the notice', async () => {
    await play(['משולש ABC', 'תיכון מ-A במשולש ABC', 'AM = 3', 'D אמצע CB']);
    expect(notices()).toEqual([['M', 'D']]);
  });

  it('two student letters on one reversed midpoint keep the notice', async () => {
    await play(['משולש ABC', 'אמצע BC', 'D אמצע CB', 'E אמצע CB']);
    expect(notices()).toEqual([['D', 'E']]);
  });

  it('undo takes the name with it', async () => {
    await play(['משולש ABC', 'אמצע BC', 'D אמצע CB']);
    useGeoStore.temporal.getState().undo();
    expect(objects()).toEqual(['A', 'B', 'C', 'M']);
  });
});

describe('the class: the other definitions that read a side either way round', () => {
  it('an altitude’s foot named on the reversed side takes the tool’s letter', async () => {
    await play(['משולש ABC', 'גובה מ-A לצלע BC', 'AD גובה לצלע CB']);
    expect(objects()).toEqual(['A', 'B', 'C', 'D']);
    expect(notices()).toEqual([]);
  });

  it('a later contradiction reads as it does after the exact spelling, with no hidden twin in its way', async () => {
    const spelled = await play(['משולש ABC', 'אמצע BC', 'D אמצע BC', 'D אמצע AB']);
    const reversed = await play(['משולש ABC', 'אמצע BC', 'D אמצע CB', 'D אמצע AB']);
    expect(reversed.at(-1)!.kind).toBe('refuse');
    expect(reversed.at(-1)!.explain).toBe(spelled.at(-1)!.explain);
  });
});

describe('FR-EN-9: a definition restated the other way round is the same definition', () => {
  it.each([
    ['a midpoint', ['משולש ABC', 'M אמצע BC', 'M אמצע CB']],
    ['a foot', ['משולש ABC', 'AD גובה לצלע BC', 'AD גובה לצלע CB']],
    ['a crossing, each segment reversed', ['מרובע ABCD', 'E נקודת החיתוך של AC ו-BD', 'E נקודת החיתוך של CA ו-DB']],
    ['a crossing, the segments swapped', ['מרובע ABCD', 'E נקודת החיתוך של AC ו-BD', 'E נקודת החיתוך של BD ו-AC']],
  ])('%s: «already drawn», as the exact spelling is, and no hidden twin', async (_t, lines) => {
    const vs = await play(lines);
    expect(vs.at(-1)!.kind).toBe('noop');
    expect(vs.at(-1)!.note?.key).toBe('suite.notice.alreadyDrawn');
    expect(objects().filter((id) => id.startsWith('~'))).toEqual([]);
  });
});

describe('unspelled, the one reading', () => {
  const key = (o: GeoObject) => JSON.stringify(unspelled(o));
  it('reads the operands of a set as a set', () => {
    expect(key({ kind: 'midpoint', id: 'M', a: 'C', b: 'B' })).toBe(key({ kind: 'midpoint', id: 'M', a: 'B', b: 'C' }));
    expect(key({ kind: 'foot', id: 'F', from: 'A', a: 'C', b: 'B' })).toBe(key({ kind: 'foot', id: 'F', from: 'A', a: 'B', b: 'C' }));
    expect(key({ kind: 'circumcenter', id: 'O', a: 'C', b: 'A', c: 'B' })).toBe(key({ kind: 'circumcenter', id: 'O', a: 'A', b: 'B', c: 'C' }));
  });
  it('a foot’s own point is no operand of the side', () => {
    expect(key({ kind: 'foot', id: 'F', from: 'A', a: 'B', b: 'C' })).not.toBe(key({ kind: 'foot', id: 'F', from: 'B', a: 'A', b: 'C' }));
  });
  it('a crossing’s within-segment flag travels with its own line', () => {
    const one: GeoObject = { kind: 'line-line-intersection', id: 'E', a: 'A', b: 'C', c: 'B', d: 'D', onSeg1: true };
    const swapped: GeoObject = { kind: 'line-line-intersection', id: 'E', a: 'D', b: 'B', c: 'C', d: 'A', onSeg2: true };
    const other: GeoObject = { kind: 'line-line-intersection', id: 'E', a: 'B', b: 'D', c: 'A', d: 'C', onSeg1: true };
    expect(key(one)).toBe(key(swapped));
    expect(key(one)).not.toBe(key(other));
  });
  it('an ordered definition stays as written', () => {
    expect(key({ kind: 'derived', id: 'C', rule: 'square-c', a: 'B', b: 'A' })).not.toBe(key({ kind: 'derived', id: 'C', rule: 'square-c', a: 'A', b: 'B' }));
  });
});
