/**
 * #1722 ([ADR-641](../../docs/06-decisions.md#adr-641), operator ruling 2026-10-13) — a lone-vertex angle at a
 * vertex with FEWER THAN TWO edges has no angle there at all. The old note said «יש יותר מזווית אחת בקודקוד A»
 * (false: there are none) and taught the example «∠AAC» (its `A{{vertex}}C` interpolation). It now says
 * there is no angle yet, in the approved sentence, with the vertex the student typed.
 *
 * Measured at pickup (6096b643, the real `decideDeterministic2D`): every row of `NO_ANGLE` answered
 * `input.ambiguousAngle` with «∠AAC», «∠ACC» or «∠ABC» (C not in the figure). The reported sequence
 * («משולש ABC · משולש ABD · AE חוצה זווית») already listed the real angles (#1445 / ADR-590) and is unchanged.
 *
 * The ruling's second half: where EXACTLY ONE candidate angle exists the existing options note names it,
 * never throws it away. `resolveVertexAngle` used to keep `options` only when there were two or more.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { parse } from '@/parser';
import type { ParseContext } from '@/parser/parse';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from './submit-gate';
import i18n from '@/i18n';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

async function decide(prefix: string[], line: string, lng: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, `the prefix «${prefix.join(' · ')}» builds`).toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, lng);
  const note = 'note' in v && v.note && 'key' in v.note ? v.note : null;
  const text = note ? plain(i18n.t(note.key, { ...(note.params ?? {}), lng }) as string) : null;
  return { v, key: note?.key ?? null, params: note?.params as Record<string, unknown> | undefined, text };
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const NO_ANGLE: { prefix: string[]; line: string; vertex: string }[] = [
  { prefix: ['נקודה A'], line: 'זווית A = 30', vertex: 'A' },
  { prefix: ['קטע AB'], line: 'AE חוצה זווית', vertex: 'A' },
  { prefix: ['קטע AB', 'קטע AC'], line: 'זווית C = זווית B', vertex: 'C' },
  { prefix: ['קטע AB'], line: 'זווית B = 30', vertex: 'B' },
];

describe('#1722 — fewer than two edges at the vertex: «there is no angle yet»', () => {
  for (const { prefix, line, vertex } of NO_ANGLE) {
    it(`«${prefix.join(' · ')}» · «${line}» → the approved sentence, at ${vertex}`, async () => {
      const { v, key, params, text } = await decide(prefix, line);
      expect(v.kind).toBe('refuse');
      expect(key).toBe('input.noAngleYet');
      expect(params).toEqual({ vertex });
      expect(text).toBe(`בקודקוד ${vertex} עדיין אין זווית — שרטטו קודם שתי צלעות שיוצאות מ-${vertex}, או כתבו את הזווית בשלוש אותיות.`);
      expect(text).not.toMatch(/יותר מזווית אחת|∠/);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('English: the same sentence, the vertex as typed', async () => {
    const { key, text } = await decide(['קטע AB'], 'angle B = 30', 'en');
    expect(key).toBe('input.noAngleYet');
    expect(text).toBe('There is no angle at vertex B yet — first draw two sides that leave B, or write the angle with three letters.');
  });

  it('the old note and its nonsense interpolation are gone from both locales', () => {
    for (const lng of ['he', 'en']) {
      expect(i18n.exists('input.ambiguousAngle', { lng })).toBe(false);
      expect(JSON.stringify(i18n.getResourceBundle(lng, 'translation'))).not.toContain('A{{vertex}}C');
    }
  });
});

describe('#1722 — two or more candidates: the options note, unchanged (ADR-590)', () => {
  it('the reported sequence «משולש ABC · משולש ABD · AE חוצה זווית» lists the real angles', async () => {
    const { key, params, text } = await decide(['משולש ABC', 'משולש ABD'], 'AE חוצה זווית');
    expect(key).toBe('input.ambiguousAngleOptions');
    expect(params).toEqual({ vertex: 'A', options: '∠BAC, ∠BAD, ∠CAD', example: 'BAC' });
    expect(text).not.toMatch(/AAC/);
  });
});

describe('#1722 — exactly ONE candidate is named, never thrown away', () => {
  // A point is either a rider or a midpoint in a real figure, so one candidate needs a context no fold
  // emits today; the resolver is pinned on a hand-built context (V on AC and the midpoint of AD).
  const ctx = {
    points: ['A', 'B', 'C', 'D'],
    circles: [],
    circleMembers: [],
    neighbors: { B: ['A', 'C', 'D'] },
    polygons: [],
    onSegment: { B: ['A', 'C'] },
    midpointOf: { B: ['A', 'D'] },
  } as unknown as ParseContext;

  it('the resolver keeps the one option', () => {
    expect(parse('∠B = 40', ctx)).toEqual({ ok: false, reason: 'ambiguous-angle', vertex: 'B', options: ['CBD'] });
  });

  it('none at all is still a bare ambiguous-angle (the no-angle note)', () => {
    expect(parse('∠B = 40', { ...ctx, neighbors: { B: ['A'] } } as ParseContext)).toEqual({ ok: false, reason: 'ambiguous-angle', vertex: 'B' });
  });
});
