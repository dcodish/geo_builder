/**
 * #2611 ([ADR-3D-420](../../docs/06b-decisions-3d.md#adr-3d-420)), found in round #2722's pre-play — A STATED RADIUS HAS A
 * PANEL ROW, for every free circle, named or not.
 *
 * Measured at d54bf9b8: «רדיוס המעגל הוא 3» drew a circle with no 3 anywhere and the panel read «אין עדיין נתונים יציבים
 * להצגה»; so did «מעגל O ברדיוס 3» (the ADR-3D-419 known gap). 2-D at the same commit reads «רדיוס O = 3» and «רדיוס המעגל
 * = 3», keeps «2.5», and draws no number on the canvas. Whether 3-D should is open (the ADR), so the canvas is locked too.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { derive3, useGeo3 } from '../store/store3';
import { dataView, panelIsEmpty, radiusRowLabel3, statedLengths } from '../engine/dataView';

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
const run = (...lines: string[]) => {
  reset();
  for (const l of lines) st().submit(l);
  expect(st().lastError).toBeNull();
};
const panel = () => dataView(derive3(st().facts, 0).construction, 0);
const rows = (lang: 'he' | 'en') => {
  void i18n3d.changeLanguage(lang);
  return panel().radii.map((r) => `${radiusRowLabel3(r, i18n3d.t.bind(i18n3d) as never)} = ${r.text}`);
};

beforeEach(reset);

describe('#2611 — the panel shows a stated radius', () => {
  const CASES: { lines: string[]; he: string; en: string }[] = [
    { lines: ['מעגל O ברדיוס 3'], he: 'רדיוס O = 3', en: 'radius O = 3' },
    { lines: ['מעגל שמרכזו O ורדיוסו 3'], he: 'רדיוס O = 3', en: 'radius O = 3' },
    { lines: ['מעגל O', 'רדיוס המעגל הוא 3'], he: 'רדיוס O = 3', en: 'radius O = 3' },
    { lines: ['רדיוס המעגל O הוא 3'], he: 'רדיוס O = 3', en: 'radius O = 3' },
    { lines: ['רדיוס המעגל הוא 3'], he: 'רדיוס המעגל = 3', en: 'radius of the circle = 3' },
    { lines: ['D על המעגל', 'רדיוס המעגל הוא 3'], he: 'רדיוס המעגל = 3', en: 'radius of the circle = 3' },
    { lines: ['מעגל O ברדיוס 2.5'], he: 'רדיוס O = 2.5', en: 'radius O = 2.5' },
  ];
  for (const c of CASES) {
    it(`«${c.lines.join(' · ')}» reads «${c.he}», and the panel is not empty`, () => {
      run(...c.lines);
      expect(rows('he')[0].replace(/[⁦-⁩]/g, '')).toBe(c.he);
      expect(rows('en')[0].replace(/[⁦-⁩]/g, '')).toBe(c.en);
      expect(panelIsEmpty(panel())).toBe(false);
    });
  }

  it('each circle keeps its own row', () => {
    run('מעגל O ברדיוס 3', 'מעגל P ברדיוס 4');
    expect(panel().radii).toEqual([{ circle: 'O', text: '3' }, { circle: 'P', text: '4' }]);
  });
});

describe('#2611 — what the row leaves alone', () => {
  it('a circle with no stated radius has no row: a sampled size is not knowledge', () => {
    run('מעגל O');
    expect(panel().radii).toEqual([]);
    run('D על המעגל');
    expect(panel().radii).toEqual([]);
  });

  it('a polygon\'s circle has no row: nothing was stated', () => {
    run('משולש ABC חסום במעגל');
    expect(panel().radii).toEqual([]);
  });

  it('a radius given as a length stays its own |OD| row, never shown twice', () => {
    run('מעגל O', 'D על המעגל', 'OD = 3');
    expect(panel().radii).toEqual([]);
    expect(panel().vectors.map((v) => v.mag)).toContain('|OD| = 3');
  });

  it('the canvas list carries no radius: a number on the canvas is an open product question (2-D draws none)', () => {
    run('רדיוס המעגל O הוא 3');
    expect([...statedLengths(derive3(st().facts, 0).construction)]).toEqual([]);
  });
});
