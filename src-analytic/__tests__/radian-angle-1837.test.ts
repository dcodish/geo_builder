/**
 * #1837 ([ADR-W-142](../../docs/06w-decisions-workspace.md#adr-w-142)) — analytic's thin lock on the shared
 * radian-angle rows (`shell/__tests__/fixtures/radian-angle-rows.ts`, docs/28 §5c).
 *
 * Measured on `main` b0e9dbea through `decideSubmit`, after «משולש ABC»: every π angle given RECORDED, read as
 * DEGREES — «∠ABC = π/2» drew an angle of 1.57° with no warning, «∠ABC = pi/2» the same. Operator ruling
 * 2026-10-08: *"analytics tool should not support radians at all. only the complex tool should"*. Now each is
 * refused before every rule with 2-D's sentence; π as a number («AB = π», «מעגל שהיקפו 6π») still reads.
 *
 * The 2026-10-08 plan update asked for every analytic reader of an angle measure. Measured at pickup: the
 * angle given (∠ / «זווית» / «הזווית בין XY ל-ZW») and the sector's «בזווית 80» are the readers that exist;
 * an inclination («זווית הנטייה של l1 היא 45»), the angle between two lines («הזווית בין הישרים l1 ו-l2 היא 60»)
 * and a trig argument («שיפוע l1 הוא tan(30)», «AB = cos(30)») are not read even in degrees, so a π there is
 * already never drawn — those lines are left as they are (teaching «90» would teach a sentence that fails too).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { derive } from '../engine/derive';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { findRadianAngle } from '../../shell/radianAngle';
import { radianAngleFaults, RADIAN_SENTENCE_EN, RADIAN_SENTENCE_HE, type RadianGate } from '../../shell/__tests__/fixtures/radian-angle-rows';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

const LINES = ['משולש ABC'];
const current = derive(LINES, 0);

/** The REAL submit decision — the function `App.tsx` dispatches — asked on the triangle. */
const gate: RadianGate = (line) => {
  const v = decideSubmit(line, LINES, 0, current);
  const radian = v.kind === 'refused' && v.error.key === 'radian-angle';
  const escalated = v.kind === 'refused' && v.error.key === 'not-handled';
  return { radian, recorded: v.kind === 'record', escalated, text: v.kind === 'refused' ? errorText(v.error, t) : null };
};

describe('#1837 — analytic refuses an angle measure written in radians', () => {
  it('the shared rows hold through decideSubmit', async () => {
    expect(await radianAngleFaults(gate)).toEqual([]);
  });

  it('the sector given with an angle in radians is refused; in degrees it still records', () => {
    const sector = ['מעגל O'];
    const cur = derive(sector, 0);
    const v = decideSubmit('גזרה AOB בזווית π/3', sector, 0, cur);
    expect(v.kind === 'refused' && v.error.key).toBe('radian-angle');
    expect(decideSubmit('גזרה AOB בזווית 80', sector, 0, cur).kind).toBe('record');
  });

  it('the English locale carries the direct translation', () => {
    const v = decideSubmit('∠ABC = π/2', LINES, 0, current);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') {
      expect(errorText(v.error, t)).toBe(RADIAN_SENTENCE_HE);
      expect(errorText(v.error, tEn)).toBe(RADIAN_SENTENCE_EN);
    }
  });

  it('π as a number still reads', () => {
    for (const line of ['AB = π', 'AB = 2π', 'מעגל O שהיקפו 6π']) expect(decideSubmit(line, LINES, 0, current).kind, line).toBe('record');
  });

  it('no line of the analytic catalog reads as an angle in radians', () => {
    const hits = COMMAND_CATALOG_ANALYTIC.flatMap((e) => [e.he, e.en]).filter((s) => s && findRadianAngle(s));
    expect(hits).toEqual([]);
  });
});
