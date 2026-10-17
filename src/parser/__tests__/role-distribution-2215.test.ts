/**
 * #2215 ([ADR-723](../../../docs/06-decisions.md#adr-723)) — A ROLE NOUN SPREADS ONLY OVER THE PAIRS IT GOVERNS.
 *
 * Measured at 688dfb96 (`decideDeterministic2D`, prefix «מעגל O», model mocked): «AB קוטר במעגל O ו-CD מיתר במעגל O»
 * committed `diameter, diameter` — CD, which the words call a CHORD, drawn as a second diameter (|CD| = 2r, an
 * unstated special case, ADR-052); the same for «AB מיתר … ו-CD קוטר …», the comma form, «AB קוטר ו-CD מיתר במעגל O»,
 * the three-role line and English. Root cause: the `diameter` rule's plural distribution (#151) paired EVERY label
 * run in the sentence. Fix: before distributing, the rule asks the role-noun registry (`rivalRoleGoverns`) whether
 * the words give a pair to the other circle role; if so the line is two clauses and the rule declines.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { rivalRoleGoverns } from '../roleNouns';
import type { AnyCommand } from '@/engine';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** «מעגל O» then `line`, through the real decide → commit path; the line's commands (or null when refused). */
async function onCircleO(line: string, locale: 'he' | 'en' = 'he'): Promise<AnyCommand[] | null> {
  useGeoStore.getState().clear();
  let out: AnyCommand[] | null = null;
  for (const l of [locale === 'en' ? 'circle O' : 'מעגל O', line]) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, l, locale);
    out = null;
    if (v.kind === 'commit') {
      for (const c of v.commands) useGeoStore.getState().execute(c, l, `g${st.facts.length}`);
      out = [...v.commands];
    }
  }
  return out;
}

const diameters = (cmds: AnyCommand[]) =>
  cmds.filter((c) => c.type === 'diameter').map((c) => [(c as { id1: string }).id1, (c as { id2: string }).id2].sort().join(''));
const chordsAsMemberships = (cmds: AnyCommand[]) =>
  cmds.filter((c) => c.type === 'point-on-circle').map((c) => (c as { id: string }).id).sort().join('');

describe('#2215 — a chord named beside a diameter is a general chord', () => {
  const rows: [string, string, 'he' | 'en', string[], string][] = [
    ['the report', 'AB קוטר במעגל O ו-CD מיתר במעגל O', 'he', ['AB'], 'CD'],
    ['roles swapped', 'AB מיתר במעגל O ו-CD קוטר במעגל O', 'he', ['CD'], 'AB'],
    ['comma', 'AB קוטר במעגל O, CD מיתר במעגל O', 'he', ['AB'], 'CD'],
    ['one circle phrase', 'AB קוטר ו-CD מיתר במעגל O', 'he', ['AB'], 'CD'],
    ['three roles', 'AB מיתר במעגל O ו-CD מיתר במעגל O ו-EF קוטר במעגל O', 'he', ['EF'], 'ABCD'],
    ['English', 'AB is a diameter of circle O and CD is a chord of circle O', 'en', ['AB'], 'CD'],
  ];
  for (const [name, line, locale, dia, chordPts] of rows) {
    it(`${name}: only the pair called a diameter is drawn as one`, async () => {
      const cmds = await onCircleO(line, locale);
      expect(cmds, 'the line builds').not.toBeNull();
      expect(diameters(cmds!)).toEqual(dia);
      expect(chordsAsMemberships(cmds!)).toBe(chordPts);
      // and the figure agrees: the chord is not a diameter at the shown configuration
      const d = replay(useGeoStore.getState().facts, 0);
      const r = d.circles.get('circle-O')!.r;
      const [a, b] = [chordPts[0], chordPts[1]].map((p) => d.positions.get(p)!);
      expect(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 2 * r)).toBeGreaterThan(0.05);
      expect(d.violations).toEqual([]);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  const controls: [string, string, string[]][] = [
    ['one noun over a list of diameters', 'AB ו-CD קוטרים במעגל O', ['AB', 'CD']],
    ['one noun over a list of chords', 'AB ו-CD מיתרים במעגל O', []],
    ['a diameter and a point', 'AB קוטר במעגל O ו-E על מעגל O', ['AB']],
  ];
  for (const [name, line, dia] of controls) {
    it(`unchanged — ${name}`, async () => {
      const cmds = await onCircleO(line);
      expect(cmds).not.toBeNull();
      expect(diameters(cmds!)).toEqual(dia);
    });
  }
});

describe('rivalRoleGoverns — read from the role-noun registry, both locales', () => {
  it('a pair the rival noun governs, and not the rule\'s own, is another clause', () => {
    expect(rivalRoleGoverns('AB קוטר במעגל O ו-CD מיתר במעגל O', 'diameter', 'chord', [['A', 'B'], ['C', 'D']])).toBe(true);
    expect(rivalRoleGoverns('AB is a diameter of circle O and CD is a chord of circle O', 'diameter', 'chord', [['A', 'B'], ['C', 'D']])).toBe(true);
    expect(rivalRoleGoverns('AB מיתר במעגל O ו-CD קוטר במעגל O', 'chord', 'diameter', [['A', 'B'], ['C', 'D']])).toBe(true);
  });
  it('one noun over the whole list is not a rival', () => {
    expect(rivalRoleGoverns('AB ו-CD קוטרים במעגל O', 'diameter', 'chord', [['A', 'B'], ['C', 'D']])).toBe(false);
    expect(rivalRoleGoverns('AB and CD are chords of circle O', 'chord', 'diameter', [['A', 'B'], ['C', 'D']])).toBe(false);
  });
});
