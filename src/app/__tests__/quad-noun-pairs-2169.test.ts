/**
 * #2169 / #2171 / #2180 ([ADR-W-131](../../../docs/06w-decisions-workspace.md#adr-w-131)) — TWO SHAPE NOUNS ON ONE
 * QUADRILATERAL: 2-D is the reference, and it reads the ONE shared relation (`kindRelation`, `shell/narrowing.ts`).
 *
 * The thin lock: the shared rows (`shell/__tests__/fixtures/quad-noun-pairs.ts`, every ordered pair of the nine nouns
 * plus the three-noun rows) through 2-D's REAL path — `decideDeterministic2D` → `commitVerdict` (the model mocked,
 * never called) → the store's sweep (`detectCrossings`) — the refusal worded by the real i18n. Then the 2-D half of
 * the operator's 2026-10-16 ruling on #2169 (ballot round 5, card 1, A): «טרפז שווה שוקיים ABCD» · «טרפז ישר זווית
 * ABCD» is refused in either order, and a declared isosceles or right trapezoid is named with its adjective.
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn(async () => ({ built: [], dropped: [] }));
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...(a as [])) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { narrowingText } from '@/app/narrowingText';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import { declaredQuadKind } from '@/engine/apply';
import { QUAD_IMPLIES, quadRelation, type QuadKind } from '@/engine/shapeKinds';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { stripFormatControls } from '../../../shell/bidi';
import { kindRelation } from '../../../shell/narrowing';
import { pairFaults, type PairGate } from '../../../shell/__tests__/fixtures/quad-noun-pairs';

const he = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
const st = () => useGeoStore.getState();
const params = (p?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p ?? {}).map(([k, v]) => [k, v && typeof v === 'object' && 't' in (v as object) ? he((v as { t: string }).t) : v]));

/** Type each line through the deterministic door and commit it as the pipeline does; the last line's verdict. */
async function play(steps: readonly string[]): Promise<{ last: 'restates' | 'refines' | 'refused'; refusal?: string; earlierAccepted: boolean }> {
  st().clear();
  let earlierAccepted = true;
  let out: { last: 'restates' | 'refines' | 'refused'; refusal?: string } = { last: 'restates' };
  for (const [i, line] of steps.entries()) {
    const rowsBefore = new Set(st().facts.map(groupKey)).size;
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
    if (v.kind === 'refuse') {
      const refusal = stripFormatControls('key' in v.note ? he(v.note.key, params(v.note.params)) : humanizeError(v.note.explain, he, line));
      if (i < steps.length - 1) earlierAccepted = false;
      out = { last: 'refused', refusal };
      continue;
    }
    if (v.kind !== 'store-op') commitVerdict(v, line);
    const added = new Set(st().facts.map(groupKey)).size > rowsBefore;
    out = { last: added ? 'refines' : 'restates' };
  }
  return { ...out, earlierAccepted };
}

const gate: PairGate = async (steps) => {
  const v = await play(steps);
  await st().detectCrossings();
  const s = st();
  const notes = s.narrowed?.facts === s.facts ? narrowingText(s.narrowed.list, he).map(stripFormatControls) : [];
  return { ...v, notes };
};

describe('#2169 — every two-noun pair (and the three-noun rows) gets the shared table’s answer in 2-D', () => {
  it('every row of quad-noun-pairs', async () => {
    expect(await pairFaults(gate, '2d')).toEqual([]);
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 600_000);
});

describe('#2169 — the isosceles and the right trapezoid exclude each other, in 2-D too (ruling 2026-10-16)', () => {
  const EXCL = (actual: string, stated: string) => `הצורה כבר ידועה כ־${actual} — ולכן אינה נקראת ${stated}. מחקו את הנתון הקודם אם התכוונתם ${stated}.`;

  it.each([
    [['טרפז שווה שוקיים ABCD', 'טרפז ישר זווית ABCD'], EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית')],
    [['טרפז ישר זווית ABCD', 'טרפז שווה שוקיים ABCD'], EXCL('טרפז ישר זווית', 'טרפז שווה שוקיים')],
    [['isosceles trapezoid ABCD', 'right trapezoid ABCD'], EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית')],
    // any reading of the ring is the same ring (ADR-618)
    [['טרפז שווה שוקיים ABCD', 'טרפז ישר זווית BCDA'], EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית')],
    // the narrowed ring keeps its adjective: «טרפז» · «טרפז שווה שוקיים» is an isosceles trapezoid from then on
    [['טרפז ABCD', 'טרפז שווה שוקיים ABCD', 'טרפז ישר זווית ABCD'], EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית')],
    [['טרפז ABCD', 'טרפז ישר זווית ABCD', 'טרפז שווה שוקיים ABCD'], EXCL('טרפז ישר זווית', 'טרפז שווה שוקיים')],
  ])('«%s» is refused with the exclusion sentence, and adds no row', async (steps, sentence) => {
    const v = await play(steps);
    expect(v.earlierAccepted).toBe(true);
    expect(v.last).toBe('refused');
    expect(v.refusal).toBe(sentence);
    expect(new Set(st().facts.map(groupKey)).size).toBe(steps.length - 1);
  }, 120_000);

  it('a declared isosceles or right trapezoid is named with its adjective in every exclusion refusal', async () => {
    for (const [noun, other] of [['טרפז שווה שוקיים', 'מלבן'], ['טרפז ישר זווית', 'ריבוע'], ['טרפז שווה שוקיים', 'דלתון'], ['טרפז ישר זווית', 'מעוין']]) {
      const v = await play([`${noun} ABCD`, `${other} ABCD`]);
      expect(v.refusal, `${noun} · ${other}`).toBe(EXCL(noun, other));
    }
  }, 120_000);

  it('the ring is declared as the phrase, and narrowed to the adjective by a later line', async () => {
    for (const [steps, kind] of [
      [['טרפז שווה שוקיים ABCD'], 'isosceles-trapezoid'],
      [['טרפז ישר זווית ABCD'], 'right-trapezoid'],
      [['טרפז ABCD'], 'trapezoid'],
      [['טרפז ABCD', 'טרפז שווה שוקיים ABCD'], 'isosceles-trapezoid'],
      [['טרפז ABCD', 'טרפז ישר זווית ABCD'], 'right-trapezoid'],
    ] as const) {
      await play(steps);
      const d = replay(st().facts, st().seed);
      expect(declaredQuadKind(d.construction, ['A', 'B', 'C', 'D']), steps.join(' · ')).toBe(kind);
    }
  }, 120_000);

  it('the noun selectors still find a declared isosceles or right trapezoid as «הטרפז»', async () => {
    for (const noun of ['טרפז שווה שוקיים', 'טרפז ישר זווית']) {
      const v = await play([`${noun} ABCD`, 'אלכסוני הטרפז נפגשים בנקודה M']);
      expect(v.earlierAccepted, noun).toBe(true);
      expect(v.last, noun).toBe('refines');
      const w = await play([`${noun} ABCD`, 'גובה הטרפז הוא 4']);
      expect(w.last, `${noun} — height`).toBe('refines');
    }
  }, 120_000);
});

describe('#2171 — 2-D reads the shared relation (one table, no copy)', () => {
  it('quadRelation is kindRelation over the same kinds, for every pair 2-D declares', () => {
    const K = Object.keys(QUAD_IMPLIES) as QuadKind[];
    for (const a of K) for (const b of K) expect(quadRelation(a, b), `${a}/${b}`).toBe(kindRelation(a, b));
    expect(quadRelation('isosceles-trapezoid', 'right-trapezoid')).toBe('excludes');
    expect(quadRelation('kite', 'trapezoid')).toBe('excludes');
    expect(quadRelation('trapezoid', 'isosceles-trapezoid')).toBe('narrows');
  });
});
