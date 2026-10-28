/**
 * #1467 ([ADR-769](../../../docs/06-decisions.md#adr-769), [ADR-W-162](../../../docs/06w-decisions-workspace.md#adr-w-162);
 * operator ruling 2026-09-27 "Create everywhere + notice"; verdicts T36/T37 of 2026-10-24) — 2-D creates every point
 * a line refers to, and says so.
 *
 * Measured at d9494206 through `decideDeterministic2D`, the LLM mocked: «AD:DB = 1:2», «AB = 2 AD», «משולש ABC» ·
 * «AB = 2 AX», «שטח המשולש ABC הוא 13», «היקף המשולש ABC = 20» and «ישר ABE» refused «… references an unknown
 * point»; «AD תיכון לצלע BC» refused `missing-operands`; «M אמצע AB» built silently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict, type CreatedNotice2D } from '../submitPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { parse } from '@/parser';
import { createdNoticeFaults } from '../../../shell/__tests__/fixtures/created-notice-rows';
import type { CreatedPointsAdapter } from '../../../shell/session/createdPoints';
import i18n from '@/i18n';

const st = () => useGeoStore.getState();
const label = /^[A-Z]\d*$/;
let notice: CreatedNotice2D | null = null;

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
  notice = v.kind === 'commit' || v.kind === 'noop' ? commitVerdict(v, line) : null;
  return v;
}
/** The notice as the App shows it: while its line is still the last row. */
const shown = (): CreatedNotice2D | null => {
  const last = st().facts[st().facts.length - 1];
  return notice && last && groupKey(last) === notice.groupKey ? notice : null;
};
const points = () => [...replay(st().facts, st().seed).positions.keys()].filter((k) => label.test(k));
const rows = () => new Set(st().facts.map(groupKey)).size;
const pos = (id: string, seed = st().seed) => replay(st().facts, seed).positions.get(id)!;
const dist = (a: string, b: string, seed?: number) => Math.hypot(pos(a, seed).x - pos(b, seed).x, pos(a, seed).y - pos(b, seed).y);

beforeEach(() => {
  st().clear();
  notice = null;
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue(null);
});

const adapter: CreatedPointsAdapter = {
  reset: () => {
    st().clear();
    notice = null;
  },
  submit: async (l) => void (await submit(l)),
  lastCreated: () => shown(),
  undoLastLine: () => {
    if (notice) st().removeGroup(notice.groupKey);
    notice = null;
  },
  pointNames: points,
  lineCount: rows,
};

describe('#1467 — 2-D honours the shared created-notice contract', () => {
  it('every shared row', async () => {
    expect(await createdNoticeFaults(adapter, {
      referenceLine: 'M אמצע AB',
      referenceNames: ['A', 'B'],
      typoSetup: ['משולש ABC'],
      typoLine: 'M אמצע AX',
      typoName: 'X',
      declarationLine: 'משולש ABC',
    })).toEqual([]);
  });
});

describe('#1467 — a statement naming a point the figure lacks creates it (the operator\'s T36/T37 and their class)', () => {
  const BLANK: [string, string[]][] = [
    ['AD:DB = 1:2', ['A', 'D', 'B']],
    ['AB = 2 AD', ['A', 'B', 'D']],
    ['שטח המשולש ABC הוא 13', ['A', 'B', 'C']],
    ['היקף המשולש ABC = 20', ['A', 'B', 'C']],
    ['ישר ABE', ['A', 'B', 'E']],
    ['AD תיכון לצלע BC', ['A', 'B', 'C']],
    ['M אמצע AB', ['A', 'B']],
    ['M midpoint of AB', ['A', 'B']],
    ['AB = 5', ['A', 'B']],
    ['D על AB', ['A', 'B']],
    ['∠ABC = 40', ['A', 'B', 'C']],
    ['AB = k', ['A', 'B']],
  ];
  it.each(BLANK)('blank «%s» commits green, creating %j, and the notice names them', async (line, names) => {
    const v = await submit(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    const d = replay(st().facts, st().seed);
    expect(Object.values(d.status).every((s) => s === 'ok'), JSON.stringify(d.status)).toBe(true);
    expect(d.violations).toEqual([]);
    for (const n of names) expect(points()).toContain(n);
    expect(shown()?.names).toEqual(names);
  });

  it('the given holds on the created points at every seed (ADR-052: they are free, and move)', async () => {
    await submit('AB = 2 AD');
    const seen = new Set<string>();
    for (const seed of [0, 1, 2, 3]) {
      expect(dist('A', 'B', seed)).toBeCloseTo(2 * dist('A', 'D', seed), 6);
      seen.add(pos('B', seed).x.toFixed(3));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('«AD:DB = 1:2» holds its ratio', async () => {
    await submit('AD:DB = 1:2');
    for (const seed of [0, 1, 2]) expect(dist('D', 'B', seed)).toBeCloseTo(2 * dist('A', 'D', seed), 6);
  });

  it('«משולש ABC» · «AB = 2 AX» creates only X', async () => {
    await submit('משולש ABC');
    await submit('AB = 2 AX');
    expect(shown()?.names).toEqual(['X']);
    expect(dist('A', 'B')).toBeCloseTo(2 * dist('A', 'X'), 6);
  });

  it('a line\'s own subject is never announced, and a declaration announces nothing', async () => {
    for (const l of ['משולש ABC', 'קטע DE', 'נקודה F', 'G(1,2)', 'מעגל O']) {
      await submit(l);
      expect(shown(), l).toBeNull();
    }
    await submit('M אמצע AB');
    expect(shown()).toBeNull(); // A and B exist; M is the line's subject
  });

  it('creation adds nothing to a line whose points exist, and nothing to a pure reading (no figure)', () => {
    expect((parse('AB = 2 AD') as { commands: { type: string }[] }).commands.some((c) => c.type === 'free-point')).toBe(false);
    const ctx = { points: ['A', 'B', 'D'] };
    const r = parse('AB = 2 AD', ctx);
    expect(r.ok && r.commands.some((c) => c.type === 'free-point')).toBe(false);
    const blank = parse('AB = 2 AD', { points: [] });
    expect(blank.ok && blank.commands.filter((c) => c.type === 'free-point').map((c) => (c as { id: string }).id)).toEqual(['A', 'B', 'D']);
  });

  it('a radius symbol is never created as a point («מעגל O שרדיוסו R»)', async () => {
    await submit('מעגל O שרדיוסו R');
    expect(points()).not.toContain('R');
  });

  it('the notice text is the ruled sentence, singular and plural', () => {
    const t = (k: string, o: Record<string, string>) => (i18n.getFixedT('he')(k, o) as string).replace(/[⁦-⁩]/g, '');
    expect(t('suite.notice.createdPoint', { names: 'X' })).toBe('נוצרה נקודה חדשה X — אם זו טעות הקלדה, לחצו ✕ לביטול השורה');
    expect(t('suite.notice.createdPoints', { names: 'A, B' })).toBe('נוצרו נקודות חדשות A, B — אם זו טעות הקלדה, לחצו ✕ לביטול השורה');
  });
});
