/**
 * #1622 E5 · sr-30 — «הציגו תצורה אחרת» NEVER REPEATS THE DRAWING ON THE SCREEN
 * ([ADR-AG-379](../../docs/06c-decisions-analytic.md#adr-ag-379)).
 *
 * Operator, ADR-W-175 sr-30 (2026-11-02): *"«הציגו תצורה אחרת» never repeats the drawing on screen while another valid one
 * exists. A repeat is a bug. A numeric variety bar is the session's mechanism."* Round #2645's pictures: on «α < 30» ·
 * «משולש ABC» · «∢ABC = α» two presses showed the same drawing. The button compared configurations to the solver's noise
 * (`sameConfiguration`); a drawing that differs below what the eye can see was "another" one. It now asks `looksTheSame`
 * — the stacking ruler (`VISIBLE_FRACTION` of the frame) — and walks on.
 *
 * Every lock calls `derive` and `anotherConfiguration`, the button's own seam.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { looksTheSame } from '../engine/evaluate';
import { anotherConfiguration } from '../app/another';

function presses(lines: readonly string[], n: number) {
  const out = [derive(lines, 0)];
  for (let i = 0; i < n; i += 1) {
    const r = anotherConfiguration(lines, out.at(-1)!.configuration);
    if (!r.found) break;
    out.push(derive(lines, r.seed));
  }
  return out;
}

describe('sr-30 — consecutive presses never show the same drawing', () => {
  for (const lines of [
    ['α < 30', 'משולש ABC', '∢ABC = α'],
    ['משולש ABC', '∢ABC = 10'],
    ['A(0,0)', 'B(6,8)', 'נקודה M', 'MA = MB'],
    ['משולש ABC', 'AB = 5'],
  ]) {
    it(`«${lines.join(' · ')}»: 12 presses, every one a different picture from the one before`, () => {
      const ds = presses(lines, 12);
      expect(ds.length).toBe(13);
      for (let i = 1; i < ds.length; i += 1) expect(looksTheSame(ds[i - 1].figure, ds[i].figure), `press ${i}`).toBe(false);
    });
  }

  it('the stated angle still holds at every press («α < 30»)', () => {
    for (const d of presses(['α < 30', 'משולש ABC', '∢ABC = α'], 12)) expect(d.faults).toEqual([]);
  });
});

describe('sr-30 — the control: a figure with ONE drawing says so, it does not skip for ever', () => {
  it('«A(0,0) · B(4,0) · C(0,3) · משולש ABC» answers "nothing else"', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC'];
    expect(anotherConfiguration(lines, derive(lines, 0).configuration).found).toBe(false);
  });

  it('a drawing is the same picture as itself, and a moved point is not', () => {
    const d = derive(['משולש ABC'], 0).figure;
    expect(looksTheSame(d, d)).toBe(true);
    const moved = { ...d, points: d.points.map((p, i) => (i === 0 ? { ...p, x: p.x + 1 } : p)) };
    expect(looksTheSame(d, moved)).toBe(false);
  });
});
