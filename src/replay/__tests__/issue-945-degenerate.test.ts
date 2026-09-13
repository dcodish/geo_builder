/**
 * #945 ([ADR-513](../../../docs/06-decisions.md#adr-513)) — the 2-D half of ADR-W-048: a figure whose givens
 * force a declared polygon FLAT says so, naming the statements — never a silent flat drawing with every
 * fact green, and never a refusal.
 *
 * Measured at HEAD before the change: «משולש ABC» · «AB = 5» · «BC = 3» · «AC = 8» draws a triangle whose
 * vertices are collinear to 1.9e-4 of its own extent, every fact `ok`, no notice — the triangle inequality
 * holds with equality, the accept gate (ADR-413, 1e-4) is one order of magnitude below, and nothing said a
 * word. The predicate, the calibration and the corpus sweep are the ADR's deliverable; this file is its lock.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
import { DEGENERATE_EXTENT_RATIO, degeneratePolygons } from '@/engine';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

const said = (facts: ReturnType<typeof factsOf>, ids: string[]) => ids.map((id) => facts.find((f) => f.id === id)?.utterance);

describe('#945 — the trigger family: givens that force a declared polygon flat', () => {
  it('sides that meet the triangle inequality with equality (5, 3, 8) → exactly one notice naming the declaration and the closing side', () => {
    const facts = factsOf(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']);
    const fig = replay(facts, 0);
    expect(fig.lastError, 'a notice, never a refusal').toBeNull();
    for (const s of Object.values(fig.status)) expect(s).toBe('ok');
    expect(fig.degeneracies).toHaveLength(1);
    expect(fig.degeneracies[0].object).toBe('ABC');
    expect(fig.degeneracies[0].ratio).toBeLessThan(DEGENERATE_EXTENT_RATIO);
    expect(said(facts, fig.degeneracies[0].statements), 'the declaring statement, then the one that closed the triangle').toEqual(['משולש ABC', 'AC = 8']);
  });

  it('the isosceles twin (4, 4, 8) and a stated sliver of 0.1° trip the same predicate — the drawing IS a line', () => {
    for (const seq of [
      ['משולש ABC', 'AB = 4', 'BC = 4', 'AC = 8'],
      ['משולש ABC', 'זווית BAC = 0.1'],
    ]) {
      const facts = factsOf(seq);
      const fig = replay(facts, 0);
      expect(fig.lastError, seq.join(' · ')).toBeNull();
      expect(fig.degeneracies.map((d) => d.object), seq.join(' · ')).toEqual(['ABC']);
      expect(fig.degeneracies[0].statements.length, 'names the student’s statements').toBeGreaterThan(0);
    }
  });

  it('two right angles (90 + 90) are NOT a member: the tool draws only an approximate sliver that fails the requirement bar (never displayed), above the band', () => {
    const facts = factsOf(['משולש ABC', 'זווית BAC = 90', 'זווית ABC = 90']);
    const fig = replay(facts, 0);
    expect(fig.degeneracies).toEqual([]);
    expect(degeneratePolygons(fig.construction, fig.positions, 1)[0]?.ratio).toBeGreaterThan(DEGENERATE_EXTENT_RATIO);
  });

  it('the statements are the student’s units: the responsible one is the LAST of the shortest flat prefix', () => {
    const facts = factsOf(['משולש ABC', 'AC = 8', 'AB = 5', 'BC = 3']);
    const fig = replay(facts, 0);
    expect(said(facts, fig.degeneracies[0].statements)).toEqual(['משולש ABC', 'BC = 3']);
  });

  it('the notice survives save/load: it is derived from the construction, nothing is stored', () => {
    const facts = factsOf(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']);
    const reloaded = facts.map((f) => ({ ...f }));
    expect(replay(reloaded, 0).degeneracies.map((d) => d.object)).toEqual(['ABC']);
  });
});

describe('#945 — the false-positive net (the half that matters)', () => {
  it('ordinary polygons are silent', () => {
    for (const seq of [['משולש ABC'], ['ריבוע ABCD'], ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 6'], ['מקבילית ABCD', 'AC', 'BD'], ['משולש ישר זווית ABC', 'AC = 15', 'BC = 10']]) {
      const fig = replay(factsOf(seq), 0);
      expect(fig.lastError, seq.join(' · ')).toBeNull();
      expect(fig.degeneracies, seq.join(' · ')).toEqual([]);
    }
  });

  it('a thin-but-legitimate triangle is silent (the calibration’s nearest neighbour)', () => {
    for (const seq of [
      ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.9'],
      ['משולש ABC', 'זווית BAC = 89', 'זווית ABC = 90'],
      ['משולש ABC', 'זווית BAC = 1'],
    ]) {
      const fig = replay(factsOf(seq), 0);
      expect(fig.lastError, seq.join(' · ')).toBeNull();
      expect(fig.degeneracies, seq.join(' · ')).toEqual([]);
      const flat = degeneratePolygons(fig.construction, fig.positions, 1);
      expect(flat[0]?.ratio, `${seq.join(' · ')} sits above the band`).toBeGreaterThan(DEGENERATE_EXTENT_RATIO);
    }
  });

  it('a polygon a driven solve collapsed is REFUSED by the accept gate (ADR-413), below this notice’s band — the two never overlap', () => {
    const fig = replay(factsOf(['משולש ABC', 'D אמצע AB', 'משולש ADB']), 0);
    expect(fig.lastError, 'the ADR-413 refusal stands').not.toBeNull();
    expect(fig.degeneracies).toEqual([]);
  });
});

describe('#945 — i18n', () => {
  it('both locales carry the notice, with both placeholders', () => {
    for (const loc of [he, en] as unknown as { figure: Record<string, string> }[]) {
      expect(loc.figure.degenerate).toContain('{{object}}');
      expect(loc.figure.degenerate).toContain('{{statements}}');
    }
    expect(he.figure.degenerate).toMatch(/[֐-׿]/);
  });
});
