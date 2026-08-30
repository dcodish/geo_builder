/**
 * #698 / ADR-CX-034 — an enumeration SIZE is not an existence claim.
 *
 * `enumeratedConfigCount` (then `configCount`) was 0 for every under-determined figure, because
 * `tier1` returns `branches: []` when no argument is determined — "nothing to enumerate", not
 * "nothing survived". The panel's always-visible head-line read that 0 as "there are none" and told
 * the student «אין תצורה תקפה» while their point was on screen, from input as ordinary as «|z1| = 5».
 *
 * The locks below assert the STATUS LINE, not the count — the count was never the thing that lied.
 */
import { describe, expect, it } from 'vitest';
import { stripFormatControls } from '../../shell/bidi';
import { deriveLines } from '../app/deriveLines';
import { complexI18n } from '../i18n';
import { v2Freedom } from '../replay/scene2';

const tRaw = complexI18n.getFixedT('he');
const t = (key: string, params?: Record<string, unknown>) => stripFormatControls(tRaw(key, params));
const NONE = 'אין תצורה תקפה';

describe('#698 — the freedom head-line reports EXISTENCE, not the enumeration size', () => {
  // The five rows measured on the issue, verbatim.
  const rows: [string[], string][] = [
    [['z1 מספר מרוכב'], 'דרגות חופש: 2'],
    [['|z1| = 5'], 'דרגות חופש: 1'],
    [['z1 מספר מרוכב', 'z2 מספר מרוכב'], 'דרגות חופש: 4'],
    [['arg z1 = 30'], 'דרגות חופש: 1'],
    [['z1 = 3+4i'], 'הצורה נקבעה במלואה'],
  ];

  it.each(rows)('%s → %s', (lines, expected) => {
    const d = deriveLines(lines, 0, 0);
    expect(v2Freedom(d, t)).toBe(expected);
  });

  it('an under-determined figure that DRAWS never says «no valid configuration»', () => {
    for (const lines of [['z1 מספר מרוכב'], ['|z1| = 5'], ['z1 מספר מרוכב', 'z2 מספר מרוכב']]) {
      const d = deriveLines(lines, 0, 0);
      expect(d.points.length).toBeGreaterThan(0); // a figure IS on screen
      expect(d.enumeratedConfigCount).toBe(0); // and nothing was enumerated — both are true at once
      expect(d.hasConfiguration).toBe(true);
      expect(v2Freedom(d, t)).not.toBe(NONE);
    }
  });

  /**
   * The other half, and the whole point of #655: the fix must not silence the TRUE case. Both ways a
   * figure is actually refuted still say it.
   */
  it('a contradiction still says «no valid configuration»', () => {
    const d = deriveLines(['|z1| = 5', '|z1| = 7'], 0, 0);
    expect(d.contradiction).toBe('modulus');
    expect(d.hasConfiguration).toBe(false);
    expect(v2Freedom(d, t)).toBe(NONE);
  });

  it('a filter that EMPTIES a non-empty enumerated set still says «no valid configuration»', () => {
    const d = deriveLines(['z1 = 3+4i', 'z1 ברביע השלישי'], 0, 0);
    expect(d.emptiedBy?.kind).toBe('quadrant');
    expect(d.hasConfiguration).toBe(false);
    expect(v2Freedom(d, t)).toBe(NONE);
  });

  /**
   * «הציגו תצורה אחרת» already read the right predicate (#689) and must be byte-identical across this
   * fix — these are the values measured on the pre-fix build.
   */
  it('canCycle is unchanged by the split', () => {
    const cycles: [string[], boolean][] = [
      [['z1 מספר מרוכב'], true],
      [['|z1| = 5'], true],
      [['arg z1 = 30'], true],
      [['z1 = 3+4i'], false],
      [['z1 = 3+4i', 'z1 ברביע השלישי'], false],
      [['|z1| = 5', '|z1| = 7'], true],
    ];
    for (const [lines, expected] of cycles) {
      expect(deriveLines(lines, 0, 0).canCycle).toBe(expected);
    }
  });
});
