/**
 * #1720 ([ADR-571](../../../docs/06-decisions.md#adr-571)) — a triangle-form cevian introduces its triangle,
 * and an unresolved operand is refused naming the sentence.
 *
 * Measured on deed7b20 (and on the #1684 tip this branch sits on) through `runSubmit`, empty canvas:
 *  - «AD תיכון במשולש ABC» refused «unresolved dependencies for: D»;
 *  - «AD חוצה זווית במשולש ABC» refused «unresolved dependencies for: bis-CAB»;
 *  - «AD גובה במשולש ABC» built (the altitude carried its own copy of the introduction);
 *  - «AD תיכון לצלע BC» / «AD חוצה זווית BAC» refused with the same internal message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D, missingOperandLetters } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { emptyConstruction, type AnyCommand } from '@/engine';
import i18n from '@/i18n';

type V = { x: number; y: number };
const d = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y);
const ang = (a: V, v: V, b: V) => Math.acos(((a.x - v.x) * (b.x - v.x) + (a.y - v.y) * (b.y - v.y)) / (d(a, v) * d(b, v)));
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

async function decide(prefix: string[], line: string, lng: 'he' | 'en' = 'he') {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, lng);
  const note = v.kind === 'refuse' && 'key' in v.note ? v.note : null;
  const text = note ? plain(i18n.t(note.key, { ...(note.params ?? {}), lng }) as string) : null;
  return { v, key: note?.key ?? null, params: note?.params as Record<string, unknown> | undefined, text };
}
const cmds = (v: Awaited<ReturnType<typeof decide>>['v']): readonly AnyCommand[] => (v.kind === 'commit' ? v.commands : []);

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1720 — a triangle-form cevian introduces its triangle, for every role', () => {
  it.each([
    'AD תיכון במשולש ABC',
    'AD חוצה זווית במשולש ABC',
    'AD גובה במשולש ABC',
    'AD median in triangle ABC',
    'AD bisects the angle in triangle ABC',
    'תיכון מ-A במשולש ABC',
    'גובה מ-A במשולש ABC',
    'AD חוצה זווית A במשולש ABC',
  ])('«%s» on an empty canvas builds with triangle ABC drawn first', async (line) => {
    const { v } = await decide([], line);
    expect(v.kind).toBe('commit');
    expect(cmds(v)[0]).toEqual({ type: 'triangle', ids: ['A', 'B', 'C'] });
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the foot holds at several seeds: median = midpoint, bisector = equal angles, altitude ⟂', () => {
    for (const seed of [0, 1, 2, 3]) {
      const at = (seq: string[]) => {
        const { facts, refused } = driveThroughGate(seq);
        expect(refused).toEqual([]);
        const p = replay(facts, seed).positions;
        return (k: string) => p.get(k)!;
      };
      let P = at(['AD תיכון במשולש ABC']);
      expect(d(P('B'), P('D')), `seed ${seed}: median`).toBeCloseTo(d(P('D'), P('C')), 6);
      P = at(['AD חוצה זווית במשולש ABC']);
      expect(ang(P('B'), P('A'), P('D')), `seed ${seed}: bisector`).toBeCloseTo(ang(P('D'), P('A'), P('C')), 6);
      P = at(['AD גובה במשולש ABC']);
      const dot = (P('D').x - P('A').x) * (P('C').x - P('B').x) + (P('D').y - P('A').y) * (P('C').y - P('B').y);
      expect(Math.abs(dot) / (d(P('A'), P('D')) * d(P('B'), P('C'))), `seed ${seed}: altitude`).toBeLessThan(1e-6);
    }
  });

  it('an existing triangle is never re-declared — the same lowering as before for every role', async () => {
    for (const line of ['AD תיכון במשולש ABC', 'AD חוצה זווית במשולש ABC', 'AD גובה במשולש ABC']) {
      useGeoStore.getState().clear();
      const { v } = await decide(['משולש ABC'], line);
      expect(cmds(v).some((c) => c.type === 'triangle'), line).toBe(false);
    }
  });
});

/**
 * ⚠ REWRITTEN by #1467 (ADR-769; operator ruling 2026-09-27 "Create everywhere + notice"; #2048 ruling A: "a cevian with
 * no host triangle creates the vertices it names"): the operands the figure lacks are created, so these lines commit.
 * `input.missingOperands` stays the fallback for an operand nothing can create (#1411's deleted-line rows).
 */
describe('#1720 — an operand the figure lacks is created (#1467)', () => {
  it.each(['AD תיכון לצלע BC', 'AD חוצה זווית BAC'])('«%s» on an empty canvas commits in both locales, and no model is asked', async (line) => {
    for (const lng of ['he', 'en'] as const) {
      useGeoStore.getState().clear();
      const { v } = await decide([], line, lng);
      expect(v.kind, `${line} (${lng})`).toBe('commit');
    }
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('missingOperandLetters: what the batch relies on and nothing defines', () => {
    const batch = [
      { type: 'midpoint', id: 'D', a: 'B', b: 'C' },
      { type: 'segment', a: 'A', b: 'D' },
    ] as AnyCommand[];
    expect(missingOperandLetters(emptyConstruction(), batch)).toEqual(['B', 'C']);
    expect(missingOperandLetters(emptyConstruction(), [{ type: 'triangle', ids: ['A', 'B', 'C'] } as AnyCommand, ...batch])).toEqual([]);
  });
});
