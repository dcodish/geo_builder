/**
 * #1832 (ADR-AG-246) — a DOMAIN stated for a plane coordinate is never a parameter.
 *
 * «y = 2x + 1, x > 0» and «x^2 + y^2 = 4, y > 0» used to commit the curve plus a parameter NAMED x (or y)
 * restricted to positive values: the curve's equation keeps x and y out of the free register, so the
 * "parameter" was read by nothing, the curve was drawn whole and the stated restriction did nothing.
 * Every `param` fact passes the apply boundary, which now refuses one naming x or y with a message that
 * says what is not supported (drawing part of a curve is #1846). A genuine parameter is untouched.
 *
 * Every lock CALLS the real path: `decideSubmit` for the verdict, `derive` for the fold and the figure.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';

/** Submit every line through the real decision; returns each verdict kind (+ the refusal key). */
function play(lines: readonly string[]): string[] {
  const kept: string[] = [];
  return lines.map((l) => {
    const v = decideSubmit(l, kept, 0);
    if (v.kind === 'record') kept.push(v.line);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
}

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

describe('#1832 — the reported lines are refused, never committed with the restriction dropped', () => {
  it.each(['y = 2x + 1, x > 0', 'x^2 + y^2 = 4, y > 0'])('«%s» on an empty canvas is refused whole, quoting the line', (line) => {
    const v = decideSubmit(line, [], 0);
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error).toEqual({ key: 'coordinate-restriction', detail: line });
  });

  it.each([
    'y = 2x + 1 , x > 0',
    'y = 2x + 1, x ≥ 0',
    'y = 2x + 1, -1 < x < 2',
    'y = 2x + 1 (x > 0)',
    'y = 2x+1 ; x > 0',
    'x^2 + y^2 = 4, y ≥ 0',
  ])('neighbour spelling «%s» is refused the same way', (line) => {
    expect(play([line])).toEqual(['refused:coordinate-restriction']);
  });

  it.each(['x > 0', 'y ≥ 0', 'y >= 0', 'x < 3', '0 < x < 3', 'x ≠ 0'])(
    'a restriction on its own line after a curve — «%s» — is refused, and the curve stays as it was',
    (line) => {
      expect(play(['y = 2x + 1', line])).toEqual(['record', 'refused:coordinate-restriction']);
      const before = derive(['y = 2x + 1'], 0);
      const after = derive(['y = 2x + 1', line], 0);
      expect(after.faults.map((f) => [f.index, f.code])).toEqual([[1, 'coordinate-restriction']]);
      expect(after.construction.params).toEqual(before.construction.params);
      expect(after.figure.curves.length).toBe(before.figure.curves.length);
    },
  );

  it.each(['x הוא פרמטר חיובי', 'y is a positive parameter', 'x > 0'])(
    'every producer of a parameter is held to it — «%s» on an empty canvas is refused, nothing is declared',
    (line) => {
      expect(play([line])).toEqual(['refused:coordinate-restriction']);
      expect(derive([line], 0).construction.params.map((p) => p.sym)).not.toContain(line.trim()[0]);
    },
  );

  it('the fold refuses the WHOLE line: the curve of «y = 2x + 1, x > 0» is not drawn', () => {
    const d = derive(['y = 2x + 1, x > 0'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['coordinate-restriction']);
    expect(d.figure.curves).toEqual([]);
  });
});

describe('#1832 — the control: a genuine parameter keeps its domain', () => {
  it.each([
    [['y = ax + 1', 'a > 0']],
    [['y = ax + 1, a > 0']],
    [['y = kx', '0 < k < 6']],
    [['y = kx, 0 < k < 6']],
    [['k הוא פרמטר חיובי', 'y = kx']],
  ])('%j records every line', (lines) => {
    expect(play(lines)).toEqual(lines.map(() => 'record'));
  });

  it('«y = ax + 1, a > 0»: a is sampled positive at every configuration', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive(['y = ax + 1, a > 0'], seed);
      expect(d.faults).toEqual([]);
      expect(d.figure.env.a).toBeGreaterThan(0);
    }
  });

  it('«x = 2» is still the vertical line, not a pin on a parameter x', () => {
    expect(play(['x = 2'])).toEqual(['record']);
    expect(derive(['x = 2'], 0).figure.curves.length).toBe(1);
  });
});

describe('#1832 — the message says what is not supported, in both locales', () => {
  const e: InputError = { key: 'coordinate-restriction', detail: 'y = 2x + 1, x > 0' };
  it('Hebrew names the line, the coordinates, and the remedy', () => {
    const s = errorText(e, t);
    expect(s).toContain('y = 2x + 1, x > 0');
    expect(s).toContain('שיעורי המישור');
    expect(s).toContain('a > 0');
  });
  it('English names the line, the coordinates, and the remedy', () => {
    const s = errorText(e, tEn);
    expect(s).toContain('y = 2x + 1, x > 0');
    expect(s).toContain('coordinates of the plane');
    expect(s).toContain('only part of a curve');
  });
});
