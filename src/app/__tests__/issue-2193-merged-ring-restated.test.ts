/**
 * #2193 ([ADR-711](../../../docs/06-decisions.md#adr-711)) — A NOUN THE RING ALREADY IS RESTATES IT, INCLUDING AFTER A
 * SIBLING MERGE.
 *
 * Measured on `main` @ b0e9dbea through `decideDeterministic2D` → `commitVerdict` → `replay` (the model mocked, never
 * called): «מלבן ABCD» · «מעוין ABCD» · «ריבוע ABCD» was refused with the engine's id-conflict text («C כבר מוגדרת ולא
 * ניתן להגדיר אותה מחדש כמשהו אחר…» / «'C' is already defined…»), and so was every order, reading and pair whose meet
 * is a third kind (rectangle + kite → square, parallelogram + kite → rhombus).
 *
 * Root cause: `impliedShapeRestatement` returned early when the declared kind equalled the stated one, assuming a ring
 * declared X was built by X's own command. A sibling merge (ADR-656) stamps the meet on a ring no command of that
 * noun built, so the noun was re-applied as a fresh shape and its derived corner collided. The rewrite now reads the
 * reflexive relation (`quadRelation` = the shared `kindRelation`, where every kind implies itself). Ruled outcome:
 * ADR-656 decision 3, «כבר קיים» (operator ruling 2026-10-16, ballot round 5, card 7).
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn(async () => ({ built: [], dropped: [] }));
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...(a as [])) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import { normalizeShapeComposition } from '@/engine/apply';
import type { Command } from '@/engine';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { stripFormatControls } from '../../../shell/bidi';

type Lng = 'he' | 'en';
const tr = (lng: Lng) => (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng }) as string;
const st = () => useGeoStore.getState();

/** Type each line through the deterministic door and commit as the pipeline does; every line's outcome. */
async function play(lines: readonly string[], lng: Lng = 'he'): Promise<{ kind: string; text?: string; added: number }[]> {
  st().clear();
  const t = tr(lng);
  const out: { kind: string; text?: string; added: number }[] = [];
  for (const line of lines) {
    const rows = new Set(st().facts.map(groupKey)).size;
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, lng);
    if (v.kind === 'refuse') {
      const text = stripFormatControls('key' in v.note ? t(v.note.key, v.note.params as Record<string, unknown>) : humanizeError(v.note.explain, t, line));
      out.push({ kind: 'refuse', text, added: 0 });
      continue;
    }
    const note = 'note' in v && v.note && typeof v.note === 'object' && 'key' in v.note ? t((v.note as { key: string }).key) : undefined;
    if (v.kind !== 'store-op') commitVerdict(v, line);
    out.push({ kind: v.kind, text: note, added: new Set(st().facts.map(groupKey)).size - rows });
  }
  return out;
}

const ALREADY = { he: 'זה כבר קיים באיור — אין מה להוסיף.', en: "That's already on the figure — nothing to add." } as const;

const REPORTED: readonly (readonly string[])[] = [
  ['מלבן ABCD', 'מעוין ABCD', 'ריבוע ABCD'],
  ['מלבן ABCD', 'מעוין ABCD', 'ריבוע BCDA'],
  ['מלבן ABCD', 'מעוין ABCD', 'ריבוע DCBA'],
  ['מעוין ABCD', 'מלבן ABCD', 'ריבוע ABCD'],
  ['מלבן ABCD', 'דלתון ABCD', 'ריבוע ABCD'],
  ['מקבילית ABCD', 'מלבן ABCD', 'מעוין ABCD', 'ריבוע ABCD'],
  ['מקבילית ABCD', 'דלתון ABCD', 'מעוין ABCD'],
  ['דלתון ABCD', 'מקבילית ABCD', 'מעוין ABCD'],
];

describe('#2193 — the noun a sibling merge made the ring restates it («כבר קיים»)', () => {
  it.each(REPORTED.map((s) => [s.join(' · '), s] as const))('«%s» — every line accepted, the last adds nothing', async (_l, lines) => {
    for (const lng of ['he', 'en'] as const) {
      const out = await play(lines, lng);
      const last = out[out.length - 1];
      expect(out.slice(0, -1).every((o) => o.kind !== 'refuse' && o.added === 1), `${lng}: ${JSON.stringify(out)}`).toBe(true);
      expect(last, lng).toMatchObject({ kind: 'noop', text: ALREADY[lng], added: 0 });
      expect(JSON.stringify(out)).not.toMatch(/already defined|כבר מוגדרת/);
    }
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 120_000);

  it('the English spelling of the report answers the same', async () => {
    const out = await play(['rectangle ABCD', 'rhombus ABCD', 'square ABCD'], 'en');
    expect(out[2]).toMatchObject({ kind: 'noop', text: ALREADY.en, added: 0 });
  }, 60_000);

  it('a side stated with the restated noun still commits: |AB| = 5', async () => {
    const out = await play(['מלבן ABCD', 'מעוין ABCD', 'ריבוע ABCD שצלעו 5']);
    expect(out[2].kind).not.toBe('refuse');
    expect(out[2].added).toBe(1);
    const { positions: p } = replay(st().facts, st().seed);
    expect(Math.hypot(p.get('A')!.x - p.get('B')!.x, p.get('A')!.y - p.get('B')!.y)).toBeCloseTo(5, 6);
  }, 60_000);
});

describe('#2193 — must not change', () => {
  it.each([
    [['ריבוע ABCD', 'ריבוע ABCD'], 'noop'],
    [['מלבן ABCD', 'ריבוע ABCD', 'ריבוע ABCD'], 'noop'],
    [['טרפז שווה שוקיים ABCD', 'טרפז שווה שוקיים ABCD'], 'noop'],
    [['מלבן ABCD', 'מעוין ABCD', 'מלבן ABCD'], 'noop'],
    [['מלבן ABCD', 'מעוין ABCD', 'מקבילית ABCD'], 'noop'],
    [['מלבן ABCD', 'מעוין ABCD', 'דלתון ABCD'], 'noop'],
    [['מקבילית ABCD', 'דלתון ABCD', 'ריבוע ABCD'], 'commit'],
    [['ריבוע ABCD', 'ריבוע ABCD שצלעו 5'], 'commit'],
    [['מלבן ABCD', 'מעוין ABCD', 'AB = 5'], 'commit'],
  ] as const)('«%s» → %s', async (lines, kind) => {
    const out = await play(lines);
    expect(out[out.length - 1].kind, JSON.stringify(out)).toBe(kind);
  }, 60_000);

  it('a trapezoid after the merge is still ADR-619’s exclusion sentence', async () => {
    const out = await play(['מלבן ABCD', 'מעוין ABCD', 'טרפז ABCD']);
    expect(out[2]).toMatchObject({ kind: 'refuse', text: 'הצורה כבר ידועה כ־ריבוע — ולכן אינה נקראת טרפז. מחקו את הנתון הקודם אם התכוונתם טרפז.' });
  }, 60_000);
});

describe('#2193 — the rewrite re-spells only the noun, never a stated magnitude', () => {
  it('a square command carrying `side` keeps its own path over the merged ring', async () => {
    await play(['מלבן ABCD', 'מעוין ABCD']);
    const { construction } = replay(st().facts, st().seed);
    const ids = ['A', 'B', 'C', 'D'] as [string, string, string, string];
    expect(normalizeShapeComposition(construction, { type: 'square', ids } as Command)).toEqual({ type: 'quadrilateral', ids });
    const sided = normalizeShapeComposition(construction, { type: 'square', ids, side: 5 } as Command);
    expect(sided.type).toBe('square');
    expect((sided as { side?: number }).side).toBe(5);
  }, 60_000);
});
