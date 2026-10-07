/**
 * #945 ([ADR-513](../../../docs/06-decisions.md#adr-513)) — the 2-D half of ADR-W-048: a figure whose givens
 * force a declared polygon FLAT says so, naming the statements — never a silent flat drawing with every
 * fact green, and never a refusal.
 *
 * Measured at HEAD before the change: «משולש ABC» · «AB = 5» · «BC = 3» · «AC = 8» draws a triangle whose
 * vertices are collinear to 1.9e-4 of its own extent, every fact `ok`, no notice — the triangle inequality
 * holds with equality, the accept gate (ADR-413, 1e-4) is one order of magnitude below, and nothing said a
 * word. The predicate, the calibration and the corpus sweep are the ADR's deliverable; this file is its lock.
 *
 * REVERSED FOR DECLARED POLYGONS by the operator's ruling of 2026-10-07 (#1849, [ADR-602](../../../docs/06-decisions.md#adr-602),
 * [ADR-W-115](../../../docs/06w-decisions-workspace.md#adr-w-115)): *"refuse on all tools with a message since it
 * contradicts ABC is a triangle and a flat line is not a triangle"*. The four trigger-family cases below asserted the
 * NOTICE and now assert the REFUSAL — updated in place, the ruling cited at each. The notice channel itself stays as
 * the net (a flat declared polygon that ever reached the display would still be said), and the false-positive net
 * below is unchanged: the same calibration is now the refusal floor.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { COLLAPSED_VS, replay } from '@/replay/core';
import { DEGENERATE_EXTENT_RATIO, degeneratePolygons } from '@/engine';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';


/** The utterances whose rows carry a non-ok status. */
const refusedRows = (facts: ReturnType<typeof factsOf>, fig: ReturnType<typeof replay>) => [...new Set(facts.filter((f) => fig.status[f.id] !== 'ok').map((f) => f.utterance))];

describe('#945 — the trigger family: givens that force a declared polygon flat (REFUSED since the 2026-10-07 ruling, ADR-602)', () => {
  it('sides that meet the triangle inequality with equality (5, 3, 8) → the closing side is refused, naming the declaration', () => {
    // Was: exactly one notice naming «משולש ABC» and «AC = 8», every fact ok. Ruling 2026-10-07 (#1849): refused.
    const facts = factsOf(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']);
    const fig = replay(facts, 0);
    const m = COLLAPSED_VS.exec(fig.lastError ?? '');
    expect(m, `refused as a flattened polygon: ${fig.lastError}`).not.toBeNull();
    expect(m![1]).toBe('A, B, C');
    expect(facts[Number(m![3])]?.utterance, 'the other side is the statement that declared the triangle').toBe('משולש ABC');
    expect(refusedRows(facts, fig), 'only the closing side').toEqual(['AC = 8']);
    expect(fig.pending, 'a contradiction, never "add the remaining givens"').toBe(false);
    expect(fig.degeneracies, 'nothing flat is drawn, so there is nothing to notice').toEqual([]);
  });

  it('the isosceles twin (4, 4, 8) is refused the same way; a stated sliver of 0.1° is a REAL triangle and builds, drawn above the floor', () => {
    // Was: both tripped the notice. Ruling 2026-10-07: the forced member is refused; the sliver is not forced flat —
    // a 0.1° triangle exists — so the gate's ladder draws it thicker than the floor, silently.
    const forced = factsOf(['משולש ABC', 'AB = 4', 'BC = 4', 'AC = 8']);
    const f1 = replay(forced, 0);
    expect(f1.lastError).toMatch(COLLAPSED_VS);
    expect(refusedRows(forced, f1)).toEqual(['AC = 8']);
    const sliver = replay(factsOf(['משולש ABC', 'זווית BAC = 0.1']), 0);
    expect(sliver.lastError).toBeNull();
    expect(sliver.degeneracies).toEqual([]);
    expect(degeneratePolygons(sliver.construction, sliver.positions, 1)[0]?.ratio).toBeGreaterThan(DEGENERATE_EXTENT_RATIO);
  });

  it('two right angles (90 + 90) are NOT a member: since #1328 (ADR-537) the second is REFUSED as over-constrained — a needle the tolerance bought is not a figure, so there is nothing to notice', () => {
    // When this lock was written the case read "draws only an approximate sliver that fails the
    // requirement bar (never displayed)". Measured 2026-09-21, it WAS displayed: the solver satisfied both
    // right angles to within ANGLE_EPS with a 0.35° apex at flatness 1.5e-3 — above this notice's band —
    // and committed it green (the operator's T4). ADR-537's accept gate now refuses it; the prior
    // figure (one right angle) stays, and it is above the band as before.
    const facts = factsOf(['משולש ABC', 'זווית BAC = 90', 'זווית ABC = 90']);
    const fig = replay(facts, 0);
    expect(fig.lastError, 'refused, not drawn').toMatch(/^over-constrained: .*cannot hold/);
    expect(fig.pending, 'a contradiction, never "add the remaining givens"').toBe(false);
    expect(fig.degeneracies).toEqual([]);
    expect(degeneratePolygons(fig.construction, fig.positions, 1)[0]?.ratio).toBeGreaterThan(DEGENERATE_EXTENT_RATIO);
  });

  it('the statements are the student’s units: the refused one is the statement that COMPLETES the collapse, in either typing order', () => {
    // Was: the notice named «BC = 3» as the responsible statement. Ruling 2026-10-07: that statement is refused.
    const facts = factsOf(['משולש ABC', 'AC = 8', 'AB = 5', 'BC = 3']);
    const fig = replay(facts, 0);
    expect(fig.lastError).toMatch(COLLAPSED_VS);
    expect(refusedRows(facts, fig)).toEqual(['BC = 3']);
  });

  it('the refusal survives save/load: it is derived from the statements, nothing is stored', () => {
    // Was: the notice survived reload. Ruling 2026-10-07: the refusal does, byte-identically.
    const facts = factsOf(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']);
    const reloaded = facts.map((f) => ({ ...f }));
    expect(replay(reloaded, 0).lastError).toBe(replay(facts, 0).lastError);
    expect(replay(reloaded, 0).lastError).toMatch(COLLAPSED_VS);
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
