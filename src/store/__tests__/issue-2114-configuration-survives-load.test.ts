/**
 * #2114 ([ADR-697](../../../docs/06-decisions.md#adr-697)) — a figure saved, restored or opened from a shared link
 * after «הציגו תצורה אחרת» opens in the configuration it was saved in (ruling 2026-10-15, FR-HS-10 / FR-HS-12).
 *
 * Measured at 4b0b4592 through `runSubmit` → `cycleVariant` → `serializeFigure` → `loadFigureText`: «דלתון ABCD»
 * and «משולש שווה שוקיים ABC» cycled to variant 1 loaded at variant 0 with `refreshed = [1]` (the false «saved in an
 * earlier version» note), and «sin∠ABC = 0.5» cycled to 150° loaded at 30°.
 *
 * Root cause: the load re-lowering (`refreshLoadedFigure`) and the load audit compared a fresh parse with the saved
 * rows byte for byte (`lowersAsSaved`), so a step whose only difference was a cycled `variant`/`branch` read as
 * parser drift and was rewritten with the parser's default. The configuration is a view datum like the seed; the
 * comparator now works up to it, and a step that really re-lowers carries each matched command's choice over.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import { groupKey, replay, useGeoStore, type Fact } from '@/store/geoStore';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';
import { deserializeFigure, serializeFigure, serializeFigureForLink } from '@/store/figureFile';
import { loadFigureText } from '@/store/figureLoad';
import { auditLoadedFigure, canonicalCommand, configurationOf, lowersAsSaved, refreshLoadedFigure, withConfiguration } from '@/store/loadAudit';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

function deps(): SubmitDeps {
  return {
    t: (key) => key,
    locale: 'he',
    ui: { setInputNote: () => {}, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
    view: () => {
      const s = st();
      const d = replay(s.facts, s.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
}

const configs = (facts: Fact[]) => facts.map((f) => configurationOf(f.cmd));
const points = (facts: Fact[], seed: number) =>
  [...replay(facts, seed).positions].filter(([k]) => /^[A-Z]\d*'?$/.test(k)).sort(([a], [b]) => a.localeCompare(b));

function expectSamePoints(a: ReturnType<typeof points>, b: ReturnType<typeof points>) {
  expect(b.map(([k]) => k), 'the same points').toEqual(a.map(([k]) => k));
  a.forEach(([k, p], i) => {
    expect(Math.abs(p.x - b[i][1].x) + Math.abs(p.y - b[i][1].y), `${k} did not move`).toBeLessThan(1e-9);
  });
}

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

type Cycle = 'variant' | 'variant+resample' | { alt: string };

/** Every cyclable kind (the plan's member list), each through a catalog sentence so the parser path runs. */
const MEMBERS: { name: string; lines: string[]; cycle: Cycle; kind: AnyCommand['type'] }[] = [
  { name: 'kite axis', lines: ['דלתון ABCD'], cycle: 'variant', kind: 'shape-variant' },
  { name: 'isosceles apex', lines: ['משולש שווה שוקיים ABC'], cycle: 'variant', kind: 'shape-variant' },
  { name: 'isosceles apex + a resampled seed', lines: ['משולש שווה שוקיים ABC'], cycle: 'variant+resample', kind: 'shape-variant' },
  { name: 'inscribed placement', lines: ['משולש ABC', 'מלבן DEFG חסום במשולש ABC'], cycle: 'variant', kind: 'inscribe' },
  { name: 'angle root (sine)', lines: ['משולש ABC', 'sin∠ABC = 0.5'], cycle: 'variant', kind: 'measure-angle' },
  { name: 'two-vertex height side', lines: ['מרובע ABCD', 'AC גובה'], cycle: 'variant', kind: 'altitude-choice' },
  { name: 'common tangent', lines: ['מעגל O', 'מעגל P', 'AB משיק משותף למעגלים O ו-P'], cycle: 'variant', kind: 'common-tangent' },
  { name: 'circle position', lines: ['שני מעגלים'], cycle: 'variant', kind: 'set-circle-position' },
  { name: 'which crossing is which', lines: ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'המעגלים O ו-P נחתכים בנקודות X ו-Y'], cycle: { alt: 'X' }, kind: 'circle-circle-intersection' },
];

async function buildAndCycle(lines: string[], cycle: Cycle) {
  for (const l of lines) await runSubmit(l, deps());
  expect(st().facts.map((f) => f.utterance), 'every line committed').toEqual(expect.arrayContaining(lines));
  const before = configs(st().facts);
  if (cycle === 'variant' || cycle === 'variant+resample') expect(st().cycleVariant(), 'a variant step is available').toBe(true);
  else st().cycleAlt(cycle.alt);
  if (cycle === 'variant+resample') expect(st().resample(), 'a seed resample is available').toBe(true);
  expect(configs(st().facts), 'precondition: the configuration changed').not.toEqual(before);
}

describe('#2114 — a cycled configuration survives save → load, restore and shared link', () => {
  for (const m of MEMBERS) {
    for (const via of ['file', 'link'] as const) {
      it(`${m.name} — via ${via === 'file' ? 'the saved file' : 'a shared link / restored session'}`, async () => {
        await buildAndCycle(m.lines, m.cycle);
        expect(st().facts.some((f) => f.cmd.type === m.kind), `the figure carries a ${m.kind}`).toBe(true);
        const saved = st().facts;
        const seed = st().seed;
        const want = points(saved, seed);
        const text = via === 'file' ? serializeFigure({ facts: saved, seed }) : serializeFigureForLink({ facts: saved, seed });
        const back = deserializeFigure(text);
        expect(back.ok).toBe(true);
        expect(auditLoadedFigure(back.ok ? back.file.facts : []).findings, 'the load audit finds no drift').toEqual([]);
        st().clear();
        const r = await loadFigureText(text, via === 'link' ? { resetHistory: true } : {});
        expect(r.ok, 'the save loads').toBe(true);
        expect(r.ok && r.refreshed, 'nothing reads as «saved by an older version»').toEqual([]);
        expect(st().seed, 'the seed round-trips').toBe(seed);
        expect(configs(st().facts), 'every choice round-trips').toEqual(configs(saved));
        expectSamePoints(want, points(st().facts, st().seed));
      }, 120_000);
    }
  }
});

describe('#2114 — a step that REALLY re-lowers still refreshes, and keeps its choice', () => {
  it('a step whose save held a command the parser no longer produces is refreshed, and the cycled variant is carried onto the matched command', async () => {
    await buildAndCycle(['משולש שווה שוקיים ABC'], 'variant');
    const facts = st().facts;
    const key = groupKey(facts[0]);
    const step = facts.filter((f) => groupKey(f) === key);
    const sv = step.find((f) => f.cmd.type === 'shape-variant')!;
    expect((sv.cmd as { variant: number }).variant).toBe(1);
    // Simulate an older reading: the same step once also lowered a command the parser no longer produces.
    const stale: AnyCommand = { type: 'free-point', id: 'Z9', x: 1, y: 1 } as AnyCommand;
    const last = step[step.length - 1];
    const old = facts.flatMap((f) => (f === last ? [{ ...f, group: key }, { ...f, group: key, id: `${f.id}.stale`, cmd: stale }] : [f]));
    const { facts: out, refreshed } = refreshLoadedFigure(old);
    expect(refreshed, 'the drifted step is refreshed').toEqual([1]);
    expect(out.some((f) => f.cmd.type === 'free-point' && (f.cmd as { id: string }).id === 'Z9'), 'the stale command is gone').toBe(false);
    const carried = out.find((f) => f.cmd.type === 'shape-variant')!;
    expect((carried.cmd as { variant: number }).variant, 'the cycled apex survives the re-lower').toBe(1);
  }, 120_000);

  it('a command whose reading changed keeps the parser default (its old choice indexed other drawings)', () => {
    const savedCmd = { type: 'shape-variant', shape: 'kite', ids: ['A', 'B', 'C', 'D'], variant: 1 } as unknown as AnyCommand;
    const renamed = { type: 'shape-variant', shape: 'kite', ids: ['A', 'B', 'C', 'E'], variant: 0 } as unknown as AnyCommand;
    expect(JSON.stringify(canonicalCommand(renamed))).not.toBe(JSON.stringify(canonicalCommand(savedCmd)));
  });
});

describe('#2114 — the comparator is up to configuration and nothing wider', () => {
  const iso = (variant: number) => ({ type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'], variant }) as unknown as AnyCommand;
  const sine = (variant: number, value: number) =>
    ({ type: 'measure-angle', ray1: 'A', vertex: 'B', ray2: 'C', expr: { value, roots: [30, 150] }, variant }) as unknown as AnyCommand;
  const cross = (branch?: number) =>
    ({ type: 'circle-circle-intersection', id: 'X', circle1: 'circle-O', circle2: 'circle-P', ...(branch !== undefined ? { branch } : {}) }) as unknown as AnyCommand;

  it('a variant, an angle root and a branch are configuration', () => {
    expect(canonicalCommand(iso(2))).toEqual(canonicalCommand(iso(0)));
    expect(canonicalCommand(sine(1, 150))).toEqual(canonicalCommand(sine(0, 30)));
    expect(canonicalCommand(cross(1))).toEqual(canonicalCommand(cross(0)));
    expect(canonicalCommand(cross(0))).toEqual(canonicalCommand(cross()));
    expect(lowersAsSaved([], [iso(0)], [iso(2)])).toBe(true);
  });

  it('anything else is still drift', () => {
    const other = { ...iso(0), ids: ['A', 'C', 'B'] } as AnyCommand;
    expect(lowersAsSaved([], [other], [iso(0)])).toBe(false);
    const otherRoots = { ...sine(0, 30), expr: { value: 45, roots: [45, 135] } } as AnyCommand;
    expect(lowersAsSaved([], [otherRoots], [sine(0, 30)])).toBe(false);
    const avoid = { ...cross(1), avoid: 'Y' } as AnyCommand;
    expect(lowersAsSaved([], [avoid], [cross(1)])).toBe(false);
    // `branch` is configuration only on a cyclable kind
    const seg = { type: 'segment', a: 'A', b: 'B', branch: 1 } as unknown as AnyCommand;
    expect(canonicalCommand(seg)).toBe(seg);
  });

  it('withConfiguration restores the choice and the root value that follows it', () => {
    expect(withConfiguration(sine(0, 30), configurationOf(sine(1, 150)))).toEqual(sine(1, 150));
    expect(withConfiguration(cross(0), configurationOf(cross(1)))).toEqual(cross(1));
    expect(withConfiguration(iso(0), { variant: 5 })).toEqual(iso(5 % 3));
  });
});

describe('#2114 — the ✎ edit still resets the configuration (ADR-484 unchanged)', () => {
  it('editing the cycled step re-reads it at the default', async () => {
    await buildAndCycle(['משולש שווה שוקיים ABC'], 'variant');
    const key = groupKey(st().facts[0]);
    const edit: EditDeps = { t: (k) => k, setInputNote: () => {}, resolveAfterCommit: () => {} };
    expect(runEditCommit(key, 'משולש שווה שוקיים ABC', edit), 'the edit commits').toBe(true);
    const sv = st().facts.find((f) => f.cmd.type === 'shape-variant')!;
    expect((sv.cmd as { variant: number }).variant, 'an edit is a structural change: the choice resets').toBe(0);
  }, 120_000);
});
