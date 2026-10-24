/**
 * #2486 ([ADR-759](../../../docs/06-decisions.md#adr-759)) — the MIDDLE letter of an arc's three is the centre, for every
 * arc noun (operator ruling 2026-10-24, e8 A: *"«רבע מעגל AOB», «חצי מעגל AOB» and «גזרה AOB» all have centre O, as in
 * ∠AOB"*), with the sector's measured O-family exception (an O/P/Q letter written first is the centre).
 *
 * The CLASS lock, through the real decide path (`decideDeterministic2D`): {quarter, half, sector} × the measured runs ×
 * {Hebrew, English, the run before the noun, «עיגול», a stated radius} × {fresh; «נקודה A · נקודה B»; «נקודה A ·
 * נקודה O · נקודה B»}. The committed arc's centre is `arcRunRoles(run).centre` — the ONE reader the parser rules and
 * the re-reader share — and the step teaches nothing (the student's own reading built). Excluded by design: a figure
 * whose stated reading fails on #2499 (a pinned distance between the centre and an end, entered first), where the
 * #1012 re-reader then legitimately tries another centre; no row below states such a distance.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { arcRunRoles } from '../../../shell/arcRun';

type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function decide(prefix: string[], line: string, locale: 'he' | 'en'): Promise<Verdict> {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, `the prefix builds: ${prefix.join(' · ')}`).toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}

const centreOf = (v: Verdict): string | undefined => {
  if (v.kind !== 'commit') return undefined;
  const arc = (v.commands as readonly { type: string; center?: string }[]).find((c) => c.type === 'arc');
  return arc?.center;
};

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const RUNS = ['AOB', 'OAB', 'ABO', 'ABC', 'ODC', 'DCE', 'PAB', 'APB', 'OPA', 'POA'];
const NOUNS: { he: string; en: string }[] = [
  { he: 'רבע מעגל', en: 'quarter circle' },
  { he: 'חצי מעגל', en: 'semicircle' },
  { he: 'גזרה', en: 'sector' },
];
const PREFIXES: string[][] = [[], ['נקודה A', 'נקודה B'], ['נקודה A', 'נקודה O', 'נקודה B']];

describe('#2486 — one reader: the committed centre is arcRunRoles(run).centre', () => {
  for (const noun of NOUNS)
    for (const run of RUNS)
      it(`«${noun.he} ${run}» / "${noun.en} ${run}"`, async () => {
        const want = arcRunRoles(run.split('') as [string, string, string]).centre;
        for (const [line, locale] of [[`${noun.he} ${run}`, 'he'], [`${noun.en} ${run}`, 'en']] as const) {
          const v = await decide([], line, locale);
          expect(v.kind, `${line}: ${JSON.stringify(v).slice(0, 300)}`).toBe('commit');
          expect(centreOf(v), line).toBe(want);
          expect((v as { note?: { key: string } }).note?.key, `${line}: the student's own reading built, nothing taught`).not.toBe('input.canonicalHint');
        }
      }, 60_000);

  it.each([
    ['AOB רבע מעגל', 'O'],
    ['רבע המעגל AOB', 'O'],
    ['רבע עיגול AOB', 'O'],
    ['רבע מעגל AOB ברדיוס 5', 'O'],
    ['חצי עיגול AOB', 'O'],
    ['חצי מעגל AOB ברדיוס 3', 'O'],
    ['גיזרה AOB', 'O'],
    ['הגזרה AOB', 'O'],
    ['OCD רבע מעגל', 'O'],
  ])('spelling «%s» → centre %s', async (line, want) => {
    const v = await decide([], line, 'he');
    expect(v.kind).toBe('commit');
    expect(centreOf(v)).toBe(want);
  }, 60_000);

  for (const prefix of PREFIXES.slice(1))
    for (const noun of NOUNS)
      for (const run of ['AOB', 'OAB'])
        it(`${prefix.join(' · ')} · «${noun.he} ${run}» → centre O, nothing taught`, async () => {
          const v = await decide(prefix, `${noun.he} ${run}`, 'he');
          expect(v.kind).toBe('commit');
          expect(centreOf(v)).toBe('O');
          expect((v as { note?: { key: string } }).note?.key).not.toBe('input.canonicalHint');
        }, 60_000);

  it('[unchanged] the Thales semicircle on three vertices: «משולש ABC ישר זווית» · «חצי מעגל ABC» puts all three on it', async () => {
    const v = await decide(['משולש ABC ישר זווית'], 'חצי מעגל ABC', 'he');
    expect(v.kind).toBe('commit');
    const cmds = (v as { commands: readonly { type: string; id?: string; bulgeRef?: string; center?: string }[] }).commands;
    const arc = cmds.find((c) => c.type === 'arc')!;
    expect(['A', 'B', 'C']).not.toContain(arc.center); // the centre is the hypotenuse's midpoint, never a vertex
    expect(arc.bulgeRef).toBeDefined();
  }, 60_000);
});
