/**
 * #2344 ([ADR-746](../../docs/06-decisions.md#adr-746)) — the class through the student's door: givens whose only
 * solutions lie in the limit where the declared triangle collapses are REFUSED with 2-D's flat-triangle message, in
 * every spelling; a thin REAL triangle and a right isosceles stated validly keep building.
 *
 * The runner is the real pre-LLM decision `decideDeterministic2D` with every accepted line committed by the pipeline's
 * own `commitVerdict` (the parity runner's shape), the model mocked (standing rule 2). Measured at `37800b85` before
 * the change: every member below drew a green sliver (flatness 1e-3 – 2e-2) or, in the angle form, committed as a
 * pending deferred constraint.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { polygonFlatness } from '@/engine/degeneracy';
import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';

const st = () => useGeoStore.getState();
const SEEDS = Array.from({ length: 24 }, (_, s) => s);

/** Drive `lines` at `seed`; the verdict of every line, and the figure after. */
async function drive(lines: string[], seed: number, locale: 'he' | 'en' = 'he'): Promise<{ verdicts: Verdict2D[]; fig: ReturnType<typeof replay> }> {
  st().clear();
  useGeoStore.setState({ seed } as never);
  const verdicts: Verdict2D[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
    verdicts.push(v);
    if (v.kind !== 'store-op' && v.kind !== 'refuse') commitVerdict(v, line);
  }
  return { verdicts, fig: replay(st().facts, st().seed) };
}
/** The refusal's engine reason (the UI humanises it): an over-constraint or a collapse, by its own words. */
const explainOf = (v: Verdict2D): string => (v.kind === 'refuse' && 'explain' in v.note ? v.note.explain : '');
const he = i18n.getFixedT('he') as unknown as Translate;

const MEMBERS: { lines: string[]; locale?: 'en' }[] = [
  { lines: ['משולש ABC', 'AB = BC', 'AC ⊥ BC'] },
  { lines: ['משולש ABC', 'AB = BC', 'BC ⊥ AC'] },
  { lines: ['משולש ABC', 'BA = BC', 'CA ⊥ CB'] },
  { lines: ['משולש ABC', 'AB = BC', 'AC מאונך ל-BC'] },
  { lines: ['משולש ABC', 'AC ⊥ BC', 'AB = BC'] },
  { lines: ['triangle ABC', 'AB = BC', 'AC is perpendicular to BC'], locale: 'en' },
  { lines: ['משולש ABC', 'AB = BC', 'AB ⊥ AC'] },
  { lines: ['משולש ABC', 'AB = 5', 'BC = 5', 'AC ⊥ BC'] },
  { lines: ['משולש ABC', 'AB = AC', 'AB ⊥ BC'] },
  { lines: ['משולש ABC', 'AB = AC', '∠ABC = 90'] },
  { lines: ['משולש ABC', 'AB = BC', '∠ACB = 90'] },
  { lines: ['triangle ABC', 'AB = BC', 'angle ACB = 90'], locale: 'en' },
  { lines: ['משולש ABC', '∠ACB = 90', 'AB = BC'] },
];
const CONTROLS: string[][] = [
  ['משולש ABC', 'AB = BC', 'AB ⊥ BC'],
  ['משולש ABC', 'AB = BC', '∠ABC = 90'],
  ['משולש ABC', 'CA = CB', 'AC ⊥ BC'],
  ['משולש ABC', 'AB = 2', 'BC = 1', 'AC ⊥ BC'],
  ['משולש ABC', 'AB = 10', 'BC = 9.99', 'AC ⊥ BC'],
  ['משולש ABC', 'AB = 10', 'BC = 9.9999', 'AC ⊥ BC'],
  ['משולש ABC', 'זווית BAC = 89', 'זווית ABC = 90'],
  ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.9'],
];

describe('#2344 — an impossible right isosceles triangle is refused as a collapse, at every seed and in every spelling', () => {
  it.each(MEMBERS)('$lines: the last line is refused with the flat-triangle message, the prior figure intact', async ({ lines, locale }) => {
    for (const seed of SEEDS) {
      const { verdicts, fig } = await drive(lines, seed, locale);
      for (const v of verdicts.slice(0, -1)) expect(v.kind, `seed ${seed}: the prefix commits`).toBe('commit');
      const last = verdicts[verdicts.length - 1]!;
      expect(last.kind, `seed ${seed}`).toBe('refuse');
      expect(explainOf(last), `seed ${seed}: the collapse of the declared triangle (ADR-602), never an over-constraint`).toMatch(/^collapsed: polygon A, B, C would be flat — .+ cannot hold/);
      expect(humanizeError(explainOf(last), he), `seed ${seed}: 2-D's flat-triangle sentence`).toContain('וקו ישר אינו משולש');
      expect(fig.pending, `seed ${seed}: never «waiting for more givens»`).toBe(false);
      const pts = ['A', 'B', 'C'].map((k) => fig.positions.get(k)!);
      expect(polygonFlatness(pts)!, `seed ${seed}: the prior triangle is a real one`).toBeGreaterThan(0.05);
    }
  });
});

describe('#2344 — the controls keep building: a thin real triangle, and a right isosceles stated validly', () => {
  it.each(CONTROLS)('%j builds green', async (...lines) => {
    for (const seed of SEEDS) {
      const { verdicts, fig } = await drive(lines, seed);
      for (const v of verdicts) expect(v.kind, `seed ${seed}: ${JSON.stringify(v)}`).toBe('commit');
      expect(fig.lastError, `seed ${seed}`).toBeNull();
      expect(fig.pending, `seed ${seed}`).toBe(false);
      expect(fig.violations, `seed ${seed}`).toEqual([]);
    }
  });
});

describe('#2344 — an UNSTATED choice that puts the right angle at a base vertex yields (ADR-052/445), never a sliver', () => {
  // The isosceles noun's equal legs and the right-triangle noun's seat are the tool's DEFAULTS, not givens. Before this
  // fix both drew a green sliver (measured at 37800b85); now the default is refused as a collapse and the post-commit
  // configuration search (the app's `autoResolve`) moves the choice: a real right isosceles triangle.
  it.each([
    [['משולש שווה שוקיים ABC', '∠ACB = 90']],
    [['משולש שווה שוקיים ABC', 'AC ⊥ BC']],
    [['משולש שווה שוקיים ABC', '∠ABC = 90']],
    [['משולש ישר זווית ABC', 'AB = BC']],
  ])('%j commits and settles on a real right isosceles triangle', async (lines) => {
    for (const seed of [0, 1, 2, 3]) {
      st().clear();
      useGeoStore.setState({ seed } as never);
      for (const line of lines) {
        const d = replay(st().facts, st().seed);
        const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
        expect(v.kind, `seed ${seed}: «${line}»`).toBe('commit');
        commitVerdict(v, line);
        st().autoResolve();
      }
      const fig = replay(st().facts, st().seed);
      expect(fig.lastError, `seed ${seed}`).toBeNull();
      expect(fig.pending, `seed ${seed}`).toBe(false);
      const pts = ['A', 'B', 'C'].map((k) => fig.positions.get(k)!);
      expect(polygonFlatness(pts)!, `seed ${seed}: a right isosceles triangle, not a sliver`).toBeCloseTo(0.5, 3);
    }
  });
});
