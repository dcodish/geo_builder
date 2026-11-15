/**
 * #2894 part 2 C ([ADR-AG-483](../../docs/06c-decisions-analytic.md#adr-ag-483); 3-D's ADR-3D-495) — STATED LENGTHS NO
 * FIGURE CAN HAVE are refused at once, with 3-D's clearer reason (operator ruling 2026-11-15: "The clearer reason
 * everywhere (Recommended)"). The regression scenarios of the changed wording (CLAUDE.md rule 4), the margin's controls,
 * and the unit of `metricConflict`.
 *
 * pipeline-lock: the check is the refusal's exact sentence through `decideSubmit` and `errorText`, and the work the
 * refusal costs; a saved fixture records only figures that build, and a corpus scenario has no analytic harness.
 */
import { describe, expect, it } from 'vitest';
import { clearAnalyticCaches, derive } from '../engine/derive';
import { metricConflict } from '../engine/metricBounds';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { readWork } from '../../shell/workMeter';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

function typed(lines: readonly string[], seed = 0) {
  const held: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» is context and must record`).toBe('record');
    if (v.kind === 'record') held.push(v.line);
  }
  return decideSubmit(lines[lines.length - 1], held, seed);
}

/** 3-D's sentences (scenarios3, `lengths-impossible-2894`), in analytic's spelling of a length (no bars on the rows). */
const SCENARIOS: Array<[string[], string]> = [
  [
    ['משולש ABC', 'AB = 3', 'BC = 4', 'AC = 10'],
    'הנתונים סותרים זה את זה — «AC = 10» לא מתקיים יחד עם «AB = 3», «BC = 4»: יחד הם קובעים |AC| = 10 ו-|AB| + |BC| = 7, אבל לפי אי־שוויון המשולש ABC תמיד |AC| ≤ |AB| + |BC|. בדקו איזה מהאורכים האלה לא נכון.',
  ],
  [
    ['ריבוע ABCD', 'AB = 3', 'AC = 10'],
    'הנתונים סותרים זה את זה — «AC = 10» לא מתקיים יחד עם «ריבוע ABCD», «AB = 3»: יחד הם קובעים |AC| = 10 ו-|AB| + |BC| = 6, אבל לפי אי־שוויון המשולש ABC תמיד |AC| ≤ |AB| + |BC|. בדקו איזה מהאורכים האלה לא נכון.',
  ],
  [
    ['ריבוע ABCD', 'AB = 3', 'BC = 4'],
    'הנתונים סותרים זה את זה — «BC = 4» לא מתקיים יחד עם «ריבוע ABCD», «AB = 3»: יחד הם נותנים לקטע BC שני אורכים שונים, 3 ו-4. בדקו איזה מהאורכים האלה לא נכון.',
  ],
  [
    ['משולש שווה צלעות ABC', 'AB = 3', 'BC = 5'],
    'הנתונים סותרים זה את זה — «BC = 5» לא מתקיים יחד עם «משולש שווה צלעות ABC», «AB = 3»: יחד הם נותנים לקטע BC שני אורכים שונים, 3 ו-5. בדקו איזה מהאורכים האלה לא נכון.',
  ],
];

describe('#2894 lengths-impossible — the triangle inequality and one length per segment, refused at once with the reason', () => {
  it.each(SCENARIOS)('REFUSAL: %j', (lines, text) => {
    for (const seed of [0, 3]) {
      const v = typed(lines, seed);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.error.key).toBe('lengths-impossible');
      expect(errorText(v.error, he)).toBe(text);
      expect(errorText(v.error, en)).toMatch(/^The givens contradict each other — «.+» cannot hold together with /);
    }
  });

  it('refused at once: the refusal costs a small part of what the search used to pay (x-tri-ineq 140 863 units before)', () => {
    clearAnalyticCaches();
    derive(['משולש ABC', 'AB = 3', 'BC = 4'], 0);
    const at = readWork().total;
    const d = derive(['משולש ABC', 'AB = 3', 'BC = 4', 'AC = 10'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['lengths-impossible']);
    expect(readWork().total - at).toBeLessThan(20_000);
  });

  it('the equality case is the search’s: «AC = 8» on 5 and 3 flattens the triangle (unchanged wording)', () => {
    const v = typed(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']);
    expect(v.kind === 'refused' && v.error.key).toBe('polygon-collapsed');
  });

  it('a length the others allow is drawn', () => {
    expect(typed(['משולש ABC', 'AB = 3', 'BC = 4', 'AC = 6']).kind).toBe('record');
  });
});

describe('#2894 metricConflict (the unit)', () => {
  const rows = (lines: string[]) => derive(lines, 0).construction.constraints;
  it('reads a ratio («AB = 2BC») and finds the second value', () => {
    expect(metricConflict(rows(['משולש ABC', 'AB = 2BC', 'AB = 4', 'BC = 3']))).toMatchObject({ kind: 'value', forced: 2, stated: 3 });
  });
  it('is silent on a length in a parameter, on the equality case, and inside the margin', () => {
    expect(metricConflict(rows(['משולש ABC', 'AB = a', 'BC = 4', 'AC = 10']))).toBeNull();
    expect(metricConflict(rows(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']))).toBeNull();
    expect(metricConflict(rows(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8.0001']))).toBeNull();
  });
});
