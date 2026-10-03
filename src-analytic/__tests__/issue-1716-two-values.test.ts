/**
 * #1716 (ADR-AG-226) — A ROW SHOWS UP TO TWO VALUES, through ONE gate.
 *
 * Operator, playing T6 (471 9/4): *"the row of tan should have created a slope of 2 and it did not"*. Measured:
 * the exam's own lines fix |slope AB| = 2 and leave its sign to the printed figure, so the slope is 2 in some
 * configurations and −2 in others, and the panel printed «—». Operator ruling, 2026-10-03: *"if there are 2
 * options, we always show up to 2 options"* — one value as today, two as «-2 או 2», more keeps «—».
 *
 * Every row kind is asked through the panel's own functions (`panelKnowledge`, `segmentKnowledge`, `pointText`,
 * `valueText`), so this lock CALLS the decision rather than reproducing it (ADR-W-053).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { MAX_LISTED_VALUES, knownValue } from '../engine/evaluate';
import { confirmTaught } from '../app/submit';
import { panelKnowledge, segmentKnowledge, slopeRowText, valueText } from '../app/panelRows';
import { pointText, scalarText } from '../app/pointText';
import { curveParts } from '../app/curveText';
import { fmtAnalytic } from '../format';

interface CorpusQuestion {
  id: string;
  printed: number;
  lines: string[];
}
const CORPUS: CorpusQuestion[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
const q94 = CORPUS.find((c) => c.id === '9/4')!;
/** The exam's lines as printed — sliced at `printed` (ADR-AG-222); the figure note follows. */
const PRINTED = confirmTaught(q94.lines.slice(0, q94.printed), 0);
const WITH_NOTE = confirmTaught(q94.lines, 0);
const SEEDS = [0, 1, 2, 3];

const clean = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return d;
};
const seg = (d: ReturnType<typeof derive>, ends: string) =>
  segmentKnowledge(d).find((s) => s.ends.join('') === ends || [...s.ends].reverse().join('') === ends)!;
const point = (d: ReturnType<typeof derive>, id: string) => {
  const p = panelKnowledge(d).points.find((q) => q.id === id)!;
  return pointText(d, id, p.x, p.y, fmtAnalytic);
};

describe('#1716 — 9/4: the exam lines give «-2 או 2», the figure note gives «2»', () => {
  it('the exam as printed: slope AB lists both signs, at every seed', () => {
    for (const seed of SEEDS) {
      const d = clean(PRINTED, seed);
      expect(valueText(seg(d, 'AB').slope, fmtAnalytic), `seed ${seed}`).toBe('-2 או 2');
      // …and its angle with the x-axis lists the two angles those slopes make
      const angle = seg(d, 'AB').angle;
      expect(angle.known).toBe(false);
      expect(!angle.known && angle.options?.map((v) => Math.round(v * 100) / 100)).toEqual([63.43, 116.57]);
    }
  });

  it('with the figure note («A משמאל ל-O …»): one configuration, slope AB = 2', () => {
    for (const seed of SEEDS) {
      const d = clean(WITH_NOTE, seed);
      expect(valueText(seg(d, 'AB').slope, fmtAnalytic), `seed ${seed}`).toBe('2');
    }
  });

  it('a coordinate with two positions lists both; one with four (D) keeps «—» — the cap is two', () => {
    const d = clean(PRINTED, 0);
    expect(point(d, 'A')).toMatch(/^\[?\(-3, 0\)\]? או \[?\(3, 0\)\]?$/);
    expect(point(d, 'D')).toBe('—');
    expect(point(clean(WITH_NOTE, 0), 'D')).toBe('(9, -6)');
  });
});

describe('#1716 — every row kind goes through the one gate', () => {
  const lines = ['O(0,0)', 'A(1,0)', 'B(k,0)', 'OB = 3', 'AB'];

  it('a parameter: «k = -3 או 3»', () => {
    const d = clean(lines);
    const k = panelKnowledge(d).params.find((p) => p.sym === 'k')!;
    expect(valueText(k.k, fmtAnalytic)).toBe('-3 או 3');
  });

  it('a length: AB = «2 או 4»', () => {
    expect(valueText(seg(clean(lines), 'AB').length, fmtAnalytic)).toBe('2 או 4');
  });

  it('an equation: the line AB is one of two whole equations, never a mix of their coefficients', () => {
    const d = clean(['O(0,0)', 'A(2,0)', 'B(0,k)', 'OB = 3', 'הישר AB']);
    const row = panelKnowledge(d).curves.find((c) => c.id === 'line-AB')!;
    expect(row.known).toBeNull();
    expect(row.options?.map((o) => curveParts(o).equation).sort()).toEqual(['3x + 2y - 6 = 0', '3x - 2y - 6 = 0']);
  });

  it('the ask lane reads the same gate: «שיפוע AB» answers what the row shows', () => {
    const d = clean(PRINTED, 0);
    const read = (f: ReturnType<typeof derive>['figure']) => {
      const a = f.points.find((p) => p.id === 'A');
      const b = f.points.find((p) => p.id === 'B');
      return a && b && Math.abs(b.x - a.x) > 1e-12 ? (b.y - a.y) / (b.x - a.x) : null;
    };
    expect(scalarText(d.construction, read, fmtAnalytic)).toBe(valueText(seg(d, 'AB').slope, fmtAnalytic));
  });

  it('a continuous value is open, never a list: «A(0,0)», «B(k,0)» → k «—»', () => {
    const d = clean(['A(0,0)', 'B(k,0)', 'AB']);
    const k = panelKnowledge(d).params.find((p) => p.sym === 'k')!;
    expect(valueText(k.k, fmtAnalytic)).toBeNull();
    expect(knownValue(d.construction, (f) => f.env.k ?? null)).toEqual({ known: false });
  });

  it('the slope row keeps a value list left-to-right: only «או» is an island (measured in the browser: «2 או 2-»)', () => {
    const FSI = '⁨';
    const PDI = '⁩';
    const row = slopeRowText('AB', '-2 או 2', 'זווית עם ציר ה-x', '63.43° או 116.57°');
    expect(row.startsWith(`AB: -2 ${FSI}או${PDI} 2 · `)).toBe(true);
    expect(row.endsWith(`: 63.43° ${FSI}או${PDI} 116.57°`)).toBe(true);
    // a WORD part stays one right-to-left island, as #1646 made it
    expect(slopeRowText('BC', 'אנכי (אין שיפוע)', 'זווית', '90°')).toContain(`${FSI}אנכי (אין שיפוע)${PDI}`);
  });

  it('the cap is the ruling’s two', () => {
    expect(MAX_LISTED_VALUES).toBe(2);
  });
});
