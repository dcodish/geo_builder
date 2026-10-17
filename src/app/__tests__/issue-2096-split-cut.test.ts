/**
 * #2096 / #2106 ([ADR-730](../../../docs/06-decisions.md#adr-730)) — the one-fact-per-line note teaches WHOLE lines,
 * never a cut inside an angle (operator ruling 2026-10-15: *"the numbered list (1) משולש ABC (2) ∠CAB = 90° (3)
 * ∠ABC = 30, never a cut inside an angle"*), and the tip is dropped when the subject is joined (ruling 2026-10-16:
 * *"the tip quotes whole rebuilt statements, or is dropped when the subject is joined"*).
 *
 * Measured at `688dfb96` through `decideDeterministic2D`, empty figure, fetch stubbed:
 *  - «משולש ABC ישר זווית ב-B ו-∠BAC = 30» taught «(1) משולש ABC ישר זווית ב-B ו-∠  (2) BAC = 30» (and the «∢»,
 *    «זווית», «∠B» and «שבו AB = 4» twins the same way): `clausesOf` did not split at «ו-∠» / «ו-זווית» / «שבו», so
 *    the reading-based right-angle teaching (ADR-603/611) never saw the angle as a part, and `splitGuidance`'s
 *    walk-back stopped at the angle marker;
 *  - «משולש ABC שווה שוקיים ∠A = 40» taught «(1) משולש ABC שווה שוקיים ∠  (2) A = 40»;
 *  - «מעגל O ומעגל P משיקים» drew the pair with the tip «(1) מעגל O  (2) מעגל P משיקים».
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { clausesOf } from '@/app/independence';
import { joinedSubject } from '@/app/clauseCoverage';
import { splitGuidance } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';

const st = () => useGeoStore.getState();
const langOf = (line: string): 'he' | 'en' => (/[a-z]{3}/.test(line) ? 'en' : 'he');

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, langOf(line));
  commitVerdict(v, line);
  return v;
}

async function play(pre: string[], last: string) {
  st().clear();
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  return submit(last);
}

const noteOf = (v: Awaited<ReturnType<typeof submit>>) => ('note' in v ? v.note : undefined) as { key: string; params?: Record<string, string> } | null | undefined;
const taught = (angle: string, more: string) => ({ key: 'input.scope.right-angle-vertex', params: { triangle: 'ABC', angle, more } });

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2096 — a trailing given after a right-angle vertex continues the ruled list', () => {
  const ROWS: [string, string, string][] = [
    ['משולש ABC ישר זווית ב-B ו-∠BAC = 30', 'ABC', '  (3) ∠BAC = 30'], // the report
    ['משולש ABC ישר זווית ב-A ו-∠ABC = 30', 'CAB', '  (3) ∠ABC = 30'], // #2106
    ['משולש ABC ישר זווית ב-A ו-∢ABC = 30', 'CAB', '  (3) ∢ABC = 30'],
    ['משולש ABC ישר זווית ב-A ו-זווית ABC = 30', 'CAB', '  (3) זווית ABC = 30'],
    ['משולש ABC ישר זווית ב-A ו-∠B = 30', 'CAB', '  (3) ∠B = 30'],
    ['משולש ABC ישר זווית ב-B שבו AB = 4', 'ABC', '  (3) AB = 4'],
    // controls: the spellings that already taught the list
    ['משולש ABC ישר זווית ב-B ו-AB = 4', 'ABC', '  (3) AB = 4'],
    ['משולש ABC ישר זווית ב-A, ∠ABC = 30', 'CAB', '  (3) ∠ABC = 30'],
    ['משולש ABC ישר זווית ב-A, זווית ABC = 30', 'CAB', '  (3) זווית ABC = 30'],
  ];
  for (const [line, angle, more] of ROWS)
    it(`«${line}» → (1) משולש ABC  (2) ∠${angle} = 90°${more}`, async () => {
      const v = await play([], line);
      expect(v.kind).toBe('refuse');
      expect(noteOf(v)).toEqual(taught(angle, more));
      expect(llmParseMock).not.toHaveBeenCalled();
    });
});

describe('#2096 — the fallback cut keeps an angle with its name', () => {
  it('«משולש ABC שווה שוקיים ∠A = 40» → (1) משולש ABC שווה שוקיים  (2) ∠A = 40', async () => {
    const v = await play([], 'משולש ABC שווה שוקיים ∠A = 40');
    expect(v.kind).toBe('refuse');
    expect(noteOf(v)?.params?.all).toBe('(1) משולש ABC שווה שוקיים  (2) ∠A = 40');
  });

  it.each([
    ['משולש ABC שווה שוקיים זווית A = 40', '(1) משולש ABC שווה שוקיים  (2) זווית A = 40'],
    ['משולש ABC שווה שוקיים ∢A = 40', '(1) משולש ABC שווה שוקיים  (2) ∢A = 40'],
    ['משולש ABC שווה שוקיים ו-∠A = 40', '(1) משולש ABC שווה שוקיים  (2) ∠A = 40'],
    ['משולש ABC שווה שוקיים AB = AC', '(1) משולש ABC שווה שוקיים  (2) AB = AC'], // control: no angle marker
  ])('splitGuidance(«%s») → %s', (line, all) => {
    expect(splitGuidance(line)?.params?.all).toBe(all);
  });

  // property: across the family, no taught item ends on an angle marker or a dangling connective
  const FAMILY = [
    'משולש ABC שווה שוקיים ∠A = 40', 'משולש ABC שווה שוקיים זווית A = 40', 'מלבן ABCD ∠ABD = 30', 'ריבוע ABCD זווית ABE = 20',
    'משולש ABC שווה צלעות ו-∠ABD = 30', 'triangle ABC isosceles ∠A = 40', 'משולש ABC שבו ∠A = 40 ו-AB = 3',
  ];
  it.each(FAMILY)('«%s»: every taught item is whole', (line) => {
    const g = splitGuidance(line);
    if (!g) return;
    for (const item of (g.params!.all as string).split(/\s{2}(?=\(\d+\))/).map((p) => p.replace(/^\(\d+\)\s*/, '')))
      expect(item, `«${item}»`).not.toMatch(/(?:[∠∢]|זוו?ית|\sו-?|שבו|שבה|\band)$/);
  });
});

describe('#2096 — the clause splitter cuts at «ו-∠», «ו-זווית» and «שבו»', () => {
  it.each([
    ['משולש ABC ישר זווית ב-B ו-∠BAC = 30', ['משולש ABC ישר זווית ב-B', '∠BAC = 30']],
    ['משולש ABC ישר זווית ב-A ו-זווית ABC = 30', ['משולש ABC ישר זווית ב-A', 'זווית ABC = 30']],
    ['משולש ABC ישר זווית ב-B שבו AB = 4', ['משולש ABC ישר זווית ב-B', 'AB = 4']],
    ['AC ו-BD נפגשים בנקודה E', ['AC ו-BD נפגשים בנקודה E']], // an operand pair stays one clause
  ])('clausesOf(«%s»)', (line, parts) => {
    expect(clausesOf(line)).toEqual(parts);
  });
});

describe('#2096 — must not change: these lines still commit', () => {
  const COMMITS: [string[], string][] = [
    [[], 'משולש ABC ו-∠ABC = 30'],
    [['ריבוע ABCD', 'נקודה E'], 'ריבוע ABCD ו-∠ABE = 30'],
    [[], 'משולש ABC שבו AB = 4'],
    [[], 'משולש ABC שבו AB = AC'],
    [['ריבוע ABCD'], 'AC ו-BD נפגשים בנקודה E'],
  ];
  for (const [pre, line] of COMMITS)
    it(`«${line}» commits`, async () => {
      expect((await play(pre, line)).kind).toBe('commit');
    });

  // the English row needs a new reading (#2143, open): its output is pinned, unchanged
  it('unchanged (out of scope, a new reading — #2143): «triangle ABC right-angled at B and AB = 4»', async () => {
    const v = await play([], 'triangle ABC right-angled at B and AB = 4');
    expect(noteOf(v)?.params?.all).toBe('(1) triangle ABC right-  (2) angled at B and AB = 4');
  });
});

describe('#2096 (ruling 2026-10-16) — no tip when the subject is joined', () => {
  for (const [pre, line] of [
    [[], 'מעגל O ומעגל P משיקים'],
    [['מעגל O'], 'מעגל O ומעגל P משיקים בנקודה M'],
  ] as const)
    it(`«${[...pre, line].join(' · ')}» builds with no fragment tip`, async () => {
      const v = await play([...pre], line);
      expect(v.kind).toBe('commit');
      expect(noteOf(v) ?? null).toBeNull();
    });

  it.each([
    ['מעגל O ומעגל P משיקים', true],
    ['circle O and circle P are tangent', true],
    ['משולש ABC, ריבוע WERT', false], // two independent constructs: the tip stays
    ['שני מעגלים משיקים מבחוץ ואלכסון AB', false],
  ] as const)('joinedSubject(«%s») = %s', (line, joined) => {
    expect(joinedSubject(line)).toBe(joined);
  });

  it('two independent constructs keep the tip: «משולש ABC, ריבוע WERT»', async () => {
    const v = await play([], 'משולש ABC, ריבוע WERT');
    expect(v.kind).toBe('commit');
    expect(noteOf(v)?.key).toBe('input.scope.split-advisory');
  });
});
