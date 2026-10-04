/**
 * #1597 (ADR-AG-232) — a curve's folded details are LABELLED LINES, one per fact.
 *
 * Operator, 2026-09-30, playing round #1571 T49: *"we need to break this to 2 lines: «(3, 4), r = 5».
 * one clearly saying מרכז המעגל and the other can be r = 5"*. Ruling the same day extended it to the
 * class: the parabola's focus and directrix, and the ellipse's foci, printed bare coordinates the same
 * way. A line is unchanged.
 *
 * The locks CALL the shipped path — `derive` → `knownCurve` → `curveParts` → the panel's
 * `detailRowText`, with the real locale resources — never a re-implementation of the row.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';
import { pointAt } from '../engine/crossings';
import { curveParts, detailLineText, detailsText, describeCurve, type DetailLabelKey, type DetailLine } from '../app/curveText';
import { detailRowText } from '../app/panelRows';
import { analyticI18n } from '../i18n';
import { studentFacingViolations } from '../../shell/studentText';
import type { NumCurve } from '../engine/types';

const he = analyticI18n.getFixedT('he');
const en = analyticI18n.getFixedT('en');
const HE = (k: DetailLabelKey) => he(k);
/** Format controls are display-only; strip them to read the text a student reads. */
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** The details the PANEL shows for the figure's first stated curve, through the real path. */
function panelLines(seq: string[]): string[] {
  const d = derive(seq, 0);
  expect(d.faults, seq.join(' | ')).toEqual([]);
  const cu = d.figure.curves.find((c) => c.stated);
  if (!cu) throw new Error('no stated curve');
  const known = knownCurve(d.construction, cu.id);
  if (!known) throw new Error('curve not known');
  const parts = curveParts(known, (x, y) => pointAt(d.figure, x, y), { vertical: he('slopeVertical') });
  return (parts.details ?? []).map((l) => plain(detailRowText(l, HE)));
}

describe('ADR-AG-232 — the circle row is two lines, the centre labelled (#1597)', () => {
  it('THE REPORTED CASE: «(3, 4), r = 5» becomes «מרכז המעגל: (3, 4)» and «r = 5»', () => {
    expect(panelLines(['נתון מעגל שמשוואתו (x-3)^2+(y-4)^2=25'])).toEqual(['מרכז המעגל: (3, 4)', 'r = 5']);
  });

  it('a centre that has a letter keeps it after the label — «מרכז המעגל: O(0, 0)»', () => {
    expect(panelLines(['נתון מעגל שמשוואתו x^2+y^2=16'])).toEqual(['מרכז המעגל: O(0, 0)', 'r = 4']);
  });
});

describe('ADR-AG-232 — the same class: parabola and ellipse rows are labelled (ruling 2026-09-30)', () => {
  it('parabola → «מוקד: (27/2, 0)» / «מדריך: x = -27/2»', () => {
    expect(panelLines(['y^2=54x'])).toEqual(['מוקד: (27/2, 0)', 'מדריך: x = -27/2']);
  });

  it('ellipse → «a = 5, b = 3» / «מוקדים: (4, 0), (-4, 0)»', () => {
    expect(panelLines(['x^2/25+y^2/9=1'])).toEqual(['a = 5, b = 3', 'מוקדים: (4, 0), (-4, 0)']);
  });

  it('a line is unchanged — one self-describing line, no label', () => {
    expect(panelLines(['נתון הישר l1: y=2x+1'])).toEqual(['y = 2x + 1, m = 2']);
  });
});

/**
 * THE CLASS LOCK: no detail line of any kind prints a bare coordinate or a role line without a label.
 * Written over every kind, so a fifth conic cannot reintroduce an unlabelled `(x, y)`.
 */
describe('ADR-AG-232 — every coordinate-led detail line carries a label', () => {
  const SAMPLES: NumCurve[] = [
    { kind: 'circle', cx: 3, cy: 4, r: 5 },
    { kind: 'parabola', p: 4 },
    { kind: 'ellipse', a: 5, b: 3 },
    { kind: 'line', a: 1, b: -1, c: 2 },
    { kind: 'line', a: 1, b: 0, c: -4 },
  ];
  const lines = SAMPLES.flatMap((c) => curveParts(c, undefined, { vertical: 'אנכי' }).details ?? []);

  it('a line opening with a coordinate (or a named point) is labelled', () => {
    const bare = lines.filter((l: DetailLine) => /^[A-Z]?[₀-₉]?\(/.test(l.text) && !l.label);
    expect(bare).toEqual([]);
  });

  it('every label is a real, student-facing string in BOTH locales', () => {
    const keys = [...new Set(lines.map((l) => l.label).filter((k): k is DetailLabelKey => !!k))];
    expect(keys.sort()).toEqual(['curveCentreLabel', 'curveDirectrixLabel', 'curveFociLabel', 'curveFocusLabel']);
    for (const k of keys) {
      for (const t of [he, en]) {
        const s = t(k);
        expect(s, k).toBeTruthy();
        expect(s, k).not.toBe(k);
      }
      expect(studentFacingViolations([he(k)], { typed: '', names: [] }), k).toEqual([]);
    }
  });
});

describe('ADR-AG-232 — the single-line composers', () => {
  it('detailLineText puts the label first; an unlabelled line is its text', () => {
    expect(detailLineText({ label: 'curveCentreLabel', text: '(3, 4)' }, HE)).toBe('מרכז המעגל: (3, 4)');
    expect(detailLineText({ text: 'r = 5' }, HE)).toBe('r = 5');
  });

  it('a caller with nowhere to stack the lines joins them with « · »', () => {
    const d = curveParts({ kind: 'circle', cx: 3, cy: 4, r: 5 }).details!;
    expect(detailsText(d, HE)).toBe('מרכז המעגל: (3, 4) · r = 5');
    expect(plain(describeCurve('', { kind: 'circle', cx: 3, cy: 4, r: 5 }, undefined, HE))).toBe(
      '(x - 3)² + (y - 4)² = 25 · מרכז המעגל: (3, 4) · r = 5',
    );
  });

  it('the panel isolates the Hebrew label as one island, so the colon stays beside it', () => {
    const row = detailRowText({ label: 'curveCentreLabel', text: '(3, 4)' }, HE);
    expect(row).toMatch(/^⁨מרכז המעגל⁩: \(3, 4\)$/);
  });
});
